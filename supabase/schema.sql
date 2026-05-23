-- Visa Coach — Supabase schema
-- Run this in the Supabase SQL editor to initialize the database.
-- pgvector extension must be enabled first: Extensions > pgvector

-- Enable pgvector
create extension if not exists vector;

-- Profile (single row — Garvita's profile)
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  age int,
  profession text,
  profession_detail text,
  city text,
  marital_status text,
  prior_us_visa_history jsonb default '[]',
  prior_international_travel jsonb default '[]',
  trip_purpose text,
  partner_us_status text,
  planned_duration_days int,
  planned_cities text[],
  who_pays text,
  ties_to_india jsonb default '{}',
  consulate text,
  interview_date date,
  english_pref text default 'english',
  tough_mode boolean default false,
  has_prior_refusal boolean default false,
  refusal_date date,
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

-- Sessions (real usage — not test)
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  ended_at timestamptz,
  mode text not null,
  scenario_transcript_id text,
  difficulty text default 'normal',
  turns jsonb default '[]',
  outcome_in_sim text,
  critique jsonb,
  scores jsonb
);

-- Test sessions (Phase 0.5 — separate from real history)
create table if not exists test_sessions (
  id uuid primary key default gen_random_uuid(),
  test_profile_id int not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  mode text not null,
  scenario_transcript_id text,
  difficulty text default 'normal',
  turns jsonb default '[]',
  outcome_in_sim text,
  critique jsonb,
  scores jsonb
);

-- Corpus embeddings (pgvector)
-- principles embeddings
create table if not exists principle_embeddings (
  id text primary key,
  principle text not null,
  source_layer text not null,
  embedding vector(1536)
);

-- practitioner claim embeddings
create table if not exists practitioner_embeddings (
  id text primary key,
  claim text not null,
  source_url text,
  embedding vector(1536)
);

-- reddit qa embeddings
create table if not exists reddit_embeddings (
  id text primary key,
  qa_text text not null,
  consulate text,
  outcome text,
  embedding vector(1536)
);

-- HNSW indexes for fast ANN search
create index if not exists principle_embeddings_embedding_idx
  on principle_embeddings using hnsw (embedding vector_cosine_ops);

create index if not exists practitioner_embeddings_embedding_idx
  on practitioner_embeddings using hnsw (embedding vector_cosine_ops);

create index if not exists reddit_embeddings_embedding_idx
  on reddit_embeddings using hnsw (embedding vector_cosine_ops);
