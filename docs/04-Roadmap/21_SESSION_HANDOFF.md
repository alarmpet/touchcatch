# 세션 인수인계 — 2026-08-17 (2차)

**같은 PC, 다른 계정으로 이어받는 경우를 전제로 쓴다.** 저장소 규칙은 루트 `CLAUDE.md`,
코드 구조는 `.serena/memories/`(진입점 `core`)에 있다. 여기엔 **그 둘에 없는 것**만 적는다.

이전 인수인계는 [`18_SESSION_HANDOFF.md`](18_SESSION_HANDOFF.md)이고, 거기 적힌 위기 —
1,000개 파일이 커밋 안 된 채 이 디스크에만 있던 상태 — 는 **해소됐다.**

---

## 한 줄 요약

**브랜치는 푸시돼 있고 게이트는 초록이다.** 같은 PC라 에뮬레이터·Metro·Supabase·API가
그대로 살아 있으니, 새 세션은 **앱을 띄운 상태에서 바로 이어서** 작업할 수 있다.

---

## 지금 상태

```
브랜치  codex/production-pet-ranking-runtime
원격    origin과 동기 (ahead 0, behind 0)
게이트  pnpm check 21단계 통과 · 테스트 1558개
```

`git log --oneline main..HEAD`로 이번 작업 전체를 볼 수 있다.

### 살아 있는 로컬 프로세스 — 건드리지 말 것

| | 포트 | 상태 |
|---|---|---|
| Supabase | 55321 | **`"google":true`** — 구글 프로바이더 켜져 있음 |
| API 서버 | 18787 | 응답함 |
| Metro | 8081 | `packager-status:running` |
| 에뮬레이터 | `emulator-5554` | 앱 설치·로그인됨, `adb reverse` 3개 연결됨 |

**구글 시크릿은 사람이 연 PowerShell 창의 환경변수다.** 다른 창에서 `supabase start`를
다시 하면 프로바이더가 꺼진 채 뜨고 구글 로그인이 죽는다. 확인은:

```bash
curl -s http://127.0.0.1:55321/auth/v1/settings   # "google":true 여야 한다
```

터널이 끊겼으면 (에뮬레이터 재시작 등):

```bash
adb reverse tcp:55321 tcp:55321; adb reverse tcp:18787 tcp:18787; adb reverse tcp:8081 tcp:8081
```

---

## 이번 세션에 한 일

### 1. 브랜치 구조

713개 파일을 영역별 14개 커밋으로 나눠 커밋하고 푸시했다. 쓰레기(`D:\tcbuild\...` 사본 4개,
로그 7개)는 지웠고 `.gitignore`에 `.serena/`·`.grok/`·`.obsidian/`·`.expo/`·`*.log`를 넣었다.
`CLAUDE.md`는 커밋했고, `.serena/memories/`는 사용자 결정으로 커밋하지 않았다.

### 2. 게이트 실패 2건 — 둘 다 "커밋하는 행위"가 드러냈다

`tools/content/learning-manifest.test.ts`는 입력을 **`git show HEAD:`로 읽는다.** 변경이
커밋 안 된 동안 게이트는 옛 상태를 보고 있었다. 커밋하자 실제 상태가 드러났다.

- `apply-ladder-batch-1`이 드래프트 8개 중 2개만 쓰고 멈춰 있던 걸 되돌림
- 이어서 그 도구의 결함 4개를 고쳐 배치를 완주 (**3 ADMITTED / 76 MISSING → 10 / 69**)

### 3. UI — vivid 레이어

홈·랭킹·펫·프로필 4개 화면에 그라디언트·글로우·글라스 레이어를 **추가만** 해서 올렸다.
`config/ui-theme.v1.json`이 해시 잠금이고 `BattleScreen`이 계약에 묶여 있어, **기존 토큰
값은 하나도 안 건드렸다.**

**띄워보고 나서야 잡은 버그 3건**이 있었다 (타입체크·lint·테스트 전부 통과한 상태였다):
탭바에서 홈 탭이 사라짐, 글리프 타일에 흰 줄무늬, Sheen이 하드 엣지 원반. 자세한 원인은
커밋 `c8d0da3` 메시지에 있다.

### 4. 게임플레이 — 페이아웃과 압박

계획서: [`20_GAMEPLAY_TENSION_PLAN.md`](20_GAMEPLAY_TENSION_PLAN.md)

완료한 것:

- **A2/A1 등급 사다리 리빌** — 뽑기가 620ms 글리프 교체에서 등급을 밟고 올라가는 연출로.
  일반 620ms ~ 전설 2060ms, 탭하면 건너뜀
- **A4 찾기 스핀 + 콤보** — 히트 링이 8단으로 커지고 달아오름, 3연속부터 콤보 칩
- **놓친 발견 버그 수정** — 아래 참조

---

## 이어서 할 일

### 끝난 것 (2026-08-17 3차)

**`unitsPerFind` 파생 전환** — `cc317e3`으로 커밋돼 있다. 차이 개수와 정답 길이가 안 맞는
팩이 68/77이었고, 정책이 상수 대신 규칙을 선언하도록 바꿨다:

```json
"findReveal": { "unitsPerFind": 1, "unitsPerFindRule": "SCALE_TO_COVER" }
```

```
실제 비율 = max(바닥값, ceil(열 수 있는 칸 / 차이 개수))
```

팩마다 손으로 적지 않은 이유가 핵심이다 — 손으로 적은 숫자는 콘텐츠가 늘 때 또 어긋난다.
**지켜야 하는 불변식:** `unresolvedTailUnits: 1`. 판을 다 깨도 마지막 한 칸은 안 열려야
최종 문제가 살아남는다.

**B1 마감 + B2 서든데스** — `3c92d64`. 둘을 함께 넣었다. 서든데스는 마감 시점에 시작하는데
마감이 없었기 때문에, B2만 따로 넣을 방법이 없었다.

- `playingMs`(75초)에 보드가 닫힌다. 못 찾은 건 전부 잃지만 **정답 입력과 힌트는 계속 열려
  있다.** 늦은 대가는 차이점이지 학습이 아니다
- 마지막 15초(`finalRushStartsAtMs`)는 무음으로도 읽힌다 — 타이머가 붉어지고 커지고,
  그림 테두리에 경고색이 들어오고, 음악이 `RUSH`로 간다. **색과 크기만 쓰고 깜빡이지
  않는다** (광과민성 기준 3Hz)
- 서든데스는 10초, **남은 차이점 아무거나 하나**를 찾으면 통과
- `boardClosedBy`가 생겼다. 퀴즈 화면이 전판 클리어일 때만 도달 가능하던 시절엔 무조건
  축하해도 됐지만, 마감이 생기면서 그게 거짓이 됐다

#### 서든데스 히트박스는 쓰면 안 된다 — 계획서가 틀렸다

계획서와 이전 인수인계는 **"드래프트 79개 전부에 `privateSolution.suddenDeath` 히트박스가
있으니 신규 콘텐츠 0"** 이라고 적었다. 데이터는 있지만 **쓸 수 없다.**

```
사용 가능한 팩 77개 중 suddenDeath 좌표가 실제 차이점에 얹힌 것:  25
                                        얹히지 않은 것:          52
드래프트가 손으로 적은 차이점 좌표 770개 중 실제 차이점에 얹힌 것:  49%
```

`generate-preview-registry.js`가 **드래프트의 워드헌트 좌표를 거부하는 이유와 똑같다**
(그 파일 주석에 이미 적혀 있다: "using them would name an object and then reject the tap
that finds it"). 손으로 적은 좌표는 아트에 맞지 않는다. 그래서 서든데스는 지목된 한 점이
아니라 **derive된 히트박스의 남은 차이점 아무거나**를 받는다. 신규 콘텐츠 0은 그대로다.

**A3 천장 미터 → 승급 천장 미터로 대체** — `f9d2302`. 가차 피티 카운터는 **보여줄 수
없다.** 확인한 사실:

| 사실 | 위치 |
|---|---|
| 천장 카운터 테이블은 존재 (rare 50 / legendary 150) | `private.gacha_pity_state` |
| 그걸 올리는 건 `draw_pet_v1` 하나뿐 | `202607150004_economy_ledgers.sql` |
| **`draw_pet_v1`을 부르는 앱 코드가 없다** | 마이그레이션·DB 테스트에만 등장 |
| 서버 펫 라우트 3개뿐, 유료 뽑기 없음 | `collection` / `daily-draw` / `duplicate-promotion` |
| 데일리 뽑기는 천장과 무관하도록 계약에 못 박힘 | `usesDirectDrawPity: z.literal(false)` |

즉 붙이면 **영원히 0/50**이고, 그건 `reveal-model.ts`가 파일 첫머리에서 배제한 "다음 판이
빚졌다"는 암시 그 자체다. A3의 진짜 선행 조건은 "서버 카운터 노출"이 아니라 **유료 뽑기
루프를 만드는 것**이고, 그건 계획서가 "경제는 가져오지 않는다"로 선을 그은 영역이다.

대신 **승급 천장**에 같은 장치를 붙였다. 11개 보유 + 여유 10개면 승급 보장 — 정책이 이미
하는 약속이고, 데일리 뽑기로 실제로 움직이고, 도달하면 확실히 지급된다. 이미 계산돼 화면에
있었지만 **회색 캡션 글씨**였다. 이제 숫자가 카드 크기로 앞서고, 막대가 거리를 읽지 않고도
보이게 하고, 올라갈 등급을 이름으로 밝힌다("3개 더"는 무엇을 향해서인지 말하지 않았다).

### 다음 순서 (계획서 기준)

1. **B3 워드헌트 스케줄러** — 리듀서에 단계는 이미 있고 룰셋에 스케줄도 있다. 마감이
   생겼으니 5초 창이 진짜 긴장으로 작동한다
2. A5 연쇄 · A6 룰렛 · B4 실시간 배율
3. A3 본래 형태(가차 천장)는 **유료 뽑기 루프를 만들기로 결정한 뒤에만** 가능

**B1·B2는 `packages/contracts`의 룰에 상수를 먼저 넣고 데모와 서버가 같은 값을 읽게 해야
한다.** 데모에만 하드코딩하면 서버 검증 경로(`RULE-013`)에서 랭킹이 갈린다.

### 다른 데서 진행 중인 것

- **아트 2팩 재작업** (`en-resonance-stage`, `en-3d-creativity`) — Antigravity에서 진행.
  지시서는 [`19_ART_REWORK_BRIEF.md`](19_ART_REWORK_BRIEF.md). 새 B 이미지가 나오면
  배관(해시·히트박스·레지스트리·게이트)은 이쪽에서 마무리하면 된다
- **지리 팩 자산 생성** — Antigravity에서 진행 중. `content/learning/source/geo-*.png`와
  `tools/content/create-geo-drafts.mjs`가 그 산출물이고 **untracked다. 손대지 말 것.**
  카탈로그를 건드리는 작업을 하기 전에 `git pull`을 권한다

---

## 이 저장소에서 실제로 밟은 함정

`CLAUDE.md`에 없거나, 있어도 다시 밟은 것들이다.

### `pnpm check`를 파이프로 넘기지 말 것

```bash
corepack pnpm check 2>&1 | tail -120     # ← tail의 종료 코드가 나온다
```

**실패한 게이트가 초록으로 보인다.** 한 세션에 두 번 당했다 — 1544개 중 1개가 진짜로
실패했는데 0으로 읽혔다. 파이프 없이 돌리고 `; echo "EXIT=$?"`를 붙인다.

### Git Bash에서 고정 Node는 POSIX 경로로

`CLAUDE.md`는 `%APPDATA%\fnm\node-versions\v24.18.0\installation`이라고 적어두는데,
그 윈도우 형식을 `export PATH=`에 넣으면 **`C:`의 콜론이 PATH 구분자라 조용히 무시된다.**

```bash
export PATH="/c/Users/petbl/AppData/Roaming/fnm/node-versions/v24.18.0/installation:$PATH"
```

### 정책 JSON은 Fast Refresh가 반영하지 못한다

`config/hint-policy.v1.json`은 `with { type: 'json' }`으로 모듈 스코프에서 임포트된다.
파일을 고쳐도 앱에 안 들어온다. **`adb shell am force-stop` 후 재시작해야 한다.**
이것 때문에 "고쳤는데 왜 그대로지"로 한참 헤맸다.

### node에 경로를 넘길 땐 윈도우 형식으로

bash는 `/c/...`를, node는 `C:/...`를 받는다. bash에서 `/c/...`를 node 인자로 넘기면
`D:\c\...`로 해석된다.

### 게이트 실패를 곧바로 진짜 실패로 읽지 말 것

`tests/contracts/ui-final-acceptance.test.ts`가 부하에서 플레이크가 난다. 격리 재실행으로
먼저 확인한다. 이번에도 한 번 났고 격리에서는 통과했다.

---

## 워킹 트리에 남는 것

- `apps/admin/next-env.d.ts` — Next가 빌드마다 빌드 ID 한 줄을 다시 쓴다. **스테이징하지
  않는 게 맞다**
- `content/learning/source/geo-*.png`, `tools/content/create-geo-drafts.mjs` — 위 참조.
  **다른 세션 작업물이다**
