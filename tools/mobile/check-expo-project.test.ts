import { describe, expect, it } from 'vitest';
import { checkExpoProject, type ExpoProjectFacts } from './check-expo-project.js';

const validFixture: ExpoProjectFacts = {
  cwd: 'D:\\touchcatch',
  repoRoot: 'D:\\touchcatch',
  nodeVersion: '24.18.0',
  pnpmVersion: '11.13.0',
  expoVersion: '57.0.1',
  routerVersion: '57.0.7',
  reactNativeVersion: '0.86.0',
  androidPackage: 'com.touchcatch.mobile',
  scheme: 'spotlearn',
  registryDrift: false,
  hasSupabaseSecretKey: false,
};

describe('Expo project preflight', () => {
  it('accepts the pinned guest project', () => {
    expect(checkExpoProject(validFixture)).toEqual([]);
  });

  it.each([
    ['nodeVersion', '22.0.0', 'MOBILE_NODE_VERSION'],
    ['pnpmVersion', '10.0.0', 'MOBILE_PNPM_VERSION'],
    ['expoVersion', '56.0.0', 'MOBILE_EXPO_VERSION'],
    ['routerVersion', '56.0.0', 'MOBILE_ROUTER_VERSION'],
    ['reactNativeVersion', '0.85.0', 'MOBILE_REACT_NATIVE_VERSION'],
    ['androidPackage', 'com.example.app', 'MOBILE_ANDROID_PACKAGE'],
    ['scheme', 'wrong', 'MOBILE_SCHEME'],
    ['registryDrift', true, 'MOBILE_REGISTRY_DRIFT'],
    ['hasSupabaseSecretKey', true, 'MOBILE_SECRET_ENV'],
  ] as const)('rejects invalid %s', (field, value, code) => {
    expect(checkExpoProject({ ...validFixture, [field]: value })).toContain(code);
  });

  it('rejects execution outside the repository root', () => {
    expect(checkExpoProject({ ...validFixture, cwd: 'D:\\touchcatch\\apps\\mobile' }))
      .toContain('MOBILE_WORKING_DIRECTORY');
  });
});
