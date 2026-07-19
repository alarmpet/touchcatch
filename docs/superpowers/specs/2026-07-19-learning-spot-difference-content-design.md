# Learning Spot-the-Difference Content Design

## Goal

중학생 이상 사용자를 위한 밝은 2D 교육 게임 스타일의 틀린그림찾기 콘텐츠 9세트를 제작한다. 영어, 속담, 사자성어 카테고리마다 3세트를 제공하며 각 세트는 실제 대응하는 A/B 이미지, 정확히 10개의 차이점, 돌발 오브젝트와 최종 학습 문제를 포함한다.

## Content Catalogue

| Category | Content key | Learning target | Scene concept |
|---|---|---|---|
| English | `en-resilience` | RESILIENCE / 회복탄력성 | 폭풍 뒤 지역 정원을 함께 복구하는 학생들 |
| English | `en-dilemma` | DILEMMA / 선택하기 어려운 상황 | 두 갈래 진로 프로젝트 사이에서 증거를 비교하는 학생 |
| English | `en-sustainability` | SUSTAINABILITY / 지속가능성 | 태양광, 재활용, 도시농업이 결합된 학교 축제 |
| Proverb | `ko-proverb-dark-under-lamp` | 등잔 밑이 어둡다 | 가까운 책상 아래 물건을 두고 멀리 찾는 장면 |
| Proverb | `ko-proverb-seeing-is-believing` | 백문이 불여일견 | 설명만 듣던 학생이 과학 실험을 직접 관찰하는 장면 |
| Proverb | `ko-proverb-kind-words-return` | 가는 말이 고와야 오는 말이 곱다 | 두 학생의 친절한 대화가 협력으로 이어지는 장면 |
| Idiom | `ko-idiom-turn-misfortune` | 전화위복 | 비로 취소된 야외 행사가 실내 전시 성공으로 바뀌는 장면 |
| Idiom | `ko-idiom-prepare-ahead` | 유비무환 | 폭우 전에 시설과 비상물품을 준비하는 장면 |
| Idiom | `ko-idiom-perspective` | 역지사지 | 서로 역할을 바꿔 문제를 이해하는 학생들 |

이미지에는 정답 단어, 속담, 한자, 설명 문구를 넣지 않는다. 장면은 학습 개념을 암시하되 최종 문제의 답을 직접 노출하지 않는다.

## Bundle Architecture

각 세트는 public content, private solution, rights manifest, 실제 이미지 파일을 하나의 검증 단위로 다룬다.

- Public content: category, language, difficulty, theme, image A/B의 immutable URL·SHA-256·byte size·width·height·MIME.
- Private solution: 차이점 10개, A/B hitbox, Word Hunt 일반 2개와 특별 1개, sudden-death 1개, 최종 정답·alias·hint units·의미 문제.
- Rights evidence: 생성 provider/model/version/terms, prompt SHA-256, rights와 education review 상태, takedown owner.
- Asset files: 동일 해상도·동일 구도의 A/B PNG. 승인 전 상태는 `DRAFT` 또는 `REVIEW_REQUIRED`다.

기존 `PublicGameContentV1`, `PrivateGameSolutionV1`, `RightsManifestSetV1`과 content validator를 확장 없이 사용한다. 카테고리 식별은 기존 `theme`과 `language`를 활용하고, 새로운 런타임 분기나 데이터베이스 enum은 추가하지 않는다.

## Image Production

1. 세트별 scene brief와 금지 요소를 작성한다.
2. 밝은 2D 교육 게임 일러스트로 기준 이미지 A를 생성한다.
3. A를 입력 이미지로 사용해 지정한 10개 요소만 변경한 B를 편집 생성한다.
4. 변경 유형은 추가·제거, 색상, 방향, 형태, 개수 변경을 혼합한다.
5. 얼굴, 손, baked-in text, 미세 질감은 차이 대상으로 사용하지 않는다.
6. 자동 비교로 지정 영역 밖의 큰 변화와 의도된 영역의 변화 존재를 검사한다.
7. 자동 검사 뒤 사람이 의도하지 않은 차이, 의미 전달, 연령 적합성을 검수한다.

A/B를 독립적으로 생성하지 않는다. 독립 생성으로 생긴 비의도적 차이를 넓은 hitbox로 숨기는 것도 금지한다.

## Geometry and Gameplay

- 각 세트는 동결 ruleset에 맞춰 NORMAL 7개, HARD 3개의 차이점으로 구성한다.
- 동일 side의 모든 difference, Word Hunt, sudden-death 원형 hitbox는 서로 겹치거나 접하지 않는다.
- hitbox는 이미지 실제 픽셀에서 측정한 뒤 0~1 정규화 좌표로 저장한다.
- 차이점은 모바일 축소 화면에서도 구분 가능해야 하며 단순 압축 노이즈나 한두 픽셀 변경은 허용하지 않는다.
- Word Hunt는 장면 의미와 관련된 중립 오브젝트를 사용하고 최종 정답을 노출하지 않는다.
- sudden-death는 기존 objective와 다른 fresh ID와 독립 hitbox를 가진다.

## Learning Content

- 영어 세트는 영단어 canonical answer, 허용 가능한 영문 alias, 한국어 의미 선택지 3개를 제공한다.
- 속담 세트는 완전한 속담을 canonical answer로 사용하고, 의미가 바뀌지 않는 공백 alias만 제한적으로 허용한다.
- 사자성어 세트는 한글 독음을 canonical answer로 사용하고 한자 표기는 공개 학습 prompt에만 사용한다. 의미 선택지는 3개다.
- 모든 canonical answer와 alias는 기존 normalization 및 64 code point/256 UTF-8 byte 제한을 만족한다.
- `hintUnits`는 pinned `Intl.Segmenter` 결과와 정확히 일치한다.

## Validation and Failure Handling

검증 순서는 schema, semantic geometry, asset bytes/hash/dimension/MIME, A/B visual delta, provenance/rights, education review 순이다.

- 지정하지 않은 큰 시각 변화가 있으면 B를 다시 편집한다.
- 차이가 너무 작거나 모호하면 해당 변경을 다시 설계한다.
- hitbox 충돌은 좌표를 억지로 축소하지 않고 장면 요소를 재배치한다.
- validator 실패는 fixture나 validator를 약화하지 않고 콘텐츠를 수정한다.
- rights 또는 education review가 없으면 production publish와 beta asset 승격을 차단한다.
- 실제 CDN credential과 production publish는 외부 blocker로 유지한다.

## Verification

- 9개 번들 모두 content validator PASS.
- 각 번들마다 차이점 10개, Word Hunt 3개, sudden-death 1개를 exact count로 검증.
- A/B SHA-256이 서로 다르고 선언된 bytes와 실제 파일이 일치.
- 지정된 10개 영역마다 유효한 visual delta가 존재.
- 지정 영역 밖의 변화량이 승인 threshold 이내.
- 각 핵심 의미를 바꾼 negative fixture가 실패.
- rights/education 미승인 상태에서는 beta/publish gate가 실패.

## Sequencing

1. 공통 카탈로그와 visual-delta 검사 도구.
2. 영어 3세트.
3. 속담 3세트.
4. 사자성어 3세트.
5. 전체 9세트 교차 검증과 DRAFT 콘텐츠 레지스트리 반영.
6. 외부 사람 검수, CDN, production publish는 별도 승인 단계.

각 단계는 이전 단계의 schema·geometry·visual 검증이 통과한 뒤에만 다음 단계로 진행한다.
