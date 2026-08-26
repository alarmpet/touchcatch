# Google Play 출시 런북

무엇이 실제로 출시를 막고 있는지, 그리고 그 중 사람만 할 수 있는 것이 무엇인지 적는다.
작업 계획은 [2026-08-26 시정 계획](../superpowers/plans/2026-08-26-google-play-production-readiness-remediation-plan.md)이고,
이 문서는 그 계획 중 **달력이 걸린 항목**과 **저장소 밖에서 해야 하는 항목**만 추린 것이다.

## 달력이 가장 긴 항목부터

Play Console 개발자 계정이 없으면 나머지가 다 끝나도 출시할 수 없고, 계정을 만든 뒤에도
**최소 3주가 자동으로 지나가야 한다.** 코드 작업과 병렬로 오늘 시작하는 것이 맞다.

| 순서 | 항목 | 걸리는 시간 | 누가 |
| --- | --- | --- | --- |
| 1 | 개발자 계정 등록 ($25) + 신원 확인 | 최대 며칠 | 사람 |
| 2 | 앱 생성, 스토어 등록정보, Data safety, 콘텐츠 등급 | 반나절 | 사람 |
| 3 | 첫 AAB 업로드 → App Signing 인증서 발급 | 수십 분 | 사람 |
| 4 | **Closed testing 트랙에 테스터 12명, 연속 14일 opt-in** | **14일 (단축 불가)** | 사람 |
| 5 | Production access 신청 → 심사 | 보통 7일 이하 | Google |

4번이 핵심이다. 2023-11-13 이후에 만든 **개인** 개발자 계정은 production access를 신청하기
전에 closed testing에서 테스터 12명이 **연속 14일** opt-in 상태를 유지해야 한다.
**Internal testing 트랙은 이 14일에 하루도 산입되지 않는다.** 즉 최초 closed opt-in부터
공개 출시까지 실질 하한이 21일이다.

테스터 12명은 실제 Google 계정이어야 하고, 14일 동안 opt-in을 유지해야 한다. 중간에 빠지면
카운트가 리셋된다. **계정을 만드는 날 테스터부터 모으기 시작한다.**

## 사람만 할 수 있는 것

### 1. 업로드 키 만들기

에이전트가 대신 만들지 않는다. 이 키를 잃어버리면 같은 앱을 다시 올릴 수 없다.

```bash
keytool -genkeypair -v -keystore touchcatch-upload.jks -alias touchcatch-upload -keyalg RSA -keysize 2048 -validity 10000
```

- `-validity 10000` — Play는 2033-10-22 이후까지 유효한 인증서를 요구한다. 10000일이면 넉넉하다.
- 만들어진 `.jks`와 비밀번호는 **저장소 밖**에 둔다. `.gitignore`가 `*.jks`를 막고 있는지 확인한다.
- 비밀번호 관리자에 넣고, 별도 매체에 백업한다.

빌드는 환경변수로만 읽는다. 저장소나 `gradle.properties`에 적지 않는다.

```powershell
$env:KEYSTORE_PATH     = "C:\...\touchcatch-upload.jks"
$env:KEYSTORE_PASSWORD = "..."
$env:KEY_ALIAS         = "touchcatch-upload"
$env:KEY_PASSWORD      = "..."
```

넷 중 하나라도 없으면 gradle이 `Missing release signing inputs`로 **빌드를 거부한다.**
디버그 키로 조용히 폴백하지 않는다 — 2026-08-26에 그 폴백을 제거했다.

### 2. 법무 문서의 미결 값 채우기

```bash
pnpm portal:publishable    # 남은 항목을 이름으로 알려준다
```

값은 [`docs/legal/operator-identity.v1.json`](../legal/operator-identity.v1.json)에 넣는다.
채운 뒤 `pnpm portal:build`를 다시 돌린다.

| 항목 | 왜 사람이 정해야 하나 |
| --- | --- |
| `operator.displayName`, `legalName`, `address` | 개인정보처리방침 필수 기재사항 |
| `contact.supportEmail` | **실제로 수신되는 주소**여야 한다. Play 스토어 등록정보의 연락처이기도 하다 |
| `contact.privacyOfficerName` | 개인정보 보호책임자 |
| `audience.childDirected` | Target audience 선언, Families 정책 적용 여부, 만 14세 미만 규정이 여기서 갈린다 |
| `retention.*` | 보존 기간. 백업/PITR 설정과 함께 정해야 한다 |
| `processors.Supabase.regionStatus` | 프로덕션 프로젝트 리전. 국외 이전 고지가 여기 걸린다 |
| `urls.origin` | 포털을 Vercel에 올린 뒤의 실제 origin |
| `effectiveDate` | 시행일자 |

### 3. 포털 배포 (Vercel)

절차는 [`apps/account-portal/README.md`](../../apps/account-portal/README.md)에 있다. 배포 후
origin을 **두 곳**에 적는다.

1. `operator-identity.v1.json`의 `urls.origin` → `pnpm portal:build` 다시 실행
2. `apps/mobile/.env`의 `EXPO_PUBLIC_PORTAL_ORIGIN`

2번이 없으면 **릴리스 빌드가 부팅하지 않는다**(`MOBILE_PORTAL_ORIGIN_REQUIRED`). 앱 하단의
개인정보처리방침·이용약관이 갈 곳 없는 빌드를 올릴 수 없기 때문이고, 값이 있어야 그 두 줄이
실제로 열리는 링크가 된다. 개발 빌드는 비워도 되며 그때는 링크가 아닌 글자로 렌더된다 —
죽은 링크보다 낫다.

Play Console에는 이 두 주소를 넣는다.

- 개인정보처리방침: `<origin>/privacy/`
- 데이터 삭제: `<origin>/account-deletion/`

### 4. 프로덕션 백엔드

2026-08-26 현재 **클라우드 Supabase 프로젝트가 없다.** `supabase/.temp/project-ref`가 없고
`apps/mobile/.env`는 에뮬레이터 루프백(`10.0.2.2`)을 가리킨다. 즉 지금 만든 AAB를 설치하면
서버에 닿지 못한다.

필요한 것:

1. Supabase 클라우드 프로젝트 (리전을 정해야 개인정보처리방침의 국외 이전 고지가 써진다)
2. 마이그레이션 승격 — `supabase/migrations/*`
3. API 서버 호스팅 — `apps/server`
4. Google OAuth 클라이언트에 **릴리스 서명 인증서의 SHA-1** 등록
5. Supabase Auth의 redirect allow-list에 `touchcatch://auth/callback` 추가
6. 승인된 5개 ENGLISH 팩을 프로덕션 DB에 `PUBLISHED`로 올리고 casual season에 pin

6번이 빠지면 설치는 되지만 **학습이 시작되지 않는다** (fail-closed).

### 5. App Signing 지문 받기

첫 AAB를 업로드한 뒤 Play Console → Release → Setup → App signing에서 SHA-256을 복사해
`operator-identity.v1.json`의 `appLinks.sha256CertFingerprints`에 넣고 `pnpm portal:build`.
그전까지 `.well-known/assetlinks.json`은 생성되지 않으며, OAuth 콜백은 `touchcatch://`
커스텀 스킴을 쓴다.

## 저장소가 이미 보장하는 것

| 항목 | 확인 방법 |
| --- | --- |
| 서명 입력이 없으면 릴리스 빌드가 실패 | 환경변수 없이 `:app:bundleRelease` → `Missing release signing inputs` |
| 릴리스 매니페스트가 저장소·오버레이 권한을 제거 | `app/src/release/AndroidManifest.xml`의 `tools:node="remove"` |
| 개인정보처리방침·이용약관이 앱에서 열림 | `pnpm exec vitest run apps/mobile/src/auth/profile-legal-links.test.tsx` |
| target SDK 36 미만이면 릴리스 빌드 중단 | `tools/mobile/build-release-aab.ps1` preflight가 gradle에 직접 묻는다 |
| `allowBackup=false` | `app/src/main/AndroidManifest.xml` |
| 정답 키가 번들에 들어가지 않음 (소스) | `pnpm exec vitest run apps/mobile/src/learning-demo/production-boundary.test.ts` |
| 정답 키·`__DEV__`·루프백 origin이 **실제 AAB**에 없음 | `node tools/mobile/inspect-release-aab.mjs --aab <path>` |
| 공개 페이지가 `docs/legal` 원본과 일치 | `pnpm portal:check` (게이트 26단계 중 하나) |
| 삭제 요청이 접수되면 접근이 즉시 닫힘 | `pnpm check:db` (pgTAP `account-deletion-worker.test.sql`) |
| 처분표에 답이 없는 테이블이 생기면 실패 | `pnpm privacy:check` + `deletion-disposition-coverage.test.ts` |

## 아직 코드가 없는 것

| 항목 | 계획 |
| --- | --- |
| 프로덕션 rate limit | R3/R7 |
| 배포·복구·관측성 | R7 |
| 릴리스 CI와 증거 자동화 | R8 |
| SBOM, bundletool 검증, 의존성 lock | R6 잔여 |

계정 삭제 worker는 구현됐다. 다만 **`docs/legal/data-disposition.v1.json`이 `PROPOSED`인 동안
아무것도 지우지 않는다** — 승인이 유일하게 남은 스위치이고 사람이 눌러야 한다. 절차는
[`account-deletion-worker.md`](account-deletion-worker.md).

`pnpm portal:publishable`과 이 표가 비면 제출 가능한 상태다. 그전까지는 아니다.
