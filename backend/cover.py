"""cover.py — AI cover letter per job."""

from __future__ import annotations
import csv, re, sys, json, os
from pathlib import Path
from datetime import datetime

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))
TRACKER = ROOT / "data" / "tracker.csv"
OUT_DIR = ROOT / "data" / "covers"
OUT_DIR.mkdir(exist_ok=True)


def load_profile(pid="default"):
    import yaml

    for p in [ROOT / f"config/profiles/{pid}.yaml", ROOT / "config/profile.yaml"]:
        if p.exists():
            d = yaml.safe_load(p.read_text("utf-8")) or {}
            if d.get("name"):
                return d
    return {}


def load_job(url):
    if not TRACKER.exists():
        return None
    for row in csv.DictReader(open(TRACKER, encoding="utf-8")):
        if row.get("URL") == url:
            return row
    return None


def slug(u):
    return re.sub(r"[^a-z0-9]+", "-", u.lower())[:50].strip("-")


def call_llm(prof, job):
    prompt = f"""Write a concise cover letter (180-220 words) for:
Candidate: {prof.get("name")} — {prof.get("headline")}
Job: {job.get("Job Title")} at {job.get("Company")}
Skills: {", ".join(prof.get("skills", [])[:6])}
Return JSON {{letter: string}}."""
    import urllib.request

    try:
        body = json.dumps(
            {
                "model": "qwen2.5:7b",
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            }
        ).encode()
        req = urllib.request.Request(
            "http://localhost:11434/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = json.loads(r.read().decode()).get("message", {}).get("content", "")
            m = re.search(r"\{[\s\S]*\}", txt)
            if m:
                j = json.loads(m.group(0))
                if "letter" in j:
                    return j["letter"]
    except:
        pass
    return f"Dear Hiring Manager,\n\nI am excited to apply for {job.get('Job Title')} at {job.get('Company')}. With {prof.get('years_exp', 8)} years in {', '.join(prof.get('skills', [])[:3])}, I bring {prof.get('headline', '')}.\n\nBest,\n{prof.get('name')}"


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--job-url", required=True)
    ap.add_argument("--profile", default="default")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    job = load_job(args.job_url)
    if not job:
        print("job not found")
        return 1
    prof = load_profile(args.profile)
    letter = call_llm(prof, job)
    out = OUT_DIR / f"{args.profile}_{slug(args.job_url)}.md"
    if not args.dry_run:
        out.write_text(letter, encoding="utf-8")
    print(letter[:1200])
    return 0


if __name__ == "__main__":
    sys.exit(main())
