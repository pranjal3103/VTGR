import { anthropic, MODELS } from "@/lib/anthropic/client"
import { retrieve, formatSourcesForPrompt } from "@/lib/retrieval"
import type { Profile } from "@/types/profile"

const QA_PROMPT = (
  question: string,
  profile: Profile,
  authoritative: string,
  redditSources: string,
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
  const { question, profile } = await req.json() as { question: string; profile: Profile }

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
              content: QA_PROMPT(question, profile, authoritative, redditText),
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
