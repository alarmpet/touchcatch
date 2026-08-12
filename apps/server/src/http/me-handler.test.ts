import { describe, expect, it, vi } from 'vitest';
import { createMeHandler } from './me-handler.js';

describe('authenticated account bootstrap handler', () => {
  it('derives the user from the bearer token and returns no private identity', async () => {
    const ensureAndResolve = vi.fn().mockResolvedValue('private-subject-must-not-leak');
    const handler = createMeHandler({
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      subjectResolver: { ensureAndResolve },
    });
    const response = await handler(new Request('https://api.test/v1/me', { headers: { authorization: 'Bearer public-test-token' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accountReady: true });
    expect(ensureAndResolve).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
  });

  it('rejects query parameters before account bootstrap', async () => {
    const ensureAndResolve = vi.fn();
    const handler = createMeHandler({
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      subjectResolver: { ensureAndResolve },
    });
    const response = await handler(new Request('https://api.test/v1/me?subjectKey=forbidden'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'INVALID_REQUEST' });
    expect(ensureAndResolve).not.toHaveBeenCalled();
  });

  it('fails closed on invalid authentication and bootstrap failure', async () => {
    const unauthorized = createMeHandler({
      verifier: { verify: async () => { throw new Error('UNAUTHORIZED'); } },
      subjectResolver: { ensureAndResolve: vi.fn() },
    });
    const unavailable = createMeHandler({
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      subjectResolver: { ensureAndResolve: async () => { throw new Error('private database detail'); } },
    });
    expect((await unauthorized(new Request('https://api.test/v1/me'))).status).toBe(401);
    const response = await unavailable(new Request('https://api.test/v1/me'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'ACCOUNT_SETUP_FAILED' });
  });
});
