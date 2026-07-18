# 09. API 및 Socket 이벤트

## Frozen authenticated wire contract

All routes use Bearer authentication. State-changing POST and DELETE operations require UUIDv4 `Idempotency-Key`; GET operations do not. Rejected Socket commands return only an ack. Private viewer events become `state_advanced` at the same cursor. Canonical answers, aliases, `correctOptionId`, undiscovered hitboxes, auth UUIDs, raw JWTs, and private attestation or failure detail are forbidden.

## REST
- GET /v1/me <!-- REQ: API-001 -->
- GET /v1/pets <!-- REQ: API-002 -->
- POST /v1/pets/:id/lock <!-- REQ: API-003 -->
- POST /v1/pets/:id/select <!-- REQ: API-004 -->
- POST /v1/gacha/draw <!-- REQ: API-005 -->
- POST /v1/fusion <!-- REQ: API-006 -->
- POST /v1/matches/queue <!-- REQ: API-007 -->
- POST /v1/matches/friend-room <!-- REQ: API-008 -->

## Client → Server
- ready <!-- REQ: API-009 -->
- tap_image <!-- REQ: API-010 -->
- submit_final_answer <!-- REQ: API-011 -->
- submit_meaning <!-- REQ: API-012 -->
- use_hint <!-- REQ: API-013 -->

## Server → Client
- match_snapshot <!-- REQ: API-014 -->
- match_started <!-- REQ: API-015 -->
- tap_result <!-- REQ: API-016 -->
- difference_claimed <!-- REQ: API-017 -->
- word_hunt_started <!-- REQ: API-018 -->
- word_hunt_won <!-- REQ: API-019 -->
- score_changed <!-- REQ: API-020 -->
- final_rush_started <!-- REQ: API-021 -->
- meaning_quiz_started <!-- REQ: API-022 -->
- match_finished <!-- REQ: API-023 -->
