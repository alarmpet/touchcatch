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

This gate is deliberately separate from the fast `check` gate. It first runs
the exact Node/pnpm runtime preflight, checks that the local Docker daemon is
available, then performs bounded local Supabase reset, lint, pgTAP,
authenticated-local, and DATA-027 concurrency steps. Every child has ambient
database/project selectors such as `TEST_DATABASE_URL`, `SUPABASE_WORKDIR`,
and `LOCAL_SUPABASE_*` removed. The concurrency test resolves the just-reset
project status from this repository and must match the configured local DB
port. This is not a production deployment command and must not be pointed at
a remote or production database.

On success, the gate writes the worktree-local, ignored receipt at
`.superpowers/evidence/data-027/receipt.json`. The production CLI has no
dependency-injection or receipt-writer API. It publishes only after all
bounded steps pass, the real DATA-027 concurrency test emits a valid
observation for that UUID run, the private temporary run directory is removed,
and the shared lock is released. Synthetic receipt fixtures are confined to
disposable OS-temp test repositories.

The receipt is an unkeyed deterministic local reproducibility/integrity
record. It helps catch accidental drift and stale evidence; it is not a
cryptographic attestation against a local user who can edit repository files
and recompute SHA-256 values. Static TypeScript/AST inspection and direct
Vitest execution are not production publication paths.

The receipt binds the complete evidence bundle captured before execution,
rechecked after all bounded steps, and checked again immediately before
publication: migrations, pgTAP
files, `supabase/config.toml`, roles, the concurrency observation/status
helpers, Vitest DB configuration, gate/core/writer contract, requirement
oracle, canonical JSON implementation, runtime/pnpm wrappers, `package.json`,
`pnpm-lock.yaml`, and the exact Node/pnpm version fields. The recorded Git
commit SHA is provenance only; it does not substitute for input-bundle
freshness. Do not copy a receipt between worktrees: the requirement oracle
rejects it whenever the destination input bundle differs. Deleting
`.superpowers/evidence/data-027/receipt.json` immediately returns DATA-027 to
`BLOCKED` with `LOCAL_DB_EVIDENCE_UNAVAILABLE`.

The receipt remains worktree-local, but the gate lock does not. A shared lock
under the OS temp root is keyed by the canonical Supabase `project_id` and
fixed local-port identity, so separate worktrees targeting the same local
stack cannot overlap. This coordinates worktrees run by the same OS account;
it is not a cross-account machine mutex. Observation output is derived
internally as
`os.tmpdir()/touchcatch-data-027/<gate-run-uuid>/observation.json`; arbitrary
output-path environment values are ignored, and existing symlink/junction
components are rejected.

The gate invalidates any previous receipt before starting. Observation and
lock cleanup must complete before publication, so every nonzero outcome leaves
DATA-027 `BLOCKED`. If cleanup alone fails, the fixed result is
`SUPABASE_GATE_FAILED:cleanup`. On timeout, process-tree termination is itself
bounded and the child must close. If termination cannot be confirmed, the
result is `SUPABASE_GATE_FAILED:termination` and the shared lock file is
deliberately retained for operator investigation rather than permitting a
second reset to overlap a possibly live process. The receipt and fixed errors
avoid credentials, connection URLs, raw subprocess output, and personal
paths.

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
  `SUPABASE_GATE_TIMEOUT:data_027_concurrency`; runtime preflight timeout is
  `SUPABASE_GATE_TIMEOUT:runtime_preflight`
- `SUPABASE_GATE_FAILED:lock`, `SUPABASE_GATE_FAILED:runner`,
  `SUPABASE_GATE_FAILED:runtime_preflight`,
  `SUPABASE_GATE_FAILED:db_reset`, `SUPABASE_GATE_FAILED:db_lint`,
  `SUPABASE_GATE_FAILED:pg_tap`, `SUPABASE_GATE_FAILED:auth_local`,
  `SUPABASE_GATE_FAILED:data_027_concurrency`,
  `SUPABASE_GATE_FAILED:evidence_changed`,
  `SUPABASE_GATE_FAILED:termination`, `SUPABASE_GATE_FAILED:receipt`, or
  `SUPABASE_GATE_FAILED:cleanup`
- `DATA_027_OBSERVATION_MISSING` or `DATA_027_OBSERVATION_INVALID`

After a successful local DB gate, validate the requirement and ignored evidence
path explicitly:

```powershell
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts tests/specs/database-security-requirement-oracle.test.ts
git check-ignore .superpowers/evidence/data-027/receipt.json
```
