# Android casual learning approval

**Date:** 2026-08-24  
**Decision id:** `android-casual-beta-2026-08-24`  
**Approved by:** product-owner (repository owner, this session: “승인하고 진행해”)

This is a **product policy approval** for Android closed-beta casual attempts. It is not a legal, rights, education-pack, or public-store approval.

## Approved

| Artifact | How |
| --- | --- |
| `config/weekly-competition.v1.json` | `status: APPROVED` + signed `docs/approvals/weekly-competition-v1-approval.json` |
| `config/hint-policy.v1.json` | `status: APPROVED` envelope on the artifact |
| `config/trusted-approval-signers.v1.json` | public Ed25519 key `android-casual-beta-2026-08-24` |

The issuing private key is **not** in the repository. Registry pin: see `docs/decisions/2026-08-24-android-casual-learning-approval.json`.

## Explicitly not approved

- `config/economy.v1.json`
- `config/daily-pet-loop.v1.json`
- `config/pet-runtime-art.v1.json`
- `config/pet-rights-evidence.v1.json`
- `config/learning-progression.v1.json`
- individual learning packs (`publishBlocked` / catalog `DRAFT`)

Pet and ranking **reward** UI stays hidden in production. Casual attempts no longer wait on pet-economy approval (`loadMobileRuntimePolicy` attempt gate).

## What a running server still needs

Policy enablement is not a season row. `POST /v1/learning/attempts` still needs a pinned weekly season and published content revisions in the database. Local fixture tooling remains `tools/mobile/prepare-local-authenticated-fixture.ts`.
