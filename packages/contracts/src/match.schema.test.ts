import { describe, expect, it } from 'vitest';
import { deriveSystemCommandId, deriveTimerId, parseMatchCommandV1, parseMatchEventV1 } from './match.schema.js';

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

describe('stable TIMER and SYSTEM command identities',()=>{const matchId='00000000-0000-4000-8000-000000000001';const timers=[{type:'ASSET_LOAD_TIMEOUT'},{type:'START_MATCH'},{type:'START_WORD_HUNT',missionId:'w1'},{type:'END_WORD_HUNT',missionId:'w1'},{type:'UNLOCK_FINAL_CHALLENGE'},{type:'START_FINAL_RUSH'},{type:'CLOSE_INPUT'},{type:'ANSWER_LOCK_EXPIRED',playerId:'p1',wrongAttemptOrdinal:1},{type:'MEANING_TIMEOUT',playerId:'p1',quizOrdinal:1},{type:'DISCONNECT_FORFEIT_TIMEOUT',playerId:'p1',disconnectEpoch:1},{type:'SUDDEN_DEATH_TIMEOUT',objectiveId:'sd'}];it.each(timers)('rejects mismatched TIMER id for $type',(payload)=>{const id=deriveTimerId(matchId,payload);const base={source:'TIMER',commandId:id,timerId:id,matchId,commandSeq:1,receivedAtMs:1,dueAtMs:1,payload};expect(parseMatchCommandV1(base).commandId).toBe(id);expect(()=>parseMatchCommandV1({...base,commandId:`${id}x`,timerId:`${id}x`})).toThrow(/stable id/);});it('accepts objective-scoped sudden timeout and rejects constant scope',()=>{const payload={type:'SUDDEN_DEATH_TIMEOUT',objectiveId:'sd'},id=deriveTimerId(matchId,payload),base={source:'TIMER',commandId:id,timerId:id,matchId,commandSeq:1,receivedAtMs:1,dueAtMs:1,payload};expect(parseMatchCommandV1(base).commandId).toBe(`${matchId}:timer:SUDDEN_DEATH_TIMEOUT:sd`);const wrong=`${matchId}:timer:SUDDEN_DEATH_TIMEOUT:sudden-death`;expect(()=>parseMatchCommandV1({...base,commandId:wrong,timerId:wrong})).toThrow(/stable id/);});const systems=[{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:1,status:'DISCONNECTED'},{type:'CANCEL_NO_CONTEST',incidentId:'incident',reason:'SERVER_OWNERSHIP_LOST'}];it.each(systems)('rejects mismatched SYSTEM id for $type',(payload)=>{const id=deriveSystemCommandId(matchId,payload);const base={source:'SYSTEM',commandId:id,systemCommandId:id,matchId,commandSeq:1,receivedAtMs:1,payload};expect(parseMatchCommandV1(base).commandId).toBe(id);expect(()=>parseMatchCommandV1({...base,commandId:`${id}x`,systemCommandId:`${id}x`})).toThrow(/stable id/);});});

describe('match event payload values',()=>{
 const matchId='00000000-0000-4000-8000-000000000001',requestId='00000000-0000-4000-8000-000000000002';
 const payloads:Record<string,Record<string,unknown>>={ASSET_READY_CHANGED:{playerId:'p1',readyCount:1,countdownEndsAtMs:null},MATCH_STARTED:{startedAtMs:1},FINAL_RUSH_STARTED:{startedAtMs:1},FINAL_CHALLENGE_UNLOCKED:{unlockedAtMs:1,source:'TIME',publicPattern:'___'},HINT_REVEALED:{playerId:'p1',hintIndex:0,publicPattern:'c__'},HINT_CREDIT_CHANGED:{playerId:'p1',delta:-1,absoluteCredits:0},ANSWER_LOCK_CHANGED:{playerId:'p1',answerUntilMs:null,reason:'EXPIRED'},TAP_RESOLVED:{playerId:'p1',requestId,hit:false,objectiveId:null},OBJECTIVE_CLAIMED:{objectiveId:'d1',ownerPlayerId:'p1',kind:'DIFFERENCE'},WORD_HUNT_STARTED:{missionId:'w1',kind:'NORMAL',publicPrompt:'one',startedAtMs:1,endsAtMs:2},WORD_HUNT_WON:{missionId:'w1',playerId:'p1'},WORD_HUNT_ENDED:{missionId:'w1',reason:'TIMEOUT'},SCORE_CHANGED:{playerId:'p1',delta:1,absoluteScore:1},MEANING_QUIZ_STARTED:{playerId:'p1',quizOrdinal:1,endsAtMs:2},SUDDEN_DEATH_STARTED:{objectiveId:'sd',endsAtMs:2},INPUT_CLOSED:{closedAtMs:1,settlementCapAtMs:2},PLAYER_CONNECTION_CHANGED:{playerId:'p1',status:'CONNECTED',disconnectEpoch:1,forfeitAtMs:null},MATCH_FINISHED:{winnerPlayerId:null,endReason:'DRAW'}};
 const event=(type:string,payload:Record<string,unknown>)=>({eventId:`${matchId}:1`,matchId,eventSeq:1,causedByCommandSeq:1,stateRevision:1,occurredAtMs:0,phase:'PLAYING',type,payload});
 it.each(Object.entries(payloads))('accepts %s payload and rejects an invalid value', (type,payload)=>{expect(parseMatchEventV1(event(type,payload)).type).toBe(type);const key=Object.keys(payload)[0]!;expect(()=>parseMatchEventV1(event(type,{...payload,[key]:{private:true}}))).toThrow(/values/);});
 it('rejects private fields even on an otherwise valid branch',()=>expect(()=>parseMatchEventV1(event('TAP_RESOLVED',{...payloads.TAP_RESOLVED!,privateSolution:{}}))).toThrow(/branch/));
 it('keeps domain hint-event Unicode and discriminated-field rules aligned with the wire',()=>{
  const base={playerId:'p1',requestId,ordinal:1,kind:'VISUAL_REGION',localizedText:'😀'.repeat(512),publicPattern:'___',publicRegion:{kind:'REGION',imageSide:'A',region:'TOP_LEFT'},rankedPenaltyUnits:0,cumulativeRankedPenaltyUnits:0,coachChargesRemaining:2};
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',base))).not.toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,publicPattern:'😀'.repeat(64)}))).not.toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,publicPattern:'😀'.repeat(65)}))).toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,coachChargesRemaining:null}))).toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,rankedPenaltyUnits:1,cumulativeRankedPenaltyUnits:1,coachChargesRemaining:null}))).not.toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,rankedPenaltyUnits:1,cumulativeRankedPenaltyUnits:1,coachChargesRemaining:2}))).toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,localizedText:'😀'.repeat(513)}))).toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,kind:'DEFINITION'}))).toThrow();
  expect(()=>parseMatchEventV1(event('HINT_STEP_REVEALED',{...base,ordinal:5,publicRegion:{kind:'EXACT_CIRCLE',imageSide:'B',centerX:.4,centerY:.5,radius:.1}}))).not.toThrow();
 });
});
