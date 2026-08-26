# 개인정보처리방침

<!--
  This is the source of the published /privacy/ page. `tools/portal/build-account-portal.mjs`
  renders it into apps/account-portal/public/privacy/index.html and the gate checks the two
  have not drifted.

  `{{path}}` tokens resolve from docs/legal/operator-identity.v1.json. Never hard-code a value
  that belongs there — operator identity, contact, retention windows and the child-directed
  answer are human decisions, and an invented one is a false statement in a legal document.

  Every factual claim below must be checkable against code in this repository. When behaviour
  changes, this file changes in the same commit.
-->

**시행일자**: {{effectiveDate}} · **문서 버전**: {{documentVersion}}

{{operator.displayName}}(이하 "운영자")는 TouchCatch(이하 "서비스")를 제공하면서 아래와 같이
개인정보를 처리합니다.

## 1. 수집하는 개인정보

서비스는 계정을 만들어야 이용할 수 있고, 계정과 학습 기록 외에는 아무것도 수집하지 않습니다.

| 구분 | 항목 | 수집 시점 | 근거 |
| --- | --- | --- | --- |
| 계정 | 이메일 주소 | 회원가입 또는 소셜 로그인 시 | 계약 이행 (서비스 제공) |
| 계정 | 로그인 제공자 계정 식별자 (Google) | 소셜 로그인을 선택한 경우에만 | 계약 이행 |
| 프로필 | 닉네임 | 가입 시 서버가 `learner-` + 임의 문자열로 **자동 생성** | 계약 이행 |
| 학습 | 학습 세션 기록 — 어떤 문제를, 언제 시작해, 얼마나 걸려, 몇 개를 맞혔는지 | 학습을 플레이할 때 | 계약 이행 |
| 학습 | 화면을 누른 좌표와 그 판정 결과 | 학습을 플레이할 때 | 계약 이행 |

닉네임은 이용자가 입력하지 않습니다. 서버가 만들고, 계정 식별자와 겹치지 않도록 다시 뽑습니다.

## 2. 수집하지 않는 것

아래는 "동의를 받고 수집한다"가 아니라 **수집 경로 자체가 앱에 없다**는 뜻입니다.

- 광고 식별자, 광고 네트워크 SDK — 앱에 광고가 없습니다.
- 위치 정보, 연락처, 통화 기록, 사진·미디어, 파일 접근 — 릴리스 빌드가 해당 권한을 아예
  선언하지 않습니다. 요청하는 권한은 `INTERNET`과 `VIBRATE` 두 가지뿐입니다.
- 크래시 로그·사용 분석 — 앱에 분석·오류수집 SDK가 설치되어 있지 않습니다.
- 결제 정보 — 서비스에 결제가 없습니다.
- 이름, 생년월일, 전화번호, 주소.

## 3. 이용 목적

수집한 정보는 아래 목적으로만 씁니다. 다른 목적으로 쓰려면 이 방침을 먼저 고칩니다.

- 계정 식별과 로그인 유지
- 학습 진행 상황 저장 및 이어하기
- 서비스 오류 원인 확인

## 4. 처리위탁 및 국외 이전

{{processors}}

제3자에게 개인정보를 **판매하거나 광고 목적으로 제공하지 않습니다.**

## 5. 보유 기간과 파기

- 계정 정보와 학습 기록은 **계정이 유지되는 동안** 보관합니다.
- 계정 삭제를 요청하면 {{retention.accountDataAfterDeletionRequest}} 안에 파기합니다.
- 삭제 요청 자체의 기록(요청 시각, 처리 단계, 완료 여부)은
  {{retention.deletionReceiptMetadata}} 동안 남습니다. 삭제가 실제로 처리됐다는 증거이며,
  여기에는 이메일·닉네임·로그인 제공자 정보가 들어가지 않습니다.
- 백업본은 {{retention.backupPurgeWindow}} 안에 함께 파기됩니다.

## 6. 계정 삭제

앱 안에서 **[내 정보] → [계정 삭제]** 로 요청할 수 있고, 앱을 지운 뒤에도
[{{urls.absoluteAccountDeletion}}]({{urls.absoluteAccountDeletion}}) 에서 요청할 수 있습니다.

요청이 접수되면 **그 즉시 계정으로 아무것도 할 수 없게 됩니다.** 로그인 상태로 남아 있던
기기에서도 마찬가지입니다. 실제 데이터 파기는 그 뒤에 순서대로 진행됩니다.

1. 앱 데이터 파기 — 학습 기록, 진행도, 프로필
2. 인증 계정 삭제 — 이때 저장돼 있던 로그인 세션과 **Google 연결 기록이 함께 삭제됩니다**
3. 완료 기록

Google 계정으로 로그인하셨다면, 저희가 지우는 것은 **저희 쪽에 저장된 연결**입니다. Google이
자체적으로 보관하는 "이 앱에 로그인했다"는 기록은 Google의 방침을 따르며,
[Google 계정 설정](https://myaccount.google.com/permissions)에서 직접 해제하실 수 있습니다.

각 단계의 진행 상황은 요청할 때 기기에 저장되는 **삭제 접수증**으로 확인할 수 있습니다.
접수증은 기기에만 저장되며 서버는 그 해시만 가집니다 — 서버가 돌려줄 수 있는 값이 아니므로
로그나 오류 보고서에 남지 않습니다.

계정을 삭제해도 같은 이메일로 다시 가입할 수 있습니다. 새 계정이며 이전 기록은 복구되지
않습니다.

## 7. 이용자의 권리

열람, 정정, 삭제, 처리정지를 요청할 수 있습니다. 방법은
[{{urls.absoluteSupport}}]({{urls.absoluteSupport}}) 에 있습니다. 요청은
{{contact.responseTargetBusinessDays}}영업일 안에 답변합니다.

만 14세 미만 아동 관련: {{audience.childDirected}}

## 8. 안전조치

- 모든 통신은 HTTPS/TLS로 암호화합니다. 릴리스 빌드는 평문 HTTP 통신을 금지합니다
  (`usesCleartextTraffic=false`).
- 데이터베이스는 행 수준 보안(RLS)으로 접근을 제한하고, 서비스 서버는 정해진 함수만
  실행할 수 있는 계정으로 접속합니다.
- 로그인 세션은 기기 안에만 저장하며, **안드로이드 클라우드 백업 대상에서 제외**합니다
  (`allowBackup=false`). 기기를 바꿔도 세션이 따라가지 않습니다.
- 계정 삭제 요청 처리는 서비스 서버와 **분리된 자격 증명**을 쓰는 별도 작업자가 수행합니다.
  서비스 서버는 삭제를 접수하고 조회할 수만 있고, 실행할 권한이 없습니다.

## 9. 문의

- 개인정보 보호책임자: {{contact.privacyOfficerName}}
- 이메일: {{contact.supportEmail}}
- 주소: {{operator.address}}

## 10. 변경

이 방침을 바꾸면 시행일 최소 7일 전에 서비스 공지와 이 페이지에 알립니다. 수집 항목이
늘거나 이용 목적이 바뀌는 등 이용자에게 불리한 변경은 30일 전에 알립니다.
