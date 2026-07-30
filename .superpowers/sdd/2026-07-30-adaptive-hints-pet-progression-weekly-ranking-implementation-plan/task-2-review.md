# Task 2 Fix-Round 2 Review - Five-Step Category Hint Ladders

**Verdict: CHANGES REQUIRED**

- **SPEC COMPLIANCE: FAIL**
- **CODE/TEST QUALITY: FAIL**

This is a static review of `review-aed6e67..c370977.diff` against the three
open Task 2 findings. No tests were rerun. The claimed 5-file/74-test result
was considered, but the committed source contradicts two of those assertions.
All references below are to the frozen `c370977` snapshot, not the accepted
dirty working tree.

The six findings already closed in fix round 1 remain outside this scoped
review.

## Open-item disposition

### Original Important #4 - production four-option general knowledge

**ADDRESSED.**

The production catalog now permits three or four options and IDs
`option_1` through `option_4`, including `correctOptionId`
(`content/learning/catalog.schema.json:100-114`). Catalog validation runs the
schema and ladder admission
(`packages/content-validator/src/validate-learning-draft.ts:131-160`), while
bundle admission compares the ordered catalog/draft meaning and validates the
general-knowledge ladder before returning `ADMITTED` (`:225-288`).

The active match parser accepts three or four options, rejects duplicate IDs,
and requires the correct ID to be present
(`packages/contracts/src/match.schema.ts:52`). Its opaque-ID rule accepts
`option_4`. The new production-schema fixture uses four unique IDs, validates
the catalog, and reaches five-step admission
(`packages/content-validator/src/validate-learning-draft.test.ts:38-54`).

### Original Important #6 - manifest-to-mobile immutable projection

**NOT ADDRESSED.**

The generator implementation is corrected in isolation:

- it recomputes the private-solution self-hash
  (`tools/content/generate-registry.js:61-64`);
- it rebuilds the semantic admission envelope and checks the manifest hash
  (`:21-32,67-75`);
- it constructs a complete literal mobile snapshot and leaves only image
  asset `require` calls (`:85-110`); and
- `buildDemoEntry` exposes a ladder only for ranked, 64-hex-hash,
  exact-five-step `ADMITTED` input
  (`apps/mobile/src/learning-demo/data.ts:26-31`).

However, the committed `apps/mobile/src/learning-demo/registry.ts` is not that
generator output. It exports `learningPacks`, an 81-entry map of live draft
imports, with no semantic literals, admission hashes, `buildDemoEntry` calls,
or `learningDemoEntries` export (`registry.ts:1-84`). The last two entries at
`:82-83` also restore the dirty 81-entry projection instead of the committed
79-entry manifest projection.

This is not merely stale evidence: `apps/mobile/app/index.tsx:5,13-14`
requires `learningDemoEntries`, which the committed registry does not export.
Its `../../../content/...` imports also resolve from
`apps/mobile/src/learning-demo` to `apps/content/...`, not repository-root
`content/...`. The frozen mobile projection is therefore mutable, unpinned,
and unusable.

### Fix-round-1 Important - match parser/shared HintStep parity

**NOT ADDRESSED overall.**

Reveal-index parity is addressed. The active parser now mirrors the shared
maximum of 64 indexes, uniqueness, safe integer requirement, and range
`0..63` (`packages/contracts/src/match.schema.ts:53`; shared contract at
`packages/contracts/src/content.ts:82-88`). The negative cases cover
out-of-range and duplicate indexes
(`packages/game-engine/src/reducer.test.ts:81-96`).

Localized-text parity is still incomplete. JSON Schema `maxLength: 512`
counts Unicode code points (`packages/contracts/src/content.ts:73-80`;
`content/learning/catalog.schema.json:25-31`), while the active parser uses
JavaScript `v.length <= 512`, which counts UTF-16 code units
(`packages/contracts/src/match.schema.ts:53`). A schema-valid string containing
up to 512 astral characters can therefore be rejected by the match runtime.
The added 256/257/512/513 tests use only BMP Korean and ASCII strings, so they
do not exercise this mismatch
(`packages/game-engine/src/reducer.test.ts:73-78`).

## New Critical/Important findings introduced by this fix

### Critical

1. **The committed registry replacement breaks the active mobile entrypoint.**

   `apps/mobile/src/learning-demo/registry.ts:1-84` replaces the prior
   `learningDemoEntries` projection with a wrong-path, live-draft
   `learningPacks` loader. The consumer still destructures
   `learningDemoEntries` (`apps/mobile/app/index.tsx:13-14`), so the DEV mobile
   route receives `undefined` even before considering admission integrity.
   This committed artifact must be regenerated from the fixed generator and
   frozen manifest.

### Important

1. **The fix adds Metro-incompatible `.js` specifiers to runtime modules.**

   `apps/mobile/src/learning-demo/data.ts:1-2` imports
   `LearningDemoScreen.js` and the shared contract's `content.js`; the fixed
   generator template also emits `from './data.js'`
   (`tools/content/generate-registry.js:114-121`). The repository explicitly
   requires extensionless Metro-resolvable runtime imports
   (`apps/mobile/src/learning-demo/production-boundary.test.ts:13-21`).

No other new Critical or Important issue was found in this scoped diff.

## SPEC COMPLIANCE - FAIL

Only one of the three open items is fully addressed. The committed mobile
artifact still bypasses the immutable projection and breaks its consumer, and
match parsing remains incompatible with schema-valid astral Unicode at the
512-character boundary.

## CODE/TEST QUALITY - FAIL

The round adds useful admission, self-hash, semantic-drift, exact-five, and
reveal-index regressions. Those tests do not establish a passing frozen
commit:

- `apps/mobile/src/learning-demo/registry.test.ts:22` expects one
  `buildDemoEntry` call per manifest entry, but committed `registry.ts`
  contains none;
- the same test forbids `/drafts/` at `:36`, while every committed registry
  entry is a draft import;
- `production-boundary.test.ts:13-21` rejects the `.js` specifiers now present
  in `data.ts`; and
- the localization boundary tests use BMP/ASCII only and miss JSON Schema's
  code-point counting semantics.

The reported 5-file/74-test result therefore does not describe the frozen
`c370977` tree. Task 2 is not ready for acceptance.

## Fix round 3 implementation evidence

The frozen mobile artifact is now generated from the committed 79-entry
manifest and drafts, exports `learningDemoEntries`, contains complete literal
semantic snapshots, and has no live draft imports. Image assets are the only
runtime `require` calls and use repository-root-correct relative paths.

Localized hint limits now count Unicode code points in both authored ladder
validation and active match parsing. Astral-character tests accept 512 code
points and reject 513 in the JSON Schema, shared validator, and match parser.
Mobile runtime imports and generated output use Metro-compatible extensionless
specifiers.

Focused verification on 2026-07-30: 8 files passed, 101 tests passed. Frozen
index verification was performed against the staged registry blob before
commit: 79 entries, `learningDemoEntries` export, zero `/drafts/` imports,
158 correctly rooted image requires, and byte equality with generator output.
