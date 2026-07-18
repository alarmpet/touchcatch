# 09. API 및 Socket 이벤트

## Frozen authenticated wire contract

All routes use Bearer authentication. State-changing POST and DELETE operations require UUIDv4 `Idempotency-Key`; GET operations do not. Rejected Socket commands return only an ack. Private viewer events become `state_advanced` at the same cursor. Canonical answers, aliases, `correctOptionId`, undiscovered hitboxes, auth UUIDs, raw JWTs, and private attestation or failure detail are forbidden. <!-- REQ: API-005 -->

## REST
- GET /v1/me <!-- REQ: API-001 -->
- GET /v1/pets <!-- REQ: API-002 -->
- POST /v1/pets/:id/lock <!-- REQ: API-003 -->
- POST /v1/pets/:id/select <!-- REQ: API-004 -->
- POST /v1/gacha/draw <!-- REQ: API-006 -->
- POST /v1/fusion <!-- REQ: API-007 -->
- POST /v1/matches/queue <!-- REQ: API-008 -->
- POST /v1/matches/friend-room <!-- REQ: API-009 -->

## Client → Server
- ready <!-- REQ: API-010 -->
- tap_image <!-- REQ: API-011 -->
- submit_final_answer <!-- REQ: API-012 -->
- submit_meaning <!-- REQ: API-013 -->
- use_hint <!-- REQ: API-014 -->

## Server → Client
- match_snapshot <!-- REQ: API-015 -->
- match_started <!-- REQ: API-016 -->
- tap_result <!-- REQ: API-017 -->
- difference_claimed <!-- REQ: API-018 -->
- word_hunt_started <!-- REQ: API-019 -->
- word_hunt_won <!-- REQ: API-020 -->
- score_changed <!-- REQ: API-021 -->
- final_rush_started <!-- REQ: API-022 -->
- meaning_quiz_started <!-- REQ: API-023 -->
- match_finished <!-- REQ: API-024 -->
