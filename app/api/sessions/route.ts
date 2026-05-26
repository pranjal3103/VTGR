import { createServiceClient } from "@/lib/supabase/server"
import type { Turn, SimOutcome, SimMode } from "@/types/session"

export async function POST(req: Request) {
  const { mode } = await req.json() as { mode: SimMode }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("sessions")
    .insert({ mode, turns: [] })
    .select("id")
    .single()

  if (error || !data) {
    return new Response("Failed to create session", { status: 500 })
  }
  return Response.json({ id: data.id })
}

export async function PATCH(req: Request) {
  const { sessionId, turns, outcome } = await req.json() as {
    sessionId: string
    turns: Turn[]
    outcome: SimOutcome | null
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("sessions")
    .update({ turns, outcome_in_sim: outcome })
    .eq("id", sessionId)

  if (error) {
    return new Response("Failed to update session", { status: 500 })
  }
  return new Response(null, { status: 204 })
}
