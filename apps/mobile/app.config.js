import path from 'node:path';

// Expo Router must resolve the route directory from the mobile package, not the
// pnpm workspace root or a copied Android harness.
process.env.EXPO_ROUTER_APP_ROOT = path.join(process.cwd(), 'app');

// Identity (name/slug/scheme/version/package) lives in app.json and nothing here may restate
// it. This file used to hard-code `Spot Learn Battle`/`spotlearn`, which silently outranked
// app.json: the store name was renamed to TouchCatch and the built app kept the old identity
// and the old OAuth callback scheme. `tests/contracts/mobile-oauth-config.test.ts` now
// compares the resolved config against the native manifest so that drift fails the gate.
export default function appConfig({ config }) {
  return { ...config };
}
