# Task 1 Report — Learning Policy Contracts

## Status

Implemented the Task 1 contract slice:

- three authored `DRAFT` candidate policies for hints, solo progression, and
  weekly competition;
- strict runtime parsers that reject unknown keys at every object level and
  return deeply frozen values;
- aligned strict JSON Schemas;
- typed canonical SHA-256 parse results backed by the existing RFC 8785
  canonical JSON helper;
- fail-closed production loaders that accept only `APPROVED` policies with
  non-empty `approvalDecisionId`, `approvedBy`, and `approvedAt`;
- package-root exports for all policy types and APIs.

The weekly policy enables exactly `ENGLISH` and `PROVERB`, keeps `IDIOM` and
`GENERAL_KNOWLEDGE` explicitly disabled, requires five pinned published
revisions per enabled category, makes ranked pet effects cosmetic-only, and
defines only the rank-1 `RARE_ONLY_TICKET_V1`. That ticket is uniform within
the pinned RARE catalog and cannot affect direct-draw pity.

## RED Evidence

The requested command initially could not resolve the repository-local Vitest
binary through the fallback pnpm shim:

```powershell
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts
```

```text
'vitest' is not recognized as an internal or external command
```

After prepending the existing workspace `.bin` directory, the same command
reached test collection:

```powershell
$env:PATH = "$(Resolve-Path 'node_modules/.bin');$env:PATH"
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts
```

Observed expected missing-feature RED:

```text
Test Files  1 failed (1)
Tests       no tests
Error: Cannot find module './learning-policy.js'
```

No policy implementation, authored config, or JSON Schema existed when that
failure was captured.

## GREEN Evidence

Focused policy and canonical JSON verification:

```powershell
$env:PATH = "$(Resolve-Path 'node_modules/.bin');$env:PATH"
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts packages/contracts/src/canonical-json.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       34 passed (34)
```

Scoped strict TypeScript:

```powershell
corepack pnpm exec tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --useUnknownInCatchVariables --skipLibCheck --types node,vitest/globals packages/contracts/src/learning-policy.ts packages/contracts/src/learning-policy.test.ts
```

Result: exit 0.

Scoped ESLint:

```powershell
corepack pnpm exec eslint packages/contracts/src/learning-policy.ts packages/contracts/src/learning-policy.test.ts
```

Result: exit 0.

Whitespace validation:

```powershell
git diff --check
```

Result: exit 0. Git emitted line-ending warnings only for unrelated dirty
learning-demo/content files; Task 1 files had no whitespace errors.

Repository-wide TypeScript remains red:

```powershell
corepack pnpm typecheck
```

Fresh summarized result after Task 1 type fixes:

```text
exitCode=2
typescriptErrors=115
learningPolicyErrors=0
```

The remaining errors are outside Task 1, primarily dirty mobile
extension/content imports, existing economy admission types, traceability
tests, and requirement-oracle typing. They were not modified.

## Test Coverage

- exact hint, account XP, selected-pet XP, draw-point, weekly category, and
  rank-one ticket candidates;
- deeply frozen parser results;
- canonical SHA-256 result wrappers for all three policies;
- runtime parser and JSON Schema agreement;
- recursive unknown-key rejection;
- non-integer and negative reward rejection;
- duplicate and silently activated category rejection;
- ranked pet-advantage rejection;
- COMMON and LEGENDARY exclusion from the rare-only ticket;
- DRAFT production-load rejection;
- missing approval provenance rejection;
- successful loading only with complete approved provenance.

## Files

- `config/hint-policy.v1.json`
- `config/learning-progression.v1.json`
- `config/weekly-competition.v1.json`
- `schemas/hint-policy.schema.json`
- `schemas/learning-progression.schema.json`
- `schemas/weekly-competition.schema.json`
- `packages/contracts/src/learning-policy.ts`
- `packages/contracts/src/learning-policy.test.ts`
- `packages/contracts/src/index.ts`
- `.superpowers/sdd/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan/task-1-report.md`

## Concerns

1. Verification ran on Node `22.16.0`; the repository declares Node
   `24.18.0`. Every pnpm command reported the engine mismatch.
2. The repository-wide typecheck is not currently a usable clean gate because
   of unrelated dirty-worktree errors. The scoped strict Task 1 compile is
   clean.
3. All three policy artifacts intentionally remain `DRAFT`; production loaders
   fail closed until an approval decision and complete approval provenance are
   supplied.

## Fix Round 1

The review's approval timestamp parity finding was reproduced directly against
the committed hint runtime parser and AJV schema:

```text
{"approvedAt":"2026-07-30T10:00Z","runtime":true,"jsonSchema":false}
{"approvedAt":"2026-07-30 10:00:00Z","runtime":false,"jsonSchema":true}
{"approvedAt":"2026-07-30T10:00:00+09","runtime":false,"jsonSchema":true}
{"approvedAt":"2026-07-30T10:00:00.000Z","runtime":true,"jsonSchema":true}
```

The root cause was the different default grammars of
`z.iso.datetime({ offset: true })` and AJV's `date-time` format. Differential
tests were added before implementation for all three policy types.

RED:

```powershell
$env:PATH = "$(Resolve-Path 'node_modules/.bin');$env:PATH"
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts
```

```text
Test Files  1 failed (1)
Tests       18 failed | 48 passed (66)
```

The 18 failures showed runtime acceptance of omitted seconds and schema
acceptance of noncanonical separators, missing millisecond precision, and
non-UTC offsets.

Runtime and JSON Schema now admit exactly one approval timestamp syntax:
`YYYY-MM-DDTHH:mm:ss.sssZ`. Runtime uses Zod ISO datetime precision 3 with
offsets disabled. Each JSON Schema combines an exact UTC-millisecond pattern
with `format: "date-time"` so calendar validity is still enforced.

The differential suite now proves for hint, progression, and competition:

- canonical complete APPROVED admission succeeds through both validators;
- omitted seconds, a space separator, abbreviated `+09`, missing or
  non-three-digit milliseconds, and non-UTC offsets fail both;
- impossible dates and malformed timestamps fail both;
- empty and whitespace-only `approvalDecisionId`/`approvedBy` fail both;
- complete progression and competition production admission succeeds.

Representative deep-freeze evidence now covers policy roots and nested
progression/competition objects and arrays, including `drawPoints`, `ranked`,
`rankOneReward`, and `disabledCategories`.

Fresh GREEN:

```powershell
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts packages/contracts/src/canonical-json.test.ts
```

```text
Test Files  2 passed (2)
Tests       73 passed (73)
```

The scoped strict TypeScript and ESLint commands from the original report also
exit 0. Verification continues to emit the existing Node `22.16.0` versus
repository-required `24.18.0` engine warning.
