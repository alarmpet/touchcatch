# UI runtime asset publish, rollback, and takedown

Publishing is fail-closed: only a rights- and education-approved, content-addressed immutable asset manifest may replace the current DRAFT manifest. The publisher verifies every exact `(rightsRecordId, assetSha256)` pair and records the approval decision.

Rollback activates a previously approved immutable manifest; it never edits bytes or regenerates hashes. Takedown immediately blocks the affected hash at the CDN and admission layer, rolls back to an unaffected approved manifest, records owner/contact/audit evidence, and requires a new approval before restoration.

Run `node tools/check-ui-assets.mjs --target contract` while drafting. A release candidate must run `node tools/check-ui-assets.mjs --target beta`; this rejects DRAFT, missing or unapproved entries and verifies every referenced PNG's bytes, SHA-256, dimensions, immutable URL, rights record, theme review and model review. The required negative fixture is `tests/fixtures/ui/invalid-beta-unapproved.json`.
