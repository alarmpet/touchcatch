import { describe, expect, it, vi } from 'vitest';
import { createPetApi } from './pet-api.js';

describe('pet API boundary', () => {
  it('restores the authenticated collection without sending a subject id', async () => {
    const request = vi.fn().mockResolvedValue({
      claimedToday: true,
      ownedCount: 0, totalCount: 0,
      rarityProgress: { COMMON: { ownedCount: 0, totalCount: 0 }, UNCOMMON: { ownedCount: 0, totalCount: 0 }, RARE: { ownedCount: 0, totalCount: 0 }, EPIC: { ownedCount: 0, totalCount: 0 }, LEGENDARY: { ownedCount: 0, totalCount: 0 } },
      pets: [],
    });
    await createPetApi({ request }).getCollection();
    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/v1/pets/collection' });
  });

  it('requires and forwards an idempotency key for the daily effect-once claim', async () => {
    const request = vi.fn().mockResolvedValue({
      claimDate: '2026-08-11', seriesId: 'DAILY_FREE_DRAW_V1',
      pet: { userPetId: '30000000-0000-4000-8000-000000000001', petId: '40000000-0000-4000-8000-000000000001', rarity: 'COMMON', copies: 1 },
      economyVersion: 'e1', economyHash: 'a'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64),
    });
    const api = createPetApi({ request });
    await expect(api.claimDailyDraw('   ')).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED');
    await expect(api.claimDailyDraw('daily-2026-08-11')).rejects.toThrow('IDEMPOTENCY_KEY_INVALID');
    await api.claimDailyDraw('123E4567-E89B-42D3-A456-426614174000');
    expect(request).toHaveBeenLastCalledWith({
      method: 'POST',
      path: '/v1/pets/daily-draw',
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
    });
  });

  it('sends exactly ten same-pet copies for duplicate promotion', async () => {
    const request = vi.fn().mockResolvedValue({
      economyVersion: 'e1', economyHash: 'a'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64),
      consumed: { petId: '40000000-0000-4000-8000-000000000001', copies: 10, rows: [{ userPetId: '30000000-0000-4000-8000-000000000001', copies: 10 }] },
      remainingCopies: 1,
      output: { userPetId: '50000000-0000-4000-8000-000000000001', petId: '60000000-0000-4000-8000-000000000001', rarity: 'RARE', copies: 1 },
    });
    await createPetApi({ request }).promoteDuplicates('pet-a', '223e4567-e89b-42d3-a456-426614174000');
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/pets/duplicate-promotion',
      idempotencyKey: '223e4567-e89b-42d3-a456-426614174000',
      body: { materials: [{ petId: 'pet-a', count: 10 }] },
    });
  });

  it('rejects malformed, private, or incomplete server projections', async () => {
    for (const payload of [
      { claimedToday: false, ownedCount: 0, totalCount: 0, rarityProgress: { COMMON: { ownedCount: 0, totalCount: 0 }, UNCOMMON: { ownedCount: 0, totalCount: 0 }, RARE: { ownedCount: 0, totalCount: 0 }, EPIC: { ownedCount: 0, totalCount: 0 }, LEGENDARY: { ownedCount: 0, totalCount: 0 } }, pets: [], subjectKey: 'private' },
      { ownedCount: 1, totalCount: 1, pets: [] },
    ]) {
      const api = createPetApi({ request: vi.fn().mockResolvedValue(payload) });
      await expect(api.getCollection()).rejects.toThrow('PET_COLLECTION_RESPONSE_INVALID');
    }
  });
});
