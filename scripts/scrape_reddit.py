#!/usr/bin/env python3
"""
Layer C scraper — Reddit transcripts.

Subreddits: r/USTravelVisa, r/visas, r/immigration, r/india, r/indiansabroad
Filters: B1/B2 keywords + India consulate keywords + last 24 months
Target: 1,500-2,500 posts

For each post, claude-haiku-4-5 extracts:
  - consulate
  - applicant archetype (age band, profession, marital status, prior travel)
  - Q&A pairs (if present)
  - stated outcome

Posts where <3 Q&A pairs are extractable get quality_flag: texture_only.

Output: corpus/reddit.yaml
Schema: visa-coach-plan.md §2.1
Env: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT, ANTHROPIC_API_KEY

Run: python scripts/scrape_reddit.py
"""

import asyncio
import json
import os
import time
import yaml
from datetime import date, datetime, timedelta
from pathlib import Path

import anthropic
import praw
from dotenv import load_dotenv

load_dotenv(".env.local")

CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "reddit.yaml"

SUBREDDITS = ["USTravelVisa", "visas", "immigration", "india", "indiansabroad"]

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

Return JSON only:
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
- If fewer than 3 Q&A pairs can be extracted, still return what you find (quality_flag handled separately).
- Do not fabricate; use "unknown" when information is absent.
"""


def is_relevant(title: str, text: str) -> bool:
    combined = (title + " " + text).lower()
    has_b1b2 = any(kw in combined for kw in B1B2_KEYWORDS)
    has_india = any(kw in combined for kw in INDIA_KEYWORDS)
    return has_b1b2 and has_india


def extract_post_data(ai: anthropic.Anthropic, submission: praw.models.Submission) -> dict | None:
    title = submission.title or ""
    text = submission.selftext or ""

    if not is_relevant(title, text):
        return None

    submission.comments.replace_more(limit=0)
    top_comments = "\n".join(
        c.body for c in list(submission.comments)[:3] if hasattr(c, "body")
    )

    try:
        msg = ai.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": EXTRACT_PROMPT.format(
                    url=f"https://reddit.com{submission.permalink}",
                    title=title,
                    text=text[:3000],
                    comments=top_comments[:1000],
                ),
            }],
        )
        data = json.loads(msg.content[0].text.strip())
    except Exception as e:
        print(f"    LLM error: {e}")
        return None

    qa = data.get("qa_sequence", [])
    return {
        "id": f"rdt_{submission.id}",
        "source_url": f"https://reddit.com{submission.permalink}",
        "date_posted": str(datetime.fromtimestamp(submission.created_utc).date()),
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

    reddit = praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_CLIENT_SECRET"],
        user_agent=os.environ.get("REDDIT_USER_AGENT", "VisaCoach/1.0"),
    )
    ai = anthropic.Anthropic(api_key=api_key)

    cutoff = datetime.now() - timedelta(days=730)  # 24 months
    results = []
    seen_ids = set()

    for sub_name in SUBREDDITS:
        print(f"\nScraping r/{sub_name} ...")
        subreddit = reddit.subreddit(sub_name)
        try:
            for submission in subreddit.new(limit=500):
                if submission.id in seen_ids:
                    continue
                if datetime.fromtimestamp(submission.created_utc) < cutoff:
                    continue

                seen_ids.add(submission.id)
                entry = extract_post_data(ai, submission)
                if entry:
                    results.append(entry)
                    print(f"  [{len(results)}] {entry['quality_flag']} — {submission.title[:60]}")

                time.sleep(0.5)  # PRAW rate limit courtesy

                if len(results) >= 2500:
                    break
        except Exception as e:
            print(f"  Subreddit error: {e}")

    CORPUS_PATH.write_text(yaml.dump(results, allow_unicode=True, sort_keys=False), encoding="utf-8")
    full = sum(1 for r in results if r["quality_flag"] == "full_transcript")
    print(f"\nWrote {len(results)} posts ({full} full_transcript) to {CORPUS_PATH}")


if __name__ == "__main__":
    main()
