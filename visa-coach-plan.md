# Visa Coach — Planning Document (v2, Fully Automated Corpus)

**Purpose:** A personal B1/B2 visa interview coach for one user (Garvita). Two capabilities:
1. **Simulate** consular interviews based on her profile, then critique her answers.
2. **Answer** her questions about the process, grounded in scraped transcripts + official sources.

**Scope discipline:** Single-user app. No auth, no multi-tenancy, no payments. Every architectural decision defaults to *the simplest thing that works for one person*.

**Key v2 change:** No manual curation. The entire corpus is built by automated pipelines. The quality control shifts from human judgment to (a) source selection at scrape time and (b) layered authority — official sources are weighted higher than scraped content.

---

## 0. Critical Premises (Stress-Tested Before Building)

| Premise | Risk if wrong | Mitigation |
|---|---|---|
| Auto-scraped Reddit gives useful question phrasing even with noisy outcome labels | Coach sounds unrealistic or repeats Reddit-only artifacts | Use Reddit ONLY for question/answer texture, never for evaluation; UI never shows aggregate stats |
| Official 9 FAM + INA 214(b) + State Dept stats are enough to ground evaluation | LLM critique drifts into generic feel-good advice | Critique prompt forced to cite specific principle IDs; output schema requires principle reference per critique item |
| LLM-synthesized principles file is good enough on first pass without human review | Generated principles contain confident-sounding errors | Synthesis pipeline cross-checks: each principle must be traceable to a specific source paragraph; uncited principles get dropped |
| Profile-aware coaching beats generic | Generic advice she could get free anywhere | Every prompt is conditioned on profile; retrieval is filtered by profile match |
| She'll actually use it | She does 2 sessions, gets nervous, stops | Session length capped 15 min; first session deliberately easy; day-before mode separate |

**The single biggest risk shifted from v1:** Without manual review, the synthesized principles file may contain plausible-sounding inaccuracies about US visa law. **Mitigation:** force every principle to carry a citation back to a specific source paragraph. Anything the LLM generates without traceable grounding gets dropped from the file automatically (see §1.1).

---

## 1. Phases (Build Order)

Seven phases (Phase 0.5 is new). Phase 1 is now substantially heavier (it's a real data pipeline, not just curation) but everything after is the same.

### Phase 0.5 — Adversarial Quality Check (NEW)
**Goal:** Before Garvita ever sees the app, you (Pranjal) deliberately try to break it. Catch failure modes while there's still time to fix them.

**Why this exists:** Usage is not quality. The v1 Definition of Done measured whether she used the app, not whether the app was right. Without manual corpus curation, the only check on whether the LLM is hallucinating is whether the validation gate (§1.1) actually works. Phase 0.5 is the test that the validation gate worked.

**When to run:** After Phase 3 ships (so Q&A coach works) and again after Phase 4 ships (so simulator + critique works). Twice total, ~2 hours each time.

**Five test profiles (build into the app as a hidden "test mode"):**

| # | Profile | Why this profile |
|---|---|---|
| 1 | Match Garvita's profile exactly | The real test — does it coach well for her case? |
| 2 | High-risk applicant (22yo, unemployed, refused once) | Does the coach correctly flag the risks? Does it avoid false reassurance? |
| 3 | Low-risk applicant (45yo, married, government job, 5 prior US trips) | Does the coach avoid over-warning? Does it stay calibrated? |
| 4 | Edge case (medical conference attendee with employer letter) | Does the coach handle B1 business-specific dynamics, not just B2 tourism? |
| 5 | Suspicious case (single, no ties, vague trip purpose, intends to extend stay) | Does the coach detect actual red flags rather than just rubber-stamping? |

**Test procedure for each profile:**
1. Set up the test profile via the form
2. Run 2-3 Q&A queries on common topics (purpose, ties, finances, return)
3. Run 1 mock interview session, deliberately giving **deliberately bad answers** (vague, contradictory, evasive)
4. Run 1 mock interview session, deliberately giving **deliberately strong answers** (specific, consistent, well-anchored)
5. Score the coach on:

**Quality rubric (score each test 1-5):**

| Dimension | What "5" looks like | What "1" looks like |
|---|---|---|
| **Hallucination check** | Every claim traces to a real source in corpus | Coach states "facts" not in any source file |
| **Calibration** | Bad answers get critiqued, good answers get acknowledged | Same critique regardless of answer quality |
| **Profile awareness** | Coach references her specific profile (doctor, partner, etc.) | Generic advice that ignores profile |
| **Authority hierarchy** | Critique cites principles, examples are clearly labeled "Reddit" | All sources blended into one undifferentiated voice |
| **Honesty about uncertainty** | When corpus lacks info, coach says so | Coach fabricates plausible-sounding answers |

**Done when:** Average score ≥3.5 across all five profiles on all five dimensions. Anything <3 on hallucination check or honesty about uncertainty is a P0 — fix before Garvita touches the app.

**What you actually do with failures:**
- *Hallucination failures* → tighten validation threshold in §1.1, regenerate principles file
- *Calibration failures* → revise critique prompt, force more explicit "if answer is X, criticize Y" logic
- *Profile awareness failures* → check that profile JSON is actually being injected into prompts
- *Authority hierarchy failures* → UI bug; check Rule 4 implementation
- *Uncertainty failures* → strengthen "do not fabricate" instructions in prompts, add a "no relevant sources found" fallback path

**Why this beats manual curation as a quality check:** Manual curation tries to make the inputs perfect. Phase 0.5 tests whether the outputs are good *despite* imperfect inputs. For a fully-automated pipeline, the second approach is the only one that scales.

**Hard stop rule:** Do not show the app to Garvita until Phase 0.5 passes the rubric. If she sees an early version that confidently tells her something wrong, the trust damage is hard to undo.

---

### Phase 1 — Automated Corpus Pipeline
**Goal:** Three artifacts built end-to-end with no manual reading.

Three layers, decreasing authority, increasing volume:

#### Layer A — Official sources (high authority, low volume, machine-clean)
- **9 FAM 302.1** (Foreign Affairs Manual section on nonimmigrant visas) — scrape from `fam.state.gov`, parse HTML to structured sections
- **INA 214(b)** statute text — scrape from law.cornell.edu or congress.gov
- **State Dept refusal rate tables** — annual CSV from `travel.state.gov`, parse for B1/B2 + India consulates
- **Reciprocity schedule for India** — fee/duration/conditions table from State Dept

Output: `corpus/official.yaml` with structured sections, each labeled with source URL + paragraph anchor.

#### Layer B — Lawyer/practitioner content (medium authority, medium volume)
- Pre-defined target list of ~15 lawyer/immigration sites (Murthy Law Firm, Rajiv S. Khanna's immigration.com, Boundless, VisaPro, Stilt, Path2USA, etc.)
- Scraper hits B1/B2-related URLs on each site, pulls 100-200 articles total
- LLM pass (Haiku) on each article: extract structured claims as `{claim, source_paragraph, source_url}`
- Filter: discard any "claim" the LLM extracts that isn't directly supported by a verbatim quote from the source paragraph (regex/string match check, not LLM judgment)

Output: `corpus/practitioner.yaml` — list of claims, each with provenance.

#### Layer C — Reddit transcripts (low authority, high volume, noisy)
- Scrape r/USTravelVisa, r/visas, r/immigration, r/india, r/indiansabroad
- Filter: B1/B2 keywords + India consulate keywords + last 24 months
- Target: 1,500-2,500 posts
- For each post, LLM auto-extraction (Haiku, ~$1 total for the whole corpus): consulate, applicant archetype (age band, profession, marital status, prior travel), Q&A pairs if present, stated outcome
- Quality flag: any post where the LLM can't extract at least 3 Q&A pairs gets marked `texture_only` (still usable for question-phrasing patterns, not used as full transcript example)

Output: `corpus/reddit.yaml` — structured posts. Accept ~30% tag noise.

#### 1.1 Critical synthesis pipeline (the part that prevents hallucinated principles)

After scraping, run a **principles synthesis** that:

1. Takes Layer A (official) + Layer B (practitioner) as inputs
2. LLM (Sonnet 4.5) generates candidate principles as `{principle_text, supporting_source_ids[], confidence}`
3. **Automated validation step:** for each candidate principle, programmatically verify that at least one source_id's actual text contains substantive overlap with the principle (use embedding similarity threshold, e.g. cosine > 0.7, OR a strict LLM verification call that returns yes/no with the source paragraph quoted back)
4. Any principle that fails validation is dropped
5. Any principle from Layer A (official) is kept by default; Layer B principles must clear the validation bar

Output: `corpus/principles.yaml` — the authoritative file the critique prompt uses.

**Why this matters:** without manual review, this validation gate is the only thing preventing the LLM from confidently generating wrong legal claims. It's not perfect, but a validated principle has at minimum a real source paragraph behind it.

**Done when:**
- ≥1,500 Reddit posts ingested with structured tags
- ≥80 practitioner articles ingested
- Principles file has ≥30 validated principles, ≥10 from official sources
- All four output files exist with proper schemas

**Estimated time:** 4-6 days (scraper writing, pipeline plumbing, debugging the validation step)

---

### Phase 2 — Profile Intake
**Goal:** A 15-field form that captures everything the coach needs to personalize. Plus, for repeat applicants, a structured prior-refusal section.

DS-160 photo upload still rejected — form is cleaner and more reliable.

**Fields:**
- Basic: age, profession (doctor + specialty + years), city, marital status
- Visa history: prior US visas (refused? approved? when?), prior international travel (countries, last 5 years)
- This trip: purpose, partner's US status, planned duration, planned cities, who pays
- Ties to India: property, dependents, job continuity, return obligations
- Logistics: consulate, interview date
- Comfort: tough-mode opt-in (defaulted ON for prior-refusal applicants), English/Hindi preference

**Prior-refusal section (conditional — shown only if prior_us_visa_history includes a refusal):**

This is a critical addition. A prior refusal — especially a 214(b) — fundamentally changes coaching dynamics. Officers see prior refusals in their system and will almost certainly ask about them. The applicant must demonstrate either changed circumstances or stronger evidence than before. The form captures this in five structured fields plus three freeform fields:

*Structured:*
- `refusal_date` — when (month/year)
- `refusal_consulate` — which consulate
- `refusal_ground` — dropdown: 214(b) insufficient ties | 214(b) intent issues | 221(g) admin processing later refused | other
- `refusal_reason_stated` — exactly what the officer said (often a single sentence on a printed slip, e.g. "I am unable to issue a visa to you under section 214(b)")
- `refusal_attempt_number` — was this the 1st, 2nd, 3rd attempt?

*Freeform (long text, no character limit):*
- `refusal_narrative` — "Tell me in your own words what happened in that interview. What did the officer ask? How did you answer? What did you sense went wrong?"
- `what_has_changed_since` — "What in your life has changed since that refusal that would make this application stronger? New job, new property, completed degree, new financial documents, marriage/engagement status, etc."
- `applicant_self_diagnosis` — "Looking back, what do you think the officer was concerned about? Why do you think you were refused?"

These freeform fields are not just stored — they're injected directly into every prompt. The coach treats them as primary context, not background.

**Why freeform matters here:** The official refusal reason ("214(b) insufficient ties") is generic. The real story — what was actually asked, how she answered, what she said about her partner, whether she stumbled on the return-date question — only exists in her memory. Capturing it in natural language and feeding it to the LLM is the only way the coach can identify the actual weak spot to drill on.

**One UX note:** Make the prior-refusal section emotionally easier to fill in. People often blame themselves for refusals and re-living the interview is uncomfortable. Frame the form as "Help me help you" rather than an interrogation. A small note: "This stays on your device. The more honest you are, the more useful the coach will be."

---

### Phase 3 — Q&A Coach
**Goal:** Ask any question, get an answer grounded in corpus.

**Behavior:**
- Question → retrieve from all three layers, weighted by authority
- Layer A principles always retrieved if relevant
- Layer B practitioner claims retrieved next
- Layer C Reddit transcripts retrieved as "realism examples" only
- LLM synthesizes answer with citations distinguishing the three:
  - "Per 9 FAM 302.1: [official]"
  - "Immigration attorneys typically advise: [practitioner]"
  - "In Reddit transcripts from Mumbai consulate, applicants have reported being asked: [texture]"
- The visual treatment of these three is different in the UI (see §3)

**Done when:** She can ask 10 common questions and get answers where every claim has a typed citation (official | practitioner | reddit).

---

### Phase 4 — Interview Simulator
**Goal:** Live mock interview with mid-interview adaptation.

**Behavior:**
- App selects a Reddit transcript matching her profile as a *scenario inspiration* (not a script)
- LLM plays consular officer at her chosen consulate
- Question generation conditioned on: profile + Layer C transcripts from same consulate + prior turns in session
- Tone matches real interviews: terse, time-pressured, slightly skeptical
- 90 sec to 4 min total session
- Ends with simulated outcome: "approved" / "refused 214(b)" / "221(g) processing"

**Critique phase (post-session):**
- Per-turn breakdown with grounded citations
- Authority hierarchy in critique:
  - Issues flagged based on **Layer A principles** are marked as "rule-based" (high confidence)
  - Issues flagged based on **Layer B practitioner advice** are marked as "best-practice" (medium confidence)
  - Reddit transcripts NEVER drive critique — only used as alternative-answer examples
- Stronger version offered as verbatim alternative she could say
- Scores: 5 dimensions, 1-5 each

**Done when:** Full mock end-to-end, critique cites ≥1 official principle and ≥2 practitioner sources per session.

---

### Phase 4.1 — Prior Refusal Drill (NEW, only built if applicant has a prior refusal)
**Goal:** A dedicated practice mode for "the question" — the inevitable opening probe about the prior refusal.

**Why this exists separately:** Standard simulator sessions will sometimes include the refusal question, but for a previously-refused applicant, *every* real interview will start with or quickly pivot to it. She needs to nail this one question cold. A dedicated drill mode lets her practice just this exchange 10-20 times until the answer is fluent, not rehearsed-sounding.

**Behavior:**
- A focused mini-session: just 2-4 exchanges
- Officer opens with one of several realistic phrasings:
  - "I see you were refused before. What's different now?"
  - "You applied last year and were denied. Why should I approve you today?"
  - "What has changed since [date of prior refusal]?"
  - "Last time you were refused for insufficient ties. What ties do you have now that you didn't before?"
- App randomizes which phrasing she gets, so she can't memorize one specific answer
- Officer may follow up with a probe: "That's not really new, is it?" or "How is that different from what you said last time?"
- Critique focuses narrowly on: did the answer reference specific new facts? Was it concise (officers want <30 sec)? Did it avoid sounding rehearsed?

**Output beyond critique:** Save her best 2-3 answers from this drill to a "verbatim answers I can use" section in the day-before mode.

**Done when:** She's run the drill ≥5 times and at least one critique scores ≥4/5 on specificity.

---

### Phase 5 — Session History + Tracking
**Goal:** See past sessions, track improvement.

Unchanged from v1. Cut-line phase if timeline slips.

---

### Phase 6 — Day-Before Mode
**Goal:** Calm, focused interface for the night before.

Unchanged from v1. Critical to ship; this is the highest-value phase emotionally.

---

### Build Sequence Summary

| Week | Build | Cumulative state |
|---|---|---|
| 1 | Phase 1 pipeline (scrapers, extractors) | Layer A + Layer B scraped |
| 2 | Phase 1 finish (Reddit scrape + synthesis pipeline) + Phase 2 form | Corpus complete, profile captured |
| 3 | Phase 3 Q&A coach + **Phase 0.5 round 1** | Q&A tested across 5 profiles, fixed if needed |
| 4 | Phase 4 simulator + critique + **Phase 0.5 round 2** | Full mock loop tested adversarially |
| 5 | Phase 5 + Phase 6 + polish | Ready for interview |
| 6 | Buffer (non-negotiable) | Bug fixes, day-before tested |

**Risk:** Phase 1 is now 2 weeks not 1. If scraping hits rate limits or sites block, Phase 1 can slip another 3-5 days. Build contingency: if Phase 1 isn't done by end of Week 2, drop Layer B entirely (skip lawyer scraping) and proceed with Layer A + Layer C only. Don't let Phase 1 eat the whole timeline.

**Phase 0.5 timing:** Round 1 should take ~2 hours during Week 3. Round 2 should take ~3 hours during Week 4 (includes simulator + critique testing, which is more involved than Q&A testing). If either round surfaces a P0 failure, allow up to a full day in the buffer week for fixes.

---

## 2. Data Structures

Supabase project + YAML corpus files in repo. Four DB tables, three corpus files.

### 2.1 Corpus files (in repo, not DB)

**`corpus/official.yaml`**
```yaml
- id: off_001
  source: 9_fam_302_1
  source_url: https://fam.state.gov/fam/09FAM/09FAM030201.html
  section: "(b)(1)"
  paragraph_anchor: "p_42"
  text: "An applicant for a nonimmigrant visa is presumed to be an intending immigrant..."
  retrieved_at: 2026-05-22
```

**`corpus/practitioner.yaml`**
```yaml
- id: prac_001
  source_site: murthy.com
  source_url: https://www.murthy.com/...
  article_title: "Common B1/B2 Interview Questions"
  claim: "Applicants visiting US-based partners should clearly establish the relationship timeline and have evidence of communication."
  supporting_quote: "We advise clients with US-based partners to bring..."
  extracted_at: 2026-05-22
  validation_status: passed | failed
```

**`corpus/reddit.yaml`**
```yaml
- id: rdt_0001
  source_url: https://reddit.com/r/USTravelVisa/...
  date_posted: 2025-08-14
  consulate: mumbai
  applicant_profile:
    age_band: 26-30
    profession: doctor
    marital_status: single
    prior_us_travel: none
    purpose: visit_partner
  outcome: approved  # or unknown if not extractable
  qa_sequence:
    - q: "What is the purpose of your visit?"
      a: "Visiting my fiancé in Boston."
  quality_flag: full_transcript | texture_only
  extracted_at: 2026-05-22
```

**`corpus/principles.yaml`** (the synthesized file — see §1.1)
```yaml
- id: prin_001
  principle: "An applicant must overcome the presumption of immigrant intent with specific, verifiable evidence of ties to home country."
  source_layer: official  # official | practitioner
  source_ids: [off_001, off_003, prac_012]
  validation_status: passed
  confidence: high | medium
  applies_to_categories: [ties_to_home, purpose_of_visit]
```

### 2.2 DB tables

`profile` (one row), `sessions`, `session_turns`, `critiques` — unchanged from v1.

```sql
create table profile (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  age int,
  profession text,
  profession_detail text,
  city text,
  marital_status text,
  prior_us_visa_history jsonb,
  prior_international_travel jsonb,
  trip_purpose text,
  partner_us_status text,
  planned_duration_days int,
  planned_cities text[],
  who_pays text,
  ties_to_india jsonb,
  consulate text,
  interview_date date,
  english_pref text,
  tough_mode boolean default false,
  -- Prior refusal fields (nullable; populated only if applicant was previously refused)
  has_prior_refusal boolean default false,
  refusal_date date,
  refusal_consulate text,
  refusal_ground text,  -- '214b_ties' | '214b_intent' | '221g_then_refused' | 'other'
  refusal_reason_stated text,
  refusal_attempt_number int,
  refusal_narrative text,  -- freeform, no length limit, fed to every prompt
  what_has_changed_since text,  -- freeform
  applicant_self_diagnosis text,  -- freeform
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  ended_at timestamptz,
  mode text,
  scenario_transcript_id text,
  difficulty text,
  turns jsonb,
  outcome_in_sim text,
  critique jsonb,
  scores jsonb
);
```

### 2.3 Vector store

pgvector on Supabase. Embed:
- Each `principles.yaml` entry's `principle` field (high priority retrieval)
- Each `practitioner.yaml` entry's `claim` field
- Each `reddit.yaml` entry's `qa_sequence` joined (lower priority retrieval)

At retrieval time, weight scores by layer: `official > practitioner > reddit`. Don't let a high-similarity Reddit hit drown out a slightly-less-similar official principle.

---

## 3. UI Design Language

Three rules, plus a new fourth specifically for showing layered authority.

### Rule 1: Two distinct modes, visually different
**Practice mode** (Phases 3, 4, 5) — slightly serious, tight typography, neutral palette, minimal animation.
**Day-before mode** (Phase 6) — calm, softer palette, more whitespace, no scoring visible.

### Rule 2: The officer interface is austere
Black-on-cream or charcoal-on-warm-white. Serif (Georgia/PT Serif) for officer text, sans (Inter) for her input. Officer questions appear with a half-second delay; no typing indicator. Countdown clock visible.

### Rule 3: Critique is structured, not conversational
Single sentence summary at top. Scores card (5 dimensions, bars not numbers). Per-turn cards with question | her answer | issue | stronger version | sources. Bottom: 2-3 things to practice next.

### Rule 4 (NEW): Citations show their authority layer

Every cited claim in the app gets a visual treatment that reflects which layer it came from:

- **Official sources** → small ⚖ icon, dark serif label "9 FAM 302.1 §(b)(1)" — link to source
- **Practitioner sources** → small 📋 icon, medium-weight sans label "Murthy Law Firm" — link
- **Reddit texture** → small 💬 icon, lightest weight label "Reddit, r/USTravelVisa, Mumbai 2025" — link

This is the user-facing version of the authority hierarchy. She should always know if she's reading a rule, an opinion, or just an example.

### Stack
- Next.js 14 (App Router)
- Supabase (Postgres + pgvector)
- Tailwind + shadcn/ui
- Anthropic API: Sonnet 4.5 for critique + synthesis, Haiku for live simulation turns and corpus extraction
- Web Speech API for voice if Phase 4.5 happens
- Scraper: Python + httpx + selectolax for HTML, PRAW for Reddit (or pay-as-you-go scraper if PRAW limits hit)

### Hidden test mode (for Phase 0.5)

The app needs a way to swap in test profiles without affecting the real profile. Implementation:
- A `?test=<profile_number>` URL parameter (1-5) that loads a pre-defined test profile from a `test-profiles.yaml` file in the repo
- Test mode sessions are stored in a separate `test_sessions` table (so they don't pollute her real session history)
- A subtle visual indicator in test mode (e.g., a small badge "TEST MODE: Profile #3 — High-Risk Applicant") so you don't forget you're testing
- Test mode is removable/disable-able for production via env var, but for a single-user app, leaving it in is fine

This is the only meta-feature in the app — it exists purely for Phase 0.5. Build it once during Week 3, use it twice, done.

---

## 4. Prompts

Three core prompts, all conditioned on profile. Now with explicit authority hierarchy.

### 4.1 Simulator turn prompt (Haiku, fast)

```
You are a US consular officer at the {consulate} consulate conducting a B1/B2 visa interview.

Applicant profile:
{profile_json}

{if profile.has_prior_refusal:}
IMPORTANT — APPLICANT HAS A PRIOR REFUSAL:
- Date of prior refusal: {refusal_date} at {refusal_consulate}
- Ground: {refusal_ground}
- What the officer said: "{refusal_reason_stated}"
- Applicant's own account of what happened: "{refusal_narrative}"
- What the applicant says has changed since: "{what_has_changed_since}"

As the officer, you can see this refusal in your system. You SHOULD:
- Open with or pivot quickly to asking about the prior refusal
- Probe specifically on what has changed since
- Be more skeptical than you would be with a first-time applicant
- Test whether her explanation of "what has changed" is substantive or vague
- If she gives the same kind of answer that got her refused before, do not approve
{/if}

Conversation so far:
{turns}

Realistic question patterns from this consulate (use for phrasing/style only, NOT for evaluation):
{retrieved_reddit_transcripts}

Ask the next question. Rules:
- One question at a time. No preamble.
- Be terse. Real officers don't make small talk.
- Adapt based on her previous answers.
- After 4-8 questions, end with: "Your visa is approved" OR "I cannot approve your visa today under section 214(b)" OR "I need additional documents."
- {if tough_mode OR has_prior_refusal: "Be skeptical. Push on weak answers. Demand specifics."}
- {else: "Be neutral."}

Output ONLY the officer's next line. No JSON, no markdown.
```

### 4.2 Critique prompt (Sonnet 4.5, careful)

```
You are a visa interview coach analyzing a completed mock interview.

Applicant profile:
{profile_json}

{if profile.has_prior_refusal:}
CRITICAL CONTEXT — APPLICANT HAS A PRIOR REFUSAL:
- The bar for this applicant is higher. She must demonstrate either changed circumstances or stronger evidence than she presented before.
- Refusal narrative: "{refusal_narrative}"
- Her own diagnosis of what went wrong: "{applicant_self_diagnosis}"
- What she says has changed: "{what_has_changed_since}"

In your critique, you MUST:
- Evaluate whether her answers in this mock interview would have addressed the original refusal ground
- Flag if she gave answers similar to what (by her account) failed last time
- Assess whether "what has changed" came through clearly in her answers when relevant
- Be particularly hard on vague answers about ties — that's what got her refused before
{/if}

Full interview transcript:
{turns}

AUTHORITATIVE PRINCIPLES (these are the basis for evaluation):
{retrieved_principles_from_official_and_practitioner_layers}

REDDIT TRANSCRIPTS (these are alternative-answer examples ONLY — never the basis for evaluation):
{retrieved_reddit}

Produce a structured critique as JSON matching this schema:
{schema}

HARD RULES:
- Every "issue" MUST cite a principle_id from the authoritative principles list. No principle citation = drop the issue.
- "Stronger version" must be a sentence she could verbatim say.
- If a Reddit transcript suggests a stronger answer pattern, use it ONLY as an example, never as the reason something is wrong.
- Scores: be honest. Do not inflate.
- "Estimated outcome": show 3 Reddit transcripts of similar applicants with similar answer patterns and their outcomes. Do NOT make a probabilistic prediction yourself.
- {if has_prior_refusal: "Include a dedicated 'prior_refusal_addressed' field in the output: did her answers demonstrate the change she claims? Score 1-5."}
```

### 4.3 Q&A prompt (Sonnet 4.5)

```
You are a B1/B2 visa interview coach answering a question from {name}.

Her question: {question}
Her profile: {profile_json}

AUTHORITATIVE sources (cite these first):
{retrieved_official_and_practitioner}

REDDIT examples (use for texture, mark clearly):
{retrieved_reddit}

Answer in 4-7 sentences. Rules:
- Lead with official/practitioner-based content.
- Mark Reddit-sourced examples explicitly: "In Reddit reports from X consulate..."
- If the authoritative sources don't address her question, say so directly. Do not fabricate.
- End with: "Authoritative sources: [official/practitioner IDs]. Realism examples: [reddit IDs]"
```

### 4.4 (NEW) Principles synthesis prompt (Sonnet 4.5, one-time pipeline)

```
You are synthesizing a principles file for a B1/B2 visa interview coach from scraped source material.

OFFICIAL SOURCES:
{official_corpus}

PRACTITIONER ARTICLES:
{practitioner_corpus}

Produce candidate principles as JSON array. Each principle must:
- Be a single declarative statement about how consular officers evaluate B1/B2 applicants
- Cite specific source_ids that support it (verbatim quotes will be checked downstream)
- Be marked official or practitioner based on strongest supporting source

Schema:
[
  {
    "principle": "...",
    "source_ids": ["off_001", "prac_012"],
    "supporting_quotes": ["verbatim quote from source 1", "verbatim quote from source 2"],
    "source_layer": "official",
    "applies_to_categories": ["ties_to_home", "purpose_of_visit"]
  }
]

Rules:
- Do NOT generate principles you cannot directly support with a verbatim quote from the listed sources.
- If you are unsure whether a source supports a principle, omit it.
- Prefer fewer, well-grounded principles over many vague ones.
```

After this generates, the validation step (§1.1) programmatically checks that each `supporting_quote` actually appears in the cited source. Mismatches = principle dropped.

---

## 5. Cross-Check: Do the Phases Ladder Up?

| Thesis | Phase 0.5 | Phase 1 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|
| Coaching is grounded in real sources | ✅ hallucination check | ✅ three-layer corpus | ✅ citations typed by layer | ✅ critique requires principle cite | ✅ scores reference patterns |
| Personalized to her profile | ✅ profile-awareness test | ⚠ depends on extraction quality | ✅ retrieval filtered | ✅ scenarios matched | ✅ weak areas tracked |
| Reduces anxiety, doesn't add | ✅ calibration test | n/a | ⚠ depends on tone | ⚠ tough mode opt-in | ⚠ scores could discourage |
| Authority is honest about uncertainty | ✅ uncertainty test | ✅ layer system | ✅ UI shows layer | ✅ Reddit excluded from evaluation | n/a |
| She'll use it 5+ times | n/a | n/a | n/a | ✅ short sessions | ✅ tracked progress |

**New yellow flag:** "depends on extraction quality" in Phase 1. The auto-tagging on 1,500 Reddit posts will have ~30% noise. Mitigation: built into the design — Reddit posts aren't used for evaluation, only texture, so tag noise doesn't compound into wrong coaching. Phase 0.5 catches whether this mitigation actually works in practice.

---

## 6. What This Plan Excludes

- Multi-user, auth, payments
- DS-160 photo OCR
- Manual transcript curation (this is the v2 change)
- Voice in v1 (Phase 4.5 stretch)
- Analytics dashboards
- Hindi/English mid-session switching
- Aggregate Reddit statistics ("X% of applicants who said Y were approved") — explicitly excluded because the data doesn't support it

---

## 7. Open Questions

1. **Reddit scraping mechanics:** PRAW has rate limits and Reddit's API pricing changed in 2023. Pushshift is gone. Realistic options: PRAW with patient backoff (slow but free), or pay for Apify/scraper-as-a-service ($10-30 for 2000 posts). Recommendation: PRAW with backoff; budget 2-3 days for the scrape to complete.

2. **Lawyer site scraping ethics/legality:** Most lawyer blog content is publicly indexed; scraping for personal use is fine. Don't redistribute. If you ever make this multi-user, revisit.

3. **What if validation drops too many principles?** If after pipeline runs you have <15 validated principles, the critique prompt won't have enough to work with. Fallback: loosen the validation threshold (cosine 0.6 instead of 0.7), or accept up to 5 hand-typed principles you write yourself in the principles.yaml. This is the only place manual input might re-enter — and only if the pipeline underperforms.

4. **API cost ceiling:** Worst case spend across the whole project (corpus extraction + synthesis + her usage for 5 weeks): probably $20-50 in Anthropic API costs. Negligible.

5. **What if she only uses it once?** Then the app failed. Build Phase 6 (day-before mode) well enough that even one-time use is valuable.

---

## 8. Definition of Done

**Quality (must pass before Garvita sees the app):**
- Phase 0.5 round 1 completed; Q&A coach averages ≥3.5 across all 5 dimensions for all 5 test profiles
- Phase 0.5 round 2 completed; simulator + critique averages ≥3.5 across all 5 dimensions for all 5 test profiles
- Zero P0 failures on hallucination check or honesty about uncertainty
- Corpus pipeline runs end-to-end and produces all four YAML files automatically
- Principles file has ≥15 validated principles

**Usage (proxies for whether the app helped):**
- She has used simulator ≥10 times before her interview
- She has used Q&A ≥20 times
- Last 3 sessions scored higher than first 3
- Day-before mode worked the night before

**Truth (the only honest measure):**
- After the interview, she can name one specific feature that helped

Quality checkpoints prevent the wrong kind of failure (the app confidently misleads her). Usage checkpoints prevent the boring kind of failure (she never opened it). The last bullet is the only one that actually measures whether the app worked. Everything else is a proxy.
