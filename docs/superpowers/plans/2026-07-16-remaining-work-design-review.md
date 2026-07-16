# TouchCatch 잔여 작업 계획 및 코드베이스/워크플로우 검토 보고서

**상태:** 검토 의견 전달 (작성 완료)  
**작성일:** 2026-07-16  
**작성자:** Antigravity (AI Coding Assistant)  
**대상 문서:** [2026-07-16-remaining-work-design.md](file:///D:/touchcatch/docs/superpowers/specs/2026-07-16-remaining-work-design.md)  
**결과 문서 경로:** `D:/touchcatch/docs/superpowers/plans/2026-07-16-remaining-work-design-review.md`

---

## 1. 개요 및 검토 목적

본 보고서는 `TouchCatch` 프로젝트의 잔여 작업 계획 설계 문서인 [2026-07-16-remaining-work-design.md](file:///D:/touchcatch/docs/superpowers/specs/2026-07-16-remaining-work-design.md)와 현재 로컬 코드베이스의 구현 상태 및 개발 워크플로우를 대조 분석하여, **계획서와 실제 코드베이스 간의 괴리(Drift), 아키텍처적 취약점, 데이터 무결성 위험, 그리고 워크플로우 실행 시의 잠재적 문제점**을 식별하고 구체적인 개선안을 제시하기 위해 작성되었습니다.

현재 로컬 환경은 저장소 초기화(`git init`)만 수행된 채로, Task 5–6의 standalone 구현(콘텐츠 스키마 유효성 검사, Supabase RLS 및 DB 제약조건 등)이 완료되어 많은 파일들이 Untracked 상태로 존재하고 있습니다. 이러한 특수한 상황에 발맞추어 잔여 계획(A~G)이 충돌 없이 안전하게 수행될 수 있도록 아키텍처적 검토를 수행했습니다.

---

## 2. 코드베이스 현황 분석 및 계획서 정합성 검토

### 2.1. 기존 로컬 구현(Untracked 파일) 유실 위험 (실행 계획 A / Task 1)
* **현황 및 문제점:** 
  잔여 작업 계획의 **실행 계획 A (Task 1)**는 `.gitignore`, `package.json`, `tsconfig.json`, `packages/contracts/package.json` 등을 **신규 생성(Create)**하는 부트스트랩 단계로 명시되어 있습니다. 그러나 현재 로컬 디렉토리에는 이미 이 파일들이 존재하며, Task 5–6 구현을 위해 작성된 마이그레이션 SQL(`202607150002_content_security.sql`, `202607150003_rls_and_integrity.sql`)과 `packages/contracts/src/content.ts` 등이 Untracked 상태로 배치되어 있습니다. 
  Task 1 지침에 따라 단순히 파일을 무조건 덮어쓰거나 재생성할 경우, 기존에 심혈을 기울여 검증 통과한 DB 보안 스키마와 Vitest 테스트 코드베이스가 유실될 심각한 위험이 있습니다.
* **개선책:** 
  실행 계획 A의 Task 1 단계에 **"기존 로컬에 기구현된 Untracked 파일(Task 5-6 마이그레이션, contracts 소스 및 DB pgTAP 테스트 등)을 강제로 덮어쓰지 않고 보존하며 Git Staging 및 최초 Commit을 수행해야 한다"**는 병합 가이드를 명시적으로 보완해야 합니다.

### 2.2. ruleset SSOT 도입에 따른 기존 코드 리팩토링 누락 (실행 계획 A/D)
* **현황 및 문제점:**
  **실행 계획 A (Task 2)**에서 단일 `RulesetV1` 계약(`packages/contracts/src/rules.ts`)을 신규 정의하고, 이후 모든 코드와 DB가 이를 소비하도록 설계했습니다.
  그러나 이미 로컬에 작성된 `packages/contracts/src/content.ts` 및 DB 마이그레이션 `202607150003_rls_and_integrity.sql` 등은 해당 ruleset 계약이 정의되기 전에 작성되었기 때문에, 규칙 상수(NORMAL 차이점 7개, HARD 3개, wordHunt 3개 등)가 하드코딩되어 있거나 독자적인 타입 정의를 가지고 있습니다.
* **개선책:**
  **실행 계획 D (Task 5-6 잔여 통합)** 혹은 실행 계획 A의 마지막 단계에 **"기존 구현된 콘텐츠 계약(`content.ts`), 스키마 검증기(`validate-content.ts`), DB 제약조건/함수를 Task 2에서 확정된 `RulesetV1` 계약 및 공용 타입에 바인딩하여 리팩토링하는 단계"**를 의무 수행 항목으로 추가해야 정합성(Parity)이 유지됩니다.

---

## 3. 핵심 설계 결함 및 개선 방안 (Technical Deep Dive)

### 3.1. 클라이언트-서버 간 Ruleset 버전 핸드셰이크(Handshake) 부재 (실행 계획 B/C)
* **문제점:**
  `matches` 테이블에 `ruleset_version`과 `ruleset_hash`를 기록하고 서버 결정론적 Reducer가 이를 검증하도록 설계되어 있습니다. 하지만 클라이언트가 구버전 ruleset이 적용된 앱 세션을 실행 중인 상태에서 신규 버전 ruleset(수치 밸런스가 패치된 버전)으로 기동된 서버 매치에 참가할 경우, 클라이언트의 로컬 판정 로직과 서버 Reducer 간에 판정 불일치(Drift)가 일어나며 경기가 비정상 종료(CANCELLED)되거나 오작동을 초래하게 됩니다.
* **개선 방안:**
  실행 계획 C (Task 4)의 인증 및 매치 진입 프로토콜 단계에 **"매치 참가를 위한 handshake 과정에서 클라이언트가 탑재한 ruleset_version/hash가 서버 매치의 ruleset 요구사항과 일치하는지 명시적으로 검증하는 단계"**를 추가해야 합니다. 불일치할 경우 클라이언트 앱에 규칙 동기화(혹은 강제 업데이트)를 유도하도록 설계해야 합니다.

### 3.2. 재접속 복구 시 Event Replay 캐시 및 Sequence Gap Recovery 부족 (실행 계획 C)
* **문제점:**
  계획서에는 "15초 미만 단절 시 복구, 15초 이상 단절 시 기권"이라는 시간적 정책만 정의되어 있습니다. 하지만 실제 모바일 네트워크(3G/5G/Wi-Fi 전환 등) 환경에서는 단 1~2초의 단절로도 서버가 송신한 다수의 `eventSeq` 이벤트가 유실(Drop)될 수 있습니다. 단순히 전체 snapshot을 매번 새로 내려받는 방식은 오버헤드가 크며 단절 직전의 동적 애니메이션 상태를 유실시킵니다.
* **개선 방안:**
  서버의 실시간 매치 세션(Redis 혹은 메모리 큐)에 **"매치별로 최근 발행된 N개의 `eventSeq`에 해당하는 이벤트 로그 캐시"**를 유지해야 합니다. 클라이언트가 재접속 요청을 보낼 때 자신이 마지막으로 정상 수신한 `lastReceivedEventSeq`를 전달하면, 서버는 그 이후의 갭(Gap) 이벤트만 순서대로 Replay하여 클라이언트의 로컬 Reducer 상태를 완벽히 메꾸는 **Sequence Gap Recovery 메커니즘**을 실행 계획 C에 기술적으로 명시해야 합니다.

### 3.3. 펫 가챠 및 융합(Fusion) 트랜잭션의 동시성 레이스 컨디션 (실행 계획 E)
* **문제점:**
  **실행 계획 E (Task 7)**는 멱등성 요청 수신(`match_request_receipts` 테이블 활용)을 통해 경제 트랜잭션의 `effect-once`를 보장하려 합니다.
  그러나 가챠(포인트 차감 및 펫 획득)와 펫 융합(재료 펫 카드 여러 장 소모 및 상위 펫 획득)은 비동기 API 요청이 거의 동시에 몰릴 때(예: 악의적인 동시 난타 공격) 멱등성 키 검사가 완료되기 전 찰나의 순간에 포인트가 음수로 내려가거나 재료 카드가 이중 소모되는 등의 **동시성 레이스 컨디션(Race Condition)**이 발생할 수 있습니다.
* **개선 방안:**
  가챠 및 융합을 처리하는 DB 트랜잭션 또는 Supabase RPC 내부에서 **`SELECT ... FOR UPDATE` 구문을 사용해 대상 유저의 프로필 행(`public.profiles.id`) 및 재료 펫 행(`public.user_pets.id`)에 대한 비관적 락(Pessimistic Row-level Lock)을 명시적으로 획득한 후 잔액 차감 및 합성을 수행하도록** 트랜잭션 격리 및 락킹 전략을 구현 명세에 포함해야 합니다.

### 3.4. 격리(Quarantine) 데이터의 개인정보 보존 기한 및 파기 정책 결여 (실행 계획 D)
* **문제점:**
  현재 스키마에는 기존의 레거시 데이터 검증 실패분을 격리 보관하는 격리 테이블들(`private.legacy_game_contents_quarantine`, `private.legacy_matches_quarantine` 등)이 구성되어 있습니다.
  그러나 해당 격리 테이블 내의 경기 이력 및 JSON 로우에는 유저의 식별 정보가 포함될 수 있습니다. 개인정보보호법(GDPR, 국내 개인정보보호법 등) 상 회원 탈퇴 시 또는 특정 보존 연한(예: 3~5년) 경과 시 해당 개인정보는 즉각 파기되거나 비식별화되어야 하지만, 현재 격리 테이블의 데이터 수명 주기(Retention/Deletion) 정책이 누락되어 법적 리스크가 존재합니다.
* **개선 방안:**
  실행 계획 D에 **"유저 회원 탈퇴(`profiles` 삭제) 이벤트 발생 시 격리 테이블 내에 존재하는 해당 유저의 개인 식별 데이터도 연쇄적으로 완전히 물리적 삭제(Hard Delete) 또는 비식별화(Crypto-shredding) 처리하는 DB 트리거/배치 스크립트 구현"**을 기술적 요구사항으로 추가해야 합니다.

### 3.5. CI 환경 내 UI 시각 회귀 테스트(Task 8)의 Flakiness 방지 대책 (실행 계획 F)
* **문제점:**
  실행 계획 F에서 고충실도 UI의 품질 유지를 위해 "SSIM 0.97 이상 및 픽셀 차이 기준"의 시각 회귀 테스트를 도입하기로 했습니다.
  하지만 모바일 UI 시각 테스트는 로컬 OS(Mac, Windows, Linux)와 CI Headless 환경(GitHub Actions Linux Runner) 간의 시스템 폰트 렌더링 방식, 이미지 디코딩 라이브러리 버전, GPU 래스터라이징 성능 차이로 인해 미세한 픽셀 오차가 발생하여 테스트가 빈번하게 깨지는(Flaky) 현상이 빈발합니다.
* **개선 방안:**
  시각 회귀 테스트의 실행 기준을 **"동일한 렌더링 엔진과 폰트 라이브러리가 내장된 고정 CI Docker 컨테이너 환경"**으로 제한하고, 스크린샷 캡처 시 안티앨리어싱 노이즈를 무시하는 임계값(Threshold) 설정을 세밀하게 부여하며, UI 트리 구조 스냅샷(JSON)과 화면 골든 테스트를 병행하도록 테스트 가이드를 보강해야 합니다.

---

## 4. 워크플로우 및 CI/CD 개선 사항

### 4.1. `pnpm verify` 스크립트 실행의 이원화
* **현황 및 문제점:**
  루트 `package.json`에 정의된 `pnpm verify`는 `pnpm check`와 `pnpm check:db`를 모두 실행합니다.
  `pnpm check:db`는 로컬 Supabase CLI를 기동하고 Docker 스택을 리셋하여 pgTAP 테스트를 돌리는 과정을 포함하므로, 실행 시간이 수십 초 이상 걸리는 무거운 작업입니다.
  이를 개발자가 로컬에서 코드 한 줄을 수정할 때마다 매번 돌리거나 `pre-commit` 깃훅(Git Hook)에 통째로 걸어둘 경우 개발자 생산성이 극도로 저하됩니다.
* **개선책:**
  - **로컬 pre-commit/pre-push 훅:** Supabase 구동이 필요 없는 빠른 검증인 `pnpm check`(린트, 타입체크, Vitest 단위 테스트)만 실행하도록 설정합니다.
  - **CI/CD 파이프라인 (GitHub Actions):** 리모트 PR 병합 검증 단계에서만 전체 통합 검증인 `pnpm verify`를 강제 실행하여 검증 안정성과 개발 효율성의 균형을 맞춥니다.

---

## 5. 결론 및 권장 액션 아이템

[2026-07-16-remaining-work-design.md](file:///D:/touchcatch/docs/superpowers/specs/2026-07-16-remaining-work-design.md)는 전체 태스크를 의존성 격리와 인터페이스(`Consumes`/`Produces`) 기반으로 훌륭히 분해하여 병렬 및 점진적 개발이 가능한 구조를 설계했습니다.

하지만 안전하고 프로덕션 수준에 걸맞은 게임 서비스를 배포하기 위해서는, 본 보고서에서 식별한 **기존 로컬 작업 파일 보존 처리, SSOT 바인딩 리팩토링, Ruleset 버전 핸드셰이크, 재접속 시 Event Replay Gap 복구, 동시성 비관적 락킹, 개인정보 격리 데이터 삭제 정책** 등의 보완 사항들이 후속 구체 실행 계획(A~G)에 빠짐없이 반영되어야 합니다.

본 검토 의견서에 명시된 개선 방안들이 향후 실행 계획서가 구체화되는 과정에서 반영될 것을 권장합니다.

---
*본 검토 보고서는 UTF-8 인코딩으로 작성되었으며, `D:/touchcatch/docs/superpowers/plans/2026-07-16-remaining-work-design-review.md` 경로에 보관되었습니다.*
