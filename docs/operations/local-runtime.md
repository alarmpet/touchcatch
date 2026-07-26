# Local runtime and DATA-027 evidence gate

TouchCatch requires Node `v24.18.0` and pnpm `11.13.0`. Select the required
runtime with a runtime manager already installed on the operator's machine,
then verify both versions before installing dependencies or running a gate:

```powershell
fnm use 24.18.0
node --version
corepack pnpm --version
```

The commands must print `v24.18.0` and `11.13.0`, respectively. Stop if either
value differs. `nvm use 24.18.0` or an equivalent Volta configuration is also
valid when it yields those exact versions.

On the verification host only, the exact Node archive is at
`C:\tmp\touchcatch-node-24.18.0\node-v24.18.0-win-x64`. A process may prepend
that directory to its `PATH` for an isolated verification run; it is an example
for that host, not an operator prerequisite or a global installation change.

## Local DATA-027 gate

Run the local, non-production database evidence gate from the worktree root:

```powershell
corepack pnpm check:db
```

This gate is deliberately separate from the fast `check` gate. It first checks
that the local Docker daemon is available, then performs bounded local
Supabase reset, lint, pgTAP, authenticated-local, and DATA-027 concurrency
steps. It is not a production deployment command and must not be pointed at a
remote or production database.

On success, the gate writes the worktree-local, ignored receipt at
`.superpowers/evidence/data-027/receipt.json`. A receipt is published only
after all bounded steps pass and the real DATA-027 concurrency test emits a
valid observation for that gate run. Static TypeScript or AST inspection, a
direct Vitest invocation, or a hand-written receipt cannot create a DATA-027
PASS.

The receipt binds the current input bundle: Supabase migrations, the database
concurrency test and its Vitest configuration, the gate runner, the receipt
writer/contract, and the requirement oracle. The recorded Git commit SHA is
provenance only; it does not substitute for input-bundle freshness. Do not copy
a receipt between worktrees: the requirement oracle rejects it whenever the
destination input bundle differs. Deleting
`.superpowers/evidence/data-027/receipt.json` immediately returns DATA-027 to
`BLOCKED` with `LOCAL_DB_EVIDENCE_UNAVAILABLE`.

The gate takes an exclusive same-worktree lock at
`.superpowers/evidence/data-027/gate.lock`; run only one gate per worktree at a
time. It attempts to remove its temporary observation and lock in `finally` on
every exit. If that cleanup cannot complete, it reports
`SUPABASE_GATE_FAILED:cleanup`. The receipt and fixed errors avoid credentials,
connection URLs, raw subprocess output, and personal paths.

## Expected outcomes and fixed errors

When the Docker daemon is unavailable at the preflight step, the gate exits
nonzero with the exact blocker `SUPABASE_GATE_DOCKER_UNAVAILABLE`. This is a
verified `BLOCKED` state, not a reason to synthesize or copy a receipt. Once
Docker preflight has passed, a local Supabase reset, lint, pgTAP,
authenticated-local, or DATA-027 concurrency failure or timeout reports its
own step-specific fixed code rather than the Docker-unavailable blocker.

Other gate failures use these fixed codes:

- `SUPABASE_GATE_TIMEOUT:db_reset`, `SUPABASE_GATE_TIMEOUT:db_lint`,
  `SUPABASE_GATE_TIMEOUT:pg_tap`, `SUPABASE_GATE_TIMEOUT:auth_local`, or
  `SUPABASE_GATE_TIMEOUT:data_027_concurrency`
- `SUPABASE_GATE_FAILED:lock`, `SUPABASE_GATE_FAILED:runner`,
  `SUPABASE_GATE_FAILED:db_reset`, `SUPABASE_GATE_FAILED:db_lint`,
  `SUPABASE_GATE_FAILED:pg_tap`, `SUPABASE_GATE_FAILED:auth_local`,
  `SUPABASE_GATE_FAILED:data_027_concurrency`,
  `SUPABASE_GATE_FAILED:receipt`, or `SUPABASE_GATE_FAILED:cleanup`
- `DATA_027_OBSERVATION_MISSING` or `DATA_027_OBSERVATION_INVALID`

After a successful local DB gate, validate the requirement and ignored evidence
path explicitly:

```powershell
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts tests/specs/database-security-requirement-oracle.test.ts
git check-ignore .superpowers/evidence/data-027/receipt.json
```
