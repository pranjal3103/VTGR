import { official, practitioner, reddit, principles } from "@/lib/corpus/loader"
import type { OfficialEntry, PractitionerEntry, RedditEntry, Principle } from "@/types/corpus"

const STOP = new Set([
  "the","a","an","is","are","was","were","be","been","have","has","had",
  "do","does","did","will","would","could","should","may","might","must",
  "to","of","in","for","on","with","at","by","from","as","or","and","but",
  "if","i","my","you","your","it","this","that","what","how","when","where",
  "why","who","can","not","no","any","all","about","into","than","more","also",
])

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP.has(t))
  )
}

function overlap(docText: string, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0
  const doc = tokenize(docText)
  let matches = 0
  for (const t of queryTokens) if (doc.has(t)) matches++
  return matches / queryTokens.size
}

export type RetrievedSources = {
  principles: Principle[]
  official: OfficialEntry[]
  practitioner: PractitionerEntry[]
  reddit: RedditEntry[]
}

export function retrieve(question: string): RetrievedSources {
  const q = tokenize(question)

  const topPrinciples = [...principles]
    .map(p => ({ p, s: overlap(p.principle + " " + p.applies_to_categories.join(" "), q) }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.s > 0)
    .slice(0, 5)
    .map(x => x.p)

  // Official paragraphs — only include if principles layer didn't already cover it
  const topOfficial = [...official]
    .map(e => ({ e, s: overlap(e.text, q) }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.s > 0.15)
    .slice(0, 4)
    .map(x => x.e)

  const topPractitioner = [...practitioner]
    .map(e => ({ e, s: overlap(e.claim + " " + e.supporting_quote, q) }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.s > 0)
    .slice(0, 4)
    .map(x => x.e)

  const topReddit = [...reddit]
    .filter(r => r.quality_flag === "full_transcript")
    .map(r => ({
      r,
      s: overlap(r.qa_sequence.map(qa => qa.q + " " + qa.a).join(" "), q),
    }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.s > 0)
    .slice(0, 3)
    .map(x => x.r)

  return { principles: topPrinciples, official: topOfficial, practitioner: topPractitioner, reddit: topReddit }
}

export function formatSourcesForPrompt(sources: RetrievedSources): {
  authoritative: string
  reddit: string
} {
  const parts: string[] = []

  if (sources.principles.length > 0) {
    parts.push("## Validated Principles (official/practitioner synthesis)")
    sources.principles.forEach(p =>
      parts.push(`[${p.id}] ${p.principle}`)
    )
  }

  if (sources.official.length > 0) {
    parts.push("\n## Official Source Paragraphs (9 FAM / INA)")
    sources.official.forEach(e =>
      parts.push(`[${e.id}] (${e.source}) ${e.text.slice(0, 300)}`)
    )
  }

  if (sources.practitioner.length > 0) {
    parts.push("\n## Practitioner Claims")
    sources.practitioner.forEach(e =>
      parts.push(`[${e.id}] ${e.claim}\n  Quote: "${e.supporting_quote.slice(0, 150)}"`)
    )
  }

  const redditParts: string[] = []
  if (sources.reddit.length > 0) {
    redditParts.push("## Reddit Transcripts (texture only — do not use for evaluation)")
    sources.reddit.forEach(r => {
      const qs = r.qa_sequence.slice(0, 4).map(qa => `  Q: ${qa.q}\n  A: ${qa.a}`).join("\n")
      redditParts.push(`[${r.id}] Consulate: ${r.consulate}, Outcome: ${r.outcome}\n${qs}`)
    })
  }

  return {
    authoritative: parts.join("\n"),
    reddit: redditParts.join("\n"),
  }
}
