# Google Play 데이터 보안(Data Safety) 선언 명세서

이 문서는 Play Console의 **App content → Data safety** 양식에 그대로 옮겨 적을 답을 담는다.
양식은 사람이 채우지만, 답의 근거는 전부 이 저장소 안에 있어야 한다.

> 이전 판은 "충돌 로그(진단)"을 수집한다고 적고 있었다. **사실이 아니다** —
> `apps/mobile/package.json`에 분석·오류수집 SDK가 없다. Data safety의 오답은 정책 위반이며,
> 앱이 실제로 하지 않는 수집을 신고하는 쪽도 마찬가지다. 답을 바꿀 때는 근거 파일을 함께 적는다.

## 1. 데이터 수집 및 공유

| 양식 항목 | 답 | 근거 |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** | 계정 생성이 필수다 |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | 릴리스 매니페스트 `usesCleartextTraffic=false`; 모든 엔드포인트가 HTTPS |
| Do you provide a way for users to request that their data be deleted? | **Yes** | 앱 내 [내 정보]→[계정 삭제], 그리고 공개 URL |

## 2. 데이터 유형별 선언

수집(collected) = 앱이 기기 밖으로 보낸다. 공유(shared) = 제3자에게 넘긴다.

| 카테고리 | 유형 | 수집 | 공유 | 필수 | 목적 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| Personal info | Email address | 예 | 아니오 | 필수 | Account management | Supabase Auth 가입 |
| Personal info | User IDs | 예 | 아니오 | 필수 | Account management | 로그인 제공자 계정 식별자, 서버 `subject_key` |
| Personal info | Name | 아니오 | — | — | — | 닉네임은 서버가 `learner-…`로 자동 생성하며 이용자가 입력하지 않는다 |
| App activity | Other in-app actions | 예 | 아니오 | 필수 | App functionality | 학습 세션·시도·탭 좌표·정답 판정 (`private.learning_attempts`, `learning_attempt_taps`) |
| App info and performance | Crash logs | **아니오** | — | — | — | 크래시 리포팅 SDK 없음 |
| App info and performance | Diagnostics | **아니오** | — | — | — | 분석 SDK 없음 |
| Device or other IDs | Device or other IDs | 아니오 | — | — | — | 광고 식별자 미사용, 관련 권한·SDK 없음 |
| Location | 전체 | 아니오 | — | — | — | 위치 권한을 선언하지 않는다 |
| Financial info | 전체 | 아니오 | — | — | — | 결제 없음 |
| Photos and videos / Files | 전체 | 아니오 | — | — | — | 릴리스 매니페스트가 저장소 권한을 `tools:node="remove"`로 제거한다 |
| Contacts / Messages / Calendar | 전체 | 아니오 | — | — | — | 해당 권한·API 미사용 |
| Health and fitness | 전체 | 아니오 | — | — | — | 해당 없음 |

## 3. 보안 관행

| 양식 항목 | 답 | 근거 |
| --- | --- | --- |
| Data is encrypted in transit | 예 | HTTPS 전용 |
| Users can request that data be deleted | 예 | 공개 삭제 URL + 앱 내 삭제 |
| You follow the Families policy | 아래 참조 | `docs/legal/operator-identity.v1.json`의 `audience.childDirected` — **미결정** |
| Independent security review | 아니오 | 수행하지 않았다 |

## 4. 미결 항목

아래는 사람이 정하기 전에는 양식을 제출할 수 없다. 값은
`docs/legal/operator-identity.v1.json`에 채운다.

| 항목 | 왜 사람이 정해야 하나 |
| --- | --- |
| `audience.childDirected` | Target audience 선언과 Families 정책 적용 여부, 국내 만 14세 미만 규정이 여기서 갈린다 |
| `retention.accountDataAfterDeletionRequest` | Data safety의 삭제 안내와 개인정보처리방침이 같은 값을 말해야 한다 |
| `processors[Supabase].regionStatus` | 프로덕션 프로젝트 리전이 정해져야 국외 이전 고지를 쓸 수 있다 |
| `contact.supportEmail` | 실제 수신되는 주소여야 한다. 검증 전에는 `supportEmailVerified=false` |
| `urls.origin` | 공개 개인정보처리방침·삭제 URL의 호스트 |

## 5. 이번 베타에서 꺼져 있는 기능

펫 수집, 랭킹 보상, 실시간 대전은 릴리스 빌드에서 정책상 비활성(`DISABLED`)이다. 관련
테이블이 스키마에 있어도 **이 빌드는 그 데이터를 만들지 않는다.** 기능을 켜면 이 문서의 2절과
개인정보처리방침 1절을 같은 커밋에서 갱신한다.
