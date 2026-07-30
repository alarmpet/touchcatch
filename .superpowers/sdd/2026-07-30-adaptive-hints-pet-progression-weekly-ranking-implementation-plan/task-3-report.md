# Task 3 Report: Deterministic Hint Revelation

## Outcome

Implemented deterministic five-step learning-hint revelation across the pure
game engine, authoritative match reducer, persisted contracts, socket schemas,
and owner-private event projection.

The implementation:

- reveals exactly the lowest unrevealed admitted ordinal;
- validates a present, ordered, exact-five ladder before revelation;
- applies `expectedOrdinal` compare-and-swap semantics;
- reuses the player command envelope `requestId` as the sole idempotency key;
- bounds processed reveal request IDs to the five possible revealed steps;
- spends one casual coach charge while charges remain, then keeps ordinary
  casual hints available at zero without going negative;
- makes ranked output independent of pet rarity, level, archetype, and coach
  charges;
- derives ranked cumulative penalty units from authoritative revealed steps;
- projects only the current localized step, masked grapheme pattern or
  admitted public region, ordinal, penalties, and applicable remaining
  charges to the owning player;
- redacts the event for every other viewer and cannot encode raw hitboxes or
  exact circles in the new public-region contract.

## RED Evidence

1. Pure engine missing-module RED:

   ```text
   FAIL packages/game-engine/src/hint-engine.test.ts
   Error: Cannot find module './hint-engine.js'
   ```

2. Reducer integration RED after adding the authoritative state/command tests:

   ```text
   6 failed | 52 passed
   Error: player strict
   ```

   This proved the new persisted player state was not yet admitted.

3. Contract/projection RED:

   ```text
   4 failed | 23 passed
   ```

   Failures covered the missing public-region schema, missing learning command
   branch, missing learning event branch, and unprojected domain event.

4. Server-pinned initialization RED:

   ```text
   1 failed | 58 skipped
   expected null to match object { mode: 'CASUAL', ... }
   ```

   The reducer was then made to initialize three casual charges and zero
   ranked charges from server-owned match creation input.

## GREEN Evidence

Fresh focused verification:

```text
.\node_modules\.bin\vitest.CMD run packages/game-engine/src packages/contracts/src/content.test.ts packages/contracts/src/socket.test.ts packages/contracts/src/projection.test.ts

Test Files  9 passed (9)
Tests       107 passed (107)
```

The generated content schema check passed:

```text
.\node_modules\.bin\tsx.CMD tools/write-content-schemas.ts --check
Exit code: 0
```

Scoped production TypeScript compilation passed:

```text
.\node_modules\.bin\tsc.CMD --noEmit ... [Task 3 contract and engine sources]
Exit code: 0
```

Scoped ESLint passed for all Task 3 source and test files:

```text
.\node_modules\.bin\eslint.CMD [Task 3 files]
Exit code: 0
```

`git diff --check` also passed.

## Files

- `packages/game-engine/src/hint-engine.ts`
- `packages/game-engine/src/hint-engine.test.ts`
- `packages/game-engine/src/reducer.ts`
- `packages/game-engine/src/reducer.test.ts`
- `packages/game-engine/src/input-projection.test.ts`
- `packages/game-engine/src/index.ts`
- `packages/contracts/src/content.ts`
- `packages/contracts/src/content.test.ts`
- `packages/contracts/src/match.ts`
- `packages/contracts/src/match.schema.ts`
- `packages/contracts/src/socket.ts`
- `packages/contracts/src/socket.schema.ts`
- `packages/contracts/src/socket.test.ts`
- `packages/contracts/src/projection.ts`
- `packages/contracts/src/projection.test.ts`
- `schemas/game-content.private.schema.json`

## Concerns and Environment Notes

- The workspace declares Node `24.18.0`, while verification ran on Node
  `22.16.0`.
- `corepack pnpm vitest ...` did not resolve the local Vitest executable in
  this dirty workspace. The checked-in local runner
  `.\node_modules\.bin\vitest.CMD` executed the same focused suites
  successfully.
- Root-wide TypeScript compilation remains blocked by pre-existing mobile
  registry/import and unrelated economy/test errors in the dirty workspace.
  Task 3 production sources pass the scoped strict compiler command.
- `MatchPlayerStateV1` now persists a `learningHints` field. Existing stored
  pre-Task-3 state documents without that field require a compatibility or
  migration decision before rolling this exact schema across live in-flight
  matches.
- User-owned 81-entry content/registry work and all unrelated dirty files were
  left untouched.

## Fix Round 1

- Added a non-mutating V1 read-boundary normalization for legacy player
  documents without `learningHints`; replay parsing now returns and replays the
  normalized initial state.
- Enforced reachable persisted learning state: exact ordinal prefixes, one
  receipt per reveal (maximum five), casual `max(3 - reveals, 0)` charges, and
  ranked cumulative penalty equality.
- Made visual hints discriminated and public-safe: visual ordinals 1-4 require
  a coarse named region, visual ordinal 5 requires a bounded normalized exact
  circle, and nonvisual hints forbid either descriptor.
- Added owner-only reconnect cursor projection with next ordinal, reveal
  history/count, charge or ranked accounting, and only the current localized
  public step. Opponent and spectator snapshots receive `null`; legacy wire
  snapshots may omit the field.
- Aligned domain and wire parsers on Unicode code-point limits and all visual,
  casual, and ranked cross-field rules.
- Added regression matrices for frozen legacy replay, persisted invariant
  drift, 512/513 astral text, owner/opponent/spectator privacy, same-snapshot
  contention, five reveals, and terminal receipt retry.
- Verification: 151 focused tests passed; scoped ESLint and generated content
  schema checks passed. Root TypeScript remains red only on pre-existing
  mobile/catalog, economy, traceability, and old reducer-test inference errors.

## Fix Round 2

- Made reconnect `current` hints a fail-closed discriminated union in both the
  public TypeScript contract and Zod parser: early visual hints require a named
  region, ordinal five requires an exact normalized circle, and nonvisual
  hints require a null descriptor.
- Unified learning event and reconnect-current public-pattern limits on Unicode
  code points (64 accepted, 65 rejected), parallel to localized hint text.
- Tightened casual/ranked wire parity so casual events require an integer coach
  charge and ranked events require null.
- Added all 19 domain event types, including `HINT_STEP_REVEALED`, to the
  owner/opponent/public projection matrix.
- Verification: 57 focused match/socket/projection tests passed, scoped ESLint
  passed, and scoped contract TypeScript reported no errors. The generated
  content-schema check is presently blocked by concurrent uncommitted
  `content.ts`/generated-schema drift outside this fix-round scope.

## Fix Round 3

- Applied the shared 64-code-point predicate to the outer reconnect
  `finalChallenge.viewer.publicPattern`, matching learning events and the
  current learning cursor.
- Made reconnect learning accounting mode-discriminated in TypeScript and Zod:
  casual cursors carry reachable integer charges and zero ranked units, while
  ranked cursors carry null charges and cumulative units equal to the revealed
  count.
- Exercised real `projectSnapshot` output with 33- and 64-astral-character
  outer/current patterns and confirmed 65 is rejected.
- Verification: 15 focused socket/projection tests passed; scoped ESLint and
  scoped contract TypeScript passed.
