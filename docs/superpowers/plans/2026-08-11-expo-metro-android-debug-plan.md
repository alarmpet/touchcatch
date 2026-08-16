# Expo Router / Metro Android 실행 오류 원인 분석 및 해결 계획

> **상태 (2026-08-11): 해결 및 Emulator 검증 완료.** 저장소 계약과 다른 Node 런타임으로 Metro를 실행한 것이 `EINVAL`의 재현 원인이었다. Node `24.18.0`/pnpm `11.13.0`, Expo `57.0.1`/CLI `57.0.9` 조합에서 manifest, Android Hermes bundle, export, Emulator UI를 모두 재검증했다.

## 문제 요약

Windows에서 `apps/mobile`을 Android Emulator로 실행하면 APK는 설치되지만 JavaScript 화면이 빈 상태로 남는다. Metro bundle 요청은 들어오지만 다음 오류로 500을 반환한다.

```text
Metro has encountered an error: EINVAL: invalid argument, read: node:fs (442:20)
```

네이티브 APK 설치·실행·ADB reverse는 성공했고, 실패 지점은 `expo-router/entry.js`를 Metro가 변환하는 번들링 경계였다. 최종 검증에서는 저장소가 요구하는 고정 런타임을 사용하자 동일 코드에서 번들이 성공해, UI 코드나 ADB가 아닌 Node 실행 경로 불일치가 핵심 원인임을 확인했다.

## 재현 증거

1. `com.touchcatch.mobile` APK 설치 성공.
2. Emulator `SpotLearn_x86_64`가 `adb devices`에 표시됨.
3. `adb reverse tcp:8081 tcp:8081` 성공.
4. `GET /index.bundle?platform=android&dev=true&minify=false`가 500 반환.
5. 응답 본문은 `EINVAL: invalid argument, read: node:fs (442:20)`.
6. `pnpm exec expo --version`은 57.0.9지만 앱은 `expo` 57.0.1, `expo-router` 57.0.7을 선언한다.
7. 실패한 직접 실행의 Node는 v22.16.0 또는 v24.14.0이었고, 저장소 계약은 정확히 v24.18.0이다.
8. `apps/mobile`에는 명시적인 `metro.config.js`가 없다.
9. 프로젝트는 pnpm workspace/monorepo이며 Android 검증 하네스에 `apps/mobile` 일부와 `node_modules`를 수동 복사했다.
10. Expo CLI 로그의 router root가 하네스에서 `../..\..\app`으로 계산되어 실제 `D:\tcbuild\apps\mobile\app`과 불일치했다.

## 가장 가능성 높은 원인

### A. Expo SDK/CLI/Metro 의존성 그래프 불일치 — 기각

앱 선언 버전과 실제 CLI/루트 hoisted dependency가 다르다. Expo 공식 문서는 SDK에 맞는 의존성 정렬과 `expo install --fix`, `expo-doctor`를 권장한다. Metro 버전이 여러 개이거나 SDK가 기대하는 버전과 다르면 `node:fs` 읽기 위치에서 실패할 수 있다. 이 가설은 `pnpm why metro metro-config @expo/metro-runtime expo expo-router`와 lockfile 그래프로 확인한다.

### B. pnpm workspace + 수동 하네스 복사로 인한 Metro 파일 경로/심볼릭 링크 문제 — 보조 위험, 직접 원인 아님

Metro는 프로젝트 루트, router root, `node_modules`, workspace package 경계를 함께 사용한다. 현재 하네스는 원래 monorepo 구조를 재현하지 않고 파일과 의존성을 복사했으므로 Metro가 `node:fs`를 일반 파일처럼 읽거나 잘못된 상대 경로를 따라갈 가능성이 있다. 이 가설은 정식 workspace에서의 bundle과 독립 단일 앱 복제본의 bundle을 비교해 확인한다.

### C. Expo Router 앱 루트 미지정 — 방어적 설정으로 유지, 직접 원인 아님

Expo Router의 monorepo 해결 사례는 `EXPO_ROUTER_APP_ROOT`를 `app` 디렉터리의 절대 경로로 설정하고, 필요하면 `app.config.js`/`babel.config.js`에서 설정하도록 안내한다. 현재 `app.json`만 있고 이 설정이 없다. 이 가설은 환경변수 설정 전후의 router root 및 bundle 응답을 비교한다.

### D. Node engine 계약 불일치 — 확인된 핵심 원인

저장소 root `package.json`은 Node `24.18.0`을 정확히 요구하고 현재 실행 환경은 `v24.14.0` 또는 이전 하네스에서 `v22.16.0`이었다. 따라서 Node 20/22를 임의 기준으로 삼지 않고, 먼저 저장소가 요구하는 24.18.0을 재현 기준으로 고정한다. 그 후에만 다른 LTS 버전을 비교한다.

## 조사 단계

### 1단계: 진단 스크립트와 기준선 고정

- `tools/mobile/diagnose-expo-metro.ps1`를 추가한다.
- 출력 항목: Node/pnpm/Expo 버전, `pnpm why` 결과, router root, `require.resolve('expo-router/entry')`, Metro 버전, workspace root, `fs.realpath` 결과, `EXPO_ROUTER_APP_ROOT`.
- 동일 명령을 `D:\touchcatch\apps\mobile`과 `D:\tcbuild\apps\mobile`에서 실행해 차이를 저장한다.
- HTTP bundle 요청의 status, 응답 본문, CLI 로그를 `docs/reviews/evidence/`에 저장한다.

### 2단계: 의존성 정렬 검증

- `pnpm exec expo-doctor` 실행.
- `pnpm why expo expo-router @expo/metro-runtime metro metro-config`로 중복 버전 확인.
- `pnpm exec expo install --check` 결과를 기록한다.
- SDK 57 호환 버전 하나만 남도록 정렬하는 변경은 진단 결과 확인 후 별도 커밋으로 수행한다.

### 3단계: Router root 단독 가설 검증

- `app.config.js`를 임시 진단 브랜치에서 만들고 `process.env.EXPO_ROUTER_APP_ROOT = path.join(__dirname, 'app')`를 설정한다.
- 동일한 설정을 환경변수로만 주는 경우와 비교한다.
- `app` 디렉터리가 실제로 하나인지, `apps/mobile/app`와 하네스 `app`의 realpath가 일치하는지 검사한다.
- bundle 200 응답과 UI tree가 확보되면 이 가설을 확인한다.

### 4단계: Metro config 단독 검증

- Expo SDK 57은 pnpm monorepo Metro 구성을 자동 지원하므로, 먼저 수동 `watchFolders`, `nodeModulesPaths`, `disableHierarchicalLookup`을 추가하지 않은 기본 구성을 기준선으로 삼는다.
- `metro.config.js`가 필요한 경우에는 Expo 공식 `getDefaultConfig(__dirname)`에서 출발하고, 실제 진단으로 입증된 경로만 최소 추가한다. `disableHierarchicalLookup`은 기본 해결책으로 사용하지 않는다.
- `node:fs`를 모바일 번들에 polyfill하거나 직접 읽지 않는다. Expo 문서의 Node built-in externalization은 server/web bundling 의미이므로 Android 앱에 임의 shim을 넣는 해결책으로 사용하지 않는다.
- `npx expo start --clear`와 bundle HTTP 결과를 비교한다.

### 5단계: 하네스 구조 단독 검증

- 수동 복사 하네스를 폐기하지 않고, 먼저 재현용으로 보존한다.
- 별도 짧은 경로 `D:\tcbuild-root`에 `app`, `src`, `package.json`, `app.json`, `babel.config.js`, `metro.config.js`를 갖춘 독립 Expo 앱을 만든다.
- 의존성은 `pnpm install`로 정상 설치하고 심볼릭 링크/hoisting을 수동 복사하지 않는다.
- 독립 앱에서 bundle이 성공하면 하네스 경로 구조가 원인으로 확정된다.

### 6단계: Node LTS 대조

- Node 20 LTS와 Node 22.16.0에서 동일 기준선 명령을 실행한다.
- Node 20에서만 성공하면 `.nvmrc`/Volta/pnpm 실행 문서로 고정한다.
- 두 버전 모두 실패하면 Node를 원인으로 표시하지 않는다.

## 해결 순서

1. 진단 스크립트와 bundle smoke test를 먼저 추가한다.
2. root `engines`에 맞춰 Node 24.18.0과 pnpm 11.13.0을 고정하고, SDK/CLI/Metro 버전 그래프를 정렬한다.
3. `EXPO_ROUTER_APP_ROOT`를 실제 `apps/mobile/app` 절대 경로로 고정한다.
4. Expo SDK 57 기본 monorepo Metro 구성을 먼저 검증한다. 수동 resolver 옵션은 실패 증거가 있을 때만 추가한다.
5. 수동 복사 하네스 대신 정식 workspace와 고정 실행기를 사용한다.
6. Android APK를 `:app:assembleDebug`로 재빌드하고, Metro bundle 200을 확인한 후 Emulator UI smoke를 실행한다.

## 자동 검증 기준

- `diagnose-expo-metro.ps1`가 모든 버전·경로 정보를 출력한다.
- Expo manifest가 HTTP 200이고 manifest의 `launchAsset.url` Android Hermes bundle이 HTTP 200이며 `node:fs`/`EINVAL`이 응답에 없다. Router manifest 쿼리가 빠진 원시 `/index.bundle`은 승인 기준으로 사용하지 않는다.
- `adb logcat`에 `FATAL EXCEPTION`, `Cannot find native module`, `Unable to resolve module`이 없다.
- UI tree에 `TouchCatch`, `오늘의 학습`, `펫 보상`, `랭킹`, `내 정보`가 존재한다.
- 통합 게임에서 그림→힌트→답변 입력 화면 전환이 확인된다.
- 기존 Vitest와 mobile typecheck의 baseline 오류를 구분해 보고한다.

## 중단 조건

- SDK/Metro 정렬, router root, 독립 workspace, Node LTS를 각각 단독 검증했는데도 동일 오류가 재현되면 추가 임시 수정 대신 Expo SDK 57의 최소 재현 저장소를 만든다.
- 세 번 이상의 가설 검증이 모두 실패하면 현재 monorepo/수동 하네스 구조를 Android smoke 경로로 유지할지 재검토한다.

## 공식·커뮤니티 근거

- [Expo SDK 57 Metro configuration](https://docs.expo.dev/versions/v57.0.0/config/metro/): `getDefaultConfig`, on-demand filesystem, Node built-in 처리.
- [Expo monorepo guide](https://docs.expo.dev/guides/monorepos/): SDK 52+에서는 pnpm monorepo 지원이 내장되어 수동 `watchFolders`, `nodeModulesPaths`, `disableHierarchicalLookup`을 먼저 제거해야 한다는 지침.
- [Expo create project / Node LTS guidance](https://docs.expo.dev/get-started/create-a-project/): 지원 OS와 Node LTS 권장.
- [Expo Router monorepo `EXPO_ROUTER_APP_ROOT` discussion](https://github.com/expo/router/issues/41): monorepo에서 앱 루트를 절대 경로로 지정하는 해결 패턴.
- [Expo monorepo dependency issue](https://github.com/expo/expo/issues/30278): pnpm/workspace 의존성 정렬 및 package 경계 문제 사례.
- [Expo Router troubleshooting](https://docs.expo.dev/router/reference/troubleshooting/): Router용 Metro/Babel 구성과 `expo-router/metro` 요구사항.
- [Expo Router entry resolution issue](https://github.com/expo/router/issues/748): pnpm monorepo에서 `expo-router/entry` 해석 실패 사례.
- [Expo Metro `node:fs` resolution report](https://www.reddit.com/r/expo/comments/1e5yhyh/metro_error_unable_to_resolve_module_missing_asset_registry_path/): `node:fs`/Metro 오류가 파일시스템·의존성 해석과 함께 발생한 사례.

## 결론

단일 재현 원인은 저장소 계약과 다른 Node 런타임으로 Expo/Metro를 실행한 것이다. `D:\devtools\node-v24.18.0-win-x64`의 검증된 Node와 pnpm 11.13.0을 사용하면 정식 workspace에서 bundle 및 Emulator UI가 성공한다. Router root와 최소 Metro/Babel 설정은 monorepo 실행 경로를 명확히 하는 방어적 구성으로 유지하지만, 광범위한 `watchFolders`, `nodeModulesPaths`, `disableHierarchicalLookup`은 필요하지 않았고 적용하지 않는다.

## 리뷰 문서 반영 판정

- **반영:** APK/ADB와 JS bundle 계층 분리, 진단 스크립트, bundle HTTP smoke test, Router root 검증, 하네스와 정식 workspace 비교, 버전 정렬.
- **조건부 반영:** `babel.config.js`는 Router troubleshooting에서 요구되는 구성인지 실제 entry 변환 오류로 확인될 때만 추가한다. 파일 부재 자체를 현재 `node:fs` 원인으로 확정하지 않는다.
- **반영하지 않음:** `disableHierarchicalLookup: true`, 광범위 `watchFolders`, Windows backslash가 직접적인 `EINVAL` 원인이라는 단정. Expo SDK 57 공식 monorepo 가이드는 자동 구성을 우선하고 이 옵션들을 먼저 제거하라고 안내한다.
- **수정 반영:** Node 20/22 비교보다 root 계약인 Node 24.18.0·pnpm 11.13.0을 먼저 재현 기준으로 고정한다.

## 2026-08-11 진단 실행 결과

`tools/mobile/diagnose-expo-metro.ps1`를 실행해 기준선을 기록했다.

- 진단 프로세스의 직접 `node`는 `v22.16.0`, `pnpm`은 `11.16.0`으로 저장소 계약(`node 24.18.0`, `pnpm 11.13.0`)과 불일치했다.
- 기본 `pnpm` shim은 잘못된 11.16.0을 사용했지만 `corepack pnpm`은 계약 버전 11.13.0으로 실행된다. 진단 스크립트는 이후부터 `corepack pnpm`을 사용한다.
- `EXPO_ROUTER_APP_ROOT`는 비어 있었다.
- `apps/mobile/app`은 존재하지만 workspace root의 `app`은 존재하지 않는다.
- `expo-router/entry`, `expo/metro-config`, `@expo/metro-runtime`은 모두 root `D:\touchcatch\node_modules`에서 해석된다.
- `pnpm why` 기준 `expo`, `expo-router`, `metro`, `metro-config`, `@expo/metro-runtime`은 각각 단일 버전으로 dedupe되어 있어 “중복 Metro 버전”은 현재 증거로 확인되지 않았다.
- Metro bundle endpoint는 여전히 HTTP 500이다.

이 결과로 Node engine 계약 불일치, root-level hoisted dependency 사용, 빈 `EXPO_ROUTER_APP_ROOT`는 확정된 선행 조건으로 기록한다. 반면 중복 Metro 버전은 기각한다. `babel.config.js` 부재나 Metro resolver 옵션은 이 선행 조건을 정렬한 뒤 재현 여부를 확인한다.

## 2026-08-11 1차 검증 변경

- `apps/mobile/app.config.js`를 추가해 `EXPO_ROUTER_APP_ROOT`를 실제 `apps/mobile/app` 절대 경로로 고정했다.
- `apps/mobile/metro.config.cjs`를 추가해 Expo SDK 57 기본 `getDefaultConfig(__dirname)`를 명시했다.
- package가 ESM(`"type": "module"`)이므로 CommonJS Metro config는 `.cjs` 확장자를 사용한다. `.js`에 `require`를 넣는 구성은 잘못된 것으로 판정해 제외했다.
- `expo config --json`은 dynamic config와 `apps/mobile` project root를 정상 인식했다.
- 이 실행 세션에서는 Metro 장기 프로세스가 종료되어 bundle HTTP 200 및 Android UI tree 재검증은 아직 미완료였다. 아래 최종 검증에서 완료했다.

## 2026-08-11 최종 해결 및 검증 결과

- Node 공식 v24.18.0 ZIP의 SHA256을 공식 SHASUMS와 대조해 일치함을 확인하고 `D:\devtools\node-v24.18.0-win-x64`에 배치했다.
- `tools/mobile/run-expo-pinned.ps1`와 `apps/mobile`의 `start:pinned` 스크립트로 저장소 계약 Node를 강제한다.
- 실패한 Expo 업그레이드 잔여물을 잠금 파일 기준으로 되돌려 `expo 57.0.1`, `@expo/cli 57.0.9`, `ws 7.5.13`을 확인했다. 오프라인·온라인 frozen lock 검사도 통과했다.
- 진단 요청 결과: manifest HTTP 200, Android Hermes `launchAsset.url` bundle HTTP 200, bundle 6,620,191 bytes.
- `expo export --platform android --clear` 결과: 1,402 modules, 185 assets, Hermes bundle 2.8 MB, 출력 `D:\tcbuild\expo-export-final-57.0.1`.
- 모바일 집중 테스트 결과: 18 files, 52 tests passed.
- D 드라이브의 `SpotLearn_x86_64` AVD로 `com.touchcatch.mobile/.MainActivity`를 실행하고 실제 게임 이미지, 하트, 콘텐츠 선택, 차이 찾기, 힌트 사용을 확인했다. 힌트는 5→4로 차감되고 한국어 문구가 표시됐으며 logcat의 React Native/AndroidRuntime/Expo 오류 필터는 비어 있었다.
- AVD 본체는 `D:\android-avd\SpotLearn_x86_64.avd`를 사용한다. C 드라이브의 기존 AVD 디렉터리는 도구 정책상 삭제하지 않았으나 현재 `.ini` 포인터는 D 드라이브를 가리킨다.
- 증거 화면: `D:\tcbuild\touchcatch-restored-runtime-valid.png`, `D:\tcbuild\touchcatch-restored-hint.png`.
