---
title: "05_PET_COLLECTION_SYSTEM"
tags: [pet, gacha, balance]
updated: 2026-07-30
status: "VERIFIED"
related: [[[02_CORE_RULES_AND_BALANCE]], [[08_DATABASE_SCHEMA]]]
---

# 05. 펫 수집 시스템

## 등급
- 일반, 고급 <!-- REQ: ECON-001 -->
- 희귀, 영웅 <!-- REQ: ECON-002 -->
- 전설. 고급과 영웅은 아트 승인 전까지 도감이 비어 있으며, 뽑기는 아래 등급으로 내려 해결하고 승급은 위 등급으로 올려 해결한다 <!-- REQ: ECON-003 -->

## 기능
- 레벨업 <!-- REQ: ECON-004 -->
- 랜덤 뽑기 <!-- REQ: ECON-005 -->
- 합성 <!-- REQ: ECON-006 -->
- 도감 <!-- REQ: ECON-007 -->

## 뽑기
- 100 뽑기 포인트 = 1회 <!-- REQ: ECON-008 -->
- 일반 60%, 고급 25%, 희귀 10%, 영웅 4%, 전설 1% <!-- REQ: ECON-009 -->
- 50회 내 희귀 이상 <!-- REQ: ECON-010 -->
- 150회 내 전설 <!-- REQ: ECON-011 -->
- MVP는 현금 결제 없는 플레이 보상형만 <!-- REQ: ECON-012 -->

## 합성
- 일반 5장 → 상위 등급 랜덤 1장 <!-- REQ: ECON-013 -->
- 희귀 5장 → 상위 등급 랜덤 1장 <!-- REQ: ECON-014 -->
- 대표 펫과 잠금 펫은 재료 불가 <!-- REQ: ECON-015 -->

## 도감
- 일반 30종 <!-- REQ: ECON-016 -->
- 희귀 15종 <!-- REQ: ECON-017 -->
- 전설 5종 <!-- REQ: ECON-018 -->
- 총 50종 <!-- REQ: ECON-019 -->

## 레벨
- 승리 100 EXP <!-- REQ: ECON-020 -->
- 패배 60 EXP <!-- REQ: ECON-021 -->
- 단어+뜻 퍼펙트 +40 EXP <!-- REQ: ECON-022 -->
- 레벨은 외형, 프레임, 감정표현, 자랑 요소 중심 <!-- REQ: ECON-023 -->
# Implementation baseline note (2026-07-15)

The executable economy baseline is documented in `docs/decisions/ADR-004-pet-economy.md`. Repository configs are DRAFT and must not be admitted by production startup until product approval metadata and exact immutable DB revisions exist. <!-- REQ: ECON-024 -->
