---
title: "13_CODING_AGENT_PROMPTS"
tags: [agent-guide, prompts]
updated: 2026-08-24
status: "HISTORICAL"
related: [[[00_TOUCHCATCH_MOC]]]
---

> **Historical.** `DOC-*` requirement inventory only. Not an implementation or release order. `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md` retired Step 0–8. Current launch scope is Android closed casual beta: `docs/decisions/2026-08-20-launch-scope.md`. Operator rules: repo-root `CLAUDE.md`.

# 13. 코딩 에이전트용 단계별 프롬프트

## 공통
TypeScript strict. 임의 기능 추가 금지. 각 단계 후 테스트 결과와 변경 파일 목록 보고. 서버가 점수와 승패를 결정. <!-- REQ: DOC-001 -->

## Step 0
전체 문서를 읽고 코드는 작성하지 말고 모노레포 구조, 공통 타입, 상태 머신, 위험 요소, 테스트 계획을 작성하라. <!-- REQ: DOC-002 -->

## Step 1
Expo로 오프라인 싱글 프로토타입 구현: <!-- REQ: DOC-003 -->
- 두 이미지 <!-- REQ: DOC-004 -->
- pinch zoom/pan <!-- REQ: DOC-005 -->
- 정규화 좌표 <!-- REQ: DOC-006 -->
- 차이점 10개 <!-- REQ: DOC-007 -->
- 75초 <!-- REQ: DOC-008 -->
- 60초 파이널 러시 <!-- REQ: DOC-009 -->
- 100점 승리 <!-- REQ: DOC-010 -->
- 단위 테스트 <!-- REQ: DOC-011 -->

## Step 2
돌발 단어 사냥 추가: <!-- REQ: DOC-012 -->
- 16~22초, 34~42초, 60초 <!-- REQ: DOC-013 -->
- hitbox <!-- REQ: DOC-014 -->
- +10/+15 <!-- REQ: DOC-015 -->
- 버프 4종 <!-- REQ: DOC-016 -->

## Step 3
최종 단어와 뜻 추가: <!-- REQ: DOC-017 -->
- 활성 조건 <!-- REQ: DOC-018 -->
- alias 판정 <!-- REQ: DOC-019 -->
- +25/+15/+10 <!-- REQ: DOC-020 -->
- 오답 잠금 <!-- REQ: DOC-021 -->
- 뜻 5초 <!-- REQ: DOC-022 -->

## Step 4
NestJS + Socket.IO 서버: <!-- REQ: DOC-023 -->
- 서버 권위 <!-- REQ: DOC-024 -->
- 룸 <!-- REQ: DOC-025 -->
- 동시 클릭 <!-- REQ: DOC-026 -->
- 재접속 snapshot <!-- REQ: DOC-027 -->
- 통합 테스트 <!-- REQ: DOC-028 -->

## Step 5
Supabase: <!-- REQ: DOC-029 -->
- migration <!-- REQ: DOC-030 -->
- RLS <!-- REQ: DOC-031 -->
- 경기 기록 <!-- REQ: DOC-032 -->
- idempotent reward <!-- REQ: DOC-033 -->

## Step 6
펫: <!-- REQ: DOC-034 -->
- 일반/희귀/전설 <!-- REQ: DOC-035 -->
- 뽑기 <!-- REQ: DOC-036 -->
- 일반5→희귀1 <!-- REQ: DOC-037 -->
- 희귀5→전설1 <!-- REQ: DOC-038 -->
- 도감 <!-- REQ: DOC-039 -->

## Step 7
Next.js 운영 도구: <!-- REQ: DOC-040 -->
- 이미지 업로드 <!-- REQ: DOC-041 -->
- 원형 hitbox 등록 <!-- REQ: DOC-042 -->
- 콘텐츠 검증 <!-- REQ: DOC-043 -->
- 미리보기 <!-- REQ: DOC-044 -->

## Step 8
전체 검증: <!-- REQ: DOC-045 -->
- lint/typecheck/test/e2e <!-- REQ: DOC-046 -->
- 50판 자동 시뮬레이션 <!-- REQ: DOC-047 -->
- 네트워크 지연 <!-- REQ: DOC-048 -->
- Sentry/Analytics <!-- REQ: DOC-049 -->
