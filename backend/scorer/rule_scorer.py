"""rule_scorer.py — port of score_tracker.py with YAML config.

Scores every row in data/tracker.csv and writes data/tracker-scored.csv.
Run after dedup. Compatible with the original scoring rules.
"""

from __future__ import annotations

import csv
import os
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from scorer.llm_rerank import ollama_available, ollama_chat

logging.basicConfig(
    level=logging.INFO, format="[rule-scorer] %(levelname)s %(message)s"
)
log = logging.getLogger(__name__)

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))
TRACKER_CSV = ROOT / "data" / "tracker.csv"
SCORED_CSV = ROOT / "data" / "tracker-scored.csv"
CONFIG_DIR = ROOT / "config"


def _load_profile_scoring() -> tuple[
    set[str], set[str], set[str], list[str], list[str]
]:
    """Load scoring sets from profile if present — otherwise use neutral defaults.
    No hardcodes: if profile has target_roles/keywords, those win.
    """
    try:
        import yaml

        for p in [
            CONFIG_DIR / "profile.yaml",
            CONFIG_DIR / "profiles" / "default.yaml",
        ]:
            if p.exists():
                data = yaml.safe_load(p.read_text("utf-8")) or {}
                tr = data.get("target_roles") or {}
                kw = data.get("keywords") or {}
                if tr or kw:
                    top = set(s.lower() for s in (tr.get("top") or []))
                    mid = set(s.lower() for s in (tr.get("mid") or []))
                    entry = set(s.lower() for s in (tr.get("entry") or []))
                    include = [k.lower() for k in (kw.get("include") or [])]
                    exclude = [k.lower() for k in (kw.get("exclude") or [])]
                    return top, mid, entry, include, exclude
    except Exception:
        pass
    return set(), set(), set(), [], []


# Defaults — example / fallback. Real scoring comes from profile → search.yaml keywords.
# Kept as neutral supply-chain example so a fresh clone still has something to run
# before the user creates a profile; profiles override these at load time.
TOP_ROLES = {
    "procurement manager",
    "senior procurement manager",
    "director",
    "supply chain manager",
    "category manager",
    "sourcing manager",
    "strategic sourcing",
    "vendor manager",
    "contracts manager",
    "procurement director",
    "supply chain director",
    "lead",
}
MID_ROLES = {
    "buyer",
    "purchasing",
    "supply chain analyst",
    "planner",
    "supply chain coordinator",
    "purchasing manager",
    "purchasing agent",
}
ENTRY_ROLES = {
    "procurement coordinator",
    "procurement analyst",
    "junior buyer",
    "purchasing clerk",
    "procurement specialist",
}

EXCLUDE_KW = [
    "software engineer",
    "senior software engineer",
    "staff engineer",
    "frontend developer",
    "backend developer",
    "full stack developer",
    "registered nurse",
    "nurse practitioner",
    "physician assistant",
    "mechanical engineer",
    "electrical engineer",
    "civil engineer",
    "data scientist",
    "machine learning",
    "devops",
    "site reliability",
    "cybersecurity",
    "security engineer",
    "product manager",
    "marketing manager",
    "sales manager",
    "account manager",
    "human resources",
    "hr generalist",
    "recruiter",
    "talent acquisition",
    "financial analyst",
    "accountant",
    "auditor",
    "tax",
    "warehouse worker",
    "forklift",
    " CDL ",
    "truck driver",
    "warehouse associate",
    "food service",
    "restaurant",
    "barista",
    "cashier",
    "retail associate",
    "customer service",
    "call center",
    "help desk",
    "IT support",
    "construction",
    "welder",
    "machinist",
    "cnc",
    "production operator",
]

SC_KW = [
    "procurement",
    "sourcing",
    "supply chain",
    "logistics",
    "purchasing",
    "vendor management",
    "vendor",
    "category manager",
    "strategic sourcing",
    "contracts",
    "procurement strategy",
    "spend management",
    "cost reduction",
    "procure-to-pay",
    "purchase order",
    "RFX",
    "RFQ",
    "bid analysis",
    "supplier risk",
    "supplier performance",
    "SRM",
    "ERP",
    "SAP",
    "Oracle",
    "cloud platforms",
    "workday",
    "Ariba",
    " Coupa",
    "Basware",
    "S&OP",
    "demand planning",
    "inventory optimization",
    "demand forecasting",
    "lean six sigma",
    "six sigma",
    "lean",
    "process improvement",
    "KPI",
    "OKR",
    "dashboards",
    "financial performance",
    "cost savings",
    "negotiation",
    "stakeholder",
    "cross-functional",
    "leadership",
    "team lead",
    "people management",
    "strategic",
    "transformation",
    "digital transformation",
    "cloud",
    "integration",
    "implementation",
    "procurement technology",
    "procurement analytics",
    "spend analytics",
    "e-procurement",
    "e-sourcing",
    "reverse auction",
    "supplier diversity",
    "L1",
    "L2",
    "L3",
    "procurement operations",
    "procurement analytics",
]

REMOTE_KW = [
    "remote",
    "from home",
    "work from home",
    "anywhere",
    "100% remote",
    "telecommute",
    "home based",
    "anywhere in",
    "across the US",
    "nationwide",
    "usa wide",
    "us wide",
    "can work from anywhere",
]

EMPLOYERS = [
    "walmart",
    "target",
    "amazon",
    "costco",
    "kroger",
    "home depot",
    "lowe",
    "best buy",
    "macys",
    "kohl",
    "jcpenney",
    "dollar general",
    " publix",
    "wegmans",
    "whole foods",
    "trader joe",
    "albertsons",
    "safeway",
    "ahold",
    "aldi",
    "lidl",
    "sams club",
]


def load_locations() -> list[dict]:
    try:
        import yaml

        sc = CONFIG_DIR / "search.yaml"
        if sc.exists():
            data = yaml.safe_load(sc.read_text("utf-8")) or {}
            locs = data.get("locations", [])
            if locs:
                return locs
    except Exception:
        pass
    return [
        {
            "label": "FL",
            "bonus": 10,
            "queries": [
                "tampa",
                "orlando",
                "florida",
                "miami",
                "jax",
                "ft. lauderdale",
                "sarasota",
            ],
        },
        {
            "label": "SE",
            "bonus": 6,
            "queries": [
                "atlanta",
                "georgia",
                "charlotte",
                "north carolina",
                "nashville",
                "tennessee",
            ],
        },
        {
            "label": "TX/MIDWEST",
            "bonus": 4,
            "queries": ["chicago", "illinois", "dallas", "texas", "houston", "austin"],
        },
    ]


def _effective_scoring() -> tuple[set[str], set[str], set[str], list[str], list[str]]:
    top, mid, entry, inc, exc = _load_profile_scoring()
    # Profile overrides win; otherwise use search.yaml keywords + defaults
    if not inc:
        try:
            import yaml

            sc = CONFIG_DIR / "search.yaml"
            if sc.exists():
                data = yaml.safe_load(sc.read_text("utf-8")) or {}
                inc = [k.lower() for k in (data.get("keywords") or [])]
        except Exception:
            pass
    return (
        top or TOP_ROLES,
        mid or MID_ROLES,
        entry or ENTRY_ROLES,
        inc or SC_KW,
        exc or EXCLUDE_KW,
    )


def score_row(row: dict) -> tuple[int, list[str]]:
    top_roles, mid_roles, entry_roles, sc_kw, exclude_kw = _effective_scoring()
    title = (row.get("Job Title") or row.get("Title") or "").lower()
    company = (row.get("Company") or "").lower()
    desc = ((row.get("Description") or "") + " " + title + " " + company).lower()
    loc = (row.get("Location") or "").lower()
    score = 0
    reasons: list[str] = []

    for kw in exclude_kw:
        if kw.lower() in desc or kw.lower() in title:
            return (-999, [f"EXCLUDED: {kw}"])

    if any(r in title for r in top_roles):
        score += 40
        reasons.append("top_role_match")
    elif any(r in title for r in mid_roles):
        score += 28
        reasons.append("mid_role_match")
    elif any(r in title for r in entry_roles):
        score += 15
        reasons.append("entry_role_match")

    sc_matches = [kw for kw in sc_kw if kw.lower() in desc]
    sc_bonus = min(len(sc_matches) * 2, 24)
    score += sc_bonus
    if sc_matches:
        reasons.append(f"sc_kw({len(sc_matches)})")

    if any(r in loc or r in title for r in REMOTE_KW):
        score += 10
        reasons.append("remote")
    elif "remote" in desc:
        score += 7
        reasons.append("remote_in_desc")

    locations = load_locations()
    for loc_cfg in locations:
        if any(q in loc for q in loc_cfg.get("queries", [])):
            score += loc_cfg.get("bonus", 0)
            reasons.append(loc_cfg.get("label", "loc"))
            break
    else:
        if "remote" not in loc and loc.strip():
            score -= 3
            reasons.append("non-preferred_loc")

    competitors = [e for e in EMPLOYERS if e in company]
    if competitors:
        score -= 5
        reasons.append(f"retail_competitor({competitors})")

    green = [
        "$",
        "cost reduction",
        "savings",
        "impact",
        "leadership",
        "cross-functional",
        "strategic",
        "team",
        " ERP",
        "SAP",
        "Oracle",
        "director",
        "manager",
        "senior",
        "principal",
    ]
    green_count = sum(1 for g in green if g in desc)
    score += min(green_count, 8)

    return score, reasons


def main() -> int:
    if not TRACKER_CSV.exists():
        log.error(f"tracker not found: {TRACKER_CSV}")
        return 1

    rows = []
    with open(TRACKER_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            score, reasons = score_row(row)
            row["score"] = score
            row["reasons"] = "|".join(reasons)
            rows.append(row)

    rows.sort(key=lambda r: int(r.get("score", 0)), reverse=True)

    if not rows:
        return 0

    fieldnames = list(rows[0].keys())
    with open(SCORED_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    bands = {
        "score>=70": 0,
        "score_50-69": 0,
        "score_30-49": 0,
        "score_<30": 0,
        "excluded": 0,
    }
    for r in rows:
        s = int(r.get("score", 0))
        if s < -900:
            bands["excluded"] += 1
        elif s >= 70:
            bands["score>=70"] += 1
        elif s >= 50:
            bands["score_50-69"] += 1
        elif s >= 30:
            bands["score_30-49"] += 1
        else:
            bands["score_<30"] += 1

    top = bands["score>=70"] + bands["score_50-69"]
    log.info(f"scored {len(rows)} rows; {top} top targets (>=50); bands={bands}")
    print(f"scored {len(rows)} rows; {top} top targets (>=50)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
