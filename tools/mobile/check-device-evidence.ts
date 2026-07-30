import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SCENARIOS = [
  'COLD_START',
  'PACK_EN_RESILIENCE',
  'PACK_EN_DILEMMA',
  'PACK_EN_SUSTAINABILITY',
  'TAP_IMAGE_A',
  'TAP_IMAGE_B',
  'MISS_NO_PROGRESS',
  'DUPLICATE_NO_PROGRESS',
  'WRONG_THEN_CORRECT_QUIZ',
  'REPLAY',
  'SELECT_ANOTHER_PACK',
  'BACKGROUND_FOREGROUND',
  'OFFLINE_COMPLETE',
] as const;
const SCREENSHOT_IDS = ['CATALOG', 'TEN_OF_TEN', 'QUIZ', 'COMPLETE'] as const;

type BlockedAndroidEvidence = Readonly<{
  schemaVersion: '1.0.0';
  platform: 'ANDROID';
  status: 'BLOCKED';
  commitSha: string;
  recordedAt: string;
  blocker: 'DEVICE_UNAVAILABLE';
}>;

type PassedAndroidEvidence = Readonly<{
  schemaVersion: '1.0.0';
  platform: 'ANDROID';
  status: 'PASS' | 'FAIL';
  commitSha: string;
  recordedAt: string;
  runtime: Readonly<{
    node: 'v24.18.0';
    pnpm: '11.13.0';
    expo: '57.0.1';
    applicationId: 'com.touchcatch.mobile';
    developmentBuildId: string;
  }>;
  device: Readonly<{ manufacturer: string; model: string; androidVersion: string }>;
  scenarios: readonly Readonly<{ id: string; status: 'PASS' | 'FAIL'; note: string }>[];
  screenshots: readonly Readonly<{
    id: typeof SCREENSHOT_IDS[number];
    path: string;
    sha256: string;
  }>[];
  blocker: string | null;
}>;

export type AndroidGuestEvidence = BlockedAndroidEvidence | PassedAndroidEvidence;
type BlockedIosEvidence = Readonly<{
  schemaVersion: '1.0.0';
  platform: 'IOS';
  status: 'BLOCKED';
  commitSha: string;
  recordedAt: string;
  blocker: 'DEVICE_OR_MACOS_HOST_UNAVAILABLE';
}>;
type PassedIosEvidence = Readonly<{
  schemaVersion: '1.0.0';
  platform: 'IOS';
  status: 'PASS' | 'FAIL';
  commitSha: string;
  recordedAt: string;
  runtime: Readonly<{
    bundleIdentifier: 'com.touchcatch.mobile';
    developmentBuildId: string;
  }>;
  device: Readonly<{ model: string; iosVersion: string }>;
  scenarios: readonly Readonly<{ id: string; status: 'PASS' | 'FAIL'; note: string }>[];
  screenshots: readonly Readonly<{
    id: typeof SCREENSHOT_IDS[number];
    path: string;
    sha256: string;
  }>[];
  blocker: string | null;
}>;
export type IosGuestEvidence = BlockedIosEvidence | PassedIosEvidence;
export type EvidenceContext = Readonly<{
  expectedCommitSha: string;
  now: Date;
  existingPaths: ReadonlySet<string>;
}>;

function invalidOrFutureTimestamp(value: string, now: Date): boolean {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp > now.getTime();
}

function containsSynthetic(value: string): boolean {
  return /synthetic|placeholder|emulator|unknown|todo/i.test(value);
}

export function validateAndroidEvidence(
  evidence: AndroidGuestEvidence,
  context: EvidenceContext,
): string[] {
  const errors: string[] = [];
  if (evidence.schemaVersion !== '1.0.0') errors.push('EVIDENCE_SCHEMA_VERSION');
  if (evidence.platform !== 'ANDROID') errors.push('EVIDENCE_PLATFORM');
  if (!/^[0-9a-f]{7,40}$/i.test(evidence.commitSha)) errors.push('EVIDENCE_COMMIT');
  if (evidence.commitSha !== context.expectedCommitSha) errors.push('EVIDENCE_COMMIT_MISMATCH');
  if (invalidOrFutureTimestamp(evidence.recordedAt, context.now)) errors.push('EVIDENCE_FUTURE_TIMESTAMP');

  if (evidence.status === 'BLOCKED') {
    if (evidence.blocker !== 'DEVICE_UNAVAILABLE') errors.push('EVIDENCE_BLOCKER');
    const allowed = new Set(['schemaVersion', 'platform', 'status', 'commitSha', 'recordedAt', 'blocker']);
    if (Object.keys(evidence).some((key) => !allowed.has(key))) errors.push('EVIDENCE_BLOCKED_FIELDS');
    return errors;
  }

  if (!['PASS', 'FAIL'].includes(evidence.status)) errors.push('EVIDENCE_STATUS');
  const runtime = evidence.runtime;
  if (
    runtime.node !== 'v24.18.0' ||
    runtime.pnpm !== '11.13.0' ||
    runtime.expo !== '57.0.1' ||
    runtime.applicationId !== 'com.touchcatch.mobile'
  ) errors.push('EVIDENCE_RUNTIME');
  if (!runtime.developmentBuildId || containsSynthetic(runtime.developmentBuildId)) {
    errors.push('EVIDENCE_DEVELOPMENT_BUILD');
  }
  for (const value of [evidence.device.manufacturer, evidence.device.model, evidence.device.androidVersion]) {
    if (!value || containsSynthetic(value)) errors.push('EVIDENCE_DEVICE');
  }

  const scenarios = new Map(evidence.scenarios.map((item) => [item.id, item]));
  if (scenarios.size !== REQUIRED_SCENARIOS.length) errors.push('EVIDENCE_SCENARIO_SET');
  for (const id of REQUIRED_SCENARIOS) {
    const scenario = scenarios.get(id);
    if (!scenario || (evidence.status === 'PASS' && scenario.status !== 'PASS')) {
      errors.push(`EVIDENCE_SCENARIO:${id}`);
    }
  }
  const screenshots = new Map(evidence.screenshots.map((item) => [item.id, item]));
  if (screenshots.size !== SCREENSHOT_IDS.length) errors.push('EVIDENCE_SCREENSHOT_SET');
  for (const id of SCREENSHOT_IDS) {
    const screenshot = screenshots.get(id);
    if (
      !screenshot ||
      !screenshot.path.startsWith('docs/evidence/mobile/android/') ||
      !/^[0-9a-f]{64}$/i.test(screenshot.sha256) ||
      /^0{64}$/.test(screenshot.sha256) ||
      !context.existingPaths.has(screenshot.path)
    ) {
      errors.push(`EVIDENCE_SCREENSHOT:${id}`);
    }
  }
  if (evidence.status === 'PASS' && evidence.blocker !== null) errors.push('EVIDENCE_PASS_BLOCKER');
  return errors;
}

export function validateIosEvidence(
  evidence: IosGuestEvidence,
  context: EvidenceContext,
): string[] {
  const errors: string[] = [];
  if (evidence.schemaVersion !== '1.0.0') errors.push('EVIDENCE_SCHEMA_VERSION');
  if (evidence.platform !== 'IOS') errors.push('EVIDENCE_PLATFORM');
  if (!/^[0-9a-f]{7,40}$/i.test(evidence.commitSha)) errors.push('EVIDENCE_COMMIT');
  if (evidence.commitSha !== context.expectedCommitSha) errors.push('EVIDENCE_COMMIT_MISMATCH');
  if (invalidOrFutureTimestamp(evidence.recordedAt, context.now)) errors.push('EVIDENCE_FUTURE_TIMESTAMP');
  if (evidence.status === 'BLOCKED') {
    if (evidence.blocker !== 'DEVICE_OR_MACOS_HOST_UNAVAILABLE') errors.push('EVIDENCE_BLOCKER');
    const allowed = new Set(['schemaVersion', 'platform', 'status', 'commitSha', 'recordedAt', 'blocker']);
    if (Object.keys(evidence).some((key) => !allowed.has(key))) errors.push('EVIDENCE_BLOCKED_FIELDS');
    return errors;
  }
  if (
    evidence.runtime.bundleIdentifier !== 'com.touchcatch.mobile' ||
    !evidence.runtime.developmentBuildId ||
    containsSynthetic(evidence.runtime.developmentBuildId)
  ) errors.push('EVIDENCE_RUNTIME');
  if (!evidence.device.model || !evidence.device.iosVersion) errors.push('EVIDENCE_DEVICE');
  const scenarios = new Map(evidence.scenarios.map((item) => [item.id, item]));
  if (scenarios.size !== REQUIRED_SCENARIOS.length) errors.push('EVIDENCE_SCENARIO_SET');
  for (const id of REQUIRED_SCENARIOS) {
    const item = scenarios.get(id);
    if (!item || (evidence.status === 'PASS' && item.status !== 'PASS')) {
      errors.push(`EVIDENCE_SCENARIO:${id}`);
    }
  }
  const screenshots = new Map(evidence.screenshots.map((item) => [item.id, item]));
  if (screenshots.size !== SCREENSHOT_IDS.length) errors.push('EVIDENCE_SCREENSHOT_SET');
  for (const id of SCREENSHOT_IDS) {
    const screenshot = screenshots.get(id);
    if (
      !screenshot ||
      !screenshot.path.startsWith('docs/evidence/mobile/ios/') ||
      !/^[0-9a-f]{64}$/i.test(screenshot.sha256) ||
      /^0{64}$/.test(screenshot.sha256) ||
      !context.existingPaths.has(screenshot.path)
    ) errors.push(`EVIDENCE_SCREENSHOT:${id}`);
  }
  return errors;
}

export function aggregateDeviceStatus(status: Readonly<{
  android: 'PASS' | 'FAIL' | 'BLOCKED';
  ios: 'PASS' | 'FAIL' | 'BLOCKED';
}>): Readonly<{
  localGuestGame: 'PASS' | 'FAIL' | 'BLOCKED';
  android: typeof status.android;
  ios: typeof status.ios;
}> {
  const localGuestGame = status.android === 'PASS'
    ? 'PASS'
    : status.android === 'FAIL' || status.ios === 'FAIL' ? 'FAIL' : 'BLOCKED';
  return { localGuestGame, ...status };
}

async function validateAndroidFile(root: string): Promise<void> {
  const relativePath = 'docs/evidence/mobile/android-guest-device.v1.json';
  const evidence = JSON.parse(
    await readFile(resolve(root, relativePath), 'utf8'),
  ) as AndroidGuestEvidence;
  execFileSync('git', ['merge-base', '--is-ancestor', evidence.commitSha, 'HEAD'], { cwd: root });
  const existingPaths = new Set<string>();
  if (evidence.status !== 'BLOCKED') {
    for (const screenshot of evidence.screenshots) {
      const bytes = await readFile(resolve(root, screenshot.path));
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== screenshot.sha256) throw new Error(`EVIDENCE_HASH:${screenshot.id}`);
      existingPaths.add(screenshot.path);
    }
  }
  const errors = validateAndroidEvidence(evidence, {
    expectedCommitSha: evidence.commitSha,
    now: new Date(),
    existingPaths,
  });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Android guest device evidence: ${evidence.status}`);
}

async function validateIosFile(root: string): Promise<void> {
  const evidence = JSON.parse(
    await readFile(resolve(root, 'docs/evidence/mobile/ios-guest-device.v1.json'), 'utf8'),
  ) as IosGuestEvidence;
  execFileSync('git', ['merge-base', '--is-ancestor', evidence.commitSha, 'HEAD'], { cwd: root });
  const existingPaths = new Set<string>();
  if (evidence.status !== 'BLOCKED') {
    for (const screenshot of evidence.screenshots) {
      const bytes = await readFile(resolve(root, screenshot.path));
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== screenshot.sha256) throw new Error(`EVIDENCE_HASH:${screenshot.id}`);
      existingPaths.add(screenshot.path);
    }
  }
  const errors = validateIosEvidence(evidence, {
    expectedCommitSha: evidence.commitSha,
    now: new Date(),
    existingPaths,
  });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`iOS guest device evidence: ${evidence.status}`);
}

export async function runDeviceEvidenceCheck(platform: string | undefined): Promise<void> {
  if (platform === 'android') return validateAndroidFile(process.cwd());
  if (platform === 'ios') return validateIosFile(process.cwd());
  if (platform === 'aggregate') {
    const android = JSON.parse(await readFile(resolve(process.cwd(), 'docs/evidence/mobile/android-guest-device.v1.json'), 'utf8')) as AndroidGuestEvidence;
    const ios = JSON.parse(await readFile(resolve(process.cwd(), 'docs/evidence/mobile/ios-guest-device.v1.json'), 'utf8')) as IosGuestEvidence;
    const result = aggregateDeviceStatus({ android: android.status, ios: ios.status });
    console.log(JSON.stringify(result));
    if (result.localGuestGame !== 'PASS') throw new Error('LOCAL_GUEST_GAME_NOT_PASSED');
    return;
  }
  throw new Error('EVIDENCE_UNSUPPORTED_PLATFORM');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--platform');
  await runDeviceEvidenceCheck(process.argv.includes('--aggregate') ? 'aggregate' : index >= 0 ? process.argv[index + 1] : undefined);
}
