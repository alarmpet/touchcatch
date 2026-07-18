import { describe, expect, it } from 'vitest';
import {
  AnalyticsCollector, parseExperimentContractV1, validateLifecycleTrace,
  assignExperimentVariant, evaluateSampleRatioMismatch,
} from '../../packages/contracts/src/analytics.js';
import {
  evaluateLoadSamples, runDeterministicFaultHarness, runMatchSimulation, runEconomySimulation,
} from '../../tools/release-evidence.js';

const sample=(requestId:string, outcome:'SUCCESS'|'EXPECTED_REJECTION'|'UNEXPECTED_FAILURE', occurredAtMs:number, reason?:string)=>({requestId,outcome,occurredAtMs,durationMs:100,reason,schemaValid:true,duplicateClaim:false,duplicateReward:false,finishLost:false,concurrency:100});

describe('release evidence harnesses', () => {
  it('groups retries by request and uses only the terminal outcome', () => {
    const collector=new AnalyticsCollector();
    collector.recordRequest(sample('r1','UNEXPECTED_FAILURE',1,'ACK_TIMEOUT'));
    collector.recordRequest(sample('r1','SUCCESS',2));
    collector.recordRequest(sample('r2','EXPECTED_REJECTION',1,'ALREADY_CLAIMED'));
    expect(collector.snapshot()).toEqual({uniqueSchemaValidRequests:2,expectedDomainRejections:1,unexpectedFailures:0});
    expect(()=>collector.recordRequest(sample('r3','EXPECTED_REJECTION',1,'NOT_ALLOWLISTED'))).toThrow(/reason/);
    expect(()=>collector.recordRequest(sample('r4','UNEXPECTED_FAILURE',1,'ALREADY_CLAIMED'))).toThrow(/reason/);
  });

  it('derives rolling 5m and full 30m evidence from raw samples without preaggregated PASS', () => {
    const samples=Array.from({length:10000},(_,i)=>sample(`r${i}`,'SUCCESS',i*180));
    const result=evaluateLoadSamples(samples,{soakStartMs:0,soakEndMs:1_800_000,expectedConcurrency:100});
    expect(result.full30m).toMatchObject({denominator:10000,numerator:0,rateVerdict:'PASS',durationMs:1_800_000});
    expect(result.rolling5m.length).toBeGreaterThan(0);
    expect(result.full30m.confidence95.upper).toBeGreaterThan(0);
  });

  it('rejects impossible, negative, duplicate and incomplete soak samples', () => {
    expect(()=>evaluateLoadSamples([{...sample('r', 'SUCCESS', 1),durationMs:-1}],{soakStartMs:0,soakEndMs:1_800_000,expectedConcurrency:100})).toThrow();
    expect(()=>evaluateLoadSamples([sample('r','SUCCESS',1),sample('r','SUCCESS',1)],{soakStartMs:0,soakEndMs:1_800_000,expectedConcurrency:100})).toThrow(/retry order/);
    expect(()=>evaluateLoadSamples([sample('r','SUCCESS',1)],{soakStartMs:0,soakEndMs:100,expectedConcurrency:100})).toThrow(/30-minute/);
    expect(()=>evaluateLoadSamples([{...sample('r','SUCCESS',1),concurrency:0}],{soakStartMs:0,soakEndMs:1_800_000,expectedConcurrency:100})).toThrow(/concurrency/);
  });

  it('executes lease/fence crash/restart, journal gap snapshot and exactly-once outbox effects', async () => {
    const result=await runDeterministicFaultHarness(20260719);
    expect(result).toMatchObject({accepted:200,receipts:200,lost:0,duplicateEffects:0,staleFenceRejected:true,gapRecoveredBySnapshot:true,outboxAcks:200});
    expect(result.reconstructedTerminalHash).toBe(result.authoritativeTerminalHash);
    expect(result.crashPoints).toEqual(['AFTER_CLAIM','AFTER_JOURNAL','AFTER_EFFECT','BEFORE_ACK']);
    expect(result.injectedCrashCounts).toEqual({AFTER_CLAIM:50,AFTER_JOURNAL:50,AFTER_EFFECT:50,BEFORE_ACK:50});
  });

  it('separates deterministic 10k match and 100k economy evidence', () => {
    const matches=runMatchSimulation({seed:42,matches:10000,botModelVersion:'bot-v1'}),draws=runEconomySimulation({seed:42,draws:100000});
    expect(runMatchSimulation({seed:42,matches:10000,botModelVersion:'bot-v1'})).toEqual(matches);expect(runEconomySimulation({seed:42,draws:100000})).toEqual(draws);
    expect(matches).toMatchObject({matches:10000,rulesetVersion:'1.0.0',evidenceClass:'DRAFT_TEST_ONLY'});expect(draws).toMatchObject({drawCount:100000,economyVersion:'1.0.0',economyStatus:'DRAFT'});expect(draws.draws.COMMON+draws.draws.RARE+draws.draws.LEGENDARY).toBe(100000);
  });

  it('enforces a strict versioned A/B contract and string cell bucket', () => {
    const contract=parseExperimentContractV1({schemaVersion:1,experimentId:'battle-v1',assignmentUnit:'anonymousUserId',assignmentSaltVersion:'salt-v1',variants:['CONTROL','TREATMENT'],allocationBasisPoints:[5000,5000],primaryMetric:'final_attempt_rate',mde:0.03,alpha:0.05,power:0.8,minSamplePerVariant:10000,guardrails:['tap_result_p95','unexpected_failure_rate','srm'],stoppingRule:'FIXED_HORIZON',cellBucket:'03:12'});
    expect(contract.cellBucket).toBe('03:12');
    expect(()=>parseExperimentContractV1({...contract,allocationBasisPoints:[6000,3000]})).toThrow(/allocation/);
    expect(assignExperimentVariant('anon-1',contract)).toBe(assignExperimentVariant('anon-1',contract));
    expect(evaluateSampleRatioMismatch({CONTROL:5000,TREATMENT:5000},contract).verdict).toBe('PASS');expect(evaluateSampleRatioMismatch({CONTROL:9000,TREATMENT:1000},contract).verdict).toBe('FAIL');
  });

  it('requires an exact ordered, uniquely correlated lifecycle trace', () => {
    const stages=['queue','handshake','preload','command','finish','reward'] as const;const rows=stages.map((stage,i)=>({stage,eventSeq:i+1,traceId:'trace_opaque_123',matchId:'match_opaque_123',requestId:`request_opaque_${i}`,effectId:stage==='reward'?'effect_opaque_1':null}));
    expect(validateLifecycleTrace(rows)).toEqual({traceId:'trace_opaque_123',matchId:'match_opaque_123',stages:['queue','handshake','preload','command','finish','reward']});
    expect(()=>validateLifecycleTrace([...rows,rows[5]!])).toThrow(/unique|ordered/);
  });
});
