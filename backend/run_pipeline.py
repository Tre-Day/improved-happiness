"""run_pipeline.py — discover → dedup → score pipeline.

Usage:
  python run_pipeline.py doall        # full pipeline
  python run_pipeline.py discover     # scrape only
  python run_pipeline.py score       # score only
"""

from __future__ import annotations

import csv
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))
DATA = ROOT / "data"
CONFIG = ROOT / "config"
TRACKER_CSV = DATA / "tracker.csv"
SCORED_CSV = DATA / "tracker-scored.csv"

logging.basicConfig(level=logging.INFO, format="[pipeline] %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def _py() -> str:
    cand = ROOT / "venv" / "Scripts" / "python.exe"
    if cand.exists():
        return str(cand)
    return sys.executable


PY = _py()


def run_py(script: str, timeout: int = 300) -> tuple[int, str]:
    path = ROOT / "backend" / script
    if not path.exists():
        return -1, f"missing: {path}"
    t0 = time.time()
    try:
        proc = subprocess.run(
            [_py(), str(path)],
            cwd=str(ROOT / "backend"),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        dt = time.time() - t0
        last = (proc.stdout or "").splitlines()
        msg = last[-1] if last else "(no output)"
        return proc.returncode, f"{script} ({dt:.1f}s): {msg}"
    except subprocess.TimeoutExpired:
        return 124, f"{script} timed out after {timeout}s"
    except Exception as e:
        return 1, f"{script} error: {type(e).__name__}: {e}"


def tracker_count() -> int:
    if not TRACKER_CSV.exists():
        return 0
    with open(TRACKER_CSV, encoding="utf-8") as f:
        return max(sum(1 for _ in f) - 1, 0)


def step_discover() -> int:
    log.info("[1/4] Scraping...")
    rc_total = 0
    # Run linkedin guest scraper
    rc, msg = run_py("scraper/linkedin_guest.py")
    log.info(f"  [{rc}] {msg}")
    rc_total = rc_total or rc
    # Run jobspy + ATS
    rc2, msg2 = run_py("scraper/jobspy_adapter.py")
    log.info(f"  [{rc2}] {msg2}")
    rc_total = rc_total or rc2
    return rc_total


def step_dedup() -> int:
    log.info("[2/4] Deduping...")
    rc, msg = run_py("tracker/dedup.py")
    log.info(f"  [{rc}] {msg}")
    return rc


def step_score() -> tuple[int, int]:
    log.info("[3/4] Rule-scoring...")
    rc, msg = run_py("scorer/rule_scorer.py")
    log.info(f"  [{rc}] {msg}")
    total = tracker_count()
    top = 0
    if SCORED_CSV.exists():
        with open(SCORED_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            top = sum(1 for r in reader if int(r.get("score", 0)) >= 50)
    log.info(f"  scored {total} rows; {top} top targets (score>=50)")
    return top, total


def doall() -> int:
    before = tracker_count()
    log.info(f"tracker before: {before} rows")
    rc_total = 0
    rc = step_discover()
    rc_total = rc_total or rc
    rc = step_dedup()
    rc_total = rc_total or rc
    top, total = step_score()
    final = tracker_count()
    log.info(f"FINAL: {final} unique rows; {top} top targets (score>=50)")
    print(f"=== DONE: {final} rows, {top} top targets ===")
    # Copy scored CSV over tracker for apply pass
    if SCORED_CSV.exists():
        import shutil

        shutil.copy(str(SCORED_CSV), str(TRACKER_CSV))
    return rc_total


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "doall"
    log.info(f"pipeline cmd: {cmd}")
    if cmd == "doall":
        return doall()
    elif cmd == "discover":
        rc = step_discover()
        print(f"=== discover: {tracker_count()} rows ===")
        return rc
    elif cmd == "score":
        top, total = step_score()
        print(f"=== scored {total} rows; {top} top targets ===")
        return 0
    else:
        print(f"unknown cmd: {cmd}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
