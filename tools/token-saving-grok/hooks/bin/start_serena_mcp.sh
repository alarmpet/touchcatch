#!/usr/bin/env bash
# Start Serena MCP with PATH fixed for non-login WSL shells (wsl.exe -e).
# Without this, uv/uvx/serena are missing → MCP startup timeout.

set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

# Prefer project that owns .serena/project.yml walking up from CWD / GROK paths.
find_project() {
  local d
  for d in \
    "${GROK_WORKSPACE_ROOT:-}" \
    "${CLAUDE_PROJECT_DIR:-}" \
    "${PWD:-}" \
    "$(pwd 2>/dev/null || true)"
  do
    [ -n "$d" ] || continue
    # Windows path → WSL if needed
    if [[ "$d" =~ ^[A-Za-z]:\\ ]]; then
      local drive letter rest
      drive=$(echo "$d" | cut -c1 | tr '[:upper:]' '[:lower:]')
      rest=$(echo "$d" | cut -c3- | tr '\\' '/')
      d="/mnt/${drive}${rest}"
    fi
    local cur="$d"
    while [ -n "$cur" ] && [ "$cur" != "/" ]; do
      if [ -f "$cur/.serena/project.yml" ] || [ -f "$cur/.serena/project.yaml" ]; then
        echo "$cur"
        return 0
      fi
      cur=$(dirname "$cur")
    done
  done
  # fallback: common Windows mount of current repo when launched from Windows
  if [ -f "/mnt/d/touchcatch/.serena/project.yml" ]; then
    echo "/mnt/d/touchcatch"
    return 0
  fi
  return 1
}

PROJECT="$(find_project || true)"
if [ -z "${PROJECT}" ]; then
  # last resort: cwd
  PROJECT="$(pwd)"
fi

if ! command -v serena >/dev/null 2>&1; then
  echo "serena not found on PATH=$PATH" >&2
  echo "Install: uv tool install -p 3.13 serena-agent" >&2
  exit 127
fi

# Headless MCP — dashboard off (critical for agent hosts)
exec serena start-mcp-server \
  --context claude-code \
  --project "${PROJECT}" \
  --enable-web-dashboard false \
  --open-web-dashboard false \
  --log-level WARNING
