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
- Duplicate promotion accepts exactly one source inventory row with count 10,
  locks subject then source, requires `copies >= 11`, decrements exactly 10,
  and persists a consumed target entitlement in the same transaction.
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
