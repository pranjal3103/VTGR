import { createServiceClient } from '@/lib/supabase/server'
import { ProfileForm } from './profile-form'
import { EMPTY_PROFILE } from '@/lib/types'

export default async function ProfilePage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('profile').select('*').limit(1).maybeSingle()

  return (
    <main className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#2A2A2A' }}>
            Your Profile
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#6B6B6B' }}>
            This information personalises every coaching session. Be as specific as possible.
          </p>
        </div>
        <ProfileForm initialData={data ?? EMPTY_PROFILE} />
      </div>
    </main>
  )
}
