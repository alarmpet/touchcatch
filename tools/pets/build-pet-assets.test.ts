import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildPetAssets } from './build-pet-assets.js';

const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
const hash = createHash('sha256').update(png).digest('hex');

describe('pet asset build', () => {
  it('imports only fully approved art and emits deterministic no-upscale derivatives', async () => {
    const root = await mkdtemp(join(tmpdir(), 'touchcatch-pets-'));
    const input = join(root, 'input');
    const sourceDirectory = join(root, 'source');
    const mobileDirectory = join(root, 'mobile');
    await (await import('node:fs/promises')).mkdir(input);
    await writeFile(join(input, 'approved.png'), png);
    await writeFile(join(input, 'pending.png'), png);
    const admissions = [
      { sourceSha256: hash, normalizedSlug: 'approved', candidateRarity: 'COMMON' as const, familySlug: 'approved', rightsStatus: 'APPROVED' as const, provenanceNote: 'approved', visualReview: 'APPROVED' as const, backgroundReview: 'APPROVED' as const, cropReview: 'APPROVED' as const, coachArchetype: 'CHEER' as const, fileName: 'approved.png', width: 1, height: 1, pixelFormat: 'RGBA' },
      { sourceSha256: hash, normalizedSlug: 'pending', candidateRarity: 'RARE' as const, familySlug: 'pending', rightsStatus: 'PENDING' as const, provenanceNote: 'pending', visualReview: 'PENDING' as const, backgroundReview: 'PENDING' as const, cropReview: 'PENDING' as const, coachArchetype: 'SCOUT' as const, fileName: 'pending.png', width: 1, height: 1, pixelFormat: 'RGBA' },
    ];

    const result = await buildPetAssets({ admissions, sourceRoots: [input], sourceDirectory, mobileDirectory });

    expect(await readFile(join(sourceDirectory, `${hash}.png`))).toEqual(png);
    expect(result.derivatives).toHaveLength(2);
    expect(result.derivatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceSha256: hash, safeCrop: { x: 0, y: 0, width: 1, height: 1 } }),
    ]));
    expect(result.derivatives.every((asset) => asset.width <= 1 && asset.height <= 1 && asset.sha256.length === 64)).toBe(true);
  });

  it('removes only stale managed outputs after an admission is revoked', async () => {
    const root = await mkdtemp(join(tmpdir(), 'touchcatch-pets-revoke-'));
    const input = join(root, 'input'); const sourceDirectory = join(root, 'source'); const mobileDirectory = join(root, 'mobile');
    await (await import('node:fs/promises')).mkdir(input);
    await writeFile(join(input, 'approved.png'), png);
    const approved = { sourceSha256: hash, normalizedSlug: 'approved', candidateRarity: 'COMMON' as const, familySlug: 'approved', rightsStatus: 'APPROVED' as const, provenanceNote: 'approved', visualReview: 'APPROVED' as const, backgroundReview: 'APPROVED' as const, cropReview: 'APPROVED' as const, coachArchetype: 'CHEER' as const, fileName: 'approved.png', width: 1, height: 1, pixelFormat: 'RGBA' };
    await buildPetAssets({ admissions: [approved], sourceRoots: [input], sourceDirectory, mobileDirectory });
    await writeFile(join(sourceDirectory, 'unrelated.txt'), 'keep');
    await buildPetAssets({ admissions: [{ ...approved, rightsStatus: 'REJECTED' }], sourceRoots: [input], sourceDirectory, mobileDirectory });
    await expect(access(join(sourceDirectory, `${hash}.png`))).rejects.toThrow();
    await expect(access(join(mobileDirectory, `${hash}.card.png`))).rejects.toThrow();
    await expect(access(join(mobileDirectory, `${hash}.portrait.png`))).rejects.toThrow();
    await expect(readFile(join(sourceDirectory, 'unrelated.txt'), 'utf8')).resolves.toBe('keep');
  });
});
