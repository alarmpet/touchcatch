# CLAUDE.md

이 저장소에서 작업할 때 반드시 지킬 것. 대부분 실제로 한 번씩 깨져서 알게 된 항목이다.

---

## 이미지 생성 — 항상 가이드를 먼저 읽는다

**틀린그림찾기 아트를 만들거나 교체하기 전에 반드시 읽는다:**

> **[`docs/design/spot-difference-art-generation-guide.md`](docs/design/spot-difference-art-generation-guide.md)**

기존 79개 팩 중 **25개(32%)가 플레이 불가**였고, 원인은 전부 그 문서에 정리된 네 가지였다.

가장 중요한 한 줄만 옮기면:

> **B는 A를 편집(인페인팅/마스크 img2img)한 것이어야 한다. A와 비슷한 프롬프트로 새로
> 생성하면 안 된다.** 마스크 없는 전체 img2img도 재생성과 같다.

각각 생성하면 조명·질감·선 두께가 전부 미세하게 달라져 화면 전체가 "다른 곳"이 되고,
정작 찾을 수 있는 덩어리는 몇 개 없어 판이 끝나지 않는다. `en-dilemma`가 그 예로,
화면의 10.8%가 달라졌는데 찾을 수 있는 차이는 1개뿐이었다.

아트를 추가·교체했으면 승인 전에 반드시 돌린다:

```bash
pnpm content:art:grid:check      # 구도 격자가 구워진 이미지 탐지
pnpm content:hitboxes:derive     # 실제 차이점 계산 + 팩별 사용 가능 판정
pnpm content:preview:registry    # 데일리 풀 재생성
```

의도한 차이점 개수와 계산된 개수가 다르면 편집이 주변으로 번진 것이다. 다시 만든다.

---

## 검증

```bash
pnpm check      # 21단계 전체 게이트. 약 10분
pnpm check:db   # supabase db reset + lint + pgTAP. Docker 필요
```

- **Node 24.18.0 고정.** `.nvmrc` 참조. 다른 버전이면 `check:runtime`이 첫 줄에서 막는다.
  fnm 경로: `%APPDATA%\fnm\node-versions\v24.18.0\installation`
- 게이트가 무거워서 **부하 상태에서 플레이크가 난다.** 실패하면 해당 테스트를 격리
  재실행해 진짜 실패인지 먼저 확인한다. `git show`를 쓰는 테스트가 특히 취약하다.
- **PowerShell로 `package.json`을 쓰지 않는다.** `Set-Content -Encoding UTF8`이 BOM을
  붙여 파싱을 깨뜨린다. 파일 편집 도구를 쓴다.

---

## 안드로이드 빌드 — Metro를 먼저 내린다

**Metro가 떠 있으면 gradle 빌드가 죽는다.**

```
Execution failed for task ':app:mergeDebugResources'
> Failed to clean up output files ... (액세스가 거부되었습니다)
```

`@expo/metro-file-map`이 프로젝트 전체를 크롤하면서 `android/app/build` 안의 파일 핸들을
붙잡기 때문이다. 이 상태가 되면 PowerShell로도 그 디렉터리를 지울 수 없어 원인을 엉뚱한
곳에서 찾게 된다. 순서는 **Metro 종료 → 빌드 → Metro 재시작**이다.

디렉터리가 이미 오염됐으면 `cmd /c rmdir /s /q apps\mobile\android\app\build`로 지운다.

에뮬레이터용이면 ABI를 좁힌다. arm64 CMake 구성 단계가 같은 방식으로 실패하는데 x86_64
에뮬레이터에는 필요도 없다:

```bash
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
```

---

## 콘텐츠 경계 (깨뜨리면 정답 키가 배포된다)

- `apps/mobile/src/learning-demo/registry.ts`는 79개 팩의 `canonicalAnswer`와
  `privateSolutionHash`를 담고 있다. **라우트 그래프에 넣지 않는다.**
- 게임 라우트는 `preview-registry`만 임포트한다. `production-boundary.test.ts`가 이걸
  강제하고, 생성 파일까지 함께 검사한다.
- 학습 화면은 `__DEV__` 뒤에 있다. 프로덕션 출시에는 서버가 정답을 쥐고 검증하는 경로
  (`RULE-013`)가 필요하다.
- `content/learning/drafts/*.json`은 승인 산출물이다. `publicContent.imageA.sha256`이
  실제 파일에 고정돼 있어, 이미지를 고치면 해시·매니페스트·승인을 함께 갱신해야 한다.
  **드래프트를 조용히 수정하지 않는다.**

---

## 프론트엔드

- 테스트가 `react-native`를 몇 개 호스트 컴포넌트로 모킹한다. 새 RN API를 쓰면
  **그 화면을 렌더하는 모든 테스트 파일의 모킹에 추가**해야 한다 (`Keyboard`, `Animated`,
  `Share`가 이 경로로 한 번씩 깨졌다).
- Android edge-to-edge가 `adjustResize`를 무력화한다. 키보드 회피는 `Keyboard` 높이를
  직접 구독해서 처리한다.
- 좌표 계산은 `onLayout` 오프셋 누적 대신 `measureInWindow`를 쓴다. 깊이가 다른 컨테이너를
  손으로 더하면 조용히 어긋난다.
- **모킹 함정은 RN API에만 있는 게 아니다.** 화면이 `expo-router`처럼 새 모듈을 임포트하면
  그 화면을 렌더하는 테스트에 `vi.mock`을 함께 넣어야 한다. 안 그러면 실제 모듈을 파싱하다
  `SyntaxError`로 죽는데, 에러가 원인을 전혀 가리키지 않는다.

---

## 디자인 토큰 — 테마는 해시로 고정돼 있다

`config/ui-theme.v1.json`은 **바이트 해시가 박혀 있다.** `tools/check-ui-reference.mjs`가
sha256을 리터럴과 대조해서 한 글자만 달라져도 `pnpm check`가 죽는다.
`config/ui-screen-contract.v1.json`도 같다. **절대 편집하지 않는다.**

`apps/mobile/src/ui/design-tokens.ts`는 게이트가 읽지 않아 자유롭다. 다만 그 파일은 고정
테마와 값을 맞춰 둔 것이라, **기존 값을 바꾸면 계약에 묶인 `BattleScreen`과 어긋난다.**

그래서 규칙은 하나다: **토큰은 추가만 한다.** `categoryPalette`, `podiumPalette`,
`gradients`가 그렇게 들어왔다. 새 색이 필요하면 새 토큰을 만들지, `colors.accent`를
고치지 않는다.
