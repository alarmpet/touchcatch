# Task 2 Fix-Round 3 Review - Five-Step Category Hint Ladders

**Verdict: APPROVED**

- **SPEC COMPLIANCE: PASS**
- **CODE/TEST QUALITY: PASS**

This is a static review of `review-c370977..373dc91.diff` against the remaining
Task 2 findings. No tests were rerun. All source and generated-artifact
references are to frozen commit `373dc91`; the intentionally restored dirty
81-entry working-tree registry was not reviewed.

The six findings closed in fix round 1 and the production four-option
general-knowledge finding closed in fix round 2 remain addressed.

## Open-finding disposition

### Original Important #6 - manifest-to-mobile immutable projection

**ADDRESSED.**

Registry generation independently verifies the private-solution self-hash
(`tools/content/generate-registry.js:61-64`) and the complete semantic
admission envelope (`:21-32,67-75`). It constructs the mobile semantic
snapshot at `:85-105`, emits it as a literal at `:106-108`, and leaves only
image-asset `require` calls at `:109-110`.

The frozen registry contains:

- 79 literal snapshot declarations
  (`apps/mobile/src/learning-demo/registry.ts:8-86`);
- the expected `learningDemoEntries` export (`:89`);
- 79 `buildDemoEntry` calls (`:90-168`);
- 158 correctly rooted
  `../../../../content/learning/source/...` image requires;
- exactly 3 `ADMITTED` and 76 `MISSING` snapshots; and
- zero `/drafts/` semantic imports.

`buildDemoEntry` exposes a ladder only for a ranked, 64-hex-hash,
exact-five-step `ADMITTED` snapshot
(`apps/mobile/src/learning-demo/data.ts:26-31`).

I independently regenerated the registry from a temporary `git archive` of
the frozen manifest, drafts, and generator. The committed and regenerated
files were byte-identical:

```text
SHA-256 209B37C55404D28A5C4BF35F0A3D8911ED79259C94A2DA3BA13238FBFCA07C83
```

### Fix-round-1 Important - match parser/shared HintStep parity

**ADDRESSED.**

The shared schema continues to define localized `ko`/`en` text with
`maxLength: 512` (`packages/contracts/src/content.ts:73-80`). The authored
ladder validator now counts Unicode code points with `[...value].length`
(`packages/content-validator/src/hint-ladder.ts:119-133`), and the active
match parser uses the same code-point count
(`packages/contracts/src/match.schema.ts:53`). The parser also retains the
shared reveal-index maximum, uniqueness, integer, and `0..63` constraints at
the same line.

Astral-character boundaries are covered independently:

- JSON Schema accepts 512 and rejects 513
  (`packages/contracts/src/content.test.ts:74-76`);
- authored admission accepts 512 and rejects 513
  (`packages/content-validator/src/hint-ladder.test.ts:247-249`); and
- active match parsing accepts 512 and rejects 513
  (`packages/game-engine/src/reducer.test.ts:81-86`).

### Fix-round-2 Critical - committed registry broke the mobile entrypoint

**ADDRESSED.**

The frozen registry exports `learningDemoEntries`
(`apps/mobile/src/learning-demo/registry.ts:89`), exactly matching the app
consumer (`apps/mobile/app/index.tsx:13-14`). `learningPacks`, the wrong-path
live draft imports, and the two dirty 81-entry additions are absent. Frozen
registry keys exactly match the committed 79-entry manifest.

### Fix-round-2 Important - Metro-incompatible `.js` specifiers

**ADDRESSED.**

Runtime source imports are extensionless
(`apps/mobile/src/learning-demo/data.ts:1-2`), the generator template emits an
extensionless `./data` import (`tools/content/generate-registry.js:114-121`),
and the frozen registry does the same
(`apps/mobile/src/learning-demo/registry.ts:4`). The strengthened production
boundary checks both `from` imports and `require` calls
(`apps/mobile/src/learning-demo/production-boundary.test.ts:13-21`).

## New Critical/Important findings introduced by this fix

### Critical

None found.

### Important

None found.

## SPEC COMPLIANCE - PASS

All previously open Task 2 findings are addressed in the frozen commit. The
production general-knowledge path is compatible across catalog, admission,
and runtime; the mobile projection is immutable and generator-reproducible;
HintStep length/index semantics agree across JSON Schema, admission, and match
parsing; and the Expo/Metro import boundary is restored.

## CODE/TEST QUALITY - PASS

The reported fix-round verification is 8 files and 101 passing tests; those
results were accepted as evidence and not rerun. The added tests directly
cover:

- frozen registry shape, export, manifest count, no draft imports, and image
  path rooting;
- private self-hash and semantic-admission drift;
- exact-five admission-only mobile projection;
- JSON Schema, authored-validator, and active-match astral 512/513
  boundaries; and
- Metro-resolvable runtime specifiers.

The independent frozen-archive regeneration additionally confirms byte
parity between the committed registry and its committed generator inputs.
Task 2 is ready for acceptance.
