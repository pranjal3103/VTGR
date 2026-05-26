export type Turn = {
  role: "officer" | "applicant"
  content: string
}

export type SimOutcome = "approved" | "refused_214b" | "documents_needed"
export type SimMode = "standard" | "refusal_drill"

export type CritiqueScore = {
  ties_to_india: number
  trip_purpose: number
  financial_credibility: number
  consistency: number
  conciseness: number
}

export type CritiqueIssue = {
  turn_index: number
  question: string
  her_answer: string
  issue: string
  principle_id: string
  stronger_version: string
}

export type Critique = {
  summary: string
  scores: CritiqueScore
  issues: CritiqueIssue[]
  things_to_practice: string[]
  estimated_outcome_examples: string[]
  prior_refusal_addressed?: number
}
