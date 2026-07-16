# 09. API 및 Socket 이벤트

## Frozen authenticated wire contract

All routes use Bearer authentication. State-changing POST and DELETE operations require UUIDv4 `Idempotency-Key`; GET operations do not. Rejected Socket commands return only an ack. Private viewer events become `state_advanced` at the same cursor. Canonical answers, aliases, `correctOptionId`, undiscovered hitboxes, auth UUIDs, raw JWTs, and private attestation or failure detail are forbidden.

## REST
- GET /v1/me
- GET /v1/pets
- POST /v1/pets/:id/select
- POST /v1/gacha/draw
- POST /v1/fusion
- POST /v1/matches/queue
- POST /v1/matches/friend-room

## Client → Server
- ready
- tap_image
- submit_final_answer
- submit_meaning
- use_hint

## Server → Client
- match_snapshot
- match_started
- tap_result
- difference_claimed
- word_hunt_started
- word_hunt_won
- score_changed
- final_rush_started
- meaning_quiz_started
- match_finished
