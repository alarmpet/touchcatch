import { describe, expect, it } from 'vitest';
import type { MobileRpcName } from '../database/pg-rpc.js';
import { PostgresPetRepository } from './postgres-pet-repository.js';

const art = { thumbnailUrl: 'https://cdn.example.test/pet-thumb.png', fullUrl: 'https://cdn.example.test/pet.png', assetSha256: 'a'.repeat(64) };

describe('PostgresPetRepository', () => {
  it('strictly projects DB inventory with approved art', async () => {
    const calls: unknown[] = [];
    const value = { catalogRevision: 'v1', catalogHash: 'b'.repeat(64), claimedToday: true, ownedCount: 1, totalCount: 1, rarityProgress: { COMMON: { ownedCount: 1, totalCount: 1 }, RARE: { ownedCount: 0, totalCount: 0 }, LEGENDARY: { ownedCount: 0, totalCount: 0 } }, pets: [{ userPetId: '10000000-0000-4000-8000-000000000001', petId: '20000000-0000-4000-8000-000000000001', rarity: 'COMMON', displayKey: 'pet.common', level: 1, xp: 0, copies: 2, selected: true, locked: false, acquiredAt: null, acquisitionDateStatus: 'UNAVAILABLE_LEGACY', acquiredCatalogRevision: 'v1', acquiredCatalogHash: 'b'.repeat(64) }] };
    const repository = new PostgresPetRepository({ call: async () => undefined, callParsed: async <T>(name: MobileRpcName, args: readonly unknown[], parse: (input: unknown) => T) => {
      calls.push([name, args, parse]);
      return parse(value);
    } }, () => art);
    const collection = await repository.readCollection({ subjectKey: '30000000-0000-4000-8000-000000000001', catalogRevision: 'v1', catalogHash: 'b'.repeat(64) });
    expect(collection.pets[0]).toMatchObject({ displayKey: 'pet.common', art });
    expect(collection.claimedToday).toBe(true);
    expect(collection.pets[0]).not.toHaveProperty('acquiredCatalogHash');
    expect((calls[0] as unknown[]).slice(0, 2)).toEqual(['read_pet_inventory_v1', ['30000000-0000-4000-8000-000000000001', 'v1', 'b'.repeat(64)]]);
  });

  it('rejects a pet without approved art', async () => {
    const repository = new PostgresPetRepository({ call: async () => undefined, callParsed: async (_name, _args, parse) => parse({ catalogRevision: 'v1', catalogHash: 'b'.repeat(64), claimedToday: false, ownedCount: 1, totalCount: 1, rarityProgress: { COMMON: { ownedCount: 1, totalCount: 1 }, RARE: { ownedCount: 0, totalCount: 0 }, LEGENDARY: { ownedCount: 0, totalCount: 0 } }, pets: [{ userPetId: '10000000-0000-4000-8000-000000000001', petId: '20000000-0000-4000-8000-000000000001', rarity: 'COMMON', displayKey: 'x', level: 1, xp: 0, copies: 1, selected: false, locked: false, acquiredAt: null, acquisitionDateStatus: 'UNAVAILABLE_LEGACY' }] }) }, () => undefined);
    await expect(repository.readCollection({ subjectKey: 'x', catalogRevision: 'v1', catalogHash: 'b'.repeat(64) })).rejects.toThrow('PET_ART_NOT_APPROVED');
  });
});
