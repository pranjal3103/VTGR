export interface OfficialEntry {
  id: string
  source: string
  source_url: string
  section: string
  paragraph_anchor: string
  text: string
  retrieved_at: string
}

export interface PractitionerEntry {
  id: string
  source_site: string
  source_url: string
  article_title: string
  claim: string
  supporting_quote: string
  extracted_at: string
  validation_status: "passed" | "failed"
}

export interface RedditApplicantProfile {
  age_band: string
  profession: string
  marital_status: string
  prior_us_travel: string
  purpose: string
}

export interface QAPair {
  q: string
  a: string
}

export interface RedditEntry {
  id: string
  source_url: string
  date_posted: string
  consulate: string
  applicant_profile: RedditApplicantProfile
  outcome: "approved" | "refused_214b" | "refused_221g" | "pending" | "unknown"
  qa_sequence: QAPair[]
  quality_flag: "full_transcript" | "texture_only"
  extracted_at: string
}

export type SourceLayer = "official" | "practitioner"

export interface Principle {
  id: string
  principle: string
  source_layer: SourceLayer
  source_ids: string[]
  validation_status: "passed" | "failed"
  confidence: "high" | "medium"
  applies_to_categories: string[]
}
