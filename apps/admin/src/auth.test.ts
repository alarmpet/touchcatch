import { describe, expect, it } from 'vitest';
import { createCookieSessionAuth } from './server/auth.js';

describe('HttpOnly cookie session authentication', () => {
  const input = { sessionId: 'opaque-session', origin: 'https://admin.test', allowedOrigin: 'https://admin.test', csrfCookie: 'csrf', csrfHeader: 'csrf' };
  it('fails closed for missing, expired and role-denied sessions', async () => {
    const missing = createCookieSessionAuth({ hashSession: (v) => v, loadSession: async () => null });
    await expect(missing.authenticate({ ...input, sessionId: null })).rejects.toThrow('UNAUTHORIZED');
    await expect(missing.authenticate(input)).rejects.toThrow('UNAUTHORIZED');
    const denied = createCookieSessionAuth({ hashSession: (v) => v, loadSession: async () => ({ sessionId: 's', actorId: 'a', roles: [] }) });
    await expect(denied.authenticate(input)).rejects.toThrow('FORBIDDEN');
  });
});
