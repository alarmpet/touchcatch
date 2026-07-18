import { describe, expect, it } from 'vitest';
import { evaluateLoadEvidence, runDeterministicFaultHarness, runBalanceSimulation } from '../../tools/release-evidence.js';

describe('release evidence harnesses', () => {
  it('does not make a rate pass claim below 10,000 unique requests', () => {
    expect(evaluateLoadEvidence({uniqueRequests:9999,unexpectedFailures:0,tapLatenciesMs:[1],duplicateClaims:0,duplicateRewards:0,finishLosses:0})).toMatchObject({rateVerdict:'INSUFFICIENT_SAMPLE'});
  });
  it('uses the frozen unexpected failure numerator and threshold', () => {
    expect(evaluateLoadEvidence({uniqueRequests:10000,unexpectedFailures:9,tapLatenciesMs:[250],duplicateClaims:0,duplicateRewards:0,finishLosses:0}).rateVerdict).toBe('PASS');
    expect(evaluateLoadEvidence({uniqueRequests:10000,unexpectedFailures:10,tapLatenciesMs:[251],duplicateClaims:0,duplicateRewards:0,finishLosses:0})).toMatchObject({rateVerdict:'FAIL',latencyVerdict:'FAIL'});
  });
  it('survives receipt/outbox restart and replay without loss or duplicate effects', () => {
    expect(runDeterministicFaultHarness(20260719)).toEqual({accepted:200,receipts:200,effects:200,finishes:100,lost:0,duplicateEffects:0,replayHashStable:true});
  });
  it('produces seeded, versioned and explicitly non-human balance evidence', () => {
    const a=runBalanceSimulation({seed:42,matches:50,botModelVersion:'bot-v1'});
    expect(runBalanceSimulation({seed:42,matches:50,botModelVersion:'bot-v1'})).toEqual(a);
    expect(a).toMatchObject({reportVersion:1,matches:50,botModelVersion:'bot-v1',evidenceClass:'DRAFT_TEST_ONLY'});
  });
});
