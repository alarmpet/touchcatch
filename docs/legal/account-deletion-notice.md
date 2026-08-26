# 계정 및 데이터 삭제 요청

<!--
  Source of the published /account-deletion/ page. This is the URL Google Play requires under
  "Data deletion" in the App content section: it must be reachable without installing the app
  and without signing in.

  Every step described here must match apps/server/src/privacy and
  supabase/migrations/202608260002_account_deletion_requests.sql. If the workflow changes, this
  page changes in the same commit.
-->

**서비스**: TouchCatch (`com.touchcatch.mobile`) · **운영자**: {{operator.displayName}}

이 페이지는 앱을 설치하지 않고도, 로그인하지 않고도 계정 삭제를 요청하는 방법을 안내합니다.

## 방법 1 — 앱에서 (권장)

1. TouchCatch 앱을 엽니다.
2. **[내 정보] → [계정 삭제]** 를 누릅니다.
3. 안내에 따라 다시 한 번 로그인해 본인을 확인합니다.
4. 삭제를 확정합니다.

확정하는 즉시 계정으로는 아무것도 할 수 없게 됩니다. 화면에 **삭제 접수증**이 표시되며,
기기에 저장됩니다. 이 접수증으로 진행 상황을 확인할 수 있습니다.

## 방법 2 — 이메일로

앱을 이미 지웠거나 로그인할 수 없다면 아래로 요청하십시오.

- 받는 곳: **{{contact.supportEmail}}**
- 제목: `계정 삭제 요청`
- 내용: 가입에 사용한 **이메일 주소**와 **로그인 방법**(이메일 / Google)

본인 확인을 위해 회신으로 추가 확인을 요청할 수 있습니다. 확인이 끝나면
{{contact.responseTargetBusinessDays}}영업일 안에 접수하고, 처리 결과를 회신합니다.

주민등록번호, 신분증 사본 등 추가 개인정보는 요구하지 않습니다.

## 삭제되는 것

| 대상 | 결과 |
| --- | --- |
| 계정(이메일, 로그인 제공자 연결) | 삭제 |
| 닉네임 | 삭제 |
| 학습 기록 — 세션, 시도, 누른 좌표, 진행도 | 삭제 |
| 저장된 로그인 세션 | 삭제 |

Google 계정으로 로그인하셨다면 저희 쪽에 저장된 연결이 인증 계정과 함께 지워집니다. Google이
자체적으로 보관하는 기록은 [Google 계정 설정](https://myaccount.google.com/permissions)에서
직접 해제하실 수 있습니다.

## 남는 것

| 대상 | 보관 기간 | 이유 |
| --- | --- | --- |
| 삭제 요청 기록 (요청 시각, 처리 단계, 완료 여부) | {{retention.deletionReceiptMetadata}} | 삭제가 실제로 처리됐다는 증거. 이메일·닉네임·로그인 제공자 정보는 들어가지 않습니다. |
| 백업본에 포함된 사본 | {{retention.backupPurgeWindow}} | 백업 주기가 지나면 함께 파기됩니다. |

## 처리 순서와 걸리는 시간

요청 접수는 즉시입니다. 실제 파기는 아래 순서로 진행됩니다.

1. **접근 차단** — 접수와 동시에. 로그인 상태로 남아 있던 기기에서도 즉시 막힙니다.
2. **앱 데이터 파기** — 학습 기록, 진행도, 프로필
3. **인증 계정 삭제** — 세션과 Google 연결 기록이 함께 삭제됩니다
4. **완료 기록**

전체 완료까지 {{retention.accountDataAfterDeletionRequest}}가 걸립니다.

## 진행 상황 확인

앱에서 요청했다면 기기에 저장된 **삭제 접수증**으로 확인합니다. 접수증은 기기에만 저장되며,
서버는 그 해시만 가지고 있어 다시 발급할 수 없습니다. 접수증을 잃어버렸다면
{{contact.supportEmail}} 로 문의하십시오.

## 다시 가입할 수 있나요

가능합니다. 같은 이메일로 다시 가입할 수 있으며, 새 계정으로 시작합니다. 삭제된 기록은
복구되지 않습니다.

## 문의

- 이메일: {{contact.supportEmail}}
- 개인정보 보호책임자: {{contact.privacyOfficerName}}
- 개인정보처리방침: [{{urls.absolutePrivacy}}]({{urls.absolutePrivacy}})
