---
name: token-saving
description: Reduce token waste — prefer Serena symbols, bounded reads, rtk-compressed shell. Use for any coding session with shell or large-repo exploration.
---

# Token-saving habits

## Prefer low-token tools

1. **Code structure / symbols** → Serena MCP (`search_tool` query `serena`, then `get_symbols_overview`, `find_symbol`, etc.). Do **not** dump whole files.
2. **Partial file read** → built-in `read_file` with `offset` / `limit`.
3. **Search** → built-in `grep` / `list_dir`, not `cat`/`find`/`ls -R` via shell.
4. **Noisy shell** (`git status`, `git log`, `ls`, tests) → if PreToolUse denies with `TOKEN-SAVE(rtk)`, **re-run the exact command in `reason`** (already wrapped with `rtk` via WSL). Do not loop on the original command.

## Never do

- Full-file `cat` / multi-MB dumps into context
- Unbounded `git log` / `git diff` without path filters
- Ignoring rtk deny reasons (causes infinite enforce loops)
- Loading every MCP tool eagerly — use `search_tool` first

## Modes

- **enforce** (default): rewriteable shell is denied once with rtk command
- **soft**: allow + hint
- **off**: no rtk intervention

```powershell
powershell -File $env:USERPROFILE\.grok\hooks\bin\set-rtk-mode.ps1 soft
powershell -File $env:USERPROFILE\.grok\hooks\bin\set-rtk-mode.ps1 enforce
```

## Harness

- MCP results capped (`max_output_bytes`)
- Prefer compact tool sequences; avoid redundant re-reads
