# 03. 게임 흐름과 상태 머신

```mermaid
stateDiagram-v2
  [*] --> LOBBY
  LOBBY --> MATCHING
  MATCHING --> COUNTDOWN
  COUNTDOWN --> PLAYING
  PLAYING --> FINAL_RUSH: 60초
  PLAYING --> FINISHED: 100점
  FINAL_RUSH --> FINISHED: 100점 또는 75초
  FINISHED --> REWARD
```

## 플레이어 입력 상태
- ACTIVE
- ANSWER_LOCKED
- TAP_LOCKED
- MEANING_QUIZ
- FINISHED

## 좌표
모든 hitbox는 원본 이미지 기준 0~1 정규화 좌표로 저장한다.

```json
{"type":"circle","cx":0.41,"cy":0.63,"r":0.035}
```

## 줌/팬
클라이언트는 transform을 역변환해 원본 정규화 좌표를 서버에 전송한다. 서버가 최종 판정한다.
