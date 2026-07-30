# Task 0C — DB coach-archetype publisher alignment

## Outcome

Implemented the admitted `coachArchetype` contract as a forward-only database
migration. `private.pet_definitions` now stores an immutable, non-null coach
archetype, rows that predate the migration are backfilled to `CHEER`, future
durable inserts require an explicit value, and the publisher validates,
persists, and identity-pins the exact admitted values.

## Files

- `supabase/migrations/202607300001_pet_coach_archetype.sql`
  - Adds `coach_archetype text not null` with a one-time `CHEER` default to
    populate existing rows, then drops the default before the migration ends.
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
  - Adds 17 pgTAP assertions covering storage/no-default/constraint,
    valid publication, invalid value and type with zero writes, archetype
    identity drift with zero writes, exact per-pet persistence, immutability,
    owner, fixed search path, security definer, and the exact publisher ACL.
- `supabase/tests/database/economy.test.sql`
- `supabase/tests/database/daily-pet-loop.test.sql`
  - Their direct durable pet fixtures now provide explicit `CHEER` values
    instead of relying on a database default.

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

That initial GREEN proved the publisher/storage alignment, but its future
default behavior was superseded by review fix round 1 below:

- 50 valid entries publish and store all four exact archetypes.
- The storage constraint rejects `TUTOR`.
- Updates remain blocked by `IMMUTABLE_ECONOMY_REVISION`.
- Unknown and non-string publisher values both return
  `CATALOG_ENTRY_INVALID`, with policy/catalog/entry/pet row counts unchanged.
- A changed archetype for an existing `petId` returns `PET_IDENTITY_DRIFT`,
  with row counts unchanged.

## Targeted verification

All commands used the already-running local database; no full DB suite was run.

- Focused Task 0C pgTAP: `17/17` passed after review fix round 1.
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

- A constant `NOT NULL DEFAULT 'CHEER'` performs the migration-safe backfill:
  existing rows immediately read as `CHEER` without temporarily disabling the
  immutable table trigger. The migration then drops the default, so future
  durable identities cannot synthesize an unadmitted archetype.
- The check constraint is enforced at storage even if callers bypass the
  publisher.
- `create or replace function` keeps the existing function identity, owner, and
  ACL. The replacement restates `security definer` and
  `set search_path=pg_catalog`; pgTAP verifies that the complete explicit
  EXECUTE ACL contains exactly `economy_security_owner` and
  `economy_deployment_role`.
- The migration temporarily grants the migration user membership in
  `economy_security_owner`, following the repository's forward-migration
  pattern, and revokes it before completion.
- Existing pet identities are deliberately pinned to the `CHEER` backfill.
  Republishing one of those `petId` values with another archetype fails closed
  as identity drift, as required.
- Ranked pet effects and cosmetic behavior are untouched.

## Review fix round 1

Review found that retaining `DEFAULT 'CHEER'` would silently manufacture an
immutable identity for any future direct insert that omitted the column. The
review fix kept the constant default only long enough for PostgreSQL to
backfill rows that predate the migration, then added:

```sql
alter table private.pet_definitions
  alter column coach_archetype drop default;
```

TDD RED was captured against the first implementation before changing the
migration:

```text
1..17
# Looks like you failed 2 tests of 17
```

The two intended failures were:

- `information_schema.columns.column_default` had `'CHEER'::text` instead of
  null.
- A future durable insert without `coach_archetype` raised no exception instead
  of `23502`.

After dropping the final default, focused GREEN was:

```text
1..17
17 assertions passed
```

The round also strengthened evidence without changing publisher behavior:

- A catalog-entry-to-row join asserts zero per-`petId` archetype mismatches.
- The publisher ACL assertion compares the complete explicit EXECUTE grantee
  array to exactly
  `['economy_deployment_role', 'economy_security_owner']`.
- Direct fixtures in the economy and daily-loop pgTAP files now pass explicit
  `CHEER`.

Post-fix targeted results:

```text
coach-archetype.test.sql  17/17 passed
economy.test.sql          63/63 passed
daily-pet-loop.test.sql   34/34 passed
```

The first daily-loop run observed one unrelated consumed entitlement left by a
prior local concurrency run and therefore reported 33/34. The passing rerun
temporarily removed that one pre-existing artifact inside the same outer
transaction; the final `ROLLBACK` restored the local database unchanged.
