import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('mobile auth import boundary', () => {
  it('keeps Supabase SDK imports inside the auth module', () => {
    const offenders = files('apps/mobile').filter((path) => /\.(?:ts|tsx)$/u.test(path) && !path.includes(`${join('src', 'auth')}`)).filter((path) => readFileSync(path, 'utf8').includes('@supabase/supabase-js'));
    expect(offenders).toEqual([]);
  });

  it('pins PKCE and never enables URL session detection', () => {
    const source = readFileSync('apps/mobile/src/auth/client.ts', 'utf8');
    expect(source).toContain("flowType: 'pkce'");
    expect(source).toContain('detectSessionInUrl: false');
    expect(source).not.toContain('SUPABASE_SECRET_KEY');
  });
});
