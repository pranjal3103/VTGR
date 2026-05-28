import { anthropic, MODELS } from "@/lib/anthropic/client"
import { retrieve, formatSourcesForPrompt } from "@/lib/retrieval"
import type { Profile } from "@/types/profile"
import type { Turn, SimMode, SimOutcome } from "@/types/session"

const REFUSAL_OPENINGS = [
  "I see you were refused before. What is different now?",
  "You applied previously and were denied. Why should I approve you today?",
  "What has changed since your prior refusal?",
  "Last time you were refused for insufficient ties. What ties do you have now that you did not have before?",
]

function buildPrompt(profile: Profile, turns: Turn[], mode: SimMode, redditContext: string): string {
  const isFirstTurn = turns.length === 0
  const tough = profile.tough_mode || profile.has_prior_refusal
  const today = new Date().toISOString().split("T")[0]
  const officerTurnCount = turns.filter(t => t.role === "officer").length

  const t = profile.ties_to_india
  const tiesToIndia = t
    ? `property=${t.property}, dependents=${t.dependents}, job_continuity=${t.job_continuity}; ${t.return_obligations}`
    : "not specified"

  const profileBlock = `Applicant:
- ${profile.full_name || "Applicant"}, age ${profile.age}, ${profile.profession}${profile.profession_detail ? ` (${profile.profession_detail})` : ""}
- City: ${profile.city}, Marital status: ${profile.marital_status}
- Trip: ${profile.trip_purpose}, ${profile.planned_duration_days} days, cities: ${Array.isArray(profile.planned_cities) ? profile.planned_cities.join(", ") : "not stated"}
- Who pays: ${profile.who_pays}
- Ties to India: ${tiesToIndia}
- Prior US history: ${JSON.stringify(profile.prior_us_visa_history)}
- Prior travel: ${Array.isArray(profile.prior_international_travel) ? profile.prior_international_travel.join(", ") : "none"}`

  const refusalBlock = profile.has_prior_refusal
    ? `\nCRITICAL — PRIOR REFUSAL ON FILE:
Date: ${profile.refusal_date} at ${profile.refusal_consulate}
Ground: ${profile.refusal_ground}
Stated reason: "${profile.refusal_reason_stated}"
Applicant's account: "${profile.refusal_narrative}"
What has changed: "${profile.what_has_changed_since}"
Open with or quickly pivot to the prior refusal. Be more skeptical. Probe what is actually different.`
    : ""

  const transcript = turns.length > 0
    ? `\nConversation so far:\n${turns.map(t => `${t.role === "officer" ? "Officer" : "Applicant"}: ${t.content}`).join("\n")}`
    : ""

  const redditBlock = redditContext
    ? `\nPhrasing reference from similar interviews (style only — not for evaluation):\n${redditContext}`
    : ""

  const refusalDrillOpening = mode === "refusal_drill" && isFirstTurn
    ? `\nThis is a refusal drill. Open with EXACTLY one of these (pick at random):\n${REFUSAL_OPENINGS.map(o => `"${o}"`).join("\n")}`
    : ""

  const maxTurns = mode === "refusal_drill" ? "2–4" : "4–8"
  const toneRule = tough
    ? "Be skeptical. Push on vague answers. Demand specifics. Follow up on inconsistencies."
    : "Be neutral. Neither warm nor hostile."

  const mustConclude = officerTurnCount >= (mode === "refusal_drill" ? 3 : 7)
  const concludeRule = mustConclude
    ? `- You have asked ${officerTurnCount} questions. You MUST end this interview NOW with exactly one of the three closing lines below. No more questions.`
    : `- After ${maxTurns} exchanges, end with EXACTLY one of the three closing lines below.`

  return `You are a US consular officer at the ${profile.consulate || "New Delhi"} consulate conducting a B1/B2 visa interview.
Today's date: ${today}

${profileBlock}${refusalBlock}${transcript}${redditBlock}${refusalDrillOpening}

Rules:
- One question at a time. No preamble. No greeting. No small talk.
- Terse — real officers are not conversational.
- Adapt based on her previous answers.
- ${toneRule}
- Use today's date (${today}) when reasoning about timelines, gaps, and document dates.
- ${concludeRule}
  "Your visa is approved."
  "I cannot approve your visa today under section 214(b)."
  "I need to request additional documents under 221(g)."
- Output ONLY the officer's next line. No JSON, no markdown, no explanation.`
}

function detectOutcome(text: string): SimOutcome | null {
  const lower = text.toLowerCase()
  if (lower.includes("your visa is approved")) return "approved"
  if (lower.includes("cannot approve your visa")) return "refused_214b"
  if (lower.includes("request additional documents")) return "documents_needed"
  return null
}

export async function POST(req: Request) {
  const { profile, turns, sessionId, mode } = await req.json() as {
    profile: Profile
    turns: Turn[]
    sessionId: string
    mode: SimMode
  }

  const queryText = turns.length > 0
    ? (turns.filter(t => t.role === "applicant").slice(-1)[0]?.content ?? "")
    : `${profile.trip_purpose} ${profile.consulate} ${profile.profession}`

  const sources = retrieve(queryText)
  const { reddit: redditContext } = formatSourcesForPrompt(sources)

  const prompt = buildPrompt(profile, turns, mode, redditContext)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      let fullText = ""
      try {
        const response = await anthropic.messages.create({
          model: MODELS.fast,
          max_tokens: 512,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        })

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text
            send({ type: "delta", text: event.delta.text })
          }
        }
      } catch (err) {
        send({ type: "error", message: String(err) })
      }

      send({ type: "done" })

      const outcome = detectOutcome(fullText)
      if (outcome) send({ type: "outcome", value: outcome })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
