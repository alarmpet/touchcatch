# ADR-003: authenticated socket delivery and replay

Status: Accepted for MVP contracts.

Authentication resolves server-side to an opaque participant key; token subjects and raw JWTs never enter commands, receipts, events, snapshots, or journals. Compatibility is fail-closed before ingress.

The durable journal is replay authority. `lastEventSeq` requests an exact contiguous suffix; caches are bounded accelerators only. An unavailable or inconsistent suffix causes a viewer-safe snapshot replacement. Private events become `state_advanced` at the same cursor.

MVP uses sticky routing to one match owner. Generic Pub/Sub and built-in connection recovery are not replay authorities. Multi-node migration requires durable Redis Streams or persisted journal replay plus the conformance suite.
