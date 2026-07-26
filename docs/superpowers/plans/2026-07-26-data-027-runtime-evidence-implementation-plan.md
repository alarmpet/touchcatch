# DATA-027 Runtime Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DATA-027 PASS only when a bounded local Supabase run proves that 20 real `app_server` sessions produce exactly two seats.

**Architecture:** The DB test emits a run-bound temporary observation only when invoked by the bounded gate. A focused evidence module validates that observation, binds the successful run to every repository input that can change its meaning, and atomically writes a worktree-local receipt. The requirement oracle validates that receipt and otherwise returns the exact fail-closed BLOCKED state.

**Tech Stack:** Node.js 24.18.0, pnpm 10.28.2, TypeScript, Vitest, `pg`, Supabase CLI, PostgreSQL, Node `crypto`/`fs`/`child_process`.

## Global Constraints

- DATA-027 static source shape is diagnostic only and can never produce PASS.
- Missing, malformed, stale, or forged evidence returns `BLOCKED` with reason `LOCAL_DB_EVIDENCE_UNAVAILABLE`.
- The receipt path is `<git-toplevel>/.superpowers/evidence/data-027/receipt.json`; it is never committed.
- Receipt freshness is the canonical hash of the complete evidence-input manifest, not current commit equality.
- `commitSha` remains provenance and is exactly 40 lowercase hexadecimal characters.
- Observation files live only under `os.tmpdir()/touchcatch-data-027/` and are deleted in `finally`.
- Direct Vitest execution without both gate environment variables writes no observation.
- Receipt and errors contain no DB URL, password, token, username, raw stdout, or personal absolute path.
- All implementation follows RED → GREEN → focused regression → commit.

---

## File Map

- Create `tools/data-027-runtime-evidence.ts`: schema, canonical hashing, worktree-safe paths, observation validation, input-manifest construction, receipt validation, and atomic writing.
- Create `tests/specs/data-027-runtime-evidence.test.ts`: pure mutation tests for the evidence contract.
- Create `tests/support/data-027-observation.ts`: gate-only observation derivation and atomic emission without registering a Vitest suite.
- Modify `tests/database/concurrency.test.ts`: bounded connection acquisition and gate-only observation emission derived from asserted runtime values.
- Create `tools/run-supabase-gate.mjs`: bounded subprocess orchestration, run ID, lock, observation lifecycle, and receipt publication.
- Create `tests/specs/supabase-gate-runner.test.ts`: fake-process tests for timeout, cleanup, locking, and publication.
- Modify `tools/requirement-oracle.ts`: remove DATA-027 static PASS and dispatch `RUNTIME_RECEIPT`.
- Modify `tests/specs/database-security-requirement-oracle.test.ts`: replace DATA-027 AST adversarial cases with receipt status cases.
- Modify `config/requirement-evidence.v1.json`: classify DATA-027 as `RUNTIME_RECEIPT`.
- Generate `docs/requirements-registry.v1.json`: refresh DATA-027 evidence projection.
- Modify `package.json`: route `check:db` through the bounded runner.
- Modify `tests/specs/traceability.test.ts`: pin the bounded command and worktree-local evidence policy.
- Modify `docs/operations/local-runtime.md`: document gate operation, receipt scope, and sanitized errors.

---

### Task 1: Evidence Contract and Worktree-Safe Receipt

**Files:**
- Create: `tools/data-027-runtime-evidence.ts`
- Create: `tests/specs/data-027-runtime-evidence.test.ts`

**Interfaces:**
- Produces:

```ts
export const DATA_027_RECEIPT_RELATIVE_PATH =
  ".superpowers/evidence/data-027/receipt.json";

export type Data027Observation = Readonly<{
  schemaVersion: 1;
  gateRunId: string;
  requirementId: "DATA-027";
  sessionsAttempted: 20;
  successfulSeats: 2;
  requiredRole: "app_server";
  databaseOrigin: "LOOPBACK_LOCAL_SUPABASE";
  testStatus: "PASS";
}>;

export type EvidenceInput = Readonly<{
  path: string;
  sha256: `sha256:${string}`;
}>;

export function buildEvidenceInputs(root: string): readonly EvidenceInput[];
export function validateData027Observation(
  value: unknown,
  expectedGateRunId: string,
): Data027Observation;
export function writeData027Receipt(
  root: string,
  observation: Data027Observation,
  commitSha: string,
): void;
export function validateData027Receipt(root: string): boolean;
```

- Consumes: repository files, exact fixed receipt path, and a runtime-derived observation.

- [ ] **Step 1: Write strict schema and canonicalization RED tests**

Test a valid observation/receipt fixture plus table-driven mutations for missing
and extra keys, wrong types, sessions `19`/`21`, seats `1`/`3`, wrong role,
wrong origin, wrong run ID, wrong payload hash, and secret-like fields.

```ts
expect(() => validateData027Observation(valid, "run-a")).not.toThrow();
expect(() =>
  validateData027Observation({ ...valid, gateRunId: "run-b" }, "run-a"),
).toThrow("DATA_027_OBSERVATION_INVALID");
expect(validateData027Receipt(rootWithNoReceipt)).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm vitest run tests/specs/data-027-runtime-evidence.test.ts
```

Expected: FAIL because `tools/data-027-runtime-evidence.ts` does not exist.

- [ ] **Step 3: Implement exact schema and deterministic hashes**

Use exact-key comparison before field validation. Hash bytes with SHA-256 and
prefix digests with `sha256:`. Hash `receiptSha256` over canonical JSON of all
receipt fields except `receiptSha256`; canonical JSON sorts object keys
recursively and preserves array order.

`buildEvidenceInputs(root)` includes:

```ts
[
  ...allMigrationSqlFilesSortedByPosixRelativePath,
  "tests/database/concurrency.test.ts",
  "vitest.db.config.ts",
  "tools/run-supabase-gate.mjs",
  "tools/data-027-runtime-evidence.ts",
  "tools/requirement-oracle.ts",
]
```

Reject a missing allow-listed file. Store entries sorted by `path`, then hash
their canonical array into `evidenceInputsSha256`.

- [ ] **Step 4: Add path, atomic-write, and freshness mutation tests**

Cover receipt path escape, a symlink at any existing receipt-directory
component, partial temp-file cleanup, existing receipt replacement, reordered
manifest, missing/extra manifest entry, and one-byte mutations of every input
class. Verify that changing only `commitSha` does not invalidate a receipt when
the evidence-input manifest is unchanged.

- [ ] **Step 5: Implement worktree-safe atomic receipt writing**

Resolve the root from the caller-provided Git top-level and verify the receipt
target remains below it. Reject symlink components using `lstatSync`. Write a
same-directory unique temp file with exclusive creation, `fsync`, close, then
rename to `receipt.json`; remove the temp file in `finally`.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
corepack pnpm vitest run tests/specs/data-027-runtime-evidence.test.ts
git diff --check
```

Expected: all focused tests PASS and no whitespace errors.

```powershell
git add tools/data-027-runtime-evidence.ts tests/specs/data-027-runtime-evidence.test.ts
git commit -m "feat(database): define DATA-027 runtime evidence"
```

---

### Task 2: Runtime-Derived Concurrency Observation

**Files:**
- Create: `tests/support/data-027-observation.ts`
- Modify: `tests/database/concurrency.test.ts`
- Modify: `tests/specs/data-027-runtime-evidence.test.ts`

**Interfaces:**
- Consumes: `validateData027Observation` contract from Task 1 and optional
  `TOUCHCATCH_DATA027_GATE_RUN_ID` /
  `TOUCHCATCH_DATA027_OBSERVATION_PATH`.
- Produces: one atomic observation file whose counts, role, and origin are
  derived from the successfully asserted DB run.

- [ ] **Step 1: Write RED tests for gate-only observation behavior**

Create a small helper outside the test suite so pure unit tests do not import
or register database hooks:

```ts
export function maybeWriteData027Observation(input: {
  gateRunId?: string;
  observationPath?: string;
  sessionsAttempted: number;
  successfulSeats: number;
  verifiedRoles: readonly string[];
  databaseUrl: string;
}): void;
```

Test that no env values writes nothing, one env value throws
`DATA_027_OBSERVATION_INVALID`, a non-loopback URL is rejected, and twenty
verified `app_server` roles plus two successes writes the exact observation.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
corepack pnpm vitest run tests/specs/data-027-runtime-evidence.test.ts
```

Expected: FAIL because the helper and runtime-derived payload do not exist.

- [ ] **Step 3: Bound connection acquisition**

Change the pool construction in `tests/database/concurrency.test.ts` to:

```ts
const admin = new Pool({
  connectionString: databaseUrl,
  max: 25,
  connectionTimeoutMillis: 5_000,
});
```

Retain twenty distinct clients, the synchronization barrier, `set role
app_server`, current-role assertion, exact two-success assertion, and seat set
`[1, 2]`.

- [ ] **Step 4: Emit only after all runtime assertions pass**

Collect the actual client count, successful result count, and verified current
roles during the test. After the final seat assertion, call the helper with
those values. Accept only loopback hosts supported by the existing
`localDatabaseUrl()` loader; never serialize the URL.

Write the observation with exclusive temp creation and atomic rename to the
exact path supplied by the gate. Do not derive acceptance numbers from env or
CLI arguments.

- [ ] **Step 5: Run pure tests and the real DB test when available**

```powershell
corepack pnpm vitest run tests/specs/data-027-runtime-evidence.test.ts
corepack pnpm vitest run --config vitest.db.config.ts tests/database/concurrency.test.ts --sequence.concurrent=false
```

Expected: pure tests PASS. The DB test PASSes when local Supabase is available;
otherwise record the environment failure without manufacturing an observation.

- [ ] **Step 6: Commit**

```powershell
git add tests/support/data-027-observation.ts tests/database/concurrency.test.ts tests/specs/data-027-runtime-evidence.test.ts
git commit -m "test(database): emit DATA-027 runtime observation"
```

---

### Task 3: Bounded Gate, Run Isolation, and Receipt Publication

**Files:**
- Create: `tools/run-supabase-gate.mjs`
- Create: `tests/specs/supabase-gate-runner.test.ts`
- Modify: `package.json`
- Modify: `tests/specs/traceability.test.ts`

**Interfaces:**
- Consumes: Task 1 writer, Task 2 observation, repository Supabase CLI, Docker.
- Produces: `check:db`, a single exclusive gate execution, and a receipt only
  after every required step succeeds.

- [ ] **Step 1: Write a fake-process RED suite**

Inject `spawnStep`, `randomUUID`, `tmpdir`, and clock/timeout dependencies into
an exported `runSupabaseGate(deps)` function. Test:

```ts
await expect(runWithDockerUnavailable()).rejects.toThrow(
  "SUPABASE_GATE_DOCKER_UNAVAILABLE",
);
await expect(runWithTimeout("db_reset")).rejects.toThrow(
  "SUPABASE_GATE_TIMEOUT:db_reset",
);
await expect(runWithExitOne("pg_tap")).rejects.toThrow(
  "SUPABASE_GATE_FAILED:pg_tap",
);
```

Also assert no later step or receipt writer runs after failure.

- [ ] **Step 2: Run the runner suite and verify RED**

```powershell
corepack pnpm vitest run tests/specs/supabase-gate-runner.test.ts tests/specs/traceability.test.ts
```

Expected: FAIL because the bounded runner and package wiring do not exist.

- [ ] **Step 3: Implement the exact bounded sequence**

Run these allow-listed steps:

```js
[
  ["docker_preflight", dockerExecutable, ["info"], 10_000],
  ["db_reset", supabaseExecutable, ["db", "reset", "--local"], 600_000],
  ["db_lint", supabaseExecutable, ["db", "lint", "--local", "--fail-on", "error"], 120_000],
  ["pg_tap", supabaseExecutable, ["test", "db", "--local"], 300_000],
  ["auth_local", nodeExecutable, ["tools/run-pnpm.mjs", "test:auth:local"], 300_000],
  ["data_027_concurrency", nodeExecutable, ["tools/run-pnpm.mjs", "test:db:concurrency"], 300_000],
]
```

Generate `gateRunId` with `randomUUID()`. Pass observation env variables only
to `data_027_concurrency`. On Windows timeout, terminate the child process tree;
on other platforms terminate the process group. Emit only the fixed taxonomy,
never captured command output.

- [ ] **Step 4: Implement observation lifecycle and exclusive lock**

Acquire
`.superpowers/evidence/data-027/gate.lock` with exclusive creation before the
Docker preflight. A held lock fails with `SUPABASE_GATE_FAILED:lock`; do not
steal an active lock.

Set the expected observation path to
`path.join(os.tmpdir(), "touchcatch-data-027", gateRunId + ".json")`. Remove
that exact file before spawning the DB test, accept only a matching `gateRunId`,
publish the receipt only after the final subprocess succeeds, and delete the
observation and release the lock in `finally`.

- [ ] **Step 5: Add stale/missing/invalid observation and cleanup tests**

Cover direct DB invocation, old run ID, missing observation, malformed JSON,
unexpected fields, success, nonzero exit, timeout, writer exception, and two
same-worktree concurrent gates. Expected codes are
`DATA_027_OBSERVATION_MISSING`, `DATA_027_OBSERVATION_INVALID`, or the matching
gate step code; every path removes the run-specific temp file.

- [ ] **Step 6: Route `check:db` through the runner**

Set:

```json
{
  "scripts": {
    "check:db": "node tools/run-supabase-gate.mjs"
  }
}
```

Pin this in `tests/specs/traceability.test.ts`, including the requirement that
the script contains no raw unbounded `supabase db reset` chain.

- [ ] **Step 7: Run focused tests and commit**

```powershell
corepack pnpm vitest run tests/specs/supabase-gate-runner.test.ts tests/specs/data-027-runtime-evidence.test.ts tests/specs/traceability.test.ts
git diff --check
```

Expected: all focused tests PASS.

```powershell
git add tools/run-supabase-gate.mjs tests/specs/supabase-gate-runner.test.ts package.json tests/specs/traceability.test.ts
git commit -m "feat(database): bound local Supabase evidence gate"
```

---

### Task 4: Requirement Oracle and Evidence Registry Switch

**Files:**
- Modify: `tools/requirement-oracle.ts`
- Modify: `tests/specs/database-security-requirement-oracle.test.ts`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`
- Test: `tests/specs/generated-requirement-coverage.test.ts`

**Interfaces:**
- Consumes: `validateData027Receipt(root)` from Task 1.
- Produces: DATA-027 `PASS` for a valid current-bundle receipt, otherwise
  `{status:"BLOCKED", reason:"LOCAL_DB_EVIDENCE_UNAVAILABLE"}`.

- [ ] **Step 1: Replace static-success expectations with RED status tests**

Remove DATA-027 from `evaluateDatabaseRequirement` success tables and delete
the DATA-027 AST mutation matrix that attempts to prove runtime execution from
source shape. Add:

```ts
expect(executeData027(rootWithoutReceipt)).toMatchObject({
  status: "BLOCKED",
  reason: "LOCAL_DB_EVIDENCE_UNAVAILABLE",
});
expect(executeData027(rootWithValidReceipt).status).toBe("PASS");
expect(executeData027(rootWithForgedReceipt)).toMatchObject({
  status: "BLOCKED",
  reason: "LOCAL_DB_EVIDENCE_UNAVAILABLE",
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm vitest run tests/specs/database-security-requirement-oracle.test.ts tests/specs/generated-requirement-coverage.test.ts
```

Expected: DATA-027 still dispatches `DB_PROJECTION` or returns FAIL.

- [ ] **Step 3: Add the `RUNTIME_RECEIPT` dispatcher**

In `executeRequirementOracle`, special-case the validated absence without
letting the outer catch collapse it to FAIL:

```ts
case "RUNTIME_RECEIPT": {
  if (row.id !== "DATA-027") throw Error("unsupported runtime receipt");
  if (validateData027Receipt(root)) status = "PASS";
  else {
    status = "BLOCKED";
    reason = "LOCAL_DB_EVIDENCE_UNAVAILABLE";
  }
  break;
}
```

Keep source-row fingerprint validation before this dispatcher. An exception in
source projection remains FAIL; evidence absence or invalidity is BLOCKED.

- [ ] **Step 4: Change the curated evidence entry**

Set the DATA-027 entry to:

```json
{
  "id": "DATA-027",
  "evidenceKind": "RUNTIME_RECEIPT",
  "oracle": {
    "kind": "RUNTIME_RECEIPT",
    "expected": "BLOCKED",
    "input": ".superpowers/evidence/data-027/receipt.json"
  },
  "testCase": "DATA-027 validates a worktree-local runtime receipt",
  "metric": "release_requirement_gate_status",
  "lifecycle": "CURRENT",
  "evidenceOwner": "database",
  "phase": "IMPLEMENTED",
  "closureCondition": "Run the bounded local Supabase gate for the current evidence-input bundle"
}
```

Update lifecycle validation so this one implemented runtime requirement may
have an expected baseline of BLOCKED while remaining CURRENT. Do not weaken
the rule for unrelated CURRENT entries. Generated coverage must compare the
actual oracle result with the curated baseline: no receipt is expected BLOCKED;
a test-scoped valid receipt explicitly asserts PASS.

- [ ] **Step 5: Regenerate and run the focused gates**

```powershell
node tools/write-requirement-registry.mjs
corepack pnpm vitest run tests/specs/database-security-requirement-oracle.test.ts tests/specs/generated-requirement-coverage.test.ts tests/specs/traceability.test.ts
node tools/check-docs.mjs
```

Expected: DATA-027 is honestly BLOCKED when no runtime receipt exists, all
other generated requirements retain their prior result, semantic/lifecycle
drift is zero.

- [ ] **Step 6: Commit**

```powershell
git add tools/requirement-oracle.ts tests/specs/database-security-requirement-oracle.test.ts config/requirement-evidence.v1.json docs/requirements-registry.v1.json tests/specs/generated-requirement-coverage.test.ts tools/check-docs.mjs tools/check-docs-lib.ts
git commit -m "fix(requirements): require DATA-027 runtime receipt"
```

---

### Task 5: Operations Documentation and End-to-End Verification

**Files:**
- Modify: `docs/operations/local-runtime.md`
- Verify: `.superpowers/evidence/data-027/receipt.json` remains ignored

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: an operator-visible gate procedure and verified PASS when Docker is
  available; otherwise a verified exact BLOCKED state.

- [ ] **Step 1: Document the exact operator contract**

Document:

```powershell
corepack pnpm check:db
```

Explain the worktree-local receipt path, non-production scope, input-bundle
freshness, commit provenance, exclusive lock, cleanup, and fixed error codes.
State that deleting `.superpowers/evidence/data-027/receipt.json` returns the
requirement to BLOCKED and that copying a receipt between worktrees is rejected
when the input bundle differs.

- [ ] **Step 2: Run exact-runtime non-DB verification**

```powershell
node tools/check-runtime.mjs
corepack pnpm typecheck
corepack pnpm vitest run --exclude tests/database --exclude tests/integration
node tools/check-docs.mjs
git diff --check
```

Expected: exact runtime PASS, typecheck PASS, non-DB tests PASS, docs gate PASS,
and no whitespace errors.

- [ ] **Step 3: Run the bounded DB gate**

```powershell
corepack pnpm check:db
```

If Docker/local Supabase is available, expected: every bounded step PASSes and
the final receipt validates. If unavailable, expected:
`SUPABASE_GATE_DOCKER_UNAVAILABLE`; continue only with the exact DATA-027
BLOCKED assertion and do not create a synthetic receipt.

- [ ] **Step 4: Verify final DATA-027 state and evidence hygiene**

```powershell
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts tests/specs/database-security-requirement-oracle.test.ts
git check-ignore .superpowers/evidence/data-027/receipt.json
git status --short
```

Expected with successful DB gate: DATA-027 PASS in the explicit receipt-backed
test, receipt path reported ignored, and no receipt staged. Expected without
Docker: DATA-027 exact BLOCKED reason and no receipt created or modified by a
failed run.

- [ ] **Step 5: Commit documentation**

```powershell
git add docs/operations/local-runtime.md
git commit -m "docs(database): document DATA-027 evidence gate"
```

---

## Acceptance Checklist

- [ ] Static TypeScript/AST inspection cannot produce DATA-027 PASS.
- [ ] Only the real `tests/database/concurrency.test.ts` emits observations.
- [ ] Twenty connections have a 5-second acquisition timeout.
- [ ] Direct Vitest writes no observation.
- [ ] Every observation is bound to one random gate run and cleaned in all exits.
- [ ] Same-worktree gates cannot concurrently publish receipts.
- [ ] Receipt freshness covers migrations, DB test/config, gate, writer/contract, and oracle.
- [ ] Commit SHA is retained only as provenance.
- [ ] Missing/invalid/stale receipt returns exact BLOCKED, not FAIL or PASS.
- [ ] DATA-027 evidence kind is `RUNTIME_RECEIPT`.
- [ ] Errors and receipts disclose no credential, URL, raw output, or personal path.
- [ ] A real local DB success is the only path to a reusable PASS receipt.
