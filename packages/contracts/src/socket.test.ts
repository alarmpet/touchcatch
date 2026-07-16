import { describe, expect, it } from 'vitest';
import { clientCommandEnvelopeSchema, compatibilityHandshakeSchema, negotiateCompatibility } from './socket.schema.js';
import { hashMatchCommandRequest } from './idempotency.js';

const requestId='123e4567-e89b-42d3-a456-426614174000', matchId='123e4567-e89b-12d3-a456-426614174000';
const base={protocolVersion:1 as const,requestId,matchId,expectedRevision:0,clientSeq:0,payload:{type:'TAP_IMAGE' as const,imageSide:'A' as const,x:.5,y:.5}};
describe('authenticated socket wire contracts',()=>{
 it('strictly validates client-only commands and UUIDv4 request IDs',()=>{
  expect(clientCommandEnvelopeSchema.safeParse(base).success).toBe(true);
  expect(clientCommandEnvelopeSchema.safeParse({...base,requestId:matchId}).success).toBe(false);
  expect(clientCommandEnvelopeSchema.safeParse({...base,payload:{type:'CLOSE_INPUT'}}).success).toBe(false);
  expect(clientCommandEnvelopeSchema.safeParse({...base,authSubject:'secret'}).success).toBe(false);
  expect(clientCommandEnvelopeSchema.safeParse({...base,payload:{...base.payload,x:Infinity}}).success).toBe(false);
 });
 it('normalizes retry-only fields out of the request hash',()=>{
  const a={...base,payload:{type:'SUBMIT_FINAL_ANSWER' as const,answer:'  Ｃａｔ  '}};
  const b={...a,expectedRevision:99,clientSeq:22,payload:{...a.payload,answer:'cat'}};
  expect(hashMatchCommandRequest(a,'player-a')).toBe(hashMatchCommandRequest(b,'player-a'));
  expect(hashMatchCommandRequest(a,'player-a')).not.toBe(hashMatchCommandRequest(a,'player-b'));
 });
 it('fails closed on compatibility mismatch before ingress',()=>{
  const hello={protocolVersion:1 as const,supportedEngineVersions:['engine-1'],supportedRulesetVersions:['1.0.0']};
  expect(compatibilityHandshakeSchema.safeParse(hello).success).toBe(true);
  expect(negotiateCompatibility(hello,{protocolVersion:1,engineVersion:'engine-2',rulesetVersion:'1.0.0',rulesetHash:'a'.repeat(64),contentRevisionId:matchId,contentHash:'b'.repeat(64)})).toEqual({accepted:false,reason:'UPDATE_REQUIRED'});
 });
});
