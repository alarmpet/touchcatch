# Implementation Plan v3 (옵션 A) 리뷰

| 항목 | 내용 |
|:---|:---|
| **작성일** | 2026-07-27 |
| **대상** | `C:\Users\petbl\.gemini\antigravity\brain\7132e410-4044-4530-8d41-3d4ee6c4a184\implementation_plan.md` |
| **보조 문서** | `D:\touchcatch\research.md`, `content/learning/prompts_100_guide/PROMPTS_100_GUIDE.md` |
| **검토 범위** | `content/learning/**`, `tools/content/**`, `content/learning/scripts/**`, `package.json` 스크립트, `.github/workflows/ci.yml`, 기존 리뷰(`docs/reviews/*`, `docs/superpowers/plans/*`) |
| **판정** | **방향(옵션 A: 새 이미지 → 픽셀 기반 동기화)은 맞다. 다만 계획서·연구 문서·실제 코드가 서로 어긋나 있으며, 현재 스크립트 상태로는 문서에 적힌 4단계 파이프라인이 실행되지 않는다.** 79팩 일괄 생성 전에 아래 P0를 먼저 닫을 것을 권한다. |

---

## 1. 한 줄 요약

옵션 A의 핵심 문장 — *「학습 메타는 유지하고, 이미지·`changes[]`·geometry·evidence만 실제 픽셀 기준으로 재동기화」* — 는 카탈로그/프롬프트 불일치 문제에 대한 올바른 처방이다.  
문제는 **그 처방이 문서에만 있고, 구현·검증·운영 경로가 아직 연결되지 않았다**는 점이다.

| 문서 주장 | 코드 현실 (2026-07-27 스냅샷) |
|:---|:---|
| `generate_packs_api.py` 로 79팩 라이브 생성 | `--live` 분기에 **API 호출 본문이 스텁** (`Live API call would go here`) |
| `sync_catalog_changes.py` 가 탐지 클러스터 ↔ 프롬프트 매칭 후 geometry 갱신 | **프롬프트 영문 10줄을 catalog `changes[]`에 복사**만 함. auto-detect/geometry 미연동 |
| `validate_word_hunts.py` 가 새 이미지 내 오브젝트 존재 확인 | **Image A 프롬프트 문자열 부분일치**만 검사 (이미지 미참조) |
| 스크립트 2개 **🔲 신규** | 이미 디스크에 존재 — 다만 계획 스펙과 **불일치** |
| Phase 4 후 `publishBlocked: false` | manifest **79/79 `publishBlocked: true`**, 전부 리뷰 게이트 유지 |
| research.md: 검증 완료 **56팩**, 임계값·클러스터 파라미터 특정 값 | catalog/manifest **79**, drafts **83**, auto-detect 파라미터는 research와 **다름** |

---

## 2. 현황 실측 (코드베이스)

### 2.1 규모·정합

| 지표 | 값 | 비고 |
|:---|---:|:---|
| `catalog.v1.json` entries | **79** | 프롬프트 가이드·`prompts_data.json`과 키 100% 교집합 |
| `prompts_data.json` packs | **79** | only-catalog / only-prompts = 0 |
| `manifest.v1.json` entries | **79** | 전원 `publishBlocked: true`, `status: DRAFT` |
| `drafts/*.json` | **83** | catalog에 없는 4키 잔존 (`en-3d-serenity-temple`, `en-isometric-lab`, `en-3d-solitude-peak`, `en-3d-tranquility-tea`) |
| `geometry/*.json` | **80** | catalog 대비 +1 수준 드리프트 |
| `source/*-a.png` | **80** | 동일 |
| 고아/잡파일 | jpeg 다수 | `contentlearningsourceen-*.jpeg` 등 경로 오결합 파일명 존재 |

### 2.2 계획서 진단 3항목 검증

| 계획서 진단 | 실측 | 평가 |
|:---|:---|:---|
| Critical: catalog `changes[]` ↔ 프롬프트 100% 불일치 | catalog 예: 한국어 *「중앙 모종밭의 보라색 꽃을…」* / 프롬프트 예: 영어 *「Change the fluttering school flag…」* — **장면·대상 자체가 다름** | 동의. 단순 번역 불일치가 아니라 **의도 단절** |
| Important: Image A에 학습 단어 미등장 | 영어 팩 기준 **canonicalAnswer가 imageAPrompt에 없는 케이스 ≈ 46** (예: resilience, dilemma, sustainability…) | 동의. 다만 “13개”로 적힌 수치는 **과소** |
| Important: 동일 단어 중복 | serenity×4, creativity×4, camaraderie×3, tranquility×3 … | 동의. 의도적 테마 변형인지 정책 문서화 필요 |

### 2.3 파이프라인 실제 연결 (research.md 7단계 vs 옵션 A 4단계)

기존 운영 경로(이미 코드에 있음):

```
source A/B
  → convert-png / batch-build
  → auto-detect-delta (또는 기존 geometry 보존)
  → build-learning-entry (visual-delta + write-learning-bundle)
  → write-learning-manifest
  → generate-registry
```

옵션 A가 앞에 붙이려는 생성 경로:

```
PROMPTS_100_GUIDE → parse → generate_packs_api → validate_image_pairs
  → sync_catalog_changes → (기존 빌드)
```

**현재 생성 경로는 dry-run 시뮬레이터 수준**이며, 동기화 스크립트는 “픽셀 기반 재작성”이 아니라 “프롬프트 텍스트 덮어쓰기”다. 즉 옵션 A의 **핵심 가치(실제 이미지 기반 catalog 재동기화)가 구현되지 않았다.**

---

## 3. 계획서 문제점 (P0 → P2)

### P0-1. `generate_packs_api.py` 가 “완료”로 표기됐으나 라이브 미완성

**사실**

- Fal / Vertex 클라이언트 클래스 골격은 있음.
- `run_batch()` 의 `--live` 경로는 주석 스텁이며, 이미지 다운로드·저장·재시도·부분 재개 로직이 없다.
- 계획의 검증 Step 2(`--max-packs 5 --live`)는 **현 코드로는 이미지 파일을 만들지 못한다.**

**권고**

1. 상태를 문서에서 `✅ 완료` → `🟡 스켈레톤 / 라이브 미완` 으로 수정.
2. 라이브 구현 최소 계약:
   - Image A 생성 → `source/{key}-a.png` 원자적 쓰기
   - Image B는 **누적 편집 체인**인지 **마스크 기반 독립 편집**인지 명시
   - 팩 단위 체크포인트 JSON (이미 생성된 단계 스킵)
   - 실패 시 반쪽 산출물 격리 (`source/_failed/` 또는 `.partial`)
3. `package.json`에 `content:learning:generate` 등 단일 엔트리 추가 (Python 경로·cwd 고정).

### P0-2. `sync_catalog_changes.py` 가 계획의 핵심 알고리즘과 불일치

**계획서 pseudocode**

- auto-detect 클러스터 로드
- 프롬프트 변경문 ↔ 클러스터 **위치 매칭**
- `changes[]` + `geometry/{key}.json` 동시 갱신

**실제 구현**

- `prompts_data.json` 의 영어 문장 10개를 `entry.changes` 에 그대로 대입
- geometry / auto-detect **미호출**
- 한국어는 `"[변경] Change the …"` 식 접두 규칙(사실상 미번역)
- `promptProvenance` 를 FAL/FLUX로 덮어쓰나, 실제 생성 여부와 무관하게 갱신 가능

**왜 치명적인가**

- catalog `changes[]`는 플레이어/검수에게 보이는 **차이 설명**이다. 프롬프트 의도만 넣고 픽셀 좌표와 1:1이 아니면, 히트박스와 설명이 어긋난 팩이 대량 생산된다.
- 탐지 순서는 픽셀 강도 기반이라 **프롬프트 번호 순서와 일치하지 않는다.** 매칭 없이 순서대로 붙이면 오설명 확정.

**권고 — 동기화를 2계층으로 쪼개라**

| 계층 | 산출 | 소스 of truth |
|:---|:---|:---|
| **L1 Intent** | 구조화 변경 의도 (target/location/before/after/changeType/salience) | `PROMPTS_100_GUIDE` / quality manifest (가이드 상단 계약 이미 존재) |
| **L2 Observed** | 실제 클러스터 `(cx,cy,r,pixelCount)` | `auto-detect-delta.js` |
| **Bind** | `difference_i` ↔ intent 매칭 결과 + 신뢰도 | 신규 `sync`가 쓸 **바인딩 테이블** |

매칭 전략 제안:

1. 1차: 각 intent의 location 키워드 → 장면 영역 휴리스틱(선택) 또는 **마스크/영역 프롬프트**가 있으면 그 중심.
2. 현실적 1차(지금 가능한 것): 탐지된 10클러스터를 geometry로 확정하고, intent 10개는 **사람이 5분 이내 드래그 매칭**할 수 있는 리뷰 큐 JSON 생성. 완전 자동 매칭은 2차.
3. catalog `changes[]` 언어 정책 명시: 현 카탈로그는 **한국어 설명**이 주류. 영어 지시문 원문 삽입은 UX/교육 리뷰와 충돌. `changes[]`는 **학습자용 한국어**, provenance/quality는 영어 intent 유지가 맞다.

### P0-3. 10× 순차 inpainting 전략의 누적 드리프트

계획: Image A 1장 + 변경당 1회 edit ×10 = 790 edit.

**리스크 (계획 표에 약함)**

| 리스크 | 설명 | 파이프라인 영향 |
|:---|:---|:---|
| 누적 드리프트 | 10회 연쇄 edit 시 조명·텍스처·얼굴이 점진 변화 | `UNDECLARED_VISUAL_DELTA` (outside ratio) 폭증 |
| 부분 적용 실패 | 일부 지시 무시 → 클러스터 <8 | FAIL 재생성 루프 비용 |
| 순서 의존 | 앞 edit가 뒤 대상을 지움/가림 | 특정 change 영구 소실 |
| 비용 하한선 낙관 | $13.43는 **1회 성공 가정**. 재시도 2~3배 흔함 | 실비용 $30–50+ 가능 |

**더 나은 방향 (권고 우선순위)**

1. **단일 복합 edit 프롬프트 1회** (가이드의 Image B full prompt)로 B를 만들고, QA 실패 팩만 개별 inpaint 재시도 — 호출 수·드리프트 동시 감소.
2. 또는 **A 고정 + 영역 마스크 10회 독립 edit 후 합성**(가능 모델 한정) — 순서 의존 제거.
3. 어떤 전략이든 **edit 사이 중간 스냅샷 해시**를 로그에 남겨 어느 지점 롤백.

계획의 “추천 조합 Imagen4 Fast + FLUX.2 Turbo Edit” 자체는 합리적이나, **전략 선택 근거와 실패 시 폴백 순서**가 문서에 없다.

### P0-4. `validate_image_pairs.js` 가 게시 게이트와 느슨하게 연결됨

**사실**

- 난이도를 항상 `'INTERMEDIATE'` 로 고정 (catalog `difficulty` 미반영). ADVANCED 팩(`en-resilience` 등)은 r=0.055가 맞는데 검증은 0.070으로 돌아 판정이 왜곡된다.
- `visual-delta.ts` 를 호출하지 않음 — 헤더 주석과 불일치. 클러스터 **개수**만 본다.
- PASS 기준: 정확히 10 / WARN: 8–9 / FAIL: <8. 계획의 “10개 예상, <8 재생성”과 대체로 맞지만, **outside ratio·영역 내 최소 픽셀**은 보지 않음.
- `auto-detect-delta` 함수 기본 `pixelThreshold=75`, CLI 엔트리는 `60`, 클러스터 유효 픽셀 `>=150`, geometry policy는 흔히 `minChangedPixelsPerRegion: 24` — **한 파이프라인에 임계값이 3벌**.

**권고**

- validate 시 catalog difficulty 로드.
- PASS 정의를 `build-learning-entry` 성공(즉 visual-delta PASS)과 동일하게 맞출 것. 개수 게이트만으로는 Phase 4에서 대량 실패한다.
- 임계값 단일 SSOT: `RADIUS_BY_DIFFICULTY` + `pixelThreshold` + `minChangedPixels` + `maxOutside` 를 한 모듈/JSON에서 import.

### P0-5. WordHunt / SuddenDeath 가 “유지” 전제와 충돌

계획: wordHunts·suddenDeath 메타 **유지**, 새 이미지에 오브젝트 있으면 OK.

**현실**

1. `validate_word_hunts.py` 는 **프롬프트 텍스트**만 본다 → 이미지에 없어도 통과, 프롬프트에 동의어 없으면 오탐.
2. `batch-build.js` 가 geometry 없을 때 wordHunt 좌표를 **difference 클러스터 중심에 재사용**하고 publicPrompt를 `Find item 1 in {key}` 로 채움 → review-checklist의 *「Word Hunt가 difference 정답을 노출/겹치지 말 것」* 과 정면 충돌.
3. 기존 geometry `en-resilience` 도 wordHunt가 difference와 동일/인접 좌표를 쓰는 흔적이 있음.

**권고**

- 새 이미지 생성 프롬프트에 **catalog wordHunts/suddenDeath object를 명시적으로 포함** (생성 전 강제 패치 스크립트).
- WordHunt 좌표는 difference 비겹침 제약을 코드로 검증 (`distance >= 2r` + difference 원과 비겹침).
- vision 모델/수동 검수 전엔 “prompt contains object” 를 **WARN** 으로만 취급, PASS 조건에서 제외.

### P0-6. 게시·리뷰 게이트 누락 (이전 리뷰와 동일, 여전히 유효)

계획 Phase 4 기대: `manifest … publishBlocked: false`.

**코드/정책**

- `packages/content-validator` 학습 드래프트 검증은 권리/교육 미승인 시 계속 block.
- 테스트(`all-content.test.ts` 등)는 `REVIEW_REQUIRED` 를 **기대**한다.
- `review-checklist.md` 는 아직 “nine-pack” 시대 문구.

→ **이미지 79팩을 다 만들어도 프로덕션 게시 0**. 옵션 A 성공 정의를 “데모 플레이 가능 드래프트” vs “publishBlocked false” 로 분리하지 않으면 일정·기대치가 왜곡된다.

**권고 성공 정의 재작성**

| 마일스톤 | 정의 |
|:---|:---|
| M1 | 5팩 시범: A/B + geometry + visual-delta PASS + catalog changes 한국어 정합 |
| M2 | 79팩 드래프트 빌드 + registry 데모 로드 |
| M3 | 샘플 N팩 인간 리뷰 후 승인 파이프라인 검증 (전량 아님) |
| M4 | 게시(선택) — 권리/교육 승인 워크플로 |

---

## 4. research.md 문제점

`research.md` 는 **기존 빌드 파이프라인 설명서로는 유용**하나, 옵션 A 의사결정 문서와 짝을 이루기엔 다음이 부족/부정확하다.

| 이슈 | 상세 |
|:---|:---|
| **범위 누락** | `prompts_100_guide`, `generate_packs_api`, `sync_catalog_*`, `validate_image_pairs` 생성 경로 미기술 |
| **팩 수 stale** | “56팩 검증 완료” → 현재 catalog/manifest **79** |
| **파라미터 stale** | research: pixelThreshold 60, 클러스터 ≥50px / 코드: 함수 기본 75, 유효 클러스터 ≥**150**, CLI 60 |
| **반경 표** | research의 r 매핑은 현재 `auto-detect-delta.js` 와 대체로 일치(개선됨). 반면 구 리뷰(2026-07-21)의 “r 고정 0.065”는 **이미 코드가 수정됨** — research는 최신, 구 리뷰는 부분 obsolete |
| **정책 값 불일치** | geometry 파일 `maxOutsideChangedRatio: 0.15` vs research 서술 0.05/0.08 |
| **무결성 과장** | “catalog↔manifest 100% 동기화” — entry 수는 맞을 수 있으나 drafts 83, 잡 jpeg, absolute path assetFiles 등 **주변 드리프트** 존재 |
| **옵션 A 비권고** | 카탈로그-프롬프트 단절·재생성 전략 결론이 없어 implementation_plan과 **논리 연결고리 없음** |

**권고**: research.md 를 (1) 파이프라인 SSOT 절, (2) 파라미터 표(코드 링크), (3) 생성 경로 절, (4) 현재 inventory 표로 갱신하거나, 옵션 A 계획에 “research 파라미터는 참고용, 코드 상수 우선” 한 줄을 명시.

---

## 5. 워크플로·운영 문제

### 5.1 CI (`.github/workflows/ci.yml`)

- `pnpm check` 풀세트 — 콘텐츠 증분 검증 없음.
- 학습 이미지 대량 커밋 시 checkout/LFS/시간 비용 급증 (2026-07-21 리뷰 P0-1과 동일, **미해결**).
- Python 생성 스크립트는 CI에 없음 (정상일 수 있으나, 파서/동기화 **단위 테스트도 없음**).

### 5.2 하드코딩 절대 경로

다음이 `d:\touchcatch\...` 고정:

- `parse_prompts_guide.py`
- `generate_packs_api.py`
- `sync_catalog_changes.py`
- `validate_word_hunts.py`

다른 머신·CI·worktree에서 즉시 실패.  
또한 drafts `assetFiles` 에 `D:\\touchcatch\\...` 절대 경로 기록 — 재현성·보안(로컬 레이아웃 노출) 문제.

### 5.3 프롬프트 provenance 이중 체계

- 저장소 규칙: `content/learning/prompts/{key}-base.txt` 등 파일 + SHA.
- 새 계획: `promptProvenance` 를 API 메타로 갱신, 가이드는 `prompts_100_guide/`.
- `generate_packs_api` 는 `prompts/*.txt` 를 **쓰지 않음**.
- manifest의 `promptEvidence` 는 기존 txt 해시를 계속 수집 → **새 이미지와 해시 불일치** 가능.

**권고**: 생성 시 가이드 문장/API 요청 원문을 `prompts/{key}-base.txt`, `prompts/{key}-edit.txt`(또는 edit-01…10)로 저장하고 catalog SHA를 그 파일 기준으로 갱신.

### 5.4 가이드 품질 계약 vs 자동화

`PROMPTS_100_GUIDE.md` 상단은 이미 성숙한 계약이다:

- 7 NORMAL + 3 HARD, salience 4/3/3
- 구조화 objective (`target/location/before/after`)
- zone 3×3, mobile review PENDING 금지 자가 PASS
- 375×667 실기 검수

그런데 파서·sync·생성기는 **번호 매긴 영어 한 줄**만 추출한다.  
가이드 계약의 60%가 파이프라인 밖이다. 계획서 Phase 2 “자동 QA”는 픽셀 개수 수준이라 **가이드 계약을 충족했다고 말할 수 없다.**

### 5.5 일정 4–5시간의 비현실성

문서 일정: 스크립트 30분 + 시범 1시간 + 79팩 2–3시간 + 동기화 30분.

누락된 실무 시간:

- 라이브 API 구현·인증·할당량
- 실패 팩 재생성 루프
- 클러스터–설명 매칭/한국어 윤문
- visual-delta 정책 튜닝
- wordHunt 좌표 재작업
- 모바일 실기 샘플 검수

**현실적 1차 목표**: 5팩 수직 슬라이스(생성→바인딩→빌드→데모) **1–2일**, 전량 배치는 그 이후.

---

## 6. 옵션 A에 대한 더 나은 실행안 (제안)

### 6.1 전략 유지, 실행 순서 변경

```
Phase 0  정합·SSOT
         - 파라미터 단일화, 절대경로 제거, drafts 고아 4키 정리, jpeg 잡파일 격리
         - research.md inventory 갱신
         - 성공 정의를 M1–M4로 재정의 (publishBlocked false 제외)

Phase 1  생성기 실장 (5팩 only)
         - live 경로 완성 + 멱등 체크포인트
         - 복합 B 1회 우선, 실패 시 개별 inpaint
         - prompts/*.txt 자동 기록

Phase 2  관측 파이프라인
         - validate_image_pairs = catalog difficulty + visual-delta 동등 기준
         - geometry 기록은 batch-build / auto-detect 단일 경로로

Phase 3  설명 동기화 (반자동)
         - L1 intent JSON export
         - L2 clusters
         - 매칭 큐 (자동 제안 + 사람 확정) → 한국어 changes[] 생성
         - “영문 프롬프트 맹목적 복사” 금지

Phase 4  WordHunt 안전장치
         - 프롬프트 강제 포함 패치
         - geometry 비겹침 검증
         - batch-build의 difference 좌표 재사용 제거

Phase 5  79팩 배치
         - 예산 캡, 일일 한도, 실패 큐
         - CI와 분리된 로컬/배치 잡

Phase 6  인간 리뷰 처리량 (게시가 목표일 때만)
```

### 6.2 “전부 재생성” 대신 계층적 범위

| 티어 | 조건 | 조치 |
|:---|:---|:---|
| T0 | 기존 A/B가 visual-delta PASS + 설명이 이미지와 맞음 | **재생성 금지**, catalog만 필요 시 윤문 |
| T1 | 이미지 OK, 설명만 구식 한국어/영어 단절 | 이미지 유지, changes만 반자동 재작성 |
| T2 | 이미지·프롬프트 의도 불일치 또는 QA FAIL | 옵션 A 재생성 |

79팩 전량 T2로 몰면 비용·검수·git 용량을 동시에 친다.  
**사전 분류 스크립트** 한 번이 계획의 $13을 아끼고 품질을 올린다.

### 6.3 중복 단어 정책

serenity×4 등은 “스타일 변형 학습”일 수 있으나, 매칭 큐·검색·진도 시스템에서 동일 lemma 충돌 가능.

권고 정책 예시:

- `canonicalAnswer` 중복 허용 시 `key`·sceneBrief로 구분, UI에는 부제 표시
- 또는  Intermediate 이상에서 lemma 당 최대 2 씬

문서에 **의도적 / 정리 대상**을 표로 못 박을 것.

### 6.4 저장소·바이너리 (반복 경고, 여전히 P0급)

이전 리뷰와 동일: PNG를 git에 계속 쌓으면 히스토리 영구 비대.  
옵션 A는 **79×2장 교체**를 의미하므로 SHA가 전부 바뀌고 blob이 한 번 더 쌓인다.

권고: LFS 또는 object storage + 해시 매니페스트. 최소 `.gitattributes` 합의 없이 전량 커밋하지 말 것.

---

## 7. 스크립트 상태 정정표 (문서 패치용)

| 스크립트 | 계획서 상태 | 실제 | 필요한 다음 작업 |
|:---|:---:|:---|:---|
| `parse_prompts_guide.py` | ✅ | 동작 (79팩 파싱 가능) | 구조화 objective 파싱 확장, 상대 경로 |
| `generate_packs_api.py` | ✅ | 클라이언트 골격 + dry-run, **live 스텁** | live I/O, 재개, prompts 기록, 상대 경로 |
| `validate_image_pairs.js` | ✅ | 개수 게이트 only | difficulty·visual-delta 정렬 |
| `sync_catalog_changes.py` | 🔲 신규 | 존재하나 **스펙 미달** | 탐지 연동 또는 반자동 바인딩; 한국어 정책 |
| `validate_word_hunts.py` | 🔲 신규 | 존재하나 **프롬프트 문자열 검사** | 생성 전 프롬프트 패치 + geometry 비겹침 |
| `batch-build.js` | (암묵적 사용) | geometry 없을 때 wordHunt=difference | WordHunt 분리 로직 |
| `auto-detect-delta.js` | 사용 | 난이도 r + non-overlap 있음 | 임계값 SSOT, validate와 공유 |

---

## 8. 파라미터 SSOT 제안 (한곳에 모을 값)

코드에 흩어진 값을 문서/모듈 한곳에 고정할 것을 권한다.

| 키 | 현재 관측 | 비고 |
|:---|:---|:---|
| `RADIUS_BY_DIFFICULTY` | 0.085 / 0.070 / 0.055 | auto-detect 기준 유지 권장 |
| `pixelThreshold` (탐지 샘플링) | 75 기본 / CLI 60 | **하나로** |
| `minClusterChangedPixels` | 150 (탐지 필터) | research 50은 obsolete |
| `minChangedPixelsPerRegion` (게이트) | geometry 다수 24 | visual-delta와 동일 소스 |
| `maxOutsideChangedRatio` | geometry 0.15 / 문서 0.05–0.08 | 정책 합의 필요 — 0.15는 관대 |
| `expectedDifferences` | 10 (7N+3H) | 가이드·런타임 계약 |
| `qa.minClusters` | 8 | 재생성 큐 임계 |

---

## 9. 긍정적으로 유지할 점

1. **옵션 A 원칙** (학습 메타 보존 + 픽셀 측 재동기화)은 catalog/프롬프트 단절에 대한 올바른 해법이다. 옵션 B(프롬프트를 버리고 옛 이미지·옛 한국어 설명 유지)는 가이드 최적화 투자를 버린다.
2. `auto-detect-delta.js` 의 난이도별 r + `2r` 비겹침은 구 리뷰 지적 대비 **개선되어 있다.**
3. `batch-build.js` → manifest → registry 자동 생성 경로는 이미 있어, 생성기만 실장되면 Phase 4는 재발명할 필요가 없다.
4. `PROMPTS_100_GUIDE.md` 상단 품질 계약은 제품 수준이다 — **자동화 레이어를 이 계약에 맞추는 것**이 다음 품질 점프다.
5. catalog ↔ prompts 키 79 정렬은 이미 되어 있어, ID 매핑 부채는 작다.

---

## 10. 권고 실행 순서 (체크리스트)

- [ ] **P0** 계획서 상태 표 정정 (live 스텁, sync 스펙 미달)
- [ ] **P0** 성공 정의에서 `publishBlocked: false` 제거 또는 M3 이후로 이동
- [ ] **P0** `generate_packs_api.py` live + 멱등 + `prompts/*.txt` 기록 (5팩)
- [ ] **P0** 임계값 SSOT + `validate_image_pairs` = visual-delta 동등
- [ ] **P0** sync를 “영문 복사”에서 “geometry 확정 + 설명 바인딩(반자동)”으로 재설계
- [ ] **P1** WordHunt 프롬프트 강제 포함 + difference 비겹침; batch-build 휴리스틱 제거
- [ ] **P1** 전량 재생성 전 T0/T1/T2 분류
- [ ] **P1** 절대 경로 제거, drafts 고아·잡 jpeg 정리
- [ ] **P1** git LFS/스토리지 정책 합의 후 바이너리 커밋
- [ ] **P2** research.md inventory·파라미터 갱신
- [ ] **P2** 중복 lemma 정책 문서화
- [ ] **P2** 인간 리뷰 처리량(샘플링 감사) — 게시 목표 시에만

---

## 11. 결론

| 질문 | 답 |
|:---|:---|
| 옵션 A가 맞는가? | **예.** catalog `changes[]`와 프롬프트/실이미지가 단절된 이상, 새 이미지 기준으로 관측 레이어를 다시 묶는 수밖에 없다. |
| 이 계획서로 바로 79팩을 돌려도 되는가? | **아니오.** 생성기 live 미완, sync가 픽셀 비연동, QA가 게이트와 불일치, WordHunt 위험, 게시 정의 오해, 바이너리/경로/파라미터가 흐트러져 있다. |
| 최소 다음 한 수? | **5팩 수직 슬라이스**: live 생성 → visual-delta PASS → geometry 확정 → 한국어 changes 바인딩 → bundle/manifest/registry. 이게 통과하기 전 전량 배치는 비용만 태운다. |

---

## 12. 참조 경로

| 문서/코드 | 경로 |
|:---|:---|
| 본 리뷰 | `D:\touchcatch\docs\reviews\2026-07-27-option-a-implementation-plan-review.md` |
| 대상 계획 | `C:\Users\petbl\.gemini\antigravity\brain\7132e410-4044-4530-8d41-3d4ee6c4a184\implementation_plan.md` |
| 연구 보고서 | `D:\touchcatch\research.md` |
| 프롬프트 가이드 | `D:\touchcatch\content\learning\prompts_100_guide\PROMPTS_100_GUIDE.md` |
| 구 스케일 리뷰 | `D:\touchcatch\docs\reviews\implementation-plan-review.md` |
| 콘텐츠 확장 리뷰 | `D:\touchcatch\docs\superpowers\plans\2026-07-20-content-expansion-plan-review.md` |
| CI | `D:\touchcatch\.github\workflows\ci.yml` |
