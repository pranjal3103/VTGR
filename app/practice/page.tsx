import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PracticeShell } from "./simulator"
import type { Profile } from "@/types/profile"
import type { SessionRecord } from "./history"

export default async function PracticePage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from("profile").select("*").limit(1).maybeSingle()

  if (!data) redirect("/profile")

  const { data: sessionsData } = await supabase
    .from("sessions")
    .select("id, ended_at, mode, outcome_in_sim, scores, critique")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(20)

  const sessions = (sessionsData ?? []) as SessionRecord[]

  return (
    <main className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      <PracticeShell profile={data as Profile} sessions={sessions} />
    </main>
  )
}
