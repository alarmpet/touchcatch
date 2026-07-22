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
const expectedBlockers = [
  'PROVIDER_CREDENTIALS_PREVIEW',
  'ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN',
  'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN',
  'IOS_GUIDELINE_4_8_REVIEW',
];
const expectedSources = [
  'docs/operations/supabase-auth-provider-handoff.md',
  'tests/contracts/auth-device-goldens.test.ts',
];

type JsonRecord = Record<string, unknown>;

function validate(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['root'];
  const root = value as JsonRecord;
  if (root.schemaVersion !== '1.0.0' || !['BLOCKED', 'PASS'].includes(String(root.status))) errors.push('root status');
  if (!Array.isArray(root.platforms)) return [...errors, 'platforms'];
  if (root.platforms.length !== 2) errors.push('platform count');
  if (root.platforms.map(item => String((item as JsonRecord)?.platform)).sort().join('|') !== 'android|ios') errors.push('platform set');

  const decodedVariants = (input: string): string[] => {
    const variants = [input.slice(0, 4096)];
    for (let depth = 0; depth < 8; depth += 1) {
      try {
        const decoded = decodeURIComponent(variants.at(-1) as string);
        if (decoded === variants.at(-1)) break;
        variants.push(decoded.slice(0, 4096));
      } catch {
        break;
      }
    }
    return variants;
  };

  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${path}/${index}`));
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      if (decodedVariants(key).some(candidate => forbiddenKey.test(candidate))) errors.push(`${path}/${key}: forbidden key`);
      if (typeof child === 'string' && decodedVariants(child).some(candidate => /(?:^[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|(?:^|[?&#])(?:code|authorization_code|access_token|refresh_token|session|service_key)=)/iu.test(candidate))) {
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
    const isPass = record.result === 'PASS';
    if (record.result !== root.status) errors.push(`${String(record.platform)}/result`);
    if (isPass) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(String(record.appBuildHash))) errors.push(`${String(record.platform)}/appBuildHash: required for PASS`);
      if (typeof record.osDevice !== 'string' || record.osDevice.length < 3) errors.push(`${String(record.platform)}/osDevice: required for PASS`);
      if (!['GOOGLE', 'KAKAO'].includes(String(record.provider))) errors.push(`${String(record.platform)}/provider: required for PASS`);
      if (record.callbackMode !== 'DEVELOPMENT_BUILD') errors.push(`${String(record.platform)}/callbackMode: required for PASS`);
      if (typeof record.capturedAt !== 'string' || Number.isNaN(Date.parse(record.capturedAt)) || new Date(record.capturedAt).toISOString() !== record.capturedAt) errors.push(`${String(record.platform)}/capturedAt: required for PASS`);
      if (typeof record.reviewer !== 'string' || !/^[a-z0-9][a-z0-9._ -]{2,79}$/iu.test(record.reviewer)) errors.push(`${String(record.platform)}/reviewer: required for PASS`);
      if (!Array.isArray(record.blockerCodes) || record.blockerCodes.length !== 0) errors.push(`${String(record.platform)}/blockerCodes: forbidden for PASS`);
    } else {
      for (const field of ['appBuildHash', 'osDevice', 'provider', 'callbackMode', 'capturedAt', 'reviewer']) {
        if (record[field] !== null) errors.push(`${String(record.platform)}/${field}: fabricated run value`);
      }
      const required = record.platform === 'android'
        ? ['PROVIDER_CREDENTIALS_PREVIEW', 'ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN']
        : ['PROVIDER_CREDENTIALS_PREVIEW', 'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN', 'IOS_GUIDELINE_4_8_REVIEW'];
      if (!Array.isArray(record.blockerCodes) || record.blockerCodes.join('|') !== required.join('|')) errors.push(`${String(record.platform)}/blockerCodes: incomplete`);
    }
    if (!Array.isArray(record.scenarios) || record.scenarios.map(item => (item as JsonRecord).id).join('|') !== scenarios.join('|')) {
      errors.push(`${String(record.platform)}/scenarios`);
    } else {
      for (const scenario of record.scenarios as JsonRecord[]) {
        const blockedScenario = scenario.result === 'BLOCKED' && /^[A-Z][A-Z0-9_]+$/u.test(String(scenario.blockerCode)) && scenario.evidenceReference === undefined;
        const passReference = `evidence/external/auth/device/${String(record.platform)}/${String(scenario.id).toLowerCase()}.json`;
        const passedScenario = scenario.result === 'PASS' && scenario.evidenceReference === passReference && scenario.blockerCode === undefined;
        if (isPass ? !passedScenario : !blockedScenario) {
          errors.push(`${String(record.platform)}/${String(scenario.id)}`);
        }
      }
    }
  }

  const releaseScope = root.releaseScope as JsonRecord | undefined;
  const expectedIosPolicy = root.status === 'PASS' ? 'PASS' : 'BLOCKED';
  if (releaseScope?.iosGuideline48 !== expectedIosPolicy || releaseScope?.android !== 'NOT_BLOCKED_BY_IOS_GUIDELINE_4_8' || releaseScope?.guestGamePlay !== 'NOT_BLOCKED_BY_IOS_GUIDELINE_4_8') {
    errors.push('release scope');
  }
  if (root.status === 'BLOCKED' && JSON.stringify(root.blockerCodes) !== JSON.stringify(expectedBlockers)) errors.push('root blockers');
  if (root.status === 'PASS' && (!Array.isArray(root.blockerCodes) || root.blockerCodes.length !== 0)) errors.push('root blockers: forbidden for PASS');
  if (JSON.stringify(root.evidenceSources) !== JSON.stringify(expectedSources)) errors.push('evidence sources');
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

  it('accepts complete reviewed PASS evidence but rejects incomplete PASS evidence', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const passed = structuredClone(artifact) as JsonRecord;
    passed.status = 'PASS';
    (passed.releaseScope as JsonRecord).iosGuideline48 = 'PASS';
    passed.blockerCodes = [];
    for (const record of passed.platforms as JsonRecord[]) {
      record.appBuildHash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      record.osDevice = record.platform === 'android' ? 'Android 16 / Pixel 9' : 'iOS 19.0 / iPhone 16';
      record.provider = 'GOOGLE';
      record.callbackMode = 'DEVELOPMENT_BUILD';
      record.result = 'PASS';
      record.capturedAt = '2026-07-22T12:00:00.000Z';
      record.reviewer = 'release-reviewer';
      record.blockerCodes = [];
      record.scenarios = (record.scenarios as JsonRecord[]).map(scenario => ({
        id: scenario.id,
        result: 'PASS',
        evidenceReference: `evidence/external/auth/device/${String(record.platform)}/${String(scenario.id).toLowerCase()}.json`,
      }));
    }
    expect(validate(passed)).toEqual([]);
    const passWithBlocker = structuredClone(passed) as JsonRecord;
    passWithBlocker.blockerCodes = ['PROVIDER_CREDENTIALS_PREVIEW'];
    expect(validate(passWithBlocker)).toContain('root blockers: forbidden for PASS');
    (passed.platforms as JsonRecord[])[0].reviewer = null;
    expect(validate(passed)).toContain('android/reviewer: required for PASS');
  });

  it('requires exactly one Android and one iOS record', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const duplicate = structuredClone(artifact) as JsonRecord;
    (duplicate.platforms as JsonRecord[])[1].platform = 'android';
    expect(validate(duplicate)).toContain('platform set');
  });

  it('rejects percent-encoded and repeatedly encoded callback payloads', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const encoded = structuredClone(artifact) as JsonRecord;
    (encoded.platforms as JsonRecord[])[0].callback = 'spotlearn%3A%2F%2Fauth%2Fcallback%3Fcode%3Dopaque';
    const doubleEncoded = structuredClone(artifact) as JsonRecord;
    (doubleEncoded.platforms as JsonRecord[])[0].callback = 'spotlearn%253A%252F%252Fauth%252Fcallback%253Fcode%253Dopaque';
    expect(validate(encoded)).toContain('/platforms/0/callback: raw callback data');
    expect(validate(doubleEncoded)).toContain('/platforms/0/callback: raw callback data');
  });

  it('binds curated evidence provenance and blockers to the manifest', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const evidence = JSON.parse(fs.readFileSync('config/requirement-evidence.v1.json', 'utf8')) as { entries: JsonRecord[] };
    const sec001 = evidence.entries.find(entry => entry.id === 'SEC-001') as JsonRecord;
    const external = sec001.externalEvidence as JsonRecord;
    expect(external.nativeGoldenManifest).toBe(artifactPath);
    expect(external.nativeGoldenStatus).toBe(artifact.status);
    expect(external.nativeBlockerCodes).toEqual(artifact.blockerCodes);
    expect(external.nativeEvidenceSources).toEqual(artifact.evidenceSources);
  });
});
