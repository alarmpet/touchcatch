import { describe, expect, it, vi } from 'vitest';
import { createAttemptClient, type AttemptClientRequest } from './attempt-client';

const attemptId = '50000000-0000-4000-8000-000000000001';
const seasonId = '30000000-0000-4000-8000-000000000001';
const contentRevisionId = '40000000-0000-4000-8000-000000000001';
const idempotencyKey = '70000000-0000-4000-8000-000000000001';
const contentHash = 'a'.repeat(64);

function transportReturning(response: unknown) {
  const requests: AttemptClientRequest[] = [];
  return {
    requests,
    transport: {
      request: vi.fn(async (request: AttemptClientRequest) => {
        requests.push(request);
        return response as never;
      }),
    },
  };
}

const startResponse = {
  attemptId, status: 'OPEN',
  startedAt: '2026-08-14T00:00:00.000+00:00',
  expiresAt: '2026-08-14T00:15:00.000+00:00',
  contentRevisionId,
};
const completeResponse = {
  attemptId, status: 'COMPLETED_VERIFIED', completionMs: 30_000,
  acceptedAt: '2026-08-14T00:00:32.000+00:00', bestChanged: true,
};

describe('learning attempt client', () => {
  it('opens a session against the exact route with an idempotency key', async () => {
    const { transport, requests } = transportReturning(startResponse);
    const result = await createAttemptClient(transport).start({ seasonId, contentRevisionId, contentHash, idempotencyKey });

    expect(result).toEqual(startResponse);
    expect(requests[0]).toEqual({
      method: 'POST',
      path: '/v1/learning/attempts',
      idempotencyKey,
      body: { seasonId, contentRevisionId, contentHash },
    });
  });

  it('puts the attempt id in the path for the assets-ready and complete routes', async () => {
    const ready = transportReturning({ attemptId, status: 'OPEN', assetsReadyAt: '2026-08-14T00:00:02.000+00:00' });
    await createAttemptClient(ready.transport).markAssetsReady({ attemptId, contentHash, idempotencyKey });
    expect(ready.requests[0]?.path).toBe(`/v1/learning/attempts/${attemptId}/assets-ready`);

    const done = transportReturning(completeResponse);
    await createAttemptClient(done.transport).complete({
      attemptId, contentHash, events: [{ type: 'TAP', timestampMs: 10 }],
      hintsUsed: 0, wrongTaps: 1, wrongAnswers: 0, idempotencyKey,
    });
    expect(done.requests[0]?.path).toBe(`/v1/learning/attempts/${attemptId}/complete`);
    expect(done.requests[0]?.idempotencyKey).toBe(idempotencyKey);
  });

  it('never sends a client clock in any attempt request', async () => {
    const { transport, requests } = transportReturning(completeResponse);
    await createAttemptClient(transport).complete({
      attemptId, contentHash,
      events: [{ type: 'TAP', timestampMs: 10 }, { type: 'HINT', timestampMs: 20 }],
      hintsUsed: 1, wrongTaps: 0, wrongAnswers: 0, idempotencyKey,
    });
    expect(Object.keys(requests[0]?.body as object).sort()).toEqual(['contentHash', 'events', 'hintsUsed', 'wrongAnswers', 'wrongTaps']);
  });

  it('refuses malformed identifiers and an unsubmittable event log before any network call', async () => {
    const { transport } = transportReturning(completeResponse);
    const client = createAttemptClient(transport);

    await expect(client.start({ seasonId: 'nope', contentRevisionId, contentHash, idempotencyKey })).rejects.toThrow('ATTEMPT_SEASON_INVALID');
    await expect(client.start({ seasonId, contentRevisionId, contentHash: 'nope', idempotencyKey })).rejects.toThrow('CONTENT_HASH_INVALID');
    await expect(client.start({ seasonId, contentRevisionId, contentHash, idempotencyKey: 'nope' })).rejects.toThrow('IDEMPOTENCY_KEY_INVALID');
    await expect(client.markAssetsReady({ attemptId: 'nope', contentHash, idempotencyKey })).rejects.toThrow('ATTEMPT_ID_INVALID');
    await expect(client.complete({
      attemptId, contentHash,
      events: [{ type: 'TAP', timestampMs: 900 }, { type: 'TAP', timestampMs: 10 }],
      hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0, idempotencyKey,
    })).rejects.toThrow('ATTEMPT_COMPLETE_REQUEST_INVALID');
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('rejects a response that does not match the pinned contract', async () => {
    const { transport } = transportReturning({ attemptId, status: 'COMPLETED_VERIFIED', completionMs: 1 });
    await expect(createAttemptClient(transport).complete({
      attemptId, contentHash, events: [], hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0, idempotencyKey,
    })).rejects.toThrow('ATTEMPT_COMPLETE_RESPONSE_INVALID');
  });
});
