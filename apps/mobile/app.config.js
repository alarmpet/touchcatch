import path from 'node:path';

// Expo Router must resolve the route directory from the mobile package, not the
// pnpm workspace root or a copied Android harness.
process.env.EXPO_ROUTER_APP_ROOT = path.join(process.cwd(), 'app');

export default function appConfig({ config }) {
  return {
    ...config,
    name: 'Spot Learn Battle',
    slug: 'spot-learn-battle',
    scheme: 'spotlearn',
    plugins: ['expo-router', 'expo-screen-orientation'],
  };
}
