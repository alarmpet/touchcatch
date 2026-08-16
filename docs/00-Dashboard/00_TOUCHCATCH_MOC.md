---
title: "TouchCatch Master Map of Content (MOC)"
tags: [dashboard, moc, touchcatch, obsidian-hub]
updated: 2026-07-30
status: "ACTIVE"
---

# 🎮 TouchCatch 지식 베이스 메인 대시보드 (Master MOC)

TouchCatch 'Spot & Learn Battle' 프로젝트의 전체 기획, 기술 아키텍처, 81개 콘텐츠 파이프라인 및 개발 로드맵을 유기적으로 잇는 **옵시디언 마스터 노드**입니다.

---

## 📊 프로젝트 실시간 통계 (System Health)

| 구분 | 현황 | 비고 |
|:---|:---:|:---|
| **📦 구축 완료 학습 팩** | **81개** | 한국 속담, 사자성어, 영단어 파닉스, 과학상식 |
| **🎯 10/10개 완벽 탐지** | **78개 (96.3%)** | 픽셀 델타 노이즈 0.15 미만 통과 |
| **🎨 아트 스타일 스펙트럼** | **6대 스타일** | Low-poly, Claymation, Papercut, Pixar 3D, Cyberpunk, Watercolor |
| **🧪 파이프라인 및 테스트** | **100% PASS** | `pnpm test content/learning/all-content.test.ts` |

---

## 🗺️ 지식 베이스 맵 (Map of Content)

### 🎨 1. 기획 & 게임 디자인 ([[01-GameDesign]])
- [[01_GAME_DESIGN_OVERVIEW|🎮 01. 게임 디자인 개요]]: 핵심 가치, 타겟 유저 및 루프 디자인
- [[02_CORE_RULES_AND_BALANCE|⚖️ 02. 코어 규칙 & 밸런스]]: 틀린 그림 대결 콤보, 점수 산출 및 시간 공식
- [[03_GAME_FLOW_AND_STATE_MACHINE|🔄 03. 게임 플로우 & 상태 머신]]: 클라이언트/서버 턴 상태 전환 규격
- [[04_UX_SCREEN_SPEC|📱 04. UX/UI 화면 명세]]: 480x854 모바일 뷰포트 레이아웃 및 콤보 팝업
- [[05_PET_COLLECTION_SYSTEM|🐱 05. 펫 수집 및 성장 시스템]]: 펫 등급별 가차, 스킬 및 성장 밸런스

### 🏗️ 2. 기술 아키텍처 ([[02-Architecture]])
- [[06_CLIENT_ARCHITECTURE|💻 06. 클라이언트 아키텍처]]: Expo React Native, Canvas rendering, 상태 관리
- [[07_REALTIME_SERVER_SPEC|⚡ 07. 실시간 서버 명세]]: WebSocket 패킷 처리, 매치메이킹, 룸 상태 관리
- [[08_DATABASE_SCHEMA|🗄️ 08. 데이터베이스 스키마]]: Supabase PostgreSQL, MMR 등급, 유저 프로필
- [[09_API_AND_SOCKET_EVENTS|🔌 09. API & 소켓 이벤트 명세]]: 클라이언트-서버 실시간 양방향 이벤트 파라미터

### 🎨 3. 콘텐츠 & 이미지 파이프라인 ([[03-ContentPipeline]])
- [[10_CONTENT_AND_IMAGE_PIPELINE|🖼️ 10. 콘텐츠 & 이미지 파이프라인]]: 81개 팩 이미지 A/B 자동 생성 및 델타 자동 검출
- [[PROMPTS_100_GUIDE|📖 Master Prompt Guide 100]]: 79개 팩 프롬프트 표준 가이드
- [[PROMPTS_EXPANSION_GUIDE|🚀 Prompts Expansion Guide v5]]: 6대 시그니처 아트 스타일 & 사람 눈 직관 식별성 10계명

### 🚀 4. 테스트 & 로드맵 ([[04-Roadmap]])
- [[11_TEST_AND_BALANCE_PLAN|🧪 11. 테스트 및 밸런스 계획]]: Vitest 단위 테스트 및 지오메트리 자동 검증
- [[12_IMPLEMENTATION_ROADMAP|🗺️ 12. 구현 로드맵]]: 릴리즈 마일스톤 및 주요 기능 체크리스트
- [[13_CODING_AGENT_PROMPTS|🤖 13. 프롬프트 에이전트 가이드]]: 개발 에이전트 지침 및 코드 규칙

---

## 🔗 주요 핫링크 (Quick Navigation)
- [[10_CONTENT_AND_IMAGE_PIPELINE|현재 이미지 81개 자원 상태 확인]]
- [[PROMPTS_EXPANSION_GUIDE|6대 시그니처 아트 스타일 정의서]]
- [[08_DATABASE_SCHEMA|Supabase DB 스키마 명세서]]
