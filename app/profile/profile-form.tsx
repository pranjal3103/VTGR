'use client'

import { useState } from 'react'
import { Profile, EMPTY_PROFILE, VisaHistoryEntry } from '@/lib/types'

const CONSULATES = ['Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad']
const REFUSAL_GROUNDS = [
  { value: '214b_ties', label: '214(b) — Insufficient ties to home country' },
  { value: '214b_intent', label: '214(b) — Failed to overcome immigrant intent' },
  { value: '221g_then_refused', label: '221(g) administrative processing, then refused' },
  { value: 'other', label: 'Other / not sure' },
]

const inputCls = `w-full px-3 py-2 text-sm border rounded-md outline-none transition-colors
  focus:border-[#2A2A2A] bg-white`
  .replace(/\s+/g, ' ')

const labelCls = 'block text-sm font-medium mb-1.5'
const sectionCls = 'mb-10'
const sectionTitleCls = 'text-xs font-semibold uppercase tracking-widest mb-6 pb-2 border-b'

export function ProfileForm({ initialData }: { initialData: Partial<Profile> }) {
  const [form, setForm] = useState<Profile>({ ...EMPTY_PROFILE, ...initialData })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const hasRefusal = form.prior_us_visa_history.some(
    e => e.outcome.startsWith('refused')
  )

  const addVisaEntry = () => {
    set('prior_us_visa_history', [
      ...form.prior_us_visa_history,
      { outcome: 'approved', year: '', consulate: '' } as VisaHistoryEntry,
    ])
  }

  const updateVisaEntry = (i: number, patch: Partial<VisaHistoryEntry>) => {
    const updated = form.prior_us_visa_history.map((e, idx) =>
      idx === i ? { ...e, ...patch } : e
    )
    set('prior_us_visa_history', updated)
  }

  const removeVisaEntry = (i: number) =>
    set('prior_us_visa_history', form.prior_us_visa_history.filter((_, idx) => idx !== i))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const payload = {
      ...form,
      has_prior_refusal: hasRefusal,
    }

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ color: '#2A2A2A' }}>

      {/* ── Section 1: About You ── */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls} style={{ color: '#6B6B6B', borderColor: '#E8E3DC' }}>
          About You
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Full name</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="As it appears on your passport"
            />
          </div>
          <div>
            <label className={labelCls}>Age</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              type="number" min={18} max={100}
              value={form.age ?? ''}
              onChange={e => set('age', e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
          <div>
            <label className={labelCls}>City (in India)</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.city}
              onChange={e => set('city', e.target.value)}
              placeholder="e.g. Mumbai"
            />
          </div>
          <div>
            <label className={labelCls}>Profession</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.profession}
              onChange={e => set('profession', e.target.value)}
              placeholder="e.g. Doctor, Software Engineer"
            />
          </div>
          <div>
            <label className={labelCls}>Specialty / detail</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.profession_detail}
              onChange={e => set('profession_detail', e.target.value)}
              placeholder="e.g. Cardiology, 4 years experience"
            />
          </div>
          <div>
            <label className={labelCls}>Marital status</label>
            <select className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.marital_status}
              onChange={e => set('marital_status', e.target.value as Profile['marital_status'])}
            >
              <option value="">Select</option>
              <option value="single">Single</option>
              <option value="engaged">Engaged</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Section 2: Visa & Travel History ── */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls} style={{ color: '#6B6B6B', borderColor: '#E8E3DC' }}>
          Visa & Travel History
        </h2>

        <div className="mb-5">
          <label className={labelCls}>Previous US visa applications</label>
          <p className="text-xs mb-3" style={{ color: '#8B8580' }}>
            Add one entry per application, most recent first.
          </p>
          {form.prior_us_visa_history.map((entry, i) => (
            <div key={i} className="flex gap-2 mb-2 items-start">
              <select
                className={inputCls + ' flex-1'}
                style={{ borderColor: '#D9D4CC' }}
                value={entry.outcome}
                onChange={e => updateVisaEntry(i, { outcome: e.target.value as VisaHistoryEntry['outcome'] })}
              >
                <option value="approved">Approved</option>
                <option value="refused_214b">Refused — 214(b)</option>
                <option value="refused_221g">Refused — 221(g)</option>
                <option value="refused_other">Refused — other</option>
                <option value="pending">Pending</option>
              </select>
              <input
                className={inputCls}
                style={{ borderColor: '#D9D4CC', width: '80px' }}
                placeholder="Year"
                value={entry.year}
                onChange={e => updateVisaEntry(i, { year: e.target.value })}
              />
              <input
                className={inputCls + ' flex-1'}
                style={{ borderColor: '#D9D4CC' }}
                placeholder="Consulate"
                value={entry.consulate}
                onChange={e => updateVisaEntry(i, { consulate: e.target.value })}
              />
              <button type="button"
                onClick={() => removeVisaEntry(i)}
                className="px-2 py-2 text-xs rounded hover:bg-red-50 transition-colors"
                style={{ color: '#7A1F1F', border: '1px solid #E8D4D4' }}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addVisaEntry}
            className="mt-1 text-xs px-3 py-1.5 rounded border transition-colors hover:bg-stone-50"
            style={{ borderColor: '#D9D4CC', color: '#2A2A2A' }}
          >
            + Add application
          </button>
        </div>

        <div>
          <label className={labelCls}>Countries visited in the last 5 years</label>
          <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
            placeholder="e.g. UK, Singapore, UAE (comma-separated)"
            value={form.prior_international_travel.countries.join(', ')}
            onChange={e => set('prior_international_travel', {
              countries: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
            })}
          />
        </div>
      </div>

      {/* ── Section 3: This Trip ── */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls} style={{ color: '#6B6B6B', borderColor: '#E8E3DC' }}>
          This Trip
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Purpose of visit</label>
            <select className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.trip_purpose}
              onChange={e => set('trip_purpose', e.target.value as Profile['trip_purpose'])}
            >
              <option value="">Select</option>
              <option value="tourism">Tourism / sightseeing</option>
              <option value="visit_partner">Visit partner / fiancé</option>
              <option value="family">Visit family</option>
              <option value="medical">Medical treatment</option>
              <option value="business">Business (B1)</option>
              <option value="conference">Conference / academic</option>
              <option value="other">Other</option>
            </select>
          </div>

          {(form.trip_purpose === 'visit_partner') && (
            <div className="col-span-2">
              <label className={labelCls}>Partner's US immigration status</label>
              <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
                value={form.partner_us_status}
                onChange={e => set('partner_us_status', e.target.value)}
                placeholder="e.g. H1B, Green Card, US Citizen"
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Planned duration (days)</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              type="number" min={1} max={180}
              value={form.planned_duration_days ?? ''}
              onChange={e => set('planned_duration_days', e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
          <div>
            <label className={labelCls}>Who is paying for this trip?</label>
            <select className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.who_pays}
              onChange={e => set('who_pays', e.target.value as Profile['who_pays'])}
            >
              <option value="">Select</option>
              <option value="self">Self (own savings)</option>
              <option value="employer">Employer</option>
              <option value="family_in_us">Family member in US</option>
              <option value="family_in_india">Family in India</option>
              <option value="sponsor">Other sponsor</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Planned cities to visit</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              placeholder="e.g. New York, Boston, Chicago"
              value={form.planned_cities.join(', ')}
              onChange={e => set('planned_cities',
                e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              )}
            />
          </div>
        </div>
      </div>

      {/* ── Section 4: Ties to India ── */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls} style={{ color: '#6B6B6B', borderColor: '#E8E3DC' }}>
          Ties to India
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input type="checkbox" id="owns_property"
              className="w-4 h-4 rounded"
              checked={form.ties_to_india.owns_property}
              onChange={e => set('ties_to_india', { ...form.ties_to_india, owns_property: e.target.checked })}
            />
            <label htmlFor="owns_property" className="text-sm">I own property in India</label>
          </div>
          <div>
            <label className={labelCls}>Employment status in India</label>
            <select className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.ties_to_india.employment_status}
              onChange={e => set('ties_to_india', {
                ...form.ties_to_india,
                employment_status: e.target.value as Profile['ties_to_india']['employment_status']
              })}
            >
              <option value="employed">Employed (salaried)</option>
              <option value="self_employed">Self-employed / business owner</option>
              <option value="student">Student</option>
              <option value="retired">Retired</option>
              <option value="unemployed">Not currently employed</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Dependents in India</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              placeholder="e.g. Parents, spouse, children (or 'None')"
              value={form.ties_to_india.dependents}
              onChange={e => set('ties_to_india', { ...form.ties_to_india, dependents: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Reasons you must return</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              placeholder="e.g. Job, ongoing medical duties, family obligations"
              value={form.ties_to_india.return_obligations}
              onChange={e => set('ties_to_india', { ...form.ties_to_india, return_obligations: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* ── Section 5: Interview Logistics ── */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls} style={{ color: '#6B6B6B', borderColor: '#E8E3DC' }}>
          Interview Logistics
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Consulate</label>
            <select className={inputCls} style={{ borderColor: '#D9D4CC' }}
              value={form.consulate}
              onChange={e => set('consulate', e.target.value)}
            >
              <option value="">Select</option>
              {CONSULATES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Interview date</label>
            <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
              type="date"
              value={form.interview_date}
              onChange={e => set('interview_date', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Section 6: Preferences ── */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls} style={{ color: '#6B6B6B', borderColor: '#E8E3DC' }}>
          Coaching Preferences
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Language preference for coaching</label>
            <select className={inputCls} style={{ borderColor: '#D9D4CC', maxWidth: '200px' }}
              value={form.english_pref}
              onChange={e => set('english_pref', e.target.value as Profile['english_pref'])}
            >
              <option value="english">English</option>
              <option value="hindi">Hindi</option>
            </select>
          </div>
          <div className="rounded-md p-4" style={{ backgroundColor: '#F0EBE3', border: '1px solid #E0D9D0' }}>
            <div className="flex items-start gap-3">
              <input type="checkbox" id="tough_mode"
                className="w-4 h-4 mt-0.5 rounded"
                checked={form.tough_mode}
                onChange={e => set('tough_mode', e.target.checked)}
              />
              <div>
                <label htmlFor="tough_mode" className="text-sm font-medium">Tough mode</label>
                <p className="text-xs mt-0.5" style={{ color: '#8B8580' }}>
                  The simulated officer will be more skeptical, push back on weak answers, and demand specifics.
                  Recommended. Automatically enabled if you have a prior refusal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 7: Prior Refusal (conditional) ── */}
      {hasRefusal && (
        <div className={sectionCls}>
          <div className="rounded-md p-5 mb-6"
            style={{ backgroundColor: '#FDF5F5', border: '1px solid #E8D4D4' }}
          >
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: '#7A1F1F' }}>
              Prior Refusal
            </h2>
            <p className="text-xs" style={{ color: '#8B6060' }}>
              This stays private. The more honest you are, the more useful the coaching will be.
              The coach treats this as primary context — every session will be shaped by it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Month and year of refusal</label>
              <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
                placeholder="e.g. March 2024"
                value={form.refusal_date}
                onChange={e => set('refusal_date', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Consulate where refused</label>
              <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
                placeholder="e.g. Mumbai"
                value={form.refusal_consulate}
                onChange={e => set('refusal_consulate', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Ground of refusal</label>
              <select className={inputCls} style={{ borderColor: '#D9D4CC' }}
                value={form.refusal_ground}
                onChange={e => set('refusal_ground', e.target.value as Profile['refusal_ground'])}
              >
                <option value="">Select</option>
                {REFUSAL_GROUNDS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Application number (1st, 2nd...)</label>
              <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
                type="number" min={1} max={10}
                value={form.refusal_attempt_number ?? ''}
                onChange={e => set('refusal_attempt_number', e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Exact words the officer used (or what was on the refusal slip)</label>
              <input className={inputCls} style={{ borderColor: '#D9D4CC' }}
                placeholder='e.g. "I am unable to issue a visa to you under section 214(b)"'
                value={form.refusal_reason_stated}
                onChange={e => set('refusal_reason_stated', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelCls}>What happened in that interview?</label>
              <p className="text-xs mb-1.5" style={{ color: '#8B8580' }}>
                What did the officer ask? How did you answer? What did you sense went wrong?
              </p>
              <textarea className={inputCls} style={{ borderColor: '#D9D4CC', minHeight: '100px', resize: 'vertical' }}
                value={form.refusal_narrative}
                onChange={e => set('refusal_narrative', e.target.value)}
                placeholder="Write freely — no character limit."
              />
            </div>
            <div>
              <label className={labelCls}>What has changed since then?</label>
              <p className="text-xs mb-1.5" style={{ color: '#8B8580' }}>
                New job, new property, completed degree, marriage/engagement, financial documents, etc.
              </p>
              <textarea className={inputCls} style={{ borderColor: '#D9D4CC', minHeight: '80px', resize: 'vertical' }}
                value={form.what_has_changed_since}
                onChange={e => set('what_has_changed_since', e.target.value)}
                placeholder="Be specific — vague answers here lead to vague coaching."
              />
            </div>
            <div>
              <label className={labelCls}>Looking back, what do you think the officer was concerned about?</label>
              <p className="text-xs mb-1.5" style={{ color: '#8B8580' }}>
                Your own diagnosis. Why do you think you were refused?
              </p>
              <textarea className={inputCls} style={{ borderColor: '#D9D4CC', minHeight: '80px', resize: 'vertical' }}
                value={form.applicant_self_diagnosis}
                onChange={e => set('applicant_self_diagnosis', e.target.value)}
                placeholder="Your honest read of the situation."
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Save button ── */}
      <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: '#E8E3DC' }}>
        <button type="submit" disabled={saving}
          className="px-6 py-2.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#2A2A2A', color: '#FAF7F2' }}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: '#2A6A2A' }}>Saved.</span>
        )}
        {error && (
          <span className="text-sm" style={{ color: '#7A1F1F' }}>{error}</span>
        )}
      </div>
    </form>
  )
}
