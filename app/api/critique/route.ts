import { anthropic, MODELS } from "@/lib/anthropic/client"
import { retrieve, formatSourcesForPrompt } from "@/lib/retrieval"
import { createServiceClient } from "@/lib/supabase/server"
import type { Profile } from "@/types/profile"
import type { Turn, SimOutcome, Critique } from "@/types/session"

function buildCritiquePrompt(
  profile: Profile,
  turns: Turn[],
  outcome: SimOutcome | null,
  authoritative: string,
  redditContext: string,
): string {
  const transcript = turns
    .map(t => `${t.role === "officer" ? "Officer" : "Applicant"}: ${t.content}`)
    .join("\n")

  const outcomeLabel = {
    approved: "Approved",
    refused_214b: "Refused under 214(b)",
    documents_needed: "Additional documents requested — 221(g)",
  }[outcome ?? "approved"]

  const refusalBlock = profile.has_prior_refusal
    ? `\nCRITICAL — PRIOR REFUSAL CONTEXT:
Ground: ${profile.refusal_ground}
Stated reason: "${profile.refusal_reason_stated}"
Her account: "${profile.refusal_narrative}"
Self-diagnosis: "${profile.applicant_self_diagnosis}"
What has changed: "${profile.what_has_changed_since}"
You MUST include "prior_refusal_addressed" (1–5) in output. Did her answers demonstrate the change she claims?`
    : ""

  const priorRefusalField = profile.has_prior_refusal
    ? `,\n  "prior_refusal_addressed": <1-5 integer>`
    : ""

  return `You are a visa interview coach analyzing a completed mock interview.

Applicant: ${profile.full_name || "Applicant"}, ${profile.age}yo ${profile.profession}, ${profile.city}
Trip: ${profile.trip_purpose} to ${Array.isArray(profile.planned_cities) ? profile.planned_cities.join(", ") : "not stated"} for ${profile.planned_duration_days} days
Consulate: ${profile.consulate}${refusalBlock}

Simulated outcome: ${outcomeLabel}

Full transcript:
${transcript}

AUTHORITATIVE PRINCIPLES — sole basis for critique (official + practitioner):
${authoritative || "No principles retrieved."}

REDDIT EXAMPLES — alternative answers only, NEVER basis for evaluation:
${redditContext || "No Reddit examples retrieved."}

Produce a structured critique as VALID JSON matching this EXACT schema:
{
  "summary": "<one sentence overall impression>",
  "scores": {
    "ties_to_india": <1-5>,
    "trip_purpose": <1-5>,
    "financial_credibility": <1-5>,
    "consistency": <1-5>,
    "conciseness": <1-5, where 5=tight one-sentence answers, 3=acceptable but wordy, 1=rambling or one-word answers that needed more>
  },
  "issues": [
    {
      "turn_index": <integer — index into the transcript where this turn occurs>,
      "question": "<officer question text>",
      "her_answer": "<applicant answer text>",
      "issue": "<what was weak and why>",
      "principle_id": "<ID from authoritative list, e.g. PRIN-003>",
      "stronger_version": "<a sentence she could say verbatim>"
    }
  ],
  "things_to_practice": ["<item>", "<item>"],
  "estimated_outcome_examples": [
    "<Consulate Year — profile type — Outcome>",
    "<Consulate Year — profile type — Outcome>",
    "<Consulate Year — profile type — Outcome>"
  ]${priorRefusalField}
}

HARD RULES:
1. Every issue MUST have a principle_id from the authoritative list above. If you cannot cite one, omit that issue entirely.
2. stronger_version must be a sentence she could say verbatim at a real interview.
3. estimated_outcome_examples: reference exactly 3 Reddit transcripts with their outcomes. Do NOT make probabilistic predictions.
4. Reddit may appear ONLY in estimated_outcome_examples — never as basis for issues or scores.
5. Be honest with scores. Do not inflate.
7. For conciseness: flag answers that were too long (officers lose patience) AND answers that were too vague or one-word (officers need substance). The stronger_version should model the right length.
6. Output ONLY valid JSON. No markdown fences. No explanation before or after.`
}

export async function POST(req: Request) {
  const { profile, turns, outcome, sessionId } = await req.json() as {
    profile: Profile
    turns: Turn[]
    outcome: SimOutcome | null
    sessionId: string
  }

  const queryText = turns
    .filter(t => t.role === "applicant")
    .map(t => t.content)
    .join(" ")
    .slice(0, 600)

  const sources = retrieve(queryText || profile.trip_purpose || "visa interview")
  const { authoritative, reddit: redditContext } = formatSourcesForPrompt(sources)

  const prompt = buildCritiquePrompt(profile, turns, outcome, authoritative, redditContext)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      let fullText = ""
      try {
        const response = await anthropic.messages.create({
          model: MODELS.careful,
          max_tokens: 2048,
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
        send({ type: "done" })
        controller.close()
        return
      }

      send({ type: "done" })

      // Persist critique to DB
      try {
        const cleaned = fullText
          .replace(/^```json\s*/m, "")
          .replace(/^```\s*/m, "")
          .replace(/```\s*$/m, "")
          .trim()
        const parsed = JSON.parse(cleaned) as Critique
        parsed.issues = (parsed.issues ?? []).filter(i => i.principle_id?.trim())

        const supabase = createServiceClient()
        await supabase
          .from("sessions")
          .update({
            critique: parsed,
            scores: parsed.scores,
            ended_at: new Date().toISOString(),
          })
          .eq("id", sessionId)
      } catch {
        // Parse failed — session row stays without critique field
      }

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
