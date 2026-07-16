# Spot & Learn Battle — 개발 사양서 종합본
> Ruleset SSOT: normative match rules are frozen as `rulesetVersion` **1.0.0** in `config/ruleset.v1.json`; see ADR-001. Timing windows are half-open and ties use the exact ordered sudden-death chain.

## 한 줄 정의
두 플레이어가 틀린그림을 찾는 중 돌발 단어 미션을 선점하고, 최종 단어와 뜻을 맞혀 100점을 먼저 만드는 실시간 학습 PvP 게임.

## 최종 권장 규칙
- 목표 점수: 100점
- 제한시간: 75초
- 먼저 100점 도달 시 즉시 승리
- 시간 종료 시 고득점 승리
- 마지막 15초는 파이널 러시

## 핵심 수정 사항
사용자 제안은 방향이 좋다. 다만 파이널 러시에서 오답 잠금을 완전히 제거하면 연타 스팸이 생길 수 있어, **-10점 + 1.5초 잠금**으로 유지한다. 또한 차이점은 일반/어려움으로 나눠 점수 차를 둔다.

## 권장 점수표
| 행동 | 점수 |
|---|---:|
| 일반 차이점 | +6 |
| 어려운 차이점 | +9 |
| 돌발 단어 사냥 | +10 |
| 스페셜 돌발 단어 | +15 |
| 최종 단어 정답 | +25 |
| 뜻 맞히기 | +15 |
| 단어+뜻 연속 성공 | +10 |
| 오답 | -5 + 2초 잠금 |
| 파이널 러시 오답 | -10 + 1.5초 잠금 |

## MVP 기술 스택
- Client: React Native + Expo + TypeScript
- Realtime: NestJS + Socket.IO
- DB/Auth/Storage: Supabase
- Cache/Scale: Redis
- Admin: Next.js
- Analytics: PostHog 또는 Firebase Analytics
- Crash: Sentry

## 문서 순서
1. 01_GAME_DESIGN_OVERVIEW.md
2. 02_CORE_RULES_AND_BALANCE.md
3. 03_GAME_FLOW_AND_STATE_MACHINE.md
4. 04_UX_SCREEN_SPEC.md
5. 05_PET_COLLECTION_SYSTEM.md
6. 06_CLIENT_ARCHITECTURE.md
7. 07_REALTIME_SERVER_SPEC.md
8. 08_DATABASE_SCHEMA.md
9. 09_API_AND_SOCKET_EVENTS.md
10. 10_CONTENT_AND_IMAGE_PIPELINE.md
11. 11_TEST_AND_BALANCE_PLAN.md
12. 12_IMPLEMENTATION_ROADMAP.md
13. 13_CODING_AGENT_PROMPTS.md
