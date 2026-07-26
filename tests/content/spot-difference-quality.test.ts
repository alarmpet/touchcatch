import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSpotDifferenceQuality } from '../../tools/content/check-spot-difference-quality.js';

const root = resolve(import.meta.dirname, '../..');

async function readJson(path: string) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<string, unknown>;
}

describe('spot-difference quality contract', () => {
  it('has one structurally valid, draft-pending quality row for every catalog pack', async () => {
    const [catalog, quality] = await Promise.all([
      readJson('content/learning/catalog.v1.json'),
      readJson('content/learning/spot-difference-quality.v1.json'),
    ]);
    const catalogKeys = (catalog.entries as Array<{ key: string }>).map(({ key }) => key);
    const packs = quality.entries as Array<{ contentKey: string; objectives: Array<{ tier: string; salience: string }>; releaseReadiness: { status: string } }>;

    expect(packs.map(({ contentKey }) => contentKey)).toEqual(catalogKeys);
    for (const pack of packs) {
      expect(pack.objectives).toHaveLength(10);
      expect(pack.objectives.filter((objective) => objective.tier === 'NORMAL')).toHaveLength(7);
      expect(pack.objectives.filter((objective) => objective.tier === 'HARD')).toHaveLength(3);
      expect(pack.objectives.filter((objective) => objective.salience === 'CLEAR')).toHaveLength(4);
      expect(pack.objectives.filter((objective) => objective.salience === 'MODERATE')).toHaveLength(3);
      expect(pack.objectives.filter((objective) => objective.salience === 'FOCUSED')).toHaveLength(3);
      expect(pack.releaseReadiness.status).toBe('PENDING');
    }
    expect(await checkSpotDifferenceQuality({ root })).toEqual([]);
  });

  it.each([
    ['wrong-tier-count', (quality: any) => { quality.entries[0].objectives[0].tier = 'HARD'; }],
    ['generic-prompt', (quality: any) => { quality.entries[0].objectives[0].target = 'change color'; }],
    ['duplicate-objective', (quality: any) => { quality.entries[0].objectives[1].objectiveId = quality.entries[0].objectives[0].objectiveId; }],
    ['six-zones-only', (quality: any) => { quality.entries[0].releaseReadiness.status = 'PASS'; quality.entries[0].releaseReadiness.diagnostics.zones = ['A', 'B', 'C', 'D', 'E', 'F']; }],
    ['three-in-one-zone', (quality: any) => { quality.entries[0].releaseReadiness.status = 'PASS'; quality.entries[0].releaseReadiness.diagnostics.zoneCounts = { A: 3 }; }],
    ['single-change-type', (quality: any) => { quality.entries[0].releaseReadiness.status = 'PASS'; quality.entries[0].objectives.forEach((objective: any) => { objective.changeType = 'COLOR'; }); }],
    ['mobile-review-fail', (quality: any) => { quality.entries[0].releaseReadiness.status = 'PASS'; quality.entries[0].objectives[0].mobileReview.status = 'FAIL'; }],
    ['unintended-change-fail', (quality: any) => { quality.entries[0].releaseReadiness.status = 'PASS'; quality.entries[0].imagePairReview.unintendedChangeStatus = 'FAIL'; }],
    ['stale-quality-hash', (_quality: any, manifest: any) => { manifest.entries[0].qualitySha256 = '0'.repeat(64); }],
  ])('rejects %s when release enforcement applies', async (_name, mutate) => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    mutate(quality, manifest);
    expect(await checkSpotDifferenceQuality({ root, quality, manifest, enforceRelease: true })).not.toEqual([]);
  });
});
