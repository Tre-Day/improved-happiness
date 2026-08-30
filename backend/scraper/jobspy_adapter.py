"""jobspy_adapter.py — wraps speedyapply/JobSpy.

pip install jobspy
Hits LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, Naukri, Bayt
and returns rows as dicts compatible with the tracker schema.
"""

from __future__ import annotations

import csv
import os
import sys
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))
from scraper.ats_adapter import ats_scrape_all

logging.basicConfig(level=logging.INFO, format="[jobspy] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))
TRACKER_CSV = ROOT / "data" / "tracker.csv"
CONFIG_DIR = ROOT / "config"

BOARD_COLS = {
    "LinkedIn": "linkedin.com",
    "Indeed": "indeed.com",
    "Glassdoor": "glassdoor.com",
    "Google": "google.com",
    "ZipRecruiter": "ziprecruiter.com",
    "Naukri": "naukri.com",
    "Bayt": "bays.com",
}


def jobspy_available() -> bool:
    try:
        import jobspy

        return True
    except ImportError:
        return False


def load_search_config() -> dict:
    import yaml

    cfg = {}
    sc = CONFIG_DIR / "search.yaml"
    if sc.exists():
        try:
            cfg = yaml.safe_load(sc.read_text("utf-8")) or {}
        except Exception:
            pass
    return cfg


def build_jobspy_kwargs(config: dict) -> dict:
    keywords = config.get(
        "keywords", ["supply chain", "procurement", "sourcing", "operations manager"]
    )
    locations = config.get("locations", [{"query": "Remote United States"}])
    max_pages = config.get("maxPages", 4)
    boards = [b["id"] for b in config.get("boards", []) if b.get("enabled", True)]
    if not boards:
        boards = ["linkedin", "indeed", "glassdoor", "google", "ziprecruiter"]
    return {
        "keywords": keywords,
        "location": locations[0].get("query", "Remote United States")
        if locations
        else "Remote United States",
        "max_pages": max_pages,
        "site_type": " or ".join(boards) if boards else "all",
    }


def scrape_all() -> list[dict]:
    import yaml

    config = load_search_config()
    kw = build_jobspy_kwargs(config)

    results: list[dict] = []

    if not jobspy_available():
        log.warning("jobspy not installed — pip install jobspy")
        return results

    try:
        import jobspy

        log.info(f"starting jobspy: {kw}")
        jobs = jobspy.scrape_jobs(
            site_type=kw["site_type"],
            search_term=kw["keywords"],
            location=kw["location"],
            max_pages=kw["max_pages"],
            remote=True,
        )
        log.info(f"jobspy returned {len(jobs)} rows")
        for _, row in jobs.iterrows():
            board = str(row.get("site", row.get("source", "?")))
            title = str(row.get("title", row.get("job_title", "?")))
            company = str(row.get("company", "?"))
            location = str(row.get("location", "?"))
            url = str(row.get("url", row.get("job_url", "")))
            description = str(row.get("description", ""))[:2000]
            date_posted = str(row.get("date_posted", ""))

            results.append(
                {
                    "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "Job Title": title,
                    "Position": title,
                    "Company": company,
                    "Location": location,
                    "Platform": board,
                    "URL": url,
                    "Status": "discovered",
                    "Notes": f"source=jobspy; posted={date_posted}",
                    "Description": description,
                }
            )
    except Exception as e:
        log.error(f"jobspy error: {e}")

    # Also run ATS scraper
    try:
        ats_results = ats_scrape_all()
        log.info(f"ATS returned {len(ats_results)} rows")
        results.extend(ats_results)
    except Exception as e:
        log.error(f"ATS scraper error: {e}")

    return results


def append_to_tracker(rows: list[dict]) -> int:
    if not rows:
        return 0
    file_exists = TRACKER_CSV.exists()
    fieldnames = [
        "Date",
        "Job Title",
        "Position",
        "Company",
        "Location",
        "Platform",
        "URL",
        "Status",
        "Notes",
        "Description",
    ]
    existing_urls: set[str] = set()
    if file_exists:
        with open(TRACKER_CSV, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                u = (r.get("URL") or r.get("Link") or "").strip()
                if u:
                    existing_urls.add(u)
    new_rows = [r for r in rows if r.get("URL", "").strip() not in existing_urls]
    if not new_rows:
        log.info(f"no new rows ({len(rows)} seen, all dupes)")
        return 0
    with open(TRACKER_CSV, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            w.writeheader()
        w.writerows(new_rows)
    log.info(f"appended {len(new_rows)} new rows to tracker")
    return len(new_rows)


def main() -> int:
    log.info("jobspy_adapter main — running scrape")
    rows = scrape_all()
    n = append_to_tracker(rows)
    log.info(f"done — {n} new rows added")
    return 0


if __name__ == "__main__":
    sys.exit(main())
