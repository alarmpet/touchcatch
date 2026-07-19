# G3 transaction adapter handoff

The runtime must first acquire a match lease with `private.acquire_match_lease_g3(match_id, new_owner, expected_owner, expected_fence, lease_ms)`. A new match requires both expected values to be null. Renewal requires the current owner and fence. Before expiry, ownership transfer requires an exact current-owner/current-fence compare-and-swap. After expiry, reclaim still requires the current fence, preserving epoch continuity.

`private.apply_match_command_g3` locks the authoritative match lease before inspecting a receipt. It rejects a stale fence even for a completed receipt, allocates event sequence numbers under that same match lock, and commits receipt, journal, snapshot, timer intent, effect outbox, and completion atomically. Callers must not infer ownership from a receipt or retry with a guessed fence.
