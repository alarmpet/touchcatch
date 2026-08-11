import { describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey, createMobileApiTransport, MobileApiError } from './mobile-api-transport.js';

describe('mobile bearer API transport', () => {
  it('creates only UUIDv4 idempotency keys', () => {
    expect(createIdempotencyKey(() => '123E4567-E89B-42D3-A456-426614174000')).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(() => createIdempotencyKey(() => 'not-random')).toThrow('IDEMPOTENCY_KEY_GENERATION_FAILED');
  });
  it('injects only an access bearer and JSON/idempotency headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const transport = createMobileApiTransport({ baseUrl: 'https://api.example', tokens: { getAccessToken: async () => 'access-token' }, fetchImpl });
    await expect(transport.request({ method: 'POST', path: '/v1/pets/daily-draw', idempotencyKey: '123e4567-e89b-42d3-a456-426614174000' })).resolves.toEqual({ ok: true });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('idempotency-key')).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(JSON.stringify(init)).not.toMatch(/refresh/i);
  });

  it('refreshes and retries exactly once after 401', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const refreshAccessToken = vi.fn().mockResolvedValue('access-2');
    const transport = createMobileApiTransport({ baseUrl: 'https://api.example', tokens: { getAccessToken: async () => 'access-1', refreshAccessToken }, fetchImpl });
    await expect(transport.request({ method: 'GET', path: '/v1/pets/collection' })).resolves.toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get('authorization')).toBe('Bearer access-2');
  });

  it('projects stable errors and aborts timed-out requests', async () => {
    const rejected = createMobileApiTransport({ baseUrl: 'https://api.example', tokens: { getAccessToken: async () => null }, fetchImpl: vi.fn() });
    await expect(rejected.request({ method: 'GET', path: '/v1/pets/collection' })).rejects.toMatchObject({ code: 'AUTH_SESSION_REQUIRED' });

    const failing = createMobileApiTransport({ baseUrl: 'https://api.example', tokens: { getAccessToken: async () => 'access' }, fetchImpl: vi.fn().mockResolvedValue(Response.json({ code: 'REWARD_POLICY_NOT_APPROVED' }, { status: 409 })) });
    await expect(failing.request({ method: 'GET', path: '/v1/pets/collection' })).rejects.toEqual(new MobileApiError('REWARD_POLICY_NOT_APPROVED', 409));

    const timeoutFetch: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const timeout = createMobileApiTransport({ baseUrl: 'https://api.example', timeoutMs: 5, tokens: { getAccessToken: async () => 'access' }, fetchImpl: timeoutFetch });
    await expect(timeout.request({ method: 'GET', path: '/v1/pets/collection' })).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });

    const slowBodyFetch: typeof fetch = async (_url, init) => new Response(new ReadableStream({
      start(controller) { init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError'))); },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const slowBody = createMobileApiTransport({ baseUrl: 'https://api.example', timeoutMs: 5, tokens: { getAccessToken: async () => 'access' }, fetchImpl: slowBodyFetch });
    await expect(slowBody.request({ method: 'GET', path: '/v1/pets/collection' })).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
  });

  it('does not leak token-provider failures through the public transport', async () => {
    const initial = createMobileApiTransport({ baseUrl: 'https://api.example', tokens: { getAccessToken: async () => { throw new Error('private storage path'); } }, fetchImpl: vi.fn() });
    await expect(initial.request({ method: 'GET', path: '/v1/pets/collection' })).rejects.toMatchObject({ code: 'AUTH_SESSION_UNAVAILABLE' });
    const refresh = createMobileApiTransport({
      baseUrl: 'https://api.example',
      tokens: { getAccessToken: async () => 'access', refreshAccessToken: async () => { throw new Error('private auth response'); } },
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })),
    });
    await expect(refresh.request({ method: 'GET', path: '/v1/pets/collection' })).rejects.toMatchObject({ code: 'AUTH_SESSION_UNAVAILABLE' });
  });
});
