# 11. 테스트 및 밸런스
> Balance tests load RulesetV1 (`1.0.0`) and cover 59,999/60,000 ms, 74,999/75,000 ms, settlement through 80,000 ms, the score floor, atomic final scoring, and tie-chain boundaries. <!-- REQ: QA-001 -->

## 목표 지표
- 평균 경기 50~70초 <!-- REQ: QA-002 -->
- 파이널 러시 진입 40~65% <!-- REQ: QA-003 -->
- 최종 단어 도전 70% 이상 <!-- REQ: QA-004 -->
- 평균 오답 0.5~1.5회 <!-- REQ: QA-005 -->

## Versioned evidence classes

PR wiring uses 50 matches, nightly bot sensitivity uses 10,000 matches, and economy modeling uses 100,000 draws. Every simulation pins its seed, ruleset version, report version, and `botModelVersion`; it remains DRAFT/test-only unless separately approved. Bot output is not evidence of human satisfaction, learning, fairness, or production capacity. <!-- REQ: QA-006 -->

## A/B 테스트
A: 차이점 6/9, 최종 패키지 50 <!-- REQ: QA-007 -->
B: 차이점 7/10, 최종 패키지 40 <!-- REQ: QA-008 -->

비교: 날먹 체감, 학습 참여율, 역전 빈도, 만족도. <!-- REQ: QA-009 -->

## 필수 테스트
- 동시 클릭 <!-- REQ: QA-010 -->
- 줌 상태 좌표 <!-- REQ: QA-011 -->
- 재접속 <!-- REQ: QA-012 -->
- 75초와 점수 이벤트 동시 <!-- REQ: QA-013 -->
- 파이널 러시 오답 연타 <!-- REQ: QA-014 -->
- 보상 중복 지급 <!-- REQ: QA-015 -->
