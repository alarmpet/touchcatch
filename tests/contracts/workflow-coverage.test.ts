import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

async function readJson(path: string) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8')) as { scripts?: Record<string, string> };
}

describe('package and CI coverage contract', () => {
  it('exposes independent server and mobile verification commands', async () => {
    const server = await readJson('apps/server/package.json');
    const mobile = await readJson('apps/mobile/package.json');
    const workflow = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');

    expect(server.scripts).toMatchObject({ typecheck: expect.any(String), test: expect.any(String) });
    expect(mobile.scripts).toMatchObject({ web: expect.any(String), typecheck: expect.any(String), 'web:build': expect.any(String) });
    expect(workflow).toContain('pnpm server:check');
    expect(workflow).toContain('pnpm mobile:check');
    expect(workflow).toContain('local contract/build evidence');
  });
});
