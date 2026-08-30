"""parser.py — PDF/DOCX → profile auto-fill (lightweight)."""

from __future__ import annotations
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            import PyPDF2  # optional

            reader = PyPDF2.PdfReader(str(path))
            return "\n".join([(p.extract_text() or "") for p in reader.pages])
        except:
            # fallback: read raw
            return path.read_bytes().decode(errors="ignore")[:8000]
    if suffix in (".docx", ".doc"):
        try:
            import docx

            d = docx.Document(str(path))
            return "\n".join([p.text for p in d.paragraphs])
        except:
            return path.read_bytes().decode(errors="ignore")[:8000]
    return path.read_text(encoding="utf-8", errors="ignore")[:8000]


def parse_resume(text: str) -> dict:
    name = re.search(r"^([A-Z][a-z]+ [A-Z][a-z]+)", text.strip())
    headline = re.search(
        r"(Senior|Lead|Manager|Engineer|Designer|Analyst)[^\n]{0,60}", text, re.I
    )
    years = re.search(r"(\d+)\+?\s+years", text, re.I)
    skills = []
    for kw in [
        "Python",
        "React",
        "TypeScript",
        "Design System",
        "Figma",
        "Research",
        "Supply Chain",
        "Procurement",
        "Logistics",
        "Operations",
        "Excel",
        "SQL",
    ]:
        if kw.lower() in text.lower():
            skills.append(kw)
    return {
        "name": name.group(1).strip() if name else "",
        "headline": headline.group(0).strip()[:80] if headline else "",
        "years_exp": years.group(1) if years else "",
        "skills": skills[:8],
        "summary": text.strip()[:600],
    }


if __name__ == "__main__":
    import json

    if len(sys.argv) < 2:
        print(json.dumps(parse_resume(sys.stdin.read())))
    else:
        p = Path(sys.argv[1])
        print(json.dumps(parse_resume(extract_text(p)), indent=2))
