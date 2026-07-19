import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const expected = [
  ['HOME_DEFAULT', 'raw/home-default.png', '80141f74c0f7353bba31d9952bdbeb4d715716065b6cff2e591f94fa3763129e'],
  ['MATCH_WORD_HUNT', 'raw/match-word-hunt.png', '59ab13e90d337af02e94c8c9dbfd8aff8dbd54b203acfe768a3641e0b70ab189'],
  ['MATCH_MEANING_SUCCESS', 'raw/match-meaning-success.png', '90fce90a3fd50fb9ea665634fc3d5651452ec44369e5375c7e2197c2c5211b18'],
  ['PET_COLLECTION', 'raw/pet-collection.png', 'ef5e490dc05917a3178974d74ace212b1e981803ffb3b3747a12498e35bf5949'],
] as const;

describe('UI reference identity', () => {
  it('pins all four concept references without treating excluded regions as runtime UI', () => {
    const root = resolve('docs/design/ui-reference');
    const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as { entries: Array<Record<string, unknown>> };
    expect(manifest.entries.map(e => [e.id, e.file, e.sha256])).toEqual(expected);
    for (const entry of manifest.entries) {
      const bytes = readFileSync(resolve(root, String(entry.file)));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      expect(entry.excludedRegions).toEqual(['DEVICE_FRAME', 'DYNAMIC_ISLAND', 'STATUS_BAR', 'SAMPLE_COPY', 'SAMPLE_VALUES']);
      expect(entry.rightsStatus).toBe('REVIEW_REQUIRED');
    }
  });
});
