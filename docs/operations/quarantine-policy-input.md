# Legacy quarantine approved-policy input

The privacy operator accepts only `QuarantinePolicyV1`. An authorized legal/privacy owner must supply every field: `policyVersion`, `approvalId`, `action`, exact nested `fields`, and `legalHoldPrecedence: BLOCK_ACTION`.

No default is provided for retention duration, legal basis, backup/WAL/PITR/restore handling, delete-versus-redact, or legal-hold release. Until those approvals and production evidence exist, production quarantine readiness remains blocked. Dry-run evidence contains only job ID, approved action, aggregate affected-field count, and lifecycle status; raw values and stable source hashes are forbidden.
