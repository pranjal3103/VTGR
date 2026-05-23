# Visa Coach — Project Instructions

## What we're building

A personal B1/B2 visa interview coach for one user (Garvita). Two capabilities:
1. **Simulate** real consular interviews using profile-conditioned LLM prompts grounded in a scraped corpus.
2. **Answer** her questions about the process, with every claim cited to a real source.

**This is a single-user app. The only user is Garvita. Pranjal builds and maintains it.**

The full planning document is `visa-coach-plan.md` in this repo. Read it first if you haven't. This file is the build contract.

---

## Stack (non-negotiable — do not substitute)

- **Framework:** Next.js 14+ with App Router, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Animations:** Framer Motion (sparingly — subtle only; this is not a marketing site)
- **Database:** Supabase (Postgres + pgvector). Use the Supabase JS client.
- **Auth:** Supabase Auth with magic-link, single user. No signup flow — Pranjal creates Garvita's account in the dashboard.
- **AI:** Anthropic API (`@anthropic-ai/sdk`).
  - `claude-haiku-4-5` for: simulator turn generation (latency matters mid-interview), corpus extraction during scraping
  - `claude-sonnet-4-5` for: critique generation, Q&A synthesis, principles synthesis
- **Scraper:** Python 3.11+ in `/scripts` directory. Uses `httpx`, `selectolax`, `PRAW` for Reddit, `pyyaml`. Run manually, not part of the Next.js app.
- **Hosting:** Vercel (deploy from GitHub on push to main)
- **Source control:** GitHub

Total cost target: under $50 across the entire build, dominated by Anthropic API usage during corpus extraction.

---

## Data model

Four corpus files in `/corpus` (versioned in git, never edited by the app at runtime):

- `corpus/official.yaml` — scraped from State Dept (9 FAM 302.1, INA 214(b), refusal rate tables, reciprocity schedule)
- `corpus/practitioner.yaml` — scraped from ~15 immigration lawyer sites, claims extracted by LLM
- `corpus/reddit.yaml` — scraped from r/USTravelVisa, r/visas, r/immigration, r/india, r/indiansabroad
- `corpus/principles.yaml` — LLM-synthesized from official + practitioner, validated programmatically

Schemas for each are in `visa-coach-plan.md` §2.1. Follow them exactly.

Four Postgres tables (schemas in plan §2.2):

- `profile` (one row, the user)
- `sessions` (each mock interview or Q&A conversation)
- `session_turns` (individual turn data within a session)
- `test_sessions` (Phase 0.5 testing — kept separate so it doesn't pollute real history)

pgvector setup: embed `principle` field of principles.yaml, `claim` field of practitioner.yaml, joined `qa_sequence` of reddit.yaml. Retrieval is weighted by layer: official > practitioner > reddit. Never let a high-similarity Reddit hit drown out a slightly-less-similar official principle.

---

## Build phases (in order)

Read the full phase descriptions in `visa-coach-plan.md` §1. Summary:

| Phase | Deliverable | Notes |
|---|---|---|
| 0.5 | Adversarial quality check with 5 test profiles | Run after Phase 3 and again after Phase 4. Hard stop: do not let Garvita see the app until this passes. |
| 1 | Three scraping pipelines + principles synthesis with validation gate | 4-6 days. Hardest phase. |
| 2 | 15-field profile intake form + prior-refusal narrative section (conditional) | Half a day for base form, +half day for refusal section. |
| 3 | Q&A coach with layered-citation responses | 2-3 days. |
| 4 | Interview simulator + post-session critique | 4-5 days. |
| 4.1 | Prior-refusal drill mode (only built if applicant has prior refusal) | 1 day. Critical for second-time applicants. |
| 5 | Session history + improvement tracking | Cuttable if timeline slips. |
| 6 | Day-before mode (calm UI variant) | Critical. Must ship. Should surface saved "best answers" from Phase 4.1 if present. |

**Build sequence with quality gates:**

- Week 1: Phase 1 (Layer A + B scraping pipelines)
- Week 2: Phase 1 finish (Reddit + synthesis) + Phase 2 form
- Week 3: Phase 3 Q&A + **Phase 0.5 round 1** (P0 stop)
- Week 4: Phase 4 simulator + critique + **Phase 0.5 round 2** (P0 stop)
- Week 5: Phase 5 + Phase 6 + polish
- Week 6: Buffer (non-negotiable)

**Phase 1 contingency:** if scraping isn't done by end of Week 2, drop Layer B (skip lawyer scraping), proceed with Layer A + Layer C only. Don't let Phase 1 eat the whole timeline.

---

## Phase 0.5 — what you (Claude Code) need to build

This is the easiest-to-forget part of the plan. Build it during Week 3.

- `test-profiles.yaml` in repo root with 5 profiles (definitions in plan §0.5, Phase 0.5 section)
- `?test=<1-5>` URL parameter that loads the corresponding test profile instead of Garvita's
- Test mode sessions stored in `test_sessions` table, not `sessions`
- Visible badge in test mode: "TEST MODE: Profile #N — <description>"
- Test mode is on a separate route prefix (`/test/*`) so it can't be accidentally hit

The rubric Pranjal scores against (5 dimensions, 1-5 each):
- Hallucination check
- Calibration
- Profile awareness
- Authority hierarchy
- Honesty about uncertainty

Hard stop: average <3.5 on any dimension, or any P0 failure on hallucination/uncertainty, means do not ship to Garvita.

---

## Prompt engineering rules

All three core prompts are in plan §4. Hard rules that apply everywhere:

1. **Every prompt receives the user profile as JSON.** No prompt is profile-agnostic.
2. **Authority hierarchy is enforced in the prompt itself**, not just in retrieval. The critique prompt explicitly forbids using Reddit as the basis for evaluation, only as alternative-answer examples.
3. **Every claim in the critique must cite a `principle_id`** from the principles file. If the LLM can't produce a cite, drop the claim. This is enforced via the output schema.
4. **No probabilistic outcome prediction.** The LLM does not say "you have 73% chance of approval." It shows 3 real transcripts of similar applicants and their outcomes.
5. **"Do not fabricate" is in every prompt.** When sources don't address something, say so. Do not invent.
6. **Prior refusal handling is non-optional.** If `profile.has_prior_refusal == true`, every prompt (simulator, critique, Q&A) must include the refusal context block. The freeform fields (`refusal_narrative`, `what_has_changed_since`, `applicant_self_diagnosis`) are injected verbatim into prompts. Tough mode is forced ON. See plan §4.1 and §4.2 for exact prompt structures.

---

## Design principles

Three rules govern all UI. Full version in plan §3.

1. **Two distinct visual modes.** Practice mode (serious, neutral palette, tight typography) vs Day-before mode (calm, softer palette, more whitespace, no scoring visible). She should know within half a second which mode she's in.

2. **The officer interface is austere.** Charcoal on warm white. Serif (Georgia or PT Serif) for officer text, sans (Inter) for her input. Half-second delay on officer questions; no typing indicator. Countdown timer visible.

3. **Critique is structured, not conversational.** Single summary sentence. Scores card with bars (5 dimensions). Per-turn cards. Three "things to practice next."

4. **Citations show their authority layer visually.** Three distinct visual treatments for official / practitioner / Reddit citations (icons + typography weight + label format). Spec in plan §3 Rule 4.

**Palette / fonts:**
- Background: warm white (#FAF7F2) in practice mode, softer cream (#F5F0E6) in day-before mode
- Text: charcoal #2A2A2A
- Accent: deep oxblood (#7A1F1F) — used only for warnings/critique flags, never decoratively
- Officer text: PT Serif
- Body / form text: Inter
- Citation labels: small caps, Inter, tracking-wider

Do NOT use bright colors. Do NOT use emojis except the three citation icons (⚖, 📋, 💬). Do NOT add cute animations.

---

## Engineering principles

- **Server components by default.** Client components only for forms, simulator turn UI, and anything with state.
- **Streaming responses for simulator turns.** Use Anthropic SDK's streaming. Officer text appears word-by-word.
- **Critique runs asynchronously after session ends.** Don't make her wait synchronously. Show "Generating critique..." with a spinner; result appears when ready.
- **All LLM calls happen in route handlers (`/app/api/...`).** Never call Anthropic from the client. API key never leaves server.
- **All YAML corpus files load once at startup** into memory + pgvector. Don't re-read from disk on every request.
- **Test mode is gated by env var** `ENABLE_TEST_MODE=true`. Default off in production builds (though for single-user app, leaving on is fine).
- **No analytics, no tracking, no telemetry.** This is a personal app for someone in a vulnerable moment. Nothing leaves the user's device except API calls to Anthropic.

---

## Working agreement with Pranjal

- **Pranjal is technical** (CS undergrad, MBA, built apps before). Explain your reasoning briefly but don't over-handhold.
- **He uses Windows + PowerShell.** When giving terminal commands, use PowerShell syntax (`$env:VARNAME`, not `%VARNAME%`).
- **He prefers direct feedback.** If something he asks for is a bad idea, say so in the first sentence with reasoning. Don't pad with affirmations.
- **He'll ask for a specific phase.** Stick to it. Don't scope-creep into the next phase without confirming.
- **End each session with:**
  1. Commit progress with a clear message
  2. Update this CLAUDE.md if any decisions changed
  3. Provide a 3-sentence handoff summary: what shipped this session, what's blocked (if anything), what's the next concrete step
- **Resume sessions** by reading CLAUDE.md + checking `git log --oneline -20` to reconstruct state.

---

## Non-goals (do not build these)

- Multi-user support, signup, payments, billing
- DS-160 photo OCR (form intake only)
- Manual transcript curation (corpus is fully automated)
- Voice input/output in v1 (Web Speech API can be added as Phase 4.5 only if Phase 4 ships early)
- Analytics dashboards (it's one person; no cohort views)
- Hindi/English mid-session switching (pick one per session)
- Aggregate Reddit statistics ("X% of applicants who said Y were approved") — explicitly forbidden in UI because data doesn't support it
- Mobile-native app (responsive web is enough)
- Notifications / reminders (she'll remember her interview)
- Sharing features (this is private; sharing is a v2 multi-user problem)

---

## API cost management

Estimated full-project cost: $20-50. Budget breakdown:

- Corpus extraction (Phase 1): ~$2-5 for Haiku to process 1,500-2,000 Reddit posts + 100-200 lawyer articles
- Principles synthesis (Phase 1): ~$1-2 for Sonnet 4.5 one-time
- Garvita's usage (Phases 3+4 over 5 weeks): ~$10-15 assuming heavy daily use
- Phase 0.5 testing (Pranjal's adversarial sessions): ~$5-10
- Buffer for retries and reruns: ~$10

If costs balloon past $75, something is wrong (probably an infinite loop or re-extracting the corpus). Stop and debug.

---

## Definition of done (full version in plan §8)

**Quality (must pass before Garvita sees the app):**
- Phase 0.5 round 1 + round 2 both completed; average ≥3.5 across all dimensions for all test profiles
- Zero P0 failures on hallucination check or honesty about uncertainty
- Corpus pipeline produces all four YAML files automatically
- Principles file has ≥15 validated principles

**Usage:**
- Garvita uses simulator ≥10 times before her interview
- She uses Q&A ≥20 times
- Last 3 sessions score higher than first 3
- Day-before mode worked the night before

**Truth (the only honest measure):**
- After the interview, she can name one specific feature that helped
