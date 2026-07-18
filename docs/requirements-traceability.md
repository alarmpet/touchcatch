# Requirements traceability

This generated-style registry maps each normative requirement ID to one normative source, executable surface, implementation phase, automated test, and operational metric. Historical `docs/superpowers` material is evidence only.

<!-- GENERATED: TRACEABILITY V1; update through review with tools/check-docs.mjs -->

| ID | Normative source | Schema/type or implementation | Phase | Automated test | Operational metric |
|---|---|---|---|---|---|
| DOC-01 | `README.md` | `tools/check-docs.mjs` | G | `tests/specs/traceability.test.ts` | docs_gate_failure_total |
| RULE-01 | `01_GAME_DESIGN_OVERVIEW.md` | `config/ruleset.v1.json` | A | `tests/specs/ruleset.test.ts` | ruleset_hash_mismatch_total |
| RULE-02 | `02_CORE_RULES_AND_BALANCE.md` | `config/ruleset.v1.json` | A | `tests/specs/ruleset-parity.test.ts` | ruleset_projection_drift_total |
| STATE-01 | `03_GAME_FLOW_AND_STATE_MACHINE.md` | `packages/contracts/src/match.schema.ts` | B | `packages/game-engine/src/replay.test.ts` | replay_hash_mismatch_total |
| UX-01 | `04_UX_SCREEN_SPEC.md` | `packages/contracts/src/ui.ts` | F | `tests/contracts/ui-final-acceptance.test.ts` | ui_acceptance_failure_total |
| ECON-01 | `05_PET_COLLECTION_SYSTEM.md` | `packages/contracts/src/economy.schema.ts` | E | `tests/simulation/pet-economy.test.ts` | economy_duplicate_effect_total |
| SEC-01 | `06_CLIENT_ARCHITECTURE.md` | `packages/contracts/src/quarantine.ts` | D | `packages/contracts/src/quarantine.test.ts` | quarantine_failure_total |
| OBS-01 | `07_REALTIME_SERVER_SPEC.md` | `packages/contracts/src/analytics.ts` | G | `tests/contracts/analytics-event.test.ts` | trace_stage_missing_total |
| DATA-01 | `08_DATABASE_SCHEMA.md` | `supabase/migrations/202607150001_initial_schema.sql` | D | `tests/database/concurrency.test.ts` | db_transaction_failure_total |
| API-01 | `09_API_AND_SOCKET_EVENTS.md` | `packages/contracts/openapi.yaml` | C | `packages/contracts/src/openapi.test.ts` | api_contract_rejection_total |
| CONTENT-01 | `10_CONTENT_AND_IMAGE_PIPELINE.md` | `packages/contracts/src/content.ts` | A | `packages/contracts/src/content.test.ts` | content_validation_failure_total |
| QA-01 | `11_TEST_AND_BALANCE_PLAN.md` | `tools/release-evidence.ts` | G | `tests/simulation/release-verification.test.ts` | unexpected_command_failure_rate |
| RISK-01 | `11_TEST_AND_BALANCE_PLAN.md` | `schemas/analytics-event.schema.json` | G | `tests/contracts/analytics-event.test.ts` | same_coordinate_burst_signal_total |
| RISK-02 | `11_TEST_AND_BALANCE_PLAN.md` | `schemas/analytics-event.schema.json` | G | `tests/contracts/analytics-event.test.ts` | answer_reaction_time_signal_total |
| ENV-01 | `12_IMPLEMENTATION_ROADMAP.md` | `tools/check-runtime.mjs` | A | `tests/contracts/runtime-gate.test.ts` | runtime_gate_failure_total |
| DOC-02 | `13_CODING_AGENT_PROMPTS.md` | `tools/check-docs.mjs` | G | `tests/specs/traceability.test.ts` | agent_prompt_drift_total |

<!-- END GENERATED -->
