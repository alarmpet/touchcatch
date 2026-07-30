# Task 0C — DB coach-archetype publisher alignment

## Outcome

Implemented the admitted `coachArchetype` contract as a forward-only database
migration. `private.pet_definitions` now stores an immutable, non-null coach
archetype, existing/legacy rows resolve to `CHEER`, and the publisher validates,
persists, and identity-pins the exact admitted values.

## Files

- `supabase/migrations/202607300001_pet_coach_archetype.sql`
  - Adds `coach_archetype text not null default 'CHEER'`.
  - Adds a check constraint allowing only `SCOUT`, `LINGUIST`, `SAGE`, or
    `CHEER`.
  - Replaces `private.publish_economy_bundle_v1(jsonb,jsonb)` without changing
    its signature or unrelated behavior.
  - Requires the exact entry keys
    `coachArchetype`, `displayKey`, `petId`, and `rarity`.
  - Rejects non-string and out-of-set archetypes with
    `CATALOG_ENTRY_INVALID`.
  - Persists `coachArchetype` and includes it in `PET_IDENTITY_DRIFT`.
- `supabase/tests/database/coach-archetype.test.sql`
  - Adds 15 pgTAP assertions covering storage/default/constraint,
    valid publication, invalid value and type with zero writes, archetype
    identity drift with zero writes, immutability, owner, fixed search path,
    security definer, and split deployment-role grants.

No historical migration, production configuration, or unrelated dirty file was
changed.

## TDD evidence

The focused test was written before the production migration.

The pgTAP file was executed against the running local Supabase Postgres
container with:

```powershell
# The sandbox-safe run encoded the file, then executed the equivalent stream:
docker exec supabase_db_touchcatch sh -lc `
  "echo <base64-of-coach-archetype.test.sql> | base64 -d | psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres"
```

RED, before `202607300001_pet_coach_archetype.sql`:

```text
1..15
# Looks like you failed 8 tests of 15
```

Expected failures included:

- `private.pet_definitions.coach_archetype` did not exist.
- Valid publication died with `22023: CATALOG_ENTRY_INVALID`.
- Zero archetypes were stored and the legacy/default value was null.
- Storage references to `coach_archetype` failed with `42703`.
- Changed-archetype republication returned `CATALOG_ENTRY_INVALID` instead of
  `PET_IDENTITY_DRIFT`.

After applying only the new migration with `psql -v ON_ERROR_STOP=1`, GREEN:

```text
1..15
15 assertions passed
```

The GREEN run proves:

- 50 valid entries publish and store all four exact archetypes.
- A legacy direct insert receives `CHEER`.
- The storage constraint rejects `TUTOR`.
- Updates remain blocked by `IMMUTABLE_ECONOMY_REVISION`.
- Unknown and non-string publisher values both return
  `CATALOG_ENTRY_INVALID`, with policy/catalog/entry/pet row counts unchanged.
- A changed archetype for an existing `petId` returns `PET_IDENTITY_DRIFT`,
  with row counts unchanged.

## Targeted verification

All commands used the already-running local database; no full DB suite was run.

- Focused Task 0C pgTAP: `15/15` passed.
- Existing economy pgTAP:

  ```text
  1..63
  63 assertions passed
  ```

- Existing daily-pet-loop pgTAP:

  ```text
  1..34
  34 assertions passed
  ```

- PL/pgSQL static check:

  ```sql
  select *
  from plpgsql_check_function(
    'private.publish_economy_bundle_v1(jsonb,jsonb)'::regprocedure
  );
  ```

  Result: zero findings.

- Real config-backed economy concurrency publication path:

  ```powershell
  $env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55322/postgres'
  .\node_modules\.bin\vitest.CMD run --config vitest.db.config.ts `
    tests/database/economy-concurrency.test.ts `
    -t "rejects DRAFT and forged/extra publisher artifacts without rows"
  ```

  Result: `1 passed`, `17 skipped`.

- Real config-backed daily-loop concurrency publication path:

  ```powershell
  $env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55322/postgres'
  .\node_modules\.bin\vitest.CMD run --config vitest.db.config.ts `
    tests/database/daily-pet-loop-concurrency.test.ts `
    -t "collapses 20 same-day claims before entropy and preserves direct-draw pity"
  ```

  Result: `1 passed`, `1 skipped`.

The full `corepack pnpm check:db` is intentionally left for the root integration
run.

## Security and compatibility notes

- A constant `NOT NULL DEFAULT 'CHEER'` is the migration-safe backfill: existing
  rows immediately read as `CHEER` without temporarily disabling the immutable
  table trigger, and legacy direct inserts remain compatible.
- The check constraint is enforced at storage even if callers bypass the
  publisher.
- `create or replace function` keeps the existing function identity, owner, and
  ACL. The replacement restates `security definer` and
  `set search_path=pg_catalog`; pgTAP verifies the owner remains
  `economy_security_owner`, only `economy_deployment_role` retains publish
  execution, and `deployment_role` remains denied.
- The migration temporarily grants the migration user membership in
  `economy_security_owner`, following the repository's forward-migration
  pattern, and revokes it before completion.
- Existing pet identities are deliberately pinned to the `CHEER` backfill.
  Republishing one of those `petId` values with another archetype fails closed
  as identity drift, as required.
- Ranked pet effects and cosmetic behavior are untouched.
