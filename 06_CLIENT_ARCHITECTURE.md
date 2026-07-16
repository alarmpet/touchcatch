# 06. 클라이언트 아키텍처

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
- 매치 시작 전 preload
- WebP 1536px 권장
- 양쪽 로드 ack 후 경기 시작
