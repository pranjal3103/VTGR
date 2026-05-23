export type RefusalGround =
  | "214b_ties"
  | "214b_intent"
  | "221g_then_refused"
  | "other"

export interface VisaHistoryEntry {
  type: "refused" | "approved"
  date: string
  consulate?: string
  visa_type?: string
}

export interface TiesToIndia {
  property: boolean
  dependents: boolean
  job_continuity: boolean
  return_obligations: string
}

export interface Profile {
  id: string
  full_name: string
  age: number
  profession: string
  profession_detail: string
  city: string
  marital_status: string
  prior_us_visa_history: VisaHistoryEntry[]
  prior_international_travel: string[]
  trip_purpose: string
  partner_us_status: string
  planned_duration_days: number
  planned_cities: string[]
  who_pays: string
  ties_to_india: TiesToIndia
  consulate: string
  interview_date: string | null
  english_pref: "english" | "hindi"
  tough_mode: boolean
  has_prior_refusal: boolean
  // Prior refusal fields — null unless has_prior_refusal
  refusal_date: string | null
  refusal_consulate: string | null
  refusal_ground: RefusalGround | null
  refusal_reason_stated: string | null
  refusal_attempt_number: number | null
  refusal_narrative: string | null
  what_has_changed_since: string | null
  applicant_self_diagnosis: string | null
  created_at: string
  updated_at: string
}
