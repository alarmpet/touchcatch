import { describe, expect, it } from 'vitest';
import {
  REQUIRED_SCENARIOS,
  validateAndroidEvidence,
  type AndroidGuestEvidence,
} from './check-device-evidence.js';

const screenshotIds = ['CATALOG', 'TEN_OF_TEN', 'QUIZ', 'COMPLETE'] as const;
const validPass: AndroidGuestEvidence = {
  schemaVersion: '1.0.0',
  platform: 'ANDROID',
  status: 'PASS',
  commitSha: 'a'.repeat(40),
  recordedAt: '2026-07-29T00:00:00.000Z',
  runtime: {
    node: 'v24.18.0', pnpm: '11.13.0', expo: '57.0.1',
    applicationId: 'com.touchcatch.mobile', developmentBuildId: 'debug-1',
  },
  device: { manufacturer: 'Google', model: 'Pixel', androidVersion: '16' },
  scenarios: REQUIRED_SCENARIOS.map((id) => ({ id, status: 'PASS', note: 'physical device' })),
  screenshots: screenshotIds.map((id) => ({
    id,
    path: `docs/evidence/mobile/android/${id.toLowerCase()}.png`,
    sha256: 'b'.repeat(64),
  })),
  blocker: null,
};
const context = {
  expectedCommitSha: 'a'.repeat(40),
  now: new Date('2026-07-30T00:00:00.000Z'),
  existingPaths: new Set(validPass.screenshots.map((item) => item.path)),
};

describe('Android physical-device evidence', () => {
  it('accepts complete physical PASS evidence', () => {
    expect(validateAndroidEvidence(validPass, context)).toEqual([]);
  });

  it.each([
    ['missing-commit', { commitSha: '' }],
    ['missing-device-model', { device: { ...validPass.device, model: '' } }],
    ['missing-android-version', { device: { ...validPass.device, androidVersion: '' } }],
    ['missing-development-build-id', { runtime: { ...validPass.runtime, developmentBuildId: '' } }],
    ['missing-screenshot', { screenshots: validPass.screenshots.slice(1) }],
    ['three-pack-scenario-not-pass', { scenarios: validPass.scenarios.map((item) => item.id === 'PACK_EN_DILEMMA' ? { ...item, status: 'FAIL' as const } : item) }],
    ['offline-not-pass', { scenarios: validPass.scenarios.map((item) => item.id === 'OFFLINE_COMPLETE' ? { ...item, status: 'FAIL' as const } : item) }],
    ['background-restore-not-pass', { scenarios: validPass.scenarios.map((item) => item.id === 'BACKGROUND_FOREGROUND' ? { ...item, status: 'FAIL' as const } : item) }],
    ['android-pass-with-synthetic-value', { device: { ...validPass.device, model: 'SYNTHETIC' } }],
    ['ios-status-in-android-record', { platform: 'IOS' }],
  ])('rejects %s', (_name, patch) => {
    expect(validateAndroidEvidence({ ...validPass, ...patch } as AndroidGuestEvidence, context))
      .not.toEqual([]);
  });

  it('rejects future timestamps and commit mismatches', () => {
    expect(validateAndroidEvidence({ ...validPass, recordedAt: '2026-08-01T00:00:00.000Z' }, context))
      .toContain('EVIDENCE_FUTURE_TIMESTAMP');
    expect(validateAndroidEvidence(validPass, { ...context, expectedCommitSha: 'c'.repeat(40) }))
      .toContain('EVIDENCE_COMMIT_MISMATCH');
  });

  it('accepts only the explicit reduced Android blocker record', () => {
    expect(validateAndroidEvidence({
      schemaVersion: '1.0.0',
      platform: 'ANDROID',
      status: 'BLOCKED',
      commitSha: 'a'.repeat(40),
      recordedAt: '2026-07-29T00:00:00.000Z',
      blocker: 'DEVICE_UNAVAILABLE',
    }, context)).toEqual([]);
  });
});
