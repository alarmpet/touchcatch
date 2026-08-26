# Google 로그인 — 무엇이 막고 있었나

**작성 2026-08-16, 같은 날 해결.** 처음에는 진행 중인 조사 기록이었고, 지금은 원인과
해결의 전말이다. 소셜 로그인을 다시 건드리는 사람이 같은 데서 헤매지 않도록 남긴다.

---

## 한 줄 요약

**Google 로그인 된다.** 원인은 클라이언트가 PKCE가 아니라 암묵적 흐름으로 돌고 있던
것이었고, `flowType: 'pkce'` 한 줄로 끝났다. 2026-08-16 에뮬레이터에서 왕복 확인.
성공 후 콜백 화면에 갇히던 것도 같은 날 고쳤다. **이 흐름에서 남은 작업은 없다.**

---

## 어디까지 됐나

| 단계 | 상태 |
|---|---|
| Google 콘솔 OAuth 클라이언트 (`TouchCatch Supabase`) | 완료 |
| 리디렉션 URI `http://127.0.0.1:55321/auth/v1/callback` | 등록됨 |
| `supabase/config.toml`의 `[auth.external.google] enabled = true` | 완료 |
| `/auth/v1/authorize?provider=google` → 302 accounts.google.com | 확인됨 |
| Google 로그인 + 동의 | 성공 |
| Google → Supabase 콜백 | 성공 |
| **GoTrue가 사용자 생성 (`petblo12@gmail.com`)** | **성공** |
| `flowType: 'pkce'` 설정 | 수정 완료 (2026-08-16) |
| 앱이 세션 획득 | **성공 (2026-08-16)** |

**혼동하기 쉬운 지점:** 사용자 레코드는 GoTrue가 Google 콜백을 처리할 때 만들어진다.
앱이 PKCE 코드를 교환하기 *전*이다. 그래서 "계정이 있다"는 것이 "로그인이 됐다"는 뜻이
아니다.

---

## 반드시 알아야 할 두 가지

### 1. `adb reverse tcp:55321 tcp:55321`이 필수다

Google은 `http://` 리디렉션 URI를 `localhost`/`127.0.0.1`에만 허용한다. 사설 IP인
`10.0.2.2`는 거부한다. 그런데 에뮬레이터 안에서 `127.0.0.1`은 에뮬레이터 자신이다.

역방향 터널이 없으면 콜백이 `ERR_CONNECTION_REFUSED`로 죽는다. 에뮬레이터를 다시 띄울
때마다 걸어야 한다:

```
adb reverse tcp:55321 tcp:55321
adb reverse tcp:18787 tcp:18787
adb reverse tcp:8081  tcp:8081
```

### 2. 시크릿은 사용자 셸에만 있다

`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET`은 사용자가 연 PowerShell 창의
환경변수다. 에이전트가 띄우는 프로세스에는 없다. 따라서 **`supabase start`는 그 창에서
사람이 실행해야** 프로바이더가 켜진 채로 뜬다.

다운로드된 `client_secret_*.json`은 `.gitignore`로 차단해 뒀다. 저장소 밖으로 옮기는 것이
더 낫다.

---

## 원인 — 찾았다 (2026-08-16 추가)

**`supabase-client.ts`가 `flowType`을 설정하지 않았다.** supabase-js의 기본값은 `'pkce'`가
아니라 **`'implicit'`**이다 (`@supabase/auth-js` v2.112.3 `GoTrueClient.js:24`).

그래서 이런 일이 벌어진다:

1. `_getUrlForProvider`는 `flowType === 'pkce'`일 때만 `code_challenge`를 붙인다
   (`GoTrueClient.js:4771`). 우리 authorize URL에는 그게 없었다.
2. `code_challenge`가 없으니 GoTrue는 암묵적 흐름으로 처리하고, 마지막 리디렉션을
   `touchcatch://auth/callback#access_token=...` 형태의 **프래그먼트**로 돌려준다.
   `?code=`가 아니다.
3. 코디네이터의 `callbackCode()`는 `url.hash !== ''`에서 `OAUTH_CALLBACK_FRAGMENT_FORBIDDEN`을
   던진다 (`oauth-coordinator.ts:36`).
4. 사용자 레코드는 이미 Google 콜백 처리 시점에 만들어져 있다. 그래서 "계정은 있는데
   로그인은 안 되는" 정확히 그 증상이 된다.

즉 이전 문서가 지목한 `OAUTH_SESSION_EXISTS`(105행)는 범인이 아니었다. 실패는 브라우저가
**돌아온 뒤에** 일어나지, 열리기 전이 아니다.

### 적용한 수정

`apps/mobile/src/auth/supabase-client.ts`의 클라이언트 옵션에 `flowType: 'pkce'`를 추가했다.
조용한 기본값이라 다시 사라질 수 있으므로 `supabase-client.test.ts`가 그 옵션을 고정한다.
**그 단언을 지우지 말 것** — 지우면 옵션이 사라져도 아무도 모른다.

### 기기 검증 완료 (2026-08-16)

에뮬레이터에서 왕복 성공. **내 정보 → Google로 계속 → `SIGNED IN petblo12@gmail.com`.**
콜백 화면이 "로그인이 완료됐어요."를 띄웠고(= `READY`, `ACCOUNT_SETUP_FAILED` 아님),
logcat에 `OAUTH_*` 에러도 JS 에러도 없다. 동의 화면은 에뮬레이터 브라우저에 이미 구글
세션이 있어 건너뛰었다.

`flowType: 'pkce'` 한 줄이 전부였다. 추가 수정은 필요 없었다.

### 콜백 화면 막다른 길 — 고침 (2026-08-16)

`/auth/callback`이 성공 문구를 띄운 뒤 그대로 멈춰 있었다. 탭 바가 없는 화면이라 하드웨어
뒤로가기 말고는 빠져나올 방법이 없었다.

`completeOAuth`가 `READY`를 주면 `router.replace('/profile')`로 넘긴다. `push`가 아니라
`replace`인 이유는, 뒤로가기가 **이미 코드를 써버린 콜백**으로 되돌아가면 안 되기 때문이다.
실패 경로(`ACCOUNT_SETUP_FAILED`, 예외)는 그대로 남겨 둔다 — 사용자가 메시지를 읽어야 한다.

기기 확인: 로그아웃 → Google로 계속 → 콜백 카드 없이 곧장 내 정보(`SIGNED IN`)로 착지,
뒤로가기를 눌러도 콜백으로 돌아가지 않는다. logcat 깨끗함.

`oauth-callback-route.test.tsx`에 3개 케이스로 고정했다(성공 시 `/profile`로 `replace`,
실패 두 갈래는 이동 없음).

---

## 이 과정에서 고친 실제 버그 (되돌리지 말 것)

`app/auth/callback.tsx`에 딥링크 경쟁 조건이 있었다. `Linking.getInitialURL()`은 앱을
*실행시킨* URL만 돌려주는데, 이 앱은 콜백이 올 때 항상 이미 실행 중이다 — 브라우저를 띄운
게 자기 자신이니까. `url` 이벤트는 화면이 마운트되기 전에 발생한다. 결국 양쪽 다 놓친다.

라우터 파라미터를 폴백으로 넣고, `LOADING` 상태에서 성급히 실패 처리하던 것을 고쳤다.
재구성한 URL이 코디네이터의 "파라미터는 `code` 하나뿐" 규칙을 우회하지 않도록 그 검증을
라우트에서 그대로 수행한다. `oauth-callback-route.test.tsx`에 4개 케이스로 고정해 뒀다.

---

## 곁다리로 발견한 것

- **앱에 회원가입이 없었다.** `signUp`이 코드베이스에 아예 없었다. 포트·컨트롤러·화면 세
  층에 추가했다 (`sign-up.test.tsx`). 확인 메일이 켜진 프로젝트에서는 세션 없이 성공하므로
  `CONFIRM_EMAIL`을 따로 반환한다 — 조용히 로그아웃 상태로 두면 실패로 읽힌다.
- **OAuth 동의 화면 앱 이름이 `minsim`이다.** 로그인 화면에 "to continue to minsim"으로
  뜬다. 출시 전에 Google 콘솔에서 바꿔야 한다.
- 로컬 Supabase의 기존 계정 4개는 전부 자동화 테스트 찌꺼기이고 비밀번호를 아무도 모른다.

---

## 지금 당장 로그인이 필요하면

OAuth를 기다릴 필요 없다. **내 정보 → 가입하기** 탭으로 이메일 계정을 만들면 된다.
로컬 Supabase는 `enable_signup = true`다. 확인 메일이 걸리면 Studio(`:55323`)에서
Auto Confirm으로 처리한다.
