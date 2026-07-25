#!/usr/bin/env python3
"""Grok PreToolUse adapter for RTK (Rust Token Killer).

Grok cannot transparently rewrite tool input (no updatedInput). In enforce mode
we deny rewriteable shell commands and put the exact rtk-wrapped command in
`reason` so the agent re-runs it once.

Modes (first match wins):
  --mode / GROK_RTK_MODE / ~/.grok/hooks/token-saving.mode / enforce
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path

# Commands whose outputs are noisy enough that rtk helps.
REWRITE_ROOTS = {
    "git",
    "ls",
    "ll",
    "la",
    "tree",
    "cat",
    "head",
    "tail",
    "less",
    "more",
    "find",
    "grep",
    "rg",
    "ag",
    "fd",
    "cargo",
    "npm",
    "npx",
    "pnpm",
    "yarn",
    "bun",
    "pytest",
    "python",
    "python3",
    "vitest",
    "jest",
    "go",
    "docker",
    "kubectl",
    "oc",
    "gh",
    "tsc",
    "eslint",
    "prettier",
    "ruff",
    "biome",
    "next",
    "playwright",
    "aws",
    "pulumi",
    "bundle",
    "pip",
    "uv",
    "rspec",
    "rake",
    "rubocop",
    "golangci-lint",
}

# Never wrap these (already compact, interactive, or rtk itself).
SKIP_PREFIXES = (
    "rtk ",
    "wsl ",
    "wsl.exe ",
    "cd ",
    "set ",
    "export ",
    "pushd ",
    "popd ",
    "mkdir ",
    "rmdir ",
    "copy ",
    "move ",
    "del ",
    "rm ",
    "cp ",
    "mv ",
    "echo ",
    "printf ",
    "true",
    "false",
    ":",
    "powershell ",
    "pwsh ",
    "cmd ",
    "python -c ",
    "python3 -c ",
    "py -",
)

HOOKS_DIR = Path(os.environ.get("USERPROFILE", str(Path.home()))) / ".grok" / "hooks"
MODE_FILE = HOOKS_DIR / "token-saving.mode"
LOG_DIR = Path(os.environ.get("USERPROFILE", str(Path.home()))) / ".grok" / "logs"


def _read_mode(argv: list[str]) -> str:
    for i, a in enumerate(argv):
        if a == "--mode" and i + 1 < len(argv):
            return argv[i + 1].strip().lower()
        if a.startswith("--mode="):
            return a.split("=", 1)[1].strip().lower()
    env = os.environ.get("GROK_RTK_MODE", "").strip().lower()
    if env:
        return env
    try:
        if MODE_FILE.is_file():
            return MODE_FILE.read_text(encoding="utf-8").strip().split()[0].lower()
    except OSError:
        pass
    return "enforce"


def _log(msg: str) -> None:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with (LOG_DIR / "rtk-pretool.log").open("a", encoding="utf-8") as f:
            f.write(msg.rstrip() + "\n")
    except OSError:
        pass


def _first_token(cmd: str) -> str | None:
    cmd = cmd.strip()
    if not cmd:
        return None
    # strip simple env prefixes: FOO=bar CMD
    while True:
        m = re.match(r"^[A-Za-z_][A-Za-z0-9_]*=\S+\s+", cmd)
        if not m:
            break
        cmd = cmd[m.end() :]
    # drop leading `command` / `time` / `env`
    for wrapper in ("command ", "time ", "env "):
        if cmd.startswith(wrapper):
            cmd = cmd[len(wrapper) :]
    try:
        parts = shlex.split(cmd, posix=True)
    except ValueError:
        parts = cmd.split()
    if not parts:
        return None
    base = Path(parts[0]).name.lower()
    if base.endswith(".exe"):
        base = base[:-4]
    return base


def _already_rtk(cmd: str) -> bool:
    c = cmd.strip().lower()
    if c.startswith("rtk ") or c == "rtk":
        return True
    if " rtk " in f" {c} ":
        # wsl ... rtk git status
        return True
    if re.search(r"(^|[;&|]\s*)rtk(\s|$)", c):
        return True
    return False


def _should_rewrite(cmd: str) -> bool:
    raw = cmd.strip()
    if not raw:
        return False
    low = raw.lower()
    for p in SKIP_PREFIXES:
        if low.startswith(p):
            return False
    if _already_rtk(raw):
        return False
    # PowerShell heavy commands — leave alone
    if re.search(r"\b(Get-|Set-|New-|Remove-|Write-|Select-|Format-|Import-|Export-)", raw):
        return False
    if "&&" in raw or "||" in raw or ";" in raw:
        # multi-command: only rewrite if the whole thing is a single known root
        # Prefer first segment when simple
        first_seg = re.split(r"\s*(?:&&|\|\||;)\s*", raw, maxsplit=1)[0]
        tok = _first_token(first_seg)
        return tok in REWRITE_ROOTS if tok else False
    tok = _first_token(raw)
    return tok in REWRITE_ROOTS if tok else False


def _wsl_rtk_command(cmd: str) -> str:
    """Windows agent shell → run compressed command via WSL rtk."""
    # Escape for bash -lc single quotes
    inner = cmd.replace("'", "'\"'\"'")
    return (
        'wsl.exe -e bash -lc '
        f'\'export PATH="$HOME/.local/bin:$PATH"; rtk {inner}\''
    )


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main(argv: list[str]) -> int:
    mode = _read_mode(argv)
    if mode not in ("enforce", "soft", "off"):
        mode = "enforce"

    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        _log(f"stdin-parse-error: {e}")
        _emit({"decision": "allow"})
        return 0

    tool = (payload.get("toolName") or payload.get("tool_name") or "").strip()
    tin = payload.get("toolInput") or payload.get("tool_input") or {}
    cmd = ""
    if isinstance(tin, dict):
        cmd = tin.get("command") or tin.get("cmd") or ""
    if not isinstance(cmd, str):
        cmd = str(cmd or "")

    if mode == "off":
        _emit({"decision": "allow"})
        return 0

    # Only shell tools
    if tool and tool not in (
        "Bash",
        "run_terminal_command",
        "bash",
        "Shell",
        "shell",
    ):
        # matcher should already filter, but be safe
        _emit({"decision": "allow"})
        return 0

    if not _should_rewrite(cmd):
        _emit({"decision": "allow"})
        return 0

    rewritten = _wsl_rtk_command(cmd.strip())
    reason = (
        f"TOKEN-SAVE(rtk)[{mode}]: shell output will be compressed. "
        f"Re-run this exact command once:\n{rewritten}\n"
        f"(original: {cmd.strip()})"
    )
    _log(f"mode={mode} tool={tool} original={cmd!r} rewritten={rewritten!r}")

    if mode == "enforce":
        _emit({"decision": "deny", "reason": reason})
        return 0

    # soft: allow but nudge
    out = {"decision": "allow", "reason": reason, "systemMessage": reason}
    _emit(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
