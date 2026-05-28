import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('profile')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const raw = await req.json()
  // Postgres rejects "" for date columns — coerce to null
  const body = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? null : v])
  )
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('profile')
    .select('id')
    .limit(1)
    .maybeSingle()

  let result
  if (existing?.id) {
    result = await supabase
      .from('profile')
      .update(body)
      .eq('id', existing.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from('profile')
      .insert(body)
      .select()
      .single()
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json(result.data)
}
