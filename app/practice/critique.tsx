"use client"

import type { Critique, SimOutcome } from "@/types/session"

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-2 w-5 rounded-sm"
          style={{ backgroundColor: i <= score ? "#2A2A2A" : "#E8E3DC" }}
        />
      ))}
    </div>
  )
}

const SCORE_LABELS: Record<string, string> = {
  ties_to_india: "Ties to India",
  trip_purpose: "Trip purpose",
  financial_credibility: "Financial credibility",
  consistency: "Consistency",
  conciseness: "Conciseness",
}

const OUTCOME_CONFIG = {
  approved: { label: "Approved", color: "#1A4A1A" },
  refused_214b: { label: "Refused — 214(b)", color: "#7A1F1F" },
  documents_needed: { label: "Documents requested — 221(g)", color: "#7A3A00" },
}

export function CritiqueView({
  critique,
  outcome,
}: {
  critique: Critique
  outcome: SimOutcome | null
}) {
  const outcomeConfig = OUTCOME_CONFIG[outcome ?? "approved"]

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Outcome chip */}
      <div>
        <span
          className="inline-block text-xs px-3 py-1 rounded-full"
          style={{
            backgroundColor: `${outcomeConfig.color}18`,
            color: outcomeConfig.color,
            fontVariant: "small-caps",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          {outcomeConfig.label}
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm leading-7 italic" style={{ color: "#4A4A4A" }}>
        {critique.summary}
      </p>

      {/* Scores */}
      <div>
        <h3
          className="text-xs font-semibold tracking-wider mb-4"
          style={{ color: "#8B8580", fontVariant: "small-caps" }}
        >
          Scores
        </h3>
        <div className="space-y-3">
          {Object.entries(critique.scores).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-xs w-40 shrink-0" style={{ color: "#4A4A4A" }}>
                {SCORE_LABELS[key] ?? key}
              </span>
              <ScoreBar score={value} />
              <span className="text-xs w-4 text-right" style={{ color: "#8B8580" }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Prior refusal addressed */}
      {critique.prior_refusal_addressed !== undefined && (
        <div
          className="rounded-md p-4"
          style={{ backgroundColor: "#FFF5F5", border: "1px solid #E8C8C8" }}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium" style={{ color: "#7A1F1F" }}>
              Prior refusal addressed
            </span>
            <div className="flex items-center gap-2">
              <ScoreBar score={critique.prior_refusal_addressed} />
              <span className="text-xs" style={{ color: "#7A1F1F" }}>
                {critique.prior_refusal_addressed}/5
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Per-turn issues */}
      {critique.issues.length > 0 && (
        <div>
          <h3
            className="text-xs font-semibold tracking-wider mb-4"
            style={{ color: "#8B8580", fontVariant: "small-caps" }}
          >
            Turn-by-turn feedback
          </h3>
          <div className="space-y-4">
            {critique.issues.map((issue, i) => (
              <div
                key={i}
                className="rounded-md p-4 space-y-2"
                style={{ backgroundColor: "#F5F2ED", border: "1px solid #E8E3DC" }}
              >
                <p className="text-xs" style={{ color: "#8B8580" }}>
                  Q: {issue.question}
                </p>
                <p className="text-xs italic" style={{ color: "#6B6B6B" }}>
                  "{issue.her_answer}"
                </p>
                <p className="text-xs" style={{ color: "#2A2A2A" }}>
                  {issue.issue}
                </p>
                <div className="flex items-start gap-2 pt-1">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded shrink-0 font-mono"
                    style={{
                      backgroundColor: "#F0EBE3",
                      border: "1px solid #C8BFB4",
                      color: "#2A2A2A",
                    }}
                  >
                    ⚖ {issue.principle_id}
                  </span>
                  <p className="text-xs leading-5" style={{ color: "#1A4A1A" }}>
                    "{issue.stronger_version}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Things to practice */}
      {critique.things_to_practice.length > 0 && (
        <div>
          <h3
            className="text-xs font-semibold tracking-wider mb-3"
            style={{ color: "#8B8580", fontVariant: "small-caps" }}
          >
            Things to practice next
          </h3>
          <ol className="space-y-2">
            {critique.things_to_practice.map((item, i) => (
              <li key={i} className="text-sm flex gap-2 leading-6" style={{ color: "#2A2A2A" }}>
                <span className="shrink-0" style={{ color: "#8B8580" }}>
                  {i + 1}.
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Outcome examples */}
      {critique.estimated_outcome_examples.length > 0 && (
        <div>
          <h3
            className="text-xs font-semibold tracking-wider mb-3"
            style={{ color: "#8B8580", fontVariant: "small-caps" }}
          >
            Similar applicant outcomes 💬
          </h3>
          <div className="space-y-1.5">
            {critique.estimated_outcome_examples.map((ex, i) => (
              <p key={i} className="text-xs leading-5" style={{ color: "#6B6B6B" }}>
                {ex}
              </p>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: "#B0AAA4" }}>
            These are real Reddit reports, not predictions.
          </p>
        </div>
      )}
    </div>
  )
}
