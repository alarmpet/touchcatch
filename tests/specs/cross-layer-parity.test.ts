import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_INTEGRATION_EVIDENCE,
  ASSET_PUBLISH_LIMITS_V1,
  MATCH_DB_PROJECTION_V1,
  parseContentAssetOrigins,
} from '../../packages/contracts/src/index.js';

const migration = new URL('../../supabase/migrations/202607150003_rls_and_integrity.sql', import.meta.url);

describe('cross-layer generated evidence', () => {
  it('derives prerequisites from executable shared contracts', () => {
    expect(CONTENT_INTEGRATION_EVIDENCE).toEqual({
      runtimeTuple: { node: '24.18.0', pnpm: '11.13.0' },
      matchContract: true,
      terminalMapping: true,
      wireNormalizationAndLimits: true,
    });
  });

  it('pins DB terminal values to the domain projection', async () => {
    const sql = await readFile(migration, 'utf8');
    const enumBody = /create type public\.match_status as enum \(([^;]+)\);/su.exec(sql)?.[1];
    expect(enumBody?.match(/'[^']+'/gu)?.map((v) => v.slice(1, -1))).toEqual(MATCH_DB_PROJECTION_V1.phases);
    for (const reason of MATCH_DB_PROJECTION_V1.endReasons) expect(sql).toContain(`'${reason}'`);
    expect(sql).toContain('matches_terminal_shape');
  });

  it('checks validator asset limits against the applied publishing function', async () => {
    const sql = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`between 1 and ${ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes}`);
    expect(sql).toContain(`between 1 and ${ASSET_PUBLISH_LIMITS_V1.maxWidth}`);
    expect(sql).toContain(`between 1 and ${ASSET_PUBLISH_LIMITS_V1.maxHeight}`);
    expect(sql).toContain(`> ${ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels}`);
  });

  it('normalizes an exact origin set and rejects duplicates or unsafe origins', () => {
    expect(parseContentAssetOrigins('https://b.test,https://a.test')).toEqual(['https://a.test', 'https://b.test']);
    expect(() => parseContentAssetOrigins('https://a.test,https://a.test')).toThrow('duplicate');
    expect(() => parseContentAssetOrigins('https://a.test/path')).toThrow('HTTPS origin');
  });

  it('keeps the DB allow-list immutable so referenced origins cannot be removed without migration', async () => {
    const sql = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    expect(sql).toContain('content_asset_origins_immutable');
    expect(sql).toContain('before update or delete on private.content_asset_origins');
  });
});
