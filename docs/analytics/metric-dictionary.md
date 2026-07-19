# Metric dictionary

All metrics use opaque trace IDs and version dimensions. Adapters receive only values already accepted by `parseAnalyticsEventV1`; production Sentry/PostHog delivery remains unverified.

| Metric | Numerator | Denominator / dimensions | Classification |
|---|---|---|---|
| unexpected command failure rate | unique schema-valid PLAYER request IDs ending in INTERNAL_ERROR, durable receipt/transaction failure, or ack timeout after retry budget | all unique schema-valid non-duplicate request IDs; region/build/protocol; rolling 5m and 30m | candidate, `<0.1%`; no rate verdict below 10,000 |
| expected domain rejection count | unique request IDs rejected as ALREADY_CLAIMED, ALREADY_READY, INPUT_LOCKED, RATE_LIMITED, or REVISION_AHEAD | reason/build/protocol | diagnostic, excluded from failure rate |
| tap_result p95 | accepted command-to-result observation duration | region/build/protocol | candidate `<=250ms` |
| accepted duplicate claim/reward | duplicate effects for accepted operations | build/protocol | candidate zero |
| match finish loss | accepted terminal matches without finish event | build/protocol | candidate zero |

Executable metric identifiers admitted by `OPERATIONAL_METRICS_V1`: `tap_result_p95`, `unexpected_command_failure_rate`, `accepted_duplicate_effect_total`, `match_finish_loss_total`.

`release_requirement_gate_status{requirementId,result}` is emitted only after requirement oracle evaluation. `requirementId` is the opaque normative ID; `result` is `PASS`, `FAIL`, or `BLOCKED`. Only PASS has gauge value `1`; FAIL and unverified external blockers have value `0`.

Risk signals store only predeclared buckets. They are investigation candidates, never automatic enforcement. Raw retention (30 days) and aggregate retention (180 days) are unapproved policy inputs, not active guarantees.
