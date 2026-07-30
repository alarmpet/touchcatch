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

## Android development build

From the repository root, run:

```powershell
corepack pnpm mobile:preflight
corepack pnpm mobile:bundle:android
corepack pnpm --dir apps/mobile android
```

`android` builds and installs a compatible development build through the
Android toolchain. The bundle command is a Metro/native compatibility gate;
it is not physical-device evidence.

When a compatible development build is already installed, start only Metro:

```powershell
corepack pnpm --dir apps/mobile start -- --clear
```

The Metro command does not build or install the native application.

## Android physical-device evidence

`adb devices -l` must list exactly one authorized physical device. Run all
thirteen scenarios defined by the evidence checker, including all three packs,
background/foreground restoration, and completion with Wi-Fi and mobile data
disabled. Then capture the four named screenshots and run:

```powershell
corepack pnpm mobile:evidence:android
```

When no device is connected, retain `DEVICE_UNAVAILABLE` as `BLOCKED` and do
not create screenshots or report an Android pass.

## iOS and aggregate status

iOS evidence requires both a macOS build host and a physical iPhone. On this
Windows host it remains `DEVICE_OR_MACOS_HOST_UNAVAILABLE`; Android or web
results cannot satisfy that gate.

```powershell
corepack pnpm mobile:evidence:ios
corepack pnpm mobile:evidence:aggregate
```

The aggregate check reports the offline local guest game as passed only after
Android physical-device evidence is `PASS`. iOS may remain independently
`BLOCKED`; neither state is a production-release approval.
