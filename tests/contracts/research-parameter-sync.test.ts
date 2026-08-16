import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('research parameter references', () => {
  it('keeps executable baseline values visible in research.md', async () => {
    const research = await readFile('research.md', 'utf8');
    expect(research).toContain('PIXEL_THRESHOLD = 75');
    expect(research).toContain('MIN_CLUSTER_CHANGED_PIXELS = 150');
    expect(research).toContain('MAX_OUTSIDE_CHANGED_RATIO = 0.08');
    expect(research).toContain('NON-NORMATIVE');
  });
});
