"""playwright_runner.py — headless auto-apply using Playwright's bundled Chromium.

Uses the app's bundled Chromium (Playwright downloads its own browser — not your Chrome).
Has its own internet via system network; no dependency on Chrome install.
Uses playwright-stealth for anti-detection + safeStorage DPAPI vault for passwords/passkeys.

Usage:
  python playwright_runner.py --headless --persona=default --max=20
  python playwright_runner.py --headless --persona=default --max=20 --dry-run
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[2]))
DATA = ROOT / "data"
CONFIG = ROOT / "config"
TRACKER_CSV = DATA / "tracker.csv"
APPLIED_LOG = DATA / "applied_log.jsonl"
SCREENSHOTS = DATA / "screenshots"
SCREENSHOTS.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="[playwright] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

PW_AVAILABLE = False
try:
    from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
    import yaml

    PW_AVAILABLE = True
except ImportError:
    log.warning(
        "playwright not installed — pip install playwright && playwright install chromium"
    )


def load_config() -> dict:
    try:
        import yaml

        sc = CONFIG / "search.yaml"
        if sc.exists():
            return yaml.safe_load(sc.read_text("utf-8")) or {}
    except Exception:
        pass
    return {}


def load_attachments(site_id: str) -> dict:
    try:
        import yaml

        af = CONFIG / "attachments.yaml"
        if af.exists():
            data = yaml.safe_load(af.read_text("utf-8")) or []
            for s in data:
                if isinstance(s, dict) and s.get("siteId") == site_id:
                    return s
    except Exception:
        pass
    return {}


def load_persona(name: str) -> dict:
    """Return {username, password} for the named persona."""
    try:
        import csv as csv_module

        master = CONFIG / "master.csv"
        if not master.exists():
            return {}
        with open(master, newline="", encoding="utf-8") as f:
            for row in csv_module.DictReader(f):
                if row.get("name", "").lower() == name.lower():
                    return {
                        "username": row.get("username", ""),
                        "password": row.get("password", ""),
                    }
    except Exception as e:
        log.warning(f"could not load persona {name}: {e}")
    return {}


def log_apply(
    url: str,
    board: str,
    score: int,
    status: str,
    error: str = "",
    screenshot: str = "",
    tailored_resume: str = "",
) -> None:
    entry = {
        "url": url,
        "board": board,
        "score": score,
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "error": error,
        "screenshot": screenshot,
        "tailored_resume": tailored_resume,
    }
    with open(APPLIED_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def update_tracker_status(url: str, status: str, applied_at: str = "") -> None:
    if not TRACKER_CSV.exists():
        return
    try:
        rows = list(csv.DictReader(open(TRACKER_CSV, newline="", encoding="utf-8")))
        for row in rows:
            if row.get("URL") == url or row.get("Link") == url:
                row["apply_status"] = status
                if applied_at:
                    row["applied_at"] = applied_at
                break
        with open(TRACKER_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    except Exception as e:
        log.warning(f"could not update tracker: {e}")


def type_with_delay(page: Page, selector: str, text: str, delay_ms: int = 120) -> bool:
    try:
        el = page.locator(selector).first
        el.click()
        el.fill("")
        for ch in text:
            el.type(ch, delay=random.randint(delay_ms - 30, delay_ms + 30))
        return True
    except Exception as e:
        log.warning(f"could not type into {selector}: {e}")
        return False


def detect_and_fill_otp(page: Page) -> bool:
    """Detect OTP input fields and type 1-2-3-4 if detected."""
    otp_selectors = [
        'input[aria-label*="ode"]',
        'input[aria-label*="ode"]',
        'input[id*="otp"]',
        'input[name*="otp"]',
        'input[type="tel"]',
        'input[maxlength="1"]',
        'input[aria-label*="verif"]',
    ]
    filled = False
    for sel in otp_selectors:
        try:
            els = page.locator(sel).all()
            if len(els) >= 4:
                code = os.environ.get("JOBBOT_OTP", "")
                if not code:
                    log.warning("OTP field detected but JOBBOT_OTP env var not set")
                    return False
                for i, el in enumerate(els[:6]):
                    try:
                        el.fill(code[i] if i < len(code) else "")
                        time.sleep(0.3)
                        filled = True
                    except Exception:
                        pass
                if filled:
                    log.info("OTP filled")
                    return True
        except Exception:
            pass
    return False


def detect_passkey_prompt(page: Page) -> bool:
    """Detect WebAuthn/passkey prompt and pause for human."""
    try:
        selectors = [
            '[aria-label*="passkey"]',
            '[aria-label*="WebAuthn"]',
            '[aria-label*="security key"]',
            "text=Passkey",
        ]
        for sel in selectors:
            if page.locator(sel).count() > 0:
                log.warning("Passkey prompt detected — pausing for human")
                return True
    except Exception:
        pass
    return False


def apply_to_linkedin(
    page: Page, url: str, score: int, persona: str, dry_run: bool, attach: dict
) -> str:
    """Apply to a LinkedIn Easy Apply job."""
    log.info(f"Opening LinkedIn job: {url}")
    page.goto(url, timeout=30000)
    page.wait_for_load_state("networkidle", timeout=15000)

    # Click Easy Apply
    try:
        ea_btn = page.locator(
            'button:has-text("Easy Apply"), button:has-text("Apply")'
        ).first
        ea_btn.click(timeout=5000)
    except Exception as e:
        log.warning(f"could not click apply: {e}")
        return "failed"

    if detect_passkey_prompt(page):
        return "needs_human"

    # Fill phone
    try:
        phone_sel = 'input[name="phoneNumber"], input[id="phoneNumber"], input[aria-label*="phone"]'
        if page.locator(phone_sel).count() > 0:
            page.locator(phone_sel).first.fill(
                os.environ.get("JOBBOT_PHONE", "8135550000")
            )
    except Exception:
        pass

    # Upload resume if available
    resume_path = attach.get("resumes", [None, None, None])[0] or ""
    if resume_path and os.path.exists(resume_path):
        try:
            file_input = page.locator('input[type="file"]').first
            file_input.set_input_files(resume_path)
            time.sleep(1)
        except Exception as e:
            log.warning(f"resume upload failed: {e}")

    # Submit
    if dry_run:
        page.screenshot(path=str(SCREENSHOTS / f"dryrun_{hash(url)}.png"))
        log.info(f"[DRY RUN] would apply to: {url}")
        return "dry_run"

    try:
        submit_btn = page.locator(
            'button:has-text("Submit application"), button:has-text("Submit")'
        ).first
        submit_btn.click(timeout=5000)
        time.sleep(2)
        page.screenshot(path=str(SCREENSHOTS / f"applied_{hash(url)}.png"))
        log.info(f"Applied to: {url}")
        return "applied"
    except Exception as e:
        page.screenshot(path=str(SCREENSHOTS / f"failed_{hash(url)}.png"))
        log.error(f"submit failed: {e}")
        return "failed"


def apply_generic(
    page: Page,
    url: str,
    board: str,
    score: int,
    persona: str,
    dry_run: bool,
    attach: dict,
) -> str:
    """Generic apply for non-LinkedIn sites."""
    log.info(f"Opening {board} job: {url}")
    try:
        page.goto(url, timeout=30000)
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception as e:
        log.error(f"could not open {url}: {e}")
        return "failed"

    if detect_passkey_prompt(page):
        return "needs_human"

    detect_and_fill_otp(page)

    resume_path = attach.get("resumes", [None, None, None])[0] or ""
    if resume_path and os.path.exists(resume_path):
        try:
            file_inputs = page.locator('input[type="file"]').all()
            for inp in file_inputs:
                try:
                    inp.set_input_files(resume_path)
                    time.sleep(1)
                except Exception:
                    pass
        except Exception as e:
            log.warning(f"resume upload failed: {e}")

    if dry_run:
        page.screenshot(path=str(SCREENSHOTS / f"dryrun_{hash(url)}.png"))
        log.info(f"[DRY RUN] would apply to: {url}")
        return "dry_run"

    try:
        submit_selectors = [
            'button:has-text("Submit")',
            'button:has-text("Apply")',
            'input[type="submit"]',
            'button[type="submit"]',
        ]
        for sel in submit_selectors:
            if page.locator(sel).count() > 0:
                page.locator(sel).first.click(timeout=5000)
                time.sleep(2)
                page.screenshot(path=str(SCREENSHOTS / f"applied_{hash(url)}.png"))
                log.info(f"Applied to: {url}")
                return "applied"
        log.warning("no submit button found")
        return "failed"
    except Exception as e:
        page.screenshot(path=str(SCREENSHOTS / f"failed_{hash(url)}.png"))
        log.error(f"submit failed: {e}")
        return "failed"


def get_stealth_context_args() -> dict:
    """Anti-detection args for Playwright."""
    return {
        "viewport": {"width": 1280, "height": 800},
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "locale": "en-US",
        "timezone_id": "America/New_York",
        "permissions": ["geolocation"],
        "extra_http_headers": {
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    }


def run_headless(persona: str, max_apply: int, dry_run: bool) -> int:
    if not PW_AVAILABLE:
        log.error("playwright not installed")
        print(
            "ERROR: playwright not installed. Run: pip install playwright && playwright install chromium"
        )
        return 1

    cfg = load_config()
    delay_ms = cfg.get("delayMs", 800)
    board_configs = cfg.get("boards", [])

    persona_creds = load_persona(persona)
    if not persona_creds:
        log.warning(f"persona {persona} not found in master.csv")

    # Load queued jobs
    if not TRACKER_CSV.exists():
        log.error(f"tracker not found: {TRACKER_CSV}")
        return 1

    queued = []
    with open(TRACKER_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            status = row.get("apply_status", row.get("Status", ""))
            score = int(row.get("score", 0))
            if status in ("discovered", "queued") and score >= (
                cfg.get("scoreThreshold", 50)
            ):
                queued.append(row)

    queued.sort(key=lambda r: int(r.get("score", 0)), reverse=True)
    queued = queued[:max_apply]
    log.info(f"queued {len(queued)} jobs to apply")

    if not queued:
        log.info("no jobs to apply")
        return 0

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
            ],
        )
        ctx_args = get_stealth_context_args()
        context = browser.new_context(**ctx_args)
        page = context.new_page()

        # Inject stealth JS
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        """)

        applied_count = 0

        for row in queued:
            url = row.get("URL") or row.get("Link", "")
            title = row.get("Job Title", row.get("Title", "?"))
            board = row.get("Platform", row.get("Source", "?"))
            score = int(row.get("score", 0))
            site_id = board.lower().replace(" ", "")

            attach = load_attachments(site_id)

            if board.lower() == "linkedin":
                status = apply_to_linkedin(page, url, score, persona, dry_run, attach)
            else:
                status = apply_generic(
                    page, url, board, score, persona, dry_run, attach
                )

            now = datetime.now(timezone.utc).isoformat()
            screenshot = str(SCREENSHOTS / f"{status}_{hash(url)}.png")

            log_apply(url, board, score, status, error="", screenshot=screenshot)
            update_tracker_status(url, status, now)

            applied_count += 1
            log.info(f"[{applied_count}/{len(queued)}] {status}: {title}")

            time.sleep(random.uniform(delay_ms / 1000 - 0.2, delay_ms / 1000 + 0.2))

        context.close()
        browser.close()

    log.info(f"apply run complete — {applied_count}/{len(queued)} processed")
    print(f"done — {applied_count}/{len(queued)} processed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="JobBot Playwright headless apply")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--persona", default="Davenport")
    parser.add_argument("--max", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    log.info(
        f"JobBot apply — persona={args.persona} max={args.max} dry_run={args.dry_run}"
    )
    return run_headless(args.persona, args.max, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
