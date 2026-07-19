# Learning Spot-the-Difference Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영어·속담·사자성어 카테고리별 3개씩, 총 9개의 실제 대응 A/B 틀린그림찾기 DRAFT 콘텐츠 번들을 생성하고 자동 검증한다.

**Architecture:** 생성 brief와 학습 메타데이터는 `content/learning/catalog.v1.json`이 소유한다. 기준 A를 생성한 뒤 A를 참조한 통제 편집으로 B를 만들고, `visual-delta`가 지정 hitbox 안의 변화와 바깥 변화를 검사한다. 생성물은 사람의 권리·교육 검수 전까지 `content/learning/drafts`에만 존재하며 production validator는 계속 차단한다.

**Tech Stack:** TypeScript, Vitest, Sharp, Node crypto, existing `@spot-learn/contracts`, existing content validator, OpenAI image generation/editing.

## Global Constraints

- 콘텐츠 수는 영어 3, 속담 3, 사자성어 3으로 정확히 9개다.
- 대상 난이도는 중학생 이상이며 `difficulty: "ADVANCED"`를 사용한다.
- 모든 이미지는 밝은 2D 교육 게임 일러스트이며 baked-in text, 로고, 워터마크를 금지한다.
- 각 A/B pair는 동일 해상도와 동일 구도를 유지하고 의도된 차이는 정확히 10개다.
- 각 private solution은 동결 ruleset에 맞춰 NORMAL 7개, HARD 3개, Word Hunt NORMAL 2개/SPECIAL 1개, sudden-death 1개를 가진다.
- 차이·Word Hunt·sudden-death hitbox는 같은 side에서 겹치거나 접하지 않는다.
- A/B를 독립 생성하지 않고 A 생성 후 B 통제 편집만 허용한다.
- rights와 education 상태는 사람 검수 전 `REVIEW_REQUIRED`; production publish PASS를 주장하지 않는다.
- 정확한 Node 24.18.0/pnpm 11.13.0, CDN credential과 실제 publish는 외부 blocker로 유지한다.

---

### Task 1: DRAFT Catalogue and Validation Boundary

**Files:**
- Create: `content/learning/catalog.v1.json`
- Create: `content/learning/catalog.schema.json`
- Create: `content/learning/prompts/README.md`
- Create: `packages/content-validator/src/validate-learning-draft.ts`
- Test: `packages/content-validator/src/validate-learning-draft.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `LearningContentEntryV1` catalogue rows and `validateLearningDraft(path): Promise<LearningDraftValidationResult>`.
- Consumes: existing `validateFixtureObject`, but treats `RIGHTS_NOT_APPROVED` as the required DRAFT publish blocker rather than success.

- [ ] **Step 1: Write the failing catalogue test**

```ts
it('enumerates the exact nine approved design keys',()=>{
  expect(catalog.entries.map(x=>x.key)).toEqual([
    'en-resilience','en-dilemma','en-sustainability',
    'ko-proverb-dark-under-lamp','ko-proverb-seeing-is-believing','ko-proverb-kind-words-return',
    'ko-idiom-turn-misfortune','ko-idiom-prepare-ahead','ko-idiom-perspective',
  ]);
  expect(catalog.entries.every(x=>x.difficulty==='ADVANCED'&&x.status==='DRAFT')).toBe(true);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `vitest run packages/content-validator/src/validate-learning-draft.test.ts`
Expected: FAIL because catalogue and validator do not exist.

- [ ] **Step 3: Add the exact nine catalogue rows**

Each row must include `key`, `category`, `language`, `difficulty`, `canonicalAnswer`, `aliases`, three meaning options, `correctOptionId`, scene brief, ten change briefs, three Word Hunt briefs, sudden-death brief, `status: "DRAFT"`, and prompt provenance fields. English answers are `resilience`, `dilemma`, `sustainability`; Korean answers are the full approved proverb or idiom reading from the design spec.

- [ ] **Step 4: Implement fail-closed DRAFT validation**

```ts
export type LearningDraftValidationResult={
  structuralOk:boolean;
  publishBlocked:true;
  blocker:'RIGHTS_NOT_APPROVED'|'EDUCATION_REVIEW_REQUIRED'|'ASSETS_NOT_GENERATED';
};
```

The validator must never convert missing human approval into PASS.

- [ ] **Step 5: Run GREEN and recurring content tests**

Run: `vitest run packages/content-validator/src/validate-learning-draft.test.ts packages/content-validator/src/validate-content.test.ts`
Expected: PASS; existing approved fixtures remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add content/learning packages/content-validator/src package.json
git commit -m "feat(content): define learning draft catalogue"
```

### Task 2: Visual Delta and Geometry Evidence

**Files:**
- Create: `tools/content/visual-delta.ts`
- Create: `tools/content/visual-delta.test.ts`
- Create: `tools/content/write-learning-bundle.ts`
- Test: `tools/content/write-learning-bundle.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluateVisualDelta(imageA,imageB,regions,policy)` and `writeLearningBundle(entry,assets,hitboxes)`.
- Consumes: PNG files with exact matching width/height and normalized circle regions.

- [ ] **Step 1: Write RED tests for dimension, inside delta and outside leakage**

```ts
expect(await evaluateVisualDelta(a,b,regions,policy)).toMatchObject({
  dimensionsMatch:true, changedRegions:10, missingRegions:[], outsidePolicy:'PASS'
});
await expect(evaluateVisualDelta(a,wrongSize,regions,policy)).rejects.toThrow('PAIR_DIMENSION_MISMATCH');
await expect(evaluateVisualDelta(a,leakyB,regions,policy)).rejects.toThrow('UNDECLARED_VISUAL_DELTA');
```

- [ ] **Step 2: Confirm RED**

Run: `vitest run tools/content/visual-delta.test.ts tools/content/write-learning-bundle.test.ts`
Expected: FAIL because functions do not exist.

- [ ] **Step 3: Implement pixel mask evaluation with Sharp**

Decode both images to RGBA, measure per-pixel absolute RGB delta, union the ten normalized circle masks, require a non-zero material delta in every region, and reject material delta outside the union above the committed DRAFT policy. Store the measured report beside each bundle; do not alter images automatically.

- [ ] **Step 4: Implement deterministic descriptor and private hash writing**

Use actual file bytes for SHA-256 and encoded byte size, Sharp metadata for dimensions/MIME, `Intl.Segmenter` for hint units, and `canonicalJsonSha256` for `privateSolutionHash`.

- [ ] **Step 5: Run GREEN and mutation tests**

Run: `vitest run tools/content/visual-delta.test.ts tools/content/write-learning-bundle.test.ts`
Expected: PASS including wrong-size, missing-region and outside-leak mutations.

- [ ] **Step 6: Commit**

```bash
git add tools/content package.json
git commit -m "feat(content): verify paired image deltas"
```

### Task 3: English Image Pairs and Bundles

**Files:**
- Create: `content/learning/source/en-resilience-a.png`
- Create: `content/learning/source/en-resilience-b.png`
- Create: `content/learning/source/en-dilemma-a.png`
- Create: `content/learning/source/en-dilemma-b.png`
- Create: `content/learning/source/en-sustainability-a.png`
- Create: `content/learning/source/en-sustainability-b.png`
- Create: `content/learning/drafts/en-*.json`
- Create: `content/learning/evidence/en-*.visual-delta.json`
- Test: `content/learning/english-content.test.ts`

**Interfaces:**
- Consumes: catalogue rows and Task 2 bundle/delta functions.
- Produces: three DRAFT bundles with real A/B assets.

- [ ] **Step 1: Write RED tests asserting the three missing bundles**
- [ ] **Step 2: Generate each A image from its exact catalogue scene brief**
- [ ] **Step 3: Edit each A into B using only its ten declared changes**
- [ ] **Step 4: Inspect A/B visually and record ten measured paired hitboxes**
- [ ] **Step 5: Write bundles and visual-delta reports**
- [ ] **Step 6: Run `vitest run content/learning/english-content.test.ts` and require 3/3 PASS with publishBlocked=true**
- [ ] **Step 7: Commit `feat(content): add English learning image pairs`**

### Task 4: Korean Proverb Image Pairs and Bundles

**Files:**
- Create: `content/learning/source/ko-proverb-*-a.png`
- Create: `content/learning/source/ko-proverb-*-b.png`
- Create: `content/learning/drafts/ko-proverb-*.json`
- Create: `content/learning/evidence/ko-proverb-*.visual-delta.json`
- Test: `content/learning/proverb-content.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: three proverb DRAFT bundles.

- [ ] **Step 1: Write RED tests for the exact three proverb keys and answers**
- [ ] **Step 2: Generate A images without baked-in Korean text**
- [ ] **Step 3: Create B images through ten-change controlled edits**
- [ ] **Step 4: Measure non-overlapping hitboxes and build bundles**
- [ ] **Step 5: Run visual delta, geometry, normalization and DRAFT blocker tests**
- [ ] **Step 6: Commit `feat(content): add proverb learning image pairs`**

### Task 5: Korean Four-Character Idiom Image Pairs and Bundles

**Files:**
- Create: `content/learning/source/ko-idiom-*-a.png`
- Create: `content/learning/source/ko-idiom-*-b.png`
- Create: `content/learning/drafts/ko-idiom-*.json`
- Create: `content/learning/evidence/ko-idiom-*.visual-delta.json`
- Test: `content/learning/idiom-content.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: three idiom DRAFT bundles.

- [ ] **Step 1: Write RED tests for 전화위복, 유비무환, 역지사지**
- [ ] **Step 2: Generate A images using visual narrative rather than text labels**
- [ ] **Step 3: Create B images through ten-change controlled edits**
- [ ] **Step 4: Measure hitboxes, build bundles and retain REVIEW_REQUIRED rights**
- [ ] **Step 5: Run category tests and reject answer leakage or unapproved publish**
- [ ] **Step 6: Commit `feat(content): add idiom learning image pairs`**

### Task 6: Nine-Pack Cross-Validation and Handoff

**Files:**
- Create: `content/learning/manifest.v1.json`
- Create: `content/learning/review-checklist.md`
- Create: `content/learning/all-content.test.ts`
- Modify: `docs/release-evidence-blockers.md`

**Interfaces:**
- Consumes: all nine DRAFT bundles and visual evidence files.
- Produces: exact nine-entry manifest and human review handoff; no production publish.

- [ ] **Step 1: Write RED cross-pack tests**

Assert nine unique content IDs/revision IDs, eighteen unique image hashes, exact category counts, no duplicate canonical answer, every visual report PASS, and every bundle publishBlocked.

- [ ] **Step 2: Generate the manifest from verified files only**
- [ ] **Step 3: Add human review checklist for unintended differences, learning accuracy, rights and age suitability**
- [ ] **Step 4: Run full content verification**

Run: `vitest run content/learning packages/content-validator/src tools/content`
Expected: all local DRAFT tests PASS and all nine production publish attempts remain BLOCKED.

- [ ] **Step 5: Run repository regression checks**

Run: `node tools/check-docs.mjs`, content schema checks, non-DB tests excluding the known unavailable React render suite, contracts/game-engine typecheck, and `git diff --check`.

- [ ] **Step 6: Request read-only code/content review**

Reviewer must inspect undeclared visual differences, answer leakage, false rights approval, hitbox ambiguity and manifest/hash drift.

- [ ] **Step 7: Commit**

```bash
git add content/learning docs/release-evidence-blockers.md
git commit -m "feat(content): assemble nine-pack learning draft"
```

## External Completion Gate

After Task 6, the repository contains verified DRAFT content, not production-approved content. Completion still requires human education review, rights approval, actual iOS/Android playability review, CDN credentials, immutable upload, production DB publish, backup/PITR evidence and exact Node/pnpm verification.
