import { describe, expect, it } from 'vitest';
import { AnalyticsCollector, parseAnalyticsEventV1, reconstructTrace } from '../../packages/contracts/src/analytics.js';
import fs from 'node:fs';import Ajv2020Import from 'ajv/dist/2020.js';
const Ajv2020=Ajv2020Import as unknown as new(options:unknown)=>{compile:(schema:unknown)=>(value:unknown)=>boolean};

const base = {
  eventVersion: 1 as const, eventSeq: 1, stateRevision: 1,
  occurredAt: '2026-07-19T00:00:00.000Z', matchId: 'match_opaque',
  anonymousUserId: 'anon_rotating', traceId: 'trace_opaque',
  engineVersion: '1.0.0', rulesetVersion: '1.0.0', contentRevisionId: 'content_1',
  experimentVariant: 'CONTROL' as const, serverVersion: 'server_1', protocolVersion: 1 as const,
};

describe('analytics privacy boundary', () => {
  it('accepts only versioned allow-listed bucketed events', () => {
    expect(parseAnalyticsEventV1({...base, name:'same_coordinate_burst_signal', data:{cellBucket:'03:12',countBucket:'8-15',windowDurationBucket:'1-2s'}})).toBeTruthy();
    expect(parseAnalyticsEventV1({...base, name:'answer_reaction_time_signal', data:{durationBucket:'500-999ms'}})).toBeTruthy();
  });

  it.each(['jwt','serviceKey','authUuid','email','canonicalAnswer','aliases','correctOptionId','hitboxes','rawUpload','sourceData','x','answer'])('rejects recursively forbidden %s before an adapter', (key) => {
    expect(() => parseAnalyticsEventV1({...base,name:'match_stage',data:{stage:'command',nested:{[key]:'secret'}}})).toThrow(/forbidden/i);
  });
  it.each(['aaaaaaaa.bbbbbbbb.cccccccc',['sb','secret','example'].join('_')])('rejects secret-shaped values even under innocuous keys', (value) => {
    expect(() => parseAnalyticsEventV1({...base,name:'match_stage',data:{stage:'command',context:value}})).toThrow(/forbidden/i);
  });

  it.each(['person@example.com','Bearer abcdefghijklmnopqrstuvwxyz','550e8400-e29b-41d4-a716-446655440000','postgres://user:pass@host/db','sk_live_abcdefghijklmnopqrstuvwxyz'])('rejects private value shape %s recursively',(value)=>{
    expect(()=>parseAnalyticsEventV1({...base,name:'match_stage',data:{stage:'command',context:value}})).toThrow(/forbidden/i);
  });

  it('reconstructs the complete lifecycle by opaque trace id without private data', () => {
    const stages=['queue','handshake','preload','command','finish','reward'] as const;
    const events=stages.map((stage,eventSeq)=>parseAnalyticsEventV1({...base,eventSeq:eventSeq+1,name:'match_stage',data:{stage}}));
    expect(reconstructTrace(events,'trace_opaque')).toEqual(stages);
    expect(()=>reconstructTrace(events.slice(0,5),'trace_opaque')).toThrow(/complete/i);
    expect(()=>reconstructTrace([...events,events[5]!],'trace_opaque')).toThrow(/complete|duplicate/i);
  });
  it('keeps JSON schema cellBucket string semantics in runtime parity',()=>{const schema=JSON.parse(fs.readFileSync('schemas/analytics-event.schema.json','utf8'));const validate=new Ajv2020({strict:false,formats:{'date-time':true}}).compile(schema);const good={...base,name:'same_coordinate_burst_signal',data:{cellBucket:'03:12',countBucket:'8-15',windowDurationBucket:'1-2s'}};expect(validate(good)).toBe(true);expect(()=>parseAnalyticsEventV1(good)).not.toThrow();for(const value of [312,null,{}]){const bad={...good,data:{...good.data,cellBucket:value}};expect(validate(bad)).toBe(false);expect(()=>parseAnalyticsEventV1(bad)).toThrow();}});
});
