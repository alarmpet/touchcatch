# BGM 조달 가이드

**목적:** 배경음악을 고르고 저장소에 넣는 절차. 코드·게이트는 이미 준비돼 있어서
**남은 일은 파일을 받아 폴더에 넣고 매니페스트에 한 줄 적는 것뿐이다.**

---

## 0. 왜 효과음은 합성했는데 BGM은 아닌가

효과음은 `tools/audio/generate-feedback-sounds.mjs`가 산술로 만든다. 발견음은 연속으로
음정이 한 단계씩 올라가야 하는데 그건 기성 샘플로 못 하고, 동시에 저작권이 원천적으로
없다는 이득이 따라온다.

**BGM은 같은 방법으로 만들면 조악하다.** 멜로디와 편곡이 필요하고, 그건 코드에서 나오지
않는다. 그래서 BGM만 외부 조달이고, 이 문서가 그 절차다.

---

## 1. 소스 비교 (2026-08-14 기준 라이선스 원문 확인)

| 소스 | 라이선스 | 표기 | BGM 적합도 | 출처 위험 |
|---|---|---|---|---|
| **[Incompetech](https://incompetech.com/music/royalty-free/music.html)** (Kevin MacLeod) | CC-BY 3.0 / 4.0 | **필요** | ★★★★★ 2,000곡+ | 낮음 — 저작자 1인 |
| **[Kenney](https://kenney.nl/assets/music-jingles)** Music Jingles | **CC0** | 불필요 | ★★☆ 짧은 징글 85개 | 없음 |
| **[OpenGameArt](https://opengameart.org/content/cc0-music-0)** (CC0 필터) | CC0 | 불필요 | ★★★★ 게임용 루프 | 낮음 — 업로드별 확인 |
| **[Pixabay Music](https://pixabay.com/music/)** | Pixabay Content License | 불필요 | ★★★★ 물량 많음 | **중간 — §2 참조** |

### Pixabay를 메인으로 쓰지 않는 이유

[라이선스 원문](https://pixabay.com/service/license-summary/)은 깨끗하다 — 무료, 표기 불필요,
상업 이용 가능. 금지 조항은 "Standalone 배포"(창작적 가공 없이 원형 그대로 판매)뿐이고
게임 내 사용은 해당하지 않는다.

**문제는 라이선스가 아니라 출처다.** 누구나 업로드할 수 있는 플랫폼이라 실제로는 권리가
없는 곡이 올라오는 사례가 있고, Content ID에 등록된 트랙 때문에 자동 클레임을 받는 사례도
보고된다. 라이선스상 정당해도 클레임은 걸린다. 저작자가 한 명인 카탈로그는 이 위험이 없다.

써야 한다면 **다운로드 URL과 그날짜 라이선스 요약 사본을 반드시 남긴다.**

---

## 2. 권장: Incompetech

박진감 있는 트랙 물량이 압도적이고, 저작자가 한 명이라 출처가 명확하다.

**검색 태그:** `Action` `Chase` `Upbeat` `Playful` `Puzzle` (박진감·재미)
/ `Calm` `Ambient` `Relaxing` (Relax 모드)

**표기 형식** (`credits` 화면 한 줄):

```
"곡명" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
```

크레딧 화면을 만들기 싫으면 **곡당 $30**(3곡 이상 $20/곡)에 무표기 라이선스를 살 수 있다.
시즌당 2~3곡이면 $60~90으로, 계획서의 아트 예산(₩15만~70만/씬)에 비하면 반올림 오차다.

---

## 3. 필요한 트랙 (최소 3개)

| mood | 쓰이는 곳 | 성격 |
|---|---|---|
| `RELAX` | 기본 플레이, 타이머 없음 | 잔잔, 반복 거슬리지 않을 것 |
| `RUSH` | 시간 제한 모드 | 박진감, 몰아붙임 |
| `LOBBY` | 홈·메뉴 | 가볍고 밝음 |

`RELAX` 하나만 있어도 동작한다 — 나머지 mood는 `RELAX`로 폴백한다.
Rush에 음악이 없는 것보다 잘못된 음악이 낫기 때문이다.

**루프 가능한 트랙**을 고를 것. 끝과 시작이 이어지지 않으면 매 바퀴 끊긴다.

---

## 4. 넣는 절차

### 4-1. 파일 배치

```
apps/mobile/assets/audio/licensed/relax-forest.mp3
apps/mobile/assets/audio/licensed/rush-chase.mp3
apps/mobile/assets/audio/licensed/lobby-stroll.mp3
```

### 4-2. sha256 계산

```bash
node -e "const{createHash}=require('crypto'),fs=require('fs');for(const f of process.argv.slice(1))console.log(f, createHash('sha256').update(fs.readFileSync(f)).digest('hex'))" apps/mobile/assets/audio/licensed/*.mp3
```

### 4-3. `config/audio-rights-evidence.v1.json`의 `licensed` 배열에 추가

```json
{
  "file": "rush-chase.mp3",
  "mood": "RUSH",
  "gain": 0.8,
  "title": "Chase Sequence",
  "author": "Kevin MacLeod",
  "licence": "CC-BY-4.0",
  "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?isrc=...",
  "downloadedAt": "2026-08-15",
  "attribution": "\"Chase Sequence\" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0",
  "sha256": "…"
}
```

`licence`는 `acceptedLicences`에 있는 값만 쓸 수 있다. 표기가 필요한 라이선스인데
`attribution`이 비어 있으면 게이트가 막는다.

### 4-4. 검증

```bash
pnpm audio:feedback:check
```

---

## 5. 게이트가 실제로 막는 것

`tools/audio/check-audio-provenance.mjs`가 `pnpm check` 안에서 돌면서:

| 검사 | 이유 |
|---|---|
| 에셋 폴더의 모든 오디오가 선언돼 있는가 | **출처 불명 mp3를 몰래 넣을 수 없다.** 원래 이 구멍으로 무라이선스 음원이 릴리스에 들어간다 |
| 합성 파일이 생성기 출력과 바이트 일치하는가 | 받아온 파일로 바꿔치기 방지 |
| 라이선스가 승인 목록에 있는가 | 검토 안 된 라이선스 차단 |
| 표기 필요 라이선스에 크레딧 문구가 있는가 | **적어두지 않은 크레딧은 출시되지 않는다** |
| `sha256`이 기록값과 같은가 | 라이선스를 확인한 그 바이트가 실제로 나가는지 |
| `sourceUrl`·`author`가 있는가 | 나중에 근거를 다시 찾을 수 있게 |

크레딧 화면은 `requiredAttributions()`가 매니페스트에서 생성하므로,
**CC-BY 트랙을 추가하면 크레딧이 자동으로 따라간다.** 사람이 기억할 필요가 없다.

---

## 6. 이미 준비된 코드

| 파일 | 역할 |
|---|---|
| `apps/mobile/src/features/feedback/music-model.ts` | mood→트랙 선택, 볼륨 합성. 순수 함수 |
| `config/audio-rights-evidence.v1.json` | 매니페스트 겸 권리 근거 |
| `tools/audio/check-audio-provenance.mjs` | 게이트 + 크레딧 생성 |

음악 볼륨 기본값은 **0.35로 효과음(0.7)보다 낮다.** 발견음은 정보를 나르고 음악은 아니라서,
같은 크기로 깔면 발견음이 피드백이 아니라 곡의 일부로 들리기 시작한다.
