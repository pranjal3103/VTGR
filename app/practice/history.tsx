"use client"

import { useState } from "react"
import type { SimOutcome, SimMode, CritiqueScore, Critique } from "@/types/session"

export type SessionRecord = {
  id: string
  ended_at: string
  mode: SimMode
  outcome_in_sim: SimOutcome | null
  scores: CritiqueScore | null
  critique: Critique | null
}

const OUTCOME_CONFIG: Record<SimOutcome, { label: string; color: string; bg: string }> = {
  approved: { label: "Approved", color: "#1A4A1A", bg: "#1A4A1A18" },
  refused_214b: { label: "Refused 214(b)", color: "#7A1F1F", bg: "#7A1F1F18" },
  documents_needed: { label: "Docs requested", color: "#7A3A00", bg: "#7A3A0018" },
}

const SCORE_KEYS: { key: keyof CritiqueScore; label: string }[] = [
  { key: "ties_to_india", label: "Ties" },
  { key: "trip_purpose", label: "Purpose" },
  { key: "financial_credibility", label: "Finance" },
  { key: "consistency", label: "Consistency" },
  { key: "conciseness", label: "Conciseness" },
]

function MiniScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-px">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-1.5 w-3 rounded-sm"
          style={{ backgroundColor: i <= score ? "#2A2A2A" : "#E8E3DC" }}
        />
      ))}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function avgScore(scores: CritiqueScore): number {
  const vals = Object.values(scores)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function SessionRow({ session }: { session: SessionRecord }) {
  const [expanded, setExpanded] = useState(false)
  const outcome = session.outcome_in_sim
  const outcomeConfig = outcome ? OUTCOME_CONFIG[outcome] : null
  const avg = session.scores ? avgScore(session.scores) : null

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: "1px solid #E8E3DC" }}
    >
      {/* Row header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 flex items-center gap-4"
        style={{ backgroundColor: expanded ? "#F5F2ED" : "white" }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium" style={{ color: "#2A2A2A" }}>
              {session.mode === "refusal_drill" ? "Refusal Drill" : "Mock Interview"}
            </span>
            <span className="text-xs" style={{ color: "#B0AAA4" }}>
              {formatDate(session.ended_at)}
            </span>
            {outcomeConfig && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: outcomeConfig.bg, color: outcomeConfig.color, fontWeight: 600 }}
              >
                {outcomeConfig.label}
              </span>
            )}
          </div>
          {session.scores && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {SCORE_KEYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: "#8B8580" }}>{label}</span>
                  <MiniScoreBar score={session.scores![key]} />
                  <span className="text-xs" style={{ color: "#8B8580" }}>{session.scores![key]}</span>
                </div>
              ))}
              {avg !== null && (
                <span className="text-xs font-medium ml-1" style={{ color: "#4A4A4A" }}>
                  avg {avg.toFixed(1)}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="text-xs shrink-0" style={{ color: "#B0AAA4" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded critique */}
      {expanded && session.critique && (
        <div
          className="px-4 pb-4 pt-2 space-y-4"
          style={{ borderTop: "1px solid #E8E3DC", backgroundColor: "#FAFAF8" }}
        >
          <p className="text-sm leading-6 italic" style={{ color: "#4A4A4A" }}>
            {session.critique.summary}
          </p>

          {session.critique.things_to_practice?.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wider mb-2" style={{ color: "#8B8580", fontVariant: "small-caps" }}>
                Things to practice
              </p>
              <ol className="space-y-1.5">
                {session.critique.things_to_practice.map((item, i) => (
                  <li key={i} className="text-xs leading-5 flex gap-2" style={{ color: "#2A2A2A" }}>
                    <span style={{ color: "#B0AAA4" }}>{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {session.critique.issues?.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wider mb-2" style={{ color: "#8B8580", fontVariant: "small-caps" }}>
                Turn feedback
              </p>
              <div className="space-y-2">
                {session.critique.issues.map((issue, i) => (
                  <div
                    key={i}
                    className="rounded px-3 py-2 space-y-1"
                    style={{ backgroundColor: "#F0EBE3", border: "1px solid #E0D8CE" }}
                  >
                    <p className="text-xs" style={{ color: "#8B8580" }}>Q: {issue.question}</p>
                    <p className="text-xs" style={{ color: "#2A2A2A" }}>{issue.issue}</p>
                    <p className="text-xs italic" style={{ color: "#1A4A1A" }}>"{issue.stronger_version}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {expanded && !session.critique && (
        <div className="px-4 py-3" style={{ borderTop: "1px solid #E8E3DC" }}>
          <p className="text-xs" style={{ color: "#B0AAA4" }}>No feedback available for this session.</p>
        </div>
      )}
    </div>
  )
}

export function SessionHistory({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) return null

  return (
    <div className="w-full max-w-lg mx-auto px-6 pb-10">
      <h2
        className="text-xs font-semibold tracking-wider mb-4"
        style={{ color: "#8B8580", fontVariant: "small-caps" }}
      >
        Past sessions
      </h2>
      <div className="space-y-2">
        {sessions.map(s => <SessionRow key={s.id} session={s} />)}
      </div>
    </div>
  )
}
