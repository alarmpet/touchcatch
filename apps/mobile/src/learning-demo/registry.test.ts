import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('learning demo registry', () => {
  it('pins manifest admission status, hash, and exact five-step snapshots', async () => {
    const manifest = JSON.parse(
      execFileSync('git',['show','HEAD:content/learning/manifest.v1.json'],{encoding:'utf8'}),
    ) as {
      entries: Array<{
        key: string;
        category: string;
        rankedEligible: boolean;
        hintLadderAdmission: {
          status: 'ADMITTED' | 'MISSING' | 'REJECTED';
          hash: string | null;
        };
      }>;
    };
    const source = await readFile('apps/mobile/src/learning-demo/registry.ts', 'utf8');

    expect(source.match(/buildDemoEntry\(/g)).toHaveLength(manifest.entries.length);
    for (const entry of manifest.entries) {
      expect(source).toContain(`"category":"${entry.category}"`);
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
    expect(source).not.toContain('/drafts/');
  });
});
