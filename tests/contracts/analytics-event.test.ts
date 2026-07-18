import { describe, expect, it } from 'vitest';
import { AnalyticsCollector, parseAnalyticsEventV1, reconstructTrace } from '../../packages/contracts/src/analytics.js';

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

  it('deduplicates retries and separates expected rejection from unexpected failure', () => {
    const collector = new AnalyticsCollector();
    collector.recordRequest({requestId:'r1',outcome:'EXPECTED_REJECTION',reason:'ALREADY_CLAIMED'});
    collector.recordRequest({requestId:'r1',outcome:'UNEXPECTED_FAILURE',reason:'INTERNAL_ERROR'});
    collector.recordRequest({requestId:'r2',outcome:'UNEXPECTED_FAILURE',reason:'ACK_TIMEOUT'});
    expect(collector.snapshot()).toEqual({uniqueSchemaValidRequests:2,expectedDomainRejections:1,unexpectedFailures:1});
  });

  it('reconstructs the complete lifecycle by opaque trace id without private data', () => {
    const stages=['queue','handshake','preload','command','finish','reward'] as const;
    const events=stages.map((stage,eventSeq)=>parseAnalyticsEventV1({...base,eventSeq:eventSeq+1,name:'match_stage',data:{stage}}));
    expect(reconstructTrace(events,'trace_opaque')).toEqual(stages);
  });
});
