# 07. 실시간 서버 사양

## Authenticated recovery contract

Resolve the verified token subject through server-owned membership to an opaque participant key. Never serialize the subject or raw JWT. Pin protocol, engine, ruleset hash, content revision, and content hash before receipt reservation. Durable journal replay is authoritative; Redis and memory are bounded caches only. Disconnect epochs are monotonic, with resume below 15,000ms and forfeit at the exact boundary. <!-- REQ: OBS-001 -->

## 스택
Node.js 22+, NestJS, Socket.IO, Redis, PostgreSQL, BullMQ. <!-- REQ: OBS-002 -->

## 서버가 결정하는 것
점수, 정답, 시간, 승패, 돌발 미션, 버프, 잠금. <!-- REQ: OBS-003 -->

## 치팅 방지
- 초당 터치 최대 8회 <!-- REQ: OBS-004 -->
- 좌표 서버 검증 <!-- REQ: OBS-005 -->
- 같은 좌표 연타 탐지 <!-- REQ: OBS-006 -->
- 비정상 정답 반응속도 기록 <!-- REQ: OBS-007 -->
- 클라이언트 점수 무시 <!-- REQ: OBS-008 -->

## 연결 끊김
- 5초 이내 재접속 <!-- REQ: OBS-009 -->
- 15초 초과 시 기권 또는 무효 <!-- REQ: OBS-010 -->
- 서버 장애 시 양쪽 패배 금지 <!-- REQ: OBS-011 -->
# Match ordering contract

Ingress drains due timers to a fixed point in `(dueAtMs, timerId)` order before sequencing a PLAYER or SYSTEM command at the same logical time. `commandSeq`, `eventSeq`, and `stateRevision` are separate match-scoped counters. Old client revisions are synchronization watermarks and remain eligible; only future revisions are rejected. <!-- REQ: OBS-012 -->

Disconnect epochs are monotonic. Reconnect before the absolute forfeit deadline cancels the epoch timer; at the exact deadline the timer wins and produces `FORFEIT`. Recovery without durable journal/lease continuity produces a single sequenced no-contest cancellation before normal queue processing. <!-- REQ: OBS-013 -->

## Observability and candidate service objectives

Telemetry accepts only versioned allow-listed fields before an adapter. Opaque trace IDs must reconstruct queue, handshake, preload, command, finish, and reward without JWT, service keys, auth UUID/PII, private answers/aliases/correct option IDs, undiscovered hitboxes, raw coordinates, or uploads. Expected domain rejections are separate from unexpected failures and retries with the same request ID count once. <!-- REQ: OBS-014 -->

The candidate beta profile is 100 concurrent matches/200 sockets with `tap_result` p95 <=250ms, unexpected command failure rate <0.1%, duplicate accepted claim/reward 0, and match finish loss 0. A ratio verdict requires at least 10,000 unique requests. Production approval requires a target-region 200-match/400-socket 30-minute soak; local deterministic evidence cannot satisfy it. <!-- REQ: OBS-015 -->
