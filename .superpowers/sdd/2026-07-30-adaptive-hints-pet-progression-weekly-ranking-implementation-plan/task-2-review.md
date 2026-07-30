# Task 2 Fix-Round Review - Five-Step Category Hint Ladders

**Verdict: CHANGES REQUIRED**

- **SPEC COMPLIANCE: FAIL**
- **CODE/TEST QUALITY: FAIL**

This is a static re-review of `review-c141e34..aed6e67.diff` against
`task-2-brief.md`. The 205 passing tests reported in `task-2-report.md` are
accepted as evidence; no tests were rerun. Source references are to the
committed `aed6e67` snapshot.

## Original finding disposition

### 1. Critical - active runtime contract and separator charging

**ADDRESSED.**

The active parser now permits the optional ladder/Hanja fields and validates a
present five-step ladder
(`packages/contracts/src/match.schema.ts:52-54`). Match creation and parsing
require the reveal schedule to cover exactly the revealable, non-separator
indexes (`packages/game-engine/src/reducer.ts:20-21`;
`packages/contracts/src/match.schema.ts:54`). `USE_HINT` spends one credit for
the next such index (`reducer.ts:59`), while the pattern renders whitespace and
punctuation immediately (`reducer.ts:80-81`). The focused reducer regression
proves the visible, unscheduled, uncharged separator behavior
(`packages/game-engine/src/reducer.test.ts:24-51`).

### 2. Critical - authoritative ranked admission and immutable identity

**ADDRESSED.**

Manifest construction now validates the authoritative catalog before use
(`tools/content/learning-manifest.ts:50-54`). Attempted admission validates the
shared private schema and verifies the private-solution self-hash
(`packages/content-validator/src/validate-learning-draft.ts:189-203`), then
compares category, answer, segmentation, ordered meaning/correct option, Hanja
evidence, and the catalog-authored ladder (`:214-244`). It reruns ladder
semantics against the admitted draft context (`:245-265`), including the fixed
penalty (`packages/content-validator/src/hint-ladder.ts:443-457`). The admitted
hash binds that semantic envelope plus the verified private hash
(`validate-learning-draft.ts:274-287`), and ranking requires `ADMITTED`, five
steps, and a non-null hash (`tools/content/learning-manifest.ts:109-113`).

### 3. Critical - reproducible 79-entry legacy batch

**ADDRESSED.**

The writer now accepts an absent authored ladder and omits it from the rebuilt
private bundle (`tools/content/write-learning-bundle.ts:68-70,103-115`), with a
legacy regression at `tools/content/write-learning-bundle.test.ts:133-145`.
This removes the throw that previously stopped the default all-entry batch.
The committed-snapshot test reconstructs the 79-entry manifest/registry result
as 3 admitted and 76 missing (`tools/content/learning-manifest.test.ts:175-228`).
That evidence is compositional rather than a direct `runBatchBuildAll`
integration test, but the reported implementation blocker is gone.

### 4. Important - production general-knowledge ladder

**NOT ADDRESSED.**

The catalog now permits three or four options
(`content/learning/catalog.schema.json:100-104`), but every option ID and the
correct ID are still restricted to `option_1` through `option_3` (`:109,114`).
Every four-option catalog entry must therefore duplicate an ID, while the
active match parser rejects duplicate option IDs
(`packages/contracts/src/match.schema.ts:52`). The positive four-option
validator fixture still bypasses the production schema with the arbitrary IDs
`mars`, `venus`, `jupiter`, and `saturn`
(`packages/content-validator/src/hint-ladder.test.ts:234-244,318-326`). A
general-knowledge ladder still cannot be both catalog-valid and runtime-valid.

### 5. Important - optional legacy shared contract versus ranked five

**ADDRESSED.**

`hintLadder` is no longer required by the shared private contract, but a
present ladder is exactly five steps; reviewed Hanja remains an optional
paired field (`packages/contracts/src/content.ts:218-247`). Admission still
requires exactly five steps, and the manifest grants ranking only to a
five-step admitted ladder (`packages/content-validator/src/hint-ladder.ts:107-117,433-459`;
`tools/content/learning-manifest.ts:109-113`).

### 6. Important - manifest-to-mobile admission/hash binding

**NOT ADDRESSED.**

The fix now literalizes the admitted ladder and hash, but it does not pin or
verify the full payload represented by that hash. The registry hash
recalculation includes the draft's stored `privateSolutionHash` without
recomputing the self-hash over the current private body
(`tools/content/generate-registry.js:21-32,54-69`). A private-body change
outside the directly hashed challenge fields can therefore pass generation
when the stale stored hash is left in place.

The generated registry also continues to import each live draft
(`generate-registry.js:77-81`). Mobile takes its title, differences,
meaning/options, correct option, and hint units from that mutable import; only
the ladder/hash are snapshot literals
(`apps/mobile/src/learning-demo/data.ts:40-60`). Consumption checks merely the
hash's shape and ladder length (`:41-45`), so a draft changed after registry
generation can alter mobile semantics without changing `registry.ts`. The
registry test checks embedded status/hash strings, not full snapshot equality
or current-draft hash integrity
(`apps/mobile/src/learning-demo/registry.test.ts:21-36`).

### 7. Minor - exact answer-length number token

**ADDRESSED.**

Numeric matching now uses digit boundaries
(`packages/content-validator/src/hint-ladder.ts:69-71`) in both English and
general-knowledge length validation (`:237-247,360-370`). The `4` versus `14`
regression is covered at
`packages/content-validator/src/hint-ladder.test.ts:380-409`.

### 8. Minor - stale documentation

**ADDRESSED.**

The pipeline tag now says 79 packs
(`docs/03-ContentPipeline/10_CONTENT_AND_IMAGE_PIPELINE.md:3`), the active
writer reference names the TypeScript implementation and delegating wrapper
(`research.md:17-23`), and the stale 56-pack count/test command were replaced
(`research.md:76-79`). The pipeline document also records the 79/3/76
admission snapshot and intended semantic envelope
(`docs/03-ContentPipeline/10_CONTENT_AND_IMAGE_PIPELINE.md:70-79`).

## New Critical/Important findings introduced by the fix

### Critical

None found.

### Important

1. **The new active match ladder parser is stricter than both authoritative
   hint schemas.**

   The shared and production catalog schemas permit 512-character localized
   hint strings (`packages/contracts/src/content.ts:73-80`;
   `content/learning/catalog.schema.json:25-31`), but the new match parser
   rejects any string longer than 256 characters
   (`packages/contracts/src/match.schema.ts:53`). Consequently, a
   catalog-valid, shared-schema-valid, admitted 257-512-character hint can
   still be rejected by the active runtime. No boundary test covers this
   parser/schema parity case.

## SPEC COMPLIANCE - FAIL

Six of the eight original findings are addressed, including all three original
Critical findings. The production general-knowledge path and end-to-end mobile
binding remain incomplete, and the fix introduces a new runtime/schema
compatibility gap.

## CODE/TEST QUALITY - FAIL

The fix adds useful, non-tautological regressions for separator rendering and
charging, legacy writer behavior, catalog validation, post-admission ladder
drift, the committed 79/3/76 snapshot, and exact numeric tokens. The reported
205 passing tests are credible evidence for those paths.

The remaining boundary gaps are visible in the test design:

- the positive four-option general-knowledge test bypasses the production ID
  schema;
- the mobile registry test does not independently verify the current draft's
  private self-hash or a complete pinned semantic snapshot;
- no match test exercises the authoritative 512-character localization
  boundary; and
- default-batch evidence remains compositional rather than a direct
  all-entry batch invocation.

Task 2 is not ready for acceptance until the two remaining original Important
findings and the new parser/schema compatibility finding are resolved.

## Fix round 2 implementation evidence

All three remaining boundaries are addressed:

- the production catalogue permits unique `option_1` through `option_4` IDs,
  including `correctOptionId`, and the validator test admits a complete
  four-option general-knowledge fixture;
- registry generation independently verifies the private solution self-hash,
  rechecks the admitted semantic envelope, and emits a complete literal mobile
  snapshot. Runtime code imports only image assets and exposes a ladder only
  for an exact five-step, ranked, hash-pinned `ADMITTED` snapshot; and
- the active match parser now matches the shared HintStep limits: exact
  `ko`/`en`, localized text through 512 characters, ordinal/kind/penalty
  constraints, and unique reveal indexes in `0..63` with at most 64 values.

Focused verification on 2026-07-30: 5 files passed, 74 tests passed. This
includes 256/257/512/513 parser boundaries, all HintStep field negatives,
stale-private-hash rejection, draft-mutation isolation, the four-option GK
path, and deterministic committed 79-entry registry generation.
