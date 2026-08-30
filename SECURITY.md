# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x (JobBot Desktop) | ✅ |

## Local-Only Guarantee

* **No cloud.** All runs on your machine. `tracker.csv`, `applied_log.jsonl`, resumes under `data/`, and `config/credentials/*.enc.yaml` never leave disk.
* **Never committed.** `.gitignore` covers `config/profile.yaml`, `config/profiles/*.yaml`, `config/credentials/*`, `config/master.csv`, `config/keys.yaml`, `data/*.csv`, `.env`. Only `profile.example.yaml` and `default.yaml` template are committed.
* **Never logged.** `backend/creds.py` `SafeRow` hides password; `password_for()` only inside in-process auth, never IPC. Logs mask with `••••`.

## Passwords + Passkeys

* **DPAPI via Electron `safeStorage`** — Windows Data Protection API, per-Windows-user encryption. `ipcMain` `vault:encrypt/decrypt` in `electron/main.ts`. File is base64 ciphertext, decrypt only on that machine/user.
* **Passkeys (WebAuthn):** headless Playwright pauses on `authenticator` prompt; you approve via Windows Hello; handle stays in browser `user_data_dir` per profile. No secret export.
* **Alternative:** `keytar` (Windows Credential Manager) possible, but `safeStorage` is default (no master password, no server).
* **Chrome import:** optional one-time `Login Data` import helper, not default.

## Reporting a Vulnerability

Open an issue or email the maintainer. Do not include real credentials in reports. For encrypted vault issues, describe OS + Electron version, not ciphertext.

## MIT

MIT license — no warranty. Security is local DPAPI, not audited for enterprise.
