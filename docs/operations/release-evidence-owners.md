# Release evidence ownership

These assignments identify the evidence owner; a local CI pass does not close
an external blocker. Owners must attach the artifact and record its expiry or
review date.

| Gate | Owner role | Artifact | Environment | Expiry/review |
|---|---|---|---|---|
| Node/pnpm clean verification | Release engineering | CI run URL and `check` log | provisioned Node 24.18.0/pnpm 11.13.0 | every release |
| Signed web/mobile build | Release engineering | signed build metadata and checksums | production-like build runner | each build |
| DB backup/PITR/restore | Operations | restore drill report | production DB replica | quarterly |
| Rights and education approval | Content/education owner | signed review checklist | authorized review workspace | per content revision |
| Physical device/accessibility goldens | QA/mobile owner | iOS/Android capture set | real target devices | per client release |
| Provider delivery/redaction/deletion | Observability owner | delivery and deletion report | production-like providers | per release |
| Regional soak | SRE | 200-match/400-socket soak report | target region | per release |

Statuses remain `BLOCKED_EXTERNAL` until the named artifact is attached and
approved by the owner. CI may publish deterministic local evidence only.
