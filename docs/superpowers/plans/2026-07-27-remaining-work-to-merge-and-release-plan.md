# TouchCatch Remaining Work to Merge and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the reviewed Supabase-auth and DATA-027 work from an isolated, honestly BLOCKED branch to a playable, internally GREEN integration commit, while preserving external provider/device/release blockers until real evidence exists.

**Architecture:** Work is split into three tracks. Track A closes the two remaining local defects and produces real local DB evidence. Track B integrates the auth branch with the user-owned content work in a clean worktree without touching dirty `main`. Track C records only real provider, device, governance, and production evidence; it cannot be satisfied by local fixtures.

**Tech Stack:** Node.js `24.18.0`, pnpm `11.13.0`, TypeScript, Expo Router, React Native, Vitest, Supabase CLI, PostgreSQL/pgTAP, Docker Desktop, Git worktrees, GitHub.

## Global Constraints

- Work from `D:\touchcatch\.worktrees\supabase-auth` until Track B creates a separate clean integration worktree.
- Never modify, stash, reset, stage, or clean dirty `D:\touchcatch` main.
- Preserve all user-owned untracked files and the dirty content changes in main.
- DATA-027 stays `BLOCKED / LOCAL_DB_EVIDENCE_UNAVAILABLE` until `corepack pnpm check:db` succeeds against the exact local Supabase stack.
- Never synthesize, copy, or hand-edit `.superpowers/evidence/data-027/receipt.json`.
- Required runtime is exactly Node `v24.18.0` and pnpm `11.13.0`.
- The local playable route uses the learning-demo content path in development; production must not ship the public-match fixture as a fake authenticated match.
- Canonical match content remains exactly `7 NORMAL + 3 HARD`; this plan does not introduce an `EASY` runtime tier or change the 75-second ruleset.
- Perceptual fairness metadata supplements, but never replaces, authoritative private hitboxes and content hashes.
- Google/Kakao credentials, trusted reviewer signatures, physical-device goldens, and production approvals remain BLOCKED until supplied by their actual owners.
- Each implementation task uses RED → GREEN → focused regression → read-only task review → commit.

---

## Current Verified Baseline

| Area | State |
|---|---|
| DATA-027 implementation review | Ready; final review found 0 Critical, 0 Important, 0 Minor |
| DATA-027 focused verification | 373/373 PASS on Node `24.18.0` |
| TypeScript | Node and mobile typechecks PASS |
| Docs/traceability | all drift counts 0 |
| Local DB receipt | Absent; Docker daemon unavailable |
| Bounded DB gate | exact `SUPABASE_GATE_DOCKER_UNAVAILABLE` |
| Non-DB suite | one reproducible failure in `tests/contracts/ui-final-acceptance.test.ts` |
| Mobile root | currently renders non-playable `GuestLearningScreen` metadata |
| Dirty-main collision | exact known intersection: `package.json`, `apps/mobile/package.json` |
| Integration | auth branch not merged or pushed by this plan |

## File Map

- Modify `apps/mobile/app/index.tsx`: development-only playable learning route; production guest boundary remains explicit.
- Modify `tests/contracts/ui-final-acceptance.test.ts`: remove stale fake `BattleScreen` fixture-route assertion and pin the real playable route contract.
- Modify `apps/mobile/src/learning-demo/production-boundary.test.ts`: pin production exclusion and development playability together.
- Create `docs/testing/reports/data-027-local-db-evidence-2026-07-27.md`: real bounded-gate evidence without secrets.
- Create `docs/testing/reports/internal-readiness-2026-07-27.md`: exact local gate inventory.
- Create `docs/testing/reports/auth-integration-collision-audit-2026-07-27.md`: refreshed branch/main collision evidence.
- Modify `package.json` and `apps/mobile/package.json` only in the clean integration target: semantic union of auth and content work.
- Modify `content/learning/all-content.test.ts` and move `research.md` only in an approved content/integration worktree.
- Update provider/device/release evidence files only after real external evidence is available.

---

# Track A — Local Playability and Internal Readiness

### Task 1: Replace the Stale Battle Fixture Route Contract

**Files:**
- Modify: `apps/mobile/app/index.tsx`
- Modify: `tests/contracts/ui-final-acceptance.test.ts`
- Modify: `apps/mobile/src/learning-demo/production-boundary.test.ts`
- Test: `apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx`

**Interfaces:**
- Consumes: `LearningDemoHome`, `learningDemoEntries`, `GuestLearningScreen`, and `publicGuestSamples`.
- Produces: a development root that opens the real learning spot-the-difference game and a production root that does not expose draft solution geometry or the fake authenticated match fixture.

- [ ] **Step 1: Replace the stale assertion with a RED route contract**

The accepted contract is:

```ts
it("routes development to the playable learning demo without a fake match fixture", () => {
  const source = readFileSync("apps/mobile/app/index.tsx", "utf8");
  expect(source).toContain("__DEV__");
  expect(source).toContain("LearningDemoHome");
  expect(source).toContain("learningDemoEntries");
  expect(source).not.toContain("public-match-snapshot.json");
  expect(source).not.toContain("<BattleScreen");
});

it("retains an explicit production guest fallback", () => {
  const source = readFileSync("apps/mobile/app/index.tsx", "utf8");
  expect(source).toContain("GuestLearningScreen");
  expect(source).toContain("publicGuestSamples");
});
```

Run:

```powershell
node node_modules/vitest/vitest.mjs run tests/contracts/ui-final-acceptance.test.ts apps/mobile/src/learning-demo/production-boundary.test.ts
```

Expected: RED because the current root contains only `GuestLearningScreen`.

- [ ] **Step 2: Implement the development/production route split**

Use a dev-only lazy registry load so production does not eagerly expose the
solution-bearing learning registry:

```tsx
import { GuestLearningScreen } from "../src/guest-content/GuestLearningScreen";
import { publicGuestSamples } from "../src/guest-content/registry";
import { LearningDemoHome } from "../src/learning-demo/LearningDemoScreen";

declare const __DEV__: boolean;
declare const require: (
  path: string,
) => typeof import("../src/learning-demo/registry");

export default function Home() {
  if (__DEV__) {
    const { learningDemoEntries } = require("../src/learning-demo/registry");
    return <LearningDemoHome entries={learningDemoEntries} />;
  }
  return <GuestLearningScreen samples={publicGuestSamples} />;
}
```

If `LearningDemoHome` is currently declared in the route module rather than
`LearningDemoScreen.tsx`, move that pure wrapper into
`apps/mobile/src/learning-demo/LearningDemoScreen.tsx` and export it there.
Do not import `public-match-snapshot.json`.

- [ ] **Step 3: Pin actual game behavior**

The component test must select an entry, tap all declared difference circles
through the same reducer used by the screen, answer its quiz, and observe
`COMPLETE`. Use a two-entry fixture covering two different categories; do not
assert only that headings render.

```ts
expect(screen.root.findByProps({ accessibilityLabel: "Learning complete" }))
  .toBeDefined();
```

Replace the old production-boundary assertion that rejects every
`learning-demo`/`require(` token with the exact guarded contract:

```ts
it("loads solution-bearing demo content only inside the development branch", async () => {
  const source = await readFile("apps/mobile/app/index.tsx", "utf8");
  expect(source).toMatch(/if\s*\(__DEV__\)/);
  expect(source).toMatch(
    /if\s*\(__DEV__\)[\s\S]*require\(["']\.\.\/src\/learning-demo\/registry["']\)/,
  );
  expect(source).not.toMatch(/public-match-snapshot|privateSolution|hitbox/);
  expect(source.indexOf("require(")).toBeGreaterThan(source.indexOf("if (__DEV__)"));
});
```

- [ ] **Step 4: Run focused and mobile acceptance tests**

```powershell
node node_modules/vitest/vitest.mjs run tests/contracts/ui-final-acceptance.test.ts apps/mobile/src/learning-demo/production-boundary.test.ts apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx
corepack pnpm typecheck
```

Expected: all focused tests and both typechecks PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/app/index.tsx apps/mobile/src/learning-demo/LearningDemoScreen.tsx apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx apps/mobile/src/learning-demo/production-boundary.test.ts tests/contracts/ui-final-acceptance.test.ts
git commit -m "fix(mobile): route development to playable learning game"
```

---

### Task 2: Restore a Reproducible Workspace Installation

**Files:**
- Verify: `package.json`
- Verify: `pnpm-lock.yaml`
- Verify: `node_modules/.bin/vitest.cmd`
- Do not commit: `node_modules`, `.pnpm-install*.log`, `.stale-node-modules*`

**Interfaces:**
- Consumes: exact Node/pnpm runtime and committed lockfile.
- Produces: a workspace where the documented `corepack pnpm vitest` command resolves without the direct `node_modules/vitest/vitest.mjs` workaround.

- [ ] **Step 1: Record the current RED**

```powershell
corepack pnpm vitest --version
```

Expected before repair: command-not-found because the current worktree install
does not expose the Vitest shim.

- [ ] **Step 2: Verify no tracked dependency input is dirty**

```powershell
git diff -- package.json pnpm-lock.yaml
node --version
corepack pnpm --version
```

Expected: no dependency diff, `v24.18.0`, `11.13.0`.

- [ ] **Step 3: Perform a frozen install**

```powershell
corepack pnpm install --frozen-lockfile
```

Do not delete `.stale-node-modules*` or install logs; they are user-owned
diagnostic artifacts. If install cannot replace the current junction layout,
perform the install in a new clean worktree rather than deleting unknown files.

- [ ] **Step 4: Verify the normal launcher**

```powershell
corepack pnpm vitest --version
corepack pnpm typecheck
git status --short
```

Expected: Vitest `4.1.10`, typechecks PASS, and no tracked install diff.

- [ ] **Step 5: Record no commit**

This task is environment repair only. If `package.json` or `pnpm-lock.yaml`
changes, stop and review the dependency drift instead of committing it.

---

### Task 3: Generate Real DATA-027 Local DB Evidence

**Files:**
- Runtime-only ignored output: `.superpowers/evidence/data-027/receipt.json`
- Create: `docs/testing/reports/data-027-local-db-evidence-2026-07-27.md`

**Interfaces:**
- Consumes: Docker Desktop daemon, local Supabase CLI stack, exact runtime, completed Tasks 1–2.
- Produces: a valid ignored receipt and a redacted operator report.

- [ ] **Step 1: Start and verify Docker**

```powershell
docker version --format "{{.Server.Version}}"
```

Expected: non-empty server version. If the daemon is unavailable, keep
DATA-027 BLOCKED and stop this task without creating a report claiming PASS.

- [ ] **Step 2: Prove the pre-run BLOCKED state**

```powershell
Test-Path .superpowers/evidence/data-027/receipt.json
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts tests/specs/database-security-requirement-oracle.test.ts
```

Expected before the first successful gate: `False`, hermetic coverage PASS, and
the explicit no-receipt DATA-027 assertion returns
`BLOCKED / LOCAL_DB_EVIDENCE_UNAVAILABLE`. If a receipt already exists, do not
delete it manually; validate it and let the bounded gate perform its own
fail-closed invalidation lifecycle.

- [ ] **Step 3: Run the bounded gate**

```powershell
corepack pnpm check:db
```

Expected sequence: runtime preflight, Docker preflight, reset, lint, pgTAP,
local auth, DATA-027 concurrency, cleanup, atomic receipt publication.
Expected result: exit `0`.

- [ ] **Step 4: Validate post-run evidence**

```powershell
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts tests/specs/database-security-requirement-oracle.test.ts tests/specs/data-027-runtime-evidence.test.ts
git check-ignore .superpowers/evidence/data-027/receipt.json
git status --short
```

Expected: tests PASS, receipt is ignored, no receipt or lock is staged.

- [ ] **Step 5: Write the redacted report**

Record only:

- commit SHA
- Node/pnpm versions
- Docker/Supabase CLI versions
- bounded step names and exit status
- pgTAP and focused test counts
- receipt SHA-256 and evidence-input bundle SHA-256

Do not record connection URLs, anon/service keys, access tokens, raw stdout,
personal absolute paths, or receipt contents.

- [ ] **Step 6: Commit the report**

```powershell
git add docs/testing/reports/data-027-local-db-evidence-2026-07-27.md
git commit -m "docs(database): record local DATA-027 evidence"
```

---

### Task 4: Full Internal Readiness Gate

**Files:**
- Create: `docs/testing/reports/internal-readiness-2026-07-27.md`
- Modify: `docs/superpowers/plans/2026-07-27-remaining-work-to-merge-and-release-plan.md`

**Interfaces:**
- Consumes: playable route, reproducible install, real DB receipt.
- Produces: an exact internal PASS or a bounded defect list.

- [ ] **Step 1: Run the complete aggregate**

```powershell
node --version
corepack pnpm --version
corepack pnpm verify
```

Expected: exact runtime and aggregate PASS. Do not exclude the mobile route,
database, integration, secret, or docs gates.

- [ ] **Step 2: Run the gameplay and auth focus**

```powershell
corepack pnpm vitest run apps/mobile/src/learning-demo tests/contracts/ui-final-acceptance.test.ts apps/server/src/auth tests/contracts/mobile-auth-boundary.test.ts tests/integration/local-auth.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 3: Perform a read-only whole-branch review**

Review range: the merge-base with `main` through current HEAD. Required review
areas are route bundling, auth callback/session boundaries, local DB target
pinning, DATA-027 receipt lifecycle, secrets, and generated evidence.

- [ ] **Step 4: Write and commit readiness evidence**

The report contains commit, runtime, exact command/result table, test counts,
and any unresolved external blockers. It must state that provider/device
BLOCKED states do not prevent guest development play or code integration.

```powershell
git add docs/testing/reports/internal-readiness-2026-07-27.md docs/superpowers/plans/2026-07-27-remaining-work-to-merge-and-release-plan.md
git commit -m "docs(release): record internal merge readiness"
```

---

# Track B — Clean Integration Without Dirty-Main Mutation

### Task 5: Refresh Collision Audit and Define the Semantic Union

**Files:**
- Create: `docs/testing/reports/auth-integration-collision-audit-2026-07-27.md`
- Test: `tests/specs/traceability.test.ts`

**Interfaces:**
- Consumes: dirty `main` at `D:\touchcatch`, internally GREEN auth branch.
- Produces: exact intersection and reviewed merge rules.

- [ ] **Step 1: Capture both states read-only**

```powershell
git -C D:\touchcatch status --short
git rev-parse main
git rev-parse codex/supabase-auth-integration
git diff --name-only main...codex/supabase-auth-integration
```

The 2026-07-27 known intersection is exactly:

```text
apps/mobile/package.json
package.json
```

Recompute it; do not assume it remains unchanged.

- [ ] **Step 2: Pin the accepted package union**

Root package union must preserve:

```ts
expect(scripts.check).toContain("node tools/run-pnpm.mjs");
expect(scripts).toHaveProperty("test:auth:local");
expect(scripts).toHaveProperty("content:catalog:check");
expect(scripts["check:db"]).toBe("node tools/run-supabase-gate.mjs");
```

Mobile dependency union must preserve the exact main content/mobile pins,
including `react-native-web: "0.21.2"`, plus Supabase auth, AsyncStorage,
Expo Linking, and Expo WebBrowser dependencies.

- [ ] **Step 3: Record the route union**

The clean integration target takes the Task 1 route contract:
development opens the playable learning demo; production does not import the
fake public-match snapshot and retains the guest boundary.

- [ ] **Step 4: Commit the audit**

```powershell
git add docs/testing/reports/auth-integration-collision-audit-2026-07-27.md tests/specs/traceability.test.ts
git commit -m "docs(auth): refresh integration collision audit"
```

---

### Task 6: Create the Clean Integration Candidate

**Files:**
- Create worktree: `D:\touchcatch\.worktrees\auth-integration`
- Modify only reviewed conflicts in that worktree.

**Interfaces:**
- Consumes: approved collision audit and user-selected integration method.
- Produces: a clean candidate commit or PR branch.

- [ ] **Step 1: Obtain the integration choice**

The choices are:

1. GitHub PR from `codex/supabase-auth-integration` (recommended)
2. clean worktree merge
3. keep branch unintegrated

Do not push or merge before the user selects.

- [ ] **Step 2: Create a clean worktree for merge verification**

```powershell
git worktree add D:\touchcatch\.worktrees\auth-integration -b codex/auth-content-integration main
```

- [ ] **Step 3: Merge without touching dirty main**

```powershell
git -C D:\touchcatch\.worktrees\auth-integration merge --no-ff codex/supabase-auth-integration
```

Resolve only the audited package and route/content conflicts. Preserve both
auth and main content behavior; never use blanket `--ours` or `--theirs`.

- [ ] **Step 4: Run post-union verification**

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm content:catalog:check
corepack pnpm vitest run content/learning/all-content.test.ts apps/mobile/src/learning-demo tests/contracts/ui-final-acceptance.test.ts apps/server/src/auth tests/integration/local-auth.test.ts
```

Expected: all commands PASS in the clean candidate.

- [ ] **Step 5: Verify dirty main preservation**

Compare `git -C D:\touchcatch status --short` before and after. Expected:
byte-for-byte identical status entries.

- [ ] **Step 6: Commit reviewed conflict resolutions**

```powershell
git add package.json apps/mobile/package.json apps/mobile/app/index.tsx tests/specs/traceability.test.ts
git commit -m "merge: integrate auth and playable content"
```

If additional files were resolved, list them explicitly and obtain review
before staging.

---

### Task 7: Reconcile User-Owned Content Evidence

**Files:**
- Modify: `content/learning/all-content.test.ts`
- Move: `research.md` to an approved `docs/research/` path
- Read: `content/learning/catalog.v1.json`
- Read: `content/learning/manifest.v1.json`

**Interfaces:**
- Consumes: the integrated content catalog and manifest.
- Produces: exact catalog↔manifest bijection and current research evidence.

- [ ] **Step 1: Add the exact bijection RED**

```ts
const catalogKeys = catalog.entries.map((entry) => entry.key).sort();
const manifestKeys = manifest.entries.map((entry) => entry.key).sort();
expect(catalogKeys).toEqual(manifestKeys);
```

- [ ] **Step 2: Run the content test**

```powershell
corepack pnpm vitest run content/learning/all-content.test.ts
```

Expected: RED if either generated side is stale.

- [ ] **Step 3: Regenerate using repository commands**

Use the committed content generator/check scripts from the integrated
`package.json`; do not hand-edit catalog or manifest hashes.

- [ ] **Step 4: Update research evidence**

Replace hard-coded stale pack totals with a command-derived count and link the
exact bijection test. Move the document only after the user approves its
destination; do not silently absorb other files under `docs/reviews/`.

- [ ] **Step 5: Review and commit content-only changes**

```powershell
git add content/learning/all-content.test.ts content/learning/catalog.v1.json content/learning/manifest.v1.json docs/research
git commit -m "docs(content): reconcile generated learning evidence"
```

---

### Task 7A: Add a Spot-Difference Perceptual Fairness Contract

**Files:**
- Create: `content/learning/spot-difference-quality.v1.json`
- Create: `content/learning/spot-difference-quality.schema.json`
- Create: `tools/content/check-spot-difference-quality.ts`
- Create: `tests/content/spot-difference-quality.test.ts`
- Modify: `content/learning/all-content.test.ts`
- Modify: `content/learning/manifest.v1.json` only through the existing deterministic generator
- Modify: `content/learning/prompts_100_guide/PROMPTS_100_GUIDE.md`

**Interfaces:**
- Consumes: integrated catalog keys, ten authoritative difference objectives per pack, normalized hitbox centers/radii, generated Image A/B assets.
- Produces: a deterministic design/QA manifest that proves prompt specificity, tier cardinality, spatial distribution, change-type diversity, mobile review status, and A/B image integrity without changing the game ruleset.

- [ ] **Step 1: Write the RED schema and bijection tests**

The quality manifest uses one row per catalog entry:

```ts
type SpotDifferenceQualityPackV1 = Readonly<{
  contentKey: string;
  reviewViewport: Readonly<{ width: 375; height: 667 }>;
  objectives: readonly [
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
    SpotDifferenceQualityObjectiveV1,
  ];
  imagePairReview: Readonly<{
    sameComposition: boolean;
    sameCamera: boolean;
    sameLightingDirection: boolean;
    sameArtStyle: boolean;
    unintendedChangeStatus: "PASS" | "FAIL";
    reviewedBy: string;
    reviewedAt: string;
  }>;
}>;

type SpotDifferenceQualityObjectiveV1 = Readonly<{
  objectiveId: string;
  tier: "NORMAL" | "HARD";
  salience: "CLEAR" | "MODERATE" | "FOCUSED";
  changeType: "COLOR" | "ADD" | "REMOVE" | "SHAPE" | "COUNT" | "DIRECTION";
  zone: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
  target: string;
  location: string;
  before: string;
  after: string;
  mobileReview: Readonly<{
    status: "PASS" | "FAIL";
    reviewer: string;
    reviewedAt: string;
  }>;
}>;
```

Tests must require:

```ts
expect(qualityKeys).toEqual(catalogKeys);
expect(pack.objectives).toHaveLength(10);
expect(pack.objectives.filter((x) => x.tier === "NORMAL")).toHaveLength(7);
expect(pack.objectives.filter((x) => x.tier === "HARD")).toHaveLength(3);
expect(pack.objectives.filter((x) => x.salience === "CLEAR")).toHaveLength(4);
expect(pack.objectives.filter((x) => x.salience === "MODERATE")).toHaveLength(3);
expect(pack.objectives.filter((x) => x.salience === "FOCUSED")).toHaveLength(3);
```

Run:

```powershell
corepack pnpm vitest run tests/content/spot-difference-quality.test.ts
```

Expected: RED because the schema, manifest, and checker do not exist.

- [ ] **Step 2: Implement strict prompt specificity**

Every objective must have non-empty, independently meaningful
`target + location + before + after` fields. The checker rejects generic
tokens after Unicode normalization:

```ts
const forbiddenGeneric = new Set([
  "change color",
  "change shape",
  "remove object",
  "add object",
  "색상 변경",
  "모양 변경",
  "오브젝트 제거",
  "오브젝트 추가",
]);
const unfinishedMarkers = [
  ["T", "B", "D"].join(""),
  ["T", "O", "D", "O"].join(""),
  "placeholder",
];
```

Reject identical normalized `before`/`after`, duplicate `objectiveId`, empty
location, and a prompt record whose concatenated fields contain placeholder
tokens from `unfinishedMarkers` or the duplicated phrase `change color color`.

The guide example becomes:

```text
target: wooden bench
location: near the fountain in the lower-left area
before: dark brown seat
after: bright orange seat
```

Do not rely on one opaque English sentence as the only machine-readable source.

- [ ] **Step 3: Implement spatial and type diversity without a predictable fixed layout**

Map normalized hitbox centers to a 3×3 grid:

```ts
const column = Math.min(2, Math.floor(cx * 3));
const row = Math.min(2, Math.floor(cy * 3));
const zone = "ABCDEFGHI"[row * 3 + column]!;
```

Require:

```ts
expect(new Set(zones).size).toBeGreaterThanOrEqual(7);
expect(Math.max(...zoneCounts.values())).toBeLessThanOrEqual(2);
expect(new Set(changeTypes).size).toBeGreaterThanOrEqual(4);
expect(Math.max(...changeTypeCounts.values())).toBeLessThanOrEqual(4);
```

Do not mandate `E = 2` and `I = 0`; that makes packs predictable and has no
verified repository evidence. Existing private-solution overlap/bounds checks
remain authoritative for hitbox geometry.

- [ ] **Step 4: Implement mobile and image-pair review gates**

`mobileReview.status` must be PASS for every objective at the exact
`375×667` review viewport. Manual reviewers must inspect the real generated
pair, not prompt text. `imagePairReview` must have all four sameness booleans
true and `unintendedChangeStatus: "PASS"`.

The checker rejects:

```ts
if (pack.objectives.some((x) => x.mobileReview.status !== "PASS")) {
  failures.push(`${pack.contentKey}:mobile-review`);
}
if (
  !pack.imagePairReview.sameComposition ||
  !pack.imagePairReview.sameCamera ||
  !pack.imagePairReview.sameLightingDirection ||
  !pack.imagePairReview.sameArtStyle ||
  pack.imagePairReview.unintendedChangeStatus !== "PASS"
) {
  failures.push(`${pack.contentKey}:image-pair-review`);
}
```

Human timing claims such as “EASY in 5 seconds” or “HARD in 20–40 seconds” are
not schema truth. Record timing only in a later playtest dataset with sample
size and distribution; do not self-approve it in this manifest.

- [ ] **Step 5: Bind quality evidence to generated content**

The existing content generator writes the SHA-256 of each pack's quality row
into the generated manifest entry. `content:catalog:check` must fail when the
quality row, catalog prompt, authoritative objectives, or referenced assets
drift.

Mutation tests:

```ts
it.each([
  "wrong-tier-count",
  "generic-prompt",
  "duplicate-objective",
  "six-zones-only",
  "three-in-one-zone",
  "single-change-type",
  "mobile-review-fail",
  "unintended-change-fail",
  "stale-quality-hash",
])("rejects %s", (fixture) => {
  expect(checkFixture(fixture)).not.toEqual([]);
});
```

- [ ] **Step 6: Run focused and aggregate content gates**

```powershell
corepack pnpm vitest run tests/content/spot-difference-quality.test.ts content/learning/all-content.test.ts packages/content-validator/src/validate-content.test.ts
corepack pnpm content:catalog:check
corepack pnpm docs:check
git diff --check
```

Expected: all commands PASS; canonical `7 NORMAL + 3 HARD` remains unchanged.

- [ ] **Step 7: Commit**

```powershell
git add content/learning/spot-difference-quality.v1.json content/learning/spot-difference-quality.schema.json content/learning/prompts_100_guide/PROMPTS_100_GUIDE.md content/learning/all-content.test.ts content/learning/manifest.v1.json tools/content/check-spot-difference-quality.ts tests/content/spot-difference-quality.test.ts
git commit -m "feat(content): enforce spot-difference fairness contract"
```

---

## External Design Review Disposition — 2026-07-27

### Accepted and incorporated

- Differences must remain perceptually fair after discovery; pixel nudges,
  texture/grain drift, minute shadows, and near-imperceptible color changes are
  rejected by prompt review and real image-pair review.
- Image A/B must preserve composition, camera, lighting direction, and art
  style, and must not contain unintended changes.
- Prompts must encode target, location, before, and after as structured fields.
- Objectives must be spatially distributed and use multiple change types.
- Every objective requires review on a 375px-wide mobile viewport.
- Fairness evidence is bound to generated content and fails closed on drift.

### Accepted with modification

- The proposed `4 EASY + 4 NORMAL + 2 HARD` distribution becomes
  `4 CLEAR + 3 MODERATE` within the canonical seven NORMAL objectives plus
  three FOCUSED HARD objectives. Runtime tiers remain `7 NORMAL + 3 HARD`.
- The fixed 9-zone arrangement becomes at least seven occupied zones with no
  zone containing more than two objectives. No zone is permanently reserved
  or empty.
- “No three identical changes in a row” becomes minimum four change types and
  maximum four objectives of any one type because difference objectives have
  no meaningful discovery order.
- Timing targets are treated as future measured playtest metrics, not
  self-attested content-schema facts.

### Not incorporated into the current implementation plan

- The review percentages, star ratings, quotations, fMRI claim, and “best”
  8:2 ratio have no verifiable source URLs, sample sizes, collection method, or
  repository evidence. They cannot justify normative thresholds.
- A new EASY runtime tier conflicts with `RulesetV1`, content schemas, replay
  behavior, and numeric approvals.
- Removing the timer or replacing it with star rewards conflicts with the
  authoritative 75-second match rules and economy contract.
- Three-stage spatial hints conflict with the current earned character-reveal
  hint model. This is a separate gameplay feature requiring its own design,
  replay/event, UI, analytics, and balance plan.
- Player telemetry-driven automatic replacement requires privacy, analytics,
  denominator, retention, and review policy design; it is not added as an
  unscoped content task.

---

# Track C — External Login and Release Evidence

### Task 8: Configure Preview Google/Kakao Providers

**Files:**
- Modify: `docs/operations/supabase-auth-provider-handoff.md`
- Modify after evidence: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`

**Interfaces:**
- Consumes: preview Supabase project, provider consoles, approved secret manager.
- Produces: preview provider callback evidence without exposing secrets.

- [ ] Register only `https://<project-ref>.supabase.co/auth/v1/callback` in Google/Kakao consoles.
- [ ] Register `spotlearn://auth/callback` and `spotlearn://auth/recovery` in the Supabase redirect allow-list.
- [ ] Execute cold-start and live callback smoke tests with redacted evidence.
- [ ] Keep credentials outside Git and run `corepack pnpm secret:scan`.
- [ ] Change preview provider evidence to PASS only after both callback paths succeed.

---

### Task 9: Activate Trusted Device Reviewer Governance

**Files:**
- Modify: `config/auth-device-reviewer-keys.v1.json`
- Modify after signatures: `config/requirement-evidence.v1.json`

**Interfaces:**
- Consumes: distinct Security and Operations approvers and Ed25519 public keys.
- Produces: ACTIVE reviewer registry and two independently signed approvals.

- [ ] Register public keys only; keep private keys outside the repository.
- [ ] Bind both signatures to the canonical registry hash.
- [ ] Verify distinct approver IDs and signature roots.
- [ ] Remove `NO_TRUSTED_REVIEWER_KEYS` only when both signatures validate.

---

### Task 10: Capture Android and iOS Development-Build Goldens

**Files:**
- Create real scenario evidence under the approved external evidence store.
- Modify: `docs/testing/reports/auth-device-goldens.v1.json`

**Interfaces:**
- Consumes: preview provider setup, physical Android/iOS devices, development builds, ACTIVE reviewer registry.
- Produces: signed evidence for email confirmation, configured provider login, cold/live callback, restart/recovery, logout, and account deletion.

- [ ] Execute all seven scenarios independently on Android.
- [ ] Execute all seven scenarios independently on iOS.
- [ ] Record build hash, OS/device, provider, and reviewer without tokens or raw callback URLs.
- [ ] Validate detached reviewer signatures and scenario artifact hashes.
- [ ] Keep a platform BLOCKED if any scenario or signature is missing.
- [ ] Record the iOS Guideline 4.8 product/legal decision separately; it does not block Android or guest development play.

---

### Task 11: Production Provider and Release Approval

**Files:**
- Modify: `docs/operations/supabase-auth-provider-handoff.md`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`
- Generate: `docs/testing/reports/release-blockers.v1.json`

**Interfaces:**
- Consumes: integrated internal PASS, preview goldens, independent production provider configuration, privacy/retention/account-deletion operations approval.
- Produces: production release decision.

- [ ] Verify production callbacks, redirects, secrets, rotation owner, incident owner, and rollback independently from preview.
- [ ] Link real privacy, retention, and account-deletion operational approvals.
- [ ] Run requirement registry, docs, secret, and release-blocker generators.
- [ ] Approve production only when every required blocker is zero.

---

## Execution Order and Stop Conditions

1. Tasks 1 → 4 make the auth branch internally ready.
2. Task 3 stops at Docker absence; no later internal PASS may hide missing DATA-027 evidence.
3. Task 5 refreshes collisions after Track A because dirty main may change.
4. Task 6 requires the user's integration choice before any merge or push.
5. Task 7 runs only in the approved content/integration worktree.
6. Task 7A runs after the catalog/manifest union so it validates the integrated content SSOT rather than the nine-entry branch-only draft.
7. Tasks 8 → 11 require external owners and may proceed independently after Track B, except governance Task 9 precedes signed device PASS.
8. Guest development play and code integration do not wait for provider credentials or device goldens.

## Completion Matrix

| Milestone | Required tasks |
|---|---|
| Locally playable and internally GREEN | Tasks 1–4 |
| Clean merge/PR candidate | Tasks 1–6 |
| Content evidence reconciled and fairness-reviewed | Tasks 7–7A |
| Preview login beta | Tasks 8–10 |
| Production release | Tasks 1–11 and zero required release blockers |
