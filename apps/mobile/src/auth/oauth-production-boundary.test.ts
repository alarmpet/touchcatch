import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('production OAuth boundary', () => {
  it('keeps provider secrets and raw Supabase clients out of product routes', async () => {
    const paths = [
      'apps/mobile/app/profile.tsx',
      'apps/mobile/app/auth/callback.tsx',
      'apps/mobile/src/runtime/mobile-runtime.tsx',
      'apps/mobile/src/auth/oauth-coordinator.ts',
    ];
    const source = (await Promise.all(paths.map((path) => readFile(path, 'utf8')))).join('\n');
    expect(source).not.toMatch(/client[_-]?secret|service[_-]?role|sb_secret_|refresh_token|provider_token/iu);
    expect(source).not.toContain('createClient(');
    expect(source).not.toContain('setSession(');
  });
});
