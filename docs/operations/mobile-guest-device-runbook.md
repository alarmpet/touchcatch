# Mobile Guest Device Runbook

## Supported workspace

Run every command from the isolated repository root:

```powershell
Set-Location D:\touchcatch\.worktrees\physical-device-guest
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm mobile:typecheck
corepack pnpm mobile:test
```

The required runtime is Node `v24.18.0` and pnpm `11.13.0`.

Do not run `corepack pnpm --dir apps/mobile ...` from
`C:\Users\petbl`. That resolves `C:\Users\petbl\apps\mobile`, which is not this
project. Change to the repository root first.

## Current milestone

This runbook covers the offline development-only guest game. It does not
require Supabase, authentication, matchmaking, or a network connection.
