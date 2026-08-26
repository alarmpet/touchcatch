# 세션 인수인계 — 2026-08-26

저장소 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md), 막힌 것의 목록은
[`docs/release-evidence-blockers.md`](../release-evidence-blockers.md), 저장소 실측은
[`research.md`](../../research.md)에 있다. **여기엔 그 셋에 없는 것만 적는다.**

이전 인수인계는 [`21_SESSION_HANDOFF.md`](21_SESSION_HANDOFF.md)이다.

---

## 한 줄 요약

**이전 세션의 작업 487개 파일이 커밋되지 않은 채 워킹트리에만 있었다. 지금은 10개 커밋으로
들어가 있고, 게이트는 그 커밋된 트리에서 초록이다. 아직 푸시하지 않았다.**

---

## 지금 상태

```
브랜치  codex/production-pet-ranking-runtime   HEAD 1acf8d1   main 대비 +85
파킹    pets/art-candidates-2026-08-26         HEAD f39ced6   (e24fa85 위 1커밋 — 릴리스 브랜치가 그 뒤로 더 나갔다)
원격    푸시 안 됨 — 두 브랜치 모두 로컬에만 있다
게이트  pnpm check 26단계 EXIT=0 · 1728 + 365 테스트 · 커밋된 트리 기준
```

워킹트리에 남은 미추적 파일은 `content/pets/**` 220개와 `tools/pets/*` 2개뿐이다.
**지우지 말 것** — 디스크에 있고 파킹 브랜치에도 있지만, 릴리스 브랜치에는 일부러 없다.

---

## 게이트는 두 번 돌려야 한다

`tools/content/learning-manifest.test.ts`는 입력을 `git show HEAD:`로 읽는다. 즉 **커밋된
콘텐츠**를 검증한다. 콘텐츠가 워킹트리에만 있으면 그 초록은 콘텐츠에 대해 아무것도 증명하지
않고, 커밋하는 순간 숨어 있던 실패가 드러날 수 있다.

이번에는 커밋 전 1회, 커밋 후 1회 돌려 둘 다 `EXIT=0`을 확인했다. **콘텐츠를 커밋했으면
반드시 다시 돌린다.**

백그라운드로 돌릴 때 함정이 하나 더 있다. `pnpm check > log 2>&1; echo "EXIT=$?"; tail log`
형태로 돌리면 완료 알림의 exit code는 마지막 `tail`의 것이라 **항상 0이다.** 진짜 결과는
출력 파일 안의 `EXIT=` 줄뿐이다.

---

## 이번 세션이 고친 것 중 문서에 없던 것

### `.env.privacy-worker.example`이 `.gitignore`에 걸려 있었다

[`docs/runbooks/account-deletion-worker.md`](../runbooks/account-deletion-worker.md)는 이
파일을 복사해서 worker를 띄우라고 하는데, `apps/*/.env.*`가 잡고 `!apps/*/.env.example`이
**정확히 그 이름만** 살려서 새로 클론하면 존재하지 않았다. 부정 패턴을 `!apps/*/.env.*.example`
로 넓혀서 고쳤다. `*.example`은 값이 빈 템플릿이지 비밀이 아니다.

### 펫 매니페스트는 디스크의 파일을 설명하고 있지 않다

추적 중인 `content/pets/source-manifest.v1.json`은 `american shorthair.png`, `bichon.png`
같은 88건을 admission으로 갖고 있다. 디스크에는 생성기가 만든 `pet_*_3d_*.jpg` 73개와
sha256 이름의 파생물 147개가 있다. **이름이 겹치는 것이 0건이다.**

거기 적힌 `rightsStatus: PENDING` 88건은 **이 아트에 대한 기록이 아니다.** 펫 아트를 다시
꺼내 쓰려는 사람은 매니페스트를 이 파일들의 권리 상태로 읽으면 안 된다. 두 자산군이 별개다.

파킹 판단 자체는 [`docs/reviews/2026-08-24-working-tree-disposition.md`](../reviews/2026-08-24-working-tree-disposition.md)의
바구니 (2)를 따랐다 — "첫 RC에 넣지 않는다, 나중 브랜치로, 절대 `git clean`하지 않는다".
`content/pets/mobile/.gitkeep`과 `content/pets/source/.gitkeep`이 같은 말을 하고 있다.
(`content/learning/source`는 `.gitkeep` 없이 PNG를 추적한다. 이 비대칭이 의도다.)

파킹해도 게이트가 도는지는 추론이 아니라 확인했다. 두 디렉터리를 잠시 치우고 `content/pets`를
읽는 세 파일(`tests/pet-runtime-approval.test.ts`, `apps/server/src/runtime.test.ts`,
`apps/server/src/policy/mobile-runtime-policy.test.ts`)을 돌려 36개 전부 통과했다.

### admin 빌드 디렉터리가 7.1 GB 쌓여 있었다 (고침)

`tools/run-next-build.cjs`는 빌드마다 `.next-build-<pid>-<시각>`을 새로 만든다. 의도된
설계다 — 이전 빌드가 붙잡고 있는 디렉터리를 다음 빌드가 재사용하려다 죽는 것(Metro가
gradle에 하는 것과 같은 실패)을 막는다. 그런데 **지우는 코드가 없었고**
`apps/admin/.next*/`가 gitignore돼 있어 아무도 못 봤다. 이 기계에 95개, 7.1 GB였다.

들어갈 때 지운다(나올 때가 아니라). `admin:client-secret-check`가 빌드 뒤에 그 산출물을
읽기 때문이다. 마커에 적힌 디렉터리는 남겨서 동시 빌드를 보호하고, 못 지우는 것은 건너뛴다.
정상 상태는 2개 + `next dev`가 쓰는 `.next-build` 하나다.

### `apps/admin/next-env.d.ts`는 게이트를 돌릴 때마다 더러워진다 (안 고침)

바뀌는 줄은 빌드 디렉터리 import 하나뿐인데 그 이름에 PID와 타임스탬프가 박혀 있다.

```
-import "./.next-build-30500-1787747033022/types/routes.d.ts";
+import "./.next-build-16684-1787748655783/types/routes.d.ts";
```

`.gitignore`가 `apps/admin/.next*/`를 이미 무시하므로 커밋된 값은 **항상 없는 디렉터리를
가리킨다.** `pnpm check` 뒤에 이 파일이 M으로 뜨면 고장이 아니다. 근본 수정(안정적 `distDir`
또는 추적 해제)은 아직 안 했다.

---

## 승인은 사람이 하는 것이고, 두 종류가 섞여 있다

### 이미 owner가 승인한 것 — 건드리지 말 것

`config/hint-policy.v1.json`, `config/weekly-competition.v1.json`,
`config/trusted-approval-signers.v1.json`이 `APPROVED`인 것은
[`docs/decisions/2026-08-24-android-casual-learning-approval.md`](../decisions/2026-08-24-android-casual-learning-approval.md)에
근거가 있다 — *"Approved by: product-owner (repository owner, this session: 승인하고 진행해)"*.

`tools/approvals/issue-android-casual-*.mjs`가 키를 생성하고 서명까지 하기 때문에 **겉보기엔
에이전트가 스스로 승인한 것처럼 보인다.** 그 결정 문서를 먼저 읽어라. 사람이 정한 것을 도구가
기계화한 것이고, 범위는 좁다 — 펫 경제·펫 아트·개별 팩은 명시적으로 제외돼 있다.

### 아직 승인 안 된 것 — 다음 차례

`docs/legal/data-disposition.v1.json`의 `approval.status`가 `PROPOSED`다. 이것이 삭제
worker를 켜는 **유일한 스위치**다. 지금은 요청이 접수되고 계정이 닫히지만 데이터는 남는다.

35개 테이블: `DELETE` 24, `REDACT` 9, `RETAIN` 2. `REDACT` 9개는 전부 매치 기록이고,
**지금 제품에는 매치를 만드는 코드가 없다** — 도달 불가능한 행에 대한 결정이다.

승인하면 **두 곳**을 함께 고쳐야 한다.

1. `docs/legal/data-disposition.v1.json` — `status: "APPROVED"`, `approvedBy`(이름),
   `approvedAt`(시각), `scope`. 이름이나 시각이 비면 verifier가
   `DISPOSITION_APPROVAL_UNATTRIBUTED`로 거부한다.
2. `apps/server/src/privacy/disposition-approval-verifier.test.ts`의 마지막 테스트
   (`refuses the disposition this repository actually ships today`). 그 테스트는 "지금 이
   저장소는 아무것도 안 지운다"를 고정한 것이라 **승인과 함께 뒤집히는 것이 맞다.**

`approvedBy`는 역할명이 아니라 이름이어야 한다. **에이전트가 채우지 않는다.**

---

## 다음 사람이 할 수 있는 일

저장소 안에서 막히지 않은 일은 거의 남아 있지 않다.
[`docs/release-evidence-blockers.md`](../release-evidence-blockers.md)의 모든 행이
`BLOCKED_EXTERNAL`이고, 대부분 Play Console 계정·키스토어·프로덕션 Supabase처럼 사람이
바깥에서 만들어야 하는 것이다.

당장 가능한 것:

1. **푸시.** 두 브랜치 모두 로컬에만 있다. 이 디스크가 유일한 사본이다.
2. **처분표 승인** (위 두 곳).
3. **`next-env.d.ts` 처닝 제거.**
4. **`portal:publishable`이 요구하는 13개 `UNRESOLVED`** — `docs/legal/operator-identity.v1.json`.
   사업자 정보·연락처·보존 기간·아동 대상 여부. 추정해서 채우면 법무 문서의 허위 기재다.
