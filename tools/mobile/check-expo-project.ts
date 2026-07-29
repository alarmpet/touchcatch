import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePlayableRegistry } from '../content/generate-playable-registry.js';

export type ExpoProjectFacts = Readonly<{
  cwd: string;
  repoRoot: string;
  nodeVersion: string;
  pnpmVersion: string;
  expoVersion: string;
  routerVersion: string;
  reactNativeVersion: string;
  androidPackage: string;
  scheme: string;
  registryDrift: boolean;
  hasSupabaseSecretKey: boolean;
}>;

function samePath(left: string, right: string): boolean {
  return resolve(left).replaceAll('\\', '/').toLowerCase()
    === resolve(right).replaceAll('\\', '/').toLowerCase();
}

export function checkExpoProject(facts: ExpoProjectFacts): string[] {
  const errors: string[] = [];
  if (!samePath(facts.cwd, facts.repoRoot)) errors.push('MOBILE_WORKING_DIRECTORY');
  if (facts.nodeVersion !== '24.18.0') errors.push('MOBILE_NODE_VERSION');
  if (facts.pnpmVersion !== '11.13.0') errors.push('MOBILE_PNPM_VERSION');
  if (facts.expoVersion !== '57.0.1') errors.push('MOBILE_EXPO_VERSION');
  if (facts.routerVersion !== '57.0.7') errors.push('MOBILE_ROUTER_VERSION');
  if (facts.reactNativeVersion !== '0.86.0') errors.push('MOBILE_REACT_NATIVE_VERSION');
  if (facts.androidPackage !== 'com.touchcatch.mobile') errors.push('MOBILE_ANDROID_PACKAGE');
  if (facts.scheme !== 'spotlearn') errors.push('MOBILE_SCHEME');
  if (facts.registryDrift) errors.push('MOBILE_REGISTRY_DRIFT');
  if (facts.hasSupabaseSecretKey) errors.push('MOBILE_SECRET_ENV');
  return errors;
}

async function collectFacts(): Promise<ExpoProjectFacts> {
  const cwd = process.cwd();
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  const mobilePackage = JSON.parse(
    await readFile(resolve(repoRoot, 'apps/mobile/package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> };
  const app = JSON.parse(
    await readFile(resolve(repoRoot, 'apps/mobile/app.json'), 'utf8'),
  ) as { expo: { scheme: string; android: { package: string } } };
  let registryDrift = false;
  try {
    await generatePlayableRegistry(repoRoot, true);
  } catch {
    registryDrift = true;
  }
  const pnpmVersion =
    process.env.npm_config_user_agent?.match(/pnpm\/([^\s]+)/)?.[1] ?? '';
  return {
    cwd,
    repoRoot,
    nodeVersion: process.versions.node,
    pnpmVersion,
    expoVersion: mobilePackage.dependencies.expo ?? '',
    routerVersion: mobilePackage.dependencies['expo-router'] ?? '',
    reactNativeVersion: mobilePackage.dependencies['react-native'] ?? '',
    androidPackage: app.expo.android.package,
    scheme: app.expo.scheme,
    registryDrift,
    hasSupabaseSecretKey: Object.hasOwn(process.env, 'SUPABASE_SECRET_KEY'),
  };
}

export async function runExpoProjectCheck(): Promise<void> {
  const errors = checkExpoProject(await collectFacts());
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  console.log('Mobile Expo preflight passed.');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await runExpoProjectCheck();
}
