import { describe, expect, it } from 'vitest';
import { sessionUnavailableCopy } from './session-unavailable';

describe('sessionUnavailableCopy', () => {
  it('names policy-disabled failures instead of a blank 준비 중 screen', () => {
    const copy = sessionUnavailableCopy('RANKING_POLICY_NOT_APPROVED');
    expect(copy.title).toContain('정책');
    expect(copy.detail).toContain('RANKING_POLICY_NOT_APPROVED');
    expect(copy.retry).toBe(true);
    expect(copy.support).toBe(true);
  });

  it('sends signed-out players to login, not retry', () => {
    expect(sessionUnavailableCopy('SIGNED_OUT')).toMatchObject({ retry: false, support: false });
  });
});
