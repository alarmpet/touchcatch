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
| `pnpm verify` | FAIL | Windows worktree에서 Next 16 Turbopack가 `node_modules/pg` junction 생성 실패 (`os error 1`) |
| `pnpm typecheck` | FAIL | mobile NodeNext imports/React Native typing/Supabase adapter/guest content, content validator, device evidence test, DB tests, traceability/oracle 타입 오류 |
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

# Track A — Internal Code Readiness

### Task 1: Mobile TypeScript Contract Repair

**Files:**
- Modify: `tsconfig.json`
- Modify: `apps/mobile/tsconfig.json`
- Modify: `apps/mobile/src/native-modules.d.ts`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/src/auth/AuthRuntime.tsx`
- Modify: `apps/mobile/src/auth/linking.test.ts`
- Modify: `apps/mobile/src/auth/native-auth.ts`
- Modify: `apps/mobile/src/guest-content/GuestLearningScreen.tsx`
- Modify: `apps/mobile/src/guest-content/progress.ts`
- Modify: `apps/mobile/src/guest-content/registry.ts`
- Modify: `apps/mobile/src/learning-demo/data.ts`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx`
- Modify: `apps/mobile/src/learning-demo/registry.ts`
- Modify: `apps/mobile/src/ui/BattleScreen.render.test.tsx`
- Test: existing mobile auth/guest/learning/UI tests

**Interfaces:**
- Consumes: Expo/Metro module resolution, `@supabase/supabase-js` Auth return types, `GuestProgressEvent`.
- Produces: mobile source가 Expo runtime과 root strict TypeScript 양쪽에서 동일하게 typecheck되는 import/type boundary.

- [ ] **Step 1: focused RED를 고정한다**

Run:

```powershell
corepack pnpm exec tsc -p apps/mobile/tsconfig.json --noEmit
```

Expected: 현재 NodeNext extension, `AppState`, Supabase `data: null`, exact optional property, JSON import 오류가 재현된다.

- [ ] **Step 2: module-resolution 책임을 mobile config로 한정한다**

`apps/mobile/tsconfig.json`은 Expo가 생성한 기준을 확장하고 Metro/Bundler resolution을 명시한다. root `tsconfig.json`은 mobile의 bundler-owned `app/**`를 직접 포함하지 않고 server/packages와 Node에서 실행되는 test/tool만 담당한다. Node test가 import하는 mobile module은 `.js` specifier 또는 bundler-safe module boundary 중 실제 Expo build와 root typecheck를 함께 통과하는 쪽으로 하나만 일관되게 적용한다.

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

`apps/mobile/src/native-modules.d.ts`의 local React Native declaration에는 runtime에서 사용하는 최소 `AppState` 표면을 추가하고 임의 `any` export로 전체 SDK를 덮지 않는다.

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

- [ ] **Step 3: React Native와 Supabase adapter 타입을 실제 SDK와 맞춘다**

`AuthRuntime.tsx`는 `AppStateStatus`를 사용하고 callback을 명시한다.

```ts
import { AppState, type AppStateStatus } from "react-native";

const subscription = AppState.addEventListener(
  "change",
  (state: AppStateStatus) => {
    if (state === "active") startAutoRefresh();
    else stopAutoRefresh();
  },
);
```

`native-auth.ts`의 auth result contract는 실패 시 `data: null`을 허용한다.

```ts
type AuthResult<T> = Promise<
  | Readonly<{ data: T; error: null }>
  | Readonly<{ data: null; error: unknown }>
>;
```

- [ ] **Step 4: exact optional property를 보존한다**

`progress.ts`는 `undefined` 값을 optional property에 쓰지 않는다.

```ts
return rejectionCode === undefined
  ? event
  : { ...event, rejectionCode };
```

- [ ] **Step 5: mobile focused GREEN을 확인한다**

Run:

```powershell
corepack pnpm exec tsc -p apps/mobile/tsconfig.json --noEmit
corepack pnpm vitest run apps/mobile tests/contracts/mobile-auth-boundary.test.ts tests/contracts/mobile-guest-sync.test.ts tests/contracts/mobile-guest-progress.test.ts
```

Expected: mobile typecheck PASS, 관련 회귀 PASS.

- [ ] **Step 6: 커밋한다**

```powershell
git add apps/mobile
git commit -m "fix(mobile): align Expo and auth TypeScript contracts"
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

- [ ] **Step 1: Task 1 이후 root RED 목록을 저장한다**

Run:

```powershell
corepack pnpm typecheck
```

Expected: 이 Task의 대상 파일만 남아 FAIL한다. mobile 파일이 다시 나오면 Task 1로 되돌린다.

- [ ] **Step 2: unchecked collection access를 assertion helper로 좁힌다**

`auth-device-goldens.test.ts`에 undefined를 숨기는 `!` 연쇄 대신 실패 메시지가 있는 helper를 둔다.

```ts
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`MISSING_${label}`);
  return value;
}
```

모든 platform/scenario/key lookup은 `required(...)`를 거쳐 mutation test의 의도를 유지한다.

- [ ] **Step 3: DB query input과 result를 명시한다**

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

- [ ] **Step 4: oracle fixture의 discriminated union을 보존한다**

초기 상태와 player command fixture는 넓은 `object` cast 대신 production type을 만족시킨다.

```ts
const initialState = createInitialMatchState(...) satisfies MatchInitialStateV1;
const command = {
  source: "PLAYER",
  payload: { kind: "SUBMIT_ANSWER", answer: "fixture" },
  // exact remaining fields
} satisfies MatchCommand;
```

tuple 변환은 길이를 먼저 검증한 뒤 반환한다.

```ts
if (assets.length !== 2) throw new Error("MATCH_ASSET_PAIR_REQUIRED");
return [assets[0]!, assets[1]!] as const;
```

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
- Generate: `docs/requirements-registry.v1.json`

**Interfaces:**
- Consumes: migration/roles/test source, OpenAPI schemas, planned realtime status, numeric SSOT files.
- Produces: 226/226 executable requirement results and zero numeric approval drift without weakening an oracle or falsely promoting external work.

- [ ] **Step 1: 각 실패의 정확한 diagnostic을 RED test로 노출한다**

Add assertions equivalent to:

```ts
expect(execute("OBS-002")).toMatchObject({
  status: "BLOCKED",
  reason: "REALTIME_SERVICE_NOT_IMPLEMENTED",
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

- [ ] **Step 2: OBS-002를 거짓 PASS가 아닌 명시적 BLOCKED로 맞춘다**

`OBS-002`는 실행 가능한 NestJS/Socket.IO + Redis/BullMQ service가 없다는 현재 규범 문장과 동일하게 `BLOCKED`를 반환해야 한다. oracle이 구현 부재를 `FAIL`로 반환한다면 dispatcher의 planned/external 상태 처리를 수정하고, evidence expected를 PASS로 바꾸지 않는다.

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

문장이 바뀐 경우 `approvedTokens`를 현재 규범 숫자와 맞추고, SSOT 파일이 바뀐 경우 실제 JSON pointer와 hash를 재계산한다. 근거 없이 숫자를 승인하지 않는다.

- [ ] **Step 6: 생성물과 전체 문서 gate를 확인한다**

Run:

```powershell
node tools/write-requirement-registry.mjs
corepack pnpm vitest run tests/specs/generated-requirement-coverage.test.ts
node tools/check-docs.mjs
git diff --check
```

Expected: 226/226 PASS, `numericApprovalDrift: 0`, registry freshness PASS.

- [ ] **Step 7: 커밋한다**

```powershell
git add tools/requirement-oracle.ts tests/specs config/requirement-evidence.v1.json config/normative-numeric-approvals.v1.json docs/requirements-registry.v1.json
git commit -m "fix(requirements): close executable evidence drift"
```

---

### Task 4: Portable Admin Production Build

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

`docs/operations/admin-build.md`에 Next 16 기본 Turbopack 대신 CI/Windows production gate가 `--webpack`을 쓰는 이유와 되돌림 조건을 기록한다.

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
  ["db", "reset", "--local"],
  ["db", "lint", "--local", "--fail-on", "error"],
  ["test", "db", "--local"],
];

for (const args of steps) {
  const child = spawn(cli, args, {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
  });
  const result = await waitWithTimeout(child, 120_000);
  if (result !== 0) throw new Error(`SUPABASE_GATE_FAILED:${args.slice(0, 2).join("_")}`);
}
```

timeout 시 자식 process tree를 종료하고 credential/status output을 error message에 복제하지 않는다.

- [ ] **Step 3: `check:db`를 bounded runner에 연결한다**

```json
{
  "check:db": "node tools/run-pnpm.mjs ruleset:projections:check && node tools/run-supabase-gate.mjs && node tools/run-pnpm.mjs test:auth:local && node tools/run-pnpm.mjs test:db:concurrency"
}
```

- [ ] **Step 4: failure semantics를 테스트한다**

fake child fixture로 success, nonzero, timeout을 검증한다.

```ts
await expect(runStep(fakeSuccess)).resolves.toBeUndefined();
await expect(runStep(fakeFailure)).rejects.toThrow("SUPABASE_GATE_FAILED");
await expect(runStep(fakeHang)).rejects.toThrow("SUPABASE_GATE_TIMEOUT");
```

- [ ] **Step 5: clean local DB gate를 실행한다**

Run:

```powershell
corepack pnpm check:db
```

Expected: reset/lint/pgTAP/local Auth/concurrency가 모두 PASS하고 프로세스가 남지 않는다.

- [ ] **Step 6: 커밋한다**

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

### Task 7: Dirty Main Collision Audit

**Files:**
- Create: `docs/testing/reports/auth-integration-collision-audit-2026-07-26.md`
- No source edits.

**Interfaces:**
- Consumes: dirty `D:\touchcatch` main, internally GREEN auth branch.
- Produces: dirty-main 파일과 branch diff의 exact 교집합 및 안전한 통합 방식.

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

- [ ] **Step 3: 교집합 판정 규칙을 적용한다**

- 교집합 0: clean integration worktree 생성 가능.
- 교집합 1개 이상: 자동 merge/rebase 중단, 파일별 소유권과 resolution을 사용자에게 제시.
- 어떤 경우에도 root main에서 stash/reset/merge하지 않는다.

- [ ] **Step 4: 사용자에게 통합 방식을 선택받는다**

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
```

Expected: aggregate와 focused auth 모두 PASS.

- [ ] **Step 4: dirty main 보존을 재확인한다**

통합 전후 `D:\touchcatch`의 `git status --short`를 비교해 사용자 파일의 삭제·변경·stage가 없음을 확인한다.

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

## Execution Order

1. Track A Tasks 1 → 6을 순차 실행하고 각 Task마다 구현 agent + spec reviewer + quality reviewer를 둔다.
2. 내부 `verify` PASS 후 Track B Task 7 collision audit을 실행한다.
3. 사용자가 PR/merge/branch 유지 중 하나를 선택한 후에만 Task 8을 실행한다.
4. Track C는 실제 외부 owner와 device가 준비되는 순서대로 진행하되, Task 10 governance activation이 Task 11/12 PASS의 선행 조건이다.
