import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) out.push(...await files(path)); else out.push(path);
  }
  return out;
}

describe('admin server/client boundary', () => {
  it('keeps deployment and attestation secrets out of client modules', async () => {
    const clientRoot = resolve('apps/admin/src/client');
    const text = (await Promise.all((await files(clientRoot)).map((path) => readFile(path, 'utf8')))).join('\n');
    expect(text).not.toMatch(/SUPABASE_SECRET|DEPLOYMENT|ATTESTATION_KEY|server\/|privateSolution|canonicalAnswer|correctOptionId/u);
    expect(await readFile(resolve('apps/admin/src/server/env.ts'), 'utf8')).toContain("import 'server-only'");
    const serverFiles = (await files(resolve('apps/admin/src/server'))).filter((path) => path.endsWith('.ts'));
    for (const path of serverFiles) expect(await readFile(path, 'utf8'), path).toContain("import 'server-only'");
    expect(await readFile(resolve('apps/admin/app/api/admin/validate/route.ts'), 'utf8')).toContain('adminHandlers.validate');
    expect(await readFile(resolve('apps/admin/app/api/admin/publish/route.ts'), 'utf8')).toContain('adminHandlers.publish');
  });
});
