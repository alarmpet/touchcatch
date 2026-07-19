# ADR-002: Deterministic match single writer

Status: Accepted

Each match has one authoritative command stream. PLAYER, SYSTEM, and TIMER commands receive a gapless `commandSeq`; reducer events use a separate gapless `eventSeq`. The reducer is pure and uses PLAYER/SYSTEM `receivedAtMs` or TIMER `dueAtMs` as logical time.

Before an external command at time `t`, the scheduler drains every intent due at or before `t`, ordered by `(dueAtMs, timerId)`, including newly-created overdue intents, to a fixed point. Timer IDs encode match, type, and logical scope. Cancellation and duplicate delivery are deterministic and obsolete timers do not consume state revision or event sequence.

The durable journal remains the recovery authority. BullMQ is only an adapter candidate and is acceptable only with stable-ID deduplication, fixed-point catch-up, lease fencing, and atomic journal conformance. If ownership continuity cannot be proven, a sequenced `CANCEL_NO_CONTEST(SERVER_OWNERSHIP_LOST)` precedes normal timer recovery.

Replay validates the pinned engine, ruleset, content identifiers and hashes, gapless command order, nondecreasing effective time, and every timer against a prior stable intent. It does not claim database, outbox, or process recovery determinism.
