"use client"

import { useState, useRef, useEffect } from "react"
import type { Profile } from "@/types/profile"
import type { Turn, SimOutcome, SimMode, Critique } from "@/types/session"
import { CritiqueView } from "./critique"

type SimPhase = "idle" | "starting" | "interviewing" | "ended" | "critiquing" | "done"

const MAX_OFFICER_TURNS: Record<SimMode, number> = {
  standard: 8,
  refusal_drill: 4,
}

function buildTranscriptText(
  profile: Profile,
  mode: SimMode,
  turns: Turn[],
  outcome: SimOutcome | null,
  critique: Critique | null,
): string {
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
  const outcomeLabel = outcome === "approved"
    ? "Approved"
    : outcome === "refused_214b"
    ? "Refused — 214(b)"
    : outcome === "documents_needed"
    ? "Documents requested — 221(g)"
    : "Session ended early"

  const lines: string[] = [
    `Visa Sensei — Mock Interview Transcript`,
    `${mode === "refusal_drill" ? "Refusal Drill" : "Mock Interview"} · ${date}`,
    `Applicant: ${profile.full_name ?? "—"} · ${profile.consulate ?? "—"} Consulate`,
    ``,
    `─────────────────────────────────────────`,
    `TRANSCRIPT`,
    `─────────────────────────────────────────`,
  ]

  let q = 0
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]
    if (t.role === "officer") {
      q++
      lines.push(``, `Q${q}. Officer:`, t.content)
    } else {
      lines.push(``, `   You:`, t.content)
    }
  }

  lines.push(``, `─────────────────────────────────────────`)
  lines.push(`OUTCOME: ${outcomeLabel}`)
  lines.push(`─────────────────────────────────────────`)

  if (critique) {
    lines.push(``, `FEEDBACK`, ``)
    lines.push(critique.summary)
    lines.push(``)
    lines.push(`Scores:`)
    const s = critique.scores
    lines.push(`  Ties to India         ${s.ties_to_india}/5`)
    lines.push(`  Trip purpose          ${s.trip_purpose}/5`)
    lines.push(`  Financial credibility ${s.financial_credibility}/5`)
    lines.push(`  Consistency           ${s.consistency}/5`)
    lines.push(`  Conciseness           ${s.conciseness}/5`)
    if (critique.things_to_practice?.length) {
      lines.push(``, `Things to practice:`)
      critique.things_to_practice.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`))
    }
  }

  return lines.join("\n")
}

function downloadTranscript(
  profile: Profile,
  mode: SimMode,
  turns: Turn[],
  outcome: SimOutcome | null,
  critique: Critique | null,
) {
  const text = buildTranscriptText(profile, mode, turns, outcome, critique)
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `visa-mock-${new Date().toISOString().split("T")[0]}.txt`
  a.click()
  URL.revokeObjectURL(url)
}


async function readSSE(
  url: string,
  body: object,
  onDelta: (text: string) => void,
  onDone: () => void,
  onOutcome?: (value: SimOutcome) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.body) throw new Error("No response body")
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === "delta") onDelta(event.text)
        else if (event.type === "done") onDone()
        else if (event.type === "outcome" && onOutcome) onOutcome(event.value)
      } catch {}
    }
  }
}

export function PracticeShell({ profile }: { profile: Profile }) {
  const [phase, setPhase] = useState<SimPhase>("idle")
  const [mode, setMode] = useState<SimMode>("standard")
  const [turns, setTurns] = useState<Turn[]>([])
  const [currentOfficerText, setCurrentOfficerText] = useState("")
  const [officerStreaming, setOfficerStreaming] = useState(false)
  const [input, setInput] = useState("")
  const [outcome, setOutcome] = useState<SimOutcome | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [critique, setCritique] = useState<Critique | null>(null)
  const [critiqueLoading, setCritiqueLoading] = useState(false)

  // Refs hold latest values for use inside async callbacks
  const turnsRef = useRef<Turn[]>([])
  const outcomeRef = useRef<SimOutcome | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const handlingEnd = useRef(false)
  const handleEndRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function setTurnsSync(t: Turn[]) {
    setTurns(t)
    turnsRef.current = t
  }

  function setOutcomeSync(o: SimOutcome | null) {
    setOutcome(o)
    outcomeRef.current = o
  }

  function setSessionIdSync(id: string | null) {
    setSessionId(id)
    sessionIdRef.current = id
  }

// Scroll to bottom on transcript change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, currentOfficerText])

  async function handleEnd() {
    if (handlingEnd.current) return
    handlingEnd.current = true

    setOfficerStreaming(false)
    setPhase("ended")

    const sid = sessionIdRef.current
    const finalTurns = turnsRef.current
    const finalOutcome = outcomeRef.current

    if (!sid) return

    // Persist turns + outcome
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, turns: finalTurns, outcome: finalOutcome }),
    })

    // Generate critique
    setPhase("critiquing")
    setCritiqueLoading(true)
    let critiqueRaw = ""

    await readSSE(
      "/api/critique",
      { profile, turns: finalTurns, outcome: finalOutcome, sessionId: sid },
      text => { critiqueRaw += text },
      () => {
        try {
          const cleaned = critiqueRaw
            .replace(/^```json\s*/m, "")
            .replace(/^```\s*/m, "")
            .replace(/```\s*$/m, "")
            .trim()
          const parsed = JSON.parse(cleaned) as Critique
          parsed.issues = (parsed.issues ?? []).filter(i => i.principle_id?.trim())
          setCritique(parsed)
        } catch {
          setCritique(null)
        }
        setCritiqueLoading(false)
        setPhase("done")
      },
    )
  }

  // Keep handleEndRef pointing to latest handleEnd
  handleEndRef.current = handleEnd

  async function fetchOfficerTurn(sid: string, currentTurns: Turn[], currentMode: SimMode) {
    setOfficerStreaming(true)
    setCurrentOfficerText("")

    let fullText = ""
    let detectedOutcome: SimOutcome | null = null

    await readSSE(
      "/api/simulator",
      { profile, turns: currentTurns, sessionId: sid, mode: currentMode },
      text => {
        fullText += text
        setCurrentOfficerText(prev => prev + text)
      },
      () => {
        const officerTurn: Turn = { role: "officer", content: fullText }
        const newTurns = [...currentTurns, officerTurn]
        setTurnsSync(newTurns)
        setCurrentOfficerText("")
        setOfficerStreaming(false)
        const officerCount = newTurns.filter(t => t.role === "officer").length
        if (officerCount >= MAX_OFFICER_TURNS[currentMode]) {
          void handleEndRef.current?.()
          return
        }
        inputRef.current?.focus()
      },
      value => {
        detectedOutcome = value
        setOutcomeSync(value)
      },
    )

    if (detectedOutcome) {
      await handleEnd()
    }
  }

  async function startSession(selectedMode: SimMode) {
    setMode(selectedMode)
    setPhase("starting")
    setTurnsSync([])
    setOutcomeSync(null)
    setCurrentOfficerText("")
handlingEnd.current = false
    setCritique(null)

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: selectedMode }),
    })
    const { id } = await res.json()
    setSessionIdSync(id)
    setPhase("interviewing")

    await new Promise(resolve => setTimeout(resolve, 500))
    await fetchOfficerTurn(id, [], selectedMode)
  }

  async function handleSubmit() {
    if (!input.trim() || officerStreaming || !sessionIdRef.current) return
    const answer = input.trim()
    setInput("")
    const applicantTurn: Turn = { role: "applicant", content: answer }
    const newTurns = [...turnsRef.current, applicantTurn]
    setTurnsSync(newTurns)
    await new Promise(resolve => setTimeout(resolve, 500))
    await fetchOfficerTurn(sessionIdRef.current, newTurns, mode)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const officerTurnCount = turns.filter(t => t.role === "officer").length
  const isRefusalDrill = mode === "refusal_drill"

  // ── Idle ────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ backgroundColor: "#FAF7F2" }}
      >
        <div className="text-center max-w-xs px-6">
          <h1
            className="text-xl font-semibold tracking-tight mb-2"
            style={{ color: "#2A2A2A" }}
          >
            Practice Interview
          </h1>
          <p className="text-sm mb-8 leading-6" style={{ color: "#8B8580" }}>
            A mock consular interview conditioned on your profile. Answer as you would at the
            actual interview.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => void startSession("standard")}
              className="px-6 py-3 text-sm font-medium rounded-md transition-colors"
              style={{ backgroundColor: "#2A2A2A", color: "#FAF7F2" }}
            >
              Start Mock Interview
            </button>
            {profile.has_prior_refusal && (
              <button
                onClick={() => void startSession("refusal_drill")}
                className="px-6 py-3 text-sm font-medium rounded-md border transition-colors"
                style={{ borderColor: "#7A1F1F", color: "#7A1F1F", backgroundColor: "transparent" }}
              >
                Refusal Drill
              </button>
            )}
          </div>
          {profile.has_prior_refusal && (
            <p className="mt-4 text-xs" style={{ color: "#B0AAA4" }}>
              Refusal drill: 2–4 targeted questions on your prior 214(b).
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Starting ─────────────────────────────────────────────────────────
  if (phase === "starting") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "#8B8580" }}>
          Connecting…
        </p>
      </div>
    )
  }

  // ── Critique / Done ──────────────────────────────────────────────────
  if (phase === "critiquing" || phase === "done") {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h2
              className="text-xl font-semibold tracking-tight"
              style={{ color: "#2A2A2A" }}
            >
              Session complete
            </h2>
            <p className="mt-1 text-sm" style={{ color: "#8B8580" }}>
              {isRefusalDrill ? "Refusal drill" : "Mock interview"} ·{" "}
              {turns.filter(t => t.role === "officer").length} questions
            </p>
          </div>

          {critiqueLoading && (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: "#8B8580" }}>
                Generating critique…
              </p>
              <p className="text-xs mt-2" style={{ color: "#B0AAA4" }}>
                This takes about 10–20 seconds
              </p>
            </div>
          )}

          {!critiqueLoading && critique && (
            <CritiqueView critique={critique} outcome={outcome} />
          )}

          {!critiqueLoading && !critique && (
            <p className="text-sm" style={{ color: "#7A1F1F" }}>
              Critique could not be generated. Check your API key and try again.
            </p>
          )}

          <div className="mt-10 pt-6 flex items-center gap-6" style={{ borderTop: "1px solid #E8E3DC" }}>
            <button
              onClick={() => setPhase("idle")}
              className="text-sm"
              style={{ color: "#8B8580" }}
            >
              ← Start another session
            </button>
            {phase === "done" && (
              <button
                onClick={() => downloadTranscript(profile, mode, turns, outcome, critique)}
                className="text-sm"
                style={{ color: "#4A4A4A" }}
              >
                Download transcript
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Interviewing / Ended ─────────────────────────────────────────────
  const completedPairs: { officer: string; applicant: string | null }[] = []
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role === "officer") {
      completedPairs.push({
        officer: turns[i].content,
        applicant: turns[i + 1]?.role === "applicant" ? turns[i + 1].content : null,
      })
      if (turns[i + 1]?.role === "applicant") i++
    }
  }

  const OUTCOME_BANNER = {
    approved: {
      label: "Your visa is approved.",
      bg: "#1A4A1A",
      color: "#F0F7F0",
    },
    refused_214b: {
      label: "Visa refused under section 214(b).",
      bg: "#7A1F1F",
      color: "#FAF7F2",
    },
    documents_needed: {
      label: "Additional documents requested — 221(g).",
      bg: "#7A3A00",
      color: "#FAF7F2",
    },
  }

  const banner = outcome ? OUTCOME_BANNER[outcome] : null

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid #E8E3DC" }}
      >
        <span className="text-sm font-medium" style={{ color: "#2A2A2A" }}>
          {isRefusalDrill ? "Refusal Drill" : "Mock Interview"}
        </span>
        <span className="text-sm" style={{ color: "#B0AAA4" }}>
          {phase === "interviewing" ? `Q${officerTurnCount}` : ""}
        </span>
      </div>

      {/* Outcome banner */}
      {banner && (
        <div
          className="px-6 py-3 text-sm font-medium shrink-0"
          style={{ backgroundColor: banner.bg, color: banner.color }}
        >
          {banner.label}
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {completedPairs.map((pair, i) => (
          <div key={i} className="space-y-3">
            {/* Officer question */}
            <p
              className="text-sm leading-7 font-serif"
              style={{ color: "#2A2A2A" }}
            >
              {pair.officer}
            </p>
            {/* Applicant answer */}
            {pair.applicant && (
              <p
                className="text-sm leading-7 pl-4"
                style={{ color: "#6B6B6B", borderLeft: "2px solid #E8E3DC" }}
              >
                {pair.applicant}
              </p>
            )}
          </div>
        ))}

        {/* Current streaming officer turn */}
        {currentOfficerText && (
          <div>
            <p className="text-sm leading-7 font-serif" style={{ color: "#2A2A2A" }}>
              {currentOfficerText}
              {officerStreaming && (
                <span
                  className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse"
                  style={{ backgroundColor: "#2A2A2A" }}
                />
              )}
            </p>
          </div>
        )}

        {/* Turn counter */}
        {phase === "interviewing" && !officerStreaming && officerTurnCount > 0 && (
          <p className="text-xs text-center" style={{ color: "#C0BAB4" }}>
            Question {officerTurnCount} of ~{isRefusalDrill ? "4" : "8"}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {phase === "interviewing" && (
        <div
          className="shrink-0 px-6 py-4"
          style={{ borderTop: "1px solid #E8E3DC" }}
        >
          <form
            onSubmit={e => { e.preventDefault(); void handleSubmit() }}
            className="flex gap-3 items-end"
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Your answer… (Enter to submit, Shift+Enter for new line)"
              disabled={officerStreaming}
              className="flex-1 px-3 py-2 text-sm border rounded-md outline-none resize-none transition-colors disabled:opacity-40"
              style={{
                borderColor: "#D9D4CC",
                backgroundColor: "white",
                color: "#2A2A2A",
              }}
            />
            <button
              type="submit"
              disabled={officerStreaming || !input.trim()}
              className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-40"
              style={{ backgroundColor: "#2A2A2A", color: "#FAF7F2" }}
            >
              Answer
            </button>
          </form>
          <button
            onClick={() => void handleEnd()}
            className="mt-2 text-xs transition-colors"
            style={{ color: "#B0AAA4" }}
          >
            End session early
          </button>
        </div>
      )}
    </div>
  )
}
