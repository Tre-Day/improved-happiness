"""qa.py — per-profile screening Q&A library."""

from __future__ import annotations
import yaml, json
from pathlib import Path
import os

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))


def lib_path(pid="default"):
    return ROOT / f"config/profiles/{pid}.qa.yaml"


def load_qa(pid="default") -> list:
    p = lib_path(pid)
    if p.exists():
        try:
            return yaml.safe_load(p.read_text("utf-8")) or []
        except:
            return []
    return []


def save_qa(pid, items):
    p = lib_path(pid)
    p.write_text(yaml.dump(items, sort_keys=False), encoding="utf-8")


def answer_for(question, pid="default"):
    q = question.lower()
    for item in load_qa(pid):
        if (
            item.get("question", "").lower() in q
            or q in item.get("question", "").lower()
        ):
            return item.get("answer")
    # generic fallbacks
    if "salary" in q:
        return "Open to discussion — competitive with market for remote roles."
    if "sponsor" in q:
        return "No sponsorship required."
    if "remote" in q:
        return "Yes — I work remote (USA)."
    if "years" in q or "experience" in q:
        return "8+ years relevant experience."
    return None
