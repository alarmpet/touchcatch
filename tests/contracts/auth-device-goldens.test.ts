import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const artifactPath = 'docs/testing/reports/auth-device-goldens.v1.json';
const scenarios = [
  'EMAIL_CONFIRMATION',
  'CONFIGURED_GOOGLE_OR_KAKAO_PROVIDER',
  'COLD_START_CALLBACK',
  'LIVE_CALLBACK',
  'RESTART_RECOVERY',
  'LOGOUT',
  'ACCOUNT_DELETION',
] as const;
const forbiddenKey = /(?:token|authorizationCode|refresh|session|secret|serviceKey)/iu;

type JsonRecord = Record<string, unknown>;

function validate(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['root'];
  const root = value as JsonRecord;
  if (root.schemaVersion !== '1.0.0' || root.status !== 'BLOCKED') errors.push('root status');
  if (!Array.isArray(root.platforms)) return [...errors, 'platforms'];
  if (root.platforms.length !== 2) errors.push('platform count');

  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${path}/${index}`));
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      if (forbiddenKey.test(key)) errors.push(`${path}/${key}: forbidden key`);
      if (typeof child === 'string' && /(?:^[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|(?:access|refresh)_token=|authorization_code=)/iu.test(child)) {
        errors.push(`${path}/${key}: raw callback data`);
      }
      visit(child, `${path}/${key}`);
    }
  };
  visit(root, '');

  for (const candidate of root.platforms) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push('platform record');
      continue;
    }
    const record = candidate as JsonRecord;
    for (const field of ['platform', 'appBuildHash', 'osDevice', 'provider', 'callbackMode', 'result', 'capturedAt', 'reviewer']) {
      if (!(field in record)) errors.push(`${String(record.platform)}/${field}: missing`);
    }
    if (!['android', 'ios'].includes(String(record.platform))) errors.push('platform value');
    if (record.result !== 'BLOCKED') errors.push(`${String(record.platform)}/result`);
    for (const field of ['appBuildHash', 'osDevice', 'provider', 'callbackMode', 'capturedAt', 'reviewer']) {
      if (record[field] !== null) errors.push(`${String(record.platform)}/${field}: fabricated run value`);
    }
    if (!Array.isArray(record.blockerCodes) || record.blockerCodes.length === 0 || record.blockerCodes.some(code => !/^[A-Z][A-Z0-9_]+$/u.test(String(code)))) {
      errors.push(`${String(record.platform)}/blockerCodes`);
    } else {
      const required = record.platform === 'android'
        ? ['PROVIDER_CREDENTIALS_PREVIEW', 'ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN']
        : ['PROVIDER_CREDENTIALS_PREVIEW', 'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN', 'IOS_GUIDELINE_4_8_REVIEW'];
      if (record.blockerCodes.join('|') !== required.join('|')) errors.push(`${String(record.platform)}/blockerCodes: incomplete`);
    }
    if (!Array.isArray(record.scenarios) || record.scenarios.map(item => (item as JsonRecord).id).join('|') !== scenarios.join('|')) {
      errors.push(`${String(record.platform)}/scenarios`);
    } else {
      for (const scenario of record.scenarios as JsonRecord[]) {
        if (scenario.result !== 'BLOCKED' || !/^[A-Z][A-Z0-9_]+$/u.test(String(scenario.blockerCode))) {
          errors.push(`${String(record.platform)}/${String(scenario.id)}`);
        }
      }
    }
  }

  const releaseScope = root.releaseScope as JsonRecord | undefined;
  if (releaseScope?.iosGuideline48 !== 'BLOCKED' || releaseScope?.android !== 'NOT_BLOCKED_BY_IOS_GUIDELINE_4_8' || releaseScope?.guestGamePlay !== 'NOT_BLOCKED_BY_IOS_GUIDELINE_4_8') {
    errors.push('release scope');
  }
  if (root.expoGoVersionMismatchPolicy !== 'INFRASTRUCTURE_ONLY_UNTIL_DEVELOPMENT_BUILD_REPRODUCTION') errors.push('Expo Go policy');
  return errors;
}

describe('native authentication golden evidence contract', () => {
  it('records complete Android and iOS scenario sets without fabricating a device run', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
    expect(validate(artifact)).toEqual([]);
  });

  it('rejects secrets, raw callback data, and fabricated BLOCKED run metadata', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const mutated = structuredClone(artifact) as JsonRecord;
    const android = (mutated.platforms as JsonRecord[])[0];
    android.appBuildHash = 'pretend-build';
    android.authorizationCode = 'not-allowed';
    android.callback = 'spotlearn://auth/callback?code=not-allowed';
    const fragmentMutation = structuredClone(artifact) as JsonRecord;
    (fragmentMutation.platforms as JsonRecord[])[0].callback = 'spotlearn://auth/callback#opaque';
    const blockerMutation = structuredClone(artifact) as JsonRecord;
    (blockerMutation.platforms as JsonRecord[])[0].blockerCodes = ['PROVIDER_CREDENTIALS_PREVIEW'];
    expect(validate(mutated)).toEqual(expect.arrayContaining([
      'android/appBuildHash: fabricated run value',
      '/platforms/0/authorizationCode: forbidden key',
      '/platforms/0/callback: raw callback data',
    ]));
    expect(validate(fragmentMutation)).toContain('/platforms/0/callback: raw callback data');
    expect(validate(blockerMutation)).toContain('android/blockerCodes: incomplete');
  });
});
