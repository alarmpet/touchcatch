import { describe, expect, it, vi } from 'vitest';
import { MobileApiError } from '../../api/mobile-api-transport.js';
import { createPetsRouteController } from './pets-route-controller.js';

const collection = {
  claimedToday: false,
  ownedCount: 0, totalCount: 0,
  rarityProgress: { COMMON: { ownedCount: 0, totalCount: 0 }, RARE: { ownedCount: 0, totalCount: 0 }, LEGENDARY: { ownedCount: 0, totalCount: 0 } },
  pets: [],
} as const;

describe('pets route controller', () => {
  it('projects signed-out, policy-disabled, empty, and network-error states', async () => {
    expect(createPetsRouteController({ session: () => 'signed-out', api: {} as never, createKey: vi.fn() }).getState()).toEqual({ status: 'SIGNED_OUT' });
    for (const [error, status] of [
      [new MobileApiError('REWARD_POLICY_NOT_APPROVED', 409), 'DISABLED'],
      [new MobileApiError('NETWORK_UNAVAILABLE', null), 'ERROR'],
    ] as const) {
      const controller = createPetsRouteController({ session: () => 'signed-in', api: { getCollection: vi.fn().mockRejectedValue(error) } as never, createKey: vi.fn() });
      await controller.load();
      expect(controller.getState().status).toBe(status);
    }
    const ready = createPetsRouteController({ session: () => 'signed-in', api: { getCollection: vi.fn().mockResolvedValue(collection) } as never, createKey: vi.fn() });
    await ready.load();
    expect(ready.getState().status).toBe('EMPTY');
  });

  it('retains one mutation key through a network retry and refetches after success', async () => {
    const claimDailyDraw = vi.fn()
      .mockRejectedValueOnce(new MobileApiError('NETWORK_TIMEOUT', null))
      .mockResolvedValueOnce({ claimDate: '2026-08-12' });
    const getCollection = vi.fn()
      .mockResolvedValueOnce(collection)
      .mockResolvedValueOnce({ ...collection, claimedToday: true });
    const createKey = vi.fn().mockReturnValue('123e4567-e89b-42d3-a456-426614174000');
    const controller = createPetsRouteController({ session: () => 'signed-in', api: { getCollection, claimDailyDraw, promoteDuplicates: vi.fn() } as never, createKey });
    await controller.load();
    await controller.claimDaily();
    await controller.claimDaily();
    expect(claimDailyDraw).toHaveBeenNthCalledWith(1, '123e4567-e89b-42d3-a456-426614174000');
    expect(claimDailyDraw).toHaveBeenNthCalledWith(2, '123e4567-e89b-42d3-a456-426614174000');
    expect(createKey).toHaveBeenCalledOnce();
    expect(getCollection).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ status: 'EMPTY', claimedToday: true });
  });

  it('restores today claim status from the server after a fresh controller starts', async () => {
    const controller = createPetsRouteController({
      session: () => 'signed-in',
      api: { getCollection: vi.fn().mockResolvedValue({ ...collection, claimedToday: true }) } as never,
      createKey: vi.fn(),
    });
    await controller.load();
    expect(controller.getState()).toMatchObject({ status: 'EMPTY', claimedToday: true });
  });

  it('retains the mutation key across a retryable 503 response', async () => {
    const claimDailyDraw = vi.fn().mockRejectedValueOnce(new MobileApiError('DATABASE_UNAVAILABLE', 503)).mockResolvedValueOnce({});
    const createKey = vi.fn().mockReturnValue('123e4567-e89b-42d3-a456-426614174000');
    const controller = createPetsRouteController({ session: () => 'signed-in', api: { getCollection: vi.fn().mockResolvedValue(collection), claimDailyDraw, promoteDuplicates: vi.fn() } as never, createKey });
    await controller.claimDaily();
    await controller.claimDaily();
    expect(claimDailyDraw.mock.calls.map((call) => call[0])).toEqual(Array(2).fill('123e4567-e89b-42d3-a456-426614174000'));
    expect(createKey).toHaveBeenCalledOnce();
  });

  it('retains the mutation key when a successful mutation response cannot be validated', async () => {
    const claimDailyDraw = vi.fn().mockRejectedValueOnce(new Error('PET_DAILY_DRAW_RESPONSE_INVALID')).mockResolvedValueOnce({});
    const createKey = vi.fn().mockReturnValue('123e4567-e89b-42d3-a456-426614174000');
    const controller = createPetsRouteController({ session: () => 'signed-in', api: { getCollection: vi.fn().mockResolvedValue(collection), claimDailyDraw, promoteDuplicates: vi.fn() } as never, createKey });
    await controller.claimDaily();
    await controller.claimDaily();
    expect(claimDailyDraw.mock.calls.map((call) => call[0])).toEqual(Array(2).fill('123e4567-e89b-42d3-a456-426614174000'));
    expect(createKey).toHaveBeenCalledOnce();
  });
});
