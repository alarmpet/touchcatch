# 아트 재작업 지시서 — `en-resonance-stage`, `en-3d-creativity`

**작성일:** 2026-08-17 · **대상:** 재생 불가 판정을 받은 2개 팩

79개 중 77개는 통과했다. 남은 2개만 B 이미지를 다시 만들면 된다.
**시작 전에 반드시 읽는다:** [`docs/design/spot-difference-art-generation-guide.md`](../design/spot-difference-art-generation-guide.md)

---

## 한 줄 규칙

> **B는 A를 마스크로 인페인팅한 결과여야 한다.**
> 비슷한 프롬프트로 새로 생성하면 안 되고, 마스크 없는 전체 img2img도 재생성과 같다.

각각 생성하면 조명·질감·선 두께가 전부 미세하게 달라져 화면 **전체**가 "다른 곳"이 되고,
정작 찾을 수 있는 덩어리는 몇 개 없어 판이 끝나지 않는다.

---

## 지금 상태

| 팩 | 판정 | totalChange | 찾을 수 있는 차이 |
|---|---|---:|---:|
| `en-resonance-stage` | `IMAGES_DIFFER_GLOBALLY` | **0.2593** (한계 0.18) | **3** (최소 5) |
| `en-3d-creativity` | `TOO_FEW_DIFFERENCES` | 0.0938 (통과) | **3** (최소 5) |

`en-resonance-stage`는 **A를 편집한 게 아니라 새로 생성한 것**이다. 화면의 25.9%가 달라져
있는데 그중 덩어리로 잡히는 건 3개뿐이다. B를 A에서 다시 만들어야 한다.

`en-3d-creativity`는 전역 변화량은 정상이라 **편집 자체는 제대로 됐다.** 차이 개수만
모자라니 같은 A 위에 편집을 몇 개 더 얹으면 된다.

---

## 판정 기준 — `tools/content/derive-hitboxes.js:28-42`

```js
CHANGE_THRESHOLD    = 70     // 이 색거리를 넘어야 "달라진 픽셀"로 센다
MIN_AREA            = 24     // 덩어리 최소 픽셀 수
MAX_REGION_FRACTION = 0.06   // 덩어리 하나의 바운딩박스가 화면의 6%를 넘으면 버린다
MAX_TOTAL_CHANGE    = 0.18   // 넘으면 IMAGES_DIFFER_GLOBALLY
MIN_DIFFERENCES     = 5      // 못 채우면 TOO_FEW_DIFFERENCES
MIN_RADIUS = 0.06, MAX_RADIUS = 0.11
MIN_DENSITY         = 0.35
```

**목표치는 8개다.** 통과한 77개 팩의 중앙값이 8이고 범위는 5~16이다. 5는 아슬아슬해서
편집이 조금만 번져도 떨어진다.

편집 하나하나는 **화면의 6% 미만인 야무진 덩어리**여야 한다. 넓게 번진 편집은
`MAX_REGION_FRACTION`에 걸려 아예 안 세어지면서 `totalChange`만 올린다 —
차이 개수는 안 늘고 전역 변화량만 올라가는 최악의 조합이다.

---

## 파일

| 무엇 | 경로 |
|---|---|
| A 이미지 (편집의 원본, **건드리지 않는다**) | `content/learning/source/<key>-a.png` (1024×1024) |
| B 이미지 (**이걸 다시 만든다**) | `content/learning/source/<key>-b.png` |
| 프롬프트 | `content/learning/prompts/<key>-base.txt`, `<key>-edit.txt` |
| 드래프트 (imageB 해시가 박혀 있다) | `content/learning/drafts/<key>.json` |

---

## 새 B를 만든 다음

**1. 드래프트에 반영한다.** 손으로 고치지 말고 도구를 쓴다 — 해시·바이트수·URL을 같이 갱신한다.

```bash
node tools/content/update-image-b.mjs en-resonance-stage <새B파일경로>
```

**2. 게이트를 돌린다.**

```bash
pnpm content:art:grid:check
pnpm content:hitboxes:derive
pnpm content:preview:registry
```

**3. 매니페스트를 다시 쓴다.**

```bash
node tools/content/write-learning-manifest.js
```

**4. 판정을 확인한다.** `content/learning/derived-hitboxes.v1.json`에서 해당 키의
`usable`이 `true`가 되어야 한다.

---

## 통과하면 같이 고쳐야 하는 것

`apps/mobile/src/learning-demo/production-boundary.test.ts:35`이 데일리 풀 크기를
못박고 있다:

```ts
expect(count).toBe(77);
```

**2개 다 살리면 79, 1개만 살리면 78로 바꾼다.** 바로 위 주석도 같이 고친다.

---

## 하지 말 것

- **`content/learning/derived-hitboxes.v1.json`을 손으로 고치지 않는다.** 파일 안에
  `"Do not edit by hand"`라고 적혀 있다. 판정은 이미지에서 계산되는 것이지 선언하는 게 아니다.
- **격자 단언 목록을 늘리지 않는다.** 구워진 격자가 나오면 목록에 추가하는 게 아니라
  아트를 교체하라는 뜻이다. 구워진 격자는 다른 게이트가 전부 못 잡는다.
- **드래프트를 조용히 수정하지 않는다.** `publicContent.imageA.sha256`이 실제 파일에
  고정돼 있어서, 이미지를 고치면 해시·매니페스트·승인이 같이 움직여야 한다.
- **`A`를 다시 만들지 않는다.** A가 바뀌면 79개 전체의 기준이 흔들린다.

---

## 의도한 개수와 계산된 개수가 다르면

편집이 주변으로 번진 것이다. 마스크를 좁히고 다시 만든다. 이건 도구 문제가 아니라
편집 문제다.
