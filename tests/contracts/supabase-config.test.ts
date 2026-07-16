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
});
