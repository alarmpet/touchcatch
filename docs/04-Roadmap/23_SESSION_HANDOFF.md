# 세션 인수인계 — 2026-08-27

저장소 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md), 막힌 것의 목록은
[`docs/release-evidence-blockers.md`](../release-evidence-blockers.md), 직전 세션은
[`22_SESSION_HANDOFF.md`](22_SESSION_HANDOFF.md).

여기에는 그 문서들에 **없는 것만** 적는다. 이 세션에서 실제로 한 번씩 깨져서 알게 된 것들이다.

---

## 한 줄 요약

**인증 경로가 처음으로 실기에서 끝까지 통과했고, 그 과정에서 직전 커밋이 로그인을 완전히
망가뜨려 놓았다는 것을 발견해 고쳤다.** 운영자 신원과 처분표 승인도 사람에게서 받아 반영했다.
남은 미결은 전부 인프라 대기다.

커밋 범위 `9ac3da3..HEAD` (5개), 전부 게이트 통과 후 푸시됨.

---

## 이 세션의 가장 중요한 사실

### 게이트가 통과시킨 치명적 회귀가 있었다

`554dd2b`(PKCE S256 폴리필)가 **OAuth 로그인을 아예 불가능하게 만들었다.** `crypto`가 없는
런타임에서 `subtle`만 담은 객체를 새로 만들었고, Expo의 자체 crypto 설치기가 "이미 있다"고
판단해 건너뛰면서 `getRandomValues`가 영영 생기지 않았다. supabase-js는 PKCE verifier를 만들 때
그것을 먼저 부른다.

기기에서 찍은 값:

    crypto: object   getRandomValues: undefined   subtle: object
    → undefined is not a function

**26단계 게이트, 2111개 테스트, 릴리스 번들이 전부 이것을 통과시켰다.** RN 런타임에서
`crypto.getRandomValues`를 밟는 경로가 테스트에도 번들 단계에도 없기 때문이다. `5eda0ef`가
고쳤고, 이제 부분적인 `crypto` 객체를 만들지 않는다.

**교훈:** 전역 객체를 채우는 폴리필은 "없는 것만 채운다"가 아니라 **"부분적으로 만들지
않는다"**여야 한다. 반쯤 만든 객체는 다른 설치기를 침묵시킨다.

### 오진에 반나절을 썼다 — 에러 메시지가 가리킨 곳이 원인이 아니었다

`expo start`가 모든 번들 요청에 `EINVAL: invalid argument, read: node:fs`를 돌려줬다. Metro
고장으로 판단하고 캐시 삭제·`CI=1`·워커 수·Node 22/24·`.worktrees` 제거·**재부팅**까지 했다.
전부 무관했다.

진짜 원인: **내가 존재하지 않는 URL을 요청하고 있었다.** 이 프로젝트는 expo-router라 진입점이
`/.expo/.virtual-metro-entry.bundle`이고 `/index.bundle`이 아니다. Metro가 "해석 실패"를
알려주려다 `buildCodeFrameMessage`가 `readFileSync("D:\touchcatch/.")` — 디렉터리를 파일로 —
읽으면서 **에러 포맷터가 먼저 죽어 진짜 메시지를 가렸다.**

찾은 방법은 `fs.readFileSync`를 감싸 EINVAL 시 경로와 스택을 찍는 `--require` 프리로드였고,
**포그라운드 터미널에서 돌려야** 보였다(백그라운드 dev 서버는 stdout이 캡처되지 않았다).

**교훈 둘:** dev 서버가 이 상태일 때 그것으로 "내 변경이 원인인가"를 판단하면 안 된다 —
임포트를 지워도 같은 에러가 나서 확신에 찬 오답을 준다. `pnpm mobile:check`(=`expo export`)는
같은 Metro·같은 설정으로 해석 오류를 정확히 보고한다. **게이트를 믿어라.**

### 소스와 테스트의 임포트 확장자 규약이 다르다

`'./thing.js'`는 **vitest는 해석하고 Metro는 못 한다.** 번들되는 소스 파일은 형제 임포트에
확장자를 쓰지 않고, `.js` 형태는 전부 테스트 파일에 있다. `*.test.ts`도 `*.ts` glob에 걸리기
때문에 규약을 조사하면 테스트 파일 것을 house style로 착각하기 쉽다.

이 세션에서 **두 번** 밟았다. 첫 번째는 게이트가 잡았고(모바일 374개 테스트는 통과하는데 web
번들이 아예 안 만들어졌다), 두 번째는 커밋 전에 알아챘다.

---

## 실기 검증 결과 — 인증 경로 전 구간

오늘 이전에는 어느 단계도 끝까지 간 적이 없었다.

| 단계 | 결과 |
|---|---|
| Google 로그인 버튼 | Chrome Custom Tab 실행 |
| GoTrue `/authorize` | 302 `Redirecting to external provider` |
| Google 인증 | 계정 선택 → 승인 |
| 콜백 → 토큰 교환 | `POST /token` 200, **`grant_type: pkce`** |
| 세션 지속 | 앱 강제 종료 후 재시작해도 유지 |

`grant_type: pkce`가 결정적이다 — 서버가 `code_verifier`를 `code_challenge`와 대조해
통과시켰다는 뜻이고, PKCE 수정이 실제로 동작한다는 최종 증거다.

### 게이트 순서가 확정됐다

    SIGNED_OUT  →(로그인)→  RANKING_POLICY_NOT_APPROVED  →(정책 승인)→  플레이

**게스트 플레이는 설계상 존재하지 않는다.** 두 진입로(오늘의 도전 / 카테고리 카드) 모두 같은
게이트로 수렴한다. 두 번째 게이트는 `config/*.v1.json`이 DRAFT라서이고, 이걸 넘기는 것은
`normative-numeric-approvals.v1.json`과 서명자를 건드리는 **승인 변경**이다. 실제 게임 플레이
검증은 그래서 아직 불가능하다 — 막힌 게 아니라 열리지 않은 것이다.

### 계정 삭제 — 승인 전 상태를 실측했다

승인 전에 요청을 넣어 DB에서 확인한 값:

    state = ACCESS_BLOCKED
    stage_app_data / providers / auth / notification = 전부 PENDING
    attempts = 0        auth.users = 5행 그대로

**접수는 되고 계정은 즉시 닫히지만 워커는 시도조차 하지 않는다.** 설계 문서 그대로다. 이 세션
마지막에 승인했으므로 이 홀드는 이제 풀려 있다.

---

## 에뮬레이터 — Play 이미지 AVD를 새로 만들었다

기존 `SpotLearn_x86_64`(default 이미지)에는 **Chrome이 없어 Custom Tabs 제공자가 없다.**
`openAuthSessionAsync`가 성공을 돌려줄 수 없어 **OAuth 로그인이 구조적으로 불가능하다.**

    Custom Tabs service providers: No services found

`cmdline-tools`가 이 기계에 설치돼 있지 않아(Android Studio GUI로만 관리) 새로 받았고,
`google_apis_playstore` 이미지로 `SpotLearn_Play_x86_64`를 만들었다.

**만들 때 반드시 고쳐야 하는 기본값 둘** — `avdmanager`가 넣는 값이 쓸 수 없다:

| 항목 | 기본값 | 고친 값 | 안 고치면 |
|---|---|---|---|
| `hw.keyboard` | `no` | `yes` | **PC 키보드 입력이 통째로 무시된다** |
| `hw.ramSize` | `1536M` | `4096M` | 부팅·번들 로딩이 불안정 |
| `disk.dataPartition.size` | `800M` | `6442450944` | 98MB APK + Play 이미지에 부족 |

`hw.keyboard=no`는 특히 헷갈린다 — 화면은 멀쩡히 뜨고 탭도 되는데 타이핑만 안 된다.

**창 모드가 이번엔 크래시하지 않았다.** CLAUDE.md에 적힌 `opengl32sw` 문제는
`-gpu swiftshader_indirect`를 명시하면 피해 가는 것으로 보인다. 헤드리스로만 쓰면 사람이 볼
화면이 없어 로그인 같은 걸 대신 해줄 수 없으니, 그때는 창 모드로 올려야 한다.

### 기기가 `10.0.2.2:8081`을 직접 부른다

RN dev client는 호스트 루프백을 직접 부르므로 **`adb reverse`를 우회한다.** Metro가 다른
포트에 있으면 터널로는 해결되지 않고, 호스트 8081에 무언가가 떠 있어야 한다. 20줄짜리 TCP
프록시(8081→8082)로 해결했다.

---

## Supabase가 세 번 롤백했다 — 자원이 아니라 스키마다

    supabase_realtime / storage / pg_meta container is not ready: unhealthy
    Stopping containers...

**서비스는 정상 기동한다.** storage 로그에 `[Server] Started Successfully`가 찍힌다. 진짜
원인은 PostgREST 로그에 있다:

    canceling statement due to statement timeout
    Failed to load the schema cache using db-schemas=public,graphql_public

이 저장소는 스키마가 커서(마이그레이션 다수, `private.*`, 처분 대상 35개 테이블) 모든
컨테이너가 동시에 DB를 두드리면 스키마 캐시 질의가 제한 시간을 넘긴다. 하나라도 실패하면
전체가 롤백된다.

**메모리를 5GB 더 확보했더니 실패가 1개에서 4개로 늘었다.** 자원 문제가 아니다. 처방은 컨테이너
수를 줄이는 것:

```bash
npx supabase start --exclude studio,realtime,storage,imgproxy,analytics,vector,edge-runtime --ignore-health-check
```

남는 db·auth·rest·kong·pg_meta가 모바일 앱과 로컬 API에 필요한 전부다. `--ignore-health-check`
단독으로는 부족하고, `--exclude`가 실제 해법이다.

**재시작하면 OAuth provider 시크릿이 날아간다.** `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`는 사람이 연
PowerShell 창에만 있다. 값 없이 뜨면 `google: true`인데 client_id가 비어 Google이
`401 invalid_client`를 돌려준다 — **enabled 플래그만 보고 "시크릿이 살아 있다"고 판단하면 안
된다.**

---

## Docker 시작 크래시 — 소켓이 두 군데다

메모리에는 `Docker\run\dockerInference`만 적혀 있었는데 `docker-secrets-engine\engine.sock`도
같은 순간에 고아가 된다. **하나만 고치면 에러 메시지가 `initializing Inference manager`에서
`initializing Secrets Engine`으로 바뀔 뿐**이라 새 문제처럼 보인다.

그리고 이름을 바꾸려고 Docker를 죽이면 **직전 시도가 만든 소켓이 새로 고아가 된다.** 두 번째
시도에서 두 디렉터리를 다시 확인해야 한다.

남는 `run.broken-*` / `docker-secrets-engine.broken-*` 잔여물은 **지울 수 없다.**
`Remove-Item`·`robocopy /MIR`·WSL `rm -rf` 전부 실패한다(WSL은 exit 0을 돌려주고도 안 지운다).
0바이트이고 무해하니 그냥 둔다.

---

## 고친 것 — 커밋 5개

| 커밋 | 내용 |
|---|---|
| `9ac3da3` | 운영자 질문 4개를 저장소가 답할 수 있는 범위에서 답함 |
| `554dd2b` | PKCE에 S256을 줌 (**아래 커밋이 고치는 회귀를 함께 들여옴**) |
| `5eda0ef` | 폴리필이 `getRandomValues`를 죽이던 것 수정 |
| `b50d45c` | 가챠 확률을 설정에서 파생 |
| `f41efc8` | 운영자 신원 + 처분표 승인 |

### 가챠 확률이 문자열 리터럴이었다

`DailyFreeDraw.tsx`가 `등장 확률: 일반 60% · …`를 손으로 적고 있었다. `config/economy.v1.json`의
`draw.probabilities`와 우연히 일치했을 뿐 강제하는 것이 없었다.

**확률형 아이템 표시는 게임산업진흥에 관한 법률상 의무**라, 설정을 고쳤을 때 화면이 옛 숫자를
말하면 허위 표시다. 이 저장소가 다른 곳에서는 정확히 이 드리프트를 막고 있다는 점에서(테마는
해시 잠금, 법무 페이지는 원본에서 생성, 히트박스는 계산) 여기만 예외였다.

파생 시 주의할 것 셋: **모르는 등급도 표시**(빼면 표를 축소 고지), **부동소수점 차단**
(`0.07 * 100 = 7.000000000000001`), **설정 키 순서와 무관한 정렬**.

---

## 지금 상태

**저장소:** 변경 0, 원격 동기 완료. 게이트 26단계 통과(1745 + 381).

**미결 5개 — 전부 인프라 대기, 사람이 답할 것은 없다:**

| 항목 | 언제 정해지나 |
|---|---|
| `effectiveDate` | 출시일 확정 시 |
| `urls.origin` | 웹 도메인 확보 시 |
| `processors.Supabase.regionStatus` | 프로덕션 Supabase 생성 시 |
| `retention.backupPurgeWindow` | 위와 동일 |
| `appLinks.sha256CertFingerprints` | Play 첫 업로드 후 Google이 발급 |

**처분표는 승인됐다.** `APPROVED` / `신향섭` / `2026-08-27` / `closed-beta`. 삭제 요청이 이제
실제로 파기를 진행한다 — 다만 **워커는 아직 배포된 적이 없다**(별도 프로세스, 자체 DB 계정과
서비스 키 필요).

---

## 다음 사람이 할 것

순서가 있고, 앞의 것이 끝나야 뒤가 시작된다.

1. **Play Console 개발자 계정** — $25, 신분증 확인. 이것이 없으면 그 뒤 전부가 멈춘다
2. **업로드 키스토어** — 사람이 만들어 저장소 밖에 보관. 잃으면 앱 업데이트가 영영 불가
3. **프로덕션 Supabase + 배포 도메인** — 미결 5개 중 4개가 여기서 풀린다
4. **첫 업로드 → 비공개 테스트 12명 × 연속 14일** — 달력 최소치, 줄일 방법 없음

**정책 승인(`config/*.v1.json` DRAFT)은 별개 트랙이다.** 지금은 학습·펫·랭킹이 모두
`RANKING_POLICY_NOT_APPROVED`에서 막혀 있고, 1차 안드로이드 베타는 펫·랭킹 보상을 숨기는 것이
전제다. 실제 게임 플레이를 검증하려면 이 승인이 먼저다.
