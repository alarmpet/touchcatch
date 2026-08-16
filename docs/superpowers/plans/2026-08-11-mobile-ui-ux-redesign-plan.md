# TouchCatch 모바일 UI/UX 리디자인 계획

## 목표

현재의 기능 중심·임시 화면을 학습 게임 제품처럼 보이는 일관된 경험으로 교체한다. 핵심 경험은 `홈 → 오늘의 학습 세션 → 틀린그림 찾기 → 초성/스펠링 힌트 → 속담·사자성어·영단어 답변 → 결과·보상`의 단일 흐름이다. 펫 보상과 내 정보는 학습 성취를 강화하는 보조 공간이며, 서버 정책이 준비되지 않은 기능은 제품처럼 가장하지 않고 명확한 준비 상태를 보여준다.

## 현재 상태 진단

- 화면별 임시 `View`와 단색 배경 중심이라 정보 우선순위·브랜드 인상이 없다.
- 홈, 게임, 펫, 랭킹의 카드·버튼·색상·간격 체계가 서로 다르다.
- 일부 화면과 컴포넌트에 mojibake 한글이 남아 있어 출시 품질을 훼손한다.
- 통합 학습 세션으로 방향을 수정했지만, 실제 공통 shell·progress·result/reward 연결은 아직 없다.
- `/game/answer`는 직접 진입용으로 유지하되 제품의 대표 경험은 `/game/spot-difference` 통합 세션이어야 한다.

## UX 원칙

1. 한 화면의 주 행동은 하나만 둔다. 홈에서는 “오늘의 학습 시작”, 게임에서는 현재 단계 완료가 주 행동이다.
2. 기능명이 아니라 사용자가 얻는 결과를 보여준다. 예: “답변 게임” 대신 “오늘의 단어·속담 챌린지”.
3. 학습 진행은 항상 보인다. `그림 찾기 1/3 → 힌트 2/3 → 답변 → 결과` progress indicator를 공통 사용한다.
4. 서버 미연결·정책 미승인·콘텐츠 미승인을 오류처럼 숨기지 않고, 이유·재시도·대체 행동을 제공한다.
5. 애니메이션은 보상과 상태 전환에만 사용하고, reduced-motion에서는 즉시 전환한다.
6. 색상만으로 상태를 전달하지 않는다. 아이콘·텍스트·접근성 상태를 함께 제공한다.

## 권장 디자인 방향

### 브랜드 콘셉트: “TouchCatch Playbook”

밝은 하늘색/크림색 바탕, 짙은 네이비 본문, 민트·노랑·코랄 포인트를 사용한다. 게임 화면은 집중을 위해 배경을 단순화하고, 펫 화면은 일러스트와 카드로 감정적 보상을 강화한다. 기존 단색 파란 배경은 shell 배경으로만 사용하고 모든 콘텐츠를 흰색 카드에 넣지 않는다.

### 토큰

- Color: `ink-900 #17324D`, `sky-50 #F3F9FF`, `sky-500 #3A70B5`, `mint-500 #0B7A75`, `sun-400 #FFD166`, `coral-400 #F77F6A`, `success #16803C`, `danger #B42318`.
- Radius: 카드 20, 버튼 14, 작은 pill 999.
- Spacing: 4pt grid, 화면 좌우 20, 카드 내부 16~20.
- Typography: 제목 28/34, 섹션 20/26, 본문 16/24, 보조 13/18. 모든 텍스트에 `maxFontSizeMultiplier={2}`를 기본 적용한다.
- Touch target: 최소 44×44pt. 버튼은 label·role·disabled 상태를 함께 제공한다.

## 화면별 설계

### 1. 홈 화면

상단에는 인사말, streak, 오늘의 에너지/힌트 잔량을 작은 정보 행으로 배치한다. 중앙에는 “오늘의 학습 세션 시작” hero card를 두고 예상 소요 시간(약 3분), 오늘의 카테고리(영단어/속담/사자성어), 보상 미리보기를 표시한다. 아래에는 `빠른 연습`, `펫`, `랭킹`, `내 정보`를 아이콘+텍스트 bottom navigation으로 제공한다.

홈은 4개의 동일한 큰 카드 나열을 금지한다. primary CTA 1개, secondary shortcut 3~4개, 최근 성취 1개로 계층을 만든다. 서버가 준비되지 않은 랭킹/보상은 비활성 카드가 아니라 “곧 열림” 상태와 대체 행동(학습 시작)을 제공한다.

### 2. 통합 게임 화면

상단 고정 영역: 뒤로가기, 카테고리 pill, 진행률, 남은 힌트. 본문은 단계별 한 화면이다.

- Step 1: 두 이미지 보드와 “차이를 찾았어요” CTA. 확대/이동은 한 손 조작과 reduced-motion을 지원한다.
- Step 2: 힌트 tray. 초성 힌트, 스펠링 공개, 의미 힌트를 별도 chip으로 표시하고 사용 시 차감량을 명시한다.
- Step 3: 입력 surface는 문제 metadata에 따라 객관식/자유입력/초성 보조 중 하나만 노출한다. 한국어 띄어쓰기 정규화와 영문 대소문자 정규화를 적용한다.
- Step 4: 결과 sheet. 정답/오답, 해설, 힌트 패널티, 획득 경험치, 펫 보상 예정 여부를 한 번에 보여주고 다음 문제 또는 홈으로 이동한다.

게임은 로컬에서 정답을 확정하지 않는다. preview fixture만 local judge를 사용할 수 있고 production result는 서버 응답만 표시한다.

### 3. 펫 보상 화면

상단 hero에는 현재 대표 펫, 친밀도/챔피언 별, 다음 성장 목표를 표시한다. 그 아래에는 오늘 무료 뽑기 card, 보유 펫 horizontal collection, 중복 수량과 승급 가능 상태를 배치한다. 정책이 `DRAFT`면 버튼을 단순 disabled 처리하지 말고 “보상 정책 승인 후 사용 가능”과 학습으로 돌아가는 CTA를 제공한다.

### 4. 랭킹 화면

주간 탭(English/Proverb)과 기간, 내 순위를 상단에 둔다. 행에는 순위·익명 닉네임·검증 점수만 표시하며, 미검증 점수는 노출하지 않는다. 빈 상태·오래된 데이터·네트워크 오류를 별도 디자인한다. Idiom/GK는 정책 승인 전 탭 자체를 숨기거나 “준비 중”으로 표시한다.

### 5. 내 정보 화면

이번 리디자인에서 새로 추가한다. 프로필에는 익명 닉네임, streak, 누적 학습일, 정답률, 완료 세션 수, 대표 펫을 표시한다. 설정에는 알림, 사운드, reduced motion, 고대비, 글자 크기, 데이터/로그아웃을 둔다. 개인 식별 정보와 랭킹 공개 닉네임을 분리한다.

## 컴포넌트 및 코드 구조

- `apps/mobile/src/ui/design-tokens.ts`: 색상·간격·타이포그래피·radius.
- `apps/mobile/src/ui/AppShell.tsx`: safe area, 배경, top bar, bottom navigation.
- `apps/mobile/src/ui/ProgressHeader.tsx`, `PrimaryButton.tsx`, `StatusCard.tsx`, `RewardResultSheet.tsx`.
- `apps/mobile/src/features/session/LearningSessionScreen.tsx`: 단계 전이만 담당하고 answer engine/server client를 주입받는다.
- `apps/mobile/src/features/profile/ProfileScreen.tsx`와 `profile-model.ts`.
- 제품 라우트는 public model만 소비하며 `learning-demo/registry`를 import하지 않는다.

## 이미지 생성·에셋 파이프라인

이미지 생성 MCP는 최종 정답 데이터가 아닌 공개 시각 자산에만 사용한다.

1. 먼저 3종 스타일 보드(종이 오려내기, 부드러운 3D 클레이, 평면 벡터)를 생성한다.
2. 사용자 승인 후 펫 6종, 홈 hero 2종, 빈 상태 4종을 생성한다.
3. 게임용 두 이미지 쌍은 생성 후 별도 차이 좌표/해시 검증을 거치며, private solution metadata와 같은 번들에 넣지 않는다.
4. 생성물은 Android 저해상도 fallback과 dark/high-contrast 대체색을 함께 만든다.
5. 파일명·라이선스·프롬프트·seed를 `apps/mobile/assets/manifest.json`에 기록한다.

이미지 생성은 구현 전에 스타일 보드 승인을 받는 별도 체크포인트로 둔다. 생성 이미지를 실제 콘텐츠 정답 또는 보상 확률의 근거로 사용하지 않는다.

## 접근성 및 품질 기준

- React Native 접근성 role/label/hint/state를 모든 상호작용 요소에 지정한다.
- 스크린 리더가 진행 단계, 정답 결과, 힌트 차감, 네트워크 상태를 읽을 수 있어야 한다.
- 최소 터치 영역 44pt, 글자 확대 200%, 고대비, reduced-motion을 Android 에뮬레이터에서 확인한다.
- UTF-8 검사로 mojibake 문자열을 차단한다.
- 화면 단위 snapshot보다 상태 전이·접근성 트리·핵심 CTA 테스트를 우선한다.

## 구현 순서

1. 디자인 토큰과 AppShell, bottom navigation을 만든다.
2. 홈 hero/shortcut/recent achievement를 통합한다.
3. 통합 학습 세션 shell과 단계 progress를 연결한다.
4. 힌트 tray·입력 surface·결과 sheet를 연결한다.
5. 펫 화면과 정책/오류 상태를 연결한다.
6. 랭킹과 내 정보 화면을 연결한다.
7. 이미지 스타일 보드 승인 후 생성 에셋을 교체한다.
8. Android smoke matrix와 접근성 검증을 실행한다.

## 테스트 매트릭스

- Unit: 토큰, home model, 세션 reducer, 힌트 차감, 답변 정규화, reward fail-closed, ranking filtering, profile privacy.
- Component: primary CTA, disabled/policy card, progress header, result sheet, pet collection, ranking rows.
- Android: cold launch, 홈→세션, 그림 단계→힌트→답변→결과, 펫 정책 draft, 랭킹 empty/error, 내 정보 설정.
- Visual QA: 320dp 폭, 일반/큰 글자, 고대비, reduced-motion, 한글/영문 혼합, mojibake grep.

## 완료 기준

- 홈에서 사용자가 3초 안에 오늘 학습 시작 CTA를 찾을 수 있다.
- 통합 세션에서 그림→힌트→답변→결과가 뒤로가기/재시작을 포함해 끊김 없이 동작한다.
- 펫·랭킹·프로필 화면에 로딩/빈 상태/오류/정책 미승인 상태가 있다.
- 제품 번들에 private answer/hash/difference metadata가 유입되지 않는다.
- Android 에뮬레이터에서 핵심 흐름과 접근성 매트릭스가 통과한다.

## 참고 근거

- [React Native Accessibility](https://reactnative.dev/docs/accessibility): role, label, state, focus, screen-reader semantics.
- [Material Design Accessibility](https://m1.material.io/usability/accessibility.html): screen-reader 테스트와 접근성 기본 원칙.
- [Duolingo home redesign](https://blog.duolingo.com/new-duolingo-home-screen-design/): 사용자가 다음 행동을 명확히 이해하는 선형 학습 홈 구조.
- [Duolingo core tabs redesign](https://blog.duolingo.com/core-tabs-redesign/): 학습·랭킹·프로필을 bottom navigation으로 구분하는 정보 구조.
- [Duolingo streak research](https://blog.duolingo.com/how-duolingo-streak-builds-habit/): streak와 작은 보상 피드백의 습관 형성 근거.

## 리스크와 대응

- 생성 이미지가 게임 정답 좌표를 노출할 수 있음 → 공개 asset과 private metadata 저장소 분리.
- 애니메이션 과다로 저사양 Android 성능 저하 → 60fps 목표, reduced-motion, 정적 fallback.
- 정책 미승인 기능을 과장할 위험 → 서버 상태와 UI 상태를 명시적으로 분리.
- 기존 mojibake 문자열 재발 → UTF-8 검사와 디자인 QA를 release gate로 추가.
