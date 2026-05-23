export type MaritalStatus = 'single' | 'married' | 'engaged' | 'divorced' | 'widowed'
export type TripPurpose = 'tourism' | 'visit_partner' | 'medical' | 'business' | 'family' | 'conference' | 'other'
export type WhoPays = 'self' | 'employer' | 'family_in_us' | 'family_in_india' | 'sponsor'
export type RefusalGround = '214b_ties' | '214b_intent' | '221g_then_refused' | 'other'
export type LanguagePref = 'english' | 'hindi'

export type VisaHistoryEntry = {
  outcome: 'approved' | 'refused_214b' | 'refused_221g' | 'refused_other' | 'pending'
  year: string
  consulate: string
}

export type PriorTravel = {
  countries: string[]
}

export type TiesToIndia = {
  owns_property: boolean
  dependents: string
  employment_status: 'employed' | 'self_employed' | 'student' | 'retired' | 'unemployed'
  return_obligations: string
}

export type Profile = {
  id?: string
  full_name: string
  age: number | null
  profession: string
  profession_detail: string
  city: string
  marital_status: MaritalStatus | ''
  prior_us_visa_history: VisaHistoryEntry[]
  prior_international_travel: PriorTravel
  trip_purpose: TripPurpose | ''
  partner_us_status: string
  planned_duration_days: number | null
  planned_cities: string[]
  who_pays: WhoPays | ''
  ties_to_india: TiesToIndia
  consulate: string
  interview_date: string
  english_pref: LanguagePref
  tough_mode: boolean
  has_prior_refusal: boolean
  refusal_date: string
  refusal_consulate: string
  refusal_ground: RefusalGround | ''
  refusal_reason_stated: string
  refusal_attempt_number: number | null
  refusal_narrative: string
  what_has_changed_since: string
  applicant_self_diagnosis: string
}

export const EMPTY_PROFILE: Profile = {
  full_name: '',
  age: null,
  profession: '',
  profession_detail: '',
  city: '',
  marital_status: '',
  prior_us_visa_history: [],
  prior_international_travel: { countries: [] },
  trip_purpose: '',
  partner_us_status: '',
  planned_duration_days: null,
  planned_cities: [],
  who_pays: '',
  ties_to_india: {
    owns_property: false,
    dependents: '',
    employment_status: 'employed',
    return_obligations: '',
  },
  consulate: '',
  interview_date: '',
  english_pref: 'english',
  tough_mode: false,
  has_prior_refusal: false,
  refusal_date: '',
  refusal_consulate: '',
  refusal_ground: '',
  refusal_reason_stated: '',
  refusal_attempt_number: null,
  refusal_narrative: '',
  what_has_changed_since: '',
  applicant_self_diagnosis: '',
}
