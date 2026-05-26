import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PracticeShell } from "./simulator"
import type { Profile } from "@/types/profile"

export default async function PracticePage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from("profile").select("*").limit(1).maybeSingle()

  if (!data) redirect("/profile")

  return (
    <main className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      <PracticeShell profile={data as Profile} />
    </main>
  )
}
