"""ats_adapter.py — scrape public ATS job boards via JSON APIs.

Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable.
No login / no CAPTCHA — these boards expose public job listing endpoints.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="[ats] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))

BOARD_JOBS_URLS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{domain}/jobs?content=true",
    "lever": "https://api.lever.co/v0/postings/{domain}?mode=json",
    "ashby": "https://api.ashbyhq.com/postings-info?domain={domain}&includeDescriptions=true",
    "workday": "https://{domain}.wd5.myworkdayjobs.com/Jobs",
    "smartrecruiters": "https://{domain}.smartrecruiters.com/api/postings?state=PUBLISHED",
    "workable": "https://api.workable.com/api/spaces/{domain}/jobs?state=published",
}

BOARD_DOMAINS = {
    "greenhouse": "",  # set per-tenant in config or via search.yaml
    "lever": "",
    "ashby": "",
    "workday": "",
    "smartrecruiters": "",
    "workable": "",
}


def load_targets() -> list[dict]:
    """Return list of {board, domain} to scrape."""
    try:
        import yaml

        sc = ROOT / "config" / "search.yaml"
        data: dict = {}
        if sc.exists():
            data = yaml.safe_load(sc.read_text("utf-8")) or {}
        boards = data.get("boards", [])
        targets = []
        for b in boards:
            if not b.get("enabled", True):
                continue
            bid = b.get("id", "")
            if bid in BOARD_JOBS_URLS:
                targets.append({"board": bid, "domain": b.get("domain", "")})
        return targets
    except Exception as e:
        log.warning(f"could not load search.yaml: {e}")
    return []


def fetch_json(url: str, timeout: int = 15) -> Optional[dict]:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "JobBot/1.0 (headless; educational)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.debug(f"fetch failed {url}: {e}")
        return None


def parse_greenhouse(data: dict) -> list[dict]:
    rows = []
    for job in data.get("jobs", []):
        title = job.get("title", "?")
        company = job.get("company_name", "?")
        location = ", ".join(job.get("location", {}).get("name", []) or ["Remote"])
        url = job.get("absolute_url", job.get("url", ""))
        desc = (job.get("content") or "")[:2000]
        rows.append(
            {
                "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "Job Title": title,
                "Position": title,
                "Company": company,
                "Location": location,
                "Platform": "Greenhouse",
                "URL": url,
                "Status": "discovered",
                "Notes": "source=ats-greenhouse",
                "Description": desc,
            }
        )
    return rows


def parse_lever(data: list) -> list[dict]:
    rows = []
    for job in data:
        title = job.get("text", "?")
        company = job.get("companyName", "?")
        location = ", ".join(
            [a.get("value", "") for a in job.get("location", [])] or ["Remote"]
        )
        url = job.get("absolute_url", job.get("url", ""))
        desc = (job.get("description", "") or job.get("description_plain", "") or "")[
            :2000
        ]
        rows.append(
            {
                "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "Job Title": title,
                "Position": title,
                "Company": company,
                "Location": location,
                "Platform": "Lever",
                "URL": url,
                "Status": "discovered",
                "Notes": "source=ats-lever",
                "Description": desc,
            }
        )
    return rows


def parse_ashby(data: dict) -> list[dict]:
    rows = []
    for job in data.get("jobs", []):
        title = job.get("title", "?")
        location = job.get("location", {}).get("name", "Remote")
        url = job.get("applyUrl", job.get("url", ""))
        desc = (job.get("description") or "")[:2000]
        rows.append(
            {
                "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "Job Title": title,
                "Position": title,
                "Company": "Ashby",
                "Location": location,
                "Platform": "Ashby",
                "URL": url,
                "Status": "discovered",
                "Notes": "source=ats-ashby",
                "Description": desc,
            }
        )
    return rows


def parse_smartrecruiters(data: dict) -> list[dict]:
    rows = []
    for job in data.get("content", {}).get("postings", []):
        title = job.get("title", "?")
        company = job.get("company", {}).get("name", "?")
        location = (
            job.get("location", {}).get("city", "")
            + ", "
            + job.get("location", {}).get("country", "")
        )
        url = job.get("applyUrl", "")
        desc = (job.get("description", "") or "")[:2000]
        rows.append(
            {
                "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "Job Title": title,
                "Position": title,
                "Company": company,
                "Location": location or "Remote",
                "Platform": "SmartRecruiters",
                "URL": url,
                "Status": "discovered",
                "Notes": "source=ats-smartrecruiters",
                "Description": desc,
            }
        )
    return rows


ATS_PARSERS = {
    "greenhouse": parse_greenhouse,
    "lever": parse_lever,
    "ashby": parse_ashby,
    "smartrecruiters": parse_smartrecruiters,
}


def ats_scrape_all() -> list[dict]:
    results: list[dict] = []
    targets = load_targets()
    log.info(f"ATS targets: {targets}")
    for target in targets:
        board = target["board"]
        domain = target.get("domain", "")
        if not domain:
            continue
        url_template = BOARD_JOBS_URLS.get(board, "")
        if not url_template:
            continue
        url = url_template.replace("{domain}", domain)
        log.info(f"scraping {board} {domain} -> {url}")
        data = fetch_json(url)
        if not data:
            continue
        parser = ATS_PARSERS.get(board)
        if parser:
            try:
                rows = parser(data)
                log.info(f"{board}: {len(rows)} rows")
                results.extend(rows)
            except Exception as e:
                log.error(f"parse error for {board}: {e}")
    return results


if __name__ == "__main__":
    rows = ats_scrape_all()
    print(f"ATS rows: {len(rows)}")
    for r in rows[:5]:
        print(f"  {r['Platform']}: {r['Job Title']} @ {r['Company']}")
