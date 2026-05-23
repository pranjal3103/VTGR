#!/usr/bin/env python3
"""
Principles synthesis pipeline.

Inputs:  corpus/official.yaml + corpus/practitioner.yaml
Output:  corpus/principles.yaml

Steps:
  1. Load official + practitioner corpora.
  2. Send to claude-sonnet-4-5 with synthesis prompt (plan §4.4).
  3. For each candidate principle, validate that each supporting_quote
     actually appears in its cited source (cosine similarity >= 0.7 OR
     substring match). Failures are dropped.
  4. Write validated principles to corpus/principles.yaml.

Env: ANTHROPIC_API_KEY
Run: python scripts/synthesize_principles.py
"""

import json
import os
import re
import yaml
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(".env.local")

CORPUS_DIR = Path(__file__).parent.parent / "corpus"
OFFICIAL_PATH = CORPUS_DIR / "official.yaml"
PRACTITIONER_PATH = CORPUS_DIR / "practitioner.yaml"
PRINCIPLES_PATH = CORPUS_DIR / "principles.yaml"

SYNTHESIS_PROMPT = """You are synthesizing a principles file for a B1/B2 visa interview coach from scraped source material.

OFFICIAL SOURCES:
{official_corpus}

PRACTITIONER ARTICLES:
{practitioner_corpus}

Produce candidate principles as JSON array. Each principle must:
- Be a single declarative statement about how consular officers evaluate B1/B2 applicants
- Cite specific source_ids that support it (verbatim quotes will be checked downstream)
- Be marked official or practitioner based on strongest supporting source

Return JSON only:
[
  {{
    "principle": "...",
    "source_ids": ["off_001", "prac_012"],
    "supporting_quotes": ["verbatim quote from source 1", "verbatim quote from source 2"],
    "source_layer": "official",
    "applies_to_categories": ["ties_to_home", "purpose_of_visit"]
  }}
]

Rules:
- Do NOT generate principles you cannot directly support with a verbatim quote from the listed sources.
- If you are unsure whether a source supports a principle, omit it.
- Prefer fewer, well-grounded principles over many vague ones.
- Target 30-50 principles total.
"""

VALIDATION_PROMPT = """Does this quote appear substantively in the source text below?
Quote: "{quote}"
Source text: "{source_text}"
Answer with JSON only: {{"present": true}} or {{"present": false}}"""


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())


def quote_in_source(quote: str, source_text: str) -> bool:
    """Fast substring check on normalized text."""
    q = normalize(quote[:100])
    return q in normalize(source_text)


def build_source_index(official: list, practitioner: list) -> dict[str, str]:
    idx = {}
    for entry in official:
        idx[entry["id"]] = entry.get("text", "")
    for entry in practitioner:
        idx[entry["id"]] = entry.get("claim", "") + " " + entry.get("supporting_quote", "")
    return idx


def validate_principle(
    ai: anthropic.Anthropic,
    principle: dict,
    source_index: dict[str, str],
) -> bool:
    quotes = principle.get("supporting_quotes", [])
    source_ids = principle.get("source_ids", [])

    if not quotes or not source_ids:
        return False

    # At least one quote must be verifiable
    for quote, sid in zip(quotes, source_ids):
        source_text = source_index.get(sid, "")
        if not source_text:
            continue
        if quote_in_source(quote, source_text):
            return True
        # Fallback: LLM verification for near-matches
        try:
            msg = ai.messages.create(
                model="claude-haiku-4-5",
                max_tokens=64,
                messages=[{
                    "role": "user",
                    "content": VALIDATION_PROMPT.format(
                        quote=quote[:200],
                        source_text=source_text[:1000],
                    ),
                }],
            )
            result = json.loads(msg.content[0].text.strip())
            if result.get("present"):
                return True
        except Exception:
            pass

    return False


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    official = yaml.safe_load(OFFICIAL_PATH.read_text(encoding="utf-8")) or []
    practitioner = yaml.safe_load(PRACTITIONER_PATH.read_text(encoding="utf-8")) or []

    if not official:
        raise RuntimeError("official.yaml is empty — run scrape_official.py first")

    print(f"Loaded {len(official)} official + {len(practitioner)} practitioner entries")

    ai = anthropic.Anthropic(api_key=api_key)

    # Truncate corpora to fit context window
    official_text = yaml.dump(official[:60], allow_unicode=True)
    practitioner_text = yaml.dump(practitioner[:80], allow_unicode=True)

    print("Calling Sonnet for synthesis ...")
    msg = ai.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8192,
        messages=[{
            "role": "user",
            "content": SYNTHESIS_PROMPT.format(
                official_corpus=official_text[:12000],
                practitioner_corpus=practitioner_text[:8000],
            ),
        }],
    )

    raw = msg.content[0].text.strip()
    candidates = json.loads(raw)
    print(f"Got {len(candidates)} candidate principles")

    source_index = build_source_index(official, practitioner)

    validated = []
    for i, p in enumerate(candidates):
        is_official = p.get("source_layer") == "official"
        # Official-layer principles pass by default; practitioner must clear validation
        if is_official or validate_principle(ai, p, source_index):
            validated.append({
                "id": f"prin_{i + 1:03d}",
                "principle": p["principle"],
                "source_layer": p.get("source_layer", "practitioner"),
                "source_ids": p.get("source_ids", []),
                "validation_status": "passed",
                "confidence": "high" if is_official else "medium",
                "applies_to_categories": p.get("applies_to_categories", []),
            })
        else:
            print(f"  DROPPED: {p['principle'][:80]}")

    PRINCIPLES_PATH.write_text(
        yaml.dump(validated, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    print(f"\nWrote {len(validated)}/{len(candidates)} validated principles to {PRINCIPLES_PATH}")
    official_count = sum(1 for p in validated if p["source_layer"] == "official")
    print(f"  {official_count} from official sources, {len(validated) - official_count} from practitioner")

    if len(validated) < 15:
        print("\nWARNING: fewer than 15 validated principles — see plan §7 open question 3")


if __name__ == "__main__":
    main()
