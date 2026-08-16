# 단어 숨은그림찾기(Word Hunt) 확장 계획서

작성일: 2026-08-13
상태: 계획 초안 / 승인 전
관련 문서: `01_GAME_DESIGN_OVERVIEW.md`, `02_CORE_RULES_AND_BALANCE.md`, `10_CONTENT_AND_IMAGE_PIPELINE.md`

---

## 0. 한 줄 요약

"제시어 `Sun` → 그림 속 태양을 터치" 메커닉은 **이미 엔진과 계약에 구현되어 있다.**
빠진 것은 (1) 모바일 UI 노출, (2) 실제 어휘 콘텐츠, (3) 혼자 즐길 수 있는 단독 모드 세 가지다.
새로 만드는 게 아니라 **잠들어 있는 자산을 깨우는 작업**이다.

---

## 1. 이미 있는 것 (재사용 자산)

코드를 직접 확인한 결과다. 추정이 아니다.

| 자산 | 위치 | 상태 |
| --- | --- | --- |
| 콘텐츠 스키마 `wordHunts` | `packages/contracts/src/content.ts:256` | 팩당 정확히 3개 필수, `missionId` / `kind(NORMAL·SPECIAL)` / `publicPrompt(1~120자)` / `hitboxes(imageA·imageB 정규화 원)` |
| 엔진 스케줄러 | `packages/game-engine/src/reducer.ts:69` | `START_WORD_HUNT` / `END_WORD_HUNT` 타이머를 매치 시작 시 예약 |
| 탭 판정 | `reducer.ts:59-60` | 미션 활성 중에는 미션 히트박스가 차이점보다 **우선** 판정 |
| 보상 | `config/ruleset.v1.json` | NORMAL +10점, SPECIAL +15점, 성공 시 힌트 크레딧 +1, 최종 도전 잠금 해제 |
| 안티치트 | `reducer.ts:58` | `wordHuntRevealMs` 1200ms 입력 잠금, 초당 8탭 레이트 리밋 |
| 공개 스냅샷 | `packages/contracts/src/socket.ts:25` | `mission: { id, kind, publicPrompt, startedAtMs, endsAtMs } \| null` 로 클라이언트에 전달됨 |
| 소켓 이벤트 | `socket.ts:12` | `word_hunt_started` / `word_hunt_won` / `word_hunt_ended` |
| 힌트 종류 | `content.ts:47` | `VISUAL_REGION` 힌트가 이미 정의됨 (5분면 또는 정확한 원) |

**결론**: 서버 로직·계약·안티치트·점수·힌트가 전부 완성돼 있다.

## 2. 빠져 있는 것 (실제 갭)

### 2.1 모바일이 미션을 화면에 안 그린다 — 치명적
`apps/mobile/src/ui/BattleScreen.tsx`와 `battle-shell.ts` 어디에도 `mission`이나 `publicPrompt`
참조가 없다. 서버가 제시어를 보내는데 **클라이언트가 버리고 있다.** 플레이어는 5초 동안
왜 점수를 못 얻는지 알 수 없다.

### 2.2 콘텐츠가 플레이스홀더다
`content/fixtures/valid/en-intermediate.json`의 실제 값:
```
publicPrompt: "word prompt 1" / "word prompt 2" / "word prompt 3"
hitboxes: { cx: 0.1, cy: 0.66, r: 0.03 }
```
어휘가 아니라 더미 문자열이고, 히트박스는 일정 간격으로 찍힌 좌표다.

### 2.3 단독 모드가 없다
현재 혼자 플레이 가능한 건 `LearningDemoScreen`(개발 전용)뿐이고 여기엔 단어 사냥이 전혀 없다.
1:1 대전은 아직 매칭이 `PLANNED` 상태(`RULE-013`)라 실제로 돌지 않는다.

### 2.4 터치 타깃이 규격 미달 — 접근성 위험
히트박스 `r: 0.03`은 이미지 폭의 3%다. 기준 뷰포트 390pt에서 좌우 패딩 16pt를 빼면
보드 폭이 358pt이므로 **지름 21.5pt**다. iOS 44pt·Android 48dp 권장치의 절반에 못 미친다.
연구 기준으로 24×24 타깃의 탭 오류율은 15%, 44×44는 3%다.
스키마는 `r`의 상한만 0.25로 두고 **하한이 사실상 없다**(`exclusiveMinimum: 0`).

측정 결과 — `pnpm content:tapsize` 실행 시 현재 픽스처 3팩에서 **위반 42건**이 나온다.
차이점·단어사냥·서든데스 히트박스가 전부 `r: 0.03`이다.

### 2.5 보드가 정사각형인데 원본이 3:2다 — 좌표 어긋남
`LearningDemoScreen`의 보드는 `width: '100%', aspectRatio: 1`로 렌더링되고
이미지는 `resizeMode="contain"`이다. 원본이 1:1이 아니면 레터박싱이 생겨
정규화 좌표가 실제 오브젝트 위치와 어긋난다.
`ko-idiom-turn-misfortune`(1536×1024)이 여기 해당한다.

---

## 3. 학습 설계 근거

### 3.1 이 메커닉이 왜 좋은가
이중부호화 이론(Dual Coding Theory)은 인지가 언어 부호와 심상 부호라는 두 독립 경로로
처리되며, 둘을 결합하면 부호화와 인출이 강화된다고 본다. 그림은 단어보다 기억하기 쉽고
(Clark & Paivio, 1991), 심상은 단순 반복보다 어휘 회상을 개선한다(Pressley, 1977).

**"단어를 읽고 → 그림에서 지시대상을 찾는" 행위는 언어 부호와 심상 부호를 학습자가
직접 연결하게 만든다.** 객관식 뜻 고르기보다 인출 강도가 높다.

### 3.2 주의할 것 — 인지 부하
멀티모달 입력이 항상 이득은 아니다. 하위 수준 학습자는 시각·언어 정보를 동시에 처리하느라
인지 자원을 더 쓰게 되어 오히려 성적이 떨어질 수 있다.

설계 반영:
- 제시어는 **한 번에 하나만** 띄운다 (현행 `activeMission` 단수 구조가 이미 이를 강제)
- 제시어 표시 후 1200ms 입력 잠금은 "읽을 시간"으로 기능한다 — 이미 있는 규칙을 학습 근거로 재해석
- 화면에 뜻·발음·힌트를 동시에 쏟아붓지 않는다. 실패 후에만 단계적으로 연다

---

## 4. 제안하는 확장

### 4.1 Phase 1 — 잠든 자산 깨우기 (계약 변경 없음)

**A. 미션 배너 UI**
`BattleScreen`에 `snapshot.mission`을 읽는 배너를 추가한다.
- 1200ms 잠금 구간: 제시어를 크게 보여주고 카운트다운 링 표시, 입력 비활성 표기
- 5초 구간: 남은 시간 바 + 제시어 유지
- 성공/실패: `word_hunt_won` / `word_hunt_ended` 반영

**B. 단독 학습 모드에 단어 사냥 추가**
`LearningDemoScreen`에 동일 규칙의 싱글 루프를 넣는다. 대전 매칭 없이도
"제시어 → 터치" 경험을 검증할 수 있고, 교실 모드(`RULE-017`)의 기반이 된다.

**C. 히트박스 최소 크기 가드**
콘텐츠 검증기에 규칙을 추가한다: 기준 뷰포트 390×844에서 히트박스 지름이
**44pt 미만이면 반려**. 390pt 폭 기준 `r >= 0.059`에 해당한다.
이건 스키마 변경이 아니라 검증기 규칙이라 승인 부담이 작다.

### 4.2 Phase 2 — 실제 어휘 콘텐츠

제시어를 더미에서 실제 어휘로 교체한다. 콘텐츠 팩당 3개이므로 난이도 곡선을 이렇게 잡는다:

| 순서 | 시점 | 종류 | 어휘 성격 | 예시 |
| --- | --- | --- | --- | --- |
| 1 | 16~22초 | NORMAL | 구체 명사, 시각적으로 명확 | `Sun`, `Tree`, `Door` |
| 2 | 34~42초 | NORMAL | 구체 명사, 주변 사물과 혼동 가능 | `Roof`(벽·창문과 인접) |
| 3 | 60초 | SPECIAL | 속성·관계어 또는 상위어 | `Round`, `Shadow`, `Tallest` |

3번을 추상어로 두는 이유: 파이널 러시 시점의 SPECIAL은 +15점으로 가장 비싸고,
이 시점에는 이미 그림을 충분히 관찰한 상태라 관계 추론이 가능하다.

**오답 유인(distractor) 설계 원칙**
- 같은 그림 안에 의미적으로 가까운 오브젝트를 최소 1개 배치한다 (`Sun` ↔ `Moon`, `Cup` ↔ `Bowl`)
- 오답 터치는 감점하지 않는다. 현행 엔진은 미스 탭에 점수 페널티가 없고, 학습 맥락에서
  추측 시도를 벌하면 탐색 행동이 위축된다. **이 설계를 유지한다.**

### 4.3 Phase 3 — 검토 후보 (승인 필요)

| 후보 | 설명 | 필요 승인 |
| --- | --- | --- |
| 오답 후 단계적 힌트 | 실패 시 `VISUAL_REGION` 힌트로 5분면 좁혀주기 | 힌트 정책 |
| 어휘 복습 큐 | 틀린 단어를 다음 세션 제시어에 우선 배치 | 새 진행 상태 저장소 |
| 음성 제시 | 제시어 TTS 병행 (이중부호화 강화) | 오디오 자산 권리 |
| 역방향 모드 | 그림 오브젝트를 먼저 터치 → 단어 4지선다 | 새 커맨드 타입 |

---

## 5. 콘텐츠 파이프라인 영향

`10_CONTENT_AND_IMAGE_PIPELINE.md`의 기존 흐름을 그대로 쓴다. 추가되는 것은
**어휘–좌표 매핑 저작 단계**뿐이다.

1. 이미지 생성/승인 (기존)
2. 차이점 10개 좌표 지정 (기존)
3. **단어 사냥 3개: 어휘 선정 + 좌표 지정 + 최소 크기 검증** ← 신규
4. 최종 단어·뜻·힌트 사다리 (기존)
5. 권리 검토 → 승인 (기존)

기존 자산 재활용 가능성: 현재 승인된 참조 이미지 4장(`docs/design/ui-reference/raw/`)은
`CONCEPT_ONLY` / `REVIEW_REQUIRED` 상태라 런타임 콘텐츠로 쓸 수 없다.
단어 사냥용 이미지는 새 파이프라인을 타야 한다.

---

## 6. 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 히트박스가 작아 오탭 다발 | 학습 좌절, 접근성 위반 | Phase 1-C 검증기 가드로 차단 |
| 그림에 지시대상이 모호 | 정답인데 못 찾음 | 저작 시 "5초 안에 찾을 수 있는가" 셀프 테스트 필수 |
| 추상어 SPECIAL이 너무 어려움 | 3번째 미션 성공률 급락 | 초기에는 구체 명사로 시작, 성공률 데이터 확인 후 도입 |
| 인지 부하 초과 | 하위 학습자 성적 하락 | 동시 제시 1개 유지, 힌트는 실패 후에만 |
| 대전 모드 미구현 | Phase 1-A를 실제로 못 써봄 | Phase 1-B 단독 모드를 먼저 만들어 검증 |

---

## 6.5 진행 상황 (2026-08-13)

| 항목 | 상태 | 내용 |
| --- | --- | --- |
| 1-B 단독 모드 | **완료** | `controller.ts`에 word hunt 상태머신 추가, `LearningDemoScreen`에 제시어 배너. 실제 규칙(`wordHuntRevealMs` 1200ms 읽기 잠금 → `wordHuntMs` 5000ms 창)을 `config/ruleset.v1.json`에서 읽어 매치와 동일한 타이밍으로 동작 |
| 실제 어휘(파일럿) | **완료** | 정사각형 원본 2팩에 손으로 좌표 지정. 정원 장면 `Wheelbarrow`/`Watering can`/`Sunflower`(SPECIAL), 광학 교실 `프리즘`/`거울`/`무지개`(SPECIAL). 전부 `r >= 0.06`으로 44pt 확보 |
| 1-C 검증기 가드 | **부분 완료** | `tools/content/check-hitbox-tap-size.mjs` + `pnpm content:tapsize`. 현재는 리포트 전용(`--strict`로 실패 전환). `pnpm check` 체인에는 아직 미연결 |
| 보드 종횡비 | **완료** | `LearningDemoEntry.aspectRatio`(기본 1)를 보드에 반영. 3:2 팩도 레터박싱 없이 좌표가 맞는다 |
| 3:2 팩 어휘 | **완료** | 미술 전시회 장면에 `우산`/`사다리`/`트로피`(SPECIAL) 추가 |
| 1-A 대전 배너 | **완료** | `BattleScreen`이 `snapshot.mission`을 읽어 배너를 그린다. 읽기 유예 구간에는 "Get ready", 이후에는 남은 초를 센다 |

**매칭 없이도 검증했다.** `BattleScreen`은 스냅샷을 prop으로 받으므로 미션이 담긴
픽스처를 만들어 렌더 테스트로 확인할 수 있다. 매칭은 실제로 *플레이*하는 데 필요할 뿐,
컴포넌트 검증에는 필요 없었다. 앞선 판단이 지나치게 비관적이었다.

읽기 유예 판정은 `serverNowMs < mission.startedAtMs + ruleset.time.wordHuntRevealMs`로
계산한다. 엔진이 이 구간의 탭을 `INPUT_LOCKED`로 거절하므로, 배너가 이때 터치를
재촉하면 안 된다.

종횡비를 데이터로 받는 이유: `Image.resolveAssetSource`는 RN 런타임 API라 테스트에서
모킹된 환경에서는 쓸 수 없다. 저작 시점에 원본 크기를 알고 있으므로 명시하는 편이
결정적이고 검증 가능하다.

**`content:tapsize`를 차단 게이트로 승격하려면** 픽스처 3팩의 히트박스 반지름을
`0.03 → 0.062` 이상으로 올려야 하고, 그러면 `privateSolutionHash`가 바뀌면서
콘텐츠 해시 체인 전체를 재생성해야 한다. 별도 마이그레이션으로 다뤄야 할 작업이다.

**2.5의 레터박싱 문제는 해결됐다.** 보드가 원본 종횡비를 따르므로 3:2 팩에도
좌표를 정확히 찍을 수 있고, 실제로 세 번째 팩에 어휘를 추가했다.

## 6.6 에뮬레이터 실측에서만 드러난 것 (2026-08-13)

Android 에뮬레이터(`SpotLearn_x86_64`)에 debug APK를 올려 실제로 플레이하면서 확인했다.
**아래 세 가지는 vitest 렌더 테스트로는 원리상 잡을 수 없었다.** `react-test-renderer`는
가상 트리만 만들고 창 인셋도 실제 크기도 없기 때문이다.

| 문제 | 증상 | 조치 |
| --- | --- | --- |
| safe area 미적용 | 상태바가 모든 화면의 첫 줄 텍스트를 덮음 | `app/_layout.tsx`에서 `SafeAreaView`로 `Slot`을 감쌈 |
| 두 그림이 한 화면에 안 들어옴 | 아래 그림이 잘려 스크롤해야 보임. **틀린그림찾기의 핵심인 비교가 불가능** | 보드 영역 높이를 재서 `min(폭, (높이-간격)/2 × 종횡비)`로 두 판을 맞춤. 스크롤 비활성화 |
| 카테고리 선택이 묻힘 | 영어·속담·사자성어 칩이 게임 화면 맨 아래에 있어 진입 후에야 보임 | 홈에 "골라서 시작" 행 추가, `?category=` 파라미터로 진입 |

실측으로 확인한 정상 동작: 제시어 배너 표시 → 읽기 유예("잠시 후 시작해요") → 5초 창 →
미해결 시 타임아웃, 정답 터치 시 초록 링 `+1`, 오답 시 빨강 링, 차이점 3개 달성 시 미션 발동.

## 7. 권장 순서

1. **1-B 단독 모드** — 계약 변경 0, 즉시 플레이 검증 가능. 여기부터 시작한다.
2. **1-C 검증기 가드** — 잘못된 콘텐츠가 들어오기 전에 막는다.
3. **2 실제 어휘 콘텐츠** — 팩 1개로 파일럿.
4. **1-A 대전 배너** — 매칭이 살아날 때 함께.
5. **3 후보** — 파일럿 데이터 확인 후 선별.

---

## 8. 참고 출처

- 이중부호화 이론 개관: <https://www.structural-learning.com/post/dual-coding-a-teachers-guide>
- 어휘 학습에 대한 이중부호화 관점: <https://www.researchgate.net/publication/238317055_A_Dual_Coding_View_of_Vocabulary_Learning>
- 멀티모달 입력과 인지 부하: <https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.834706/full>
- 이중부호화·멀티미디어 학습 이론 리뷰: <https://pdfs.semanticscholar.org/a682/dc062194158c60e4c7f87a86f7e511ef3b6c.pdf>
- WCAG 2.5.8 터치 타깃 최소 크기: <https://silktide.com/accessibility-guide/the-wcag-standard/2-5/input-modalities/2-5-8-target-size-minimum/>
- 터치 타깃 오류율 연구: <https://www.siteimprove.com/blog/motor-impairments-and-mobile-ui-the-touch-target-problem/>
- 유사 앱 사례(그림 속 단어 찾기): <https://play.google.com/store/apps/details?id=com.dstocapps.wordsearchforkids>
