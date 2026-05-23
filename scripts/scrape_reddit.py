#!/usr/bin/env python3
"""
Layer C scraper — Reddit transcripts.

Subreddits: r/TravelVisa, r/visas, r/immigration, r/india, r/indiansabroad
Filters: B1/B2 keywords + India consulate keywords + last 24 months
Target: 1,500-2,500 posts

Uses Reddit's public JSON API — no OAuth or PRAW needed.

For each post, claude-haiku-4-5-20251001 extracts:
  - consulate
  - applicant archetype (age band, profession, marital status, prior travel)
  - Q&A pairs (if present)
  - stated outcome

Posts where <3 Q&A pairs are extractable get quality_flag: texture_only.

Output: corpus/reddit.yaml
Schema: visa-coach-plan.md §2.1

Run: python scripts/scrape_reddit.py
Env: ANTHROPIC_API_KEY
"""

import io
import json
import os
import sys
import time
import yaml
from datetime import date, datetime, timedelta
from pathlib import Path

import anthropic
import httpx
from dotenv import load_dotenv

# Force UTF-8 stdout so non-ASCII post titles don't crash on Windows cp1252
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

load_dotenv(".env.local")

CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "reddit.yaml"

# r/USTravelVisa was banned — r/TravelVisa is the successor
SUBREDDITS = ["TravelVisa", "visas", "immigration", "india", "indiansabroad"]

HEADERS = {"User-Agent": "visa-sensei-scraper/1.0 (personal research tool)"}

B1B2_KEYWORDS = [
    "b1", "b2", "b1/b2", "visitor visa", "tourist visa", "b-1", "b-2",
    "214b", "214(b)", "consular interview", "visa interview",
]

INDIA_KEYWORDS = [
    "india", "indian", "mumbai", "delhi", "chennai", "hyderabad",
    "kolkata", "bangalore", "ahmedabad", "consulate india",
]

EXTRACT_PROMPT = """Extract structured information from this Reddit post about a US B1/B2 visa interview.

Post URL: {url}
Post title: {title}
Post text: {text}
Comments (top 3): {comments}

Return JSON only, no explanation:
{{
  "consulate": "city name or unknown",
  "applicant_profile": {{
    "age_band": "18-25|26-30|31-35|36-45|46-55|56+|unknown",
    "profession": "short description or unknown",
    "marital_status": "single|married|divorced|unknown",
    "prior_us_travel": "none|once|multiple|unknown",
    "purpose": "tourism|visit_partner|medical|business|family|other|unknown"
  }},
  "outcome": "approved|refused_214b|refused_221g|pending|unknown",
  "qa_sequence": [
    {{"q": "officer question", "a": "applicant answer"}}
  ]
}}

Rules:
- Only extract Q&A pairs explicitly stated in the post/comments.
- If fewer than 3 Q&A pairs can be extracted, still return what you find.
- Do not fabricate; use "unknown" when information is absent.
"""


def is_relevant(title: str, text: str) -> bool:
    combined = (title + " " + text).lower()
    has_b1b2 = any(kw in combined for kw in B1B2_KEYWORDS)
    has_india = any(kw in combined for kw in INDIA_KEYWORDS)
    return has_b1b2 and has_india


def reddit_get(client: httpx.Client, url: str, params: dict = None, retries: int = 3) -> httpx.Response:
    for attempt in range(retries):
        try:
            r = client.get(url, params=params, timeout=20)
            if r.status_code == 429:
                wait = 30 * (attempt + 1)
                print(f"  Reddit 429 — waiting {wait}s ...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r
        except httpx.HTTPStatusError as e:
            if attempt == retries - 1:
                raise
            time.sleep(5)
    raise RuntimeError(f"Failed after {retries} retries: {url}")


def fetch_top_comments(client: httpx.Client, subreddit: str, post_id: str) -> str:
    try:
        url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json"
        r = reddit_get(client, url, params={"limit": 3, "depth": 1})
        data = r.json()
        comments_listing = data[1]["data"]["children"]
        texts = [
            c["data"].get("body", "")
            for c in comments_listing
            if c["kind"] == "t1"
        ]
        return "\n".join(texts[:3])
    except Exception:
        return ""


def fetch_subreddit_posts(client: httpx.Client, subreddit: str, cutoff: datetime) -> list[dict]:
    posts = []
    after = None

    while True:
        params = {"limit": 100, "sort": "new"}
        if after:
            params["after"] = after

        try:
            r = reddit_get(client, f"https://www.reddit.com/r/{subreddit}/new.json", params=params)
        except Exception as e:
            print(f"  Fetch error: {e}")
            break

        data = r.json()["data"]
        children = data.get("children", [])
        if not children:
            break

        oldest_in_page = None
        for child in children:
            post = child["data"]
            created = datetime.fromtimestamp(post["created_utc"])
            oldest_in_page = created

            if created < cutoff:
                continue

            posts.append({
                "id": post["id"],
                "title": post.get("title", ""),
                "text": post.get("selftext", ""),
                "permalink": post.get("permalink", ""),
                "created_utc": post["created_utc"],
                "subreddit": subreddit,
            })

        after = data.get("after")
        if not after or (oldest_in_page and oldest_in_page < cutoff):
            break

        time.sleep(2)  # polite between pages

    return posts


def extract_post_data(ai: anthropic.Anthropic, client: httpx.Client, post: dict) -> dict | None:
    title = post["title"]
    text = post["text"]

    if not is_relevant(title, text):
        return None

    top_comments = fetch_top_comments(client, post["subreddit"], post["id"])
    time.sleep(1)  # polite between comment fetches

    try:
        msg = ai.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": EXTRACT_PROMPT.format(
                    url=f"https://reddit.com{post['permalink']}",
                    title=title,
                    text=text[:3000],
                    comments=top_comments[:1000],
                ),
            }],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)
    except Exception as e:
        print(f"    LLM error: {e}")
        return None

    qa = data.get("qa_sequence", [])
    return {
        "id": f"rdt_{post['id']}",
        "source_url": f"https://reddit.com{post['permalink']}",
        "date_posted": str(datetime.fromtimestamp(post["created_utc"]).date()),
        "consulate": data.get("consulate", "unknown"),
        "applicant_profile": data.get("applicant_profile", {}),
        "outcome": data.get("outcome", "unknown"),
        "qa_sequence": qa,
        "quality_flag": "full_transcript" if len(qa) >= 3 else "texture_only",
        "extracted_at": str(date.today()),
    }


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    ai = anthropic.Anthropic(api_key=api_key)
    cutoff = datetime.now() - timedelta(days=730)  # 24 months
    results = []
    seen_ids = set()

    with httpx.Client(headers=HEADERS, follow_redirects=False) as client:
        for sub_name in SUBREDDITS:
            print(f"\nFetching r/{sub_name} ...")
            posts = fetch_subreddit_posts(client, sub_name, cutoff)
            print(f"  {len(posts)} posts in date window, filtering ...")

            for post in posts:
                if post["id"] in seen_ids:
                    continue
                seen_ids.add(post["id"])

                entry = extract_post_data(ai, client, post)
                if entry:
                    results.append(entry)
                    print(f"  [{len(results)}] {entry['quality_flag']} -- {post['title'][:60]}")

                if len(results) >= 2500:
                    break

            if len(results) >= 2500:
                break

            time.sleep(5)  # pause between subreddits

    CORPUS_PATH.write_text(yaml.dump(results, allow_unicode=True, sort_keys=False), encoding="utf-8")
    full = sum(1 for r in results if r["quality_flag"] == "full_transcript")
    print(f"\nWrote {len(results)} posts ({full} full_transcript) to {CORPUS_PATH}")


if __name__ == "__main__":
    main()
