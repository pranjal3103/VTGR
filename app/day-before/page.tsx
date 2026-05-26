import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import type { Profile } from "@/types/profile"
import type { Turn, Critique } from "@/types/session"

const PURPOSE_LABELS: Record<string, string> = {
  tourism: "Tourism",
  visit_partner: "Visiting partner",
  medical: "Medical visit",
  business: "Business",
  family: "Family visit",
  conference: "Conference",
  other: "Travel",
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Date not set"
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return dateStr
  }
}

const CHECKLIST = [
  "Appointment letter (printed)",
  "Passport — current and all previous passports",
  "DS-160 confirmation page (printed)",
  "Financial documents — bank statements, ITR",
  "Employment letter or business proof",
  "Ties to India — property docs, dependents, anything concrete",
  "Photographs (check consulate requirements)",
]

export default async function DayBeforePage() {
  const supabase = createServiceClient()

  const { data: profileData } = await supabase
    .from("profile")
    .select("*")
    .limit(1)
    .maybeSingle()

  if (!profileData) redirect("/profile")

  const profile = profileData as Profile

  // Last session with a critique (any mode)
  const { data: lastSessionData } = await supabase
    .from("sessions")
    .select("critique, turns, mode, ended_at")
    .not("critique", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastCritique = lastSessionData?.critique as Critique | null
  const thingsToPractice: string[] = lastCritique?.things_to_practice ?? []

  // Best refusal drill session (only when has_prior_refusal)
  let bestDrillAnswers: string[] = []
  if (profile.has_prior_refusal) {
    const { data: drillSessions } = await supabase
      .from("sessions")
      .select("turns, critique")
      .eq("mode", "refusal_drill")
      .not("critique", "is", null)
      .order("ended_at", { ascending: false })
      .limit(5)

    if (drillSessions?.length) {
      const best = drillSessions.reduce((acc, s) => {
        const score = (s.critique as Critique)?.prior_refusal_addressed ?? 0
        const accScore = (acc.critique as Critique)?.prior_refusal_addressed ?? 0
        return score > accScore ? s : acc
      })
      const drillTurns = (best.turns as Turn[]) ?? []
      bestDrillAnswers = drillTurns
        .filter(t => t.role === "applicant")
        .map(t => t.content)
        .slice(0, 3)
    }
  }

  const purposeLabel = PURPOSE_LABELS[profile.trip_purpose] ?? profile.trip_purpose
  const hasContent = thingsToPractice.length > 0 || bestDrillAnswers.length > 0

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#F5F0E6" }}>
      <div className="max-w-lg mx-auto px-8 py-16">

        {/* ── Header ── */}
        <div className="mb-12">
          <h1
            className="font-serif text-4xl tracking-tight mb-4 leading-tight"
            style={{ color: "#2A2A2A" }}
          >
            Interview day.
          </h1>
          <p className="text-base leading-8" style={{ color: "#4A4A4A" }}>
            {profile.consulate ? `${profile.consulate} Consulate` : "Consulate"}
            {profile.interview_date ? ` · ${formatDate(profile.interview_date)}` : ""}
          </p>
          {(purposeLabel || profile.planned_duration_days) && (
            <p className="text-sm" style={{ color: "#8B8580" }}>
              {[purposeLabel, profile.planned_duration_days ? `${profile.planned_duration_days} days` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {/* ── Affirmation ── */}
        <div
          className="mb-12 pb-12"
          style={{ borderBottom: "1px solid #D8D3CC" }}
        >
          <p
            className="font-serif text-lg leading-9"
            style={{ color: "#5A5550" }}
          >
            You have prepared. You know your reasons. Answer honestly, stay
            specific, and trust what you have practised.
          </p>
        </div>

        {/* ── Best refusal drill answers ── */}
        {bestDrillAnswers.length > 0 && (
          <div
            className="mb-12 pb-12"
            style={{ borderBottom: "1px solid #D8D3CC" }}
          >
            <h2
              className="text-xs font-semibold tracking-wider mb-5"
              style={{ color: "#8B8580", fontVariant: "small-caps" }}
            >
              Your strongest answers — refusal question
            </h2>
            <div className="space-y-4">
              {bestDrillAnswers.map((answer, i) => (
                <div
                  key={i}
                  className="rounded-md px-5 py-4"
                  style={{ backgroundColor: "#EDE8E0" }}
                >
                  <p
                    className="text-sm leading-7 font-serif"
                    style={{ color: "#2A2A2A" }}
                  >
                    "{answer}"
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: "#B0AAA4" }}>
              From your highest-scoring refusal drill. These are your words — say them as you practiced.
            </p>
          </div>
        )}

        {/* ── Things to keep in mind ── */}
        {thingsToPractice.length > 0 && (
          <div
            className="mb-12 pb-12"
            style={{ borderBottom: "1px solid #D8D3CC" }}
          >
            <h2
              className="text-xs font-semibold tracking-wider mb-5"
              style={{ color: "#8B8580", fontVariant: "small-caps" }}
            >
              Keep in mind
            </h2>
            <ol className="space-y-3">
              {thingsToPractice.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm leading-7"
                  style={{ color: "#2A2A2A" }}
                >
                  <span
                    className="shrink-0 font-mono text-xs pt-1"
                    style={{ color: "#B0AAA4" }}
                  >
                    {i + 1}.
                  </span>
                  {item}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs" style={{ color: "#B0AAA4" }}>
              From your most recent practice session.
            </p>
          </div>
        )}

        {/* ── Checklist ── */}
        <div className="mb-12 pb-12" style={{ borderBottom: "1px solid #D8D3CC" }}>
          <h2
            className="text-xs font-semibold tracking-wider mb-5"
            style={{ color: "#8B8580", fontVariant: "small-caps" }}
          >
            Before you leave
          </h2>
          <ul className="space-y-3">
            {CHECKLIST.map((item, i) => (
              <li
                key={i}
                className="flex gap-3 text-sm leading-7"
                style={{ color: "#4A4A4A" }}
              >
                <span
                  className="shrink-0 text-base"
                  style={{ color: "#B0AAA4" }}
                  aria-hidden="true"
                >
                  ☐
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Footer ── */}
        <div className="text-center">
          <p
            className="font-serif text-base mb-6"
            style={{ color: "#8B8580" }}
          >
            Good luck.
          </p>
          <Link
            href="/practice"
            className="text-xs transition-colors"
            style={{ color: "#B0AAA4" }}
          >
            ← Back to practice
          </Link>
        </div>

      </div>
    </main>
  )
}
