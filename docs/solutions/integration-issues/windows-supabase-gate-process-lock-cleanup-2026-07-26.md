---
title: Shell-free Windows Supabase gates with worktree-scoped locks
date: 2026-07-26
category: integration-issues
module: supabase-gate
problem_type: integration_issue
component: tooling
symptoms:
  - Windows gate steps failed when the absolute Node executable was installed below Program Files.
  - Gate invocations from different repository subdirectories could acquire different locks.
  - A successful gate could conceal a subsequent observation or lock cleanup failure.
root_cause: config_error
resolution_type: code_fix
severity: high
related_components:
  - development_workflow
  - testing_framework
  - database
tags:
  - supabase
  - windows
  - process-spawning
  - repository-root
  - concurrency-lock
  - cleanup-errors
  - timeout-termination
---

# Shell-free Windows Supabase gates with worktree-scoped locks

## Problem

The bounded local Supabase evidence gate used one Windows `shell: true` policy
for every child process and treated its invocation directory as the repository
root. This broke absolute Node executable paths containing spaces, allowed two
invocations below the same worktree to derive different locks, and could report
success after cleanup failed.

## Symptoms

- `C:\Program Files\nodejs\node.exe` was reparsed as `C:\Program` when spawned
  through the Windows command shell.
- Node, Docker, and the npm-installed Supabase `.cmd` shim could not safely
  share one global shell policy.
- Invocations from separate worktree subdirectories used different lock paths
  and child working directories.
- Observation or lock cleanup errors after receipt publication were swallowed.

## What Didn't Work

- Enabling `shell: true` globally made npm `.cmd` shims executable, but it also
  changed parsing for native and absolute executables.
- Using `path.resolve(process.cwd())` as repository identity worked only when
  callers always started at the top-level directory.
- Treating cleanup as best-effort allowed the command to exit successfully even
  when the per-run observation or owned lock remained.

## Solution

Keep every child spawn shell-free. Node and Docker are launched directly with
an executable plus argument array. On Windows, resolve the `supabase` package
binary entry and invoke its JavaScript file through the current absolute Node
executable:

```js
const supabaseCommand = {
  executable: process.execPath,
  argsPrefix: [resolveSupabaseCliEntry()],
};

spawnProcess(step.executable, [...step.args], {
  cwd: step.cwd,
  env: step.env,
  shell: false,
  stdio: 'ignore',
  windowsHide: true,
});
```

Resolve repository identity once with Git:

```js
const root = path.resolve(
  execFileSync('git', ['-C', startPath, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }).trim(),
);
```

Use that canonical root for exclusive lock acquisition, every child `cwd`,
commit lookup, and receipt publication. Keep observation removal and lock
release in `finally`; preserve an existing primary gate error, but return the
sanitized `SUPABASE_GATE_FAILED:cleanup` when an otherwise successful run
cannot clean its owned artifacts.

Focused tests inject the production spawn helper to verify a Windows executable
path containing spaces. Process-tree tests exercise the real termination helper
while injecting only its destructive primitives: `spawnSync` is observed for
the exact Windows `taskkill /PID <pid> /T /F` call, and `process.kill` is
observed for the non-Windows negative process-group `SIGKILL`. A real temporary
Git repository test starts two gates from different subdirectories and proves
that the second receives `SUPABASE_GATE_FAILED:lock`. Failure and timeout tests
make the fake child create an observation before exit so cleanup assertions
exercise the real lifecycle.

## Why This Works

Executable-plus-argument spawning bypasses command-shell tokenization, so paths
with spaces remain a single executable value. Resolving only Supabase's package
entry addresses the `.cmd` portability issue without weakening Node or Docker
launches.

Git top-level resolution gives the gate one worktree identity regardless of its
invocation directory. The lock, child processes, commit SHA, and receipt
therefore refer to the same worktree. Fail-closed cleanup prevents a successful
exit from claiming a clean bounded run when owned state remains.

## Prevention

- Do not use global `shell: true` as a cross-platform CLI resolution strategy.
- Test absolute executable paths containing spaces through the production spawn
  helper.
- Test termination branches by injecting `spawnSync` and `process.kill`; do not
  replace the process-tree helper itself.
- Resolve worktree-scoped locks and evidence from
  `git rev-parse --show-toplevel`, not the caller's current directory.
- Test concurrent invocations from two different subdirectories of one
  temporary Git repository.
- Make failed and timed-out fake children create their run-specific artifact
  before asserting cleanup.
- Treat cleanup after success as part of the gate result and expose only fixed,
  sanitized error codes.

## Related Issues

- [Hermetic local Supabase Auth integration gates](local-supabase-auth-golden-hermeticity-2026-07-22.md)
  uses the same project-local Supabase JavaScript entry pattern for a different
  clean-checkout and Auth integration problem.
