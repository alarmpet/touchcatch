# Event taxonomy v1

Only `AnalyticsEventV1` values admitted by the runtime parser may cross an adapter boundary. The JSON schema is a documentation projection; runtime and schema parity is tested. Lifecycle traces use exactly one ordered `queue -> handshake -> preload -> command -> finish -> reward` sequence correlated by opaque trace, match, request and effect identifiers.

Risk telemetry stores `cellBucket` as a string and never stores coordinates. The strict experiment contract pins stable anonymous-user assignment, salt version, two allocations summing to 10,000 basis points, SRM guardrail, one primary metric, MDE, alpha, power, minimum sample per variant and a fixed-horizon stopping rule. It does not authorize enforcement or production rollout.

Provider delivery, retention, deletion and experiment approval remain external evidence blockers.
