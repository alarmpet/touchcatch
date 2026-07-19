# Test matrix

| Layer | Automated evidence | External evidence still required |
|---|---|---|
| unit/property/contracts | reducer, schemas, privacy allow-list, content/UI/OpenAPI | none for code contract |
| DB/RLS/concurrency | local reset, lint, pgTAP, multi-session tests | production backup/PITR/restore approval |
| load/fault/replay | deterministic receipt/restart/outbox/replay harness | target-region 30-minute soak |
| simulation | seeded bot/economy reports | powered human experiment |
| mobile/UI | schema, assets, static acceptance | physical iOS/Android goldens and accessibility run |
| observability | schema and static trace reconstruction | real Sentry/PostHog delivery and deletion proof |
