"""creds.py — single chokepoint for all secrets.

Loads config/keys.yaml (or falls back to env vars).
Never logs or exposes passwords. Use password_for() only inside
in-process auth flows (never IPC).
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))
KEYS_YAML = ROOT / "config" / "keys.yaml"
MASTER_CSV = ROOT / "config" / "master.csv"


@dataclass(frozen=True)
class SafeRow:
    name: str
    url: str
    username: str
    note: str = ""

    @property
    def host(self) -> str:
        u = self.url.lower()
        if "://" in u:
            u = u.split("://", 1)[1]
        return u.split("/", 1)[0]


@dataclass
class Credentials:
    _rows: list[dict] = field(default_factory=list)

    @classmethod
    def load(cls) -> "Credentials":
        c = cls()
        path = str(MASTER_CSV) if MASTER_CSV.exists() else None
        if not path:
            return c
        with open(path, newline="", encoding="utf-8") as f:
            c._rows = [
                {
                    k: (r.get(k) or "").strip()
                    for k in ("name", "url", "username", "password", "note")
                }
                for r in csv.DictReader(f)
            ]
        return c

    def lookup(self, host: str) -> Optional[SafeRow]:
        host = host.lower().lstrip("www.")
        for r in self._rows:
            url = r["url"].lower()
            if "://" in url:
                url = url.split("://", 1)[1]
            uh = url.split("/", 1)[0].lstrip("www.")
            if uh == host or uh.endswith("." + host) or host.endswith("." + uh):
                return SafeRow(
                    name=r["name"], url=r["url"], username=r["username"], note=r["note"]
                )
        return None

    def find_by_username(self, username: str) -> Optional[SafeRow]:
        u = username.lower()
        for r in self._rows:
            if r["username"].lower() == u:
                return SafeRow(
                    name=r["name"], url=r["url"], username=r["username"], note=r["note"]
                )
        return None

    def password_for(self, name: str) -> Optional[str]:
        for r in self._rows:
            if r["name"].lower() == name.lower():
                return r["password"] or None
        return None

    def password_for_host(self, host: str) -> Optional[tuple[SafeRow, str]]:
        host = host.lower().lstrip("www.")
        for r in self._rows:
            url = r["url"].lower()
            if "://" in url:
                url = url.split("://", 1)[1]
            uh = url.split("/", 1)[0].lstrip("www.")
            if uh == host or uh.endswith("." + host) or host.endswith("." + uh):
                return (
                    SafeRow(
                        name=r["name"],
                        url=r["url"],
                        username=r["username"],
                        note=r["note"],
                    ),
                    r["password"] or "",
                )
        return None


# ── API key vault (env-var first, file second) ──────────────────────────────


def get_api_key(provider: str) -> Optional[str]:
    env_key = f"JOBBOT_{provider.upper().replace('-', '_')}_API_KEY"
    val = os.environ.get(env_key)
    if val:
        return val
    try:
        import yaml

        if KEYS_YAML.exists():
            keys = yaml.safe_load(KEYS_YAML.read_text("utf-8")) or []
            for k in keys:
                if (
                    isinstance(k, dict)
                    and k.get("provider", "").lower() == provider.lower()
                ):
                    if k.get("apiKey"):
                        return k["apiKey"]
    except Exception:
        pass
    return None


def get_base_url(provider: str) -> Optional[str]:
    env_key = f"JOBBOT_{provider.upper().replace('-', '_')}_BASE_URL"
    val = os.environ.get(env_key)
    if val:
        return val
    try:
        import yaml

        if KEYS_YAML.exists():
            keys = yaml.safe_load(KEYS_YAML.read_text("utf-8")) or []
            for k in keys:
                if (
                    isinstance(k, dict)
                    and k.get("provider", "").lower() == provider.lower()
                ):
                    if k.get("baseUrl"):
                        return k["baseUrl"]
    except Exception:
        pass
    return None
