import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTestEconomyFixture } from '../helpers/load-test-economy-fixture.js';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';

describe('approved economy transaction fixture', () => {
  it('aligns derived economy cross-references when source config revisions differ', async () => {
    const [economySource, catalogSource] = await Promise.all([
      readFile(resolve('config/economy.v1.json'), 'utf8').then(
        (value) => JSON.parse(value) as { catalogRevision: string },
      ),
      readFile(resolve('config/pet-catalog.v1.json'), 'utf8').then(
        (value) => JSON.parse(value) as { catalogRevision: string },
      ),
    ]);

    expect(economySource.catalogRevision).not.toBe(catalogSource.catalogRevision);

    const loaded = await loadTestEconomyFixture();

    expect(loaded.config.catalogRevision).toBe(catalogSource.catalogRevision);
    expect(loaded.config.catalogRevision).toBe(loaded.catalog.catalogRevision);
    expect(loaded.config.catalogHash).toBe(loaded.catalog.catalogHash);
    expect(loaded.publishInput.economy.catalogRevision).toBe(loaded.publishInput.catalog.catalogRevision);
    expect(loaded.publishInput.economy.catalogHash).toBe(loaded.publishInput.catalog.catalogHash);
  });

  it('returns the exact nested shape published to SQL with opaque UUID pet IDs and canonical hashes', async () => {
    const loaded = await loadTestEconomyFixture();
    expect(Object.keys(loaded.publishInput).sort()).toEqual(['catalog', 'economy']);
    expect(loaded.publishInput.economy).toEqual({ ...loaded.config, economyHash: loaded.economyHash });
    expect(loaded.publishInput.catalog).toEqual({ ...loaded.catalog, catalogArtifactHash: loaded.catalogArtifactHash });
    expect(loaded.catalog.entries.every(({ petId }) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(petId))).toBe(true);
    const { economyHash, ...economyArtifact } = loaded.publishInput.economy;
    const { catalogArtifactHash, ...catalogArtifact } = loaded.publishInput.catalog;
    expect(economyHash).toBe(canonicalJsonSha256(economyArtifact));
    expect(catalogArtifactHash).toBe(canonicalJsonSha256(catalogArtifact));
    expect(loaded.config.catalogHash).toBe(loaded.catalog.catalogHash);
  });
});
