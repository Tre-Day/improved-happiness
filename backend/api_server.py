"""api_server.py — minimal Flask API the Electron main process spawns.

Listens on http://127.0.0.1:18765.
All routes mirror the ipcMain handlers in electron/main.ts so the
renderer can also call the Python side directly when in dev mode.
"""

from __future__ import annotations

import os
import sys
import json
import logging
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("ROOT") or str(Path(__file__).resolve().parents[1]))
DATA = ROOT / "data"
CONFIG = ROOT / "config"
DATA.mkdir(exist_ok=True)
CONFIG.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="[jobbot-api] %(levelname)s %(message)s")
log = logging.getLogger(__name__)

try:
    from flask import Flask, jsonify, request, send_file, Response
    import yaml

    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    log.warning("Flask not installed — API server unavailable")


def make_app() -> Any:
    if not FLASK_AVAILABLE:
        app = object()
        app.route = lambda *a, **k: lambda f: f
        return app

    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False

    def _read(rel: str) -> str:
        return (ROOT / rel).read_text("utf-8")

    def _write(rel: str, content: str) -> bool:
        (ROOT / rel).write_text(content, "utf-8")
        return True

    # ── config read/write ──────────────────────────────────────────────────
    @app.route("/api/config/<path:rel>", methods=["GET"])
    def read_config(rel):
        try:
            content = _read(f"config/{rel}")
            if rel.endswith(".json"):
                return jsonify(json.loads(content))
            if rel.endswith(".yaml") or rel.endswith(".yml"):
                return jsonify(yaml.safe_load(content) or {})
            return content, 200, {"Content-Type": "text/plain; charset=utf-8"}
        except FileNotFoundError:
            return jsonify({"error": "not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/config/<path:rel>", methods=["PUT", "POST"])
    def write_config(rel):
        try:
            data = request.get_json(silent=True) or request.form.to_dict()
            if rel.endswith(".json"):
                content = json.dumps(data, indent=2)
            elif rel.endswith(".yaml") or rel.endswith(".yml"):
                content = yaml.dump(data, default_flow_style=False)
            else:
                content = str(data)
            _write(f"config/{rel}", content)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── tracker ─────────────────────────────────────────────────────────────
    @app.route("/api/tracker", methods=["GET"])
    def get_tracker():
        try:
            return send_file(DATA / "tracker.csv", mimetype="text/csv")
        except FileNotFoundError:
            return jsonify({"rows": [], "total": 0})

    @app.route("/api/tracker/<int:row_idx>", methods=["PATCH"])
    def update_tracker_row(row_idx):
        try:
            import csv

            rows = list(csv.DictReader((DATA / "tracker.csv").open("utf-8")))
            if row_idx >= len(rows):
                return jsonify({"error": "row not found"}), 404
            patch = request.get_json() or {}
            rows[row_idx].update(patch)
            fields = list(rows[0].keys())
            with (DATA / "tracker.csv").open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fields)
                w.writeheader()
                w.writerows(rows)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── log ────────────────────────────────────────────────────────────────
    @app.route("/api/log", methods=["GET"])
    def get_log():
        try:
            content = (DATA / "applied_log.jsonl").read_text("utf-8")
            lines = [json.loads(l) for l in content.splitlines() if l.strip()]
            return jsonify({"entries": lines})
        except FileNotFoundError:
            return jsonify({"entries": []})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/log", methods=["POST"])
    def append_log():
        entry = request.get_json() or {}
        entry.setdefault("applied_at", str(Path().stat().st_mtime))  # placeholder
        line = json.dumps(entry, ensure_ascii=False)
        with (DATA / "applied_log.jsonl").open("a", encoding="utf-8") as f:
            f.write(line + "\n")
        return jsonify({"ok": True})

    # ── run pipeline ───────────────────────────────────────────────────────
    @app.route("/api/run/discover", methods=["POST"])
    def run_discover():
        import subprocess

        venv_python = ROOT / "venv" / "Scripts" / "python.exe"
        if not venv_python.exists():
            return jsonify({"error": "venv not found"}), 500
        try:
            result = subprocess.run(
                [str(venv_python), str(ROOT / "backend" / "run_pipeline.py"), "doall"],
                cwd=str(ROOT / "backend"),
                capture_output=True,
                text=True,
                timeout=300,
            )
            return jsonify(
                {"code": result.returncode, "out": result.stdout, "err": result.stderr}
            )
        except subprocess.TimeoutExpired:
            return jsonify({"error": "timeout after 300s"}), 504
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── run apply ──────────────────────────────────────────────────────────
    @app.route("/api/run/apply", methods=["POST"])
    def run_apply():
        import subprocess

        venv_python = ROOT / "venv" / "Scripts" / "python.exe"
        if not venv_python.exists():
            return jsonify({"error": "venv not found"}), 500
        body = request.get_json() or {}
        args = [
            "--headless",
            f"--persona={body.get('persona', 'Davenport')}",
            f"--max={body.get('max', 20)}",
        ]
        if body.get("dry_run"):
            args.append("--dry-run")
        try:
            result = subprocess.run(
                [
                    str(venv_python),
                    str(ROOT / "backend" / "applier" / "playwright_runner.py"),
                    *args,
                ],
                cwd=str(ROOT / "backend"),
                capture_output=True,
                text=True,
                timeout=600,
            )
            return jsonify(
                {"code": result.returncode, "out": result.stdout, "err": result.stderr}
            )
        except subprocess.TimeoutExpired:
            return jsonify({"error": "timeout after 600s"}), 504
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.errorhandler(404)
    def notfound(e):
        return jsonify({"error": "not found"}), 404

    return app


if __name__ == "__main__":
    if not FLASK_AVAILABLE:
        print("[jobbot-api] Flask not installed — exiting")
        sys.exit(1)
    app = make_app()
    log.info("JobBot API listening on http://127.0.0.1:18765")
    app.run(host="127.0.0.1", port=18765, threaded=True, debug=False)
