# TouchCatch Supabase 인증 통합 설계 검토 의견

**상태:** 검토 의견 전달 (작성 완료)  
**작성일:** 2026-07-19  
**작성자:** Grok (xAI)  
**대상 설계:** `D:/touchcatch/docs/superpowers/specs/2026-07-19-supabase-auth-integration-design.md`  
**본 문서 경로:** `D:/touchcatch/docs/superpowers/plans/2026-07-19-supabase-auth-integration-design-review.md`  
**인코딩:** UTF-8  

---

## 1. 검토 목적과 범위

본 문서는 위 설계서와 현재 코드베이스·DB migration·계약 테스트·CI 워크플로우(`pnpm check` / `pnpm check:db` / `pnpm verify`)를 대조해, **구현 착수 전에 닫아야 할 정책 구멍·스펙 드리프트·보안 경계 약화 위험·워크플로우 누락**을 정리한 검토 의견이다.

검토 근거 위치(요약):

| 영역 | 현재 상태 |
|------|-----------|
| 모바일 앱 | Expo Router shell + DEV-only 학습 데모. `@supabase/supabase-js` / SecureStore / WebBrowser 미도입. |
| 서버 | `apps/server/` 비어 있음. JWT 검증·`/v1/me` 런타임 없음. |
| 환경변수 | `packages/config/src/env.ts`가 mobile/server/admin exact allow-list와 production loopback 거절을 이미 강제. |
| DB/RLS | `public.profiles` ↔ `auth.users` FK, self-read/nickname update, private economy subject mapping 존재. **profile bootstrap trigger/함수 없음.** |
| 계약 | OpenAPI Bearer `/v1/me` 등 REST surface 존재. **게스트 진행 병합 endpoint 없음.** |
| 관리자 | `apps/admin`은 HttpOnly cookie session + 별도 verified auth adapter. 모바일 PKCE와 경로 분리됨. |
| 검증 워크플로우 | `pnpm check` (계약·UI·문서·unit), `pnpm check:db` (reset/lint/pgTAP/concurrency), `pnpm verify` = 둘 결합. |

---

## 2. 총평

설계의 **보안 방향은 현재 TouchCatch 권한 모델과 잘 맞는다.** 특히 다음 결정은 유지하는 것이 옳다.

1. **Haruclick implicit/fragment 토큰 주입 폐기, PKCE + `exchangeCodeForSession` 강제**
2. **Supabase anonymous user 비사용** (현재 RLS/`authenticated` role 경계를 넓히지 않음)
3. **권위 write는 trusted server + `app_server`/economy function만** (secret key로 게임·경제 write 금지)
4. **auth UUID를 receipt/telemetry/public wire에 직접 저장하지 않고 random subject mapping 사용**
5. **코드 완료와 production credential/실기기 golden 분리** (외부 blocker 목록)
6. **모바일 env에 secret/`DATABASE_URL` 금지**, 기존 exact allow-list와 정합

다만 설계는 “방향은 맞지만 **구현 에이전트가 임의 결정하면 안 되는 세부 계약이 여러 곳 비어 있다**” 수준이다. §14 완료 기준(“추가 정책 결정을 임의로 만들지 않고 상세 계획을 작성할 수 있다”)을 엄격히 적용하면, 아래 P0/P1 항목을 설계 개정 또는 후속 implementation plan에서 **선택지를 하나로 고정**해야 한다.

**권고 판정:** 구현 착수 가능 수준에 가깝지만, **P0 3~4건을 설계에 반영한 뒤** 단계별 계획(RED→GREEN)을 쓰는 것이 안전하다.

---

## 3. 잘 된 점 (유지·강화 권고)

### 3.1 기존 보안 경계와의 정렬

- Data API는 self profile / nickname / public pet catalogue 수준으로 제한하고, score·보상·가챠·융합·매치 결과는 클라이언트가 직접 쓰지 못한다는 원칙은 기존 migration·pgTAP(`supabase/tests/database/rls.test.sql`, `economy.test.sql`)과 일치한다.
- `service_role`/secret key를 권위 게임 write 경로로 쓰지 않는 점은 `app_server` / `economy_server` 분리 설계와 맞다.
- 계정 삭제 시 `private.economy_subjects.user_id`를 `ON DELETE SET NULL`로 비식별화하고 ledger는 남기는 기존 테스트 의도와 설계 §8·§10.2가 같은 방향을 본다.

### 3.2 게스트 정책의 실용성

- 로컬 전용 게스트 + 로그인 후 비경제 진행만 서버 병합은, “체험은 쉽게, 경제는 권위 있게”라는 제품 목표와 보안 모델 모두에 유리하다.
- anonymous Supabase user를 피한 이유는 기술적으로 타당하다 (`authenticated` role + 별도 claim 정책 부담).

### 3.3 공급자·리다이렉트 모델

- Google/Kakao 콘솔에는 Supabase callback만 등록하고, 앱 scheme은 Supabase Auth redirect allow-list에 두는 분리는 표준에 가깝다.
- Expo Go `exp://`를 운영 redirect로 쓰지 않고 development build + 고정 scheme을 요구한 점도 재현성 측면에서 옳다.
- 앱 scheme `spotlearn`, package/bundle `com.touchcatch.mobile`은 `apps/mobile/app.json`과 일치한다.

### 3.4 환경변수 계약은 이미 코드에 존재

설계 §7.2 키 집합은 `packages/config/src/env.ts`와 사실상 동일하다.

- mobile: `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (+ analytics keys)
- server: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, …
- production loopback 거절 gate 존재

즉 “env 경계” 자체는 새 정책을 만들기보다 **기존 parser/test를 소비·확장**하면 된다.

### 3.5 테스트 전략의 계층 분리

단위(contract/redaction) → DB/RLS → 로컬 통합 → 외부 수동 golden 분리는 이 저장소의 `check` vs `check:db` vs 외부 증거 문화와 잘 맞는다. “credential 없는 테스트로 production 성공을 주장하지 않는다”는 문장은 반드시 유지한다.

---

## 4. 문제점 및 개선사항

우선순위: **P0** = 구현 전 설계에 고정 필요, **P1** = 첫 implementation plan에 포함, **P2** = 후속·운영 개선.

### 4.1 [P0] “기존 random subject mapping” 전제가 코드와 어긋남

설계 §5.2·§11.6은 auth UUID를 바로 쓰지 않고 **기존 random subject mapping**을 쓴다고 한다.

현실:

- `private.economy_subjects(subject_key, user_id, gacha_points)` 는 migration에 존재한다.
- REST control plane용으로 계획서에만 등장하는 `private.api_subjects` 는 **아직 migration에 없다** (G3B 잔여 산출물).
- subject row를 만드는 **idempotent bootstrap RPC/서버 경로가 없다.** 테스트는 subject를 수동 INSERT한다.

**개선:**

1. 1차 로그인 bootstrap이 한 transaction(또는 동일 서버 operation)에서 최소 다음을 보장한다고 명시한다.  
   - `public.profiles` row  
   - `private.economy_subjects` row (`user_id` unique, random `subject_key`)  
   - (REST를 열 때) `private.api_subjects` 생성 시점·소유형을 같이 정의하거나, 당분간 REST subject 해석 규칙을 문서화  
2. “mapping이 이미 있다”가 아니라 **“첫 인증 성공 시 서버가 생성한다”**로 문장을 고친다.
3. bootstrap 실패 시 클라이언트는 “로그인됐지만 계정 준비 실패” typed 상태를 가지며, 경제·매치 endpoint는 profile/subject 미완 시 fail closed.

### 4.2 [P0] 재화 권위 이중성: `profiles.gacha_points` vs `economy_subjects.gacha_points`

현재 스키마:

- `public.profiles`에 `level`, `exp`, `gacha_points` 컬럼이 있고, authenticated에  
  `SELECT (id, nickname, level, exp, gacha_points, created_at)` 가 부여됨.
- 실제 경제 mutation은 `private.economy_subjects.gacha_points` 와 ledger/function 경로만 사용.

설계 §5.3은 클라이언트가 score/gacha points를 **변경**하지 못하게 하지만, **어느 값이 `/v1/me`.points 및 UI 표시 권위인지**를 정하지 않았다. 이 상태로 구현하면:

- 모바일 Data API가 stale `profiles.gacha_points`를 읽고  
- REST `/v1/me`는 economy subject를 읽어  
**두 숫자가 어긋나는 UX/치트 오해**가 생긴다.

**개선 (권고 선택지를 하나로 고정):**

| 항목 | 권고 |
|------|------|
| 표시·API 권위 points | 항상 trusted server가 `economy_subjects`에서 읽어 `/v1/me`로만 제공 |
| Data API profile SELECT | `id, nickname, created_at` 정도만 유지 검토. `level/exp/gacha_points` 는 권위 필드이므로 client SELECT 철회 또는 “legacy display, non-authoritative” 명시 후 제거 로드맵 |
| profile bootstrap | `gacha_points/level/exp` 기본값 0/1/0은 캐시가 아니라 **deprecated**로 취급하거나, 서버 projection 동기화 정책을 별도 ADR로 둠 |

설계 문장 예: “클라이언트는 재화·레벨·경험치를 Data API로 신뢰하지 않는다. 유일한 권위 요약은 Bearer REST `/v1/me`다.”

### 4.3 [P0] Profile bootstrap 경로가 미결정인 채 §14를 만족하지 못함

설계 §5.3은 Auth hook/trigger **또는** trusted server bootstrap 중 하나를 고르라고 하고, **동시 활성 금지만** 적었다.

현재 코드 맥락에서의 권고:

| 후보 | 평가 |
|------|------|
| DB trigger on `auth.users` | 로컬 테스트 가능하나, nickname 기본값·economy subject·감사·실패 재시도·secret 경계를 트리거에 넣기 쉬워 비대해짐. search_path/owner 규칙을 또 하나 늘림. |
| **Trusted server idempotent bootstrap (권고)** | 이미 “권위 write = server” 철학과 일치. JWT 검증 직후 `ensureAccount(authSub)` 한 경로. secret key `listUsers` 없이 `auth.uid` claim만으로 DB role 경로 호출 가능. |

**개선:** 설계에서 1차 경로를 **trusted server idempotent bootstrap**으로 확정하고, Auth hook은 “사용하지 않음(비범위)”으로 적는다.  
동시 로그인 레이스는 `profiles.id` PK / `economy_subjects.user_id` unique 충돌을 잡아 **동일 결과 replay** 하도록 계약 테스트 항목에 넣는다.

또한 기본 `nickname` 생성 규칙(예: `Player-XXXXXXXX` 비식별 접미사, provider display name 미사용 기본)을 고정하지 않으면 구현 에이전트가 PII를 저장할 수 있다. 설계 §9는 이름·avatar 저장에 별도 승인을 요구하므로, **bootstrap 기본 nickname은 provider 이름을 복사하지 않는다**고 명시해야 한다.

### 4.4 [P0] 게스트 로컬 학습 vs production 앱 경계 충돌

설계:

- 게스트는 튜토리얼·로컬 학습 가능, 저장/재화/멀티는 로그인 필수.

코드:

- `apps/mobile/app/index.tsx` production 경로:  
  `Learning demo is DEV-only; production requires authenticated server projections`
- 학습 데모 registry는 compile-time DEV 가드 뒤에만 로드 (`production-boundary.test.ts`).

즉 **지금 production 빌드는 게스트 학습 surface 자체가 없다.**  
설계의 “게스트 계속하기”를 문자 그대로 구현하면 production-boundary 테스트를 깨거나, 반대로 테스트를 유지하면 설계 UX가 거짓이 된다.

**개선 (제품 결정을 설계에 박제):**

1. **MVP-A (권고, 보안·콘텐츠 유출 최소화):**  
   production에서 게스트는 튜토리얼/온보딩 UI와 로그인 유도만 허용. 실제 학습 콘텐츠·정답 근접 데이터는 **인증 후 서버 projection**만. 로컬 병합 API는 “DEV 또는 향후 signed public content pack” 후순위.
2. **MVP-B:**  
   production 게스트 로컬 학습을 허용하되, 공개 가능한 content revision만 번들하고 private solution은 절대 포함하지 않음. DEV registry와 production guest pack을 **물리적으로 분리**하고 boundary 테스트를 재작성.

어느 쪽이든 “로그인 후 병합” 스키마·endpoint는 필요하지만, **1차 범위에 production 게스트 플레이를 넣을지**를 먼저 결정해야 한다.

### 4.5 [P0] 게스트 진행 병합 contract가 OpenAPI/스키마에 없음

설계 §6.3은 로컬 기록 필드와 서버 검증을 서술하지만:

- `packages/contracts/openapi.yaml`에 merge path 없음
- Zod/schema 모듈 없음
- idempotency scope 이름 없음
- 저장 테이블(private learning progress 등) migration 없음

**개선 — 설계에 최소 계약 초안을 추가:**

```text
POST /v1/learning/progress/merge
Authorization: Bearer
Idempotency-Key: UUIDv4
Body: {
  schemaVersion: "1",
  events: [{
    deviceEventId: UUIDv4,
    contentKey: string,
    contentRevision: string,
    completedAt: ISO-8601,
    // 금지: score, points, items, rank, reward
  }]
}
Response 200: { acceptedEventIds: UUIDv4[], rejected: [{ deviceEventId, code }] }
Errors: UNAUTHORIZED | EMAIL_UNVERIFIED | VALIDATION_FAILED | IDEMPOTENCY_CONFLICT
```

서버 검증 불변식:

- 허용 필드 allow-list 외 키 거절 (`additionalProperties: false`)
- `contentKey/revision`이 서버가 아는 published public content와 일치할 때만 완료 처리
- 동일 `(apiSubjectKey, deviceEventId)` 재전송은 no-op replay
- 점수·재화·아이템 키 존재 시 요청 전체 또는 해당 이벤트 거절 (설계에 선택 고정)

### 4.6 [P1] 이메일 미검증 / permanent-user gate의 판정 기준 부재

설계는 “이메일 검증 전 저장·재화·멀티플레이 잠금”, “anonymous claim 거절”을 말하지만, 서버가 무엇을 보는지 없다.

**개선 — exact gate matrix 추가:**

| 상태 | 로컬 학습(정책에 따름) | `/v1/me` | 경제·매치·소켓 |
|------|------------------------|----------|----------------|
| 게스트(로컬 only) | 허용/비허용(§4.4) | 401 | 401 |
| 세션 있음 + email provider + `email_confirmed_at == null` | 허용 가능 | 200 + `verificationRequired` 또는 403 정책 선택 | 403 `EMAIL_UNVERIFIED` |
| OAuth Google/Kakao (이메일 확인 정책은 Supabase provider 설정에 따름) | — | 200 | 허용 |
| JWT `is_anonymous == true` | — | 401/403 | 403 |
| JWT 만료/iss/aud 불일치 | — | 401 | 401 |

권고: **Supabase `getUser()` 또는 JWT claim의 확정 필드 목록**을 설계에 적고, 클라이언트 게이트와 서버 게이트가 같은 enum을 쓰게 한다. 클라이언트만 잠그고 서버가 열면 즉시 우회된다.

### 4.7 [P1] JWT 검증 방식과 `SUPABASE_SECRET_KEY` 사용 범위가 모호

설계 §5.2: JWKS로 signature/issuer/audience/expiry 검증.  
server env에는 `SUPABASE_SECRET_KEY`가 필수.

위험:

- 구현자가 편의상 secret으로 JWT HS 검증하거나 user admin API를 넓게 호출
- Haruclick에서 금지한 `listUsers()` 전체 조회가 secret allow-list에 다시 들어옴

**개선:**

1. 런타임 게임 API 인증: **JWKS(비대칭) 또는 공식 jwt 검증 라이브러리 + issuer/audience exact 매칭**만 허용.  
2. `SUPABASE_SECRET_KEY` allow-list를 설계에 표로 고정. 예:  
   - 계정 삭제(admin API)  
   - (필요 시) 강제 sign-out  
   - **금지:** listUsers 전체 스캔, 임시 비밀번호 발급, password sign-in 대행, 경제 write  
3. audience 값(`authenticated`), issuer URL 형식, clock skew 허용 초를 숫자로 명시.
4. Socket handshake와 REST가 **동일 verifier 모듈**을 쓰도록 packages 위치 제안 (예: 향후 `apps/server` 또는 `packages/auth`).

### 4.8 [P1] `apps/server` 공백 — 전달 단계 순서와 의존성

설계 §11은 모바일 client → JWT → profile 순이지만, 실제 저장소에는 서버 패키지가 없다.

**개선 — 단계 재배치 제안:**

1. Auth **contracts** (error codes, gate matrix, merge schema, env)  
2. **Server JWT verifier + subject resolve fake/conformance** (`apps/server` 최소 scaffold 또는 contracts 내 pure module)  
3. Mobile client + storage + PKCE  
4. Email / OAuth routes  
5. Bootstrap + RLS 검증  
6. Guest gate + merge  
7. Identity link/delete  
8. Local integration + redaction regression  
9. Provider console / device golden  

“화면 먼저”보다 **verifier + bootstrap 계약 먼저**가 이 레포의 Task 4(인증 wire) 문화와 맞다.

### 4.9 [P1] 로컬 Supabase Auth 설정 공백

`supabase/config.toml`:

```toml
[auth]
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = []
```

설계의 `spotlearn://auth/callback`이 allow-list에 없다.  
로컬 이메일 confirm/OAuth 시뮬이 바로 실패한다.

**개선:**

- design §7에 **config.toml 관리 항목** 추가:  
  `additional_redirect_urls`에 `spotlearn://auth/callback` (및 필요 시 debug variant)  
- site_url을 모바일 중심 개발에 맞게 문서화 (admin `127.0.0.1:3000`과 충돌 여부 정리)
- `tests/contracts/supabase-config.test.ts`를 schemas 검사뿐 아니라 **auth redirect allow-list 최소 집합**까지 확장하는 것을 계획에 포함
- 이메일 확인용 inbucket/`[local_smtp]` 사용 방법을 통합 테스트 절에 한 줄이라도 연결

### 4.10 [P1] nickname UPDATE 정책의 방어 깊이

migration:

- policy: self update allowed  
- grant: `UPDATE(nickname)` only  

PostgreSQL column grant로 다른 컬럼 업데이트는 막히지만, 설계는 “RLS만으로  sufficiency 가정 금지”를 스스로 말한다.  
그런데 nickname update path에 대한 **값 검증(길이, 금칙어, 연속 변경 rate limit, unique 여부)** 이 없다.

현재 CHECK는 `char_length(nickname) between 1 and 40` 정도.

**개선:**

- nickname 변경은 Data API 직접 update보다 **trusted REST `PATCH /v1/me`** 로 일원화하는 방안을 1차에서 검토 (감사·rate limit·금칙어에 유리)
- Data API를 유지한다면 update trigger로 `level/exp/gacha_points` 변경 시 거부하는 defense-in-depth를 테스트에 포함
- `rls.test.sql`의 “authenticated cannot update profiles table directly”는 **table-level privilege** 검사이며 column grant와 공존한다. 인증 작업 시 이 테스트 의미를 깨지 않도록 plan에 주의 문구 추가

### 4.11 [P1] 모바일 의존성·모듈 경계는 맞지만 패키지 목록이 없음

설계 모듈 분할(`auth/env|client|oauth|email|session|linking|gate`)은 좋다.  
그러나 `apps/mobile/package.json`에는 인증에 필요한 의존성이 없다.

**개선 — 허용 dependency allow-list를 설계/ plan에 명시:**

- `@supabase/supabase-js`
- `expo-secure-store` (또는 공식 권장 storage adapter)
- `expo-web-browser`, `expo-linking` (및 필요 시 `expo-auth-session`)
- **금지:** 임의 OAuth SDK가 provider token을 앱 로그에 남기는 경로, service role 클라이언트

화면이 SDK를 직접 부르지 않는다는 규칙은 ESLint boundary 테스트( admin의 client-secret-check와 유사)로 고정하는 것이 이 레포 스타일과 맞다.

### 4.12 [P1] Admin 인증과의 경계 미명시

`apps/admin`은 이미 **별도 cookie session + CSRF + origin** 모델이다.  
설계 제목이 “모바일 앱”이지만 구현 에이전트가 admin에도 같은 Supabase PKCE mobile flow를 붙일 위험이 있다.

**개선:** §13 비범위에 명시:

- Admin 콘솔 인증/세션은 본 설계 범위 밖이며 기존 cookie session 모델을 유지한다.
- Admin publishable key(`NEXT_PUBLIC_*`)와 mobile `EXPO_PUBLIC_*`를 혼용·공유 모듈로 합치지 않는다 (env parser도 이미 분리됨).

### 4.13 [P1] 계정 삭제·privacy 연계가 설계 한 줄에 그침

설계 §8·§12는 계정 삭제 entrypoint와 legal approval을 blocker로 둔다.  
기존 운영 문서(`docs/operations/database-role-provisioning.md`, quarantine 정책)는 **retention/legal basis 승인 전 외부 베타 금지**를 반복한다.

**개선:**

- 앱 내 “계정 삭제” 버튼 → 서버 job → `auth.users` 삭제 → mapping null → nickname/profile 제거 → quarantine 정책 적용 순서를 시퀀스 다이어그램 수준으로 추가
- **즉시 hard-delete vs 유예 기간** 선택 고정
- 삭제 중 진행 중인 매치/큐 티켓 처리(취소) 명시
- secret key 사용이 여기에만 국한됨을 §4.7 allow-list와 연결

### 4.14 [P2] Custom scheme deep link의 플랫폼 한계

`spotlearn://auth/callback`은 구현이 쉽지만:

- Android에서 scheme 하이재킹/다중 앱 충돌 가능성
- iOS universal links 대비 검증 약함

**개선:** 1차는 custom scheme 유지하되, production hardening 항목으로 **HTTPS app link / universal link 중간 콜백**을 후순위 blocker로 적는다.  
OAuth state/nonce + one-time code + PKCE로 위험을 완화한다는 현재 설계는 유지.

### 4.15 [P2] Apple Login / 스토어 정책

§3.1·§12의 Apple 4.8 blocker 유지는 옳다. 추가로:

- Google·Kakao가 “기본 로그인”이면 iOS에서 **Sign in with Apple 의무 가능성**이 높음 → iOS 출시 gate에 명시적 checkbox
- Play/App Store **계정 삭제 URL/인앱 경로** 요구와 §8 연결
- Kakao 비즈 앱/동의 항목/OIDC 활성화 리드타임이 Google보다 긴 경우가 많아 일정 blocker에 분리

### 4.16 [P2] Identity linking 세부

- “최소 2개 로그인 수단 남길 때만 unlink” 좋음 → **password identity 포함 여부**, 미검증 email identity 카운트 여부 명시
- 동일 이메일의 서로 다른 기존 계정 충돌 시 typed conflict — UI 카피와 지원 프로세스(수동 병합 비범위) 사용자 메시지 가이드 추가
- `linkIdentity` 전 reauth 방법을 provider별로 (recent login vs password reentry) 고정

### 4.17 [P2] 분석·로그 redaction과 기존 analytics 계약

`packages/contracts/src/analytics.ts`에 이미 JWT/email/uuid 형태 금지 패턴이 있다.  
설계 §9·§10.1 redaction 테스트는 **이 모듈을 확장/공유**한다고 쓰면 중복 구현을 막는다.  
callback URL 전체 로깅 금지는 Sentry breadcrumb beforeSend 필터 테스트로 연결.

### 4.18 [P2] 요구사항 추적성(REQ) 미연결

저장소는 `docs/requirements-registry.v1.json` + `tools/check-docs.mjs`로 규범 문장 추적을 강제한다.  
본 인증 설계는 아직 `01`~`13` 규범 문서/REQ ID에 연결되어 있지 않다.

**개선:**

- 구현 전 또는 직후 `06_CLIENT_ARCHITECTURE.md` / `09_API_AND_SOCKET_EVENTS.md` / 보안 절에 규범 문장 + `REQ: AUTH-xxx` 추가
- oracle/test 매핑 없이 “완료”를 선언하지 않음
- 기존 SEC-001(“Supabase access token으로 인증”)과 본 설계의 정합성을 traceability에 명시

### 4.19 [P2] `mobile-identity.v1.json` SSOT 빈약

현재 내용: `{ "appId": "com.touchcatch.mobile" }`  
scheme·callback path·bundle이 `app.json`에만 있다.

**개선:** identity config에 scheme, callback path, ios bundle, android package를 넣고, auth redirect unit test가 **이 SSOT만** 읽게 하면 app.json drift를 조기 차단한다.

---

## 5. 워크플로우·검증 관점 개선

### 5.1 기존 게이트에 어떻게 꽂을지

| 게이트 | 인증 작업이 추가해야 할 것 |
|--------|---------------------------|
| `pnpm test` / `pnpm check` | env allow-list, redirect/PKCE unit, gate matrix, analytics redaction, openapi merge path, mobile boundary(no secret, no direct supabase in screens) |
| `pnpm check:db` | profile+economy subject bootstrap idempotency, self RLS, nickname rules, deletion null mapping 회귀, (선택) email_verified 관련 DB는 최소 |
| `pnpm verify` | 위 둘 + 로컬 Supabase email 통합은 CI 비용에 따라 optional job으로 분리 가능 |
| 수동 golden | Google/Kakao/email 실기기 — 설계 §10.4 유지, CI 초록 ≠ production auth ready |

설계 §11 “각 단계 RED→GREEN→전체 회귀→읽기 전용 리뷰”는 좋지만, **어느 명령이 mandatory gate인지**를 단계마다 한 줄씩 적으면 에이전트 실행이 안정된다.

### 5.2 문서/계획 산출물 순서 권고

1. 본 검토의 P0를 반영해 **설계 개정(스펙 patch)**  
2. `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md` 형태의 실행 계획 (파일 경로·테스트 이름·커밋 단위)  
3. contracts 먼저 PR → server verifier PR → mobile auth PR → db bootstrap PR  
4. provider console handoff 체크리스트는 코드 PR과 분리된 operations 문서

### 5.3 기존 잔여 작업 설계와의 관계

`2026-07-16-remaining-work-design.md`의 Task 4(전송과 인증)는 REST/Socket subject mapping·handshake를 담당한다.  
본 Supabase Auth 설계는 그 **신원 공급자 레이어**다.

**충돌 방지 문구 권고:**

- Task 4 wire contract의 `authSubject`는 **검증된 JWT `sub`** 이며 wire/event에 넣지 않는다.
- 본 설계의 mobile login은 Task 4 gateway가 존재하기 전에도 client+fake verifier로 진행 가능하나, **production multipath는 bootstrap+api/economy subject가 닫힌 뒤에만** 연다.

---

## 6. 설계 문서 자체 품질 메모

| 항목 | 평가 |
|------|------|
| 목적·비범위·blocker 분리 | 우수 |
| Haruclick 채택/폐기 | 파일 단위로 추적 가능, 우수 |
| 아키텍처 다이어그램 | 방향 명확, 그러나 bootstrap/subject 박스 부족 |
| 데이터 흐름 | OAuth/email은 구체적, merge/delete는 추상적 |
| 완료 기준 §14 | 의도는 좋으나 P0 미결로 아직 미달 |
| 규범 REQ 연결 | 없음 — 저장소 문화와 단절 |
| 롤백/장애 모드 | code replay·session 만료는 있음. bootstrap 실패·부분 생성(profile만 존재) 복구 절차 부족 |

---

## 7. 권고 개정 체크리스트 (설계 패치용)

구현 전 설계 본문에 반영할 최소 목록:

- [ ] Bootstrap 경로를 **trusted server 단일 경로**로 확정 (trigger 비범위)
- [ ] Bootstrap atomic 대상: `profiles` + `economy_subjects` (+ api_subjects 시기)
- [ ] `/v1/me` points 권위 = economy subject, Data API points 비권위/철회 방침
- [ ] 기본 nickname 비-PII 규칙
- [ ] Production 게스트 학습 **허용 여부** 확정 (MVP-A 권고)
- [ ] `POST /v1/learning/progress/merge` OpenAPI-level 계약
- [ ] Email/OAuth/anonymous/guest **서버 게이트 행렬**
- [ ] JWT JWKS 검증 + `SUPABASE_SECRET_KEY` exact allow-list
- [ ] `supabase/config.toml` redirect allow-list 관리
- [ ] Admin 인증 비범위 명시
- [ ] 계정 삭제 시퀀스와 legal blocker 연결
- [ ] `pnpm check` / `check:db` 단계별 mandatory 명령
- [ ] (권고) AUTH REQ ID 및 규범 문서 연결 계획

---

## 8. 구현 시 주의할 회귀 포인트

1. **pgTAP function allow-list** (`rls.test.sql`의 app_server exact function set) — bootstrap/merge 함수를 private에 추가하면 테스트 배열을 함께 갱신해야 한다. 조용히 함수만 추가하면 CI가 실패하거나, 테스트를 느슨하게 바꾸면 보안 회귀가 된다.  
2. **economy deletion 테스트** — auth user 삭제 시 profile cascade와 subject null 불변식 유지.  
3. **env exact parse** — 새 키를 모바일/서버에 넣을 때 `env.test.ts`와 설계 §7.2를 동시에 수정.  
4. **OpenAPI exact path set** (`openapi.test.ts`) — merge 등 path 추가 시 exact set fixture 갱신.  
5. **학습 데모 production-boundary** — 게스트 정책을 바꾸면 이 테스트를 의도적으로 재설계해야 하며, “잠깐 가드 제거”는 금지.  
6. **analytics 금지 패턴** — 로그인 성공 이벤트에 email/user id를 넣지 말 것.

---

## 9. 최종 의견

이 설계는 Haruclick의 위험한 패턴을 의식적으로 배제하고, TouchCatch가 이미 쌓아 둔 **server-authoritative · private ledger · opaque subject · exact env allow-list** 철학과 같은 편에 서 있다. 그 점만으로도 채택 가치는 높다.

그러나 현재 코드베이스 기준으로 보면 인증은 “로그인 UI” 문제가 아니라 **계정 lifecycle(bootstrap–subject–verified gate–merge–delete)** 문제다. 설계가 그 lifecycle의 절반(로그인 흐름·PKCE·게스트 철학)은 잘 썼고, 나머지 절반(권위 데이터 생성, 이중 재화 필드, production 게스트 surface, merge contract, 서버 패키지 공백, secret allow-list)은 구현자 재량으로 남겨 두었다.

**내 의견:**  
P0를 반영한 스펙 개정 없이는 구현 에이전트가 서로 다른 bootstrap/points/게스트 해석을 만들 확률이 높다. 반대로 P0만 닫히면, 기존 `pnpm check`/`check:db` 문화 위에 단계적 PR로 안전하게 올라탈 수 있는 좋은 설계다.

---

## 10. 참고한 주요 경로

- 설계: `docs/superpowers/specs/2026-07-19-supabase-auth-integration-design.md`
- env: `packages/config/src/env.ts`
- OpenAPI: `packages/contracts/openapi.yaml`
- 모바일: `apps/mobile/app.json`, `apps/mobile/app/index.tsx`, `apps/mobile/package.json`
- DB: `supabase/migrations/202607150001_initial_schema.sql`, `202607150003_rls_and_integrity.sql`, `202607150004_economy_ledgers.sql`
- 테스트: `supabase/tests/database/rls.test.sql`, `economy.test.sql`, `tests/contracts/supabase-config.test.ts`
- 운영: `docs/operations/database-role-provisioning.md`
- 잔여 작업 구조: `docs/superpowers/specs/2026-07-16-remaining-work-design.md`
- 워크플로우: root `package.json` scripts (`check`, `check:db`, `verify`)
