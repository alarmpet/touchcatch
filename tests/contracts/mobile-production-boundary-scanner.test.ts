import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanFiles, scanProductionAppRoutes, scanText } from '../../tools/check-mobile-production-boundary.mjs';

describe('mobile production boundary scanner', () => {
  it('fails a bundle buffer that injects the canonical-answer sentinel', () => {
    const hits = scanText('var x = "TOUCHCATCH_CANONICAL_ANSWER_SENTINEL"', 'bundle');
    expect(hits.map((hit) => hit.id)).toContain('fixture-sentinel');
  });

  it('passes a public-only buffer', () => {
    expect(scanText('export default function Screen() { return "학습"; }')).toEqual([]);
  });

  it('fails a file that smuggles a private marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'boundary-'));
    const file = join(dir, 'leak.js');
    writeFileSync(file, 'const canonicalAnswer = "resilience";\n');
    expect(scanFiles([file]).map((hit: { id: string }) => hit.id)).toContain('canonical-answer');
  });

  it('finds no forbidden markers in production app routes', () => {
    expect(scanProductionAppRoutes()).toEqual([]);
  });
});
