import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mobile auth routes', () => {
  it('ships login, callback, and recovery routes through the auth facade', async () => {
    const [login, callback, recovery, layout, nativeAuth] = await Promise.all([
      readFile(resolve('apps/mobile/app/auth/index.tsx'), 'utf8'),
      readFile(resolve('apps/mobile/app/auth/callback.tsx'), 'utf8'),
      readFile(resolve('apps/mobile/app/auth/recovery.tsx'), 'utf8'),
      readFile(resolve('apps/mobile/app/_layout.tsx'), 'utf8'),
      readFile(resolve('apps/mobile/src/auth/native-auth.ts'), 'utf8'),
    ]);
    expect(login).toMatch(/signUpEmail/);
    expect(login).toMatch(/startOAuth\('google'\)/);
    expect(login).toMatch(/startOAuth\('kakao'\)/);
    expect(callback).toMatch(/consumeOAuthLinks/);
    expect(recovery).toMatch(/completePasswordRecovery/);
    expect(`${login}\n${callback}\n${recovery}`).not.toMatch(/@supabase\/supabase-js/);
    expect(layout).toMatch(/AuthRuntime/);
    expect(nativeAuth.indexOf('const client = getAuthClient()')).toBeGreaterThan(nativeAuth.indexOf('function buildServices'));
  });
});
