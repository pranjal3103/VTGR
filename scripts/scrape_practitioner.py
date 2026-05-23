#!/usr/bin/env python3
"""
Layer B scraper — Immigration practitioner/lawyer sites.

Scrapes ~15 pre-defined sites, extracts structured claims per article
using claude-haiku-4-5. Each claim must survive a verbatim-quote
check before being written to the corpus.

Output: corpus/practitioner.yaml
Schema: visa-coach-plan.md §2.1

Run: python scripts/scrape_practitioner.py
Env: ANTHROPIC_API_KEY must be set (use .env.local or export)
"""

import asyncio
import io
import json
import os
import re
import sys
import yaml
from datetime import date
from pathlib import Path

import anthropic
import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

load_dotenv(".env.local")

CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "practitioner.yaml"

# Pre-defined target list — add/remove URLs here
TARGET_URLS = [
    # Immigration law firm guides
    "https://www.murthy.com/visitor/b-2-visa/",
    "https://manifestlaw.com/blog/b1-b2-tourist-visa-interview-questions/",

    # Nolo legal encyclopedia (verified URLs)
    "https://www.nolo.com/legal-encyclopedia/how-to-increase-your-chances-of-getting-a-u-s-visitor-visa.html",
    "https://www.nolo.com/legal-encyclopedia/application-process-b-1-b-2-visitor-visa.html",
    "https://www.nolo.com/legal-encyclopedia/a-b-2-visa-visiting-the-us-tourist-do-you-qualify.html",
    "https://www.nolo.com/legal-encyclopedia/why-was-my-u-s-visitor-visa-renewal-denied.html",
    "https://www.nolo.com/legal-encyclopedia/my-us-tourist-visa-refused-what-can-i.html",
    "https://www.nolo.com/legal-encyclopedia/a-b-1-visa-business-visits-the-us-do-you-qualify.html",

    # Boundless immigration resources (verified URLs)
    "https://www.boundless.com/immigration-resources/b-1-b-2-visa-sample-interview-questions",
    "https://www.boundless.com/immigration-resources/preparing-for-travel-visa-interview",

    # ImmiHelp experiences (verified URLs)
    "https://www.immihelp.com/visitor-visa-b2-experiences/",
    "https://www.immihelp.com/experience/119685-coolpact-B2-Visa-Interview-Questions.html",

    # RedBus2US stamping experience threads (verified URLs)
    "https://redbus2us.com/visas/usa/stamping-experiences/b1-b2-visitor-visa-experiences-january-1st-2024-onwards/",
    "https://redbus2us.com/visas/usa/stamping-experiences/b1-b2-visitor-visa-experiences-march-15th-2023-onwards/",
    "https://redbus2us.com/us-visitor-visa-b2-parents-process-documents/",
]

EXTRACT_PROMPT = """You are extracting structured visa-related claims from an immigration attorney article.

Article URL: {url}
Article text:
{text}

Extract every factual claim about B1/B2 visa interviews, consular evaluation, or what officers look for.
For each claim, find the verbatim supporting quote from the article text above.

Return JSON array only, no explanation:
[
  {{
    "claim": "one sentence factual claim",
    "supporting_quote": "exact verbatim quote from the article that supports this claim",
    "article_title": "title of the article"
  }}
]

Rules:
- Only extract claims directly supported by verbatim text in the article.
- Do NOT generate claims not in the source.
- If no claims found, return [].
"""


def quote_present(text: str, quote: str) -> bool:
    """Check that the extracted quote actually appears in source text (normalized)."""
    def normalize(s: str) -> str:
        return re.sub(r"\s+", " ", s.lower().strip())
    return normalize(quote[:80]) in normalize(text)


async def fetch_article(client: httpx.AsyncClient, url: str) -> tuple[str, str]:
    resp = await client.get(url, follow_redirects=True, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup.select("script, style, nav, footer, header"):
        tag.decompose()
    body = soup.body
    return body.get_text(strip=True) if body else "", resp.text


async def extract_claims(ai: anthropic.Anthropic, url: str, text: str) -> list[dict]:
    if len(text) < 200:
        print(f"  Skipping {url}: fetched text too short ({len(text)} chars) — likely JS-rendered")
        return []

    msg = ai.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": EXTRACT_PROMPT.format(url=url, text=text[:8000])}],
    )
    raw = msg.content[0].text.strip()
    # strip markdown code fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        raw = raw.strip()
    try:
        candidates = json.loads(raw)
    except json.JSONDecodeError:
        print(f"  JSON parse error for {url} — LLM returned: {raw[:120]!r}")
        return []
    return candidates


async def process_url(client: httpx.AsyncClient, ai: anthropic.Anthropic, url: str, idx: int) -> list[dict]:
    print(f"  Fetching {url} ...")
    try:
        text, _ = await fetch_article(client, url)
    except Exception as e:
        print(f"    ERROR fetching: {e}")
        return []

    candidates = await extract_claims(ai, url, text)
    results = []
    for i, c in enumerate(candidates):
        quote = c.get("supporting_quote", "")
        valid = quote_present(text, quote)
        results.append({
            "id": f"prac_{idx:03d}_{i:02d}",
            "source_site": url.split("/")[2],
            "source_url": url,
            "article_title": c.get("article_title", ""),
            "claim": c.get("claim", ""),
            "supporting_quote": quote,
            "extracted_at": str(date.today()),
            "validation_status": "passed" if valid else "failed",
        })
    passed = sum(1 for r in results if r["validation_status"] == "passed")
    print(f"    -> {len(candidates)} candidates, {passed} passed validation")
    return results


async def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    ai = anthropic.Anthropic(api_key=api_key)
    all_results = []

    async with httpx.AsyncClient(headers={"User-Agent": "VisaCoach/1.0 (personal research)"}) as client:
        for idx, url in enumerate(TARGET_URLS, 1):
            entries = await process_url(client, ai, url, idx)
            all_results.extend(entries)
            await asyncio.sleep(2)  # polite crawl rate

    CORPUS_PATH.write_text(yaml.dump(all_results, allow_unicode=True, sort_keys=False), encoding="utf-8")
    passed_total = sum(1 for r in all_results if r["validation_status"] == "passed")
    print(f"\nWrote {len(all_results)} entries ({passed_total} passed) to {CORPUS_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
