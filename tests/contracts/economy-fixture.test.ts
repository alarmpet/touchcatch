import { describe, expect, it } from 'vitest';
import { loadTestEconomyFixture } from '../helpers/load-test-economy-fixture.js';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';

describe('approved economy transaction fixture', () => {
  it('returns the exact nested shape published to SQL with opaque UUID pet IDs and canonical hashes', async () => {
    const loaded = await loadTestEconomyFixture();
    expect(Object.keys(loaded.publishInput).sort()).toEqual(['catalog', 'economy']);
    expect(loaded.publishInput).toEqual({ economy: loaded.config, catalog: loaded.catalog });
    expect(loaded.catalog.entries.every(({ petId }) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(petId))).toBe(true);
    expect(loaded.economyHash).toBe(canonicalJsonSha256(loaded.publishInput.economy));
    expect(loaded.catalogArtifactHash).toBe(canonicalJsonSha256(loaded.publishInput.catalog));
    expect(loaded.config.catalogHash).toBe(loaded.catalog.catalogHash);
  });
});
