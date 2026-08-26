# TouchCatch agent entry

This repository already has a hard-won operator file. Read that first. Do not copy its rules into this file.

| What you need | Where it lives |
| --- | --- |
| Local landmines (art, Metro, emulator, Fast Refresh, hash-locked theme, DRAFT policy) | [`CLAUDE.md`](CLAUDE.md) |
| Android-first launch order | [`docs/decisions/2026-08-20-launch-scope.md`](docs/decisions/2026-08-20-launch-scope.md) |
| Release DAG (WP-0…WP-11) | [`docs/superpowers/plans/2026-08-20-production-service-readiness-master-plan.md`](docs/superpowers/plans/2026-08-20-production-service-readiness-master-plan.md) |
| 2026-08-24 errata + agent/CI alignment | [`docs/superpowers/plans/2026-08-24-production-readiness-gap-and-agent-workflow-improvement-plan.md`](docs/superpowers/plans/2026-08-24-production-readiness-gap-and-agent-workflow-improvement-plan.md) |

Root `13_CODING_AGENT_PROMPTS.md` is a historical `DOC-*` inventory. It is not the implementation order. `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md` retired Step 0–8.

Do not use Grok `/execute-plan` (parallel PR DAG) on this tree. Implement one work package at a time. Do not delete the dirty working tree.
