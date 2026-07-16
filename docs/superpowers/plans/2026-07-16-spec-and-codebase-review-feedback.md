# Spot & Learn Battle 사양서 및 코드베이스 분석·리뷰 보고서

**상태:** 검토 의견 전달 (작성 완료)  
**작성일:** 2026-07-16  
**작성자:** Antigravity (AI Coding Assistant)  
**문서 경로:** `D:/touchcatch/docs/superpowers/plans/2026-07-16-spec-and-codebase-review-feedback.md`  

---

## 1. 개요 및 검토 목적

본 보고서는 `Spot & Learn Battle` 프로젝트의 구현 착수 단계를 앞두고 다음 문서군과 코드베이스, 그리고 에이전트(Agentic Workers) 협업 워크플로우를 분석하여 **규칙 상충(Spec Drift), 보안적 취약점, 데이터 무결성 결여, 그리고 개발 아키텍처적 위험 요인**을 진단하고 개선책을 제시하기 위해 작성되었습니다.

### 검토 대상 목록
1. **MVP 구현 계획서:** [2026-07-15-spec-hardening-and-mvp-readiness.md](file:///D:/touchcatch/docs/superpowers/plans/2026-07-15-spec-hardening-and-mvp-readiness.md)
2. **UI/UX 설계 명세:** [2026-07-16-high-fidelity-ui-ux-reference-design.md](file:///D:/touchcatch/docs/superpowers/specs/2026-07-16-high-fidelity-ui-ux-reference-design.md)
3. **구현 로드맵:** [12_IMPLEMENTATION_ROADMAP.md](file:///D:/touchcatch/12_IMPLEMENTATION_ROADMAP.md)
4. **테스트·밸런스 계획:** [11_TEST_AND_BALANCE_PLAN.md](file:///D:/touchcatch/11_TEST_AND_BALANCE_PLAN.md)
5. **코드베이스 및 스키마:**
   - 종합 개발 사양서: [README.md](file:///D:/touchcatch/README.md) 및 [01~10 기획 명세서](file:///D:/touchcatch/)
   - SQL 초기 스키마: [001_initial_schema.sql](file:///D:/touchcatch/sql/001_initial_schema.sql)
   - JSON 스키마: [game-content.schema.json](file:///D:/touchcatch/schemas/game-content.schema.json)

---

## 2. 문서 간 정보 불일치 (Spec Drift) 분석

프로젝트 전반의 기획 문서와 신규 구현 계획서(`2026-07-15-spec-hardening-and-mvp-readiness.md`), UI/UX 레퍼런스 스펙(`2026-07-16-high-fidelity-ui-ux-reference-design.md`) 사이에서 **정보의 파편화와 모순(Spec Drift)**이 다수 발견되었습니다.

### 2.1. 로드맵 선후 관계 및 의존성 불일치
* **기존 로드맵 ([12_IMPLEMENTATION_ROADMAP.md](file:///D:/touchcatch/12_IMPLEMENTATION_ROADMAP.md)):** 
  클라이언트 기능(싱글 플레이, 돌발 단어, 최종 단어/뜻)을 **먼저 구현(Client-First)**한 후 Step 4에서 실시간 서버, Step 5에서 Auth/보상, Step 8에서 QA 및 예외 처리를 구현하도록 구성되어 있습니다.
* **계획서 지적 사항 (`ROADMAP-01`):**
  클라이언트 우선 개발 후 서버 연동을 추진하면, 클라이언트 내부에 임시 구현된 게임 로직과 데이터 권한을 서버 권위(Server-Authoritative) 방식으로 대대적으로 재작성해야 하므로 개발 공수가 중복 소모됩니다.
* **해결 제안:** 로드맵을 **계약/CI 선행 → 결정론적 엔진(Reducer) → DB/RLS 보안 → 실시간 서버 Vertical Slice → 모바일 쉘 순**으로 의존성에 맞게 완전히 재배열해야 합니다.

### 2.2. 경기 승리 및 시간 조건 충돌
* **기존 기획 문서 ([02_CORE_RULES_AND_BALANCE.md](file:///D:/touchcatch/02_CORE_RULES_AND_BALANCE.md)):** 
  "100점 선착순 즉시 승리"와 "최소 경기 보장시간 15초" 규칙이 혼재되어 있습니다. 이론상 15초 이전에 한 플레이어가 100점을 돌파할 수 있으며(최대 119점 가능), 두 규칙이 어떻게 상호작용하는지 명확하지 않습니다.
* **계획서 제안 (`RULE-01`):** 
  공정하고 신속한 판단을 위해 "최소 경기 보장시간 15초" 문구를 전면 삭제하고, `score >= 100`이 되는 첫 원자적 이벤트 시점에 즉시 경기를 종료하도록 규칙을 단순화/확정하였습니다.

### 2.3. 테스트 및 밸런스 검증 모호성
* **기존 테스트 계획 ([11_TEST_AND_BALANCE_PLAN.md](file:///D:/touchcatch/11_TEST_AND_BALANCE_PLAN.md)):** 
  A안(차이점 6/9점, 최종 패키지 50점)과 B안(차이점 7/10점, 최종 패키지 40점)의 A/B 테스트가 제안되어 있으나, 규칙 파일이 단일화되어 있지 않아 코드상에서 어떻게 전환될 것인지 모호합니다. 또한 '50판 자동 테스트'로는 통계적 밸런스를 측정하기에 턱없이 부족합니다.
* **계획서 제안 (`QA-01`):** 
  규칙 검증을 위해 `config/ruleset.v1.json`과 같은 단일 SSOT(Single Source of Truth) 규칙 정의 파일을 도입하고, A/B 테스트 시에는 Ruleset Version을 올려서 관리하도록 해야 합니다. 또한 밸런스 시뮬레이션을 10,000판 이상 실행하도록 격상하였습니다.

---

## 3. 코드베이스 아키텍처 및 보안 취약점

현재 저장소에 작성되어 있는 SQL 스키마와 JSON 스키마는 **보안성과 신뢰성 측면에서 치명적인 취약점**을 안고 있습니다.

### 3.1. 게임 정답 및 히트박스(Hitbox)의 클라이언트 노출 (P0 위험군)
* **문제 지점:** [game_contents](file:///D:/touchcatch/sql/001_initial_schema.sql#L35-L48) 테이블 구조.
* **상세 분석:** 
  현재 단일 `game_contents` 테이블에 테마, 이미지 URL 뿐만 아니라 `final_answer`, `answer_aliases`, `meaning_question`, 그리고 전체 기획 상세 정보인 `content_json`이 함께 들어 있습니다. 
  기존 DB 기획([08_DATABASE_SCHEMA.md](file:///D:/touchcatch/08_DATABASE_SCHEMA.md))은 "게임 콘텐츠는 공개 읽기"로 설정되어 있습니다. 이대로 클라이언트에 공개 읽기 권한을 주면, 악의적인 유저가 API나 Supabase anon key를 활용하여 클라이언트 측에서 쿼리를 던져 **최종 정답, 동의어(aliases), 뜻 퀴즈 해답, 아직 발견되지 않은 모든 히트박스(hitbox) 좌표**를 손쉽게 크롤링해 부정행위(핵)를 차지를 할 수 있습니다.
* **개선책:** 
  공개용 메타데이터(`public.game_content_revisions`)와 보안이 요구되는 정답 데이터(`private.game_content_solutions`)를 물리적 테이블 및 스키마 수준에서 완전히 분리해야 합니다. 프론트엔드 모바일 클라이언트에는 정답에 관련된 어떠한 private 데이터도 조회되지 않도록 접근 권한을 원천 차단해야 합니다.

### 3.2. 데이터베이스 RLS (Row Level Security) 및 접근 권한 부재 (P0 위험군)
* **문제 지점:** [001_initial_schema.sql](file:///D:/touchcatch/sql/001_initial_schema.sql)
* **상세 분석:** 
  SQL 파일 어디에도 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 구문과 `CREATE POLICY` 정책이 존재하지 않습니다. 또한 `profiles`의 재화(`gacha_points`), `user_pets` 정보, 경기 결과(`matches.winner_user_id`), 플레이어 점수(`match_players.score`)에 대한 보안 권한(`GRANT/REVOKE`) 통제가 누락되어 있습니다. 
  이 상태로 Supabase API를 클라이언트에 열어주면 클라이언트가 직접 DB에 접근하여 자신의 점수와 재화를 임의로 수정할 수 있게 됩니다.
* **개선책:** 
  모든 테이블에 RLS를 즉각 활성화하고, 클라이언트는 오직 자기 자신의 프로필/인벤토리 조회 및 일부 극히 제한적인 필드의 SELECT 권한만 가지며, 모든 게임 결과 및 재화 변동(뽑기 포인트, 펫 획득 등)은 Trusted Server 서비스 롤(`service_role`) 또는 보안 통제된 RPC를 통해서만 작성되도록 강제해야 합니다.

### 3.3. 중복 보상 지급 및 경제 무결성 부재
* **문제 지점:** [match_players](file:///D:/touchcatch/sql/001_initial_schema.sql#L61-L69) 및 누락된 역사 테이블.
* **상세 분석:** 
  보상 지급 여부가 단순히 `match_players.reward_claimed` 라는 boolean 값 하나로만 관리되고 있습니다. 분산 시스템 환경이나 재시도(Retry) 요청이 동시다발적으로 들어올 경우, 원자적 락(Atomic Lock)이 없거나 멱등성 키(`idempotency_key`) 검증 테이블이 없다면 보상이 중복으로 여러 번 지급될 우려가 큽니다.
  또한 기존 사양서에 언급된 뽑기 기록(`gacha_history`)과 합성 기록(`fusion_history`) 테이블이 SQL 스키마 파일에서 완전히 유실되어 있어, 재화 경제의 사후 추적이 불가능합니다.
* **개선책:** 
  `idempotency_requests` 테이블을 생성하여 모든 보상 API 요청에 멱등성 처리를 수행하고, 보상 트랜잭션 수행 시 `reward_ledger`, `gacha_history`, `fusion_history` 등의 이력 테이블 작성을 하나의 데이터베이스 트랜잭션으로 원자화해야 합니다.

### 3.4. 무의미한 JSON 스키마 필드 정의 (P1 품질 위험)
* **문제 지점:** [game-content.schema.json](file:///D:/touchcatch/schemas/game-content.schema.json)
* **상세 분석:** 
  필수 필드(`required`)로 `images`, `finalAnswer`, `differences`, `wordHunts`, `meaningQuestion` 등을 나열해 두었으나, `properties` 정의에서는 이 필드들의 구체적인 데이터 구조, 서브 타입, 최소/최대 제약조건, 좌표계의 정규화 범위(`[0.0, 1.0]`) 등이 누락되었습니다. array의 `items` 구조도 비어 있어 스키마 유효성 검사 도구가 무용지물이 됩니다.
* **개선책:** 
  JSON 스키마 규격을 Draft 2020-12 사양에 맞게 구조화하고, 차이점(differences)의 `hitbox` 구조, 3지선다 뜻 질문(`meaningQuestion`)의 구조 등을 세부 타입으로 엄격하게 기술해야 합니다.

---

## 4. 워크플로우 및 협업 시스템(Agentic) 피드백

본 프로젝트는 에이전트 협업 체계를 포함하여 여러 명의 개발 주체가 동시에 참여하는 구조를 상정하고 있습니다. 그러나 현재 환경은 복제와 해석의 오류를 유발하기 쉬운 구조입니다.

### 4.1. Local Reproducibility (로컬 재현성) 결여
* 현재 프로젝트 루트 폴더에 `.gitignore`, `.nvmrc`, `package.json`, lockfile(`pnpm-lock.yaml`), TypeScript 설정 파일(`tsconfig.json`) 등이 존재하지 않습니다.
* 개발 에이전트(혹은 신규 작업자)가 프로젝트에 새로 투입(Fresh Checkout)되었을 때, 고정된 빌드 환경을 재현할 수 없어 각기 다른 Node.js 버전이나 패키지 버전을 사용하면서 환경 차이로 인한 버그가 발생할 확률이 높습니다.
* **개선책:** 태스크 시작 전에 pnpm 워크스페이스 구조를 생성하고, `pnpm-workspace.yaml`, `.nvmrc` 등으로 환경을 일원화해야 합니다.

### 4.2. 실행 장치의 검증 프로세스 부재
* 단순 텍스트 문서 수정 위주로 게이트가 통제되어 있어, 실제 스키마 수정이나 게임 물리 좌표 유효성, RLS 테스트 등이 자동으로 검증되지 않습니다.
* **개선책:** `pnpm check` 스크립트를 통해 린트(Lint), 타입체크(TypeScript), 단위 테스트(Vitest) 및 데이터베이스 마이그레이션 린트를 통합 실행하고, 이를 풀 리퀘스트(PR)나 커밋 단계의 필수 게이트로 묶어야 합니다.

---

## 5. 핵심 개선사항 및 구체적인 액션 아이템

위에서 언급한 문제점들을 종합하여, 프로젝트 성공과 MVP 안정성 확보를 위해 즉각 적용해야 할 개선 액션 아이템을 정리합니다.

### 5.1. [SSOT] `config/ruleset.v1.json` 중심의 규칙 통일 (Task 2 반영)
* 게임 내 모든 수치(차이점 6/9점, 돌발 10/15점, 최종 패키지 25/15/10점, 제한시간 75초, 패널티 시간 등)를 하드코딩하지 않고 단일 JSON 설정 파일로 모읍니다.
* 클라이언트와 서버, 테스트 코드는 모두 이 JSON 파일 혹은 이를 래핑한 TypeScript 계약(`packages/contracts/src/rules.ts`)을 공통으로 로드하여 사용합니다.

```json
/* config/ruleset.v1.json 예시 */
{
  "rulesetVersion": "1.0.0",
  "targetScore": 100,
  "time": {
    "playingMs": 75000,
    "finalRushStartsAtMs": 60000
  },
  "score": {
    "normalDifference": 6,
    "hardDifference": 9,
    "finalWord": 25,
    "meaning": 15,
    "combo": 10,
    "wrongAnswer": -5
  }
}
```

### 5.2. [보안] 데이터베이스 RLS 보안 및 테이블 분리 (Task 6 반영)
* **테이블 분리:**
  - `public.game_content_revisions`: 클라이언트가 다운로드 받아 이미지를 렌더링하는 데 필요한 리소스 메타데이터.
  - `private.game_content_solutions`: 서버만 읽어 들여 탭 클릭 히트 판정 및 최종 단어/뜻 퀴즈의 정답 대조를 수행하는 보안 데이터베이스.
* **RLS 규칙 수립:**
  ```sql
  -- 예: matches 테이블에 대한 RLS 적용
  ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
  
  -- 사용자는 자신이 속한 경기 정보만 읽을 수 있도록 정책 수립
  CREATE POLICY select_my_matches ON public.matches
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.match_players
        WHERE match_players.match_id = matches.id
          AND match_players.user_id = auth.uid()
      )
    );
  ```

### 5.3. [아키텍처] 결정론적 룸 상태 Reducer 설계 (Task 3 반영)
* 클라이언트와 서버 간의 시점 차이와 네트워크 단절(Disconnect)에 대응하기 위해, 서버 내부 매치 핸들러를 **Pure State Reducer** 형태로 구축합니다.
* Reducer는 서버 시계와 데이터베이스 I/O 없이 오직 `(State, Command, Ruleset) -> (NewState, Events)` 흐름으로만 동작하도록 설계하여, 어떤 장애 상황에서도 Command 로그 Replay만으로 게임 상태를 100% 동일하게 재현할 수 있도록 만듭니다.

### 5.4. [테스트] 대규모 시뮬레이션 및 데이터 오라클 도입 (Task 7, 9 반영)
* **경제 밸런스 검증:** 
  현재의 '5장 합성 시 상위 등급 1장 100% 지급' 구조는 뽑기 확률 80/18/2% 하에서 전설 획득 기대값을 비정상적으로 높입니다(전설 천장의 효용 무력화).
  - Pity 시스템(희귀 10회, 전설 150회 보장)을 적용한 100,000회 뽑기/합성 시뮬레이션 스크립트를 작성하여 등급별 펫 인플레이션 추이를 정교하게 테스트하고 조정합니다.
* **매치 플레이 검증:**
  - 규칙 엔진 10,000판 자동 대전 시뮬레이션을 돌려 평균 경기 시간(50~70초), 파이널 러시 진입률 등이 기획 지표와 일치하는지 수학적 오라클을 통해 검증합니다.

### 5.5. [UI/UX] 시각 회귀 테스트 도입 (Task 10 반영)
* 레퍼런스 시각 디자인의 품질 유지를 위해, 1차적으로 수동 검증(Rubric)을 통해 최종 UI를 합의합니다.
* 합의된 고충실도 UI 화면을 iOS/Android 플랫폼별 Golden 스크린샷으로 박제하고, 이후 코드 변경 시 **SSIM(Structural Similarity) 0.97 이상** 및 픽셀 차이 기준을 충족하는지 자동 시각 회귀 테스트를 수행하도록 프로세스를 강제합니다.

---

## 6. 결론 및 다음 단계 제언

본 프로젝트는 두뇌 학습 배틀이라는 흥미로운 캐주얼 루프를 완성도 높은 고충실도 UI로 녹여내는 명확한 지향점을 가지고 있습니다. 그러나 **보안 아키텍처(RLS 및 정답 비노출), 데이터 정밀도(JSON 및 SQL 스키마 규격), 밸런스 검증의 깊이** 측면에서 구현 직전 시점에 해결해야 할 치명적인 결함이 드러나 있습니다.

따라서 MVP 개발 프로세스에 돌입하기 전, **`MVP 구현 계획서(Task 1~10)`의 게이트(G0 ~ G2)를 철저히 이행하는 것을 승인하고, 이에 맞추어 낡은 구현 로드맵 및 테스트 사양서를 즉시 갱신할 것을 권장**합니다.

---
*본 검토 보고서는 UTF-8 인코딩으로 영구 작성되었으며, 프로젝트 루트 내 `docs/superpowers/plans/` 경로에 저장되었습니다.*
