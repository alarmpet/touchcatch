import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'smol-toml';

interface SupabaseAuthConfig {
  additional_redirect_urls?: unknown;
  enable_manual_linking?: unknown;
  external?: Record<string, { enabled?: unknown }>;
}

describe('mobile OAuth local configuration', () => {
  it('allows only the exact app callback required by the restored PKCE boundary', async () => {
    const parsed = parse(await readFile(resolve('supabase/config.toml'), 'utf8')) as {
      auth?: SupabaseAuthConfig;
    };

    expect(parsed.auth?.additional_redirect_urls).toEqual(['spotlearn://auth/callback']);
    expect(parsed.auth?.enable_manual_linking).toBe(true);
  });

  it('does not claim unconfigured local Google or Kakao providers are enabled', async () => {
    const parsed = parse(await readFile(resolve('supabase/config.toml'), 'utf8')) as {
      auth?: SupabaseAuthConfig;
    };

    expect(parsed.auth?.external?.google?.enabled).not.toBe(true);
    expect(parsed.auth?.external?.kakao?.enabled).not.toBe(true);
  });

  it('generates Android with the callback scheme and canonical package identity', async () => {
    const app = JSON.parse(await readFile(resolve('apps/mobile/app.json'), 'utf8')) as {
      expo?: { scheme?: unknown; android?: { package?: unknown } };
    };

    expect(app.expo?.scheme).toBe('spotlearn');
    expect(app.expo?.android?.package).toBe('com.touchcatch.mobile');
  });

  it('keeps test modules outside the Expo Router route graph', async () => {
    const routeFiles = await readdir(resolve('apps/mobile/app'), { recursive: true });

    expect(routeFiles.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file))).toEqual([]);
  });
});
