# UI visual evidence gate

Concept images are direction-only and never pixel or SSIM oracles. Only human-approved implementation captures may become goldens. Runner, OS, emulator, font, font scale, locale, GPU, seed and time must match `visual-evidence.v1.json`; masks are deterministic and per-region thresholds require repeated-noise and known P0/P1 mutation calibration. Baselines must never update automatically.

The current iOS and Android device rows are `BLOCKED_MANUAL_DEVICE_EVIDENCE`: no approved font/runtime assets or pinned device captures exist. Candidate thresholds (SSIM 0.97 and RGB > 12/255 at no more than 5% of pixels) are explicitly uncalibrated and cannot pass the gate.

The recurring contract command is `node tools/check-ui-acceptance-matrix.mjs`. The executable capture gate is `pnpm ui:visual` with exact `UI_PLATFORM`, `UI_ADAPTER`, `UI_OS`, `UI_DEVICE`, `UI_LOCALE`, `UI_SEED`, and `UI_TIME` pins from `config/ui-visual-adapters.v1.json` and `visual-evidence.v1.json`. It loads `config/ui-goldens.v1.json`, refuses concept or unapproved baselines, and exits blocked until approved device goldens and masks exist. Region comparison passes solely on the ratio of pixels over each region's channel threshold; an isolated high delta does not create a separate global-max veto.
