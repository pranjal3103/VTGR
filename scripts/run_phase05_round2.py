"""
Phase 0.5 Round 2 — Simulator quality check.
Drives /api/simulator for each of 5 test profiles, then gets critique.
Scores on 5-dimension rubric. Run with dev server on localhost:3000.

Changes from v1:
- 5-turn cap then force critique (no waiting for terminal outcome)
- Per-profile fresh httpx.Client (avoid connection-state corruption)
- Adaptive answer lists that actually address what officers ask
- Calibration scored from critique.scores (not terminal outcome)
- Correct principle ID format: any [a-z][a-z0-9_]+ pattern
"""

import httpx
import yaml
import json
import sys
import re
import textwrap
import uuid
from pathlib import Path

BASE = "http://localhost:3000"

# Answers per profile — ordered by likely officer question sequence.
# Cover the most probable follow-up probes for each risk type.
PROFILE_ANSWERS = {
    1: [  # Software engineer visiting H1-B partner
        "I'm visiting my partner. He lives in San Francisco on an H1-B visa.",
        "I'm a backend software engineer at a tech company in Bangalore, permanent role, three years.",
        "Forty-five days. I have approved leave and a return ticket for July 20th.",
        "He is on H1-B until 2027. He has no plans to sponsor me — this is purely a personal visit.",
        "My parents are in Bangalore. I have a product launch in July I'm leading; my team needs me back.",
        "No immigration plans. I'm going as a visitor and returning to my job.",
    ],
    2: [  # 22yo unemployed, prior 214(b) refusal
        "I was refused last March. The officer cited insufficient ties to India.",
        "Since then I have two confirmed job interviews — Infosys on July 12th and TCS on July 18th in Bangalore.",
        "The interview confirmations are in email. I can provide them. My father is an IAS officer and is sponsoring the trip.",
        "Tourism — New York and Los Angeles. I've never traveled abroad.",
        "I intend to return before July 12th for my Infosys interview. I live with my parents in Patna.",
        "My family has means. I'm not going to the US for work — I have Indian job opportunities I'm actively pursuing.",
    ],
    3: [  # 45yo IRS officer, 5 prior approved trips
        "Tourism. I've been to the US five times and always returned on time.",
        "I'm a Deputy Commissioner of Income Tax, Indian Revenue Service. Eighteen years of service.",
        "Twenty-one days. I have sanctioned annual leave and a return ticket.",
        "My wife and two school-age children are in Delhi. I own a flat there.",
        "I cannot abandon my government post. I have a team and a caseload. There is a personal consequence to non-return.",
        "Washington DC, Boston, Chicago. I've planned the itinerary. I return August 5th.",
    ],
    4: [  # Cardiologist at medical conference
        "I'm attending the American College of Cardiology annual conference in Chicago. I'm presenting a research paper.",
        "Senior cardiologist at Apollo Hospitals Chennai, twelve years post-residency. My employer is sponsoring the trip.",
        "Ten days — I arrive March 2nd, return March 12th. I have the conference invitation and Apollo's sponsoring letter.",
        "My husband and seven-year-old daughter are in Chennai. I have patients scheduled for follow-up the week I return.",
        "The paper was peer-reviewed and accepted. I'm the presenting author. Apollo cannot send a substitute for my caseload.",
        "I'm not conducting any clinical procedures in the US. I'm presenting research only. That's B1 activity.",
    ],
    5: [  # Freelancer, suspicious
        "Tourism. I want to see New York, San Francisco, Austin, Miami, Seattle.",
        "I'm a freelance graphic designer. I work for international clients remotely.",
        "About ninety days. I'll see how I feel — no fixed return date.",
        "I'm paying myself from savings and freelance income. I don't have a fixed employer.",
        "I rent month-to-month in Ahmedabad. I work remotely, so I can work from anywhere.",
        "I might extend if I'm enjoying the trip. I don't have any obligations pulling me back specifically.",
    ],
}


def read_sse_stream(response: httpx.Response) -> tuple[str, str | None]:
    """Read SSE stream from a streaming response, return (full_text, outcome_or_None)."""
    full_text = ""
    outcome = None
    buf = ""
    for chunk in response.iter_text():
        buf += chunk
        lines = buf.split("\n")
        buf = lines.pop()
        for line in lines:
            if not line.startswith("data: "):
                continue
            try:
                event = json.loads(line[6:])
                if event.get("type") == "delta":
                    full_text += event.get("text", "")
                elif event.get("type") == "outcome":
                    outcome = event.get("value")
            except Exception:
                pass
    return full_text, outcome


def read_sse_text(response: httpx.Response) -> str:
    """Read SSE stream, return concatenated delta text only (for critique)."""
    text = ""
    buf = ""
    for chunk in response.iter_text():
        buf += chunk
        lines = buf.split("\n")
        buf = lines.pop()
        for line in lines:
            if not line.startswith("data: "):
                continue
            try:
                event = json.loads(line[6:])
                if event.get("type") == "delta":
                    text += event.get("text", "")
            except Exception:
                pass
    return text


def run_session(profile: dict, mode: str = "standard") -> dict:
    """Run a full simulator session with a fresh client. Returns session data."""
    fake_id = str(uuid.uuid4())
    turns = []
    answer_list = PROFILE_ANSWERS[profile["id_num"]]
    answer_idx = 0
    final_outcome = None
    officer_texts = []
    errors = []

    # 5-turn cap then move to critique
    MAX_TURNS = 5

    with httpx.Client(timeout=90) as client:
        for turn_num in range(MAX_TURNS + 2):
            try:
                with client.stream(
                    "POST",
                    f"{BASE}/api/simulator",
                    json={"profile": profile, "turns": turns, "sessionId": fake_id, "mode": mode},
                    timeout=90,
                ) as resp:
                    officer_text, outcome = read_sse_stream(resp)
            except Exception as e:
                errors.append(f"Turn {turn_num} simulator error: {e}")
                break

            if not officer_text:
                errors.append(f"Turn {turn_num}: empty officer text")
                break

            officer_texts.append(officer_text)
            turns.append({"role": "officer", "content": officer_text})

            if outcome:
                final_outcome = outcome
                break

            if turn_num >= MAX_TURNS:
                break  # enough turns — move to critique

            answer = answer_list[min(answer_idx, len(answer_list) - 1)]
            answer_idx += 1
            turns.append({"role": "applicant", "content": answer})

        # Get critique
        critique = None
        critique_raw = ""
        if turns:
            try:
                with client.stream(
                    "POST",
                    f"{BASE}/api/critique",
                    json={"profile": profile, "turns": turns, "outcome": final_outcome, "sessionId": fake_id},
                    timeout=120,
                ) as resp:
                    critique_raw = read_sse_text(resp)

                cleaned = critique_raw
                for marker in ["```json", "```"]:
                    cleaned = cleaned.replace(marker, "")
                cleaned = cleaned.strip()
                critique = json.loads(cleaned)
            except Exception as e:
                errors.append(f"Critique error: {e}")

    return {
        "profile_num": profile["id_num"],
        "description": profile["description"],
        "mode": mode,
        "turns": turns,
        "officer_texts": officer_texts,
        "outcome": final_outcome,
        "critique": critique,
        "errors": errors,
    }


def is_valid_principle_id(pid: str) -> bool:
    """Accept any id that looks like a corpus reference: letters, digits, underscores."""
    return bool(pid and re.match(r'^[a-z][a-z0-9_]{2,}$', pid.strip()))


def score_session(result: dict) -> dict:
    """Score on 5-dimension rubric. Returns {scores, notes}."""
    profile_num = result["profile_num"]
    critique = result["critique"]
    officer_texts = result["officer_texts"]
    all_officer = " ".join(officer_texts).lower()

    scores = {}
    notes = {}

    # ── 1. Hallucination check (P0) ─────────────────────────────────────
    flags = []
    if critique:
        issues = critique.get("issues", [])
        fake_pids = [i for i in issues if i.get("principle_id") and not is_valid_principle_id(i["principle_id"])]
        if fake_pids:
            flags.append(f"{len(fake_pids)} issues cite malformed principle IDs: {[i['principle_id'] for i in fake_pids]}")

        examples = critique.get("estimated_outcome_examples", [])
        stat_patterns = ["%", "percent", "study shows", "data shows", "statistics show"]
        for ex in examples:
            if any(p in ex.lower() for p in stat_patterns):
                flags.append(f"Outcome example looks like a stat: {ex[:70]}")
                break

    if not flags:
        scores["hallucination"] = 5
        notes["hallucination"] = "No hallucination detected"
    elif len(flags) == 1:
        scores["hallucination"] = 3
        notes["hallucination"] = f"Minor flag: {flags[0]}"
    else:
        scores["hallucination"] = 2
        notes["hallucination"] = "; ".join(flags)

    # ── 2. Calibration (critique scores match expected risk level) ───────
    # Score based on critique.scores fields matching expected risk, not terminal outcome
    calibration_pass = True
    calibration_notes = []
    if critique:
        s = critique.get("scores", {})
        ties = s.get("ties_to_india", 3)
        purpose = s.get("trip_purpose", 3)
        finance = s.get("financial_credibility", 3)
        consistency = s.get("consistency", 3)

        if profile_num == 1:   # solid, should score decent
            if ties < 3 or finance < 3:
                calibration_pass = False
                calibration_notes.append(f"Profile 1 is solid but ties={ties}, finance={finance}")
        elif profile_num == 2:  # high-risk, should score low
            if ties > 2 or consistency > 2:
                calibration_pass = False
                calibration_notes.append(f"Profile 2 is high-risk but ties={ties}, consistency={consistency} (too high)")
        elif profile_num == 3:  # very strong, should score high
            if ties < 4 or finance < 4:
                calibration_pass = False
                calibration_notes.append(f"Profile 3 is very strong but ties={ties}, finance={finance} (too low)")
        elif profile_num == 4:  # conference B1, clear purpose
            if purpose < 3:
                calibration_pass = False
                calibration_notes.append(f"Profile 4 has clear conference purpose but purpose={purpose}")
        elif profile_num == 5:  # suspicious, should score low
            if ties > 2 or finance > 3:
                calibration_pass = False
                calibration_notes.append(f"Profile 5 is suspicious but ties={ties}, finance={finance} (too high)")

        if calibration_pass:
            scores["calibration"] = 5
            notes["calibration"] = f"Critique scores match expected risk: ties={ties} purpose={purpose} finance={finance}"
        else:
            scores["calibration"] = 2
            notes["calibration"] = "; ".join(calibration_notes)
    else:
        scores["calibration"] = 1
        notes["calibration"] = "Critique not generated — cannot evaluate"

    # ── 3. Profile awareness (officer asked the right questions) ─────────
    risk_signals = {
        1: ["partner", "h1", "h-1", "sponsor", "job", "return", "employ"],
        2: ["refusal", "refused", "ties", "job", "changed", "different", "interview"],
        3: ["return", "service", "government", "job", "trip"],
        4: ["conference", "paper", "hospital", "present", "employ", "sponsor"],
        5: ["return", "ties", "income", "freelance", "duration", "extend", "job"],
    }
    expected = risk_signals.get(profile_num, [])
    matched = [s for s in expected if s in all_officer]
    coverage = len(matched) / max(len(expected), 1)
    if coverage >= 0.6:
        scores["profile_awareness"] = 5
        notes["profile_awareness"] = f"Covered {len(matched)}/{len(expected)} key signals: {matched}"
    elif coverage >= 0.35:
        scores["profile_awareness"] = 3
        notes["profile_awareness"] = f"Partial coverage {len(matched)}/{len(expected)}: {matched}"
    else:
        scores["profile_awareness"] = 2
        notes["profile_awareness"] = f"Low coverage {len(matched)}/{len(expected)}: {matched}"

    # ── 4. Authority hierarchy ───────────────────────────────────────────
    if critique:
        issues = critique.get("issues", [])
        valid_cites = [i for i in issues if is_valid_principle_id(i.get("principle_id", ""))]
        outcome_examples = critique.get("estimated_outcome_examples", [])
        if valid_cites or not issues:
            scores["authority_hierarchy"] = 5
            notes["authority_hierarchy"] = (
                f"{len(valid_cites)}/{len(issues)} issues have valid principle citations. "
                f"{len(outcome_examples)} Reddit examples in outcome_examples section."
            )
        else:
            scores["authority_hierarchy"] = 2
            notes["authority_hierarchy"] = f"{len(issues)} issues but none with valid principle_id"
    else:
        scores["authority_hierarchy"] = 1
        notes["authority_hierarchy"] = "Critique not generated"

    # ── 5. Honesty about uncertainty (P0) ────────────────────────────────
    overconfident = False
    if critique:
        summary = critique.get("summary", "").lower()
        bad = ["guaranteed", "certain", "definitely approved", "definitely refused",
               "100%", "will be approved", "will be refused", "will be denied"]
        examples = critique.get("estimated_outcome_examples", [])
        predictive = ["you will", "you'll be", "your visa will", "you'll get"]
        for p in bad:
            if p in summary:
                overconfident = True
                notes["uncertainty"] = f"Summary overconfident: '{p}'"
                break
        if not overconfident:
            for ex in examples:
                for p in predictive:
                    if p in ex.lower():
                        overconfident = True
                        notes["uncertainty"] = f"Outcome example predictive: '{ex[:60]}'"
                        break
                if overconfident:
                    break

    if not overconfident:
        scores["uncertainty"] = 5
        notes["uncertainty"] = notes.get("uncertainty", "No overconfident or predictive language")
    else:
        scores["uncertainty"] = 2

    return {"scores": scores, "notes": notes}


def print_result(result: dict, scoring: dict):
    num = result["profile_num"]
    desc = result["description"]
    mode = result["mode"]
    critique = result["critique"]
    scores = scoring["scores"]
    notes = scoring["notes"]

    print(f"\n{'='*70}")
    print(f"PROFILE #{num} [{mode}]: {desc}")
    print(f"{'='*70}")
    print(f"Officer turns: {len(result['officer_texts'])}  |  Outcome: {result['outcome'] or 'none (5-turn cap)'}")

    if result["errors"]:
        for e in result["errors"]:
            print(f"  [warn] {e}")

    print("\n--- Officer questions ---")
    for i, q in enumerate(result["officer_texts"], 1):
        wrapped = textwrap.fill(q.strip(), 64, subsequent_indent="      ")
        print(f"  Q{i}: {wrapped}")

    if critique:
        s = critique.get("scores", {})
        print(f"\n--- Critique ---")
        print(f"  {textwrap.fill(critique.get('summary', '(none)'), 64, subsequent_indent='  ')}")
        print(f"  Scores: ties={s.get('ties_to_india','?')} purpose={s.get('trip_purpose','?')} "
              f"finance={s.get('financial_credibility','?')} consistency={s.get('consistency','?')} "
              f"concise={s.get('conciseness','?')}")
        issues = critique.get("issues", [])
        print(f"  Issues: {len(issues)}")
        for iss in issues[:2]:
            pid = iss.get("principle_id", "?")
            issue_text = textwrap.fill(iss.get("issue", ""), 58, subsequent_indent="       ")
            print(f"    [{pid}] {issue_text}")
        things = critique.get("things_to_practice", [])
        print(f"  Things to practice: {len(things)}")
        for t in things[:3]:
            print(f"    - {textwrap.fill(t, 62, subsequent_indent='      ')}")
    else:
        print("\n  [Critique generation failed]")

    print("\n--- Rubric ---")
    dims = ["hallucination", "calibration", "profile_awareness", "authority_hierarchy", "uncertainty"]
    total = 0
    p0_fail = False
    for dim in dims:
        sc = scores.get(dim, 0)
        total += sc
        p0 = " [P0]" if dim in ("hallucination", "uncertainty") else ""
        flag = " *** FAIL ***" if sc < 3 else ""
        print(f"  {dim:22s} {sc}/5{p0}{flag}")
        print(f"    {textwrap.fill(notes.get(dim, ''), 60, subsequent_indent='    ')}")
        if dim in ("hallucination", "uncertainty") and sc < 3:
            p0_fail = True

    avg = total / len(dims)
    verdict = "PASS" if avg >= 3.5 and not p0_fail else "FAIL"
    print(f"\n  Average: {avg:.1f}/5  [{verdict}]")
    if p0_fail:
        print("  *** P0 FAILURE ***")
    return avg, p0_fail


def main():
    yaml_path = Path(__file__).parent.parent / "test-profiles.yaml"
    raw = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))

    profiles = []
    for entry in raw:
        p = dict(entry["profile"])
        p["id_num"] = entry["number"]
        p["description"] = entry["description"]
        profiles.append(p)

    print(f"Phase 0.5 Round 2 — Simulator quality check")
    print(f"Running {len(profiles)} profiles against {BASE}\n")

    # Quick health check
    try:
        with httpx.Client(timeout=10) as c:
            r = c.get(BASE, follow_redirects=False)
            if r.status_code not in (200, 307, 302, 301):
                raise RuntimeError(f"Unexpected status {r.status_code}")
    except Exception as e:
        print(f"ERROR: Dev server not responding: {e}")
        print("Start it with: npm run dev")
        sys.exit(1)

    print("Server OK. Starting sessions...\n")

    all_avgs = []
    any_p0 = False

    for profile in profiles:
        num = profile["id_num"]
        mode = "refusal_drill" if profile.get("has_prior_refusal") else "standard"
        print(f"Running profile #{num} ({profile['description']}) [mode={mode}]...")
        try:
            result = run_session(profile, mode)
            scoring = score_session(result)
            avg, p0_fail = print_result(result, scoring)
            all_avgs.append(avg)
            if p0_fail:
                any_p0 = True
        except Exception as e:
            import traceback
            print(f"  ERROR: {e}")
            traceback.print_exc()
            all_avgs.append(0.0)

    print(f"\n{'='*70}")
    print(f"OVERALL RESULTS")
    print(f"{'='*70}")
    overall = sum(all_avgs) / len(all_avgs) if all_avgs else 0
    print(f"Per-profile averages: {[f'{a:.1f}' for a in all_avgs]}")
    print(f"Overall average: {overall:.1f}/5")

    if overall >= 3.5 and not any_p0:
        print("VERDICT: PASS — simulator meets quality bar.")
    else:
        reasons = []
        if overall < 3.5:
            reasons.append(f"avg {overall:.1f} < 3.5")
        if any_p0:
            reasons.append("P0 failure")
        print(f"VERDICT: FAIL — {'; '.join(reasons)}")
        print("Do not show app to Garvita until issues are fixed.")


if __name__ == "__main__":
    main()
