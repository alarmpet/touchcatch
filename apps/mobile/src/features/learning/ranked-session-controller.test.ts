import { describe, expect, it, vi } from 'vitest';
import { createRankedSessionController } from './ranked-session-controller';
import { MobileApiError } from '../../api/mobile-api-transport';

const seasonId = '30000000-0000-4000-8000-000000000001';
const attemptId = '50000000-0000-4000-8000-000000000001';
const contentRevisionId = '40000000-0000-4000-8000-000000000001';
const image = { url: 'https://cdn.test/a.png', sha256: '1'.repeat(64), encodedBytes: 10, width: 8, height: 8, mimeType: 'image/png' as const };
const challenge = {
  category: 'ENGLISH' as const, ordinal: 1, contentRevisionId, contentHash: 'a'.repeat(64),
  imageA: image, imageB: { ...image, sha256: '2'.repeat(64) },
  differenceCount: 2, assistPattern: 'SPELLING' as const, answerUnitCount: 3, spaceIndexes: [],
};

function fixture(overrides: Partial<Record<'start' | 'markAssetsReady' | 'complete' | 'getChallenges' | 'tap', unknown>> = {}) {
  const client = {
    getChallenges: vi.fn().mockResolvedValue({ seasonId, startsAt: '2026-08-10T15:00:00.000+00:00', endsAt: '2026-08-17T15:00:00.000+00:00', attemptTtlSeconds: 900, challenges: [challenge] }),
    start: vi.fn().mockResolvedValue({ attemptId, status: 'OPEN', startedAt: '2026-08-14T00:00:00.000+00:00', expiresAt: '2026-08-14T00:15:00.000+00:00', contentRevisionId }),
    markAssetsReady: vi.fn().mockResolvedValue({ attemptId, status: 'OPEN', assetsReadyAt: '2026-08-14T00:00:02.000+00:00' }),
    complete: vi.fn().mockResolvedValue({ attemptId, status: 'COMPLETED_VERIFIED', completionMs: 30_000, acceptedAt: '2026-08-14T00:00:32.000+00:00', bestChanged: true }),
    tap: vi.fn().mockResolvedValue({ attemptId, status: 'OPEN', outcome: 'HIT', objectiveId: 'difference_1', displayCircles: { imageA: { cx: 0.2, cy: 0.2, r: 0.05 }, imageB: { cx: 0.2, cy: 0.2, r: 0.05 } }, openedUnit: { index: 0, text: 'c' }, foundCount: 1, differenceCount: 2, wrongTaps: 0 }),
    ...overrides,
  } as never as Parameters<typeof createRankedSessionController>[0]['client'];
  let keys = 0;
  const controller = createRankedSessionController({
    session: () => 'signed-in',
    seasonId,
    client,
    createMutationKey: () => `7000000${keys++}-0000-4000-8000-000000000001`,
  });
  return { client: client as never as Record<string, ReturnType<typeof vi.fn>>, controller };
}

const run = { events: [{ type: 'TAP', timestampMs: 10 }], hintsUsed: 0, wrongTaps: 1, wrongAnswers: 0 };

describe('ranked session controller', () => {
  it('walks open → assets-ready → submit and never leaves the clock to the client', async () => {
    const { controller, client } = fixture();
    await controller.open(challenge);
    expect(controller.getState().phase).toBe('LOADING_ASSETS');
    expect(controller.getState().expiresAt).toBe('2026-08-14T00:15:00.000+00:00');

    await controller.markAssetsReady();
    expect(controller.getState().phase).toBe('PLAYING');

    const result = await controller.submit(run);
    expect(result).toMatchObject({ status: 'COMPLETED_VERIFIED', bestChanged: true });
    expect(controller.getState().phase).toBe('SETTLED');
    expect(Object.keys(client['complete']!.mock.calls[0]![0] as object).sort())
      .toEqual(['attemptId', 'contentHash', 'events', 'hintsUsed', 'idempotencyKey', 'wrongAnswers', 'wrongTaps']);
  });

  it('does not start the clock until the pictures are decoded', async () => {
    const { controller, client } = fixture();
    await controller.open(challenge);
    expect(client['markAssetsReady']).not.toHaveBeenCalled();
    expect(await controller.submit(run)).toBeNull();
    expect(client['complete']).not.toHaveBeenCalled();
  });

  it('reuses one idempotency key so a retried submit replays instead of double-committing', async () => {
    const { controller, client } = fixture();
    await controller.open(challenge);
    await controller.markAssetsReady();
    client['complete']!.mockRejectedValueOnce(new MobileApiError('NETWORK_TIMEOUT', null));
    expect(await controller.submit(run)).toBeNull();
    expect(controller.getState().phase).toBe('PLAYING');
    await controller.submit(run);
    expect(client['complete']!.mock.calls[0]![0].idempotencyKey).toBe(client['complete']!.mock.calls[1]![0].idempotencyKey);
  });

  it('closes the session when the policy or season says ranked is not open', async () => {
    const { controller, client } = fixture();
    client['start']!.mockRejectedValueOnce(new MobileApiError('SEASON_NOT_OPEN', 409));
    await controller.open(challenge);
    expect(controller.getState()).toMatchObject({ phase: 'UNAVAILABLE', reason: 'SEASON_NOT_OPEN' });
  });

  it('surfaces an expired attestation instead of pretending play started', async () => {
    const { controller, client } = fixture();
    await controller.open(challenge);
    client['markAssetsReady']!.mockResolvedValueOnce({ attemptId, status: 'EXPIRED' });
    await controller.markAssetsReady();
    expect(controller.getState()).toMatchObject({ phase: 'UNAVAILABLE', reason: 'EXPIRED' });
  });

  it('refuses to open a ranked session for a signed-out player', async () => {
    const client = { getChallenges: vi.fn(), start: vi.fn(), markAssetsReady: vi.fn(), complete: vi.fn() };
    const controller = createRankedSessionController({
      session: () => 'signed-out',
      seasonId,
      client: client as never as Parameters<typeof createRankedSessionController>[0]['client'],
      createMutationKey: () => '70000000-0000-4000-8000-000000000001',
    });
    await controller.open(challenge);
    expect(controller.getState()).toMatchObject({ phase: 'UNAVAILABLE', reason: 'SIGNED_OUT' });
    expect(await controller.listChallenges()).toEqual([]);
    expect(client.start).not.toHaveBeenCalled();
    expect(client.getChallenges).not.toHaveBeenCalled();
  });
});
