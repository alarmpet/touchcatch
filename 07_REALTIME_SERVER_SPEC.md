# 07. 실시간 서버 사양

## 스택
Node.js 22+, NestJS, Socket.IO, Redis, PostgreSQL, BullMQ.

## 서버가 결정하는 것
점수, 정답, 시간, 승패, 돌발 미션, 버프, 잠금.

## 치팅 방지
- 초당 터치 최대 8회
- 좌표 서버 검증
- 같은 좌표 연타 탐지
- 비정상 정답 반응속도 기록
- 클라이언트 점수 무시

## 연결 끊김
- 5초 이내 재접속
- 15초 초과 시 기권 또는 무효
- 서버 장애 시 양쪽 패배 금지
# Match ordering contract

Ingress drains due timers to a fixed point in `(dueAtMs, timerId)` order before sequencing a PLAYER or SYSTEM command at the same logical time. `commandSeq`, `eventSeq`, and `stateRevision` are separate match-scoped counters. Old client revisions are synchronization watermarks and remain eligible; only future revisions are rejected.

Disconnect epochs are monotonic. Reconnect before the absolute forfeit deadline cancels the epoch timer; at the exact deadline the timer wins and produces `FORFEIT`. Recovery without durable journal/lease continuity produces a single sequenced no-contest cancellation before normal queue processing.
