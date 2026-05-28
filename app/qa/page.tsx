import { createServiceClient } from "@/lib/supabase/server"
import { EMPTY_PROFILE } from "@/lib/types"
import { QAChat } from "./qa-chat"
import type { Turn, SimOutcome, SimMode, Critique } from "@/types/session"

export type SessionContext = {
  id: string
  ended_at: string
  mode: SimMode
  outcome_in_sim: SimOutcome | null
  turns: Turn[]
  critique: Critique | null
}

export default async function QAPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session: sessionId } = await searchParams
  const supabase = createServiceClient()

  const { data } = await supabase.from("profile").select("*").limit(1).maybeSingle()
  const profile = data ?? EMPTY_PROFILE

  let sessionContext: SessionContext | null = null
  if (sessionId) {
    const { data: s } = await supabase
      .from("sessions")
      .select("id, ended_at, mode, outcome_in_sim, turns, critique")
      .eq("id", sessionId)
      .maybeSingle()
    if (s) sessionContext = s as SessionContext
  }

  return (
    <main className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      <div className="flex-1 overflow-hidden max-w-2xl mx-auto w-full px-6 py-8 flex flex-col">
        <div className="mb-6 flex-shrink-0">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "#2A2A2A" }}>
            Ask a question
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#8B8580" }}>
            Every answer is grounded in official sources, practitioner advice, and real interview reports.
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <QAChat profile={profile} sessionContext={sessionContext} />
        </div>
      </div>
    </main>
  )
}
