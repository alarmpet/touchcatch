import { describe, expect, it } from 'vitest';
import {
  authErrorCodeSchema,
  authGateStateSchema,
  authMethodSchema,
  learningProgressMergeRequestSchema,
  oauthProviderSchema,
} from '../../packages/contracts/src/auth.js';

const event = {
  deviceEventId: '10000000-0000-4000-8000-000000000001',
  contentKey: 'english.market.v1',
  contentRevision: '2026-07-19.1',
  completedAt: '2026-07-19T12:34:56.000Z',
};

describe('auth contracts', () => {
  it('separates OAuth providers from all login methods', () => {
    expect(oauthProviderSchema.options).toEqual(['google', 'kakao']);
    expect(authMethodSchema.options).toEqual(['email', 'google', 'kakao']);
    expect(oauthProviderSchema.safeParse('email').success).toBe(false);
  });

  it('pins gate states and public error codes', () => {
    expect(authGateStateSchema.options).toEqual(['GUEST', 'VERIFICATION_PENDING', 'READY', 'ACCOUNT_SETUP_FAILED']);
    expect(authErrorCodeSchema.options).toEqual([
      'UNAUTHORIZED',
      'ANONYMOUS_FORBIDDEN',
      'EMAIL_UNVERIFIED',
      'ACCOUNT_SETUP_FAILED',
      'VALIDATION_FAILED',
      'IDEMPOTENCY_CONFLICT',
    ]);
  });

  it('accepts only the versioned non-economic progress shape', () => {
    expect(learningProgressMergeRequestSchema.parse({ schemaVersion: '1', events: [event] })).toEqual({ schemaVersion: '1', events: [event] });
    for (const forbidden of ['score', 'points', 'currency', 'items', 'rank', 'reward']) {
      expect(learningProgressMergeRequestSchema.safeParse({ schemaVersion: '1', events: [{ ...event, [forbidden]: 1 }] }).success).toBe(false);
    }
  });

  it('rejects malformed IDs, timestamps, extra top-level keys, and oversized batches', () => {
    expect(learningProgressMergeRequestSchema.safeParse({ schemaVersion: '1', events: [{ ...event, deviceEventId: 'not-v4' }] }).success).toBe(false);
    expect(learningProgressMergeRequestSchema.safeParse({ schemaVersion: '1', events: [{ ...event, completedAt: 'yesterday' }] }).success).toBe(false);
    expect(learningProgressMergeRequestSchema.safeParse({ schemaVersion: '1', events: [event], extra: true }).success).toBe(false);
    expect(learningProgressMergeRequestSchema.safeParse({ schemaVersion: '1', events: Array.from({ length: 101 }, () => event) }).success).toBe(false);
  });
});
