import { describe, expect, it, vi } from 'vitest';
import type { MobileApiHandlers } from './pet-handlers.js';
import { createMobileApiRouter } from './router.js';

function handlers(): MobileApiHandlers {
  const ok = (route: string) => Promise.resolve(Response.json({ route }));
  return {
    getMe: vi.fn(() => ok('me')),
    getPetCollection: vi.fn(() => ok('collection')),
    claimDailyDraw: vi.fn(() => ok('daily-draw')),
    promoteDuplicates: vi.fn(() => ok('duplicate-promotion')),
    getWeeklyLeaderboard: vi.fn(() => ok('leaderboard')),
  };
}

describe('mobile API router', () => {
  it('matches only the five exact method/path pairs and exposes a non-secret health probe', async () => {
    const api = handlers();
    const route = createMobileApiRouter({ handlers: api });

    const health = await route(new Request('http://127.0.0.1:8787/healthz'));
    expect(health.status).toBe(200);
    expect(health.headers.get('content-type')).toMatch(/^application\/json/u);
    expect(await health.json()).toEqual({ status: 'ok' });

    expect((await route(new Request('http://127.0.0.1:8787/v1/me'))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/collection'))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/learning/leaderboard?seasonId=x'))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/daily-draw', { method: 'POST' }))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/duplicate-promotion', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))).status).toBe(200);

    const wrongMethod = await route(new Request('http://127.0.0.1:8787/v1/pets/collection', { method: 'POST' }));
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('GET');
    expect(await wrongMethod.json()).toEqual({ code: 'METHOD_NOT_ALLOWED' });
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/collection/'))).status).toBe(404);
  });

  it('rejects unapproved browser origins, invalid media types, and oversized bodies before handlers', async () => {
    const api = handlers();
    const route = createMobileApiRouter({
      handlers: api,
      allowedOrigins: ['https://preview.touchcatch.example'],
      maxRequestBodyBytes: 16,
    });

    const rejectedOrigin = await route(new Request('http://127.0.0.1:8787/v1/pets/collection', {
      headers: { origin: 'https://attacker.example' },
    }));
    expect(rejectedOrigin.status).toBe(403);
    expect(await rejectedOrigin.json()).toEqual({ code: 'ORIGIN_NOT_ALLOWED' });

    const loopbackOrigin = await route(new Request('http://127.0.0.1:8787/v1/pets/collection', {
      headers: { origin: 'http://localhost:8081' },
    }));
    expect(loopbackOrigin.status).toBe(200);
    expect(loopbackOrigin.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');

    const explicitOrigin = await route(new Request('http://127.0.0.1:8787/v1/pets/collection', {
      headers: { origin: 'https://preview.touchcatch.example' },
    }));
    expect(explicitOrigin.status).toBe(200);
    expect(explicitOrigin.headers.get('access-control-allow-origin')).toBe('https://preview.touchcatch.example');

    const wrongMedia = await route(new Request('http://127.0.0.1:8787/v1/pets/duplicate-promotion', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
    }));
    expect(wrongMedia.status).toBe(415);

    const oversized = await route(new Request('http://127.0.0.1:8787/v1/pets/duplicate-promotion', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'too-large' }),
    }));
    expect(oversized.status).toBe(413);
    expect(api.promoteDuplicates).not.toHaveBeenCalled();
  });

  it('answers approved browser preflights without invoking application handlers', async () => {
    const api = handlers();
    const route = createMobileApiRouter({ handlers: api, allowedOrigins: ['https://app.example'] });
    const response = await route(new Request('http://127.0.0.1:8787/v1/pets/duplicate-promotion', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, idempotency-key',
      },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST');
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization, content-type, idempotency-key');
    expect(api.promoteDuplicates).not.toHaveBeenCalled();
  });
});
