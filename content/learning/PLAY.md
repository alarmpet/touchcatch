# Local Learning Demo

The mobile root route now exposes a development-only, locally playable spot-the-difference demo for all nine draft packs. It loads the checked-in A/B PNG pairs and their private hitboxes directly; it does not publish content or cross a production API boundary.

## Run

Use the repository-pinned runtime (Node 24.18.0 and pnpm 11.13.0):

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --dir apps/mobile start
```

Open the development build on Android or iOS, choose a lesson, tap all ten differences in either image, then answer the meaning question. A correct answer reaches the completion screen and `Play again` resets the lesson.

## Acceptance boundary

- This route is intentionally disabled when `__DEV__` is false because its local registry contains private solutions.
- Human rights and education approval are still required before publication.
- Signed production bundles, authenticated server projections, CDN upload, and physical iOS/Android golden evidence remain external release gates.
- A repository test or local development session is not physical-device evidence.
