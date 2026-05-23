#!/usr/bin/env python3
"""
Layer A scraper — Official US Government Sources.

Targets:
  - 9 FAM 302.1 (fam.state.gov)
  - INA 214(b) (law.cornell.edu)
  - State Dept B1/B2 refusal rate tables (travel.state.gov)
  - Reciprocity schedule for India (travel.state.gov)

Output: corpus/official.yaml
Schema: visa-coach-plan.md §2.1
"""

import asyncio
import warnings
import yaml
from datetime import date
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

warnings.filterwarnings("ignore", message="Unverified HTTPS")


CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "official.yaml"

TARGETS = [
    {
        "id_prefix": "off_fam",
        "source": "9_fam_302_1",
        "source_url": "https://fam.state.gov/fam/09FAM/09FAM030201.html",
        "description": "9 FAM 302.1 — Nonimmigrant Visas",
    },
    {
        "id_prefix": "off_ina",
        "source": "ina_214b",
        "source_url": "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title8-section1184&num=0&edition=prelim",
        "description": "INA §214(b) — Presumption of immigrant intent",
    },
]


async def fetch(client: httpx.AsyncClient, url: str) -> str:
    resp = await client.get(url, follow_redirects=True, timeout=30)
    resp.raise_for_status()
    return resp.content.decode("utf-8", errors="replace")


def parse_fam(html: str, source_meta: dict) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    entries = []
    idx = 1
    for node in soup.select("p, li"):
        text = node.get_text(strip=True)
        if len(text) < 80:
            continue
        entries.append({
            "id": f"{source_meta['id_prefix']}_{idx:03d}",
            "source": source_meta["source"],
            "source_url": source_meta["source_url"],
            "section": "",
            "paragraph_anchor": f"p_{idx}",
            "text": text,
            "retrieved_at": str(date.today()),
        })
        idx += 1
    return entries


async def main():
    results = []
    async with httpx.AsyncClient(headers={"User-Agent": "VisaCoach/1.0 (personal research)"}, verify=False) as client:
        for target in TARGETS:
            print(f"Fetching {target['source_url']} ...")
            try:
                html = await fetch(client, target["source_url"])
                entries = parse_fam(html, target)
                results.extend(entries)
                print(f"  -> {len(entries)} paragraphs extracted")
            except Exception as e:
                print(f"  ERROR: {e}")

    CORPUS_PATH.write_text(yaml.dump(results, allow_unicode=True, sort_keys=False), encoding="utf-8")
    print(f"\nWrote {len(results)} entries to {CORPUS_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
