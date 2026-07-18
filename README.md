# Spot & Learn Battle — 개발 사양서 종합본
> Ruleset SSOT: normative match rules are frozen as `rulesetVersion` **1.0.0** in `config/ruleset.v1.json`; see ADR-001. Timing windows are half-open and ties use the exact ordered sudden-death chain. <!-- REQ: DOC-050 -->

## 한 줄 정의
두 플레이어가 틀린그림을 찾는 중 돌발 단어 미션을 선점하고, 최종 단어와 뜻을 맞혀 100점을 먼저 만드는 실시간 학습 PvP 게임. <!-- REQ: DOC-051 -->

## 최종 권장 규칙
- 목표 점수: 100점 <!-- REQ: DOC-052 -->
- 제한시간: 75초 <!-- REQ: DOC-053 -->
- 먼저 100점 도달 시 즉시 승리 <!-- REQ: DOC-054 -->
- 시간 종료 시 고득점 승리 <!-- REQ: DOC-055 -->
- 마지막 15초는 파이널 러시 <!-- REQ: DOC-056 -->

## 핵심 수정 사항
사용자 제안은 방향이 좋다. 다만 파이널 러시에서 오답 잠금을 완전히 제거하면 연타 스팸이 생길 수 있어, **-10점 + 1.5초 잠금**으로 유지한다. 또한 차이점은 일반/어려움으로 나눠 점수 차를 둔다. <!-- REQ: DOC-057 -->

## 권장 점수표
| 행동 | 점수 | <!-- REQ: DOC-058 -->
|---|---:|
| 일반 차이점 | +6 | <!-- REQ: DOC-059 -->
| 어려운 차이점 | +9 | <!-- REQ: DOC-060 -->
| 돌발 단어 사냥 | +10 | <!-- REQ: DOC-061 -->
| 스페셜 돌발 단어 | +15 | <!-- REQ: DOC-062 -->
| 최종 단어 정답 | +25 | <!-- REQ: DOC-063 -->
| 뜻 맞히기 | +15 | <!-- REQ: DOC-064 -->
| 단어+뜻 연속 성공 | +10 | <!-- REQ: DOC-065 -->
| 오답 | -5 + 2초 잠금 | <!-- REQ: DOC-066 -->
| 파이널 러시 오답 | -10 + 1.5초 잠금 | <!-- REQ: DOC-067 -->

## MVP 기술 스택
- Client: React Native + Expo + TypeScript <!-- REQ: DOC-068 -->
- Realtime: NestJS + Socket.IO <!-- REQ: DOC-069 -->
- DB/Auth/Storage: Supabase <!-- REQ: DOC-070 -->
- Cache/Scale: Redis <!-- REQ: DOC-071 -->
- Admin: Next.js <!-- REQ: DOC-072 -->
- Analytics: PostHog 또는 Firebase Analytics <!-- REQ: DOC-073 -->
- Crash: Sentry <!-- REQ: DOC-074 -->

## 문서 순서
1. [Game design overview](01_GAME_DESIGN_OVERVIEW.md) <!-- REQ: DOC-075 -->
2. [Core rules and balance](02_CORE_RULES_AND_BALANCE.md) <!-- REQ: DOC-076 -->
3. [Game flow and state machine](03_GAME_FLOW_AND_STATE_MACHINE.md) <!-- REQ: DOC-077 -->
4. [UX screen specification](04_UX_SCREEN_SPEC.md) <!-- REQ: DOC-078 -->
5. [Pet collection system](05_PET_COLLECTION_SYSTEM.md) <!-- REQ: DOC-079 -->
6. [Client architecture](06_CLIENT_ARCHITECTURE.md) <!-- REQ: DOC-080 -->
7. [Realtime server specification](07_REALTIME_SERVER_SPEC.md) <!-- REQ: DOC-081 -->
8. [Database schema](08_DATABASE_SCHEMA.md) <!-- REQ: DOC-082 -->
9. [API and socket events](09_API_AND_SOCKET_EVENTS.md) <!-- REQ: DOC-083 -->
10. [Content and image pipeline](10_CONTENT_AND_IMAGE_PIPELINE.md) <!-- REQ: DOC-084 -->
11. [Test and balance plan](11_TEST_AND_BALANCE_PLAN.md) <!-- REQ: DOC-085 -->
12. [Implementation roadmap](12_IMPLEMENTATION_ROADMAP.md) <!-- REQ: DOC-086 -->
13. [Coding-agent prompts](13_CODING_AGENT_PROMPTS.md) <!-- REQ: DOC-087 -->

The machine-checked semantic registry for every annotated normative bullet, ordered item, and prose statement is [requirements traceability](docs/requirements-traceability.md). <!-- REQ: DOC-088 -->
