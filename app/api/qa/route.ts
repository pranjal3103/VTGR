import { anthropic, MODELS } from "@/lib/anthropic/client"
import { retrieve, formatSourcesForPrompt } from "@/lib/retrieval"
import type { Profile } from "@/types/profile"
import type { Turn, SimOutcome, SimMode, Critique } from "@/types/session"

type SessionContext = {
  id: string
  ended_at: string
  mode: SimMode
  outcome_in_sim: SimOutcome | null
  turns: Turn[]
  critique: Critique | null
}

function formatSessionContext(ctx: SessionContext): string {
  const date = new Date(ctx.ended_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
  const outcomeLabel = ctx.outcome_in_sim === "approved" ? "Approved"
    : ctx.outcome_in_sim === "refused_214b" ? "Refused — 214(b)"
    : ctx.outcome_in_sim === "documents_needed" ? "Documents requested — 221(g)"
    : "Session ended"

  const transcriptLines: string[] = []
  let q = 0
  for (const t of ctx.turns) {
    if (t.role === "officer") {
      q++
      transcriptLines.push(`Q${q}. Officer: ${t.content}`)
    } else {
      transcriptLines.push(`   Applicant: ${t.content}`)
    }
  }

  const critiqueLines: string[] = []
  if (ctx.critique) {
    const c = ctx.critique
    critiqueLines.push(`Summary: ${c.summary}`)
    const s = c.scores
    critiqueLines.push(`Scores: ties=${s.ties_to_india} purpose=${s.trip_purpose} finance=${s.financial_credibility} consistency=${s.consistency} conciseness=${s.conciseness}`)
    if (c.prior_refusal_addressed !== undefined) {
      critiqueLines.push(`Prior refusal addressed: ${c.prior_refusal_addressed}/5`)
    }
    if (c.issues?.length) {
      critiqueLines.push(`Issues identified:`)
      c.issues.forEach(i => {
        critiqueLines.push(`  - Q: "${i.question}"`)
        critiqueLines.push(`    Her answer: "${i.her_answer}"`)
        critiqueLines.push(`    Issue: ${i.issue}`)
        critiqueLines.push(`    Stronger version: "${i.stronger_version}"`)
      })
    }
    if (c.things_to_practice?.length) {
      critiqueLines.push(`Things to practice:`)
      c.things_to_practice.forEach((t, i) => critiqueLines.push(`  ${i + 1}. ${t}`))
    }
  }

  return `MOCK INTERVIEW SESSION (${date} · ${ctx.mode === "refusal_drill" ? "Refusal Drill" : "Mock Interview"} · ${outcomeLabel}):

Transcript:
${transcriptLines.join("\n")}

Post-session critique:
${critiqueLines.join("\n")}`
}

const QA_PROMPT = (
  question: string,
  profile: Profile,
  authoritative: string,
  redditSources: string,
  sessionContext: SessionContext | null,
) => `You are a B1/B2 visa interview coach answering a question from ${profile.full_name || "the applicant"}.

Her question: ${question}

Her profile:
- Profession: ${profile.profession}${profile.profession_detail ? ` (${profile.profession_detail})` : ""}
- City: ${profile.city}, Age: ${profile.age}
- Marital status: ${profile.marital_status}
- Trip purpose: ${profile.trip_purpose}
- Consulate: ${profile.consulate}
- Prior US visa history: ${JSON.stringify(profile.prior_us_visa_history)}
- Ties to India: ${JSON.stringify(profile.ties_to_india)}
${profile.has_prior_refusal ? `- HAS PRIOR REFUSAL: ${profile.refusal_ground} at ${profile.refusal_consulate}` : ""}
${sessionContext ? `\n${formatSessionContext(sessionContext)}\n\nWhen the question refers to specific exchanges ("Q3", "my answer about X", "would it have been better if..."), use the transcript and critique above to give a concrete, specific answer grounded in what she actually said.` : ""}

AUTHORITATIVE SOURCES — lead your answer with content from these:
${authoritative || "No highly relevant authoritative sources found for this question."}

REDDIT EXAMPLES — use for realistic texture only, label them clearly:
${redditSources || "No relevant Reddit examples found."}

Answer in 4–7 sentences. Rules:
1. Lead with official or practitioner-grounded content.
2. Personalise to her specific profile where relevant (her consulate, profession, trip purpose, prior refusal if present).
3. When using a Reddit example, label it explicitly: "In reports from [consulate] applicants..."
4. If the authoritative sources do not address her question, say so directly. Do not fabricate.
5. Do not make probabilistic outcome predictions ("you have X% chance").
6. End your answer with this exact line:
   Sources: [comma-separated IDs you drew from above]`

export async function POST(req: Request) {
  const { question, profile, sessionContext } = await req.json() as {
    question: string
    profile: Profile
    sessionContext: SessionContext | null
  }

  if (!question?.trim()) {
    return new Response("Missing question", { status: 400 })
  }

  const sources = retrieve(question)
  const { authoritative, reddit: redditText } = formatSourcesForPrompt(sources)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      // Send sources metadata first so the UI can render citation badges immediately
      send({
        type: "sources",
        principles: sources.principles,
        official: sources.official,
        practitioner: sources.practitioner,
        reddit: sources.reddit,
      })

      try {
        const response = await anthropic.messages.create({
          model: MODELS.careful,
          max_tokens: 1024,
          stream: true,
          messages: [
            {
              role: "user",
              content: QA_PROMPT(question, profile, authoritative, redditText, sessionContext),
            },
          ],
        })

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ type: "delta", text: event.delta.text })
          }
        }
      } catch (err) {
        send({ type: "error", message: String(err) })
      }

      send({ type: "done" })
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
