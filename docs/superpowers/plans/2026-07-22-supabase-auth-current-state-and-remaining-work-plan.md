# Supabase Auth Current State and Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 커밋된 Supabase 인증 Task 1–7을 재현 가능한 증거로 고정하고, 남은 Task 8과 실제 배포 전 handoff를 완료한 뒤 안전하게 `main`에 통합한다.

**Architecture:** `codex/supabase-auth-integration`을 인증 작업의 유일한 통합 브랜치로 유지한다. 로컬 코드 검증, 로컬 Supabase 통합 증거, 외부 provider/실기기 증거를 서로 다른 gate로 관리하며, 외부 자격증명이 없어도 게스트 게임 플레이와 로컬 인증 검증은 막지 않는다.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.0, TypeScript 5.9, Vitest 4, Expo 57, Supabase CLI/Auth/PostgreSQL 17, pgTAP, Docker Desktop.

## Global Constraints

- 작업 위치는 `D:\touchcatch\.worktrees\supabase-auth`, 브랜치는 `codex/supabase-auth-integration`이다.
- `D:\touchcatch`의 dirty `main` 작업트리에 있는 학습 콘텐츠 변경은 수정·삭제·스테이징하지 않는다.
- 모바일에는 publishable key만 허용하고 `SUPABASE_SECRET_KEY`, service-role/secret key, access/refresh token 원문을 저장소·로그·문서에 넣지 않는다.
- auth UUID는 외부 player identity, API response, receipt, 로그에 노출하지 않는다.
- 게스트 게임 플레이는 인증 provider 자격증명, 레거시 quarantine 정책, iOS/Android 로그인 golden과 독립적으로 동작해야 한다.
- 레거시 quarantine의 법률·보존 승인은 레거시 데이터의 production migration만 차단한다. 일반 게임 플레이나 신규 로컬 콘텐츠를 차단하지 않는다.
- Google/Kakao 운영 자격증명과 실제 iOS/Android golden은 코드로 위조하지 않고 `BLOCKED` 외부 증거로 유지한다.
- 모든 동작 변경은 RED → GREEN → 회귀 테스트 순서로 수행하고 Task별로 별도 커밋한다.

---

## 2026-07-22 감사 결과

### 완료된 구현

| 단계 | 커밋 | 상태 | 확인된 핵심 산출물 |
|---|---|---|---|
| Task 1 | `8c08d6b` | 완료 | account/progress API 계약 |
| Task 2 | `6eafeba` | 완료 | 공용 Supabase JWT verifier와 REST/Socket gate |
| Task 3 | `951b25b` | 완료 | 원자적 account bootstrap, 권위 `/v1/me`, DB LOGIN 경계 |
| 보정 | `d5fca03` | 완료 | REST evidence와 auth gate 정합 |
| Task 4 | `f19d236` | 완료 | Expo Supabase client와 session lifecycle |
| Task 5 | `518c0ad` | 완료 | email, Google/Kakao PKCE, recovery callback |
| Task 6 | `4f05b85` | 완료 | production-safe guest pack과 progress merge |
| Task 7 | `45cb910` | 완료 | identity link/unlink, nickname, 삭제 lifecycle/worker |

현재 브랜치는 `main`보다 8개 커밋 앞서고 뒤처진 커밋은 없다. Task 7 focused 회귀는 현재 HEAD에서 8개 파일 39개 테스트가 통과했고 account-worker/server TypeScript와 `git diff --check`도 통과했다.

### 남은 결함과 위험

1. **P0 — 전체 gate가 재현되지 않는다.** 2026-07-22 현재 기본 `node`는 v22.16.0이고, 앞선 nested Corepack 실행에서는 Node 24.14.0/pnpm 11.9.0도 관측됐다. 어느 쪽도 요구값 Node 24.18.0/pnpm 11.13.0을 함께 만족하지 않는다. exact `node.exe`로 직접 실행한 focused test는 통과하므로 현재 증거는 “코드 focused GREEN, 전체 gate BLOCKED”다.
2. **P0 — Task 8 산출물이 없다.** `tests/integration/local-auth.test.ts`와 `docs/operations/supabase-auth-provider-handoff.md`가 존재하지 않는다.
3. **P1 — SEC-001 oracle가 문장 전체를 증명하지 않는다.** 규범 문장은 Supabase token과 auth UUID 비노출까지 요구하지만 `tools/requirement-oracle.ts`의 SEC-001 분기는 버전 협상, replay, request ID만 실행한다.
4. **P1 — 계정 삭제가 운영자별 수동 승인 없이는 영원히 진행되지 않는다.** 모든 job이 `WAITING_FOR_POLICY`로 생성된다. HARD/SOFT를 한 번 정하는 product configuration과 실제 자동 처리 경로가 필요하며, 사용자별 임의 승인은 제거해야 한다. 또한 현재 unit/pgTAP은 실제 Auth hard delete가 `profiles`/`api_subjects`를 cascade 삭제하고 economy `user_id`를 null로 만드는 파생 효과를 증명하지 않는다.
5. **P1 — 원 계획서 추적 상태가 거짓이다.** `2026-07-19-supabase-auth-integration-plan.md`의 Task 1–7 체크박스가 구현 완료 후에도 모두 비어 있다.
6. **P1 — 통합 충돌 위험이 크다.** `main`에는 대량의 미커밋 학습 콘텐츠 변경이 있고 인증 브랜치는 별도 worktree에 있다. dirty main에서 merge하면 사용자 작업을 섞거나 덮을 수 있다.
7. **P2 — 로컬 메일 명칭이 낡았다.** 현재 Supabase CLI 공식 문서는 로컬 Auth 메일 캡처기를 Mailpit으로 설명한다. 기존 문서의 Inbucket 표현은 실제 CLI status/UI 명칭에 맞춰 정정해야 한다.
8. **P2 — 외부 출시 증거가 없다.** Google/Kakao console credential, exact callback 등록, iOS Guideline 4.8 대응, 실제 Android/iOS development-build golden은 아직 미검증이다.
9. **P2 — 환경 부산물이 남아 있다.** `.pnpm-install*.log`, `.stale-node-modules*`가 인증 worktree에 untracked 상태다. 소스와 무관함을 확인한 뒤 작업 종료 전에 제거해야 한다.

---

### Task 1: 재현 가능한 exact runtime과 gate 복구

**Files:**
- Create: `.node-version`
- Modify: `package.json`
- Create: `tools/run-pnpm.mjs`
- Modify: `tools/check-docs-lib.ts`
- Modify: `tests/specs/traceability.test.ts`
- Create: `docs/operations/local-runtime.md`

**Interfaces:**
- Consumes: root `engines.node=24.18.0`, `engines.pnpm=11.13.0`, `packageManager=pnpm@11.13.0`.
- Produces: 한 번 선택된 pnpm 프로세스가 nested script에서도 다른 global Corepack/Node로 전환되지 않는 `check`/`check:db`/`verify` chain.

- [ ] **Step 1: RED runtime-chain 테스트 작성** — `tests/specs/traceability.test.ts`에 `check`, `check:db` 내부에서 `corepack pnpm`을 재호출하지 않고 현재 pnpm의 `pnpm` binary만 사용한다는 assertion을 추가한다.
- [ ] **Step 2: RED 확인** — exact Node로 `vitest run tests/specs/traceability.test.ts`; 현재 `package.json`의 nested `corepack pnpm` 때문에 FAIL을 확인한다.
- [ ] **Step 3: 최소 수정** — root에 진입하는 최초 명령만 Corepack 책임으로 둔다. Windows host에서 literal `pnpm`도 global runtime으로 drift하므로 `tools/run-pnpm.mjs`가 현재 lifecycle의 `npm_node_execpath`와 `npm_execpath`를 검증한 뒤 같은 Node/pnpm으로 하위 script를 spawn하게 한다. `check`, `check:db`는 이 wrapper를 사용하고 `validateGateScripts`의 순서·중복 검증을 유지한다. shell별 `%VAR%`/`$env:` 문법이나 개인 절대 경로는 사용하지 않는다.
- [ ] **Step 4: runtime 선택 기준 추가** — `.node-version`에 정확히 `24.18.0`을 기록하고 package `engines.node`와 drift하면 실패하는 test를 추가한다. 특정 개인 PC의 절대 runtime 경로는 커밋하지 않는다.
- [ ] **Step 5: runtime 문서 작성** — PowerShell에서 `node --version`, `corepack pnpm --version`이 각각 `v24.18.0`, `11.13.0`인지 먼저 확인하고 불일치 시 중단한다. `docs/operations/local-runtime.md`에는 설치된 도구에 따라 `fnm use 24.18.0`, `nvm use 24.18.0`, 또는 사용자 환경의 `volta install node@24.18.0 pnpm@11.13.0` 중 하나만 선택하는 예시와 선택 후 재검증을 기록하며, 이 도구들을 프로젝트 runtime dependency로 만들지는 않는다.
- [ ] **Step 6: GREEN 확인** — traceability test 후 `corepack pnpm check:runtime`과 `corepack pnpm check`가 dependency auto-install이나 engine drift 없이 실행되는지 확인한다.
- [ ] **Step 7: 커밋** — `git commit -m "fix(tooling): keep verification on the pinned runtime"`.

### Task 2: 완료 이력과 SEC-001 실행 증거 정합화

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md`
- Modify: `tools/requirement-oracle.ts`
- Modify: `tests/specs/security-requirement-oracle.test.ts`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`
- Modify: `06_CLIENT_ARCHITECTURE.md` only if the current normative sentence must be split without changing meaning.

**Interfaces:**
- Consumes: `SEC-001`, `createAccessTokenVerifier`, REST/Socket shared verifier tests, auth UUID boundary tests.
- Produces: SEC-001의 compatibility/replay와 authenticated delivery/privacy clauses를 모두 실패시킬 수 있는 executable oracle.

- [ ] **Step 1: 원 계획서 상태 보정** — Task 1–7의 실제 커밋과 검증 증거가 존재하는 step만 `[x]`로 바꾸고, 당시 전체 `verify`가 실행되지 않은 step은 완료로 위조하지 말고 `focused PASS / aggregate pending` 주석을 남긴다.
- [ ] **Step 2: RED oracle 테스트 작성** — SEC-001 증거에서 REST verifier, Socket verifier, auth UUID 비노출 assertion 중 하나를 제거한 mutation이 `FAIL`이 되는 테스트를 추가한다.
- [ ] **Step 3: RED 확인** — `vitest run tests/specs/security-requirement-oracle.test.ts`; 현재 SEC-001 분기가 mutation을 감지하지 못해 FAIL해야 한다.
- [ ] **Step 4: 최소 oracle 확장** — 기존 SEC-001 ID를 유지하고, verifier/gate/privacy boundary의 repository-local evidence를 composite assertion으로 연결한다. 실패는 `SEC001_JWT_VERIFIER`, `SEC001_REST_SOCKET_PARITY`, `SEC001_AUTH_UUID_EXPOSURE`, `SEC001_REPLAY_DELIVERY` 중 정확한 하위 식별자를 포함해야 한다. 새 ID는 기존 문장과 독립된 새 규범 의미가 생길 때만 발급한다.
- [ ] **Step 5: registry 생성** — `node tools/write-requirement-registry.mjs`를 실행하고 생성물 외 수동 편집이 없는지 확인한다.
- [ ] **Step 6: GREEN/커밋** — security oracle, generated coverage, docs check를 통과시킨 뒤 `git commit -m "docs(auth): bind SEC-001 to executable evidence"`.

### Task 3: 실제 로컬 Supabase Auth 통합 golden

**Files:**
- Create: `tests/integration/local-auth.test.ts`
- Modify: `vitest.db.config.ts`
- Modify: `package.json`
- Modify: `supabase/config.toml` only if current Mailpit/local SMTP status disagrees with the checked-in ports.

**Interfaces:**
- Consumes: local Supabase API `http://127.0.0.1:55321`, Mailpit UI/API port `55324`, local DB, server `createServerRuntime`/node adapter.
- Produces: 실제 email confirm → JWT → `/v1/me` bootstrap/replay와 invalid JWT/redaction golden.

- [ ] **Step 1: RED integration skeleton 작성** — suite 시작 시 `GET http://127.0.0.1:55321/auth/v1/health`를 `AbortSignal.timeout(2_000)`으로 호출하고 local API, Mailpit, DB가 없으면 skip하지 않고 `LOCAL_SUPABASE_UNAVAILABLE`로 실패시킨다. 이후 모든 HTTP polling에도 명시 timeout과 최대 시도 횟수를 둔다. CI에서는 `supabase start`/`db reset` 뒤 실행한다.
- [ ] **Step 2: RED email test 작성** — 무작위 `@example.test` 사용자를 signup하고 Mailpit API에서 해당 수신자의 최신 confirmation message 하나만 찾으며, 링크의 token/code를 로그하지 않고 confirm callback을 소비한다.
- [ ] **Step 3: RED JWT/API test 작성** — confirm된 session access token으로 `/v1/me`를 두 번 호출해 동일 subject/profile을 받고, forged signature와 expired token은 401, anonymous/unverified identity는 403, auth UUID는 JSON과 captured log에 없음을 검증한다.
- [ ] **Step 4: RED PKCE 경계 작성** — local GoTrue가 발급한 callback은 code query만 앱 coordinator에 전달되고 fragment token, extra query, replay는 거절되는지 기존 coordinator와 실제 local service를 연결해 검증한다. 외부 Google/Kakao 네트워크 로그인은 이 local test에 포함하지 않는다.
- [ ] **Step 5: GREEN 구현** — test helper는 local status가 제공하는 publishable/anon 호환 key만 사용한다. `afterAll`은 이번 run이 만든 UUID email/Auth user와 그 Mailpit message ID만 제거하고, 전체 mailbox를 비우지 않는다. service/secret key가 필요한 cleanup은 별도 test-process environment에서만 읽고 출력하지 않으며 cleanup 실패도 수집해 다음 run을 오염시키지 않게 보고한다.
- [ ] **Step 6: gate 연결** — `test:auth:local`을 추가하고 `check:db`에서 DB reset 뒤 실행한다.
- [ ] **Step 7: 회귀/커밋** — local auth suite, pgTAP, DB concurrency를 통과시킨 뒤 `git commit -m "test(auth): prove the local Supabase flow"`.

### Task 4: 계정 삭제 정책 자동화와 실제 cascade 증거

**Files:**
- Read only: `supabase/migrations/202607190009_account_deletion_lifecycle.sql`
- Create: `supabase/migrations/202607220010_account_deletion_policy.sql`
- Modify: `supabase/tests/database/account-deletion-lifecycle.test.sql`
- Modify: `tests/database/account-lifecycle-concurrency.test.ts`
- Modify: `apps/server/src/account/delete-account.ts`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `docs/operations/supabase-auth-provider-handoff.md`

**Interfaces:**
- Consumes: `request_account_deletion_v1`, account worker lease/checkpoint/finalize lifecycle.
- Produces: 한 번 승인된 environment policy(`HARD` 권장)가 새 삭제 요청을 자동으로 `READY`로 만들고, Auth hard delete의 실제 DB cascade까지 검증된 재시도 가능 삭제 경로.

- [ ] **Step 1: product decision 기록** — 신규 게임 계정은 `HARD`를 기본 권장값으로 명시한다. `SOFT`가 필요한 실제 보존 요구가 제시될 때만 변경하며, 레거시 quarantine 보존 정책과 섞지 않는다.
- [ ] **Step 2: RED DB 테스트 작성** — configured policy가 HARD일 때 새 job이 즉시 READY, 동일 idempotency key 재요청은 같은 job, worker crash/retry 후 COMPLETE, DELETING admission 차단을 검증한다. 실제 local Auth user에 hard delete를 실행한 뒤 `auth.users`, `public.profiles`, `private.api_subjects`, learning rows는 제거되고 `private.economy_subjects.user_id`는 null이며 job에는 auth UUID가 남지 않는지 확인한다.
- [ ] **Step 3: RED 확인** — pgTAP/concurrency에서 현재 `WAITING_FOR_POLICY` 때문에 FAIL을 확인한다.
- [ ] **Step 4: forward migration 구현** — singleton policy row 또는 deployment setting을 privileged role만 변경할 수 있게 하고 request 함수가 명시 정책을 원자적으로 snapshot한다. 기존 WAITING jobs는 별도 migration 함수로 한 번만 전환하며 silent default는 두지 않는다. 적용된 `202607190009`는 수정하지 않는다.
- [ ] **Step 5: crash-window 검증** — 기존 순서 `LEASED → Supabase Auth delete → AUTH_DELETED checkpoint → COMPLETE`를 유지한다. Auth 호출 전 실패는 lease 재획득으로, Auth 성공 직후 checkpoint 전 실패는 `user_not_found`를 성공으로 취급해 복구한다. DB를 먼저 지우는 `DB_CLEANED → AUTH_DELETED` 순서는 durable auth UUID를 잃을 수 있으므로 도입하지 않는다. local integration test가 Auth delete의 FK cascade 원자성을 증명하지 못하면 그때만 `AUTH_DELETED → DATA_CLEANED → COMPLETE` 상태를 추가한다.
- [ ] **Step 6: API 정합화** — `policyPending`을 실제 상태와 일치시키고 OpenAPI/contract test를 갱신한다.
- [ ] **Step 7: GREEN/커밋** — pgTAP, actual Auth cascade integration, 10-worker claim concurrency, worker focused test 후 `git commit -m "fix(auth): automate the approved deletion policy"`.

### Task 5: Provider와 운영 handoff 문서 완성

**Files:**
- Create: `docs/operations/supabase-auth-provider-handoff.md`
- Modify: `09_API_AND_SOCKET_EVENTS.md`
- Modify: `config/requirement-evidence.v1.json`
- Generate: `docs/requirements-registry.v1.json`

**Interfaces:**
- Consumes: `spotlearn://auth/callback`, `spotlearn://auth/recovery`, Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`.
- Produces: 환경별 exact redirect/secret ownership/release blocker checklist.

- [ ] **Step 1: 문서 contract test 작성** — callback 3종, secret 저장 위치, local/preview/production 구분, owner, evidence path, PASS/BLOCKED 상태가 모두 없으면 실패하는 test를 추가한다.
- [ ] **Step 2: handoff 작성** — Google/Kakao console에는 Supabase callback을, Supabase redirect allow-list에는 exact app callback을 등록하는 절차를 분리한다. 실제 secret 값은 쓰지 않고 dashboard/secret manager 위치와 확인자만 기록한다.
- [ ] **Step 3: iOS 정책 gate 작성** — Google/Kakao가 primary account login이면 Apple App Review Guideline 4.8의 equivalent login 조건을 출시 전에 확인하고, 충족 전 iOS release만 `BLOCKED`로 둔다. Android와 게스트 게임 플레이는 이 blocker로 막지 않는다.
- [ ] **Step 4: 메일 용어 정정** — 현재 Supabase CLI가 제공하는 로컬 캡처기를 Mailpit으로 표기하고 UI/API port를 `supabase status` 결과에서 파생한다.
- [ ] **Step 5: 증거 상태 갱신** — credential과 console screenshot이 없으면 `PROVIDER_CREDENTIALS: BLOCKED`, 코드/local test는 별도 PASS로 기록한다.
- [ ] **Step 6: GREEN/커밋** — docs/traceability tests 통과 후 `git commit -m "docs(auth): add provider operations handoff"`.

### Task 6: Android/iOS development-build 실기기 검증

**Files:**
- Create: `docs/testing/reports/auth-device-goldens.v1.json`
- Modify: `config/requirement-evidence.v1.json`
- Modify: `docs/operations/supabase-auth-provider-handoff.md`

**Interfaces:**
- Consumes: Expo development build, 실제 Android/iOS 기기, 설정 완료된 preview Supabase project.
- Produces: 플랫폼별 cold start/live callback/restart/logout/delete 검증 증거.

- [ ] **Step 1: evidence schema/test 작성** — platform, app build hash, OS/device, provider, callback mode, result, capturedAt, reviewer 필드를 요구하고 token/URL query 원문을 금지한다.
- [ ] **Step 2: Android golden 캡처** — email confirm, Google/Kakao 중 설정된 provider, cold-start callback, live callback, 앱 재시작 recovery, logout을 수행한다.
- [ ] **Step 3: iOS golden 캡처** — 동일 항목과 Guideline 4.8 대응 login option을 확인한다.
- [ ] **Step 4: 실패 분리** — Expo Go 버전 불일치는 앱 결함과 구분하고 development build에서 재현한다. 실제 기기/credential이 없으면 해당 플랫폼만 BLOCKED로 유지한다.
- [ ] **Step 5: 검증/커밋** — evidence schema와 secret scan 통과 후 `git commit -m "test(auth): record native authentication goldens"`.

### Task 7: aggregate 검증과 읽기 전용 최종 리뷰

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md`
- Modify: `docs/superpowers/plans/2026-07-22-supabase-auth-current-state-and-remaining-work-plan.md`
- No production changes during review.

**Interfaces:**
- Consumes: Tasks 1–6의 고정 커밋과 evidence.
- Produces: merge 가능한 auth branch 또는 명시적인 external-only blocker 목록.

- [x] **Step 1: 전체 로컬 gate 시도** — exact Node `24.18.0`/pnpm `11.13.0`의 `verify`는 runtime과 admin typecheck 통과 후 Windows Turbopack `node_modules/pg` junction 오류로 중단됐다. aggregate는 FAIL/pending이며 PASS로 승격하지 않는다.
- [x] **Step 2: secret/PII scan** — scoped secretlint는 PASS했다. `rg`의 일치 항목은 코드 식별자와 명시적으로 가짜인 callback fixture뿐이며 실제 secret/token/raw 운영 callback 값은 발견되지 않았다.
- [x] **Step 3: boundary 회귀** — JWT algorithm/issuer/audience/expiry, REST/Socket 동일 verifier, auth UUID 비노출, guest production bundle, deletion retry/fencing/cascade, PKCE restart recovery, provider/device evidence 계약은 15 files/89 tests 및 local DB 2 files/4 tests PASS했다.
- [x] **Step 4: 읽기 전용 리뷰** — `2d0ab62` 반영 후 고정 diff 재리뷰에서 Blocker/Important 0건을 확인했다.
- [x] **Step 5: 계획 상태 갱신** — 실행한 검증만 갱신했다. provider credentials, Android/iOS device golden, iOS 4.8, trusted reviewer governance는 계속 `BLOCKED`다.
- [x] **Step 6: 커밋** — `1d80bc1` (`docs(auth): close integration evidence`).

### Task 8: dirty main을 보존하는 통합

**Files:**
- No source edits expected; Git integration only after user choice.

**Interfaces:**
- Consumes: clean `codex/supabase-auth-integration`, dirty `main`, external blocker report.
- Produces: 사용자 콘텐츠 변경을 보존한 통합 결과.

- [ ] **Step 1: main 변경 소유권 확인** — `D:\touchcatch`의 modified/untracked 학습 콘텐츠가 사용자 작업임을 전제로 어떤 파일도 자동 stash/삭제하지 않는다.
- [ ] **Step 2: 원격/기준선 확인** — auth branch가 통합 대상 `main` 기준으로 재검증됐는지 확인한다. root `D:\touchcatch`에서는 merge/rebase를 실행하지 않는다. `main`이 이동했으면 별도 clean integration worktree를 만들고 그 안에서만 rebase 또는 merge와 검증을 수행한다.
- [ ] **Step 3: 충돌 사전 검사** — `git diff --name-only main...codex/supabase-auth-integration`과 dirty main 파일 목록의 교집합을 출력하고, 교집합이 있으면 자동 통합을 중단한다.
- [ ] **Step 4: 사용자 선택** — merge, PR, branch 유지 중 하나를 명시적으로 선택받는다. 외부 provider/device blocker는 코드 merge를 막지 않되 production release status에는 남긴다.
- [ ] **Step 5: 통합 후 재검증** — 선택된 clean target에서 focused auth test와 aggregate `verify`를 다시 실행한다.

## 완료 판정

### Task 7 검증 분류 (2026-07-22)

- **Task 7 기준선/호스트 결함:** Windows Turbopack junction 실패, root TypeScript workspace 오류, generated coverage `OBS-002`/`DATA-012`/`DATA-027`/`API-005`/`API-001`, docs numeric approval `DATA-004`/`DATA-017`/`DATA-027`.
- **Task 7 신규 인증 회귀:** focused 89/89와 local deletion 4/4에서 발견되지 않았다.
- **외부-only blocker:** provider credentials·console evidence, Android/iOS 실제 development-build golden, iOS Guideline 4.8 판단, trusted reviewer governance key/receipt. 이 항목은 코드 readiness와 분리하며 production release PASS로 간주하지 않는다.

- **코드 완료:** exact runtime에서 `pnpm verify` PASS, local Auth golden PASS, 최종 읽기 전용 리뷰에 Blocker/Important 0건.
- **게스트 게임 플레이 가능:** provider credential, 레거시 quarantine 승인, native social-login golden과 무관하게 production-safe guest content가 실행됨.
- **로그인 beta 가능:** local golden PASS, preview Google/Kakao 중 제공할 provider credential과 Android/iOS 대상 golden PASS, 삭제 정책 자동 처리 PASS.
- **production release 가능:** 위 조건에 더해 production provider callback/secret evidence, iOS 4.8 판단, 개인정보/보존 운영 문서, 실제 기기 golden이 승인됨.
- **통합 완료:** dirty main의 사용자 변경이 보존되고 선택된 merge/PR target에서 검증이 재통과함.

## 계획 자체 검토 결과

- 기존 설계의 Task 1–8 요구사항은 완료 이력(Task 1–7)과 남은 Tasks 1–8에 모두 연결했다.
- 새 AUTH/SEC ID는 만들지 않고 SEC-001의 누락된 실행 증거를 먼저 보강한다.
- 실제 secret, token, project ref, 미확인 credential을 계획에 넣지 않았다.
- 외부 blocker를 게임 플레이 blocker로 확대하지 않았다.
- 모든 단계에 대상 파일, 실행 명령, 기대 결과 또는 명시적인 외부 증거 조건이 있다.

## 리뷰 문서 반영 판정

- **수용:** 기본 Node drift의 현재값(v22.16.0), optional runtime manager 명령 예시, SEC-001 하위 오류 식별자, 2초 health preflight/유한 polling, test-owned cleanup, iOS blocker 격리, clean integration worktree 강제.
- **수정 수용:** 삭제 worker의 crash-resume 강화 취지는 수용하되 제안된 `DB_CLEANED → AUTH_DELETED` 순서는 거절했다. 현재 FK 구조는 Auth hard delete가 profile/API/learning을 cascade 삭제하고 economy mapping을 null 처리하므로 이를 실제 local integration으로 먼저 증명한다. 증명 실패 시에만 `AUTH_DELETED → DATA_CLEANED → COMPLETE`를 도입한다.
- **미수용:** nvm-windows/fnm/Volta 중 하나를 프로젝트 의존성으로 강제하거나 개인 runtime 절대 경로를 커밋하는 방식. 저장소에는 `.node-version`과 exact engine gate만 두고 설치 도구는 선택 사항으로 유지한다.

## 확인한 공식 기준

- [Supabase CLI local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase CLI testing and local Auth email capture](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Supabase CLI config reference](https://supabase.com/docs/guides/local-development/cli/config)
- [Apple App Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/)
