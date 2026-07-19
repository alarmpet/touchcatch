# Deterministic load and fault evidence

Candidate beta targets are 100 concurrent matches/200 sockets, `tap_result` p95 at most 250 ms, unexpected command failures below 0.1%, and zero duplicate accepted claim/reward or lost finish events. The ratio uses the exact numerator and denominator in the metric dictionary and is not graded below 10,000 unique requests. A future production vertical slice must run 200 matches/400 sockets for 30 minutes in the target region.

The repository harness injects receipt retry, worker restart, replay/snapshot and outbox/effect redelivery deterministically. It proves local contract invariants only. It does not prove concurrency capacity, network latency, a 30-minute soak, or production durability.
