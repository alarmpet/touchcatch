import { describe, expect, it, vi } from 'vitest';
import type { MobileApiHandlers } from './pet-handlers.js';
import { createMobileApiRouter } from './router.js';

function handlers() {
  const ok = (route: string) => Promise.resolve(Response.json({ route }));
  return {
    getMe: vi.fn(() => ok('me')),
    deleteMe: vi.fn(() => ok('delete-me')),
    readDeletionStatus: vi.fn(() => ok('deletion-status')),
    getPetCollection: vi.fn(() => ok('collection')),
    claimDailyDraw: vi.fn(() => ok('daily-draw')),
    promoteDuplicates: vi.fn(() => ok('duplicate-promotion')),
    getWeeklyLeaderboard: vi.fn(() => ok('leaderboard')),
    getWeeklyChallenges: vi.fn((_request: Request) => ok('challenges')),
    startAttempt: vi.fn((_request: Request) => ok('attempt-start')),
    attestAttemptAssets: vi.fn((_request: Request, _attemptId: string) => ok('attempt-assets-ready')),
    tapAttempt: vi.fn((_request: Request, _attemptId: string) => ok('attempt-tap')),
    completeAttempt: vi.fn((_request: Request, _attemptId: string) => ok('attempt-complete')),
  } satisfies MobileApiHandlers;
}

const attemptId = '80000000-0000-4000-8000-000000000001';

describe('mobile API router', () => {
  it('matches only the declared method/path pairs and exposes a non-secret health probe', async () => {
    const api = handlers();
    const route = createMobileApiRouter({ handlers: api });

    const health = await route(new Request('http://127.0.0.1:8787/healthz'));
    expect(health.status).toBe(200);
    expect(health.headers.get('content-type')).toMatch(/^application\/json/u);
    expect(await health.json()).toEqual({ status: 'ok' });

    const unprobedReady = await route(new Request('http://127.0.0.1:8787/ready'));
    expect(unprobedReady.status).toBe(503);
    expect(await unprobedReady.json()).toEqual({ status: 'not_ready', code: 'DEPENDENCY_UNAVAILABLE' });

    expect((await route(new Request('http://127.0.0.1:8787/v1/me'))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/collection'))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/learning/leaderboard?seasonId=x'))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/daily-draw', { method: 'POST' }))).status).toBe(200);
    expect((await route(new Request('http://127.0.0.1:8787/v1/pets/duplicate-promotion', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))).status).toBe(200);

    const json = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } as const;
    expect((await route(new Request('http://127.0.0.1:8787/v1/learning/attempts', json))).status).toBe(200);
    expect((await route(new Request(`http://127.0.0.1:8787/v1/learning/attempts/${attemptId}/assets-ready`, json))).status).toBe(200);
    expect((await route(new Request(`http://127.0.0.1:8787/v1/learning/attempts/${attemptId}/complete`, json))).status).toBe(200);
    expect(api.startAttempt).toHaveBeenCalledOnce();
    expect(api.attestAttemptAssets.mock.calls[0]?.[1]).toBe(attemptId);
    expect(api.completeAttempt.mock.calls[0]?.[1]).toBe(attemptId);
    expect((await route(new Request(`http://127.0.0.1:8787/v1/learning/attempts/${attemptId}/tap`, json))).status).toBe(200);
    expect(api.tapAttempt.mock.calls[0]?.[1]).toBe(attemptId);
    expect((await route(new Request(`http://127.0.0.1:8787/v1/learning/attempts/${attemptId}`, json))).status).toBe(404);
    expect((await route(new Request(`http://127.0.0.1:8787/v1/learning/attempts/${attemptId}/abandon`, json))).status).toBe(404);
    expect((await route(new Request('http://127.0.0.1:8787/v1/learning/attempts/short/complete', json))).status).toBe(404);

    const wrongMethod = await route(new Request('http://127.0.0.1:8787/v1/pets/collection', { method: 'POST' }));
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('GET');
    expect(await wrongMethod.json()).toEqual({ code: 'METHOD_NOT_ALLOWED' });

    // Deletion is a real route now, and it carries its receipt secret in a JSON body. The point
    // being pinned is that /v1/me answers both verbs and refuses everything else -- an earlier
    // version of this endpoint returned 200 {"deleted":true} while deleting nothing.
    const deleteMe = await route(new Request('http://127.0.0.1:8787/v1/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(deleteMe.status).toBe(200);
    expect(api.deleteMe).toHaveBeenCalledOnce();

    const putMe = await route(new Request('http://127.0.0.1:8787/v1/me', { method: 'PUT' }));
    expect(putMe.status).toBe(405);
    expect(putMe.headers.get('allow')).toBe('GET, DELETE');
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

  it('keeps healthz alive when readiness reports a safe not-ready code', async () => {
    const probeReadiness = vi.fn(async () => ({ status: 'not_ready' as const, code: 'DATABASE_UNAVAILABLE' as const }));
    const route = createMobileApiRouter({ handlers: handlers(), probeReadiness });
    expect(await (await route(new Request('http://127.0.0.1:8787/healthz'))).json()).toEqual({ status: 'ok' });
    const ready = await route(new Request('http://127.0.0.1:8787/ready'));
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: 'not_ready', code: 'DATABASE_UNAVAILABLE' });
    expect(await (await createMobileApiRouter({
      handlers: handlers(),
      probeReadiness: async () => ({ status: 'ready' }),
    })(new Request('http://127.0.0.1:8787/ready'))).json()).toEqual({ status: 'ready' });
    expect(probeReadiness).toHaveBeenCalledOnce();
  });
});
