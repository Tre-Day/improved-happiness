"""llm_rerank.py — AI rerank via local Ollama.

Scores unjudged rows (Status=discovered) against the active profile
using Ollama. Falls back gracefully if Ollama is not running.
Compatible with keys.yaml — prefers configured keys, falls back to env.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import creds

logging.basicConfig(level=logging.INFO, format="[llm-rerank] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))
TRACKER_CSV = ROOT / "data" / "tracker.csv"
OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "qwen2.5-coder:7b"
FALLBACK_MODELS = ["qwen2.5-coder:7b", "granite3.3:8b", "qwen3.5:9b", "phi4:latest"]
THRESHOLD = 70
BATCH = 10
MAX_NEW_PER_RUN = 800


def _load_profile_text() -> str:
    """Load profile for prompt — generic, no hardcodes. Falls back to neutral."""
    try:
        import yaml

        for p in [
            ROOT / "config" / "profile.yaml",
            ROOT / "config" / "profiles" / "default.yaml",
        ]:
            if p.exists():
                data = yaml.safe_load(p.read_text("utf-8")) or {}
                # skip active_profile wrapper
                if "name" in data or "headline" in data:
                    name = (data.get("name") or "Candidate").strip()
                    headline = (data.get("headline") or "").strip()
                    summary = (data.get("summary") or "").strip()
                    skills = ", ".join(data.get("skills") or [])
                    if name or headline or summary:
                        return (
                            f"Candidate profile: {name} -- {headline}. "
                            f"Summary: {summary} Skills: {skills}. "
                        )
    except Exception:
        pass
    return "Candidate profile: (not yet filled — use generic matching). "


def _build_system_prompt() -> str:
    profile = _load_profile_text()
    return (
        "You are a strict Recruiter screening jobs against a candidate profile. "
        + profile
        + "Score 70+ ONLY for titles that clearly match the candidate's skills and headline. "
        "Reject: entry-level (I, II, intern, junior, associate, assistant) unless the profile is entry-level; "
        "sales, account executive, SDR, BDR; clinical, pharmacy, RN, LPN; "
        "insurance, claims, underwriter; banking, loan officer, teller; "
        "consulting or advisory; software engineer, ML, data scientist, "
        "designer, recruiter, marketing, people/HR, finance, legal, "
        "accountant, executive assistant, CFO, CEO, COO — unless the candidate profile explicitly targets those. "
        "For borderline titles, prefer score=55-69 (keep but deprioritize). "
        "When in doubt, score 45."
    )


SYSTEM_PROMPT = _build_system_prompt()


def ollama_available() -> bool:
    try:
        req = urllib.request.Request(
            "http://localhost:11434/api/tags", headers={"User-Agent": "JobBot/1.0"}
        )
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def ollama_chat(model: str, batch: list[dict]) -> list[tuple[int, str] | None]:
    lines = [
        "Score each of these jobs 0-100 on supply-chain fit. Be strict.",
        "Return ONLY a JSON array (no markdown, no commentary), one object per job in order, with fields: idx (int), score (int 0-100), reason (one short clause).",
        "",
    ]
    for i, r in enumerate(batch):
        lines.append(
            f"[idx={i}] TITLE: {r.get('Job Title', '')} | "
            f"COMPANY: {r.get('Company', '')} | "
            f"LOCATION: {r.get('Location', '')}"
        )
    user_prompt = "\n".join(lines)
    body = json.dumps(
        {
            "model": model,
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 1500},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.warning(f"Ollama {model} error: {e}")
        return [None] * len(batch)
    text = (data.get("message") or {}).get("content", "").strip()
    if not text:
        return [None] * len(batch)
    if text.startswith("```"):
        text = text.strip("`\n ")
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < 0 or end <= start:
        return [None] * len(batch)
    try:
        arr = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return [None] * len(batch)
    if not isinstance(arr, list):
        return [None] * len(batch)
    out: list[tuple[int, str] | None] = [None] * len(batch)
    for entry in arr:
        if not isinstance(entry, dict):
            continue
        idx = entry.get("idx")
        if not isinstance(idx, int) or idx < 0 or idx >= len(batch):
            continue
        try:
            score = int(entry.get("score", 0))
            reason = str(entry.get("reason", ""))[:200]
            out[idx] = (max(0, min(100, score)), reason)
        except (TypeError, ValueError):
            continue
    return out


def main() -> int:
    if not ollama_available():
        log.warning(
            "Ollama not running on http://localhost:11434 — start with: ollama serve"
        )
        log.info("rerank skipped (no rows rejected)")
        print("Ollama not available — skipping rerank")
        return 0

    if not TRACKER_CSV.exists():
        log.error("tracker not found")
        return 1

    with open(TRACKER_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    candidates = [r for r in rows if r.get("Status") == "discovered"]
    if len(candidates) > MAX_NEW_PER_RUN:
        candidates = candidates[:MAX_NEW_PER_RUN]

    log.info(f"rerank candidates: {len(candidates)} (cap {MAX_NEW_PER_RUN})")
    new_rows = list(rows)
    judged = kept = rejected = failed = 0
    model = OLLAMA_MODEL

    for i in range(0, len(candidates), BATCH):
        batch = candidates[i : i + BATCH]
        scores = ollama_chat(model, batch)
        if all(s is None for s in scores) and model == OLLAMA_MODEL:
            for m in FALLBACK_MODELS[1:]:
                if m == model:
                    continue
                scores = ollama_chat(m, batch)
                if not all(s is None for s in scores):
                    model = m
                    break
        for r, score in zip(batch, scores):
            if score is None:
                failed += 1
                continue
            s, reason = score
            judged += 1
            idx = next(
                (j for j, x in enumerate(new_rows) if x.get("URL") == r.get("URL")),
                None,
            )
            if idx is None:
                continue
            if s < THRESHOLD:
                new_rows[idx]["Status"] = "ai-rejected"
                new_rows[idx]["Notes"] = f"score={s} {reason}".strip()[:300]
                rejected += 1
            else:
                new_rows[idx]["Notes"] = f"ai-rerank score={s}"
                kept += 1
        if (i // BATCH) % 3 == 0:
            log.info(
                f"progress: {judged}/{len(candidates)} judged ({kept} kept, {rejected} rejected, {failed} failed)"
            )

    with open(TRACKER_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(new_rows[0].keys()))
        w.writeheader()
        w.writerows(new_rows)

    log.info(
        f"judged: {judged}  kept: {kept}  rejected: {rejected}  failed: {failed}  model: {model}"
    )
    print(f"judged: {judged}  kept: {kept}  rejected: {rejected}  failed: {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
