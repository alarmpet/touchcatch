import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_INTEGRATION_EVIDENCE,
  ASSET_PUBLISH_LIMITS_V1,
  MATCH_DB_PROJECTION_V1,
  parseContentAssetOrigins,
  deriveTerminalConstraintProjection,
} from '../../packages/contracts/src/index.js';
import { clientCommandEnvelopeSchema } from '../../packages/contracts/src/socket.schema.js';

const migration = new URL('../../supabase/migrations/202607150003_rls_and_integrity.sql', import.meta.url);

describe('cross-layer generated evidence', () => {
  it('derives prerequisites from executable shared contracts', () => {
    expect(CONTENT_INTEGRATION_EVIDENCE.runtimeTuple).toEqual({ node: '24.18.0', pnpm: '11.13.0' });
    const envelope=clientCommandEnvelopeSchema.parse({protocolVersion:1,requestId:'00000000-0000-4000-8000-000000000001',matchId:'00000000-0000-4000-8000-000000000002',expectedRevision:0,clientSeq:0,payload:{type:'SUBMIT_FINAL_ANSWER',answer:'  ＣＡＴ\u00a0NAME  '}});
    expect(CONTENT_INTEGRATION_EVIDENCE.verifyWire(envelope)).toEqual({normalizedAnswer:'cat name',acceptedAtMax:true,rejectedPastMax:true});
    expect(()=>CONTENT_INTEGRATION_EVIDENCE.parseState({})).toThrow('invalid match state');
    expect(CONTENT_INTEGRATION_EVIDENCE.validateTerminalTuple({phase:'FINISHED',endReason:'DRAW',winnerPlayerId:null})).toBe(true);
    expect(CONTENT_INTEGRATION_EVIDENCE.validateTerminalTuple({phase:'FINISHED',endReason:'DRAW',winnerPlayerId:'p1'})).toBe(false);
    expect(CONTENT_INTEGRATION_EVIDENCE).not.toMatchObject({
      matchContract: true,
      terminalMapping: true,
      wireNormalizationAndLimits: true,
    });
  });

  it('pins DB terminal values to the domain projection', async () => {
    const sql = await readFile(migration, 'utf8');
    const enumBody = /create type public\.match_status as enum \(([^;]+)\);/su.exec(sql)?.[1];
    expect(enumBody?.match(/'[^']+'/gu)?.map((v) => v.slice(1, -1))).toEqual(MATCH_DB_PROJECTION_V1.phases);
    const projection=deriveTerminalConstraintProjection(sql);
    expect(projection).toEqual({cancelled:[...MATCH_DB_PROJECTION_V1.winnerForbidden.filter(x=>x!=='DRAW')].sort(),finished:[...MATCH_DB_PROJECTION_V1.winnerRequired,'DRAW'].sort(),drawWinnerNull:true,nonDrawWinnerPresent:true});
    expect(()=>deriveTerminalConstraintProjection(sql.replace("'FORFEIT'", "'DRAW'"))).toThrow();
  });

  it('includes policy version in the exact origin identity',()=>{
    expect(parseContentAssetOrigins('https://cdn.spot-learn.test','1.0.0')).toEqual([{assetPolicyVersion:'1.0.0',origin:'https://cdn.spot-learn.test'}]);
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
