# account-portal

Google Play가 요구하는 두 개의 공개 URL — 개인정보처리방침과 계정·데이터 삭제 안내 — 를
서비스하는 정적 사이트다. 앱을 설치하지 않은 사람, 로그인하지 않은 사람도 열 수 있어야 한다는
것이 요건이므로 인증도 서버 로직도 없다.

## 이 디렉터리는 손으로 고치지 않는다

`public/` 아래는 전부 생성물이다. 원본은 `docs/legal/`에 있다.

| 페이지 | 원본 |
| --- | --- |
| `/` | 생성기 안의 index 템플릿 |
| `/privacy/` | [`docs/legal/privacy-policy.md`](../../docs/legal/privacy-policy.md) |
| `/terms/` | [`docs/legal/terms-of-service.md`](../../docs/legal/terms-of-service.md) |
| `/account-deletion/` | [`docs/legal/account-deletion-notice.md`](../../docs/legal/account-deletion-notice.md) |
| `/support/` | [`docs/legal/support.md`](../../docs/legal/support.md) |
| `{{token}}` 값 | [`docs/legal/operator-identity.v1.json`](../../docs/legal/operator-identity.v1.json) |

```bash
pnpm portal:build          # 다시 생성
pnpm portal:check          # 원본과 어긋났으면 실패 (pnpm check 26단계 중 하나)
pnpm portal:publishable    # 사람이 정할 값이 남아 있으면 실패 (배포 전 검사)
```

`portal:check`는 게이트가 돌리고, `portal:publishable`은 **배포 직전에만** 돌린다. 미결
항목이 남아 있어도 저장소는 초록으로 유지하되, 그 상태로는 배포되지 않게 나누어 둔 것이다.

## 미결 항목

`pnpm portal:publishable`이 남은 항목을 이름으로 알려준다. 사업자·연락처·보존 기간·아동 대상
여부는 **사람이 정하는 값이며 에이전트가 추정해 채우지 않는다.** 미결 상태에서는 페이지에
`[미정: …]`이 노란 배경으로 그대로 렌더된다 — 빈칸으로 두면 "생각하지 않았다"로 읽히고,
눈에 띄는 표시는 "아직 안 끝났다"로 읽힌다. 후자가 사실이다.

## Vercel 배포

저장소를 Vercel에 연결하고 프로젝트 설정을 이렇게 둔다.

| 항목 | 값 |
| --- | --- |
| Root Directory | `apps/account-portal` |
| Framework Preset | Other |
| Build Command | (비움) |
| Output Directory | `public` |
| Install Command | (비움) |

`vercel.json`이 보안 헤더와 `trailingSlash`를 고정한다. 빌드 단계가 없으므로 Vercel은
`public/`을 그대로 서빙한다.

배포한 뒤 **origin을 `docs/legal/operator-identity.v1.json`의 `urls.origin`에 적고
`pnpm portal:build`를 다시 돌린다.** 페이지 안의 상호 링크가 절대 URL이라 그 값이 있어야
Play Console에 넣을 주소가 완성된다.

## assetlinks.json

`.well-known/assetlinks.json`은 `operator-identity.v1.json`의
`appLinks.sha256CertFingerprints`가 비어 있는 동안 **생성되지 않는다.** 지문 없는
assetlinks는 App Links를 미검증으로 두는 게 아니라 "이 호스트를 소유한 앱이 없다"고 적극적으로
답하는 파일이라, 아예 없는 것보다 나쁘다.

지문은 Play App Signing이 소유하므로 Play Console에 앱을 만들고 번들을 한 번 올린 뒤
**Release → Setup → App signing**에서 SHA-256을 복사해 채운다. 그전까지 OAuth 콜백은
`touchcatch://` 커스텀 스킴을 쓴다.
