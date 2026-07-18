# 11. 테스트 및 밸런스
> Balance tests load RulesetV1 (`1.0.0`) and cover 59,999/60,000 ms, 74,999/75,000 ms, settlement through 80,000 ms, the score floor, atomic final scoring, and tie-chain boundaries.

## 목표 지표
- 평균 경기 50~70초
- 파이널 러시 진입 40~65%
- 최종 단어 도전 70% 이상
- 평균 오답 0.5~1.5회

## Versioned evidence classes

PR wiring uses 50 matches, nightly bot sensitivity uses 10,000 matches, and economy modeling uses 100,000 draws. Every simulation pins its seed, ruleset version, report version, and `botModelVersion`; it remains DRAFT/test-only unless separately approved. Bot output is not evidence of human satisfaction, learning, fairness, or production capacity.

## A/B 테스트
A: 차이점 6/9, 최종 패키지 50
B: 차이점 7/10, 최종 패키지 40

비교: 날먹 체감, 학습 참여율, 역전 빈도, 만족도.

## 필수 테스트
- 동시 클릭
- 줌 상태 좌표
- 재접속
- 75초와 점수 이벤트 동시
- 파이널 러시 오답 연타
- 보상 중복 지급
