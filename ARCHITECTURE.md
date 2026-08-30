# Architecture — JobBot Desktop (improved-happiness)

## Overview

Electron + React + TypeScript frontend, Python backend (scraper, scorer, headless Playwright), YAML config, DPAPI vault.

## Modules

* **The Couch** `src/views/CouchView.tsx` — profile CRUD (unlimited profiles, capabilities: skills, target_roles top/mid/entry, keywords include/exclude, remote_keywords, locations). Writes `config/profiles/<id>.yaml`.
* **Search** `src/views/SearchView.tsx` — boards (extensible, + FlexJobs), keywords, locations (all-remote, multiple Remote USA/State, bonus/mode), sliders (threshold, maxApply, delay).
* **Attach** `src/views/AttachView.tsx` — per-profile per-site unlimited resumes `resumes: string[]` + cover/portfolio/linkedinUrl. Files `config/profiles/<id>.attachments.yaml`.
* **Keys** `src/views/KeysView.tsx` — BYOK, Ollama fallback chain.
* **Run** `src/views/RunView.tsx` — persona = active profile, dry-run, headless.
* **Report** `src/views/ReportView.tsx` + `data/report.html` — file audit.
* **ChatOverlay** `src/components/ChatOverlay.tsx` — bottom-fixed, every page, LLM, commands (`set max applies to 15`).
* **LaziBot** `src/components/LaziBot.tsx` — fat dirty SVG, no hard hat.
* **Electron** `electron/main.ts` — `safeStorage` DPAPI vault, `fs:read/write`, `py:run`, spawn `backend/api_server.py`.
* **Backend** `backend/scraper/*`, `backend/scorer/*`, `backend/applier/playwright_runner.py` (bundled Chromium, stealth), `backend/tracker/dedup.py`, `backend/creds.py`.

## Data flow

`Search → JobSpy/ATS/linkedin_guest → tracker.csv → dedup → rule_scorer (profile) → llm_rerank (Ollama) → tracker-scored.csv → playwright_runner (per-site resumes) → applied_log.jsonl → Report`

## Blast radius

* BR-1: `Couch` profile edit, `Search` locations, unlimited resumes (config only)
* BR-2: Scraper/ATS unified, Playwright headless, scoring
* BR-3: Vault/DPAPI, passkeys, auth

## Charts

See `README.md` mermaid graphs. For static charts, see `docs/charts/` (generated from `data/tracker.csv`).
