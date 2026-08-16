---
title: "11_TEST_AND_BALANCE_PLAN"
tags: [testing, vitest, verification]
updated: 2026-07-30
status: "VERIFIED"
related: [[[12_IMPLEMENTATION_ROADMAP]], [[10_CONTENT_AND_IMAGE_PIPELINE]]]
---

# 11. 테스트 및 밸런스

Ruleset 경계 검증은 final-rush 직전/진입, 입력 종료 직전/종료, settlement cap, score floor, atomic final scoring, tie-chain을 실제 reducer 시나리오로 실행한다. <!-- REQ: QA-001 -->

## 로컬 결정론적 목표

- 평균 경기 시간은 release policy의 `durationSeconds` 범위로 판정한다. <!-- REQ: QA-002 -->
- final-rush 진입률은 release policy의 `finalRushRate` 범위로 판정한다. <!-- REQ: QA-003 -->
- final answer 시도율은 release policy의 `finalAttemptRateMin` 이상이어야 한다. <!-- REQ: QA-004 -->
- eligible match당 평균 오답 수는 release policy의 `wrongAttemptsPerEligible` 범위로 판정한다. <!-- REQ: QA-005 -->

## Versioned evidence classes

결정론적 match/economy 보고서는 seed, ruleset/economy hash, report version, bot model과 sample count를 고정하고 생성 결과와 byte-equivalent해야 한다. 이 결과는 `DRAFT_TEST_ONLY`이며 production soak, 실기기 경험, 학습 효과 또는 사람 만족도의 증거가 아니다. <!-- REQ: QA-006 -->

normal/hard difference 점수와 final package 점수 조합은 Ruleset SSOT에서 직접 파생하고 mutation drift를 거절한다. <!-- REQ: QA-007 -->
콘텐츠 objective cardinality와 target score는 Ruleset SSOT에서 직접 파생하고 별도 A/B 상수로 복제하지 않는다. <!-- REQ: QA-008 -->

로컬 비교는 final-attempt와 wrong-attempt 같은 versioned metric만 산출한다. 재미·학습·공정성·만족도 판단은 별도 사람 연구 승인이 필요한 외부 blocker다. <!-- REQ: QA-009 -->

## 필수 장애 시나리오

- 동시 claim은 durable receipt/outbox fault harness에서 중복 효과 없이 수렴해야 한다. <!-- REQ: QA-010 -->
- 중간 상태 crash/restart 뒤 reconstructed terminal hash가 authoritative hash와 같아야 한다. <!-- REQ: QA-011 -->
- reconnect event gap은 불완전 replay를 적용하지 않고 snapshot replacement로 복구한다. <!-- REQ: QA-012 -->
- 입력 종료 시각의 동시 명령은 pinned deadline과 tie-chain으로 결정한다. <!-- REQ: QA-013 -->
- 일반/final-rush 오답 lock과 최대 시도 횟수는 Ruleset SSOT 경계를 따른다. <!-- REQ: QA-014 -->
- retry·crash 후에도 reward/outbox physical effect는 request/effect ID당 한 번만 실행된다. <!-- REQ: QA-015 -->
