# Task 2 Report — Five-Step Category Hint Ladders

## Outcome

Implemented the Task 2 hint-admission slice:

- exact `HintStepV1` contract and generated public/private JSON Schemas;
- five authored, localized steps with no runtime educational-text generation;
- `Intl.Segmenter` grapheme admission that keeps punctuation and spaces visible
  but excludes them from reveal indexes;
- category-specific English, proverb, idiom, and general-knowledge rules;
- elimination-option safety and reviewed-only Hanja admission;
- immutable ladder hashes and ranked exclusion for missing/rejected ladders;
- separate persisted `hintUnits` and authored `hintLadder` fields;
- catalog-to-draft-to-manifest-to-mobile propagation;
- representative admitted English, proverb, and idiom production ladders;
- pipeline documentation and the required non-normative `research.md` warning.

## RED evidence

The focused validator test was written before the implementation. The requested
pnpm launcher could not resolve the workspace binary, while the direct local
runner reached collection and failed as expected:

```text
Cannot find module './hint-ladder.js'
```

Contract, shared-fixture, learning-draft, bundle-writer, manifest, and mobile
mapping tests were also observed failing before their respective production
paths existed.

## GREEN evidence

Focused Task 2 suite:

```powershell
.\node_modules\.bin\vitest.CMD run packages/contracts/src/content.test.ts packages/contracts/src/projection.test.ts packages/content-validator/src tools/content/write-learning-bundle.test.ts tools/content/learning-manifest.test.ts apps/mobile/src/learning-demo/registry.test.ts apps/mobile/src/learning-demo/data.test.ts apps/mobile/src/learning-demo/production-boundary.test.ts
```

Result: 10 files and 104 tests passed.

Additional checks:

- scoped ESLint over all Task 2 TypeScript/JavaScript/mobile files: exit 0;
- `corepack pnpm content:schemas:check`: exit 0;
- `node tools/content/validate-catalog.js`: 81 entries valid in the accepted
  working tree;
- `tsc -p packages/content-validator/tsconfig.json --noEmit`: exit 0;
- manifest writer and mobile-registry generator reruns produced byte-identical
  SHA-256 hashes;
- `git diff --check`: exit 0 (line-ending warnings only).

`corepack pnpm vitest ...` still reports that `vitest` is not recognized under
the pnpm shim on Node 22; the identical checked-in local Vitest executable is
the passing command above. Repository-wide typecheck remains red only on
pre-existing mobile/economy errors outside Task 2; no broad/full suite was run.

## Production admission

The representative admitted ladders are:

- `en-resilience`;
- `ko-proverb-seeing-is-believing`;
- `ko-idiom-turn-misfortune`.

All other legacy bundles remain representable and are recorded as `MISSING`
with `rankedEligible: false`. The manifest marks only a valid five-step ladder
with a non-null immutable hash as ranked-eligible. Publish blocking remains a
separate rights/review gate.

## Dirty-baseline audit

The user explicitly accepted the pre-existing dirty production baseline.
Staging was therefore narrowed at the index level:

- catalog, the two baseline-overlapping selected drafts, and manifest contain
  only Task 2 ladder/category/hash/admission fields in the commit;
- the mobile registry is staged as the exact 79-entry projection of the staged
  manifest; the two accepted baseline entries remain only in the 81-entry
  working-tree projection;
- pre-existing source images, geometry, evidence, unrelated drafts, package
  files, design/plan edits, and content-pipeline utilities were not staged;
- `ko-idiom-turn-misfortune.json` was clean before Task 2 and is staged only
  for its category, ladder, and derived private-solution hash;
- the untracked pipeline documentation and `research.md` are staged because
  the Task 2 brief explicitly requires them.

The working tree intentionally retains the accepted baseline changes after the
Task 2 commit.
