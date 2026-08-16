# TouchCatch Workflow, Codebase, and Research Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI/workflow, 콘텐츠 파이프라인, 모바일/서버 실행 경계, `research.md` 문서가 동일한 실행 가능한 SSOT와 검증 게이트를 사용하도록 정합화한다.

**Architecture:** 기존 계약과 fail-closed 정책을 유지하면서 검증 경계를 강화한다. pipeline constants를 실제 batch writer의 유일한 알고리즘 입력으로 만들고, CI는 root check 외에 server/mobile/content drift를 명시적으로 검증한다. `research.md`는 비규범 연구 문서로 유지하되 모든 수치와 실행 단계는 코드 SSOT 또는 재현 명령으로 연결한다.

**Tech Stack:** GitHub Actions, Node 24.18.0, pnpm 11.13.0, TypeScript, Vitest, Expo/React Native, Supabase/Postgres, Node content tooling, JSON Schema.

## Global Constraints

- `package.json`의 요구 버전인 Node `24.18.0`, pnpm `11.13.0`을 CI 및 release evidence에서 그대로 사용한다.
- 기존 dirty working tree의 사용자 변경사항과 생성 콘텐츠를 삭제하거나 reset하지 않는다.
- `research.md`는 NON-NORMATIVE이며 ranked eligibility, rights approval, economy, production readiness의 SSOT가 아니다.
- ranked 콘텐츠는 `PUBLISHED` + rights/education approval + admitted five-step ladder를 모두 충족해야 한다.
- local PASS는 production capacity, legal/rights approval, signed device build, provider delivery, DB durability 증거를 대체하지 않는다.
- 생성 파일은 `// GENERATED` 경계를 지키며 수동 편집 대신 generator와 drift check를 수정한다.

---

## Verified findings

| Area | Evidence | Risk |
|---|---|---|
| CI coverage | `.github/workflows/ci.yml` runs root `pnpm check`, but root `tsconfig.json` includes mobile/packages/tests and excludes `apps/server`; no explicit mobile Expo typecheck/build or server test/typecheck job | server/mobile regressions can pass CI |
| Server scaffold | `apps/server/package.json` has only `test`; `apps/server/tsconfig.json` is newly added locally; SQL provider/RPC connection is not wired | local pure adapter tests can be mistaken for DB integration |
| Content SSOT bypass | `tools/content/pipeline-constants.js` says `PIXEL_THRESHOLD=75`, `MIN_CLUSTER_CHANGED_PIXELS=150`, but `batch-build.js` uses hard-coded adaptive `thr=90/100/120/140`, `maxOutside=0.15..0.25`, and forces `BEGINNER` detection | batch output is not reproducible from documented constants and may weaken gates |
| Research drift | `research.md` still says pixel threshold 60, valid cluster 50, outside ratio 0.05/0.08, while code uses 75/150/0.08 | agents can copy stale algorithm values |
| Content inventory | current snapshot is catalog/manifest 91, drafts 95, admitted 3, publishBlocked 91; registry is a frozen 79-entry artifact | generated artifact and working content can silently diverge |
| Mobile workflow | Expo must be started from `apps/mobile`; root start mis-resolves router root; mobile env has empty API origins and DEV-only registry | phone demo can work while authenticated/server path remains untested |
| Release gate | `docs/release-evidence-blockers.md` correctly marks external blockers, but CI does not link local checks to named evidence owners/artifacts | “green CI” can be misread as beta/production readiness |

### Task 1: CI workflow coverage and package-level verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `apps/server/package.json`
- Modify: `apps/mobile/package.json`
- Modify: `apps/admin/package.json`
- Modify: `tsconfig.json`
- Create: `apps/mobile/tsconfig.json` if Expo requires a package-local config
- Test: `.github/workflows/ci.yml` via actionlint or YAML parse, package scripts via direct commands

**Interfaces:** CI publishes separate checks named `check`, `database`, `server`, and `mobile`; each check must fail independently and must not claim production readiness.

- [x] **Step 1: Add failing coverage assertions.** Added `tests/contracts/workflow-coverage.test.ts` to assert server/mobile scripts and independent CI job references.
- [x] **Step 2: Add package scripts.** Use `tsc -p apps/server/tsconfig.json --noEmit` and a server learning test command; for mobile use a contract test and web bundle smoke command from `apps/mobile`.
- [x] **Step 3: Add independent CI jobs.** Keep exact Node/pnpm setup, install with `--frozen-lockfile`, run server tests/typecheck, and run mobile contract/bundle smoke without requiring a physical device. Full mobile typecheck remains blocked by pre-existing repository errors.
- [ ] **Step 4: Prevent false production claims.** Job names and docs must say “local contract/build evidence”; do not mark external release blockers closed.
- [ ] **Step 5: Verify locally where possible.** Run direct binaries when the current shell engine is incompatible; run full package scripts in the required Node 24.18.0/pnpm 11.13.0 environment.

### Task 2: Content pipeline constants as executable SSOT

**Files:**
- Modify: `tools/content/pipeline-constants.js`
- Modify: `tools/content/auto-detect-delta.js`
- Modify: `tools/content/batch-build.js`
- Modify: `tools/content/build-learning-entry.js`
- Create: `tools/content/pipeline-constants.test.ts`
- Test: existing content validator and visual-delta tests

**Interfaces:** `RADIUS_BY_DIFFICULTY`, `PIXEL_THRESHOLD`, `MIN_CLUSTER_CHANGED_PIXELS`, and `MAX_OUTSIDE_CHANGED_RATIO` are imported by every detector/writer; adaptive retry values are named policy inputs and cannot silently override the baseline gate.

- [x] **Step 1: Write RED tests for constant usage.** Assert `ADVANCED` is `0.055`, pixel threshold is `75`, cluster minimum is `150`, and changing the exported constant changes detector defaults.
- [x] **Step 2: Remove forced `BEGINNER` detection.** Derive `detectDifficulty` from the catalog entry and pass the same difficulty to radius selection and visual validation.
- [x] **Step 3: Make adaptive retries explicit.** Store retry thresholds/scales in a named exported `ADAPTIVE_RETRY_POLICY`; record the selected policy in geometry evidence and reject retries that exceed publication bounds without an explicit non-ranked/quarantine status. The policy is now explicit; publication/quarantine enforcement remains.
- [ ] **Step 4: Add idempotence and dry-run behavior.** A completed valid pack is skipped; a partial pack reports the exact files to regenerate; `--dry-run` performs no writes.
- [ ] **Step 5: Run focused tests and a single fixture build.** Verify geometry/evidence/manifest hashes are byte-stable on a second run.

### Task 3: Research document accuracy and reproducibility

**Files:**
- Modify: `research.md`
- Modify: `docs/reviews/2026-08-01-inventory-snapshot.md`
- Create: `docs/testing/content-pipeline-parameters.md`
- Test: `tests/specs/document-inventory-requirement-oracle.test.ts`

**Interfaces:** the research document links every algorithm parameter to `tools/content/pipeline-constants.js` and every inventory claim to a reproducible command; it never presents research prose as normative product policy.

- [x] **Step 1: Replace stale values.** Change pixel threshold 60→75, cluster minimum 50→150, and outside ratio wording to the actual code baseline 0.08; distinguish adaptive retry values from baseline constants.
- [ ] **Step 2: Correct pipeline stage descriptions.** State which writer is active (`write-learning-manifest.js` wrapper vs TS implementation) and identify the actual `batch-build.js` call order.
- [ ] **Step 3: Add a parameter table.** Include source file, exported name, current value, consumer, and whether the value is normative or research-only.
- [ ] **Step 4: Add a generated inventory section.** Record catalog/manifest/draft/registry counts with date and command; list orphan drafts without treating them as publishable packs.
- [ ] **Step 5: Add a stale-document check.** Fail when `research.md` contains a parameter value that differs from the exported constants unless it is explicitly labeled as historical.

### Task 4: Generated content, registry, and manifest drift gate

**Files:**
- Modify: `tools/content/generate-registry.js`
- Modify: `tools/content/write-learning-manifest.js`
- Modify: `package.json`
- Create: `tools/content/check-content-drift.js`
- Create: `tools/content/check-content-drift.test.ts`
- Test: `content/learning/all-content.test.ts`, registry tests

**Interfaces:** `check-content-drift` returns nonzero for manifest↔draft, manifest↔source image, manifest↔geometry/evidence, registry↔manifest, or frozen snapshot mismatches; it reports orphan drafts separately and never deletes them.

- [x] **Step 1: Write RED drift fixtures.** Cover missing draft, orphan draft, missing A/B image, stale registry, and invalid admission. Frozen-registry mismatch remains a separate policy task because the current frozen artifact has a different snapshot identity.
- [x] **Step 2: Implement read-only drift checking.** Report JSON with `errors`, `warnings`, counts, and exact keys; errors block CI, orphan warnings require explicit disposition.
- [x] **Step 3: Add `content:drift:check` to root check before registry-dependent tests.** Keep generation as an explicit command, never an implicit CI mutation.
- [x] **Step 4: Define frozen registry policy.** Documented historical 79-entry artifacts as snapshot evidence and limited CI drift comparison to the current manifest/working registry.

### Task 5: Mobile phone test workflow and environment boundary

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/.env.example`
- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/README.md`
- Create: `docs/runbooks/mobile-lan-test.md`
- Test: `apps/mobile/src/learning-demo/production-boundary.test.ts`

**Interfaces:** `mobile:lan` starts Expo from `apps/mobile`, uses an explicit LAN host/port, and documents that DEV registry content is local-only; authenticated API testing requires a non-empty `EXPO_PUBLIC_API_ORIGIN` and a running server.

- [ ] **Step 1: Add a failing script/config test.** Assert the documented command runs from `apps/mobile`, production does not import the private registry, and empty API origin cannot be mistaken for authenticated mode.
- [ ] **Step 2: Add scripts.** Provide `start`, `start:lan`, `web`, and `web:lan` with explicit working-directory assumptions and port override support.
- [ ] **Step 3: Document the phone flow.** Include same-Wi-Fi requirement, Expo Go `exp://<LAN_IP>:<PORT>` format, firewall check, QR fallback, and how to stop the process.
- [ ] **Step 4: Add an explicit demo banner/state.** Keep casual DEV-only demo distinct from ranked/server mode; do not show fake leaderboard or production claims when API origin is empty.
- [ ] **Step 5: Verify with LAN HTTP smoke and mobile tests.** A local HTTP 200 proves reachability only, not device acceptance or production readiness.

### Task 6: Server RPC boundary and integration evidence

**Files:**
- Modify: `apps/server/src/learning/attempt-repository.ts`
- Modify: `apps/server/src/learning/leaderboard.ts`
- Create: `apps/server/src/learning/sql-rpc-client.ts`
- Create: `apps/server/src/learning/sql-rpc-client.test.ts`
- Modify: `apps/server/package.json`
- Test: `supabase/tests/database/learning-competition.test.sql`, server adapter tests

**Interfaces:** `SqlRpcClient.call<T>(functionName: string, args: Record<string, unknown>): Promise<T>` is the only DB dependency consumed by repository/leaderboard adapters; all RPC errors preserve stable codes such as `POLICY_MISMATCH`, `ATTEMPT_TERMINAL`, and `IDEMPOTENCY_CONFLICT`.

- [x] **Step 1: Write RED client tests.** Verified function name, argument mapping, stable error code preservation, and retained public-only leaderboard output tests.
- [x] **Step 2: Implement the injected SQL RPC client.** Added server-only `SqlRpcClient` transport boundary; credentials remain outside mobile/shared contracts.
- [x] **Step 3: Replace pure/mock repository paths.** Commit now supports injected SQL RPC mapping while preserving the in-memory adapter fallback and quarantined/BEST tuple semantics.
- [x] **Step 4: Replace leaderboard provider with the SQL view provider.** Added SQL RPC provider with top-10 limit, optional subject rank, and public-field allowlisting.
- [ ] **Step 5: Run local Supabase reset/lint/pgTAP and server integration tests.** Record DB evidence separately from pure unit evidence.

### Task 7: Release evidence and workflow ownership

**Files:**
- Modify: `docs/release-evidence-blockers.md`
- Modify: `docs/testing/test-matrix.md`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/operations/release-evidence-owners.md`
- Create: `docs/operations/mobile-lan-test.md`

- [ ] **Step 1: Map every blocker to owner, artifact path, environment, and expiry.** Include exact runtime, signed builds, DB restore/PITR, rights/education, provider delivery, physical goldens, and regional soak.
- [ ] **Step 2: Split CI-local evidence from external evidence.** CI may attach deterministic reports but must not change `BLOCKED_EXTERNAL` to approved automatically.
- [ ] **Step 3: Add nightly load/fault jobs separately from PR checks.** Keep 10k synthetic load out of fast PR gates and require release artifacts for soak claims.
- [ ] **Step 4: Verify release documentation against roadmap G3A→G6.** A gate is complete only when its predecessor evidence and external approvals are linked.

## Verification and handoff

- Run a repository-wide stale-marker scan after each task; do not treat comments or research prose as implementation evidence.
- Required full verification environment is Node `24.18.0` and pnpm `11.13.0`. The current local shell previously reported incompatible versions, so local direct-binary results must be labeled accordingly.
- Do not commit or reset the current dirty working tree as part of this plan.
- The plan deliberately separates four deliverables: CI reliability, content pipeline reproducibility, mobile/server integration, and external release evidence. They can be implemented independently but production enablement requires all predecessor gates.
