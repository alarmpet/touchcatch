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

  it('binds salience to the canonical NORMAL and HARD tiers', async () => {
    const quality = await readJson('content/learning/spot-difference-quality.v1.json');
    const pack = (quality.entries as any[])[0];
    [pack.objectives[0].salience, pack.objectives[7].salience] = [pack.objectives[7].salience, pack.objectives[0].salience];

    expect(await checkSpotDifferenceQuality({ root, quality })).toContain(`${pack.contentKey}:tier-salience-correlation`);
  });

  it.each([
    ['actual-zone-mutation', (quality: any, manifest: any) => { quality.entries[0].objectives[0].zone = 'A'; }, undefined],
    ['filler-specificity', (quality: any, manifest: any) => { Object.assign(quality.entries[0].objectives[0], { target: 'object', location: 'scene', before: 'before', after: 'after' }); }, 'en-resilience:prompt-specificity:difference_1'],
    ['utf8-korean-generic', (quality: any, manifest: any) => { quality.entries[0].objectives[0].target = '색상 변경'; }, 'en-resilience:prompt-specificity:difference_1'],
    ['missing-manifest-row', (_quality: any, manifest: any) => { manifest.entries = manifest.entries.slice(1); }, undefined],
    ['prompt-evidence-drift', (_quality: any, manifest: any) => { manifest.entries[0].promptEvidence[0].sha256 = '0'.repeat(64); }, undefined],
  ])('rejects structural %s', async (_name, mutate, expectedFailure) => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    mutate(quality, manifest);
    const failures = await checkSpotDifferenceQuality({ root, quality, manifest });
    expect(failures).not.toEqual([]);
    if (expectedFailure) expect(failures).toContain(expectedFailure);
  });

  it('requires recorded people and timestamps before a PASS can release', async () => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    const pack = (quality.entries as any[])[0];
    pack.releaseReadiness.status = 'PASS';
    for (const objective of pack.objectives) objective.mobileReview.status = 'PASS';
    Object.assign(pack.imagePairReview, { status: 'PASS', sameComposition: true, sameCamera: true, sameLightingDirection: true, sameArtStyle: true, unintendedChangeStatus: 'PASS' });

    const failures = await checkSpotDifferenceQuality({ root, quality, manifest, enforceRelease: true });
    expect(failures).toContain(`${pack.contentKey}:mobile-reviewer`);
    expect(failures).toContain(`${pack.contentKey}:image-pair-reviewer`);
  });

  it('blocks release while the catalog, bundle, or generated manifest remains draft', async () => {
    const failures = await checkSpotDifferenceQuality({ root, enforceRelease: true });
    expect(failures).toEqual(expect.arrayContaining([
      'en-resilience:catalog-draft',
      'en-resilience:bundle-draft',
      'en-resilience:manifest-draft',
      'en-resilience:manifest-publish-blocked',
    ]));
  });

  it('classifies shape and quantity edits without collapsing them into color', async () => {
    const quality = await readJson('content/learning/spot-difference-quality.v1.json');
    const packs = quality.entries as any[];
    expect(packs.find(({ contentKey }) => contentKey === 'en-resilience').objectives[8].changeType).toBe('SHAPE');
    expect(packs.find(({ contentKey }) => contentKey === 'en-dilemma').objectives[4].changeType).toBe('COUNT');
    expect(packs.find(({ contentKey }) => contentKey === 'en-sustainability').objectives[4].changeType).toBe('COUNT');
  });

  it('keeps color operations as COLOR when their targets are shape nouns', async () => {
    const quality = await readJson('content/learning/spot-difference-quality.v1.json');
    const packs = quality.entries as any[];
    expect(packs.find(({ contentKey }) => contentKey === 'en-dilemma').objectives[5].changeType).toBe('COLOR'); // blue shape → green
    expect(packs.find(({ contentKey }) => contentKey === 'en-dilemma').objectives[9].changeType).toBe('COLOR'); // purple star decoration → yellow
    expect(packs.find(({ contentKey }) => contentKey === 'ko-proverb-kind-words-return').objectives[7].changeType).toBe('COLOR'); // blue star cushion → pink
    expect(packs.find(({ contentKey }) => contentKey === 'ko-proverb-kind-words-return').objectives[8].changeType).toBe('COLOR'); // yellow square button → blue
  });

  it('classifies no-from quantity and form transitions from the full raw instruction', async () => {
    const quality = await readJson('content/learning/spot-difference-quality.v1.json');
    const packs = quality.entries as any[];
    expect(packs.find(({ contentKey }) => contentKey === 'ko-proverb-seeing-is-believing').objectives[9].changeType).toBe('COUNT'); // two eyepieces → one
    expect(packs.find(({ contentKey }) => contentKey === 'ko-proverb-dark-under-lamp').objectives[5].changeType).toBe('SHAPE'); // oval cutout → star-shaped
  });

  it('rejects meaningless structured fields even when authoring evidence is marked PASS', async () => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    const objective = (quality.entries as any[])[0].objectives[0];
    Object.assign(objective, {
      target: 'x', location: 'y', before: 'old', after: 'new',
      authoringEvidence: {
        status: 'PASS',
        rawInstruction: objective.authoringEvidence.rawInstruction,
        roleRecord: { target: 'x', location: 'y', before: 'old', after: 'new' },
        blocker: null,
      },
    });

    expect(await checkSpotDifferenceQuality({ root, quality, manifest })).toContain('en-resilience:release-specificity:difference_1');
  });

  it('rejects PASS evidence made only of action boilerplate and stopwords', async () => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    const objective = (quality.entries as any[])[0].objectives[0];
    Object.assign(objective, {
      target: 'the', location: 'only', before: 'change', after: 'bright',
      authoringEvidence: {
        status: 'PASS',
        rawInstruction: objective.authoringEvidence.rawInstruction,
        roleRecord: { target: 'the', location: 'only', before: 'change', after: 'bright' },
        blocker: null,
      },
    });

    expect(await checkSpotDifferenceQuality({ root, quality, manifest })).toContain('en-resilience:release-specificity:difference_1');
  });

  it('rejects PASS evidence when source tokens are assigned to the wrong structured roles', async () => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    const objective = (quality.entries as any[])[0].objectives[0];
    Object.assign(objective, {
      target: 'flower',
      location: 'purple',
      before: 'lower',
      after: 'yellow',
      authoringEvidence: {
        status: 'PASS',
        rawInstruction: 'Target: flower\nLocation: lower\nBefore: purple\nAfter: yellow',
        roleRecord: { target: ' Flower ', location: 'LOWER', before: 'Purple', after: ' yellow ' },
        blocker: null,
      },
    });

    expect(await checkSpotDifferenceQuality({ root, quality, manifest })).toContain('en-resilience:release-specificity:difference_1');
  });

  it('accepts a PASS with an exact structured role record', async () => {
    const [quality, manifest] = await Promise.all([
      readJson('content/learning/spot-difference-quality.v1.json'),
      readJson('content/learning/manifest.v1.json'),
    ]);
    const objective = (quality.entries as any[])[0].objectives[0];
    Object.assign(objective, {
      target: 'flower',
      location: 'lower',
      before: 'purple',
      after: 'yellow',
      authoringEvidence: {
        status: 'PASS',
        rawInstruction: 'Target: flower\nLocation: lower\nBefore: purple\nAfter: yellow',
        roleRecord: { target: ' Flower ', location: 'LOWER', before: 'Purple', after: ' yellow ' },
        blocker: null,
      },
    });

    const failures = await checkSpotDifferenceQuality({ root, quality, manifest });
    expect(failures.some((failure) => failure.startsWith('schema:'))).toBe(false);
    expect(failures).not.toContain('en-resilience:release-specificity:difference_1');
  });
});
