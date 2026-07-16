import { describe, expect, it } from 'vitest';
import { parseMatchCommandV1, parseMatchEventV1 } from './match.schema.js';

describe('match command schema', () => {
  it('accepts a namespaced player command and rejects a future revision shape', () => {
    const command = {
      source: 'PLAYER', commandId: '00000000-0000-4000-8000-000000000001:player:p1:00000000-0000-4000-8000-000000000002',
      matchId: '00000000-0000-4000-8000-000000000001', commandSeq: 1, receivedAtMs: 0,
      requestId: '00000000-0000-4000-8000-000000000002', playerId: 'p1', expectedRevision: 0,
      payload: { type: 'TAP_IMAGE', imageSide: 'A', x: 0.5, y: 0.5 },
    };
    expect(parseMatchCommandV1(command)).toEqual(command);
    expect(() => parseMatchCommandV1({ ...command, extra: true })).toThrow();
    expect(() => parseMatchCommandV1({ ...command, requestId: '00000000-0000-1000-8000-000000000002' })).toThrow();
  });
  it.each([
    ['missing required field',(x:Record<string,unknown>)=>{const rest={...x};delete rest.payload;return rest;}],
    ['negative time',(x:Record<string,unknown>)=>({...x,receivedAtMs:-1})],
    ['unsafe sequence',(x:Record<string,unknown>)=>({...x,commandSeq:Number.MAX_SAFE_INTEGER+1})],
    ['513 internal id',(x:Record<string,unknown>)=>({...x,commandId:'x'.repeat(513)})],
    ['wrong player namespace',(x:Record<string,unknown>)=>({...x,commandId:`${String(x.matchId)}:player:other:${String(x.requestId)}`})],
    ['nested payload extra',(x:Record<string,unknown>)=>({...x,payload:{...(x.payload as Record<string,unknown>),extra:true}})],
  ])('rejects %s',(_name,mutate)=>{
    const base={source:'PLAYER' as const,commandId:'00000000-0000-4000-8000-000000000001:player:p1:00000000-0000-4000-8000-000000000002',matchId:'00000000-0000-4000-8000-000000000001',commandSeq:1,receivedAtMs:0,requestId:'00000000-0000-4000-8000-000000000002',playerId:'p1',expectedRevision:0,payload:{type:'USE_HINT' as const}};
    expect(()=>parseMatchCommandV1(mutate(base))).toThrow();
  });
  it('rejects a 65-character event id',()=>expect(()=>parseMatchEventV1({eventId:'x'.repeat(65),matchId:'00000000-0000-4000-8000-000000000001',eventSeq:1,causedByCommandSeq:1,stateRevision:1,occurredAtMs:0,phase:'PLAYING',type:'TAP_RESOLVED',payload:{}})).toThrow(/event/));
});
