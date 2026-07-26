import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
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
const expectedSources = [
  'docs/operations/supabase-auth-provider-handoff.md',
  'tests/contracts/auth-device-goldens.test.ts',
  'config/auth-device-reviewer-keys.v1.json',
];

type JsonRecord = Record<string, unknown>;
type Reviewer = { owner: string; publicKey: KeyObject | string };
type EvidenceDeps = {
  loadEvidence: (file: string) => string;
  inspectEvidence: (file: string) => { regular: boolean; symlink: boolean; realPath: string };
  trustedReviewers: Map<string, Reviewer>;
};
type GovernanceKeys = Map<'SECURITY' | 'OPERATIONS', KeyObject>;

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`MISSING_${label}`);
  return value;
}

const reviewerRegistryHash = (reviewers: JsonRecord[]): string => `sha256:${createHash('sha256').update(JSON.stringify([...reviewers].sort((a, b) => String(a.keyId).localeCompare(String(b.keyId))))).digest('hex')}`;

function validateReviewerRegistry(value: unknown, governanceKeys: GovernanceKeys = new Map()): { errors: string[]; trusted: Map<string, Reviewer> } {
  const errors: string[] = [];
  const trusted = new Map<string, Reviewer>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: ['registry root'], trusted };
  const registry = value as JsonRecord;
  if (Object.keys(registry).sort().join('|') !== ['schemaVersion', 'status', 'registryOwner', 'changeControl', 'changeAuthority', 'reviewers', 'approvalReceipts'].sort().join('|')) errors.push('registry schema');
  if (registry.schemaVersion !== '1.0.0' || registry.registryOwner !== 'SECURITY_OPERATIONS_JOINT' || registry.changeControl !== 'TWO_PARTY_REVIEW_REQUIRED' || JSON.stringify(registry.changeAuthority) !== JSON.stringify(['SECURITY', 'OPERATIONS'])) errors.push('registry governance');
  if (!Array.isArray(registry.reviewers) || !Array.isArray(registry.approvalReceipts)) return { errors: [...errors, 'registry arrays'], trusted };
  const reviewers = registry.reviewers as JsonRecord[];
  const receipts = registry.approvalReceipts as JsonRecord[];
  if (new Set(reviewers.map(reviewer => reviewer.keyId)).size !== reviewers.length) errors.push('duplicate reviewer keyId');
  for (const reviewer of reviewers) {
    if (Object.keys(reviewer).sort().join('|') !== ['authority', 'keyId', 'owner', 'publicKeyPem'].sort().join('|') || !/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(String(reviewer.keyId)) || !/^[a-z0-9][a-z0-9._ -]{2,79}$/iu.test(String(reviewer.owner)) || reviewer.authority !== 'DEVICE_AUTH_REVIEWER') {
      errors.push(`reviewer schema:${String(reviewer.keyId)}`);
      continue;
    }
    try {
      const publicKey = createPublicKey(String(reviewer.publicKeyPem));
      if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
      trusted.set(String(reviewer.keyId), { owner: String(reviewer.owner), publicKey });
    } catch {
      errors.push(`reviewer key:${String(reviewer.keyId)}`);
    }
  }
  if (reviewers.length === 0) {
    if (registry.status !== 'BLOCKED_NO_TRUSTED_REVIEWER_KEYS' || receipts.length !== 0) errors.push('empty registry status');
  } else {
    if (registry.status !== 'ACTIVE') errors.push('active registry status');
    const hash = reviewerRegistryHash(reviewers);
    const roles = receipts.map(receipt => receipt.role).sort().join('|');
    const distinctApprovers = new Set(receipts.map(receipt => receipt.approverId)).size === 2;
    if (receipts.length !== 2 || roles !== 'OPERATIONS|SECURITY' || !distinctApprovers) errors.push('approval receipt roles');
    for (const receipt of receipts) {
      const role = receipt.role as 'SECURITY' | 'OPERATIONS';
      const key = governanceKeys.get(role);
      const message = `${role}|${String(receipt.approverId)}|${hash}`;
      const exact = Object.keys(receipt).sort().join('|') === ['role', 'approverId', 'registryHash', 'signature'].sort().join('|');
      const signature = typeof receipt.signature === 'string' && /^[A-Za-z0-9+/]+={0,2}$/u.test(receipt.signature) ? Buffer.from(receipt.signature, 'base64') : undefined;
      let valid = exact && /^[a-z0-9][a-z0-9._-]{2,79}$/u.test(String(receipt.approverId)) && receipt.registryHash === hash && signature?.toString('base64') === receipt.signature;
      try { valid = Boolean(valid && key && signature && verify(null, Buffer.from(message), key, signature)); } catch { valid = false; }
      if (!valid) errors.push(`approval receipt:${role}`);
    }
  }
  if (errors.length > 0) trusted.clear();
  return { errors, trusted };
}

const canonicalPlatform = (record: JsonRecord): string => JSON.stringify({
  platform: record.platform,
  appBuildHash: record.appBuildHash,
  osDevice: record.osDevice,
  provider: record.provider,
  callbackMode: record.callbackMode,
  result: record.result,
  capturedAt: record.capturedAt,
  reviewer: record.reviewer,
  evidence: (record.scenarios as JsonRecord[]).map(scenario => ({ id: scenario.id, path: (scenario.evidenceReference as JsonRecord).path, sha256: (scenario.evidenceReference as JsonRecord).sha256 })),
});

const defaultDeps = (): EvidenceDeps => {
  const registry = JSON.parse(fs.readFileSync('config/auth-device-reviewer-keys.v1.json', 'utf8')) as unknown;
  const validated = validateReviewerRegistry(registry);
  if (validated.errors.length > 0) throw new Error(`reviewer registry invalid: ${validated.errors.join(',')}`);
  return {
    loadEvidence: file => fs.readFileSync(file, 'utf8'),
    inspectEvidence: file => {
      const absolute = path.resolve(file);
      const stat = fs.lstatSync(absolute);
      return { regular: stat.isFile(), symlink: stat.isSymbolicLink(), realPath: fs.realpathSync.native(absolute) };
    },
    trustedReviewers: validated.trusted,
  };
};

function validate(value: unknown, dependencies: EvidenceDeps = defaultDeps()): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['root'];
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 262_144) return ['artifact too large'];
  const root = value as JsonRecord;
  if (root.schemaVersion !== '1.0.0' || !['BLOCKED', 'PARTIAL', 'PASS'].includes(String(root.status))) errors.push('root status');
  if (!Array.isArray(root.platforms)) return [...errors, 'platforms'];
  if (root.platforms.length !== 2) errors.push('platform count');
  if (root.platforms.map(item => String((item as JsonRecord)?.platform)).sort().join('|') !== 'android|ios') errors.push('platform set');

  const decodedVariants = (input: string): string[] => {
    const variants = [input];
    for (let depth = 0; depth < 8; depth += 1) {
      const current = variants.at(-1) as string;
      const decoded = current.replace(/%([0-9a-f]{2})/giu, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
      if (decoded === current) break;
      variants.push(decoded);
    }
    return variants;
  };

  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${path}/${index}`));
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      const keyVariants = decodedVariants(key);
      if (keyVariants.some(candidate => /%(?![0-9a-f]{2})/iu.test(candidate))) errors.push(`${path}/${key}: malformed encoded key`);
      if (/%[0-9a-f]{2}/iu.test(keyVariants.at(-1) as string)) errors.push(`${path}/${key}: encoded key depth exceeded`);
      if (keyVariants.some(candidate => forbiddenKey.test(candidate))) errors.push(`${path}/${key}: forbidden key`);
      if (typeof child === 'string') {
        const variants = decodedVariants(child);
        if (variants.some(candidate => /%(?![0-9a-f]{2})/iu.test(candidate))) errors.push(`${path}/${key}: malformed percent encoding`);
        if (/%[0-9a-f]{2}/iu.test(variants.at(-1) as string)) errors.push(`${path}/${key}: encoded depth exceeded`);
        if (variants.some(candidate => /(?:[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|(?:^|[?&#])(?:code|authorization_code|access_token|refresh_token|session|service_key)=)/iu.test(candidate))) errors.push(`${path}/${key}: raw callback data`);
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
    for (const field of ['platform', 'appBuildHash', 'osDevice', 'provider', 'callbackMode', 'result', 'capturedAt', 'reviewer', 'attestation']) {
      if (!(field in record)) errors.push(`${String(record.platform)}/${field}: missing`);
    }
    if (!['android', 'ios'].includes(String(record.platform))) errors.push('platform value');
    const isPass = record.result === 'PASS';
    if (!['PASS', 'BLOCKED'].includes(String(record.result))) errors.push(`${String(record.platform)}/result`);
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
      const scenarioBlockers = Array.isArray(record.scenarios) ? (record.scenarios as JsonRecord[]).map(scenario => String(scenario.blockerCode)) : [];
      const deviceBlocker = record.platform === 'android' ? 'ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN' : 'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN';
      const required = ['PROVIDER_CREDENTIALS_PREVIEW', deviceBlocker, ...(record.platform === 'ios' ? ['IOS_GUIDELINE_4_8_REVIEW'] : []), ...(dependencies.trustedReviewers.size === 0 ? ['NO_TRUSTED_REVIEWER_KEYS'] : [])]
        .filter(code => scenarioBlockers.includes(code) || code === 'IOS_GUIDELINE_4_8_REVIEW' || code === 'NO_TRUSTED_REVIEWER_KEYS');
      if (!Array.isArray(record.blockerCodes) || record.blockerCodes.join('|') !== required.join('|')) errors.push(`${String(record.platform)}/blockerCodes: incomplete`);
      if (record.attestation !== null) errors.push(`${String(record.platform)}/attestation: forbidden for BLOCKED`);
    }
    if (!Array.isArray(record.scenarios) || record.scenarios.map(item => (item as JsonRecord).id).join('|') !== scenarios.join('|')) {
      errors.push(`${String(record.platform)}/scenarios`);
    } else {
      for (const scenario of record.scenarios as JsonRecord[]) {
        const blockedScenario = scenario.result === 'BLOCKED' && /^[A-Z][A-Z0-9_]+$/u.test(String(scenario.blockerCode)) && scenario.evidenceReference === undefined;
        const deviceBlocker = record.platform === 'android' ? 'ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN' : 'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN';
        const allowedBlockers = scenario.id === 'CONFIGURED_GOOGLE_OR_KAKAO_PROVIDER' ? ['PROVIDER_CREDENTIALS_PREVIEW', deviceBlocker] : [deviceBlocker];
        if (!isPass && !allowedBlockers.includes(String(scenario.blockerCode))) errors.push(`${String(record.platform)}/${String(scenario.id)}: blocker mismatch`);
        const passPath = `evidence/external/auth/device/${String(record.platform)}/${String(scenario.id).toLowerCase()}.json`;
        const reference = scenario.evidenceReference as JsonRecord | undefined;
        let passedScenario = scenario.result === 'PASS' && scenario.blockerCode === undefined && reference?.path === passPath && /^sha256:[a-f0-9]{64}$/u.test(String(reference?.sha256));
        if (passedScenario) {
          try {
            const inspection = dependencies.inspectEvidence(passPath);
            const expectedAbsolute = path.resolve(passPath);
            const root = `${path.resolve('.')}${path.sep}`;
            if (!inspection.regular || inspection.symlink || inspection.realPath !== expectedAbsolute || !inspection.realPath.startsWith(root)) throw new Error('unsafe evidence file');
            const raw = dependencies.loadEvidence(passPath);
            if (Buffer.byteLength(raw, 'utf8') > 65_536) throw new Error('evidence too large');
            const expected = { schemaVersion: '1.0.0', platform: record.platform, scenarioId: scenario.id, result: 'PASS', appBuildHash: record.appBuildHash, osDevice: record.osDevice, provider: record.provider, callbackMode: record.callbackMode, capturedAt: record.capturedAt, reviewer: record.reviewer };
            const actual = JSON.parse(raw) as JsonRecord;
            const exactKeys = Object.keys(actual).sort().join('|') === Object.keys(expected).sort().join('|');
            const bound = Object.entries(expected).every(([key, expectedValue]) => actual[key] === expectedValue);
            const digest = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
            passedScenario = exactKeys && bound && reference?.sha256 === digest;
          } catch {
            passedScenario = false;
          }
        }
        if (isPass ? !passedScenario : !blockedScenario) {
          errors.push(`${String(record.platform)}/${String(scenario.id)}: evidence invalid`);
        }
      }
    }
    if (isPass) {
      const attestation = record.attestation as JsonRecord | undefined;
      const trusted = attestation && dependencies.trustedReviewers.get(String(attestation.keyId));
      const signature = typeof attestation?.signature === 'string' && /^[A-Za-z0-9+/]+={0,2}$/u.test(attestation.signature) ? Buffer.from(attestation.signature, 'base64') : undefined;
      const signatureCanonical = signature && signature.toString('base64') === attestation?.signature;
      let valid = false;
      try {
        valid = Boolean(trusted && signature && trusted.owner === record.reviewer && signatureCanonical && verify(null, Buffer.from(canonicalPlatform(record)), trusted.publicKey, signature));
      } catch {
        valid = false;
      }
      if (!valid) errors.push(`${String(record.platform)}/attestation: invalid or untrusted`);
    }
  }

  const releaseScope = root.releaseScope as JsonRecord | undefined;
  const platformResults = root.platforms.map(item => (item as JsonRecord).result);
  const derivedStatus = platformResults.every(result => result === 'PASS') ? 'PASS' : platformResults.every(result => result === 'BLOCKED') ? 'BLOCKED' : 'PARTIAL';
  if (root.status !== derivedStatus) errors.push('root status derivation');
  const ios = root.platforms.find(item => (item as JsonRecord).platform === 'ios') as JsonRecord | undefined;
  const expectedIosPolicy = ios?.result === 'PASS' ? 'PASS' : 'BLOCKED';
  if (releaseScope?.iosGuideline48 !== expectedIosPolicy || releaseScope?.android !== 'NOT_BLOCKED_BY_IOS_GUIDELINE_4_8' || releaseScope?.guestGamePlay !== 'NOT_BLOCKED_BY_IOS_GUIDELINE_4_8') {
    errors.push('release scope');
  }
  const unresolved = new Set(root.platforms.flatMap(item => Array.isArray((item as JsonRecord).blockerCodes) ? (item as JsonRecord).blockerCodes as string[] : []));
  const derivedBlockers = ['PROVIDER_CREDENTIALS_PREVIEW', 'ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN', 'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN', 'IOS_GUIDELINE_4_8_REVIEW', 'NO_TRUSTED_REVIEWER_KEYS'].filter(code => unresolved.has(code));
  if (JSON.stringify(root.blockerCodes) !== JSON.stringify(derivedBlockers)) errors.push(root.status === 'PASS' ? 'root blockers: forbidden for PASS' : 'root blockers');
  if (JSON.stringify(root.evidenceSources) !== JSON.stringify(expectedSources)) errors.push('evidence sources');
  if (root.expoGoVersionMismatchPolicy !== 'INFRASTRUCTURE_ONLY_UNTIL_DEVELOPMENT_BUILD_REPRODUCTION') errors.push('Expo Go policy');
  return errors;
}

function promote(record: JsonRecord, evidence: Map<string, string>, privateKey: KeyObject, keyId = 'test-reviewer'): void {
  record.appBuildHash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  record.osDevice = record.platform === 'android' ? 'Android 16 / Pixel 9' : 'iOS 19.0 / iPhone 16';
  record.provider = 'GOOGLE';
  record.callbackMode = 'DEVELOPMENT_BUILD';
  record.result = 'PASS';
  record.capturedAt = '2026-07-22T12:00:00.000Z';
  record.reviewer = 'release-reviewer';
  record.blockerCodes = [];
  record.scenarios = (record.scenarios as JsonRecord[]).map(scenario => {
    const path = `evidence/external/auth/device/${String(record.platform)}/${String(scenario.id).toLowerCase()}.json`;
    const raw = JSON.stringify({ schemaVersion: '1.0.0', platform: record.platform, scenarioId: scenario.id, result: 'PASS', appBuildHash: record.appBuildHash, osDevice: record.osDevice, provider: record.provider, callbackMode: record.callbackMode, capturedAt: record.capturedAt, reviewer: record.reviewer });
    evidence.set(path, raw);
    return { id: scenario.id, result: 'PASS', evidenceReference: { path, sha256: `sha256:${createHash('sha256').update(raw).digest('hex')}` } };
  });
  record.attestation = { keyId, signature: sign(null, Buffer.from(canonicalPlatform(record)), privateKey).toString('base64') };
}

const fixtureDeps = (evidence: Map<string, string>, publicKey: KeyObject, overrides: Partial<EvidenceDeps> = {}): EvidenceDeps => ({
  loadEvidence: file => { const raw = evidence.get(file); if (!raw) throw new Error('missing'); return raw; },
  inspectEvidence: file => ({ regular: true, symlink: false, realPath: path.resolve(file) }),
  trustedReviewers: new Map([['test-reviewer', { owner: 'release-reviewer', publicKey }]]),
  ...overrides,
});

describe('native authentication golden evidence contract', () => {
  it('records complete Android and iOS scenario sets without fabricating a device run', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
    expect(validate(artifact)).toEqual([]);
  });

  it('rejects secrets, raw callback data, and fabricated BLOCKED run metadata', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const mutated = structuredClone(artifact) as JsonRecord;
    const android = required((mutated.platforms as JsonRecord[])[0], 'ANDROID_PLATFORM');
    android.appBuildHash = 'pretend-build';
    android.authorizationCode = 'not-allowed';
    android.callback = 'spotlearn://auth/callback?code=not-allowed';
    const fragmentMutation = structuredClone(artifact) as JsonRecord;
    required((fragmentMutation.platforms as JsonRecord[])[0], 'FRAGMENT_PLATFORM').callback = 'spotlearn://auth/callback#opaque';
    const blockerMutation = structuredClone(artifact) as JsonRecord;
    required((blockerMutation.platforms as JsonRecord[])[0], 'BLOCKER_PLATFORM').blockerCodes = ['PROVIDER_CREDENTIALS_PREVIEW'];
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
    const evidence = new Map<string, string>();
    const keys = generateKeyPairSync('ed25519');
    passed.status = 'PASS';
    (passed.releaseScope as JsonRecord).iosGuideline48 = 'PASS';
    passed.blockerCodes = [];
    for (const record of passed.platforms as JsonRecord[]) promote(record, evidence, keys.privateKey);
    const deps = fixtureDeps(evidence, keys.publicKey);
    expect(validate(passed, deps)).toEqual([]);
    const passWithBlocker = structuredClone(passed) as JsonRecord;
    passWithBlocker.blockerCodes = ['PROVIDER_CREDENTIALS_PREVIEW'];
    expect(validate(passWithBlocker, deps)).toContain('root blockers: forbidden for PASS');
    expect(validate(passed)).toContain('android/EMAIL_CONFIRMATION: evidence invalid');
    const hashMismatch = structuredClone(passed) as JsonRecord;
    const hashMismatchPlatform = required((hashMismatch.platforms as JsonRecord[])[0], 'HASH_MISMATCH_PLATFORM');
    const hashMismatchScenario = required((hashMismatchPlatform.scenarios as JsonRecord[])[0], 'HASH_MISMATCH_SCENARIO');
    (hashMismatchScenario.evidenceReference as JsonRecord).sha256 = `sha256:${'0'.repeat(64)}`;
    expect(validate(hashMismatch, deps)).toContain('android/EMAIL_CONFIRMATION: evidence invalid');
    expect(validate(hashMismatch, deps)).toContain('android/attestation: invalid or untrusted');
    const alteredEvidence = new Map(evidence);
    const firstEvidencePath = required([...alteredEvidence.keys()][0], 'FIRST_EVIDENCE_PATH');
    const firstEvidence = required(alteredEvidence.get(firstEvidencePath), 'FIRST_EVIDENCE');
    alteredEvidence.set(firstEvidencePath, firstEvidence.replace('Pixel 9', 'Pixel X'));
    expect(validate(passed, fixtureDeps(alteredEvidence, keys.publicKey))).toContain('android/EMAIL_CONFIRMATION: evidence invalid');
    const badSignature = structuredClone(passed) as JsonRecord;
    (required((badSignature.platforms as JsonRecord[])[0], 'BAD_SIGNATURE_PLATFORM').attestation as JsonRecord).signature = Buffer.alloc(64).toString('base64');
    expect(validate(badSignature, deps)).toContain('android/attestation: invalid or untrusted');
    expect(validate(passed, { ...deps, trustedReviewers: new Map() })).toContain('android/attestation: invalid or untrusted');
    const untrustedReviewer = structuredClone(passed) as JsonRecord;
    required((untrustedReviewer.platforms as JsonRecord[])[0], 'UNTRUSTED_REVIEWER_PLATFORM').reviewer = 'untrusted-reviewer';
    expect(validate(untrustedReviewer, deps)).toContain('android/attestation: invalid or untrusted');
    const metadataMutation = structuredClone(passed) as JsonRecord;
    required((metadataMutation.platforms as JsonRecord[])[0], 'METADATA_PLATFORM').osDevice = 'Android 16 / different device';
    expect(validate(metadataMutation, deps)).toContain('android/attestation: invalid or untrusted');
    expect(validate(passed, { ...deps, inspectEvidence: file => ({ regular: true, symlink: true, realPath: path.resolve(file) }) })).toContain('android/EMAIL_CONFIRMATION: evidence invalid');
    expect(validate(passed, { ...deps, inspectEvidence: file => ({ regular: false, symlink: false, realPath: path.resolve(file) }) })).toContain('android/EMAIL_CONFIRMATION: evidence invalid');
    expect(validate(passed, { ...deps, inspectEvidence: () => ({ regular: true, symlink: false, realPath: path.resolve('..', 'outside.json') }) })).toContain('android/EMAIL_CONFIRMATION: evidence invalid');
    required((passed.platforms as JsonRecord[])[0], 'PASS_PLATFORM').reviewer = null;
    expect(validate(passed, deps)).toContain('android/reviewer: required for PASS');
  });

  it('requires exactly one Android and one iOS record', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const duplicate = structuredClone(artifact) as JsonRecord;
    required((duplicate.platforms as JsonRecord[])[1], 'DUPLICATE_PLATFORM').platform = 'android';
    expect(validate(duplicate)).toContain('platform set');
  });

  it('rejects percent-encoded and repeatedly encoded callback payloads', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const encoded = structuredClone(artifact) as JsonRecord;
    required((encoded.platforms as JsonRecord[])[0], 'ENCODED_PLATFORM').callback = 'spotlearn%3A%2F%2Fauth%2Fcallback%3Fcode%3Dopaque';
    const doubleEncoded = structuredClone(artifact) as JsonRecord;
    required((doubleEncoded.platforms as JsonRecord[])[0], 'DOUBLE_ENCODED_PLATFORM').callback = 'spotlearn%253A%252F%252Fauth%252Fcallback%253Fcode%253Dopaque';
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
    const reviewers = JSON.parse(fs.readFileSync('config/auth-device-reviewer-keys.v1.json', 'utf8')) as JsonRecord;
    expect(artifact.blockerCodes).toContain('NO_TRUSTED_REVIEWER_KEYS');
    expect((external.nativeBlockerCodes as string[])).toContain('NO_TRUSTED_REVIEWER_KEYS');
    expect(reviewers).toMatchObject({ status: 'BLOCKED_NO_TRUSTED_REVIEWER_KEYS', registryOwner: 'SECURITY_OPERATIONS_JOINT', changeControl: 'TWO_PARTY_REVIEW_REQUIRED', changeAuthority: ['SECURITY', 'OPERATIONS'], reviewers: [], approvalReceipts: [] });
  });

  it('rejects an arbitrary scenario blocker', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const platform = required((artifact.platforms as JsonRecord[])[0], 'ARBITRARY_BLOCKER_PLATFORM');
    required((platform.scenarios as JsonRecord[])[0], 'ARBITRARY_BLOCKER_SCENARIO').blockerCode = 'ARBITRARY_BLOCKER';
    expect(validate(artifact)).toContain('android/EMAIL_CONFIRMATION: blocker mismatch');
  });

  it('fails closed for long-prefix, malformed, and oversized encoded material', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const long = structuredClone(artifact) as JsonRecord;
    required((long.platforms as JsonRecord[])[0], 'LONG_PLATFORM').callback = `${'a'.repeat(5_000)}spotlearn%3A%2F%2Fauth%2Fcallback%3Fcode%3Dopaque`;
    const malformed = structuredClone(artifact) as JsonRecord;
    required((malformed.platforms as JsonRecord[])[0], 'MALFORMED_PLATFORM').callback = '%ZZspotlearn%3A%2F%2Fauth%2Fcallback%3Fcode%3Dopaque';
    const oversized = structuredClone(artifact) as JsonRecord;
    oversized.padding = 'a'.repeat(300_000);
    expect(validate(long)).toContain('/platforms/0/callback: raw callback data');
    expect(validate(malformed)).toEqual(expect.arrayContaining(['/platforms/0/callback: malformed percent encoding', '/platforms/0/callback: raw callback data']));
    expect(validate(oversized)).toContain('artifact too large');
  });

  it('accepts honest Android PASS plus iOS BLOCKED as PARTIAL', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    const evidence = new Map<string, string>();
    const keys = generateKeyPairSync('ed25519');
    artifact.status = 'PARTIAL';
    promote(required((artifact.platforms as JsonRecord[])[0], 'PARTIAL_ANDROID_PLATFORM'), evidence, keys.privateKey);
    const ios = required((artifact.platforms as JsonRecord[])[1], 'PARTIAL_IOS_PLATFORM');
    required((ios.scenarios as JsonRecord[]).find(scenario => scenario.id === 'CONFIGURED_GOOGLE_OR_KAKAO_PROVIDER'), 'IOS_PROVIDER_SCENARIO').blockerCode = 'IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN';
    ios.blockerCodes = ['IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN', 'IOS_GUIDELINE_4_8_REVIEW'];
    artifact.blockerCodes = ['IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN', 'IOS_GUIDELINE_4_8_REVIEW'];
    expect(validate(artifact, fixtureDeps(evidence, keys.publicKey))).toEqual([]);
  });

  it('rejects self-attestation on a BLOCKED platform', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    required((artifact.platforms as JsonRecord[])[0], 'SELF_ATTESTATION_PLATFORM').attestation = { keyId: 'self', signature: 'forged' };
    expect(validate(artifact)).toContain('android/attestation: forbidden for BLOCKED');
  });

  it('fails closed for deeply encoded and malformed object keys', () => {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as JsonRecord;
    let deep = '%61uthorizationCode';
    for (let index = 0; index < 8; index += 1) deep = deep.replaceAll('%', '%25');
    const platform = required((artifact.platforms as JsonRecord[])[0], 'ENCODED_KEY_PLATFORM');
    platform[deep] = 'opaque';
    platform['%ZZauthorizationCode'] = 'opaque';
    expect(validate(artifact)).toEqual(expect.arrayContaining([
      `/platforms/0/${deep}: encoded key depth exceeded`,
      '/platforms/0/%ZZauthorizationCode: malformed encoded key',
    ]));
  });

  it('validates empty and two-authority-approved ACTIVE reviewer registries', () => {
    const empty = JSON.parse(fs.readFileSync('config/auth-device-reviewer-keys.v1.json', 'utf8')) as JsonRecord;
    expect(validateReviewerRegistry(empty).errors).toEqual([]);
    const reviewerKey = generateKeyPairSync('ed25519');
    const securityKey = generateKeyPairSync('ed25519');
    const operationsKey = generateKeyPairSync('ed25519');
    const reviewers: JsonRecord[] = [{ keyId: 'reviewer-1', owner: 'release-reviewer', authority: 'DEVICE_AUTH_REVIEWER', publicKeyPem: reviewerKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() }];
    const hash = reviewerRegistryHash(reviewers);
    const receipt = (role: 'SECURITY' | 'OPERATIONS', approverId: string, privateKey: KeyObject): JsonRecord => ({
      role,
      approverId,
      registryHash: hash,
      signature: sign(null, Buffer.from(`${role}|${approverId}|${hash}`), privateKey).toString('base64'),
    });
    const active: JsonRecord = { ...empty, status: 'ACTIVE', reviewers, approvalReceipts: [receipt('SECURITY', 'security-approver', securityKey.privateKey), receipt('OPERATIONS', 'operations-approver', operationsKey.privateKey)] };
    const governance = new Map<'SECURITY' | 'OPERATIONS', KeyObject>([['SECURITY', securityKey.publicKey], ['OPERATIONS', operationsKey.publicKey]]);
    expect(validateReviewerRegistry(active, governance).errors).toEqual([]);
    expect(validateReviewerRegistry({ ...active, reviewers: [...reviewers, required(reviewers[0], 'DUPLICATE_REVIEWER')] }, governance).errors).toContain('duplicate reviewer keyId');
    expect(validateReviewerRegistry({ ...active, approvalReceipts: (active.approvalReceipts as JsonRecord[]).map(receiptValue => ({ ...receiptValue, approverId: 'same-approver' })) }, governance).errors).toContain('approval receipt roles');
    expect(validateReviewerRegistry(active).errors).toEqual(expect.arrayContaining(['approval receipt:SECURITY', 'approval receipt:OPERATIONS']));
    const wrongStatus = { ...active, status: 'BLOCKED_NO_TRUSTED_REVIEWER_KEYS' };
    expect(validateReviewerRegistry(wrongStatus, governance).errors).toContain('active registry status');
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const wrongKey = structuredClone(active) as JsonRecord;
    required((wrongKey.reviewers as JsonRecord[])[0], 'WRONG_KEY_REVIEWER').publicKeyPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(validateReviewerRegistry(wrongKey, governance).errors).toContain('reviewer key:reviewer-1');
  });
});
