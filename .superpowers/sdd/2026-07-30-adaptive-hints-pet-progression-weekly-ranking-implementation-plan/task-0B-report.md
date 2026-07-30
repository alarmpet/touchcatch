# Task 0B Report — Server-Authoritative Daily Pet Loop

## Status

Implemented the Task 0B minimum complete slice:

- strict DRAFT daily-loop policy and JSON Schema;
- runtime contracts for daily draw, duplicate promotion, collection, approved art, and public showcase;
- server-side KST date derivation and repository transaction boundaries;
- same-pet promotion policy requiring 11 owned copies, consuming 10, and retaining at least one;
- strict public-showcase allowlist that rejects private identifiers and user-authored private fields;
- private PostgreSQL claim, history, entitlement, receipt, and outbox tables;
- effect-once SQL entry points granted only to `economy_server`;
- pgTAP policy/ACL tests and a 20-connection database concurrency test;
- OpenAPI routes and strict request/response/error schemas.

## RED Evidence

Command:

```powershell
.\node_modules\.bin\vitest.cmd run packages/contracts/src/daily-pet-loop.test.ts apps/server/src/pets
```

Observed result before production files existed:

```text
Test Files  4 failed (4)
Tests       no tests
Cannot find module './daily-pet-loop.js'
Cannot find module './daily-draw.js'
Cannot find module './duplicate-promotion.js'
Cannot find module './showcase.js'
```

This was the expected missing-feature failure. The specified
`corepack pnpm vitest ...` form could not resolve `vitest` through pnpm in this
workspace, so the checked-in local binary was used. The runtime also warned
that Node `v22.16.0` does not match the repository pin `24.18.0`.

## GREEN Evidence

Focused behavior and OpenAPI:

```powershell
.\node_modules\.bin\vitest.cmd run packages/contracts/src/daily-pet-loop.test.ts apps/server/src/pets packages/contracts/src/openapi.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       34 passed (34)
```

Scoped strict TypeScript compilation of the Task 0B contracts/server/tests:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --exactOptionalPropertyTypes --skipLibCheck --types node,vitest/globals packages\contracts\src\daily-pet-loop.ts packages\contracts\src\daily-pet-loop.test.ts apps\server\src\pets\daily-draw.ts apps\server\src\pets\daily-draw.test.ts apps\server\src\pets\duplicate-promotion.ts apps\server\src\pets\duplicate-promotion.test.ts apps\server\src\pets\showcase.ts apps\server\src\pets\showcase.test.ts packages\contracts\src\openapi.test.ts
```

Result: exit 0.

Scoped ESLint:

```powershell
.\node_modules\.bin\eslint.cmd packages\contracts\src\daily-pet-loop.ts packages\contracts\src\daily-pet-loop.test.ts packages\contracts\src\openapi.test.ts apps\server\src\pets tests\database\daily-pet-loop-concurrency.test.ts
```

Result: exit 0.

OpenAPI:

```powershell
.\node_modules\.bin\redocly.cmd lint packages\contracts\openapi.yaml
```

Result: valid, zero warnings.

Repository-wide `tsc -p tsconfig.json` remains red on pre-existing mobile
extension/content-import errors, pre-existing economy admission type errors,
and requirement-oracle errors. The scoped Task 0B compilation is clean.

## Database Verification Block

The first `supabase test db --local` attempt was blocked by the filesystem
sandbox when the CLI attempted to write
`C:\Users\petbl\.supabase\telemetry.json`. After explicit approval to allow
that local config access, the CLI ran and reported:

```text
failed to inspect container health
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

Docker Desktop's Linux engine/local Supabase is not running. Therefore these
commands could not be truthfully reported as passed:

```powershell
supabase test db --local
corepack pnpm test:db:concurrency
```

The migration, pgTAP suite, and 20-connection test are implemented but require
a running local Supabase stack for execution.

## Files

- `config/daily-pet-loop.v1.json`
- `schemas/daily-pet-loop.schema.json`
- `packages/contracts/src/daily-pet-loop.ts`
- `packages/contracts/src/daily-pet-loop.test.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/openapi.yaml`
- `packages/contracts/src/openapi.test.ts`
- `apps/server/src/pets/daily-draw.ts`
- `apps/server/src/pets/daily-draw.test.ts`
- `apps/server/src/pets/duplicate-promotion.ts`
- `apps/server/src/pets/duplicate-promotion.test.ts`
- `apps/server/src/pets/showcase.ts`
- `apps/server/src/pets/showcase.test.ts`
- `supabase/migrations/202607300000_daily_pet_loop.sql`
- `supabase/tests/database/daily-pet-loop.test.sql`
- `supabase/tests/database/economy.test.sql`
- `supabase/tests/database/rls.test.sql`
- `tests/database/daily-pet-loop-concurrency.test.ts`

## Self-Review

- Daily draw uses a unique `(subject_key, claim_date, DAILY_FREE_DRAW_V1)`
  business key after locking the subject. Retry returns the stored response.
- KST date is derived in both server TypeScript and PostgreSQL; callers do not
  submit a claim date.
- Daily draw has no read or write against `private.gacha_pity_state`; pgTAP
  and concurrency tests pin 49/149 before/after.
- Daily and direct draws share approved economy/catalog pins but use separate
  receipts, history, and outbox tables.
- Duplicate promotion accepts exactly one same-pet request with count 10,
  locks the subject and every matching inventory row in stable UUID order,
  skips selected/locked rows, requires 11 aggregate copies, decrements exactly
  10 eligible copies, and persists one consumed target entitlement in the same
  transaction.
- Legendary promotion fails closed with
  `COSMETIC_REWARD_POLICY_REQUIRED`.
- Showcase parsing is strict at every object level and rejects auth IDs,
  email, economy subject keys, acquisition history, biography, location, and
  any other unknown property.
- Existing exact security-definer allowlists were extended only with the two
  new named functions; existing ACL/RLS assertions were not relaxed.
- Pre-existing dirty files outside the list above were not edited or staged.

## Concerns

1. Database syntax, pgTAP behavior, role grants, and real 20-session
   serialization still need execution on a running local Supabase/Docker
   engine.
2. Verification used Node `22.16.0`; the repository requires Node `24.18.0`.
3. The daily-loop policy remains intentionally `DRAFT`; production callers
   must continue to fail closed until the policy and referenced catalog/economy
   artifacts are approved.

## Fix Round 1/5

Addressed all six review findings:

- promotion now aggregates all rows for the same `pet_id`, locks them in stable
  `user_pet_id` order, never consumes selected/locked rows, retains the base
  copy, consumes exactly 10, and issues one effect-once entitlement;
- the trusted server adapter resolves authenticated user ID to subject key, and
  SQL independently requires that subject's FK-backed `user_id` remain
  non-null;
- legacy `acquired_at` values are backfilled only from real `gacha_history`;
  unknown dates remain nullable and are projected as
  `UNAVAILABLE_LEGACY`;
- promotion SQL accepts only JSON numeric integer `10` and a canonical UUIDv4
  pet ID;
- the concurrency harness resolves the Supabase CLI from the repository instead
  of hardcoding `D:/touchcatch`;
- pgTAP pins the exact `economy_server` function allowlist and covers same-key,
  different-hash idempotency conflict.

Regression tests were written first. Before the fixes:

```text
Tests  12 failed | 32 passed (44)
```

Fresh focused verification after the fixes:

```powershell
.\node_modules\.bin\vitest.cmd run packages/contracts/src/daily-pet-loop.test.ts packages/contracts/src/daily-pet-loop.sql.test.ts apps/server/src/pets packages/contracts/src/openapi.test.ts
```

```text
Test Files  6 passed (6)
Tests       45 passed (45)
```

The updated scoped strict TypeScript compilation, scoped ESLint, and Redocly
OpenAPI lint all exit successfully. A fresh local Supabase check still reports:

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

Accordingly, the pgTAP and real 20-session concurrency suites remain implemented
but runtime-blocked until Docker Desktop's Linux engine is available.

Prevention note: future server-authoritative flows should test the cross-layer
identity contract explicitly (auth user at the transport boundary, subject key
inside economy repositories) and include at least one fragmented-inventory
concurrency fixture rather than assuming one row per catalog item.

## Fix Round 2/5

Addressed both Important findings:

- neither security-definer command reads `auth.users`; both lock only a subject
  whose `economy_subjects.user_id` is non-null. The existing
  `ON DELETE SET NULL` foreign key supplies the liveness invariant without
  cross-schema execution privileges;
- both TypeScript command boundaries now resolve authenticated user ID to
  subject key before repository access. Duplicate promotion no longer accepts a
  raw subject key as caller authority;
- daily and promotion replays both re-check live linkage before returning a
  stored result;
- SQL owned/candidate lookups exclude `copies <= 0`, including source locks,
  aggregate promotion totals, daily reacquisition, and promotion outputs;
- collection projection removes tombstones before schema parsing and before
  owned/rarity totals. Showcase selection, favorites, and completion percentage
  are derived from that positive-copy collection.

Round-2 RED:

```text
Test Files  4 failed (4)
Tests       8 failed | 27 passed (35)
```

Fresh focused GREEN, including the JSON Schema/runtime parity test:

```powershell
.\node_modules\.bin\vitest.cmd run packages/contracts/src/daily-pet-loop.test.ts packages/contracts/src/daily-pet-loop.sql.test.ts apps/server/src/pets packages/contracts/src/openapi.test.ts
```

```text
Test Files  6 passed (6)
Tests       50 passed (50)
```

Scoped strict TypeScript, ESLint, Redocly OpenAPI validation, and final diff
whitespace validation also pass. The fresh Supabase runtime probe remains:

```text
failed to inspect container health
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

Therefore pgTAP and live 20-session concurrency remain Cannot Verify locally.

Prevention note: an effect-once replay must re-authorize before reading its
stored response, and any persisted zero-count history row must be excluded at
every ownership boundary before totals, percentages, or public DTO validation.
