# 틀린그림찾기 이미지 현황 분석 및 다각화·확장 계획서 리뷰 (Review Report)

작성일자: 2026-07-20
대상 문서: `implementation_plan.md` (콘텐츠 다각화 및 확장 계획서)

## 1. 개요
현재 제안된 `implementation_plan.md`는 콘텐츠의 양적, 질적 성장을 위한 훌륭한 비전을 제시하고 있습니다. 하지만 현재 TouchCatch의 엄격한 유효성 검증 파이프라인(Validation Pipeline), 스키마 제약, 그리고 리뷰 프로세스의 현실을 고려할 때, 제안된 구현 계획(Proposed Changes)이 시스템과 충돌하는 지점들이 다수 발견되었습니다.

이에 따라 코드베이스와 워크플로우를 분석하여 다음과 같은 문제점 및 개선 사항을 도출하였습니다.

---

## 2. 주요 문제점 및 개선 사항 (Actionable Feedback)

### ① 스키마 구조의 하드코딩 제약 (Critical Blocker)
**문제점:** 
현재 `content/learning/catalog.schema.json`은 다음과 같이 항목을 강제하고 있습니다.
- `entries`: `minItems: 9, maxItems: 9` (정확히 9개만 허용)
- `category`: `["ENGLISH", "PROVERB", "IDIOM"]`
- `language`: `["en", "ko"]`

또한 `tools/content/write-learning-manifest.ts` 스크립트 내부에도 `if (draftFiles.length !== 9)` 와 같이 9개로 하드코딩된 검증 로직이 존재합니다. 
이 상태에서 50개의 신규 테마(과학, 역사 등)나 새로운 언어(스페인어, 일본어 등)를 `catalog.v1.json`에 추가하면 `pnpm content:validate` 과정에서 즉각적으로 스키마 에러가 발생하며 파이프라인이 중단됩니다.

**개선 방안:**
- 확장 계획을 실행하기 전, **스키마 마이그레이션(Schema Migration)이 선행**되어야 합니다.
- `catalog.schema.json`의 개수 제한을 해제(혹은 상향)하고, Enum 타입에 신규 카테고리와 언어를 등록해야 합니다.
- `write-learning-manifest.ts`의 하드코딩된 개수 제한 로직을 제거해야 합니다.

### ② 수동 리뷰 프로세스의 병목 (Workflow Bottleneck)
**문제점:**
`content/learning/review-checklist.md`에 따르면, 모든 에셋은 퍼블리시 되기 전 인권 리뷰, 교육 목적 리뷰, 실제 기기(iOS/Android) 터치 타겟 테스트를 거쳐야 합니다 (`REVIEW_REQUIRED`).
AI 생성 도구(`content-generator.ts`)를 통해 50개의 씬을 일괄 생성하더라도, 이를 모두 수동으로 검증하고 `publishBlocked: false`로 전환하는 과정에서 막대한 병목 현상이 발생할 것입니다.

**개선 방안:**
- 일괄 생성된 드래프트 팩들을 검수할 수 있는 **어드민 내부용 Batch Review UI/CLI 도구** 구축 계획이 Phase 3에 포함되어야 합니다.
- AI가 생성한 결과물(특히 히트박스 영역)에 대해 1차적인 자동 검증(Confidence Score)을 부여하여 사람의 검수 시간을 단축시키는 로직이 필요합니다.

### ③ 중복 툴링 및 설계 오류 (Tooling Redundancy)
**문제점:**
계획서에서는 이미지 델타 추적을 위해 `[NEW] batch-visual-delta.ts` 도구를 새로 만들자고 제안했습니다. 
하지만 이미 `tools/content/visual-delta.ts` (델타 평가 로직)와 `build-learning-entry.ts` (엔트리별 처리 로직)가 존재합니다. 

또한 `manifest.v1.json`을 수동으로 수정(`[MODIFY]`)한다고 되어있지만, 이 파일은 `write-learning-manifest.ts`에 의해 **자동 생성(Auto-generated)** 되는 파일이므로 직접 수정하면 파이프라인 정합성이 깨집니다.

**개선 방안:**
- 새로운 스크립트를 만들기보다는 기존 `build-learning-entry.ts`가 다중 키(Multiple Keys) 배열을 받아 순회(loop)할 수 있도록 리팩토링하는 것이 유지보수에 유리합니다.
- `manifest.v1.json`은 직접 수정 파일 목록에서 제외하고, "빌드 스크립트 실행을 통한 자동 갱신"으로 계획을 변경해야 합니다.

### ④ 프롬프트 출처 (Prompt Provenance) 추적 의무
**문제점:**
`content/learning/prompts/README.md` 규칙에 따르면, 각 생성된 이미지는 사전에 사용된 프롬프트(`-base.txt`, `-edit.txt` 등)를 정확히 파일로 남겨야 하며, 카탈로그가 이 파일들의 SHA-256 해시를 검증합니다.
계획된 `content-generator.ts`가 이미지만 생성하고 프롬프트 텍스트 파일을 지정된 위치에 저장하지 않으면 시스템이 에셋 등록을 거부합니다.

**개선 방안:**
- `content-generator.ts`의 파이프라인에 AI 프롬프트 원문을 `prompts/` 디렉토리에 UTF-8 텍스트로 자동 저장하는 로직을 명시적으로 추가해야 합니다.

---

## 3. 종합 결론 및 Next Step 제안

현재 제안된 기획안은 방향성은 매우 훌륭하나, TouchCatch의 견고한 콘텐츠 무결성 아키텍처 위에서 실행되기 위해서는 **"Phase 0: 파이프라인 및 스키마 유연화(Decoupling & Migration)"** 단계가 선행되어야 합니다.

**[수정된 로드맵 제안]**
1. **Phase 0:** `catalog.schema.json` 및 검증 스크립트(`write-learning-manifest.ts`) 내 하드코딩(9개 제한) 해제 및 카테고리 Enum 확장.
2. **Phase 1:** `build-learning-entry.ts`의 Batch 지원 리팩토링 및 `content-generator.ts` (프롬프트 기록 기능 포함) 구현.
3. **Phase 2:** 다각화된 50개 테마 카탈로그 데이터 주입 및 AI 에셋 일괄 생성.
4. **Phase 3:** 대량 에셋 처리를 위한 검수 워크플로우 효율화(어드민 도구 지원 등).

위 사항들을 반영하여 `implementation_plan.md` 문서를 갱신하면 완벽한 기술적 실행 계획이 될 것입니다.
