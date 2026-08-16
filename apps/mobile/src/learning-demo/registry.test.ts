import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('learning demo registry', () => {
  it('pins manifest admission status, hash, and exact five-step snapshots', async () => {
    const manifest = JSON.parse(
      await readFile('content/learning/manifest.v1.json', 'utf8'),
    ) as {
      entries: Array<{
        key: string;
        category: string;
        preferredInputSurface: string;
        assistPattern: string;
        rankedEligible: boolean;
        hintLadderAdmission: {
          status: 'ADMITTED' | 'MISSING' | 'REJECTED';
          hash: string | null;
        };
      }>;
    };
    const source = await readFile('apps/mobile/src/learning-demo/registry.ts', 'utf8');

    expect(source.match(/buildDemoEntry\(/g)).toHaveLength(manifest.entries.length);
    expect(source).toContain('export const learningDemoEntries');
    expect(source).not.toContain('export const learningPacks');
    for (const entry of manifest.entries) {
      expect(source).toContain(`"category":"${entry.category}"`);
      expect(source).toContain(
        `"preferredInputSurface":"${entry.preferredInputSurface}"`,
      );
      expect(source).toContain(`"assistPattern":"${entry.assistPattern}"`);
      expect(source).toContain(`"hintAdmissionStatus":"${entry.hintLadderAdmission.status}"`);
      if (entry.rankedEligible) {
        expect(entry.hintLadderAdmission.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(source).toContain(
          `"hintAdmissionHash":"${entry.hintLadderAdmission.hash}"`,
        );
      }
    }
    expect(source.match(/"hintAdmissionStatus":"ADMITTED"/g)).toHaveLength(
      manifest.entries.filter((entry) => entry.rankedEligible).length,
    );
    expect(
      manifest.entries.some(
        (entry) => entry.key === 'en-resilience' && entry.rankedEligible,
      ),
    ).toBe(true);
    expect(
      manifest.entries.some(
        (entry) =>
          entry.key === 'ko-proverb-seeing-is-believing' && entry.rankedEligible,
      ),
    ).toBe(true);
    expect(source).not.toContain('/drafts/');
    expect(source).not.toContain('\uFFFD');
    expect(source.match(/require\('\.\.\/\.\.\/\.\.\/\.\.\/content\/learning\/source\//g)).toHaveLength(manifest.entries.length * 2);
  });

  it('preserves exact Korean titles and prompts in generated UTF-8 source', async () => {
    const manifest = JSON.parse(
      await readFile('content/learning/manifest.v1.json', 'utf8'),
    ) as { entries: Array<{ key: string; category: string }> };
    const source = await readFile('apps/mobile/src/learning-demo/registry.ts', 'utf8');
    const koreanEntries = manifest.entries.filter((entry) =>
      entry.category === 'PROVERB' || entry.category === 'IDIOM',
    );

    expect(koreanEntries.length).toBeGreaterThan(0);
    for (const entry of koreanEntries) {
      const bundle = JSON.parse(
        await readFile(`content/learning/drafts/${entry.key}.json`, 'utf8'),
      ) as {
        privateSolution: {
          finalChallenge: { canonicalAnswer: string; meaning: { prompt: string } };
        };
      };
      expect(source).toContain(JSON.stringify(bundle.privateSolution.finalChallenge.canonicalAnswer).slice(1, -1));
      expect(source).toContain(JSON.stringify(bundle.privateSolution.finalChallenge.meaning.prompt).slice(1, -1));
    }
  });
});
