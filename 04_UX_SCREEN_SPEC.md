# 04. UX 및 화면 사양

<!-- GENERATED:UI_ACCEPTANCE:START -->
## UI acceptance matrix (generated contract projection)

Every `320x568`, `390x844`, and `412x915` viewport is checked on iOS and Android for default, disabled, pending, offline, reconnecting, modal, 200% text, reduced-motion, and high-contrast states. Safe-area containment, logical focus order, 44pt/48dp targets, modal focus trap, blocked backdrop/system-back dismissal, live-region announcements, and private-answer non-disclosure are required. Actual device captures and approved goldens remain `BLOCKED_MANUAL_DEVICE_EVIDENCE`. <!-- REQ: UX-001 -->
<!-- GENERATED:UI_ACCEPTANCE:END -->

## 원칙
- 게임 화면에는 점수, 시간, 최종 정답, 힌트만 노출 <!-- REQ: UX-002 -->
- 펫 능력치와 재료를 게임 화면에 표시하지 않음 <!-- REQ: UX-003 -->
- 한 화면의 주 행동은 하나 <!-- REQ: UX-004 -->

## 홈
- 대표 펫 <!-- REQ: UX-005 -->
- 펫 레벨/EXP <!-- REQ: UX-006 -->
- 바로 대전 <!-- REQ: UX-007 -->
- 친구와 하기 <!-- REQ: UX-008 -->
- 하단 탭: 홈/펫/합성/도감 <!-- REQ: UX-009 -->

## 게임 화면
### 상단
내 점수 / 타이머 / 상대 점수 / 목표 100점 <!-- REQ: UX-010 -->

### 중앙
두 장의 이미지. 발견된 차이점에 플레이어 색 원 표시. <!-- REQ: UX-011 -->

### 돌발 미션
단어를 1.2초 크게 띄운 뒤 상단 미션바로 축소. <!-- REQ: UX-012 -->

### 하단
정답 도전 / 힌트 / 최종 단어 빈칸 <!-- REQ: UX-013 -->

## 결과
- 승패 <!-- REQ: UX-014 -->
- 점수 상세 <!-- REQ: UX-015 -->
- 오늘 학습 단어 <!-- REQ: UX-016 -->
- 펫 EXP <!-- REQ: UX-017 -->
- 뽑기 포인트 <!-- REQ: UX-018 -->
- 다시하기 <!-- REQ: UX-019 -->
