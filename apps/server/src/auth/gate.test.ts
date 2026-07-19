import { describe, expect, it } from 'vitest';
import { authorize, type AuthContext } from './gate.js';

describe('server auth gate', () => {
  it.each([
    [null, 'UNAUTHORIZED', 401],
    [{ authSub: 'subject', isAnonymous: true, accountReady: true }, 'ANONYMOUS_FORBIDDEN', 403],
    [{ authSub: 'subject', isAnonymous: false, accountReady: false }, 'ACCOUNT_SETUP_FAILED', 503],
  ] as const)('fails closed for %j', (identity, code, status) => {
    expect(authorize(identity as AuthContext | null)).toEqual({ ok: false, code, status });
  });

  it('allows a permanent identity only after bootstrap', () => {
    expect(authorize({ authSub: 'subject', isAnonymous: false, accountReady: true })).toEqual({ ok: true, authSub: 'subject' });
  });
});
