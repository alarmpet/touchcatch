import { describe, expect, it } from 'vitest';
import { authenticateAdmin } from './server/auth.js';

describe('admin session authentication', () => {
  it('derives authority only from verified auth app metadata', async () => {
    const fetcher = async () => new Response(JSON.stringify({ id: 'actor-1', app_metadata: { roles: ['CONTENT_PUBLISHER'] }, user_metadata: { roles: ['OWNER'] } }), { status: 200 });
    await expect(authenticateAdmin({ authorization: 'Bearer token-safe', sessionId: 'session-safe' }, { authOrigin: 'https://auth.example.test', publishableKey: 'public', fetcher })).resolves.toEqual({ actorId: 'actor-1', sessionId: 'session-safe', roles: ['CONTENT_PUBLISHER'] });
  });

  it('fails closed for malformed bearer, auth failure, missing role or forged user metadata', async () => {
    const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
    await expect(authenticateAdmin({ authorization: 'Basic bad', sessionId: 's' }, { authOrigin: 'https://auth.example.test', publishableKey: 'public', fetcher: ok({}) })).rejects.toThrow('UNAUTHORIZED');
    await expect(authenticateAdmin({ authorization: 'Bearer token', sessionId: 's' }, { authOrigin: 'https://auth.example.test', publishableKey: 'public', fetcher: ok({}, 401) })).rejects.toThrow('UNAUTHORIZED');
    await expect(authenticateAdmin({ authorization: 'Bearer token', sessionId: 's' }, { authOrigin: 'https://auth.example.test', publishableKey: 'public', fetcher: ok({ id: 'actor', app_metadata: {}, user_metadata: { roles: ['CONTENT_PUBLISHER'] } }) })).rejects.toThrow('FORBIDDEN');
  });
});
