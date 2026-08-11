import { describe, expect, it, vi } from 'vitest';
import { MobileApiError } from '../../api/mobile-api-transport.js';
import { createRankingRouteController } from './ranking-route-controller.js';

describe('ranking route controller', () => {
  it('loads only server rows and maps signed-out, disabled, empty, stale and error states', async () => {
    expect(createRankingRouteController({ session: () => 'signed-out', seasonId: crypto.randomUUID(), client: {} as never }).getState().model.state).toBe('DISABLED');
    const cases = [
      [new MobileApiError('RANKING_POLICY_NOT_APPROVED', 409), 'DISABLED'],
      [new MobileApiError('NETWORK_UNAVAILABLE', null), 'ERROR'],
    ] as const;
    for (const [error, expected] of cases) {
      const controller = createRankingRouteController({ session: () => 'signed-in', seasonId: crypto.randomUUID(), client: { getWeeklyBoard: vi.fn().mockRejectedValue(error) } as never });
      await controller.load('ENGLISH');
      expect(controller.getState().model.state).toBe(expected);
    }
    const getWeeklyBoard = vi.fn().mockResolvedValue({ rows: [], snapshotRevision: 'db:1', myRank: null });
    const empty = createRankingRouteController({ session: () => 'signed-in', seasonId: crypto.randomUUID(), client: { getWeeklyBoard } as never });
    await empty.load('PROVERB');
    expect(getWeeklyBoard).toHaveBeenCalledWith(expect.objectContaining({ category: 'PROVERB' }));
    expect(empty.getState().model.state).toBe('EMPTY');
  });

  it('ignores an older category response and clears rows after sign-out', async () => {
    let session: 'signed-in' | 'signed-out' = 'signed-in';
    let finishEnglish!: (value: unknown) => void;
    const getWeeklyBoard = vi.fn(({ category }: { category: string }) => category === 'ENGLISH'
      ? new Promise((resolve) => { finishEnglish = resolve; })
      : Promise.resolve({ rows: [{ rank: 1, nickname: 'Proverb', score: 5, verified: true }], snapshotRevision: 'p', myRank: null }));
    const controller = createRankingRouteController({ session: () => session, seasonId: crypto.randomUUID(), client: { getWeeklyBoard } as never });
    const english = controller.load('ENGLISH');
    await controller.load('PROVERB');
    finishEnglish({ rows: [{ rank: 1, nickname: 'English', score: 9, verified: true }], snapshotRevision: 'e', myRank: null });
    await english;
    expect(controller.getState().category).toBe('PROVERB');
    session = 'signed-out';
    await controller.load('PROVERB');
    expect(controller.getState()).toMatchObject({ board: null, reason: 'SIGNED_OUT' });
  });

  it('never projects one category cache as another category stale board', async () => {
    const getWeeklyBoard = vi.fn()
      .mockResolvedValueOnce({ rows: [{ rank: 1, nickname: 'English', score: 9, verified: true }], snapshotRevision: 'e', myRank: null })
      .mockRejectedValueOnce(new MobileApiError('NETWORK_UNAVAILABLE', null));
    const controller = createRankingRouteController({ session: () => 'signed-in', seasonId: crypto.randomUUID(), client: { getWeeklyBoard } as never });
    await controller.load('ENGLISH');
    await controller.load('PROVERB');
    expect(controller.getState()).toMatchObject({ category: 'PROVERB', board: null, model: { state: 'ERROR' } });
  });
});
