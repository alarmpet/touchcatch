#!/usr/bin/env python3
"""SessionStart / SessionEnd helper for Serena warm-up (best-effort, fail-open)."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

USER = Path(os.environ.get("USERPROFILE", str(Path.home())))
LOG_DIR = USER / ".grok" / "logs"
STATE = LOG_DIR / "serena-session.json"


def _log(msg: str) -> None:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with (LOG_DIR / "serena-session.log").open("a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {msg}\n")
    except OSError:
        pass


def activate() -> int:
    cwd = os.environ.get("GROK_WORKSPACE_ROOT") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    state = {
        "activated_at": time.time(),
        "cwd": cwd,
        "session_id": os.environ.get("GROK_SESSION_ID", ""),
    }
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError as e:
        _log(f"activate-write-fail: {e}")
    _log(f"activate cwd={cwd}")
    # MCP server is started by Grok config; this only records session context.
    return 0


def cleanup() -> int:
    _log("cleanup")
    try:
        if STATE.is_file():
            STATE.unlink()
    except OSError:
        pass
    return 0


def main(argv: list[str]) -> int:
    action = (argv[0] if argv else "activate").strip().lower()
    if action in ("activate", "start", "sessionstart"):
        return activate()
    if action in ("cleanup", "end", "sessionend"):
        return cleanup()
    _log(f"unknown-action: {action}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
