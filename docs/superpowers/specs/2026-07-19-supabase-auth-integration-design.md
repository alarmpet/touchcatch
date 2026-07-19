# TouchCatch Supabase 인증 통합 설계

## 1. 목적

TouchCatch 모바일 앱에 Supabase Auth 기반 Google, Kakao, 이메일 인증을 도입한다. 사용자는 로그인 없이 로컬 학습 게임을 체험할 수 있지만, 진행 저장·재화·인벤토리·멀티플레이는 영구 계정 로그인 후에만 사용할 수 있다.

인증 도입이 기존 보안 경계를 약화시키면 안 된다. 모바일은 인증과 제한된 자기 데이터 접근만 담당하고, 점수·보상·가챠·융합·매치 결과 같은 권위 쓰기는 기존 trusted server와 제한된 PostgreSQL role/function 경로만 사용한다.

## 2. 조사 범위와 근거

### 2.1 비교 저장소

2026-07-19 기준 `alarmpet/haruclick`의 `master` 브랜치에서 다음 자료를 읽기 전용으로 조사했다.

- `README_OAUTH.md`
- `README_SUPABASE.md`
- `app.json`
- `package.json`
- `services/authService.ts`
- `services/supabase-modules/client.ts`
- `services/supabase.ts`
- `app/login-callback.tsx`
- `app/auth/login.tsx`
- `app/auth/signup.tsx`
- `supabase/functions/naver-auth/index.ts`
- `SUPABASE_SCHEMA.sql`

### 2.2 공식 자료

- [Supabase React Native Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase Expo React Native quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
- [Supabase native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Kakao login](https://supabase.com/docs/guides/auth/social-login/auth-kakao)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Kakao Login REST API](https://developers.kakao.com/docs/en/kakaologin/rest-api)
- [Kakao Login prerequisites](https://developers.kakao.com/docs/en/kakaologin/prerequisite)
- [Apple App Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/)

## 3. 결정 사항

### 3.1 인증 범위

- 1차 공급자는 Google, Kakao, 이메일/비밀번호다.
- Naver와 Apple은 1차 구현 범위에서 제외한다.
- iOS 출시 전 Apple App Review 4.8 적용 여부를 법무·출시 검토한다. Google/Kakao가 기본 계정 인증 수단이면 Apple 로그인 추가가 필요할 가능성을 출시 blocker로 유지한다.
- 전화번호 로그인, magic link, SAML, MFA는 1차 범위가 아니다.

### 3.2 게스트 정책

- 게스트는 Supabase anonymous user를 생성하지 않는다.
- 게스트 상태는 기기 로컬의 비식별 임시 식별자와 로컬 진행 기록만 사용한다.
- 게스트는 튜토리얼과 로컬 학습 게임을 플레이할 수 있다.
- 서버 저장, 재화, 인벤토리, 랭킹, 친구방, 매치메이킹 진입 시 로그인을 요구한다.
- 로그인 후 로컬 학습 진행은 서버의 병합 API에 제출한다. 서버는 콘텐츠 ID·revision·완료 사실 같은 허용 필드만 검증하고, 재화·보상·점수는 로컬 기록에서 생성하지 않는다.

Supabase anonymous user는 `authenticated` PostgreSQL role을 사용하고 별도 `is_anonymous` claim 정책이 필요하다. 현재 TouchCatch RLS와 경제 권한 모델을 불필요하게 넓히므로 사용하지 않는다.

### 3.3 계정 연결 정책

- 공급자 이메일이 같다는 이유만으로 애플리케이션 로직에서 계정을 병합하지 않는다.
- 로그인된 사용자가 설정 화면에서 재인증한 후 `linkIdentity()`를 호출하는 명시적 연결만 제공한다.
- 연결 해제는 최소 두 개의 로그인 수단이 남을 때만 허용한다.
- 이메일 계정에 OAuth를 연결하거나 OAuth 계정에 비밀번호를 추가할 때 이메일 검증 완료를 요구한다.
- 충돌 시 자동 데이터 이동을 하지 않고 typed conflict 상태를 반환한다. 운영자 수동 병합은 1차 범위에서 제외한다.

## 4. Haruclick 채택·폐기 판단

### 4.1 채택하는 개념

- Expo Router의 전용 로그인 및 callback route
- 앱 scheme과 Supabase redirect allow-list를 일치시키는 방식
- `@supabase/supabase-js` 단일 클라이언트와 네이티브 영속 세션 저장
- Google/Kakao를 Supabase Auth provider로 통합하는 방식
- 이메일 가입, 이메일 확인, 로그인, 로그아웃, 재전송 UX
- 앱 foreground/background에 맞춘 access-token 자동 갱신 제어
- 환경변수에는 URL과 publishable key만 노출하는 원칙

### 4.2 폐기하거나 교체하는 구현

- URL fragment에서 access token과 refresh token을 직접 추출하지 않는다.
- implicit flow 후 `setSession()`으로 토큰을 주입하지 않는다.
- callback은 authorization code를 검증하고 `exchangeCodeForSession(code)`를 사용하는 PKCE 흐름으로 교체한다.
- 환경변수가 없을 때 placeholder URL/key로 클라이언트를 만들지 않는다. 인증 route 진입 전에 fail closed 상태를 표시한다.
- OAuth provider와 redirect URL에 `any`를 사용하지 않는다.
- 서비스 role key는 모바일 번들, 로그, analytics, callback URL에 절대 포함하지 않는다.
- `SUPABASE_SCHEMA.sql`처럼 기존 스키마를 삭제하고 다시 만드는 방식은 사용하지 않는다. 모든 DB 변경은 timestamp migration과 rollback/restore 계획으로 관리한다.
- public/demo RLS 정책을 복사하지 않는다.
- Haruclick Naver 함수의 `listUsers()` 전체 조회, 임시 비밀번호 생성·재설정, service-role 기반 password sign-in 방식은 금지한다.

## 5. 목표 아키텍처

```text
Google / Kakao / Email
          |
          v
  Supabase Auth (PKCE)
          |
          | access token
          v
TouchCatch Mobile --------------------+
  | safe self RLS reads/updates       |
  |                                   | Bearer token
  v                                   v
Supabase Data API              TouchCatch API/Socket
  | profiles self only                 |
  |                                    | verify JWT + map subject
  +-----------------------------+      v
                                | trusted server transaction
                                v
                     PostgreSQL app_server functions
```

### 5.1 모바일 인증 모듈

모바일에 다음 경계를 둔다.

- `auth/env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, redirect scheme을 검증한다.
- `auth/client`: Supabase client를 한 번만 만들고 세션 저장, auto refresh, lock을 구성한다.
- `auth/oauth`: Google/Kakao PKCE 시작, 브라우저 세션, redirect code 추출, code exchange를 담당한다.
- `auth/email`: signup, password login, verification resend, password reset 요청을 담당한다.
- `auth/session`: 초기 세션 복원, `onAuthStateChange`, foreground refresh, logout을 담당한다.
- `auth/linking`: identities 조회, 재인증, 연결·해제를 담당한다.
- `auth/gate`: 게스트 허용 기능과 영구 계정 필수 기능을 구분한다.

화면은 인증 SDK를 직접 호출하지 않고 이 모듈의 typed operation만 사용한다.

### 5.2 서버 인증 어댑터

- REST와 Socket handshake가 Supabase access token을 받는다.
- 서버는 Supabase JWKS를 이용해 JWT signature, issuer, audience, expiry를 검증한다.
- 검증 실패, 만료, 잘못된 issuer/audience, anonymous claim은 게임·경제 endpoint에서 fail closed한다.
- auth UUID를 경제·게임 receipt, telemetry, public response에 직접 저장하지 않는다. 기존 random subject mapping을 사용한다.
- 서버 DB 연결은 `SUPABASE_SECRET_KEY`가 아니라 제한된 `DATABASE_URL`과 `app_server` role/function을 사용한다.
- secret key는 필요한 auth administration capability에만 별도 allow-list로 사용하며 일반 게임 write에는 사용하지 않는다.

### 5.3 DB와 RLS

기존 `public.profiles.id`를 `auth.users.id`와 일치시키는 lifecycle을 migration으로 명확히 한다. 신규 auth user에 대한 profile 생성은 다음 중 하나의 검증된 단일 경로만 사용한다.

1. 안전한 Auth hook/trigger, 또는
2. 로그인 직후 trusted server의 idempotent bootstrap operation.

구현 계획에서는 현재 migration과 로컬 Supabase 버전에서 더 검증 가능한 경로를 선택한다. 두 경로를 동시에 활성화하지 않는다.

클라이언트 권한은 다음으로 제한한다.

- 자기 profile safe columns SELECT
- 자기 nickname 같은 허용 column UPDATE
- 공개 pet catalogue SELECT

클라이언트가 직접 수행할 수 없는 항목:

- score, level, exp, gacha points 변경
- pet copies, selected/locked 상태의 권위 변경
- reward, gacha, fusion ledger 쓰기
- match result 또는 winner 변경
- private schema 접근

RLS는 row 제한만으로 충분하다고 가정하지 않고 column grant, exact RPC grant, function owner/search path 검사를 함께 유지한다.

## 6. 인증 데이터 흐름

### 6.1 Google/Kakao 로그인

1. 앱이 고정된 provider와 `spotlearn://auth/callback` redirect를 선택한다.
2. Supabase client가 PKCE verifier/challenge와 OAuth state를 생성한다.
3. 시스템 브라우저 또는 Expo WebBrowser에서 공급자 동의 화면을 연다.
4. 공급자는 Supabase의 `https://<project-ref>.supabase.co/auth/v1/callback`으로 authorization code를 전달한다.
5. Supabase는 등록된 앱 redirect로 code를 전달한다.
6. 앱은 scheme, route, state, error를 검증하고 code만 `exchangeCodeForSession()`에 전달한다.
7. 세션이 생성되면 `getUser()`/검증된 session event로 계정 상태를 갱신한다.
8. API 호출은 Bearer access token을 사용한다. refresh token은 앱 저장소 밖으로 전송하지 않는다.

### 6.2 이메일 가입

1. 앱은 이메일 형식과 최소 비밀번호 정책을 검증하되 서버 오류를 구체적인 계정 존재 정보로 바꾸지 않는다.
2. `signUp()`은 `spotlearn://auth/callback?flow=signup`을 사용한다.
3. 이메일 검증 전에는 저장·재화·멀티플레이를 잠근다.
4. callback code exchange 후 verified user를 확인하고 profile bootstrap을 한 번 수행한다.
5. resend와 password reset은 rate limit 및 일반화된 성공 메시지를 사용해 사용자 열거를 막는다.

### 6.3 게스트 진행 병합

1. 로컬 기록은 schema version, content key/revision, completed timestamp, device-local event ID를 가진다.
2. 로그인 후 서버에 idempotency key와 함께 제출한다.
3. 서버는 허용 필드, 콘텐츠 revision, 중복 event ID를 검증한다.
4. 학습 완료·해금처럼 비경제적 진행만 합친다.
5. 점수·통화·아이템·랭킹은 병합 입력에서 거절한다.
6. 성공 receipt를 받은 후에만 로컬 pending 상태를 제거한다.

## 7. Redirect와 환경 구성

### 7.1 앱 식별자

- Expo scheme: 기존 `spotlearn`
- callback route: `/auth/callback`
- native redirect: `spotlearn://auth/callback`
- Android package: 기존 `com.touchcatch.mobile`
- iOS bundle identifier: 기존 `com.touchcatch.mobile`

Expo Go의 `exp://` 주소는 포트·LAN IP가 바뀌므로 운영 redirect로 등록하지 않는다. OAuth 실기기 검증은 development build와 고정 scheme을 사용한다. Web은 별도의 HTTPS callback origin을 사용하고 native callback과 혼합하지 않는다.

### 7.2 공개 환경변수

모바일:

```text
EXPO_PUBLIC_API_ORIGIN
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

서버:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
DATABASE_URL
```

- 모바일에 secret/service-role key 또는 `DATABASE_URL`을 두지 않는다.
- 개발은 로컬 Supabase status가 반환하는 API URL과 publishable/anon 호환 키를 사용한다.
- Android 실기기에서 `127.0.0.1`은 휴대폰 자신이므로 LAN-reachable API origin 또는 로컬 tunnel/development host 전략이 필요하다.
- 운영 환경은 loopback URL을 거절하는 기존 config gate를 유지한다.
- `.env`와 provider client secret은 커밋하지 않는다.

### 7.3 공급자 콘솔

Google과 Kakao 콘솔에는 앱 custom scheme가 아니라 Supabase callback URL을 등록한다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Supabase Auth redirect allow-list에는 환경별 앱 callback을 등록한다. Kakao는 Kakao Login과 OIDC를 활성화하고 REST API key/client secret을 Supabase provider 설정에만 저장한다.

## 8. UX와 오류 처리

- 로그인 선택 화면은 Google, Kakao, 이메일, 게스트 계속하기를 제공한다.
- 저장 기능 진입 시 현재 작업을 보존한 상태로 auth gate를 표시한다.
- 취소는 게스트 화면으로 안전하게 돌아간다.
- provider 오류, 사용자 취소, 네트워크 오류, callback mismatch, code 재사용, session 만료를 서로 다른 내부 code로 분류하되 사용자 메시지에는 secret·token·계정 존재 여부를 노출하지 않는다.
- OAuth callback은 한 번만 완료되며 중복 deep link는 저장된 nonce/state와 completion fence로 무시한다.
- offline 상태에서 기존 세션이 있어도 access token을 검증할 수 없는 권위 operation은 대기 또는 재로그인을 요구한다.
- 로그아웃은 로컬 Supabase 세션과 auth-scoped cache를 지운다. 게스트 콘텐츠 asset cache는 유지할 수 있다.
- 계정 삭제는 앱 안에서 시작할 수 있어야 하며 auth user 삭제, subject mapping 비식별화, 개인 데이터 삭제/quarantine 정책과 연결한다.

## 9. 보안 및 개인정보 기준

- access token, refresh token, provider token, authorization code, PKCE verifier, email을 로그·analytics·Sentry breadcrumb에 기록하지 않는다.
- callback URL 전체를 로깅하지 않는다.
- state/nonce 검증 실패는 generic auth failure와 비식별 reason code만 남긴다.
- 세션 저장소는 플랫폼 보안 저장소 또는 Supabase 공식 Expo 권장 저장 어댑터를 사용한다.
- Web localStorage와 native storage 전략을 분리한다.
- provider profile에서 필요한 최소 필드만 사용하며 이름·avatar의 DB 저장은 별도 개인정보 목적/보존 승인을 요구한다.
- secret key는 provider dashboard/Supabase secret store/배포 secret manager 밖으로 이동하지 않는다.
- 계정 삭제와 retention 정책 승인 전 production rollout을 막는다.

## 10. 테스트 전략

### 10.1 단위·계약 테스트

- 환경변수 exact allow-list와 public/secret 경계
- provider exact union: `google | kakao`
- redirect scheme/route/state 검증
- callback code extraction과 fragment token 거절
- code exchange success, cancel, provider error, replay, timeout
- session restore, refresh, expiry, logout, auth-scoped cache purge
- guest/authenticated/permanent-user gate matrix
- identity link/unlink 최소 identity 규칙
- analytics/log redaction

### 10.2 DB·RLS 테스트

- auth user/profile 1:1 bootstrap idempotency
- authenticated self profile read와 nickname column update
- 다른 profile read/update 거절
- anonymous claim의 경제·멀티플레이 operation 거절
- authenticated/service_role의 direct economy/game DML 거절
- account deletion 후 subject mapping 비식별화와 개인 데이터 처리
- 기존 pgTAP privilege/function allow-list 회귀

### 10.3 통합 테스트

- 로컬 Supabase 이메일 가입·확인·로그인·로그아웃
- local callback PKCE exchange
- Bearer JWT로 `/v1/me` 성공
- 만료·위조·잘못된 issuer/audience JWT 거절
- Socket handshake 성공/실패와 reconnect refresh
- 게스트 진행 병합 idempotency 및 경제 필드 거절

### 10.4 외부 수동 gate

- Google 실제 계정 Android/iOS development build golden
- Kakao 실제 계정 Android/iOS development build golden
- 이메일 delivery, verify, reset golden
- provider consent 화면과 privacy disclosure 검토
- 계정 연결·해제·삭제 실기기 검증
- App Store/Play Console redirect·package/bundle 설정 검토
- 운영 Supabase provider secrets와 redirect allow-list의 2인 승인

실제 provider credential이 없는 테스트는 deterministic fake를 사용하며 production 성공을 주장하지 않는다.

## 11. 단계별 전달 범위

1. Auth contracts와 fail-closed 환경 구성
2. Supabase client, storage, lifecycle
3. Email signup/login/verification/reset
4. Google/Kakao PKCE와 callback route
5. Guest gate와 진행 병합 contract
6. API/Socket JWT verification과 subject mapping
7. Profile bootstrap 및 RLS/DB 검증
8. Identity linking/unlinking과 account deletion entrypoint
9. Local integration, redaction, regression gates
10. Provider console handoff 및 physical-device acceptance

각 단계는 RED 테스트, 최소 구현, focused GREEN, 전체 회귀, 읽기 전용 리뷰 순서로 진행한다.

## 12. 승인 및 외부 blocker

코드 완료와 production 인증 준비를 분리한다. 다음 항목은 외부 증거 없이는 완료로 승격하지 않는다.

- Google OAuth client ID/secret 및 consent-screen 승인
- Kakao REST API key/client secret, Login/OIDC 활성화, consent 설정
- 운영 Supabase project URL/publishable key와 provider 설정
- 운영 DB login/TLS/pooler/rotation
- HTTPS Web callback origin
- iOS Apple Login 요구사항 결정
- 개인정보 처리방침, 계정 삭제, retention/legal approval
- 실제 Android/iOS development build golden

## 13. 비범위

- Haruclick 데이터나 사용자 계정 이전
- Haruclick Supabase project의 secret·schema 복사
- Naver 로그인
- Apple 로그인 구현
- MFA, phone auth, SSO
- 운영 계정 자동 병합 또는 관리자 수동 병합 도구
- provider access token을 이용한 Google/Kakao 부가 API 호출

## 14. 설계 완료 기준

- Haruclick에서 채택·폐기할 항목이 파일 단위로 추적된다.
- 모바일, Data API, trusted server, DB role의 권한 경계가 모호하지 않다.
- Google/Kakao/이메일과 게스트 전환 흐름이 정의된다.
- PKCE, deep link, identity linking, 삭제·redaction 정책과 검증 항목이 정의된다.
- 실제 credential과 실기기 증거가 외부 blocker로 남는다.
- 구현 에이전트가 추가 정책 결정을 임의로 만들지 않고 상세 계획을 작성할 수 있다.
