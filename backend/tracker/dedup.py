"""dedup.py — URL-normalized deduplication for tracker.csv.

Strips tracking params (?utm_source, ?trk=, etc.) before comparing.
Keeps the first occurrence. Safe to re-run.
"""

from __future__ import annotations

import csv
import logging
import os
import re
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="[dedup] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))
TRACKER_CSV = ROOT / "data" / "tracker.csv"

TRACK_STRIP = re.compile(
    r"(\?.*?)?("
    r"utm_source|utm_medium|utm_campaign|utm_content|utm_term|"
    r"trk=|trk=|ref=|ref=|source=|mc_|mc-|fbclid|"
    r"gclid|gclsrc|dclid|msclkid|twclid|piclid|li_fa_id|"
    r"__s=|__t=|sid=|ss=|ee=|efg=).*?$",
    re.IGNORECASE,
)


def normalize_url(url: str) -> str:
    if not url:
        return ""
    url = url.strip()
    url = re.sub(TRACK_STRIP, r"\1", url, flags=re.IGNORECASE)
    return url.rstrip("?&")


def dedup_csv(path: Path) -> int:
    if not path.exists():
        log.warning(f"tracker not found: {path}")
        return 0
    seen: set[str] = set()
    rows: list[dict] = []
    removed = 0
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            url = normalize_url(row.get("URL", "") or row.get("Link", ""))
            if not url:
                rows.append(row)
                continue
            if url not in seen:
                seen.add(url)
                rows.append(row)
            else:
                removed += 1
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    log.info(f"dedup: removed {removed} duplicates, {len(rows)} rows remain")
    return removed


if __name__ == "__main__":
    n = dedup_csv(TRACKER_CSV)
    print(f"removed {n} duplicates")
    sys.exit(0)
