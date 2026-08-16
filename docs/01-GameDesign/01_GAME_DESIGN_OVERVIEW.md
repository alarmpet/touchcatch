---
title: "01_GAME_DESIGN_OVERVIEW"
tags: [design, overview]
updated: 2026-07-30
status: "VERIFIED"
related: [[[02_CORE_RULES_AND_BALANCE]], [[03_GAME_FLOW_AND_STATE_MACHINE]]]
---

# 01. 게임 기획 개요
> RulesetV1 (`1.0.0`) is authoritative for scoring, timing, unlocks, hints, and tie breaking. Prose examples are non-authoritative. <!-- REQ: RULE-001 -->

## 게임 정체성
- 관찰하여 기본 점수를 쌓는다. <!-- REQ: RULE-002 -->
- 돌발 단어 사냥으로 리듬을 바꾼다. <!-- REQ: RULE-003 -->
- 단어와 뜻을 이해해 큰 점수로 역전한다. <!-- REQ: RULE-004 -->
- 경기 보상으로 펫을 수집하고 도감을 채운다. <!-- REQ: RULE-005 -->

## 장르
실시간 1:1 캐주얼 PvP + 틀린그림찾기 + 돌발 오브젝트 사냥 + 학습 퀴즈 + 펫 수집. <!-- REQ: RULE-006 -->

## 한 판 감정 곡선
1. 0~15초: 차이점 선점과 12초 최종 도전 잠금 해제 <!-- REQ: RULE-007 -->
2. 16~22초: 첫 돌발 단어 <!-- REQ: RULE-008 -->
3. 23~42초: 차이점과 단어 사냥 혼합 <!-- REQ: RULE-009 -->
4. 12초 또는 첫 차이점·단어 선점부터: 최종 단어 추리 <!-- REQ: RULE-010 -->
5. 60~75초: 파이널 러시 <!-- REQ: RULE-011 -->

## MVP 모드
- AI 연습전 <!-- REQ: RULE-012 -->
- 1:1 랜덤 대전 <!-- REQ: RULE-013 -->
- 친구방 코드 대전 <!-- REQ: RULE-014 -->

## 출시 후
- 2:2 팀전 <!-- REQ: RULE-015 -->
- 커플/가족 협동전 <!-- REQ: RULE-016 -->
- 교실/학원 방 <!-- REQ: RULE-017 -->
- 시즌 랭크전 <!-- REQ: RULE-018 -->
