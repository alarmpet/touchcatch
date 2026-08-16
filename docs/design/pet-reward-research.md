# 펫 보상 루프 리서치와 적용 방침

작성일: 2026-08-13
상태: 리서치 기록 / 설계 참고용

## 1. 목적

펫 수집 루프를 더 트렌디하게 만들되, 이 제품이 **학생 대상 학습 앱**이라는 제약 안에서
어떤 가챠 관행을 채택하고 어떤 것을 의도적으로 배제할지 기준을 남긴다.

이 문서는 법률 자문이나 승인된 밸런스 사양이 아니다. `config/economy.v1.json`과
`config/daily-pet-loop.v1.json`이 여전히 유일한 권위 있는 수치이며, 여기의 어떤 제안도
승인 절차(`config/normative-numeric-approvals.v1.json`) 없이 반영되지 않는다.

## 2. 조사 대상

| 출처 | 확인한 것 |
| --- | --- |
| `alarmpet/randowm` (Ribbon Room) `gacha-implementation-guide.md` | 선결정 패턴, 크레딧 전환, 개봉 대기열, 암호학적 RNG |
| 2026 가챠 트렌드 (Gashapoint, Adjust, ScienceDirect) | 피티 투명성, 소프트/하드 피티, 스파크 교환, 중복 전환 |
| 틀린그림찾기·히든오브젝트 시장 (AppGamer, Playgama, AppsFlyer) | 장르 메커닉 정체, 하이브리드화, 리텐션 지표 |

## 3. 이미 갖추고 있던 것

- **선결정(pre-determination)**: 결과는 `private.claim_daily_free_draw_v1` 트랜잭션 안에서
  확정되고 영수증에 기록된다. 클라이언트가 앱을 강제 종료해도 결과를 무효화할 수 없다.
- **암호학적 RNG**: `private.secure_random_below_v1`을 사용한다. `Math.random()`을 쓰지 않는다.
- **확률 공개**: 등장 확률을 뽑기 화면에 그대로 노출한다.
- **하드 피티**: 유료 드로에 50회/150회 상한이 있다 (`pitySemantics.thresholds`).

## 4. 채택한 것

### 4.1 개봉 연출 분리 (Ribbon Room 패턴)
결정과 표시를 분리해 기대감을 만든다. 서버가 이미 확정한 결과를 순차적으로 보여줄 뿐이므로
공정성에는 영향이 없다. `src/features/pets/reveal-model.ts`와 `PetReveal.tsx`.

### 4.2 등급별 수집 진행도
`rarityProgress` 5단계를 컬렉션 화면에 노출한다. 아트가 없는 등급(고급·영웅)은
"0% 미수집"으로 보이면 실패처럼 읽히므로 행 자체를 숨긴다.

### 4.3 승급까지 남은 개수
중복이 죽은 자원으로 보이지 않게 "승급까지 N개"를 카드에 표시한다.
보유 수량과 여유분(대표·잠금 제외)을 모두 반영해 계산한다.

### 4.4 첫 획득의 격상
등급이 낮아도 도감에 처음 들어온 펫은 축하 강도를 올린다. 희귀도만으로 감정을 배분하면
일반 등급을 모으는 대다수 세션이 매번 실패처럼 느껴진다.

## 5. 의도적으로 배제한 것

이식하지 않기로 한 과금 게임 장치들이다.

> **전제 정정.** 이 문서의 초판은 배제 근거를 "아동 대상 학습 앱"에 두었으나, 이 게임의
> 대상은 남녀노소 구분 없는 일반 이용자다. 연령 보호를 근거로 든 항목은 아래에서 실제로
> 성립하는 근거(`ECON-012` 현금 결제 부재, 일일 1회 무료 루프)로 교체했다. 연령을 이유로
> 남는 항목은 없다.

| 배제 항목 | 이유 |
| --- | --- |
| 소프트 피티(확정 직전 확률 급상승) | 연속 시도를 유도하는 설계다. 뽑기가 하루 1회뿐이라 걸릴 대상 자체가 없다. |
| 한정 배너 / 기간 한정 FOMO | 재미가 아니라 마감이 접속 이유가 된다. 이탈 후 복귀 비용만 키운다. |
| 근접 실패(near-miss) 연출 | "거의 나올 뻔했다"는 착시는 도박 UI의 핵심 기법이다. 대상 연령과 무관하게 쓰지 않는다. |
| 재구매 압박 루프 | `ECON-012`가 현금 결제 없는 플레이 보상형만 허용한다. 압박할 결제 자체가 없다. |
| 크레딧 환급 → 재뽑기 순환 | Ribbon Room에서는 실물 커머스 리텐션 장치였다. 여기서는 승급 체인이 같은 역할을 한다. |

크레딧 전환 자체는 "중복이 버려지지 않는다"는 좋은 성질이 있다. 다만 우리 맥락에서는
이미 **승급 체인**이 같은 역할을 하고 있으므로 별도 재화를 추가하지 않는다.

## 6. 후속 검토 후보

승인 절차가 필요해 이번에 반영하지 않은 것들이다.

- **확정 교환권(스파크)**: 일정 횟수 누적 시 원하는 펫을 확정 교환. 운 의존도를 낮추는
  가장 건전한 장치이지만 새 경제 재화이므로 `ECON-*` 승인이 선행되어야 한다.
- **일일 루프 피티**: 현재 일일 무료 드로는 피티를 쓰지 않는다(`usesDirectDrawPity: false`).
  연속 학습 일수와 연동한 상위 등급 보장을 검토할 수 있다.
- **고급·영웅 아트 도입**: 두 등급은 정책상 열려 있으나 도감이 비어 있어 해결 규칙으로
  우회 중이다. 아트가 승인되면 해결 규칙은 자동으로 무효화된다.

## 7. 참고 출처

- Ribbon Room 가챠 구현 가이드: <https://github.com/alarmpet/randowm/blob/main/gacha-implementation-guide.md>
- 피티 시스템 정리: <https://gashapoint.com/gacha-games/pity-systems-explained/>
- 가챠 메커닉 개요: <https://www.adjust.com/blog/gacha-mechanics-for-mobile-games-explained/>
- 가챠 수익화의 행동경제학: <https://www.sciencedirect.com/science/article/abs/pii/S1875952125001247>
- 히든오브젝트 장르 동향: <https://www.appgamer.com/new-and-updated-hidden-object-games-for-june-2026-ios-and>
- 앱 수익화·리텐션 지표: <https://www.appsflyer.com/resources/reports/app-marketing-monetization-report/>
