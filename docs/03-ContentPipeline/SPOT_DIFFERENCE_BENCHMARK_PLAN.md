---
title: "Spot the Difference Benchmark & Image Generation Strategy"
tags: [benchmark, market-research, visual-style, prompt-strategy]
updated: 2026-07-30
status: "VERIFIED"
related: ["[[00_TOUCHCATCH_MOC]]", "[[PROMPTS_EXPANSION_GUIDE]]", "[[10_CONTENT_AND_IMAGE_PIPELINE]]"]
---

# 🎯 유명 틀린그림찾기 게임 벤치마크 분석 및 TouchCatch 이미지 생성 전략 보고서

## 📌 1. 개요 및 목적
스팀(Steam) 및 글로벌 모바일 시장에서 수백만~수천만 다운로드를 기록한 대표적인 틀린그림찾기 게임들의 **구성, 아트 스타일, 핵심 연출 기법**을 심층 분석하고, 이를 TouchCatch 이미지 생성 파이프라인에 적용할 **5대 시그니처 프롬프트 전략**을 정의합니다.

---

## 🔍 2. 시장 상위 틀린그림찾기 게임 4종 심층 분석

### 1) Broken Lens (Steam - 힐링/파스텔 수채화)
- **아트 스타일**: 파스텔 톤 2D 핸드드론 수채화 & 패러랙스 컷팅 감성
- **게임 구성**: 감성적인 스토리라인, 평화로운 잔잔한 배경음악, 힐링 요소 강조
- **차이점 특징**: 배경 풍경의 나뭇잎 형태, 작은 소품 색상, 광원 그림자의 부드러운 변화
- **TouchCatch 벤치마킹**: `Traditional Watercolor & Ink` 및 `Cozy Storybook` 스타일 정의

### 2) Hidden Lands / Tiny Tales 3D (Steam/Mobile - 미니멀 Low-Poly & Clay)
- **아트 스타일**: 3D 로우폴리(Low-Poly), 찰흙(Claymation), 틸트시프트 미니어처 감성
- **게임 구성**: 다채로운 섬/건물을 360도 회전하며 입체적으로 틀린 부분 탐색
- **차이점 특징**: 미니어처 건물 위 작은 창문 프레임, 지붕 타일 색상, 작은 캐릭터 포즈
- **TouchCatch 벤치마킹**: `Handcrafted Clay Diorama` 스타일 정의

### 3) Spectator / Para Eyes (Steam - 사이버/이상현상 탐지)
- **아트 스타일**: 하이테크 3D, CCTV 사이버 뷰, 강렬한 네온과 그늘진 조명
- **게임 구성**: 모니터링 화면을 오가며 조용히 바뀌는 "이상 현상(Anomaly)"을 적발
- **차이점 특징**: 홀로그램 아이콘 변경, 네온 조명 색상, 벽면 그래피티 문양 변형
- **TouchCatch 벤치마킹**: `Cyberpunk Sci-Fi Neon` 스타일 정의

### 4) Differences - Spot the Difference (모바일 1억+ DL - 초고화질 실사)
- **아트 스타일**: High-Resolution 초고화질 스튜디오 렌더링/실사 스튜디오 샷
- **게임 구성**: 스테이지별 5~10개 틀린그림, 줌(Zoom/Pinch) 기능 지원
- **차이점 특징**: 섬세한 텍스처, 오브젝트 1개 미세 삭제, 광택 변경
- **TouchCatch 벤치마킹**: `High-End 3D Pixar Rendering` 스타일 정의

---

## 🎨 3. TouchCatch 차세대 이미지 생성 5대 시그니처 스타일 토큰

| 시그니처 스타일 | 벤치마크 게임 | 프롬프트 스타일 토큰 (Prompt Style Tokens) | 대상 카테고리 |
|:---|:---|:---|:---|
| **1. Handcrafted Clay Diorama** | *Hidden Lands* | `Handcrafted 3D Claymation, plasticine texture, soft miniature lighting, tilt-shift lens feel, cozy warm shadows` | 음식, 베이커리, 어린이, 동화 |
| **2. High-End 3D Pixar Render** | *Differences 3D* | `High-end 3D Pixar animation render, rich volumetric studio lighting, vibrant depth, glossy textures` | 현대 직업, 탐정, 도시, 과학 |
| **3. Cyberpunk Sci-Fi Hologram** | *Spectator* | `Futuristic 3D Sci-Fi render, glowing cyan-purple neon accents, metallic surfaces, cinematic contrast` | 우주, 미래 기술, 로봇, 신소재 |
| **4. Cozy Oriental Watercolor** | *Broken Lens* | `Traditional Korean watercolor ink wash, soft brush strokes, elegant gradient textures, paper grain` | 한국 속담, 사자성어, 고전 명언 |
| **5. Layered Papercut Craft** | *Paper Puzzles* | `Layered papercut craft art, visible paper grain, shadow depth, clean die-cut edges, pastel color palette` | 해안가 풍경, 자연 생태계, 우주 |

---

## 📐 4. 차이점(Differences) 배치 및 사람 눈 식별성 프롬프트 설계 규칙

1. **9분할 그리드 균등 배치**: 화면 전체(상, 중, 하, 좌, 우)에 10개 요소를 고르게 분산
2. **명암 및 보색 대비 극대화**: `Red ↔ Teal`, `Yellow ↔ Violet`, `White ↔ Royal Blue` 보색 대조 적용
3. **독립 오브젝트 완제 교체/제거**: 소품(시계, 머그잔, 두레박, 스크롤, 랜턴 등)을 깔끔하게 추가/제거
