export type SessionMode = "qa" | "simulator" | "refusal_drill" | "day_before"

export type SimOutcome = "approved" | "refused_214b" | "221g_processing" | null

export interface Turn {
  role: "officer" | "applicant"
  text: string
  timestamp: string
}

export interface CritiqueIssue {
  turn_index: number
  officer_question: string
  applicant_answer: string
  issue: string
  principle_id: string
  stronger_version: string
  confidence: "rule_based" | "best_practice"
}

export interface CritiqueScore {
  ties_strength: number
  purpose_clarity: number
  consistency: number
  specificity: number
  composure: number
}

export interface Critique {
  summary: string
  scores: CritiqueScore
  issues: CritiqueIssue[]
  practice_next: string[]
  outcome_examples: string[]
  prior_refusal_addressed?: number // 1-5, only if has_prior_refusal
}

export interface Session {
  id: string
  started_at: string
  ended_at: string | null
  mode: SessionMode
  scenario_transcript_id: string | null
  difficulty: "normal" | "tough"
  turns: Turn[]
  outcome_in_sim: SimOutcome
  critique: Critique | null
  scores: CritiqueScore | null
}
