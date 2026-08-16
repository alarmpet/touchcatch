# 세션 인수인계 — 2026-08-17

**이 파일 하나만 읽고 이어갈 수 있게 남긴다.** 저장소 규칙은 루트 `CLAUDE.md`,
코드 구조는 `.serena/memories/`(진입점은 `core`)에 있다. 여기엔 **그 둘에 없는 것**,
즉 지금 이 PC에서 살아 있는 상태와 아직 커밋 안 된 것만 적는다.

---

## 한 줄 요약

Google 로그인이 뚫렸고 모바일 테스트는 전부 초록이다. **문제는 코드가 아니라
1,000개 파일이 이 디스크에만 있다는 것이다.**

---

## 가장 급한 것 — 이 브랜치는 한 번도 푸시된 적이 없다

원격은 있다(`alarmpet/touchcatch`). 그런데 `codex/production-pet-ranking-runtime`에
upstream이 없다:

```
git status -sb        # → ## codex/production-pet-ranking-runtime   (뒤에 ...origin/ 없음)
git log --oneline @{u}..HEAD   # → fatal: no upstream
```

커밋 안 된 변경이 **수정 640 + 미추적 419 ≈ 1,000개**다. `git checkout .` 한 번이나
디스크 사고면 아래 아트 교체 캠페인 전체가 사라진다. 다른 무엇보다 이걸 먼저 정리해야
한다.

---

## 커밋 안 된 것

| 영역 | 수정 | 신규 | 내용 |
|---|---:|---:|---|
| `content/learning` | 209 | 158 | **아트 교체 캠페인.** 소스 이미지 82, geometry 22, evidence 22, 드래프트 24 신규 + 105 수정 |
| `apps/mobile` | 41 | 105 | `src/features` 32, `android/` 프리빌드 28, `learning-demo` 13, `assets/audio` 13, `src/ui` 7 |
| `apps/server` | 18 | 14 | |
| `tools/content` | 6 | 23 | 아트 파이프라인 도구 |
| `docs/*` | — | ~35 | reviews 11, superpowers 8, 04-Roadmap 7, 01-GameDesign 5, 02-Architecture 4 |
| `packages/contracts` | 12 | — | |
| `supabase/migrations` | — | 5 | |
| 루트 | 8 | 8 | `package.json`, `tsconfig.json`, `eslint.config.mjs`, `pnpm-lock.yaml`, `.gitignore` |

`apps/mobile/android/`는 빌드 산출물이 아니라 Expo 프리빌드 **소스**다
(`AndroidManifest.xml`, `MainActivity.kt`, `build.gradle`). 딥링크 intent-filter가
거기 있으니 지우면 안 된다.

**`CLAUDE.md` 자체가 untracked다.** 저장소 규칙을 담은 파일이 커밋 안 돼 있다.
`.serena/memories/` 10개도 마찬가지 — 디스크에는 있으니 같은 PC의 새 세션은 문제없지만,
다른 기계로 가면 같이 사라진다.

### 같이 섞여 있는 쓰레기 (커밋 대상 아님)

- `D:\tcbuild\...` 디렉터리 5개 — 이름에 `:`와 `\`가 박혀 있다. `tools/pets/pet-runtime-approval.test.ts`가
  `D:\tcbuild\...`에 만들려던 임시 fixture가 저장소 루트에 통째로 떨어진 것이다. 내용은
  저장소 config 파일의 **사본**이지 원본이 아니다.
- `console.log('import-ok'))` — 셸 인용 사고로 남은 콘솔 한 줄
- `.tmp-metro.log`, `expo-lan-start.{out,err}.log`, `expo-web-lan.{out,err}.log`

---

## 지금 살아 있는 로컬 상태

| | 포트 | 비고 |
|---|---|---|
| Supabase | 55321 (Studio 55323) | **구글 프로바이더 켜져 있음** |
| API 서버 | 18787 | |
| Metro | 8081 | 이전 세션의 백그라운드 셸 소유 — 끊겼을 수 있다 |
| 에뮬레이터 | `emulator-5554` | 앱 설치됨, 로그인된 상태 |

### 함정 1 — 구글 시크릿은 사람이 연 PowerShell 창에만 있다

`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET`은 사용자 셸의 환경변수다.
에이전트가 띄우는 프로세스에는 없다. **다른 창에서 `supabase start`를 다시 하면
프로바이더가 꺼진 채 뜨고 구글 로그인이 죽는다.** 지금 떠 있는 Supabase는 건드리지 않는
것이 가장 안전하다. 확인은 이걸로 한다:

```bash
curl -s http://127.0.0.1:55321/auth/v1/settings   # "google":true 여야 한다
```

### 함정 2 — Metro는 pnpm으로, `apps/mobile`에서, Node 24.18.0으로

```bash
cd apps/mobile && corepack pnpm exec expo start
```

`cd`를 빠뜨리면 저장소 루트를 프로젝트로 잡는다. Node가 다르면 조용히 이상하게 군다.

### 함정 3 — 에뮬레이터를 다시 띄웠으면 터널을 다시 건다

```bash
adb reverse tcp:55321 tcp:55321; adb reverse tcp:18787 tcp:18787; adb reverse tcp:8081 tcp:8081
```

없으면 구글 콜백이 `ERR_CONNECTION_REFUSED`로 죽는다. 이유는 `17_OAUTH_STATE.md`에 있다.

---

## 이번 세션에 한 일

### 커밋됨

- `40a31e7` `feat(auth): enable the local Google provider` — `supabase/config.toml`에서
  구글 활성화(자격증명은 `env()` 참조, 시크릿 없음). 계약 테스트는 카카오만 남기게 좁힘.
- `b68bb3c` `fix(test): make the runtime gate assertion independent of its launcher`

### 커밋 안 됨 (위 1,000개에 섞여 있다)

- `apps/mobile/src/auth/supabase-client.ts` — **`flowType: 'pkce'` 추가. 이게 구글 로그인
  실패의 진짜 원인이었다.** supabase-js 기본값이 `implicit`이라 토큰이 프래그먼트로 와서
  코디네이터가 거부하고 있었다. 전말은 `17_OAUTH_STATE.md`.
- `apps/mobile/app/auth/callback.tsx` — 성공 시 `router.replace('/profile')`. 이전엔 성공
  카드에 갇혀서 하드웨어 뒤로가기 말고는 나올 방법이 없었다.
- `apps/mobile/src/learning-demo/production-boundary.test.ts` — 낡은 상수 정리
  (아래 참조)
- `tests/specs/traceability.test.ts` — 복원 재시도. 이 테스트는 실제 저장소 파일을
  덮어썼다가 되돌리는데, Windows에서 그 쓰기가 간헐적으로 실패해 **`release-blockers.v1.json`을
  오염된 채 남겼다.** 실제로 한 번 당했다.
- `apps/mobile/src/home/HomeScreen.tsx` — `exactOptionalPropertyTypes` 위반 1줄

### 검증 상태

`pnpm test` **1544/1544 통과**, `pnpm typecheck` 통과, `pnpm lint` 통과,
콘텐츠 게이트 9종 전부 통과. **전체 `pnpm check`(21단계)는 안 돌렸다** — 개별 게이트만
돌렸다. 커밋 전에 한 번 돌리는 게 맞다.

---

## 아트 교체 캠페인 — 현재 판정

새 아트가 실제로 낫다. 도구가 그렇게 말한다:

| | 이전 | 현재 |
|---|---|---|
| 격자가 구워진 이미지 | 1 | **0** |
| 재생 불가 팩 | 25 / 79 | **2 / 79** |
| 팩당 차이 개수 | — | 최소 5 · 중앙 8 · 최대 16 |

남은 2개는 사유까지 정확하다 — `en-resonance-stage`는 `IMAGES_DIFFER_GLOBALLY`(편집이
아니라 재생성), `en-3d-creativity`는 `TOO_FEW_DIFFERENCES`. `CLAUDE.md`가 지목한 그
실패 모드다. **고치려면 그 두 팩의 B 이미지를 A의 인페인팅으로 다시 만들어야 한다.**

생성물은 드래프트와 동기 상태다(`derive-hitboxes`를 다시 돌려도 바이트 동일,
`preview-registry.generated.ts`는 `committed === generated`).

`production-boundary.test.ts`의 기대값은 교체 이전 콘텐츠를 묘사하고 있어서 갱신했다:
`count` 54→77, 격자 오염 목록 `['en-camaraderie-campfire']`→`[]`, 그 팩을 건너뛰던
낡은 skip 제거. **격자 단언은 목록을 늘리지 말고 아트를 교체하라는 뜻이다** — 구워진
격자는 다른 게이트가 전부 못 잡는다.

---

## 다음에 할 만한 것

1. **브랜치를 푸시한다.** 무엇을 커밋할지는 판단이 필요하다 — 아트 캠페인이 완결된
   상태인지 내가 알 수 없다. 최소한 쓰레기 파일들은 빼고 간다.
2. `CLAUDE.md`와 `.serena/memories/`를 커밋할지 정한다.
3. `en-resonance-stage`, `en-3d-creativity` 두 팩 아트 재작업.
4. `apps/mobile/src/home/HomeScreen.tsx`와 `tests/specs/traceability.test.ts`의 내 수정은
   각각 244줄·197줄짜리 진행 중 재작성 한복판에 있어서 **단독 커밋이 불가능하다.**
   그 재작업을 마무리하는 사람이 같이 가져가야 한다.

---

## 하지 말 것

`CLAUDE.md`에 다 있지만 이번에 한 번씩 다시 밟은 것들이다:

- **`/index.bundle`을 Metro에 요청하지 말 것.** pnpm 모노레포라 serverRoot가 워크스페이스
  루트다. 없는 경로를 찾다가 `500 EINVAL: invalid argument, read: node:fs`라는 엉뚱한
  에러를 낸다 — Metro 고장이 아니다. 올바른 엔트리는
  `/.expo/.virtual-metro-entry.bundle?platform=android&dev=true`.
  진짜 원인을 보려면 `EXPO_DEBUG=1 DEBUG="expo:*,metro:*"`로 띄운다.
- **테스트를 `npx vitest`로 돌리지 말 것.** 일부 계약 테스트가 앰비언트
  `npm_config_user_agent`로 고정 툴체인을 확인한다. `npx`면 `runtime pin mismatch`로
  fail-closed 되는데, 이건 게이트가 제대로 동작한 것이다. `corepack pnpm exec vitest run <경로>`.
- **`pnpm check` 실패를 곧바로 진짜 실패로 읽지 말 것.** 부하에서 플레이크가 난다.
  격리 재실행으로 먼저 확인한다. 단, **격리에서도 재현된다고 진짜 실패인 것은 아니다** —
  러너를 계속 같은 방식으로 잘못 부르면 똑같이 재현된다.
