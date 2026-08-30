# Contributing

Thanks for helping `improved-happiness` (JobBot Desktop)!

## Quick start

```bash
npm install
npm run dev
# Python
python -m venv venv
venv\Scripts\pip install playwright pyyaml flask
venv\Scripts\playwright install chromium
```

## Branches

* `main` — protected. PRs require `tsc --noEmit` + `vite build` + `python -m py_compile backend/**/*.py`.

## Adding a board (e.g. FlexJobs)

1. `config/search.yaml` → `boards: - id: flexjobs, label: FlexJobs, enabled: true, domain: flexjobs.com`
2. If JSON API exists add to `backend/scraper/ats_adapter.py`, else it falls back to Playwright headless.

## Adding a profile

Copy `config/profile.example.yaml` → `config/profiles/<slug>.yaml` or use **The Couch** UI. Never commit personal `config/profile.yaml` or `config/profiles/*.yaml` except `default.yaml` template.

## Security

See `SECURITY.md`. Never log passwords. Use `safeStorage` vault, not `master.csv` in PRs.

## Commits

`type(scope): imperative <=72 chars` — one task = one commit. See `.agents` README.

## Tests

* `npm run typecheck` / `npx tsc --noEmit`
* `npx vite build`
* `python -m py_compile backend/**/*.py`
