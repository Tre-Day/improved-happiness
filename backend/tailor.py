"""tailor.py — AI resume tailor per job (ATS keywords).

Usage: python backend/tailor.py --job-url <url> --profile default
Reads profile + job from tracker.csv, calls Ollama/BYOK, writes data/tailored/<slug>.md
"""

from __future__ import annotations
import csv, re, sys, json, os
from pathlib import Path
from datetime import datetime

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))
TRACKER = ROOT / "data" / "tracker.csv"
TAILORED_DIR = ROOT / "data" / "tailored"
TAILORED_DIR.mkdir(exist_ok=True)


def load_profile(pid="default"):
    import yaml

    for p in [ROOT / f"config/profiles/{pid}.yaml", ROOT / "config/profile.yaml"]:
        if p.exists():
            try:
                d = yaml.safe_load(p.read_text("utf-8")) or {}
                if d.get("name"):
                    return d
            except:
                pass
    return {}


def load_job(url):
    if not TRACKER.exists():
        return None
    for row in csv.DictReader(open(TRACKER, encoding="utf-8")):
        if row.get("URL") == url or row.get("Link") == url:
            return row
    return None


def slug(url):
    return re.sub(r"[^a-z0-9]+", "-", url.lower())[:60].strip("-") or "job"


def call_llm(profile, job):
    prompt = f"""Tailor resume bullets for this job. Return JSON with keys: bullets (array of 5 strings), keywords (array of 6 ATS keywords).
Profile: {profile.get("name")} — {profile.get("headline")} — {profile.get("summary", "")[:400]} — skills: {", ".join(profile.get("skills", [])[:8])}
Job: {job.get("Job Title")} at {job.get("Company")} — {job.get("Description", "")[:600]}
Strict JSON only."""
    # Try Ollama
    import urllib.request, urllib.error

    try:
        body = json.dumps(
            {
                "model": "qwen2.5:7b",
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
                "options": {"temperature": 0.3},
            }
        ).encode()
        req = urllib.request.Request(
            "http://localhost:11434/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = json.loads(r.read().decode()).get("message", {}).get("content", "")
            if txt:
                # extract JSON
                m = re.search(r"\{[\s\S]*\}", txt)
                if m:
                    return json.loads(m.group(0))
    except Exception as e:
        pass
    # fallback deterministic
    kw = [
        k
        for k in (job.get("Description", "") + job.get("Job Title", "")).split()
        if len(k) > 4
    ][:6]
    bullets = [
        f"Delivered {job.get('Job Title', 'role')} outcomes via {kw[0] if kw else 'leadership'}"
        for _ in range(5)
    ]
    return {"bullets": bullets, "keywords": kw}


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--job-url", required=True)
    ap.add_argument("--profile", default="default")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    job = load_job(args.job_url)
    if not job:
        print(f"job not found: {args.job_url}")
        return 1
    prof = load_profile(args.profile)
    data = call_llm(prof, job)
    out = TAILORED_DIR / f"{args.profile}_{slug(args.job_url)}.json"
    if not args.dry_run:
        out.write_text(
            json.dumps(
                {
                    "profile": args.profile,
                    "job": job.get("Job Title"),
                    "url": args.job_url,
                    "generated_at": datetime.utcnow().isoformat(),
                    **data,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    print(json.dumps(data, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
