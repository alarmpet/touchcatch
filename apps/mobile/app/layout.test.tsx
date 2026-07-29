import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('mobile application layout', () => {
  it('uses only native modules present in the pinned mobile dependency graph', async () => {
    const source = await readFile('apps/mobile/app/_layout.tsx', 'utf8');
    expect(source).not.toContain('SafeAreaProvider');
    expect(source).toContain('<Stack');
  });

  it('pins executable mobile commands at the repository root', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['mobile:typecheck']).toBe(
      'tsc -p apps/mobile/tsconfig.json --noEmit',
    );
    expect(pkg.scripts['mobile:test']).toBe(
      'vitest run apps/mobile/src/learning-demo apps/mobile/app',
    );
  });
});
