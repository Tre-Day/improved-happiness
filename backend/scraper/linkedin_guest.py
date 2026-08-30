"""linkedin_guest.py — public LinkedIn guest job search scraper.

No auth required. Subject to guest rate limits.
Hits https://www.linkedin.com/jobs/search with the same parameters
as the original scrape_linkedin.py.
"""

from __future__ import annotations

import csv
import html
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="[li-guest] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))
TRACKER_CSV = ROOT / "data" / "tracker.csv"

BASE = "https://www.linkedin.com/jobs/search"
PER_PAGE = 25
MAX_PAGES = 4
PAGE_DELAY = 2.0

TITLE_KEYWORDS = [
    "supply chain",
    "procurement",
    "sourcing",
    "logistics",
    "purchasing",
    "demand planning",
    "demand",
    "supply planner",
    "inventory",
    "materials management",
    "materials",
    "vendor management",
    "supplier",
    "category manager",
    "strategic sourcing",
    "freight",
    "distribution",
    "warehouse",
    "fulfillment",
    "operations manager",
    "operations director",
    "operations lead",
    "manufacturing manager",
    "production manager",
    "plant manager",
    "erp",
    "sap",
    "oracle",
    " Coupa",
    "Ariba",
]

REMOTE_FILTERS = "f_WT=2"  # Remote
EASY_APPLY_FILTER = "f_EA=true"


def fetch_page(
    keyword: str, page: int = 0, location: str = "Remote+United+States"
) -> Optional[str]:
    params = {
        "keywords": keyword,
        "location": location,
        "f_TPR": "",  # any time
        "f_WT": "2",  # remote
        "f_EA": "true",  # easy apply
        "start": page * PER_PAGE,
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.linkedin.com/",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 999:
            log.warning(f"LinkedIn rate-limited (999) on page {page}")
        else:
            log.warning(f"HTTP {e.code} on page {page}")
    except Exception as e:
        log.error(f"fetch error page {page}: {e}")
    return None


def parse_jobs(html_content: str) -> list[dict]:
    rows = []
    # LinkedIn renders jobs as <li> elements with data-job-id
    job_blocks = re.findall(
        r'<li[^>]*data-job-id=["\']?(\d+)["\']?[^>]*>.*?</li>',
        html_content,
        re.DOTALL | re.IGNORECASE,
    )
    title_re = re.compile(r'data-job-title=["\']([^"\']+)["\']')
    co_re = re.compile(r'data-job-company-name=["\']([^"\']+)["\']')
    loc_re = re.compile(r'data-job-single-location-text=["\']([^"\']+)["\']')
    link_re = re.compile(
        r'href=["\'](https://[^"\']*linkedin\.com/jobs/view/[^\?"\']+)["\']'
    )
    desc_re = re.compile(r'data-job-description=["\']([^"\']+)["\']')

    seen_ids: set[str] = set()
    for block in job_blocks:
        id_m = re.search(r'data-job-id=["\']?(\d+)["\']?', block)
        if not id_m:
            continue
        job_id = id_m.group(1)
        if job_id in seen_ids:
            continue
        seen_ids.add(job_id)

        title_m = title_re.search(block)
        co_m = co_re.search(block)
        loc_m = loc_re.search(block)
        desc_m = desc_re.search(block)
        links = link_re.findall(block)

        title = title_m.group(1) if title_m else "?"
        company = co_m.group(1) if co_m else "?"
        location = loc_m.group(1) if loc_m else "Remote"
        url = links[0] if links else f"https://www.linkedin.com/jobs/view/{job_id}"
        desc = html.unescape(desc_m.group(1) if desc_m else "")[:2000]

        rows.append(
            {
                "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "Job Title": html.unescape(title),
                "Position": html.unescape(title),
                "Company": html.unescape(company),
                "Location": html.unescape(location),
                "Platform": "LinkedIn",
                "URL": url,
                "Status": "discovered",
                "Notes": f"source=linkedin-guest",
                "Description": desc,
            }
        )

    # Fallback: parse JSON blobs embedded in __NEXT_DATA__
    if not rows:
        json_matches = re.findall(
            r'<script type="application/json"[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            html_content,
            re.DOTALL,
        )
        for m in json_matches:
            try:
                import json

                nd = json.loads(m)
                jobs_data = nd.get("props", {}).get("searchContent", {}).get("jobs", [])
                for job in jobs_data:
                    title = job.get("title", "?")
                    company = (
                        job.get("company", {}).get("name", "?")
                        if isinstance(job.get("company"), dict)
                        else job.get("company", "?")
                    )
                    location = job.get("location", "Remote")
                    url = f"https://www.linkedin.com/jobs/view/{job.get('jobId', '')}"
                    rows.append(
                        {
                            "Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                            "Job Title": title,
                            "Position": title,
                            "Company": company,
                            "Location": location,
                            "Platform": "LinkedIn",
                            "URL": url,
                            "Status": "discovered",
                            "Notes": "source=linkedin-guest-next-data",
                            "Description": str(job.get("description", ""))[:2000],
                        }
                    )
            except Exception:
                pass

    return rows


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
        return 0
    with open(TRACKER_CSV, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            w.writeheader()
        w.writerows(new_rows)
    return len(new_rows)


def scrape_for_keyword(keyword: str) -> int:
    all_rows = []
    for page in range(MAX_PAGES):
        log.info(f'  page {page + 1}/{MAX_PAGES} for "{keyword}"')
        html_content = fetch_page(keyword, page)
        if not html_content:
            break
        rows = parse_jobs(html_content)
        if not rows:
            break
        all_rows.extend(rows)
        time.sleep(PAGE_DELAY)
    return append_to_tracker(all_rows)


def main() -> int:
    log.info("linkedin_guest main")
    total = 0
    for kw in TITLE_KEYWORDS:
        n = scrape_for_keyword(kw)
        if n:
            log.info(f'"{kw}": {n} new rows')
            total += n
        time.sleep(1)
    log.info(f"done — {total} total new rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
