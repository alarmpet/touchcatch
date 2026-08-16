# 🎨 TouchCatch: 6대 아트 스타일 및 대규모 이미지 생성 확장 가이드 (Prompts Expansion Guide v5)

## 📌 1. 개요
본 가이드는 TouchCatch 'Spot & Learn Battle'의 시각적 다양성, 고품질 감성, 사람 눈 식별 용이성을 대폭 확장하기 위한 **6대 시그니처 아트 스타일 표준**과 **10개 차이점 프롬프트 작성 규격**을 정의합니다.

---

## 🎨 2. 6대 시그니처 아트 스타일 사양

### Style 1: Modern Low-Poly 3D (`modern-low-poly`)
- **디자인 토큰**: Vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, soft studio daylight
- **추천 적용 대상**: 기초 영단어, 파닉스, 초등 수학, 입문 학습 팩
- **핵심 무드**: 모던하고 깨끗한 기하학적 형태, 깔끔한 시각 경험

### Style 2: Handcrafted Claymation (`handcrafted-claymation`)
- **디자인 토큰**: Plasticine clay texture, handcrafted visual, soft tactile shadows, warm studio rim light
- **추천 적용 대상**: 가족, 동화, 음식, 동물, 친근한 한국 속담 팩
- **핵심 무드**: 손으로 빚은 듯한 질감과 촉감적 온기

### Style 3: Layered Papercut Art (`layered-papercut`)
- **디자인 토큰**: Papercraft layered art, visible paper grain, shadow depth, clean die-cut edges, cinematic color grading
- **추천 적용 대상**: 해안가 풍경, 밤하늘, 감성 속담, 서정적 명화 팩
- **핵심 무드**: 종이를 오려 겹겹이 쌓은 아날로그 감성과 우아함

### Style 4: High-End 3D Pixar Style (`high-end-pixar`)
- **디자인 토큰**: High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich tactile textures
- **추천 적용 대상**: 현대 직업, 탐정 수수께끼, 과학 실험실, 활기찬 도시 팩
- **핵심 무드**: 생동감 넘치고 생생한 캐릭터와 조명 표현

### Style 5: Cyberpunk Sci-Fi Neon (`cyberpunk-sci-fi`)
- **디자인 토큰**: Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic contrast lighting
- **추천 적용 대상**: 우주 탐사, 미래 기술, 로봇, 신소재, 차세대 에너지 팩
- **핵심 무드**: 화려한 네온 빛과 미래지향적 하이테크 감성

### Style 6: Traditional Watercolor & Ink (`traditional-watercolor-ink`)
- **디자인 토큰**: Traditional Korean watercolor ink wash, soft brush strokes, elegant gradient textures, traditional paper feel
- **추천 적용 대상**: 한국 사자성어, 고전 명언, 전통 유적, 역사 팩
- **핵심 무드**: 동양 수묵화의 그윽한 먹선과 수채화 필선

---

## 📐 3. 10가지 틀린 그림(Differences) 프롬프트 작성 10계명 (Human Eye Friendly Rule)

사람 눈(Human Eye)으로 확 드러나면서도 픽셀 노이즈를 일으키지 않도록 다음 10가지 규칙을 엄격 적용합니다:

1. **대비 명확화 (High Contrast Color Shift)**: 주 오브젝트의 색상을 파란색 ➔ 쨍한 빨간색, 분홍색 ➔ 쨍한 노란색 등 명확한 보색으로 변경
2. **독립 오브젝트 완제 삭제 (Complete Local Removal)**: 작은 부속품(예: 찻잔, 노, 열쇠, 표지판)을 잔상 없이 완전히 제거
3. **독립 오브젝트 신규 추가 (Clean Local Addition)**: 빈 공간(바위 위, 테이블 위, 벽면)에 1개의 뚜렷한 소품 추가
4. **부속 형태 완전 변형 (Distinct Shape Modification)**: 예: 둥근 모양 ➔ 별 모양, 사각형 ➔ 삼각 깃발
5. **글로우스파크 전면 전환 (Glow State Shift)**: 글로우/램프 불빛 색상 변경
6. **텍스처 대조 전환 (Pattern/Texture Shift)**: 굵은 스트라이프 ➔ 체크무늬
7. **각도 및 포즈 전향 (Angle/State Shift)**: 시계 바늘 위치, 문이 닫힘 ➔ 열림
8. **투명도 및 소재 전환 (Material Shift)**: 목재 ➔ 쨍한 은색 금속
9. **크기 명확 변경 (Scale Boost)**: 작음 ➔ 대형 강조
10. **배경 노이즈 엄금 (Zero Background Noise)**: 배경 바닥, 먼지, 전체 하늘 조명을 무단 변경하지 않고 지정 오브젝트만 국소 변경 (Single 1:1 Image)

---

## 🗂️ 4. 신규 테마 팩 확장 리스트 (Phase 2 Preview)
- `ko-proverb-frog-well` (우물 안 개구리) - Traditional Watercolor Ink
- `ko-idiom-daegi-manseong` (대기만성) - Traditional Watercolor Ink
- `en-phonics-bear` (B - Bear) - Handcrafted Claymation
- `en-space-blackhole` (Blackhole Expedition) - Cyberpunk Sci-Fi Neon
- `en-profession-detective` (Detective Office) - High-End 3D Pixar
