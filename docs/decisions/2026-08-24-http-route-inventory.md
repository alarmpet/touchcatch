# HTTP route inventory (Android closed beta)

Public contract: `packages/contracts/openapi.yaml`  
Planning artifact (not implemented): `packages/contracts/openapi.planned.yaml`  
Runtime: `apps/server/src/http/router.ts` `PUBLIC_MOBILE_API_OPERATIONS`

| Method + path | Classification |
| --- | --- |
| GET /healthz | IMPLEMENTED, not in public OpenAPI (liveness probe) |
| GET /ready | IMPLEMENTED, not in public OpenAPI (readiness probe: DB + attempts policy; no secrets) |
| GET /v1/me | IMPLEMENTED |
| GET /v1/pets/collection | IMPLEMENTED, policy fail-closed; UI hidden in production |
| GET /v1/learning/leaderboard | IMPLEMENTED, policy fail-closed; UI hidden in production |
| POST /v1/pets/daily-draw | IMPLEMENTED, policy fail-closed; UI hidden in production |
| POST /v1/pets/duplicate-promotion | IMPLEMENTED, policy fail-closed; UI hidden in production |
| GET /v1/learning/challenges | IMPLEMENTED |
| POST /v1/learning/attempts | IMPLEMENTED |
| POST /v1/learning/attempts/{id}/assets-ready | IMPLEMENTED |
| POST /v1/learning/attempts/{id}/tap | IMPLEMENTED; Idempotency-Key required |
| POST /v1/learning/attempts/{id}/complete | IMPLEMENTED |
| GET /v1/pets | HIDDEN_UNTIL_READY → planned YAML |
| POST /v1/pets/{id}/select | HIDDEN_UNTIL_READY → planned YAML |
| POST /v1/pets/{id}/lock | HIDDEN_UNTIL_READY → planned YAML |
| POST /v1/gacha/draw | HIDDEN_UNTIL_READY → planned YAML |
| POST /v1/fusion | HIDDEN_UNTIL_READY → planned YAML |
| POST /v1/matches/queue | REMOVED from public beta (PvP out of scope) → planned YAML |
| GET/DELETE /v1/matches/queue/{ticketId} | REMOVED from public beta → planned YAML |
| POST /v1/matches/friend-room | REMOVED from public beta → planned YAML |
| POST /v1/matches/friend-room/{roomCode}/join | REMOVED from public beta → planned YAML |
| DELETE /v1/matches/friend-room/{roomCode}/members/me | REMOVED from public beta → planned YAML |
| GET /v1/pet-showcases/{nickname} | HIDDEN_UNTIL_READY → planned YAML |
