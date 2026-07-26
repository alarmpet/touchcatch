# Authentication Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완료된 Supabase Auth Task 1–7을 보존하면서 저장소 내부 gate를 모두 GREEN으로 복구하고, dirty `main`을 안전하게 통합한 뒤 외부 provider·실기기·출시 증거를 실제 제출물로 닫는다.

**Architecture:** 남은 작업을 `A. 내부 코드 readiness`, `B. clean integration`, `C. 외부 release evidence`의 세 트랙으로 분리한다. A는 외부 자격증명 없이 완료되어야 하며 `verify` PASS가 B의 선행 조건이다. C는 코드 merge와 게스트 게임 플레이를 막지 않지만 로그인 beta와 production release를 계속 차단한다.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.0, TypeScript 5.9, Vitest 4, Next.js 16.1.6, Expo 57, Supabase CLI/Auth/PostgreSQL 17, pgTAP, Docker Desktop, Git/GitHub.

## Global Constraints

- 구현 worktree는 `D:\touchcatch\.worktrees\supabase-auth`, 브랜치는 `codex/supabase-auth-integration`이다.
- `D:\touchcatch`의 dirty `main`에 있는 사용자 학습 콘텐츠는 stash, reset, checkout, 삭제, 자동 병합하지 않는다.
- exact runtime은 Node `24.18.0`, pnpm `11.13.0`이다. 개인 절대 runtime 경로는 저장소에 커밋하지 않는다.
- 변경 작업은 RED → 원인 확인 → 최소 GREEN → focused 회귀 → 전체 gate → 별도 읽기 전용 리뷰 순서로 진행한다.
- 실제 token, callback query/fragment, service/secret key, auth UUID, provider credential은 코드·로그·문서·테스트 artifact에 넣지 않는다.
- 외부 provider/실기기/governance 증거는 실제 제출 전까지 `BLOCKED`다. local test나 문서 검토로 PASS를 만들지 않는다.
- 게스트 게임 플레이는 Google/Kakao credential, iOS Guideline 4.8, native login golden과 독립적으로 유지한다.
- 현재 untracked `.pnpm-install*.log`, `.stale-node-modules*`, `apps/admin/.next`, `apps/admin/tsconfig.tsbuildinfo`, review 문서는 사용자/환경 부산물로 취급하고 어떤 Task에서도 자동 스테이징하지 않는다.

---

## Current Baseline

### 완료된 인증 작업

- 이 계획의 고정 기준점은 `codex/supabase-auth-integration`의 `f6a9d5e` (`docs(auth): record final review`)다.
- Task 1–7은 커밋 `9a1d4e8`부터 `f6a9d5e`까지 구현·문서화됐고 Task별 읽기 전용 리뷰에서 최종 Critical/Important 0건이다.
- local Auth/DB: 10 files / 47 tests PASS.
- account deletion: pgTAP 32/32, cascade/concurrency 4/4 PASS.
- focused auth/security/provider/device: 15 files / 89 tests PASS.
- provider handoff와 native evidence contract는 완료됐지만 실제 credential/device/governance evidence는 BLOCKED다.

### 현재 내부 실패

| Gate | 현재 결과 | 정확한 실패 |
|---|---:|---|
| default-shell `pnpm verify` | FAIL | 기본 Node `v22.16.0`이 첫 `check:runtime`에서 요구값 `24.18.0`과 불일치 |
| exact-runtime `pnpm verify` | FAIL | runtime/admin typecheck 통과 후 Windows worktree에서 Next 16 Turbopack가 `node_modules/pg` junction 생성 실패 (`os error 1`) |
| `pnpm typecheck` | FAIL | 66 errors / 18 files. mobile import-resolution 14건, device evidence 28건, requirement oracle 16건, DB/traceability/validator 잔여 |
| generated coverage | 221/226 | `OBS-002`, `DATA-012`, `DATA-027`, `API-005`, `API-001` |
| `docs:check` | FAIL | numeric approval drift `DATA-004`, `DATA-017`, `DATA-027` |
| Task 8 integration | PENDING | dirty main 보호 및 사용자 통합 방식 선택 필요 |

### 현재 외부 blocker

- preview/production Google·Kakao credential 및 console 등록 screenshot.
- Android/iOS physical development-build authentication golden.
- iOS Guideline 4.8 판단과 equivalent-login 증거.
- trusted device reviewer governance key와 Security/Operations receipt.
- production release 승인.

---

# Preflight — Runtime and Collision Baseline

### Task 0: Exact Runtime Activation

**Files:**
- Read: `.node-version`
- Read: `package.json`
- Read: `tools/check-runtime.mjs`
- Create: `docs/testing/reports/auth-runtime-preflight-2026-07-26.md`
- No source changes.

**Interfaces:**
- Consumes: repository runtime contract Node `24.18.0`, pnpm `11.13.0`.
- Produces: 이후 모든 RED/GREEN 명령이 같은 exact runtime에서 실행됐다는 preflight evidence.

- [ ] **Step 1: 기본 셸 drift를 기록한다**

Run:

```powershell
node --version
corepack pnpm --version
```

Expected on the currently observed shell: Node `v22.16.0`, pnpm `11.13.0`; 아직 구현 Task를 시작하지 않는다.

- [ ] **Step 2: 저장소 밖의 approved runtime을 활성화한다**

설치된 runtime manager 또는 portable runtime 중 하나로 Node `24.18.0`을 활성화한다. 개인 설치 경로는 report의 로컬 실행 정보로만 남기고 repository file에는 기록하지 않는다.

- [ ] **Step 3: runtime gate를 실행한다**

Run:

```powershell
node --version
corepack pnpm --version
node tools/check-runtime.mjs
```

Expected: `v24.18.0`, `11.13.0`, exit 0.

- [ ] **Step 4: preflight report를 커밋한다**

보고서에는 version과 gate result만 기록하고 개인 절대 경로와 environment secret은 기록하지 않는다.

```powershell
git add docs/testing/reports/auth-runtime-preflight-2026-07-26.md
git commit -m "docs(tooling): record exact runtime preflight"
```

---

### Task 0A: Early Dirty-Main Collision Audit

**Files:**
- Create: `docs/testing/reports/auth-integration-collision-audit-2026-07-26.md`
- No merge, stash, reset, or dirty-main writes.

**Interfaces:**
- Consumes: dirty `main` at the time of execution and `codex/supabase-auth-integration`.
- Produces: Track A가 건드릴 충돌 파일의 exact ownership/resolution contract.

- [ ] **Step 1: current intersection을 다시 계산한다**

Run in `D:\touchcatch`:

```powershell
git status --short
git diff --name-only main...codex/supabase-auth-integration
```

2026-07-26 observed baseline:

```text
apps/mobile/package.json
package.json
```

학습 콘텐츠 파일은 현재 intersection 0이지만 실행 시점에 다시 계산한다.

- [ ] **Step 2: semantic union acceptance rule을 report에 고정한다**

통합 target에서 추가할 acceptance test를 report에 기록한다.

```ts
it("keeps both the portable runner and the content catalog gate in check", () => {
  const check = readJson("package.json").scripts.check;
  expect(check).toContain("node tools/run-pnpm.mjs");
  expect(check).not.toContain("corepack pnpm");
  expect(check).toContain("content:catalog:check");
});
```

auth branch에는 main의 content pipeline을 임의 복사하거나 의도적으로 RED인 test를 커밋하지 않는다. 이 test는 Task 7 clean integration target에서 union과 함께 추가한다.

- [ ] **Step 3: 두 dirty package 파일의 처리 방식을 사용자에게 확인한다**

선택지는 다음으로 제한한다.

1. 사용자가 두 파일을 main에 먼저 커밋한다.
2. dirty 상태를 유지하고 exact patch/hash를 collision report에 고정한 뒤 clean integration에서 수동 union한다.
3. branch를 유지하고 통합을 연기한다.

사용자 선택 없이 main에 commit/format/write하지 않는다.

- [ ] **Step 4: optional formatting을 별도 판정한다**

`apps/mobile/package.json` 표준 formatting은 논리 변경과 분리된 단독 커밋일 때만 수행한다. dirty main에도 동일 formatting을 적용할 권한이 확인되지 않으면 이번 auth branch에서 실행하지 않는다.

---

# Track A — Internal Code Readiness

### Task 1A: Mobile TypeScript Project Boundary Split

**Files:**
- Modify: `tsconfig.json`
- Create: `tsconfig.node.json`
- Modify: `apps/mobile/tsconfig.json`
- Modify: `package.json`
- Modify: `tests/specs/traceability.test.ts`
- Test: `apps/mobile/src/learning-demo/production-boundary.test.ts`

**Interfaces:**
- Consumes: Expo/Metro extensionless import contract and root Node-executed server/tool/test sources.
- Produces: `typecheck:node`과 `typecheck:mobile`이 mobile import graph를 누락·중복 은폐하지 않고 각자의 module resolution으로 검사하는 aggregate `typecheck`.
- Preserves: runtime module의 relative `.js` specifier는 `production-boundary.test.ts`가 금지한다. `.js` 추가는 해결 선택지가 아니다.

- [ ] **Step 1: 현재 project-boundary RED를 두 config에서 측정한다**

Run with Task 0 runtime:

```powershell
corepack pnpm exec tsc -p tsconfig.json --noEmit
corepack pnpm exec tsc -p apps/mobile/tsconfig.json --noEmit
```

Expected: root NodeNext는 import graph를 따라 `apps/mobile/app/index.tsx`까지 유입해 TS2835/TS1543을 보고하고, Expo config는 아직 strictness를 추가하지 않은 현재 기준 결과를 기록한다.

- [ ] **Step 2: mobile import entrypoint inventory를 고정한다**

다음 entrypoint는 mobile project가 담당한다.

```text
apps/mobile/app/**/*.ts(x)
apps/mobile/src/**/*.ts(x)
tests/contracts/mobile-*.test.ts
tests/integration/local-auth.test.ts
tests/contracts/ui-acceptance-regressions.test.ts
tests/contracts/ui-final-acceptance.test.ts
```

`tools/requirement-oracle.ts`처럼 Node tool이 mobile UI 모듈을 import하는 경로는 단순 exclude로 숨기지 않는다. Task 2에서 production type을 직접 쓰는 adapter/fixture module로 의존 방향을 분리하기 전까지 `typecheck:node`의 명시 entrypoint로 남긴다.

- [ ] **Step 3: Node와 mobile config를 분리한다**

root `tsconfig.json`은 공통 `compilerOptions`만 가진 base로 바꾸고 기존 `include`를 제거한다. `tsconfig.node.json`은 이를 상속해 Node-executed sources를 포함하되 mobile entrypoint 목록은 제외한다.

```json
{
  "extends": "./tsconfig.json",
  "include": [
    "apps/server/src/**/*.ts",
    "packages/**/*.ts",
    "tests/**/*.ts",
    "tools/**/*.ts",
    "vitest*.ts"
  ],
  "exclude": [
    "apps/mobile/**",
    "tests/contracts/mobile-*.test.ts",
    "tests/integration/local-auth.test.ts",
    "tests/contracts/ui-acceptance-regressions.test.ts",
    "tests/contracts/ui-final-acceptance.test.ts"
  ]
}
```

`apps/mobile/tsconfig.json`은 Expo base의 `moduleResolution: "bundler"`를 유지하고 위 mobile entrypoint를 include한다. 이 Task에서는 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 새로 켜지 않는다.

```json
{
  "extends": "expo/tsconfig.base",
  "include": [
    "app/**/*.ts",
    "app/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "../../tests/contracts/mobile-*.test.ts",
    "../../tests/integration/local-auth.test.ts",
    "../../tests/contracts/ui-acceptance-regressions.test.ts",
    "../../tests/contracts/ui-final-acceptance.test.ts"
  ]
}
```

- [ ] **Step 4: aggregate script가 두 프로젝트를 모두 실행하게 한다**

`package.json`:

```json
{
  "scripts": {
    "typecheck:node": "tsc -p tsconfig.node.json --noEmit",
    "typecheck:mobile": "tsc -p apps/mobile/tsconfig.json --noEmit",
    "typecheck": "node tools/run-pnpm.mjs typecheck:node && node tools/run-pnpm.mjs typecheck:mobile"
  }
}
```

`traceability.test.ts`는 두 script 중 하나를 제거하거나 mobile test entrypoint를 누락하는 mutation을 거부한다.

- [ ] **Step 5: extensionless runtime boundary와 두 typecheck를 검증한다**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/learning-demo/production-boundary.test.ts tests/specs/traceability.test.ts
corepack pnpm typecheck:node
corepack pnpm typecheck:mobile
```

Expected: extensionless import test PASS. 두 typecheck의 남은 오류는 module-resolution 충돌이 아니라 실제 source type 오류로만 구성된다.

- [ ] **Step 6: boundary-only 커밋을 만든다**

```powershell
git add tsconfig.json tsconfig.node.json apps/mobile/tsconfig.json package.json tests/specs/traceability.test.ts
git commit -m "fix(tooling): split Node and Expo typecheck boundaries"
```

---

### Task 1B: Mobile Strictness and SDK Type Repair

**Files:**
- Modify: `apps/mobile/tsconfig.json`
- Modify: `apps/mobile/src/native-modules.d.ts`
- Modify: `apps/mobile/src/auth/AuthRuntime.tsx`
- Modify: `apps/mobile/src/auth/native-auth.ts`
- Modify: `apps/mobile/src/guest-content/progress.ts`
- Modify: `apps/mobile/src/ui/BattleScreen.tsx`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx`
- Modify additional mobile files only when the newly enabled option reports them.

**Interfaces:**
- Consumes: Task 1A bundler-owned mobile project.
- Produces: 실제 React Native/Supabase types와 strict options를 통과하는 mobile source.

- [ ] **Step 1: strict options를 한 번에 하나씩 RED로 켠다**

순서:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

각 옵션 추가 후 `corepack pnpm typecheck:mobile`의 새 error list를 report에 기록하고 이전 옵션이 GREEN이 되기 전 다음 옵션을 켜지 않는다.

- [ ] **Step 2: 임시 AppState 표면만 먼저 정확히 추가한다**

현재 local `declare module "react-native"`가 SDK를 가리는 사실을 문서화하고, 이 Task의 첫 커밋에서는 실제 사용하는 `AppState`/`AppStateStatus`만 정확히 선언한다.

```ts
export type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";
export const AppState: {
  readonly currentState: AppStateStatus;
  addEventListener(
    event: "change",
    listener: (state: AppStateStatus) => void,
  ): Readonly<{ remove(): void }>;
};
```

- [ ] **Step 3: Supabase result와 exact optional property를 수정한다**

```ts
type AuthResult<T> = Promise<
  | Readonly<{ data: T; error: null }>
  | Readonly<{ data: null; error: unknown }>
>;

return rejectionCode === undefined
  ? event
  : { ...event, rejectionCode };
```

- [ ] **Step 4: React Native shadow declaration 제거를 별도 RED/GREEN으로 수행한다**

`declare module "react-native"` 블록을 제거한 RED에서 현재 숨겨진 `RefObject<unknown>`, `View`, style/prop overload 오류를 `BattleScreen.tsx`와 `LearningDemoScreen.tsx`에서 확인한다. 실제 RN 0.86 types로 수정한 뒤 local shadow block을 삭제한다. `[key:string]: any`를 다시 추가하지 않는다.

- [ ] **Step 5: mobile strict GREEN을 검증한다**

Run:

```powershell
corepack pnpm typecheck:mobile
corepack pnpm vitest run apps/mobile tests/contracts/mobile-auth-boundary.test.ts tests/contracts/mobile-guest-sync.test.ts tests/contracts/mobile-guest-progress.test.ts
```

Expected: mobile typecheck와 관련 회귀 PASS.

- [ ] **Step 6: strictness 커밋을 분리한다**

```powershell
git add apps/mobile
git commit -m "fix(mobile): enforce strict Expo runtime types"
```

---

### Task 2: Strict Type Repair for Tooling and Test Harnesses

**Files:**
- Modify: `packages/content-validator/src/validate-content.ts`
- Modify: `tests/contracts/auth-device-goldens.test.ts`
- Modify: `tests/database/account-lifecycle-concurrency.test.ts`
- Modify: `tests/database/learning-progress-concurrency.test.ts`
- Modify: `tests/specs/traceability.test.ts`
- Modify: `tests/specs/ui-requirement-oracle.test.ts`
- Modify: `tools/requirement-oracle.ts`

**Interfaces:**
- Consumes: strict root `tsconfig.json`, `pg` query overloads, match-state discriminated unions, evidence JSON validators.
- Produces: root `pnpm typecheck`에서 `any`, unchecked index, optional-property, tuple/state widening 없이 통과하는 executable test/oracle code.

**Observed workload:** 기준선 66 errors 중 `tests/contracts/auth-device-goldens.test.ts` 28건, `tools/requirement-oracle.ts` 16건이 집중되어 있다. 이 두 파일을 먼저 닫은 뒤 나머지 파일로 이동한다.

- [ ] **Step 1: Task 1B 이후 aggregate RED 목록을 저장한다**

Run:

```powershell
corepack pnpm typecheck
```

Expected: 이 Task의 대상 파일만 남아 FAIL한다. mobile source 오류가 다시 나오면 Task 1B로, project-boundary 오류가 다시 나오면 Task 1A로 되돌린다.

- [ ] **Step 2: auth-device evidence test 28건을 먼저 좁힌다**

`auth-device-goldens.test.ts`에 undefined를 숨기는 `!` 연쇄 대신 실패 메시지가 있는 helper를 둔다.

```ts
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`MISSING_${label}`);
  return value;
}
```

모든 platform/scenario/key lookup은 `required(...)`를 거쳐 mutation test의 의도를 유지한다.

- [ ] **Step 3: requirement oracle 16건을 production discriminated union으로 수정한다**

초기 상태와 player command fixture는 넓은 `object` cast 대신 production type을 만족시킨다.

```ts
const initialState = structuredClone(
  createTestingReplayBundle().initialState,
) satisfies MatchInitialStateV1;
const requestId = "00000000-0000-4000-8000-000000000780";
const command = {
  source: "PLAYER",
  commandId: `${initialState.matchId}:player:p1:${requestId}`,
  matchId: initialState.matchId,
  commandSeq: 1,
  receivedAtMs: 1_000,
  requestId,
  playerId: "p1",
  expectedRevision: initialState.stateRevision,
  payload: { type: "TAP_IMAGE", imageSide: "A", x: 0.2, y: 0.8 },
} satisfies MatchCommand;
```

tuple 변환은 길이를 먼저 검증한 뒤 반환한다.

```ts
if (assets.length !== 2) throw new Error("MATCH_ASSET_PAIR_REQUIRED");
return [assets[0]!, assets[1]!] as const;
```

- [ ] **Step 4: DB query input과 result를 명시한다**

```ts
type ClaimedJob = Readonly<{
  jobId: string;
  leaseToken: string;
  leaseGeneration: number;
}>;

const result = await client.query<{ value: ClaimedJob }>(
  "select private.claim_account_deletion_job_v1($1,$2) as value",
  [workerId, 30_000],
);
const claim = required(result.rows[0]?.value, "CLAIM");
```

`array.map(JSON.stringify)`는 overload가 맞도록 `array.map(value => JSON.stringify(value))`로 바꾼다.

- [ ] **Step 5: lifecycle/assertion literal을 좁힌다**

`traceability.test.ts`와 `ui-requirement-oracle.test.ts`의 mutation fixture는 `satisfies LifecycleRow` / `satisfies Assertion`을 사용하고 required pointer를 생략하지 않는다.

- [ ] **Step 6: root typecheck와 focused 회귀를 GREEN으로 만든다**

Run:

```powershell
corepack pnpm typecheck
corepack pnpm vitest run tests/contracts/auth-device-goldens.test.ts tests/specs/traceability.test.ts tests/specs/ui-requirement-oracle.test.ts tests/database/account-lifecycle-concurrency.test.ts tests/database/learning-progress-concurrency.test.ts
```

Expected: typecheck PASS, focused tests PASS.

- [ ] **Step 7: 커밋한다**

```powershell
git add packages/content-validator/src/validate-content.ts tests tools/requirement-oracle.ts
git commit -m "fix(tooling): satisfy strict verification types"
```

---

### Task 3: Requirement Oracle and Numeric Approval Drift Closure

**Files:**
- Modify: `tools/requirement-oracle.ts`
- Modify: `tests/specs/database-security-requirement-oracle.test.ts`
- Modify: `tests/specs/api-rest-requirement-oracle.test.ts`
- Modify: `tests/specs/api-wire-composite-requirement-oracle.test.ts`
- Modify: `tests/specs/generated-requirement-coverage.test.ts` only if diagnostics need strengthening
- Modify: `config/requirement-evidence.v1.json`
- Modify: `config/normative-numeric-approvals.v1.json`
- Create: `tools/write-normative-approvals.mjs`
- Create: `tests/specs/normative-approval-generator.test.ts`
- Generate: `docs/requirements-registry.v1.json`

**Interfaces:**
- Consumes: migration/roles/test source, OpenAPI schemas, planned realtime status, numeric SSOT files.
- Produces: 226/226 executable requirement results and zero numeric approval drift without weakening an oracle or falsely promoting external work.

- [ ] **Step 1: 각 실패의 정확한 diagnostic을 RED test로 노출한다**

Add assertions equivalent to:

```ts
expect(execute("OBS-002")).toMatchObject({
  status: "BLOCKED",
  reason: "PLANNED_NOT_IMPLEMENTED:REALTIME_SERVICE_SURFACE",
});
expect(() => evaluateDatabaseRequirement("DATA-012")).not.toThrow();
expect(() => evaluateDatabaseRequirement("DATA-027")).not.toThrow();
expect(() => evaluateOpenApiRequirement("API-001")).not.toThrow();
expect(() => evaluateApiWireComposite("API-005")).not.toThrow();
```

Run:

```powershell
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts tests/specs/database-security-requirement-oracle.test.ts tests/specs/api-rest-requirement-oracle.test.ts tests/specs/api-wire-composite-requirement-oracle.test.ts
```

Expected: 현재 5개 ID가 FAIL하고 구체 reason이 보인다.

- [ ] **Step 2: OBS-002용 BLOCKED 산출 경로를 신설한다**

`OBS-002`는 실행 가능한 NestJS/Socket.IO + Redis/BullMQ service가 없다는 현재 규범 문장과 동일하게 `BLOCKED`를 반환해야 한다. 현재 `ANALYTICS_CONTRACT` dispatcher에는 실질적인 BLOCKED 반환 경로가 없으므로 `lifecycle === "PLANNED"`, closure artifact absence, exact `blockerReason`을 검증한 뒤 `BLOCKED`를 반환하는 상태 경로를 추가한다. evidence expected를 PASS로 바꾸지 않는다.

기존 PLANNED/EXTERNAL 요구사항의 상태를 전부 다시 실행해 새 분기가 `RULE-013` 등 다른 lifecycle을 오분류하지 않는지 확인한다.

- [ ] **Step 3: DATA-012/027 source projection을 현재 코드와 맞춘다**

문자열 전체 일치 대신 의미를 정확히 검증하되 느슨한 substring 통과는 금지한다.

```ts
expectRoleMembershipLifecycle(migration, {
  role: "game_security_owner",
  member: "postgres",
  grantCount: 1,
  revokeCount: 1,
});
expectConcurrencyEvidence(testSource, {
  sessions: 20,
  expectedSeats: 2,
  requiredRole: "app_server",
  loopbackOnly: true,
});
```

- [ ] **Step 4: API-001/005의 error projection을 OpenAPI 실제 계약과 일치시킨다**

먼저 `/v1/me` operation의 status별 error enum을 추출해 runtime mapping과 비교한다. 불필요한 code가 OpenAPI에 있으면 제거하고, runtime에 실제 반환되는 code가 누락됐으면 OpenAPI와 focused contract를 함께 갱신한다. oracle expected set만 임의 변경하지 않는다.

- [ ] **Step 5: numeric approval 3건의 drift 원인을 분리한다**

`DATA-004`, `DATA-017`, `DATA-027` 각각에 대해 다음 세 값을 비교한다.

```ts
{
  sourceTokens: extractNormativeNumbers(requirement.text),
  approvedTokens: approval.approvedTokens,
  ssotAssertions: approval.ssotAssertions,
}
```

문장이 바뀐 경우 `approvedTokens`를 현재 규범 숫자와 맞춘다. `VERIFIED_LOCAL_SSOT`는 `ssotHash`와 assertions를, `UNAPPROVED_BASELINE`은 `sourcePath`/`sourceHash`를 갱신한다. status/lifecycle 개수가 바뀌면 manifest `summary.verifiedLocalSsot`와 `summary.unapproved`도 함께 갱신한다. 근거 없이 숫자나 status를 승인하지 않는다.

- [ ] **Step 6: numeric manifest 생성기를 RED/GREEN으로 추가한다**

`tools/write-normative-approvals.mjs`는 승인 판단을 만들지 않고 이미 선택된 entry의 token/hash/summary projection만 결정적으로 생성한다.

```js
// --check: generated projection과 working tree가 다르면 nonzero
// --write: reviewed entry의 approvedTokens, sourceHash/ssotHash, summary를 갱신
```

Mutation tests:

```ts
expect(runCheck(withStaleSourceHash)).toMatchObject({ status: 1 });
expect(runCheck(withStaleSsotHash)).toMatchObject({ status: 1 });
expect(runCheck(withStaleSummary)).toMatchObject({ status: 1 });
```

- [ ] **Step 7: 생성물과 전체 문서 gate를 확인한다**

Run:

```powershell
node tools/write-requirement-registry.mjs
node tools/write-normative-approvals.mjs --check
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts
node tools/check-docs.mjs
git diff --check
```

Expected: 226/226 PASS, `numericApprovalDrift: 0`, registry freshness PASS.

- [ ] **Step 8: 커밋한다**

```powershell
git add tools/requirement-oracle.ts tools/write-normative-approvals.mjs tests/specs config/requirement-evidence.v1.json config/normative-numeric-approvals.v1.json docs/requirements-registry.v1.json
git commit -m "fix(requirements): close executable evidence drift"
```

---

### Task 4: Portable Admin Production Build with Documented Turbopack Workaround

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `tests/specs/traceability.test.ts`
- Create: `docs/operations/admin-build.md`

**Interfaces:**
- Consumes: Next.js 16.1.6 admin application with `output: "standalone"`.
- Produces: Windows worktree에서도 junction creation에 의존하지 않고 재현되는 production build command.

- [ ] **Step 1: 현재 Turbopack RED를 재현한다**

Run:

```powershell
corepack pnpm admin:build
```

Expected: `node_modules/pg` junction, `os error 1`로 FAIL.

같은 report에 Windows Developer Mode, shell privilege, pnpm symlink/junction capability를 read-only로 기록한다. `node-linker=hoisted`는 전체 workspace dependency layout을 바꾸므로 별도 install/regression audit 없이 적용하지 않는다.

- [ ] **Step 2: build engine을 명시적으로 고정하는 계약 테스트를 쓴다**

```ts
it("uses the portable webpack production build", () => {
  const pkg = readJson("apps/admin/package.json");
  expect(pkg.scripts.build).toBe("next build --webpack");
});
```

Expected: 현재 `"next build"` 때문에 FAIL.

- [ ] **Step 3: admin build를 Webpack으로 고정한다**

`apps/admin/package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "lint": "eslint src app next.config.ts"
  }
}
```

이 변경은 Next 버전을 내리거나 standalone output을 제거하지 않고, Windows worktree에서 실패하는 기본 Turbopack build engine만 대체한다.

- [ ] **Step 4: production build와 client secret boundary를 확인한다**

Run:

```powershell
corepack pnpm admin:typecheck
corepack pnpm admin:build
corepack pnpm admin:client-secret-check
```

Expected: 세 명령 모두 PASS, `.next/standalone` 생성.

- [ ] **Step 5: 운영 문서와 커밋을 남긴다**

`docs/operations/admin-build.md`에 다음을 기록한다.

- 근본 환경 요인: Windows junction/symlink capability와 pnpm-linked dependency layout.
- 현재 repository workaround: Next 16 production gate에서 `--webpack`.
- 운영자 대안: Developer Mode/권한 정책을 승인된 방식으로 활성화한 clean host에서 Turbopack 재검증.
- 되돌림 조건: Next 16.x/후속 버전에서 worktree junction issue가 해소되고 Turbopack build가 같은 clean gate를 통과할 때.

```powershell
git add apps/admin/package.json tests/specs/traceability.test.ts docs/operations/admin-build.md
git commit -m "fix(admin): make production build portable"
```

---

### Task 5: Bounded Supabase Verification Chain

**Files:**
- Create: `tools/run-supabase-gate.mjs`
- Modify: `package.json`
- Modify: `tests/specs/traceability.test.ts`
- Modify: `docs/operations/local-runtime.md`

**Interfaces:**
- Consumes: installed repository Supabase CLI, local Docker stack.
- Produces: reset/lint/pgTAP 각 단계가 명시 timeout과 sanitized failure를 갖는 `check:db`.

- [ ] **Step 1: 무제한 CLI 호출을 거부하는 RED test를 쓴다**

```ts
expect(pkg.scripts["check:db"]).not.toContain("supabase db reset");
expect(pkg.scripts["check:db"]).toContain("node tools/run-supabase-gate.mjs");
```

Expected: 현재 raw CLI chain 때문에 FAIL.

- [ ] **Step 2: bounded runner를 구현한다**

`tools/run-supabase-gate.mjs`는 allow-list된 명령만 실행한다.

```js
const steps = [
  { args: ["db", "reset", "--local"], timeoutMs: 600_000 },
  { args: ["db", "lint", "--local", "--fail-on", "error"], timeoutMs: 120_000 },
  { args: ["test", "db", "--local"], timeoutMs: 300_000 },
];

for (const step of steps) {
  const child = spawn(cli, step.args, {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
  });
  const result = await waitWithTimeout(child, step.timeoutMs);
  if (result.kind === "timeout") {
    throw new Error(`SUPABASE_GATE_TIMEOUT:${step.args.slice(0, 2).join("_")}`);
  }
  if (result.exitCode !== 0) {
    throw new Error(`SUPABASE_GATE_FAILED:${step.args.slice(0, 2).join("_")}`);
  }
}
```

timeout 시 자식 process tree를 종료하고 credential/status output을 error message에 복제하지 않는다.

- [ ] **Step 3: Docker preflight를 fail-fast로 추가한다**

`docker info`를 10초 이내 read-only로 실행한다. Docker daemon에 연결할 수 없으면 Supabase CLI를 시작하지 않고 sanitized `SUPABASE_GATE_DOCKER_UNAVAILABLE`을 반환한다.

```ts
await expect(runGate({ docker: fakeUnavailable })).rejects.toThrow(
  "SUPABASE_GATE_DOCKER_UNAVAILABLE",
);
```

- [ ] **Step 4: `check:db`를 bounded runner에 연결한다**

```json
{
  "check:db": "node tools/run-pnpm.mjs ruleset:projections:check && node tools/run-supabase-gate.mjs && node tools/run-pnpm.mjs test:auth:local && node tools/run-pnpm.mjs test:db:concurrency"
}
```

- [ ] **Step 5: failure semantics를 테스트한다**

fake child fixture로 success, nonzero, timeout을 검증한다.

```ts
await expect(runStep(fakeSuccess)).resolves.toBeUndefined();
await expect(runStep(fakeFailure)).rejects.toThrow("SUPABASE_GATE_FAILED");
await expect(runStep(fakeHang)).rejects.toThrow("SUPABASE_GATE_TIMEOUT");
```

- [ ] **Step 6: clean local DB gate를 실행한다**

Run:

```powershell
corepack pnpm check:db
```

Expected: reset/lint/pgTAP/local Auth/concurrency가 모두 PASS하고 프로세스가 남지 않는다.

- [ ] **Step 7: 커밋한다**

```powershell
git add tools/run-supabase-gate.mjs package.json tests/specs/traceability.test.ts docs/operations/local-runtime.md
git commit -m "fix(tooling): bound the Supabase verification gate"
```

---

### Task 6: Full Internal Gate and Read-Only Review

**Files:**
- Create: `docs/testing/reports/auth-internal-readiness-2026-07-26.md`
- Modify: `docs/superpowers/plans/2026-07-26-auth-remaining-work-implementation-plan.md`
- No production changes during review.

**Interfaces:**
- Consumes: Task 1–5 fixed commits.
- Produces: internal code readiness PASS 또는 exact remaining defect list.

- [ ] **Step 1: clean generated/build outputs만 제거한다**

삭제 대상은 현재 worktree의 ignored/generated output인 `apps/admin/.next`, `apps/admin/tsconfig.tsbuildinfo`로 제한한다. `.pnpm-install*.log`, `.stale-node-modules*`, 사용자 문서는 소유권 확인 전 삭제하지 않는다.

- [ ] **Step 2: exact aggregate를 실행한다**

Run:

```powershell
node --version
corepack pnpm --version
corepack pnpm verify
```

Expected: `v24.18.0`, `11.13.0`, `verify` PASS.

- [ ] **Step 3: 결과를 고정한다**

보고서에 commit SHA, runtime, 각 subgate 결과, DB/Auth count, secret scan 결과를 기록한다. secret 값과 local key는 기록하지 않는다.

- [ ] **Step 4: 별도 읽기 전용 리뷰를 수행한다**

리뷰 범위는 Track A 시작 SHA부터 HEAD까지다. Blocker/Important가 있으면 항목별 RED test를 추가해 해당 Task 구현자에게 되돌리고 재리뷰한다.

- [ ] **Step 5: 계획 상태와 커밋을 갱신한다**

```powershell
git add docs/testing/reports/auth-internal-readiness-2026-07-26.md docs/superpowers/plans/2026-07-26-auth-remaining-work-implementation-plan.md
git commit -m "docs(auth): record internal readiness"
```

---

# Track B — Clean Integration

### Task 7: Pre-Integration Collision Refresh and Union Resolution

**Files:**
- Modify: `docs/testing/reports/auth-integration-collision-audit-2026-07-26.md`
- Modify: `package.json` only in the approved clean integration target.
- Modify: `apps/mobile/package.json` only in the approved clean integration target.
- Test: `tests/specs/traceability.test.ts`

**Interfaces:**
- Consumes: dirty `D:\touchcatch` main, internally GREEN auth branch.
- Produces: Task 0A 이후 변화를 반영한 exact 교집합과 두 package file의 semantic union.

- [ ] **Step 1: main을 변경하지 않고 상태를 읽는다**

Run in `D:\touchcatch`:

```powershell
git status --short
git rev-parse main
git rev-parse codex/supabase-auth-integration
```

- [ ] **Step 2: 파일 교집합을 계산한다**

```powershell
git diff --name-only main...codex/supabase-auth-integration
git status --short
```

보고서에는 branch 변경 파일, dirty main 파일, exact intersection을 분리한다. 파일 내용은 복사하지 않는다.

- [ ] **Step 3: package scripts를 ours/theirs가 아닌 union으로 해석한다**

root `package.json`의 accepted union은 다음을 모두 만족해야 한다.

```ts
expect(check).toContain("node tools/run-pnpm.mjs");
expect(check).toContain("content:catalog:check");
expect(check).not.toContain("corepack pnpm");
expect(packageScripts).toHaveProperty("test:auth:local");
```

`apps/mobile/package.json`은 main의 exact `react-native-web: "0.21.2"` pin과 auth dependencies (`@supabase/supabase-js`, AsyncStorage, Expo Linking/WebBrowser)를 모두 보존한다.

clean integration target의 `tests/specs/traceability.test.ts`에 Task 0A에서 기록한 portable runner + content catalog union assertion을 추가하고, 잘못된 ours/theirs 단독 선택 mutation이 RED인지 확인한다.

- [ ] **Step 4: 교집합 판정 규칙을 적용한다**

- 교집합 0: clean integration worktree 생성 가능.
- 교집합이 두 known package file뿐: 사용자 승인 후 clean integration target에서 semantic union.
- 다른 파일이 추가됨: 자동 통합 중단, 파일별 소유권과 resolution을 사용자에게 제시.
- 어떤 경우에도 root main에서 stash/reset/merge하지 않는다.

- [ ] **Step 5: 사용자에게 통합 방식을 선택받는다**

선택지는 `GitHub PR (권장)`, `clean worktree merge`, `branch 유지`다. 선택 전 외부 write/push/PR을 수행하지 않는다.

---

### Task 8: Selected Integration and Post-Integration Verification

**Files:**
- Git metadata and conflict resolutions only after Task 7 user choice.
- Modify source only for explicitly approved merge conflicts.

**Interfaces:**
- Consumes: user-selected integration method and collision audit.
- Produces: pushed PR 또는 clean target merge with preserved dirty main.

- [ ] **Step 1: clean integration worktree를 만든다**

```powershell
git worktree add D:\touchcatch\.worktrees\auth-integration main
```

main이 원격 기준에서 이동했다면 이 clean worktree 안에서만 fetch/rebase/merge를 수행한다.

- [ ] **Step 2: 선택된 통합을 수행한다**

PR 선택 시 `codex/supabase-auth-integration`을 push하고 PR을 생성한다. merge 선택 시 clean worktree에서 `--no-ff` merge한다. dirty root main은 그대로 둔다.

- [ ] **Step 3: 통합 결과를 재검증한다**

```powershell
corepack pnpm verify
corepack pnpm vitest run apps/server/src/auth tests/contracts/mobile-auth-boundary.test.ts tests/integration/local-auth.test.ts
corepack pnpm content:catalog:check
corepack pnpm vitest run content/learning/all-content.test.ts
```

Expected: aggregate, focused auth, 통합된 content pipeline tests 모두 PASS. `main`의 `44fbfd9` content pipeline은 auth branch에서 함께 검증된 적이 없으므로 content test를 생략하지 않는다.

- [ ] **Step 4: dirty main 보존을 재확인한다**

통합 전후 `D:\touchcatch`의 `git status --short`를 비교해 사용자 파일의 삭제·변경·stage가 없음을 확인한다.

---

### Task 8A: User-Owned Content Evidence Reconciliation

**Ownership:** 이 Task는 dirty `main`의 사용자 콘텐츠 작업이다. auth worktree 구현 agent가 수정하지 않으며, 사용자 승인 후 main 전용 clean/content worktree에서 별도 수행한다.

**Files:**
- Modify/move: `research.md` to an approved `docs/` location.
- Modify: `content/learning/all-content.test.ts`
- Read: `content/learning/catalog.v1.json`
- Read: `content/learning/manifest.v1.json`

**Interfaces:**
- Consumes: 현재 catalog 79 entries, manifest 79 entries.
- Produces: catalog↔manifest exact bijection과 재현 가능한 research evidence.

- [ ] **Step 1: stale 숫자 RED를 기록한다**

2026-07-26 observed:

```text
research.md: 56 packs
catalog.v1.json: 79 entries
manifest.v1.json: 79 entries
```

- [ ] **Step 2: exact bijection test를 추가한다**

```ts
it("keeps catalog and manifest in exact bijection", async () => {
  const catalog = JSON.parse(await readFile(resolve(root, "catalog.v1.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.v1.json"), "utf8"));
  const catalogKeys = [...catalog.entries.map((entry: { key: string }) => entry.key)].sort();
  const manifestKeys = [...manifest.entries.map((entry: { key: string }) => entry.key)].sort();
  expect(catalogKeys).toEqual(manifestKeys);
});
```

기존 `>= 9` 하한은 smoke invariant로 남길 수 있지만 exact synchronization 근거로 사용하지 않는다.

- [ ] **Step 3: research 문서의 수치와 명령을 고친다**

- 수동 `56`을 현재 생성물에서 파생된 `79`로 갱신하거나 숫자 대신 bijection test를 근거로 링크한다.
- 명령은 `corepack pnpm vitest run content/learning/all-content.test.ts`로 기록한다.
- untracked/dirty content에서 측정한 결과는 commit SHA가 생기기 전 release evidence로 승격하지 않는다.

- [ ] **Step 4: content-only review와 커밋을 별도로 수행한다**

auth 변경과 섞지 않고 catalog/manifest/test/research diff만 리뷰한다.

---

# Track C — External Release Evidence

### Task 9: Preview Provider Credential and Callback Evidence

**Files:**
- Modify: `docs/operations/supabase-auth-provider-handoff.md`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`
- Add redacted screenshots under an approved evidence store, not the public repository, unless repository policy explicitly permits them.

**Interfaces:**
- Consumes: preview Supabase project, Google/Kakao developer consoles, approved secret manager.
- Produces: redacted callback/configuration evidence and provider login-ready preview environment.

- [ ] **Step 1: owner가 실제 preview project와 secret manager 위치를 확인한다**
- [ ] **Step 2: Google/Kakao console에는 `https://<project-ref>.supabase.co/auth/v1/callback`만 등록한다**
- [ ] **Step 3: Supabase redirect allow-list에는 `spotlearn://auth/callback`, `spotlearn://auth/recovery`를 exact 등록한다**
- [ ] **Step 4: secret 값·project credential·callback query를 가린 screenshot과 reviewer 기록을 제출한다**
- [ ] **Step 5: provider별 cold/live callback smoke test가 통과한 뒤에만 `PROVIDER_CREDENTIALS_PREVIEW`를 PASS로 바꾼다**

---

### Task 10: Trusted Device Reviewer Governance Activation

**Files:**
- Modify: `config/auth-device-reviewer-keys.v1.json`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`

**Interfaces:**
- Consumes: Security와 Operations의 서로 다른 승인자, Ed25519 public reviewer key, governance signing roots.
- Produces: ACTIVE reviewer registry와 검증 가능한 두 approval receipt.

- [ ] **Step 1: Security와 Operations가 서로 다른 approver ID와 governance public key를 제공한다**
- [ ] **Step 2: device reviewer public key를 추가하고 private key는 저장소 밖에 유지한다**
- [ ] **Step 3: canonical reviewer registry hash에 대해 SECURITY/OPERATIONS receipt를 각각 서명한다**
- [ ] **Step 4: evidence contract test로 key type, unique ID, distinct approver, 두 signature를 검증한다**
- [ ] **Step 5: registry가 `ACTIVE`가 된 후에만 `NO_TRUSTED_REVIEWER_KEYS` blocker를 제거한다**

---

### Task 11: Android Development-Build Golden

**Files:**
- Create: `evidence/external/auth/device/android/email_confirmation.json`
- Create: `evidence/external/auth/device/android/configured_google_or_kakao_provider.json`
- Create: `evidence/external/auth/device/android/cold_start_callback.json`
- Create: `evidence/external/auth/device/android/live_callback.json`
- Create: `evidence/external/auth/device/android/restart_recovery.json`
- Create: `evidence/external/auth/device/android/logout.json`
- Create: `evidence/external/auth/device/android/account_deletion.json`
- Modify: `docs/testing/reports/auth-device-goldens.v1.json`

**Interfaces:**
- Consumes: preview provider setup, Android physical device, Expo development build, ACTIVE reviewer registry.
- Produces: signed Android PASS evidence for seven exact scenarios.

- [ ] **Step 1: app build SHA-256, OS/device, provider, reviewer를 기록한다**
- [ ] **Step 2: email confirmation과 configured Google/Kakao login을 수행한다**
- [ ] **Step 3: cold-start callback과 live callback을 각각 수행한다**
- [ ] **Step 4: restart/recovery, logout, account deletion을 수행한다**
- [ ] **Step 5: token/raw URL 없이 scenario evidence를 저장하고 각 SHA-256을 manifest에 결속한다**
- [ ] **Step 6: trusted reviewer가 canonical Android payload에 detached Ed25519 signature를 생성한다**
- [ ] **Step 7: contract/secret scan 통과 후 Android만 PASS로 바꾸고 iOS는 BLOCKED로 유지한다**

---

### Task 12: iOS Development-Build Golden and Guideline 4.8

**Files:**
- Create: `evidence/external/auth/device/ios/email_confirmation.json`
- Create: `evidence/external/auth/device/ios/configured_google_or_kakao_provider.json`
- Create: `evidence/external/auth/device/ios/cold_start_callback.json`
- Create: `evidence/external/auth/device/ios/live_callback.json`
- Create: `evidence/external/auth/device/ios/restart_recovery.json`
- Create: `evidence/external/auth/device/ios/logout.json`
- Create: `evidence/external/auth/device/ios/account_deletion.json`
- Modify: `docs/testing/reports/auth-device-goldens.v1.json`
- Modify: `docs/operations/supabase-auth-provider-handoff.md`

**Interfaces:**
- Consumes: preview provider setup, iOS physical device, Expo development build, ACTIVE reviewer registry, product/legal App Review decision.
- Produces: signed iOS PASS evidence and explicit Guideline 4.8 release decision.

- [ ] **Step 1: Android와 동일한 7개 scenario를 iOS development build에서 수행한다**
- [ ] **Step 2: Google/Kakao가 primary login이면 equivalent login option이 Guideline 4.8을 충족하는지 product/legal reviewer가 판정한다**
- [ ] **Step 3: 미충족이면 iOS만 BLOCKED로 유지하고 Android/guest play 상태를 변경하지 않는다**
- [ ] **Step 4: 충족 증거가 있으면 redacted evidence와 signed reviewer attestation을 제출한다**
- [ ] **Step 5: contract/secret scan 통과 후 iOS PASS와 root PASS를 갱신한다**

---

### Task 13: Production Provider and Release Approval

**Files:**
- Modify: `docs/operations/supabase-auth-provider-handoff.md`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`
- Generate/update: `docs/testing/reports/release-blockers.v1.json`

**Interfaces:**
- Consumes: internally GREEN integrated commit, preview goldens, production provider configuration, privacy/retention/operations approvals.
- Produces: production release decision with zero unresolved required blockers.

- [ ] **Step 1: production callback/redirect/secret ownership을 preview와 독립적으로 검증한다**
- [ ] **Step 2: production credential rotation·incident owner·rollback 절차를 확인한다**
- [ ] **Step 3: 개인정보/보존/계정삭제 운영 문서와 실제 production approval을 연결한다**
- [ ] **Step 4: release blocker generator와 docs/traceability/secret scan을 실행한다**
- [ ] **Step 5: unresolved required blocker가 0일 때만 production release를 승인한다**

---

## Completion Matrix

| Milestone | Required Tasks | External evidence required |
|---|---|---|
| Internal code ready | Track A Tasks 1–6 | No |
| Guest game merge ready | Track A + Track B | No provider/device evidence |
| Login beta ready | Tasks 9–12 + deletion automation | Yes |
| Production release ready | Tasks 9–13, all release blockers zero | Yes |

## Explicit Non-Goals

- `OBS-002`의 실제 NestJS/Socket.IO + Redis/BullMQ service 구현은 인증 잔여 작업에 포함하지 않는다. 현재 구현 부재를 정확히 `BLOCKED`로 표현하는 것만 Track A에서 처리한다.
- 레거시 quarantine의 법률/보존 결정을 일반 게임 플레이 blocker로 확대하지 않는다.
- dirty main의 사용자 콘텐츠를 인증 branch에 자동 흡수하지 않는다.
- 외부 screenshot, credential, reviewer signature를 synthetic fixture로 production evidence에 등록하지 않는다.

## 2026-07-26 Review Feedback Disposition

### 수용

- mobile 오류 유입 원인을 root `include`가 아니라 import graph + NodeNext/Metro resolution 충돌로 수정했다.
- runtime relative import의 `.js` 선택지를 제거하고 현재 GREEN인 extensionless Metro contract를 유지했다.
- project boundary 분리와 strictness 강화를 Task 1A/1B의 별도 RED/GREEN·커밋으로 분리했다.
- default Node `v22.16.0` drift를 Task 0 선행 gate로 추가했다.
- collision audit을 Track A 이전 Task 0A로 이동하고 `package.json` semantic union acceptance를 Task 7에 추가했다.
- `OBS-002`의 exact blocker reason과 새로운 BLOCKED dispatcher 경로/PLANNED 회귀 범위를 명시했다.
- numeric approvals에 `sourceHash`, `ssotHash`, `summary`와 deterministic generator/check를 포함했다.
- Supabase gate에 Docker preflight, 단계별 timeout, timeout/failure error code를 일치시켰다.
- React Native shadow declaration 제거, type-error workload 우선순위, post-integration content test 근거를 추가했다.
- dirty main의 stale `research.md`와 catalog↔manifest bijection은 사용자 소유 Task 8A로 분리했다.

### 수정 수용

- dirty main의 두 package file을 Track A 전에 강제 커밋하지 않는다. 사용자가 선커밋, exact patch 고정, branch 유지 중 선택하며 root main에는 자동 write를 하지 않는다.
- `apps/mobile/package.json` formatting은 양쪽 소유권과 적용 권한이 확인된 경우의 단독 mechanical commit으로만 허용한다.
- `--webpack`은 Turbopack 근본 수정으로 표현하지 않고 Windows junction 환경 문제를 회피하는 repository workaround로 문서화한다.

### 미수용

- `node-linker=hoisted`를 즉시 기본 설정으로 바꾸는 제안은 전체 workspace dependency layout과 lock/install 결과를 바꾸므로 별도 dependency audit 없이는 적용하지 않는다.
- `tools/requirement-oracle.ts` 등 전체 포매팅을 Track A 필수 작업으로 확대하지 않는다. 필요 시 파일별 mechanical-only 커밋을 사용자 승인 후 별도 수행한다.
- untracked `research.md`를 auth worktree에서 직접 이동·커밋하지 않는다. 해당 파일은 dirty main의 사용자 소유 작업이다.

## Execution Order

1. Task 0에서 exact runtime을 활성화하고 gate를 통과한다.
2. Task 0A에서 dirty-main collision을 먼저 감사하고 두 package file의 사용자 처리 방식을 결정한다.
3. Track A Tasks 1A → 1B → 2 → 3 → 4 → 5 → 6을 순차 실행하고 각 Task마다 구현 agent + spec reviewer + quality reviewer를 둔다.
4. 내부 `verify` PASS 후 Track B Task 7에서 collision을 refresh하고 semantic union을 확정한다.
5. 사용자가 PR/merge/branch 유지 중 하나를 선택한 후에만 Task 8을 실행한다.
6. Task 8A는 사용자 소유 content follow-up으로 auth diff와 별도 수행한다.
7. Track C는 실제 외부 owner와 device가 준비되는 순서대로 진행하되, Task 10 governance activation이 Task 11/12 PASS의 선행 조건이다.
