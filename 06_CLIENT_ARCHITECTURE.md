# 06. 클라이언트 아키텍처

## Authenticated delivery contract

The client declares supported protocol, engine, and ruleset versions while authenticating with a Supabase access token. It never sends the auth UUID as a player identity. `UPDATE_REQUIRED` closes admission before command ingress. Persist `lastEventSeq`, request exact journal replay on gaps, and replace with a viewer-safe snapshot when replay is unavailable or inconsistent. Retries reuse the UUIDv4 `requestId`.

<!-- GENERATED:UI_CLIENT:START -->
The Expo SDK 57 / React Native 0.86 shell consumes `MatchSnapshotV1` from the public Task 4 projection. It renders a safe-area native tree and emits only normalized `TAP_IMAGE` intents. Input fails closed outside playable phases, while offline/reconnecting, while an intent is pending, or when `viewerInput.enabled` is false. It never derives score, correctness, ownership, rewards, or private hitboxes.
<!-- GENERATED:UI_CLIENT:END -->

## 스택
Expo, React Native, TypeScript strict, expo-router, Zustand, TanStack Query, Socket.IO Client, Reanimated, Gesture Handler, Sentry.

## 구조
```text
apps/mobile/
  app/(tabs)/
  app/match/
  src/features/game/
  src/features/pets/
  src/services/socket.ts
  src/stores/gameStore.ts
  src/utils/coordinates.ts
```

## 서버 권위
클라이언트는 점수를 직접 증가시키지 않는다. 터치 이펙트만 즉시 보여주고 점수는 서버 응답 후 반영한다.

## 이미지
- 매치 시작 전 preload <!-- REQ: SEC-001 -->
- WebP 1536px 권장 <!-- REQ: SEC-002 -->
- 양쪽 로드 ack 후 경기 시작 <!-- REQ: SEC-003 -->
