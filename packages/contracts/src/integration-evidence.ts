import packageManifest from '../../../package.json' with { type: 'json' };
import { ASSET_PUBLISH_LIMITS_V1 } from './content.js';
import { parseMatchStateV1 } from './match.schema.js';
import { clientCommandEnvelopeSchema } from './socket.schema.js';
import { normalizeFinalAnswer } from './answer-normalization.js';
import { MATCH_DB_PROJECTION_V1, type MatchEndReason, type MatchPhase } from './match.js';

const runtimeTuple = Object.freeze({ node: packageManifest.engines.node, pnpm: packageManifest.engines.pnpm });

/** Evidence is derived from executable imports and pinned values, never caller-supplied flags. */
export const CONTENT_INTEGRATION_EVIDENCE = Object.freeze({
  runtimeTuple,
  parseState(value:unknown){return parseMatchStateV1(value);},
  verifyWire(value:unknown){const parsed=clientCommandEnvelopeSchema.parse(value);if(parsed.payload.type!=='SUBMIT_FINAL_ANSWER')throw Error('answer command required');const max='a'.repeat(128);const base={...parsed,payload:{type:'SUBMIT_FINAL_ANSWER' as const,answer:max}};return {normalizedAnswer:normalizeFinalAnswer(parsed.payload.answer),acceptedAtMax:clientCommandEnvelopeSchema.safeParse(base).success,rejectedPastMax:!clientCommandEnvelopeSchema.safeParse({...base,payload:{...base.payload,answer:`${max}a`}}).success};},
  assetLimits:ASSET_PUBLISH_LIMITS_V1,
  validateTerminalTuple(tuple:{phase:MatchPhase;endReason:MatchEndReason|null;winnerPlayerId:string|null}){const terminal=tuple.phase==='FINISHED'||tuple.phase==='CANCELLED';if(!terminal)return tuple.endReason===null&&tuple.winnerPlayerId===null;if(tuple.endReason===null)return false;if(tuple.phase==='CANCELLED')return MATCH_DB_PROJECTION_V1.winnerForbidden.includes(tuple.endReason as never)&&tuple.endReason!=='DRAW'&&tuple.winnerPlayerId===null;if(MATCH_DB_PROJECTION_V1.winnerRequired.includes(tuple.endReason as never))return tuple.winnerPlayerId!==null;return tuple.endReason==='DRAW'&&tuple.winnerPlayerId===null;},
});

const sqlList=(values:readonly string[])=>values.map(value=>`'${value}'`).join(',');
export const GENERATED_MATCH_TERMINAL_CONSTRAINT_V1=`(
status not in ('FINISHED','CANCELLED') and ended_at is null and end_reason is null and winner_participant_key is null
) or (
status = 'CANCELLED' and ended_at is not null and end_reason in (${sqlList(MATCH_DB_PROJECTION_V1.winnerForbidden.filter(value=>value!=='DRAW'))}) and winner_participant_key is null
) or (
status = 'FINISHED' and ended_at is not null and end_reason in (${sqlList([...MATCH_DB_PROJECTION_V1.winnerRequired,'DRAW'])}) and ((end_reason = 'DRAW' and winner_participant_key is null) or (end_reason <> 'DRAW' and winner_participant_key is not null))
)`;
const normalizeSql=(value:string)=>value.replace(/\s+/gu,' ').trim();
export function deriveTerminalConstraintProjection(sql:string){
 const body=/matches_terminal_shape check \(([\s\S]*?)\n\);/u.exec(sql)?.[1];
 if(!body)throw Error('terminal constraint missing');
 if(normalizeSql(body)!==normalizeSql(GENERATED_MATCH_TERMINAL_CONSTRAINT_V1))throw Error('terminal constraint drift');
 return {cancelled:[...MATCH_DB_PROJECTION_V1.winnerForbidden.filter(x=>x!=='DRAW')].sort(),finished:[...MATCH_DB_PROJECTION_V1.winnerRequired,'DRAW'].sort(),drawWinnerNull:true,nonDrawWinnerPresent:true};
}

export function parseContentAssetOrigins(value: string): readonly string[];
export function parseContentAssetOrigins(value: string, assetPolicyVersion:string): readonly {assetPolicyVersion:string;origin:string}[];
export function parseContentAssetOrigins(value: string, assetPolicyVersion?:string): readonly (string|{assetPolicyVersion:string;origin:string})[] {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!items.length) throw new Error('CONTENT_ASSET_ORIGINS requires at least one HTTPS origin');
  const normalized = items.map((origin) => {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.pathname !== '/' || parsed.port || parsed.username || parsed.password) {
      throw new Error('CONTENT_ASSET_ORIGINS entries must be an exact HTTPS origin');
    }
    return origin;
  }).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error('CONTENT_ASSET_ORIGINS contains a duplicate origin');
  return assetPolicyVersion===undefined?normalized:normalized.map(origin=>({assetPolicyVersion,origin}));
}
