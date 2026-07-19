import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'smol-toml';

describe('Supabase Data API surface', () => {
  it('exposes public and graphql_public but never private', async () => {
    const parsed = parse(await readFile(resolve('supabase/config.toml'), 'utf8')) as { api?: { schemas?: unknown } };
    expect(parsed.api?.schemas).toEqual(['public', 'graphql_public']);
    expect(parsed.api?.schemas).not.toContain('private');
  });

  it('requires email confirmation and exact mobile PKCE callbacks', async () => {
    const parsed = parse(await readFile(resolve('supabase/config.toml'), 'utf8')) as {
      auth?: { additional_redirect_urls?: unknown; enable_manual_linking?: unknown; email?: { enable_confirmations?: unknown; enable_manual_linking?: unknown } };
    };
    expect(parsed.auth?.additional_redirect_urls).toEqual(['spotlearn://auth/callback', 'spotlearn://auth/recovery']);
    expect(parsed.auth?.enable_manual_linking).toBe(true);
    expect(parsed.auth?.email).toMatchObject({ enable_confirmations: true });
    expect(parsed.auth?.email).not.toHaveProperty('enable_manual_linking');
  });
});
