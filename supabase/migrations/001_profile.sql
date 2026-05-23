-- Profile table (single row for Garvita)
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  age int,
  profession text,
  profession_detail text,
  city text,
  marital_status text,
  prior_us_visa_history jsonb default '[]'::jsonb,
  prior_international_travel jsonb default '{}'::jsonb,
  trip_purpose text,
  partner_us_status text,
  planned_duration_days int,
  planned_cities text[] default '{}',
  who_pays text,
  ties_to_india jsonb default '{}'::jsonb,
  consulate text,
  interview_date date,
  english_pref text default 'english',
  tough_mode boolean default false,
  has_prior_refusal boolean default false,
  refusal_date text,
  refusal_consulate text,
  refusal_ground text,
  refusal_reason_stated text,
  refusal_attempt_number int,
  refusal_narrative text,
  what_has_changed_since text,
  applicant_self_diagnosis text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sessions table
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  ended_at timestamptz,
  mode text,
  scenario_transcript_id text,
  difficulty text,
  turns jsonb default '[]'::jsonb,
  outcome_in_sim text,
  critique jsonb,
  scores jsonb
);

-- Session turns table
create table if not exists session_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  turn_index int,
  role text,
  content text,
  created_at timestamptz default now()
);

-- Test sessions (Phase 0.5 — kept separate from real history)
create table if not exists test_sessions (
  id uuid primary key default gen_random_uuid(),
  test_profile_number int,
  started_at timestamptz default now(),
  ended_at timestamptz,
  mode text,
  turns jsonb default '[]'::jsonb,
  outcome_in_sim text,
  critique jsonb,
  scores jsonb
);

-- Auto-update updated_at on profile changes
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profile_updated_at on profile;
create trigger profile_updated_at
  before update on profile
  for each row execute function update_updated_at();
