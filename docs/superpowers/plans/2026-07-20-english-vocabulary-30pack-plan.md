# 📚 영어 어휘 30개 세트(초/중/고급) 확장 및 틀린그림 난이도 체계화 계획서

## 1. 틀린그림찾기 난이도 메커니즘 분석 및 문제점 진단

### 현재 난이도 설정 방식 (Codebase Reality)
현재 저장소 아키텍처에서 틀린그림찾기의 난이도는 크게 **(1) 씬 전체 난이도(`difficulty`)**, **(2) 씬 내부 차이점 등급(`tier`)**, **(3) 히트박스 반경(`r`) 및 픽셀 델타 정책(`policy`)**으로 설정됩니다.

1. **글로벌 씬 난이도 (`difficulty`)**: `BEGINNER`, `INTERMEDIATE`, `ADVANCED` 3단계
2. **씬 내부 차이점 등급 (`tier`)**: 씬당 10개 차이점 중 **7개 NORMAL** (6점), **3개 HARD** (9점) 분포 (`config/ruleset.v1.json`)
3. **히트박스 터치 반경 (`r`)**: 이미지 상대 비율 (0.0 ~ 0.25)

### 발생하던 문제점 (너무 쉽거나 너무 어려운 이유)
- **AI 이미지 생성 제어 부족**: 프롬프트에서 변형 오브젝트의 크기나 시각적 눈에 띔 정도를 정량화하지 않으면, AI가 배경 전체 색을 바꾸거나(너무 쉬움) 2픽셀짜리 미세 노이즈만 변경(너무 어려움/불쾌함)하는 현상이 일어납니다.
- **히트박스 반경 불균형**: 눈에 크게 띄는 변화에 지나치게 작은 히트박스가 적용되거나, 반대로 미세한 변화에 너무 넓은 히트박스가 지정되면 플레이 타격감이 떨어집니다.

---

## 2. 난이도별 히트박스 & 시각 변형 표준화 마트릭스

난이도 불균형을 해결하기 위해 난이도별 **변형 유형(Edit Type)**과 **터치 영역 반경(`r`)**을 아래와 같이 명확히 규격화합니다.

| 구분 | 초급 (`BEGINNER`) | 중급 (`INTERMEDIATE`) | 고급 (`ADVANCED`) |
| :--- | :--- | :--- | :--- |
| **타겟 연령/수준** | 초등 저학년 ~ 초등 필수 | 초등 고학년 ~ 중등 필수 | 중고등 수능 ~ 성인 어휘 |
| **터치 반경 (`r`)** | **`0.075 ~ 0.095`** (넓은 터치 영역) | **`0.055 ~ 0.070`** (표준 터치 영역) | **`0.035 ~ 0.050`** (정밀 터치 영역) |
| **NORMAL 7개 유형** | 명확한 색상 전환(대형), 전체 오브젝트 추가/제거 | 중앙 소품 모양 변형, 패턴 변경(체크/스트라이프) | 미세 부분 색상 변경, 소형 소품 추가/제거 |
| **HARD 3개 유형** | 중형 오브젝트 좌우 반전, 슬랫 방향 변경 | 부분 텍스처 변형, 미세 각도 회전 | 픽셀 단위 텍스트 변형, 극소 미세 부품 추가 |
| **오탐 방지 임계값** | `pixelThreshold: 45` | `pixelThreshold: 60` | `pixelThreshold: 96` |

---

## 3. 영어 어휘 30개 세트 확장 커리큘럼 (초10 / 중10 / 고10)

### 🟢 초급 10개 세트 (`BEGINNER`) — 초등 필수 800선 연계
1. `en-apple-orchard` (Apple / 과수원 씬)
2. `en-school-classroom` (School / 교실 정원 씬)
3. `en-happy-family` (Family / 거실 가족 씬)
4. `en-toy-hospital` (Doctor / 펫 병원 씬)
5. `en-city-park` (Park / 공원 놀이터 씬)
6. `en-yellow-bus` (Bus / 스쿨버스 정류장 씬)
7. `en-funny-zoo` (Zoo / 동물원 씬)
8. `en-sweet-bakery` (Cookie / 제과점 씬)
9. `en-summer-beach` (Summer / 해변 휴양지 씬)
10. `en-space-rocket` (Rocket / 우주선 발사대 씬)

### 🟡 중급 10개 세트 (`INTERMEDIATE`) — 중등 필수 1,200선 연계
11. `en-resilience-garden` (Resilience / 회복탄력성 - 화단 복구 씬)
12. `en-sustainability-greenhouse` (Sustainability / 지속가능성 - 온실 정원 씬)
13. `en-dilemma-fair` (Dilemma / 딜레마 - 진로 박람회 씬)
14. `en-curiosity-lab` (Curiosity / 호기심 - 과학 실험실 씬)
15. `en-opportunity-station` (Opportunity / 기회 - 기차역 대합실 씬)
16. `en-harmony-orchestra` (Harmony / 조화 - 음악당 합주 씬)
17. `en-adventure-camp` (Adventure / 모험 - 캠핑장 씬)
18. `en-tradition-market` (Tradition / 전통 - 시장 거리 씬)
19. `en-biodiversity-forest` (Biodiversity / 생물다양성 - 국립공원 씬)
20. `en-heritage-museum` (Heritage / 유산 - 역사 박물관 씬)

### 🔴 고급 10개 세트 (`ADVANCED`) — 수능/SAT 필수 1,500선 연계
21. `en-ambiguity-gallery` (Ambiguity / 모호성 - 현대 미술관 씬)
22. `en-phenomenon-observatory` (Phenomenon / 현상 - 천문대 씬)
23. `en-infrastructure-city` (Infrastructure / 기간시설 - 스마트시티 건설 씬)
24. `en-paradox-library` (Paradox / 역설 - 마법 도서관 씬)
25. `en-counterpart-summit` (Counterpart / 상대방 - 국제 회담장 씬)
26. `en-perspective-studio` (Perspective / 관점 - 디자인 스튜디오 씬)
27. `en-versatility-workshop` (Versatility / 다재다능 - 로봇 공방 씬)
28. `en-fluctuation-exchange` (Fluctuation / 변동 - 증권 거래소 씬)
29. `en-equilibrium-aquarium` (Equilibrium / 평형 - 대형 아쿠아리움 씬)
30. `en-sovereignty-palace` (Sovereignty / 주권 - 궁전 접견실 씬)

---

## 4. 실행 및 자동화 툴링 파이프라인

1. **프롬프트 템플릿 제어 (`tools/content-generator.ts`)**:
   - 난이도 파라미터(`difficulty`)를 받아 프롬프트 생성 시 `Edit Type`과 `Object Size` 가이드라인을 강제하여 AI가 적절한 크기의 차이점만 생성하도록 통제합니다.
2. **자동 히트박스 & 터치 반경 동적 할당 (`auto-detect-delta.js`)**:
   - 델타 오토 디텍터가 난이도(`BEGINNER`: `r=0.085`, `INTERMEDIATE`: `r=0.065`, `ADVANCED`: `r=0.045`)에 따라 터치 반경을 자동 설정합니다.
3. **일괄 검증 및 마니페스트 반영**:
   - `pnpm content:validate` 및 `write-learning-manifest.js`를 구동하여 30개 세트가 무결성 검사를 통과하도록 처리합니다.
