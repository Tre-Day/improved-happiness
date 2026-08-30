"""notify.py — webhook notifier (Discord/Telegram/generic)."""

from __future__ import annotations
import json, os, urllib.request
from pathlib import Path

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))
CFG = ROOT / "config" / "notifications.yaml"


def load_cfg():
    import yaml

    if CFG.exists():
        try:
            return yaml.safe_load(CFG.read_text("utf-8")) or {}
        except:
            return {}
    return {}


def send(event, payload):
    cfg = load_cfg()
    hooks = cfg.get("webhooks", [])
    if not hooks:
        return 0
    sent = 0
    for h in hooks:
        url = h.get("url")
        if not url or not h.get("enabled", True):
            continue
        body = json.dumps({"event": event, **payload}).encode()
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                if 200 <= r.status < 300:
                    sent += 1
        except Exception as e:
            print(f"notify {url} failed: {e}")
    return sent


if __name__ == "__main__":
    import sys

    print(send("test", {"msg": "hello from JobBot"}))
