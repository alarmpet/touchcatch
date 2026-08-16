import { describe, expect, it } from 'vitest';
import rules from '../../../config/ruleset.v1.json' with { type: 'json' };
import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import { parseRuleset } from '../../contracts/src/rules.schema.js';
import { parseMatchInitialStateV1, parseMatchStateV1 } from '../../contracts/src/match.schema.js';
import type { MatchStateV1 } from '../../contracts/src/match.js';
import { projectMatchEvent } from '../../contracts/src/projection.js';
import { createMatchInitialState as engineCreateMatchInitialState, reduceMatch } from './reducer.js';
import { replayMatch } from './replay.js';
import { drainDueTimers, reduceAfterDrainingDueTimers } from './scheduler.js';
import { privateSolutionFixture as solution } from './testing-fixtures.js';
const frozenRules = parseRuleset(rules);
const createMatchInitialState=(input:Omit<Parameters<typeof engineCreateMatchInitialState>[0],'contentManifest'>&{contentManifest:Omit<Parameters<typeof engineCreateMatchInitialState>[0]['contentManifest'],'contentLanguage'>},sharedRules:Parameters<typeof engineCreateMatchInitialState>[1])=>engineCreateMatchInitialState({...input,contentManifest:{...input.contentManifest,contentLanguage:'en'}},sharedRules);

function startedState(learningHintPlayers?:Parameters<typeof engineCreateMatchInitialState>[0]['learningHintPlayers']){
 const matchId='00000000-0000-4000-8000-000000000001';const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});
 let state:MatchStateV1=createMatchInitialState({matchId,createdAtMs:0,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:16000,endsAfterMs:21000},{kind:'NORMAL',missionId:'w2',startsAfterMs:34000,endsAfterMs:39000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'},...(learningHintPlayers===undefined?{}:{learningHintPlayers})},frozenRules).state;
 const ready={type:'READY' as const,contentRevisionId:solution.contentRevisionId,contentHash:'d'.repeat(64),assetHashes:['a'.repeat(64),'c'.repeat(64)],decodedDimensions:[{assetHash:'a'.repeat(64),width:1,height:1},{assetHash:'c'.repeat(64),width:1,height:1}]};
 for(const [i,playerId] of ['p1','p2'].entries()){const requestId=`00000000-0000-4000-8000-00000000000${i+1}`;state=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:${playerId}:${requestId}`,matchId,commandSeq:i+1,receivedAtMs:1000,requestId,playerId,expectedRevision:0,payload:ready},frozenRules).state;}
 const id=`${matchId}:timer:START_MATCH:countdown`;return reduceMatch(state,{source:'TIMER',commandId:id,timerId:id,matchId,commandSeq:3,receivedAtMs:4000,dueAtMs:4000,payload:{type:'START_MATCH'}},frozenRules);
}
const playerTap=(state:MatchStateV1,seq:number,at:number,x:number,y:number,imageSide:'A'|'B'='A')=>{const requestId=`00000000-0000-4000-8000-${String(900+seq).padStart(12,'0')}`;return {source:'PLAYER' as const,commandId:`${state.matchId}:player:p1:${requestId}`,matchId:state.matchId,commandSeq:seq,receivedAtMs:at,requestId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'TAP_IMAGE' as const,imageSide,x,y}};};

it('renders separators immediately and never schedules or charges them as hints',()=>{
  let state=startedState().state;
  const {privateSolutionHash:_,...body}=structuredClone(solution);
  body.finalChallenge.canonicalAnswer='ice cream!';
  body.finalChallenge.aliases=[];
  body.finalChallenge.hintUnits=['i','c','e',' ','c','r','e','a','m','!'];
  state.privateSolution={...body,privateSolutionHash:canonicalJsonSha256(body)};
  state.randomSchedule={...state.randomSchedule,hintRevealOrder:[0,1,2,4,5,6,7,8]};

  const unlockId=`${state.matchId}:timer:UNLOCK_FINAL_CHALLENGE:final`;
  const unlocked=reduceMatch(state,{source:'TIMER',commandId:unlockId,timerId:unlockId,matchId:state.matchId,commandSeq:40,receivedAtMs:16000,dueAtMs:16000,payload:{type:'UNLOCK_FINAL_CHALLENGE'}},frozenRules);
  expect(unlocked.state.players[0].publicPattern).toBe('___ _____!');

  state=structuredClone(unlocked.state);
  state.players[0].hintCredits=1;
  const requestId='00000000-0000-4000-8000-000000000777';
  const revealed=reduceMatch(state,{source:'PLAYER',commandId:`${state.matchId}:player:p1:${requestId}`,matchId:state.matchId,commandSeq:41,receivedAtMs:16001,requestId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'USE_HINT'}},frozenRules);
  expect(revealed.state.players[0]).toMatchObject({
    hintCredits:0,
    revealedHintIndexes:[0],
    publicPattern:'i__ _____!',
  });
  expect(revealed.state.randomSchedule.hintRevealOrder).not.toContain(3);
  expect(revealed.state.randomSchedule.hintRevealOrder).not.toContain(9);

  const invalid=structuredClone(state);
  invalid.randomSchedule.hintRevealOrder=[0,1,2,3,4,5,6,7,8];
  expect(()=>parseMatchStateV1(invalid)).toThrow(/hint order/);
});

describe('authoritative learning hint revelation', () => {
  const ladder = [1, 2, 3, 4, 5].map((ordinal) => ({
    ordinal: ordinal as 1 | 2 | 3 | 4 | 5,
    kind: ordinal === 1 ? 'DEFINITION' as const : 'REVEAL_GRAPHEME' as const,
    localizedText: { ko: `현재 힌트 ${ordinal}`, en: `Current hint ${ordinal}` },
    revealIndexes: ordinal >= 4 ? [ordinal - 4] : [],
    rankedPenaltyUnits: 1 as const,
  }));

  function learningState(
    mode: 'CASUAL' | 'RANKED',
    coachChargesRemaining = mode === 'CASUAL' ? 3 : 0,
  ) {
    const state = startedState().state;
    const { privateSolutionHash: _, ...body } = structuredClone(state.privateSolution);
    body.finalChallenge.hintLadder = structuredClone(ladder);
    state.privateSolution = {
      ...body,
      privateSolutionHash: canonicalJsonSha256(body),
    };
    state.finalChallenge = { unlockedAtMs: state.startedAtMs, unlockSource: 'TIME' };
    Object.assign(state.players[0]!, {
      learningHints: {
        mode,
        selectedPet: {
          rarity: 'LEGENDARY',
          level: 99,
          coachArchetype: 'LINGUIST',
        },
        coachChargesRemaining,
        revealedOrdinals: [],
        cumulativeRankedPenaltyUnits: 0,
        processedRequestIds: [],
      },
    });
    return state;
  }

  function command(
    state: MatchStateV1,
    requestId: string,
    expectedOrdinal: number,
    commandSeq = 50,
    expectedRevision = state.stateRevision,
  ) {
    return {
      source: 'PLAYER' as const,
      commandId: `${state.matchId}:player:p1:${requestId}`,
      matchId: state.matchId,
      commandSeq,
      receivedAtMs: 5_000,
      requestId,
      playerId: 'p1',
      expectedRevision,
      payload: { type: 'USE_LEARNING_HINT' as const, expectedOrdinal },
    };
  }

  it.each([
    ['hole', [1,3], 1, ['00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102']],
    ['reorder', [2,1], 1, ['00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102']],
    ['receipt drift', [1], 2, []],
    ['forged casual charges', [1], 3, ['00000000-0000-4000-8000-000000000101']],
  ])('rejects persisted learning hint invariant drift: %s',(_case,revealedOrdinals,coachChargesRemaining,processedRequestIds)=>{
    const state=learningState('CASUAL');
    Object.assign(state.players[0]!.learningHints!,{revealedOrdinals,coachChargesRemaining,processedRequestIds});
    expect(()=>parseMatchStateV1(state)).toThrow(/learning hint/);
  });

  it('rejects forged ranked cumulative units',()=>{
    const state=learningState('RANKED');
    Object.assign(state.players[0]!.learningHints!,{
      revealedOrdinals:[1],
      cumulativeRankedPenaltyUnits:9,
      processedRequestIds:['00000000-0000-4000-8000-000000000101'],
    });
    expect(()=>parseMatchStateV1(state)).toThrow(/learning hint/);
  });

  it('pins server-selected casual and ranked hint contexts in initial player state', () => {
    const state = startedState([
      {
        mode: 'CASUAL',
        selectedPet: { rarity: 'COMMON', level: 7, coachArchetype: 'SCOUT' },
      },
      {
        mode: 'RANKED',
        selectedPet: { rarity: 'LEGENDARY', level: 99, coachArchetype: 'SAGE' },
      },
    ]).state;

    expect(state.players[0].learningHints).toMatchObject({
      mode: 'CASUAL',
      coachChargesRemaining: 3,
      revealedOrdinals: [],
      cumulativeRankedPenaltyUnits: 0,
      processedRequestIds: [],
    });
    expect(state.players[1].learningHints).toMatchObject({
      mode: 'RANKED',
      coachChargesRemaining: 0,
      revealedOrdinals: [],
      cumulativeRankedPenaltyUnits: 0,
      processedRequestIds: [],
    });
  });

  it('uses the envelope requestId once and reveals the next casual step', () => {
    const state = learningState('CASUAL');
    const requestId = '00000000-0000-4000-8000-000000000501';
    const first = reduceMatch(state, command(state, requestId, 1), frozenRules);

    expect(first.decision).toEqual({ status: 'APPLIED' });
    expect(first.state.players[0]).toMatchObject({
      learningHints: {
        coachChargesRemaining: 2,
        revealedOrdinals: [1],
        cumulativeRankedPenaltyUnits: 0,
        processedRequestIds: [requestId],
      },
    });
    expect(first.events).toHaveLength(1);
    expect(first.events[0]).toMatchObject({
      type: 'HINT_STEP_REVEALED',
      payload: {
        playerId: 'p1',
        requestId,
        ordinal: 1,
        localizedText: 'Current hint 1',
        publicPattern: '___',
        publicRegion: null,
        cumulativeRankedPenaltyUnits: 0,
        coachChargesRemaining: 2,
      },
    });

    const replay = reduceMatch(
      first.state,
      command(first.state, requestId, 1, 51),
      frozenRules,
    );
    expect(replay.decision).toEqual({ status: 'APPLIED' });
    expect(replay.events).toEqual([]);
    expect(replay.state).toEqual(first.state);
  });

  it('keeps casual revelation available at zero charges without going negative', () => {
    const state = learningState('CASUAL', 0);
    Object.assign(state.players[0]!.learningHints!, {
      revealedOrdinals: [1, 2, 3],
      processedRequestIds: [
        '00000000-0000-4000-8000-000000000520',
        '00000000-0000-4000-8000-000000000521',
        '00000000-0000-4000-8000-000000000522',
      ],
    });
    const result = reduceMatch(
      state,
      command(state, '00000000-0000-4000-8000-000000000502', 4),
      frozenRules,
    );

    expect(result.decision).toEqual({ status: 'APPLIED' });
    expect((result.state.players[0] as any).learningHints.coachChargesRemaining).toBe(0);
    expect(result.events[0]?.payload).toMatchObject({ coachChargesRemaining: 0 });
  });

  it('rejects a different stale request while replaying the applied request deterministically', () => {
    const state = learningState('RANKED');
    const firstId = '00000000-0000-4000-8000-000000000503';
    const first = reduceMatch(state, command(state, firstId, 1), frozenRules);
    const stale = reduceMatch(
      first.state,
      command(first.state, '00000000-0000-4000-8000-000000000504', 1, 51),
      frozenRules,
    );

    expect(stale.decision).toEqual({
      status: 'REJECTED',
      reason: 'HINT_ORDINAL_CONFLICT',
    });
    expect(stale.events).toEqual([]);
    expect(stale.state).toEqual(first.state);
  });

  it('lets only one command from the same snapshot win and retries a five-step receipt after terminal as a no-op',()=>{
    let state=learningState('RANKED');
    const originalRevision=state.stateRevision;
    const firstId='00000000-0000-4000-8000-000000000530';
    const first=reduceMatch(state,command(state,firstId,1,50,originalRevision),frozenRules);
    const concurrent=reduceMatch(first.state,command(first.state,'00000000-0000-4000-8000-000000000531',1,51,originalRevision),frozenRules);
    expect(first.decision.status).toBe('APPLIED');
    expect(concurrent.decision).toEqual({status:'REJECTED',reason:'HINT_ORDINAL_CONFLICT'});
    state=first.state;
    for(let ordinal=2;ordinal<=5;ordinal++){
      const id=`00000000-0000-4000-8000-${String(530+ordinal-1).padStart(12,'0')}`;
      state=reduceMatch(state,command(state,id,ordinal,49+ordinal),frozenRules).state;
    }
    expect(state.players[0]!.learningHints?.processedRequestIds).toHaveLength(5);
    const terminal=structuredClone(state);terminal.phase='FINISHED';terminal.endReason='DRAW';terminal.winnerPlayerId=null;
    const retry=reduceMatch(terminal,command(terminal,firstId,1,60),frozenRules);
    expect(retry.decision).toEqual({status:'APPLIED'});
    expect(retry.events).toEqual([]);
    expect(retry.state).toEqual(terminal);
  });

  it('derives cumulative ranked penalties from revealed state', () => {
    let state = learningState('RANKED');
    const first = reduceMatch(
      state,
      command(state, '00000000-0000-4000-8000-000000000505', 1),
      frozenRules,
    );
    state = first.state;
    const second = reduceMatch(
      state,
      command(state, '00000000-0000-4000-8000-000000000506', 2, 51),
      frozenRules,
    );

    expect(second.events[0]).toMatchObject({
      type: 'HINT_STEP_REVEALED',
      payload: {
        ordinal: 2,
        cumulativeRankedPenaltyUnits: 2,
      },
    });
    expect((second.state.players[0] as any).learningHints).toMatchObject({
      revealedOrdinals: [1, 2],
      cumulativeRankedPenaltyUnits: 2,
      coachChargesRemaining: 0,
    });
  });

  it('rejects missing and exhausted ladders without emitting an event', () => {
    const missing = learningState('CASUAL');
    delete (missing.privateSolution.finalChallenge as any).hintLadder;
    const { privateSolutionHash: _, ...missingBody } = missing.privateSolution;
    missing.privateSolution = {
      ...missingBody,
      privateSolutionHash: canonicalJsonSha256(missingBody),
    };
    expect(reduceMatch(
      missing,
      command(missing, '00000000-0000-4000-8000-000000000507', 1),
      frozenRules,
    ).decision).toEqual({
      status: 'REJECTED',
      reason: 'INVALID_HINT_LADDER',
    });

    const exhausted = learningState('CASUAL');
    Object.assign((exhausted.players[0] as any).learningHints, {
      coachChargesRemaining: 0,
      revealedOrdinals: [1, 2, 3, 4, 5],
      processedRequestIds: [
        '00000000-0000-4000-8000-000000000510',
        '00000000-0000-4000-8000-000000000511',
        '00000000-0000-4000-8000-000000000512',
        '00000000-0000-4000-8000-000000000513',
        '00000000-0000-4000-8000-000000000514',
      ],
    });
    expect(reduceMatch(
      exhausted,
      command(exhausted, '00000000-0000-4000-8000-000000000515', 6),
      frozenRules,
    ).decision).toEqual({
      status: 'REJECTED',
      reason: 'NO_HINT_REMAINING',
    });
  });

  it('emits no future step, private answer, or raw hitbox material', () => {
    const state = learningState('CASUAL');
    const result = reduceMatch(
      state,
      command(state, '00000000-0000-4000-8000-000000000508', 1),
      frozenRules,
    );
    const serialized = JSON.stringify(result.events);

    expect(serialized).toContain('Current hint 1');
    expect(serialized).not.toContain('Current hint 2');
    expect(serialized).not.toMatch(/canonicalAnswer|privateSolution|hitboxes|imageA|imageB/i);
  });
});

it('accepts optional authored ladder and approved Hanja evidence in match state',()=>{
  const state=startedState().state;
  const {privateSolutionHash:_,...body}=structuredClone(solution);
  Object.assign(body.finalChallenge,{
    hintLadder:[1,2,3,4,5].map((ordinal)=>({
      ordinal:ordinal as 1|2|3|4|5,
      kind:'DEFINITION' as const,
      localizedText:{ko:`?쒖떆 ${ordinal}`,en:`Hint ${ordinal}`},
      revealIndexes:[],
      rankedPenaltyUnits:1 as const,
    })),
    reviewedHanja:'轉禍爲福',
    hanjaReviewStatus:'APPROVED' as const,
  });
  state.privateSolution={...body,privateSolutionHash:canonicalJsonSha256(body)};

  expect(()=>parseMatchStateV1(state)).not.toThrow();
});

it.each([[256,true],[257,true],[512,true],[513,false]])('keeps match hint localized text at the shared-schema %i boundary',(length,accepted)=>{
  const state=startedState().state;
  const {privateSolutionHash:_,...body}=structuredClone(solution);
  (body.finalChallenge as any).hintLadder=[1,2,3,4,5].map(ordinal=>({ordinal:ordinal as 1|2|3|4|5,kind:'DEFINITION' as const,localizedText:{ko:'가'.repeat(length),en:'a'.repeat(length)},revealIndexes:[],rankedPenaltyUnits:1 as const}));
  state.privateSolution={...body,privateSolutionHash:canonicalJsonSha256(body)};
  if(accepted) expect(()=>parseMatchStateV1(state)).not.toThrow(); else expect(()=>parseMatchStateV1(state)).toThrow(/hint step/);
});

it.each([[512,true],[513,false]] as const)('counts %i astral hint characters as code points in active match parsing',(count,accepted)=>{
  const state=startedState().state;
  const {privateSolutionHash:_,...body}=structuredClone(solution);
  (body.finalChallenge as any).hintLadder=[1,2,3,4,5].map(ordinal=>({ordinal,kind:'DEFINITION',localizedText:{ko:'😀'.repeat(count),en:'😀'.repeat(count)},revealIndexes:[],rankedPenaltyUnits:1}));
  state.privateSolution={...body,privateSolutionHash:canonicalJsonSha256(body)};
  if(accepted) expect(()=>parseMatchStateV1(state)).not.toThrow(); else expect(()=>parseMatchStateV1(state)).toThrow(/hint step/);
});

it.each([
  ['ordinal',(s:any):void=>{s[0].ordinal=2;}],
  ['kind',(s:any):void=>{s[0].kind='FORGED';}],
  ['localized keys',(s:any):void=>{s[0].localizedText.ja='x';}],
  ['negative reveal',(s:any):void=>{s[0].revealIndexes=[-1];}],
  ['large reveal',(s:any):void=>{s[0].revealIndexes=[64];}],
  ['duplicate reveal',(s:any):void=>{s[0].revealIndexes=[1,1];}],
  ['penalty',(s:any):void=>{s[0].rankedPenaltyUnits=2;}],
] as const)('rejects HintStep shared-schema constraint: %s',(_label,mutate)=>{
  const state=startedState().state;
  const {privateSolutionHash:_,...body}=structuredClone(solution);
  const steps:any[]=[1,2,3,4,5].map(ordinal=>({ordinal,kind:'DEFINITION',localizedText:{ko:'힌트',en:'Hint'},revealIndexes:[],rankedPenaltyUnits:1}));
  mutate(steps);
  (body.finalChallenge as any).hintLadder=steps;
  state.privateSolution={...body,privateSolutionHash:canonicalJsonSha256(body)};
  expect(()=>parseMatchStateV1(state)).toThrow(/hint step/);
});

function replayFixture(){const matchId='00000000-0000-4000-8000-000000000001';const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});const created=createMatchInitialState({matchId,createdAtMs:0,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:16000,endsAfterMs:21000},{kind:'NORMAL',missionId:'w2',startsAfterMs:34000,endsAfterMs:39000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},frozenRules);return {bundleVersion:1 as const,engineVersion:'1',ruleset:frozenRules,rulesetVersion:'1.0.0' as const,rulesetHash:canonicalJsonSha256(rules),contentRevisionId:solution.contentRevisionId,contentLanguage:'en' as const,contentHash:'d'.repeat(64),initialState:created.state,commands:[]};}

describe('replay acceptance negatives',()=>{
 it('rejects a command sequence gap',()=>{const b=replayFixture();const id='00000000-0000-4000-8000-000000000991';expect(()=>replayMatch({...b,commands:[{source:'PLAYER',commandId:`${b.initialState.matchId}:player:p1:${id}`,matchId:b.initialState.matchId,commandSeq:2,receivedAtMs:1,requestId:id,playerId:'p1',expectedRevision:0,payload:{type:'USE_HINT'}}]})).toThrow(/sequence/);});
 it('rejects decreasing effective time',()=>{const b=replayFixture();const mk=(seq:number,time:number)=>{const id=`00000000-0000-4000-8000-${String(990+seq).padStart(12,'0')}`;return {source:'PLAYER' as const,commandId:`${b.initialState.matchId}:player:p1:${id}`,matchId:b.initialState.matchId,commandSeq:seq,receivedAtMs:time,requestId:id,playerId:'p1',expectedRevision:0,payload:{type:'USE_HINT' as const}};};expect(()=>replayMatch({...b,commands:[mk(1,2),mk(2,1)]})).toThrow(/time decreased/);});
 it('rejects wrapper and rules hash mismatch',()=>{const b=replayFixture();expect(()=>replayMatch({...b,engineVersion:'wrong'})).toThrow(/wrapper/);expect(()=>replayMatch({...b,rulesetHash:'0'.repeat(64)})).toThrow(/hash/);});
 it('rejects a timer without a matching prior intent',()=>{const b=replayFixture();const id=`${b.initialState.matchId}:timer:START_MATCH:countdown`;expect(()=>replayMatch({...b,commands:[{source:'TIMER',commandId:id,timerId:id,matchId:b.initialState.matchId,commandSeq:1,receivedAtMs:1,dueAtMs:1,payload:{type:'START_MATCH'}}]})).toThrow(/prior intent/);});
});

it('replays a full PLAYER SYSTEM TIMER scoring final-package tie terminal run 100 times with separate hashes',()=>{const b=replayFixture(),m=b.initialState.matchId;const ready={type:'READY' as const,contentRevisionId:solution.contentRevisionId,contentHash:'d'.repeat(64),assetHashes:['a'.repeat(64),'c'.repeat(64)],decodedDimensions:[{assetHash:'a'.repeat(64),width:1,height:1},{assetHash:'c'.repeat(64),width:1,height:1}]};const pc=(playerId:string,seq:number,time:number,payload:object)=>{const requestId=`00000000-0000-4000-8000-${String(700+seq).padStart(12,'0')}`;return {source:'PLAYER' as const,commandId:`${m}:player:${playerId}:${requestId}`,matchId:m,commandSeq:seq,receivedAtMs:time,requestId,playerId,expectedRevision:0,payload};};const timer=(type:string,scope:string,seq:number,dueAtMs:number,payload:object)=>({source:'TIMER' as const,commandId:`${m}:timer:${type}:${scope}`,timerId:`${m}:timer:${type}:${scope}`,matchId:m,commandSeq:seq,receivedAtMs:dueAtMs,dueAtMs,payload});const system=(status:'CONNECTED'|'DISCONNECTED',seq:number,time:number)=>({source:'SYSTEM' as const,commandId:`${m}:system:connection:p1:1:${status}`,systemCommandId:`${m}:system:connection:p1:1:${status}`,matchId:m,commandSeq:seq,receivedAtMs:time,payload:{type:'PLAYER_CONNECTION_CHANGED' as const,playerId:'p1',disconnectEpoch:1,status}});const commands=[pc('p1',1,1000,ready),pc('p2',2,1000,ready),timer('START_MATCH','countdown',3,4000,{type:'START_MATCH'}),system('DISCONNECTED',4,4500),system('CONNECTED',5,4600),pc('p1',6,5000,{type:'TAP_IMAGE',imageSide:'A',x:.1,y:.2}),pc('p2',7,6000,{type:'TAP_IMAGE',imageSide:'A',x:.15,y:.2}),pc('p1',8,7000,{type:'USE_HINT'}),timer('UNLOCK_FINAL_CHALLENGE','final',9,16000,{type:'UNLOCK_FINAL_CHALLENGE'}),pc('p1',10,17000,{type:'SUBMIT_FINAL_ANSWER',answer:'cat'}),pc('p2',11,18000,{type:'SUBMIT_FINAL_ANSWER',answer:'kitty'}),pc('p1',12,19000,{type:'SUBMIT_MEANING',optionId:'a'}),pc('p2',13,20000,{type:'SUBMIT_MEANING',optionId:'a'}),timer('CLOSE_INPUT','close',14,79000,{type:'CLOSE_INPUT'}),timer('SUDDEN_DEATH_TIMEOUT','sd',15,89000,{type:'SUDDEN_DEATH_TIMEOUT',objectiveId:'sd'})];const runs=Array.from({length:100},()=>replayMatch({...b,commands}));for(const key of ['decisions','timerIntents','events','state'] as const)expect(new Set(runs.map(x=>canonicalJsonSha256(x[key]))).size,`${key} hash`).toBe(1);const first=runs[0]!;expect(first.state).toMatchObject({phase:'FINISHED',winnerPlayerId:null,endReason:'DRAW'});expect(first.events.some(x=>x.type==='SCORE_CHANGED')).toBe(true);expect(first.events.filter(x=>x.type==='MEANING_QUIZ_STARTED')).toHaveLength(2);expect(first.events.some(x=>x.type==='PLAYER_CONNECTION_CHANGED')).toBe(true);expect(first.decisions.some(x=>x.decision.status==='REJECTED')).toBe(true);});

describe('acceptance matrix boundaries',()=>{
 it('rejects persisted objective/private drift and non-normalized private language data',()=>{const state=startedState().state;const drift=structuredClone(state);drift.objectives[0]!.objectiveId='other';expect(()=>parseMatchStateV1(drift)).toThrow(/bijection/);const language=structuredClone(state);language.privateSolution.finalChallenge.canonicalAnswer='Cat';language.privateSolution.finalChallenge.hintUnits=['C','a','t'];const {privateSolutionHash:_,...hashable}=language.privateSolution;language.privateSolution.privateSolutionHash=canonicalJsonSha256(hashable);expect(()=>parseMatchStateV1(language)).toThrow(/normalization/);});
 it.each(['answer','hitbox','objective'] as const)('rejects tampered private %s with stale or forged hash',(kind)=>{for(const forged of [false,true]){const state=startedState().state;if(kind==='answer')state.privateSolution.finalChallenge.canonicalAnswer='dog';if(kind==='hitbox')state.privateSolution.differences[0]!.hitboxes.imageA.cx=.99;if(kind==='objective')state.privateSolution.differences[0]!.objectiveId='forged-objective';if(forged)state.privateSolution.privateSolutionHash='0'.repeat(64);expect(()=>parseMatchStateV1(state)).toThrow(/private solution hash/);}});
 it('rejects a replay bundle whose private solution was altered after hashing',()=>{const bundle=replayFixture(),initialState=structuredClone(bundle.initialState);initialState.privateSolution.finalChallenge.aliases[0]='forged';expect(()=>replayMatch({...bundle,initialState})).toThrow(/private solution hash/);});
 it('rejects active mission times not pinned to absolute schedule offsets',()=>{const state=startedState().state;state.activeMission={missionId:'w1',kind:'NORMAL',publicPrompt:'one',startedAtMs:20001,endsAtMs:25001};expect(()=>parseMatchStateV1(state)).toThrow(/active mission/);});
 it.each(['duplicate ordinal','past cap','open status mismatch','settled status mismatch'] as const)('rejects meaning quiz invariant: %s',(kind)=>{const state=startedState().state;state.phase='SETTLING';state.players[0].finalAnswerStatus='MEANING_PENDING';state.meaningQuizzes=[{playerId:'p1',quizOrdinal:1,startedAtMs:79000,endsAtMs:84000,submitted:false}];if(kind==='duplicate ordinal')state.meaningQuizzes=[...state.meaningQuizzes,{...state.meaningQuizzes[0]!}];if(kind==='past cap')state.meaningQuizzes[0]!.endsAtMs=84001;if(kind==='open status mismatch')state.players[0].finalAnswerStatus='NOT_SUBMITTED';if(kind==='settled status mismatch'){state.meaningQuizzes[0]!.submitted=true;state.players[0].meaningCorrect=true;}expect(()=>parseMatchStateV1(state)).toThrow(/quiz/);});
 it.each([{label:'boundary',x:.11,hit:true},{label:'inside',x:.109,hit:true},{label:'outside',x:.110001,hit:false}])('difference hitbox $label',({x,hit})=>{const state=startedState().state;const r=reduceMatch(state,playerTap(state,10,5000,x,.2),frozenRules);expect(r.events.find(e=>e.type==='TAP_RESOLVED')?.payload.hit).toBe(hit);});
 it.each([{label:'boundary',x:.22,hit:true},{label:'inside',x:.219,hit:true},{label:'outside',x:.220001,hit:false}])('active-word hitbox $label',({x,hit})=>{const state=startedState().state;state.activeMission={missionId:'w1',kind:'NORMAL',publicPrompt:'one',startedAtMs:20000,endsAtMs:25000};const r=reduceMatch(state,playerTap(state,10,21200,x,.8),frozenRules);expect(r.events.find(e=>e.type==='TAP_RESOLVED')?.payload.hit).toBe(hit);});
 it.each([{label:'inside',x:.919,hit:true},{label:'outside',x:.920001,hit:false}])('sudden-death hitbox $label',({x,hit})=>{const state=startedState().state;state.phase='SUDDEN_DEATH';state.suddenDeath={objectiveId:'sd',endsAtMs:10000};const r=reduceMatch(state,playerTap(state,10,5000,x,.9),frozenRules);expect(r.events.find(e=>e.type==='TAP_RESOLVED')?.payload.hit).toBe(hit);if(hit)expect(r.state.endReason).toBe('SUDDEN_DEATH');});
 it('sudden-death hitbox includes a mathematically exact boundary point',()=>{const state=startedState().state;state.phase='SUDDEN_DEATH';state.suddenDeath={objectiveId:'sd',endsAtMs:10000};state.privateSolution.suddenDeath.hitboxes.imageA={cx:.5,cy:.5,r:.25};const {privateSolutionHash:_,...hashable}=state.privateSolution;state.privateSolution.privateSolutionHash=canonicalJsonSha256(hashable);const r=reduceMatch(state,playerTap(state,10,5000,.75,.5),frozenRules);expect(r.events.find(e=>e.type==='TAP_RESOLVED')?.payload.hit).toBe(true);expect(r.state.endReason).toBe('SUDDEN_DEATH');});
 it('sudden-death timeout finishes as DRAW',()=>{const state=startedState().state;state.phase='SUDDEN_DEATH';state.suddenDeath={objectiveId:'sd',endsAtMs:10000};const id=`${state.matchId}:timer:SUDDEN_DEATH_TIMEOUT:sd`;expect(reduceMatch(state,{source:'TIMER',commandId:id,timerId:id,matchId:state.matchId,commandSeq:10,receivedAtMs:10000,dueAtMs:10000,payload:{type:'SUDDEN_DEATH_TIMEOUT',objectiveId:'sd'}},frozenRules).state).toMatchObject({phase:'FINISHED',winnerPlayerId:null,endReason:'DRAW'});});
 it('active mission uses the exact absolute scheduled start and end',()=>{const start=startedState();const intent=start.timerIntents.find((i):i is Extract<typeof i,{kind:'SCHEDULE'}>=>i.kind==='SCHEDULE'&&i.payload.type==='START_WORD_HUNT'&&i.payload.missionId==='w1')!;const r=reduceMatch(start.state,{source:'TIMER',commandId:intent.timerId,timerId:intent.timerId,matchId:start.state.matchId,commandSeq:10,receivedAtMs:intent.dueAtMs,dueAtMs:intent.dueAtMs,payload:intent.payload},frozenRules);expect(r.state.activeMission).toEqual({missionId:'w1',kind:'NORMAL',publicPrompt:'one',startedAtMs:20000,endsAtMs:25000});});
 it('drains close-input before a player command at exactly 75 seconds',()=>{const start=startedState();const r=reduceAfterDrainingDueTimers(start.state,start.timerIntents,playerTap(start.state,4,79000,.1,.2),frozenRules);expect(r.drained.results.flatMap(x=>x.events).map(x=>x.type)).toContain('INPUT_CLOSED');expect(r.drained.state.phase).toBe('SUDDEN_DEATH');expect(r.commandResult.events.find(e=>e.type==='TAP_RESOLVED')?.payload).toMatchObject({hit:false,objectiveId:null});});
 it('drains disconnect forfeit before reconnect at the exact deadline',()=>{const state=startedState().state;const disconnectId=`${state.matchId}:system:connection:p1:1:DISCONNECTED`;const disconnected=reduceMatch(state,{source:'SYSTEM',commandId:disconnectId,systemCommandId:disconnectId,matchId:state.matchId,commandSeq:4,receivedAtMs:10000,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:1,status:'DISCONNECTED'}},frozenRules);const reconnectId=`${state.matchId}:system:connection:p1:1:CONNECTED`;const r=reduceAfterDrainingDueTimers(disconnected.state,disconnected.timerIntents,{source:'SYSTEM',commandId:reconnectId,systemCommandId:reconnectId,matchId:state.matchId,commandSeq:5,receivedAtMs:25000,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:1,status:'CONNECTED'}},frozenRules);expect(r.drained.state).toMatchObject({phase:'FINISHED',winnerPlayerId:'p2',endReason:'FORFEIT'});expect(r.commandResult.decision).toEqual({status:'REJECTED',reason:'MATCH_INPUT_CLOSED'});});
 it('no-contest closes the match and makes a same-time reconnect obsolete',()=>{const state=startedState().state;const cancelId=`${state.matchId}:system:no-contest:incident`;const cancelled=reduceMatch(state,{source:'SYSTEM',commandId:cancelId,systemCommandId:cancelId,matchId:state.matchId,commandSeq:4,receivedAtMs:10000,payload:{type:'CANCEL_NO_CONTEST',incidentId:'incident',reason:'SERVER_OWNERSHIP_LOST'}},frozenRules);expect(cancelled.state).toMatchObject({phase:'CANCELLED',winnerPlayerId:null,endReason:'NO_CONTEST'});expect(reduceMatch(cancelled.state,{source:'SYSTEM',commandId:`${state.matchId}:system:connection:p1:0:CONNECTED`,systemCommandId:`${state.matchId}:system:connection:p1:0:CONNECTED`,matchId:state.matchId,commandSeq:5,receivedAtMs:10000,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:0,status:'CONNECTED'}},frozenRules).decision).toEqual({status:'REJECTED',reason:'MATCH_INPUT_CLOSED'});});
 it('drains settlement-cap meaning timeout before a same-time meaning command',()=>{const state=startedState().state;state.phase='SETTLING';state.players[0].score=75;state.players[0].finalAnswerStatus='MEANING_PENDING';state.meaningQuizzes=[{playerId:'p1',quizOrdinal:1,startedAtMs:78999,endsAtMs:84000,submitted:false}];const timerId=`${state.matchId}:timer:MEANING_TIMEOUT:p1:1`;const requestId='00000000-0000-4000-8000-000000000980';const r=reduceAfterDrainingDueTimers(state,[{kind:'SCHEDULE',timerId,dueAtMs:84000,payload:{type:'MEANING_TIMEOUT',playerId:'p1',quizOrdinal:1}}],{source:'PLAYER',commandId:`${state.matchId}:player:p1:${requestId}`,matchId:state.matchId,commandSeq:10,receivedAtMs:84000,requestId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_MEANING',optionId:'a'}},frozenRules);expect(r.drained.state).toMatchObject({phase:'FINISHED',winnerPlayerId:'p1',endReason:'SCORE_TARGET'});expect(r.commandResult.decision).toEqual({status:'REJECTED',reason:'MATCH_INPUT_CLOSED'});});
 it('tie-break short-circuits on score despite conflicting later criteria',()=>{const state=startedState().state;state.players[0].score=1;state.players[0].wrongFinalAttempts=9;state.objectives.find(o=>o.objectiveId==='d7')!.ownerPlayerId='p2';const id=`${state.matchId}:timer:CLOSE_INPUT:close`;const r=reduceMatch(state,{source:'TIMER',commandId:id,timerId:id,matchId:state.matchId,commandSeq:10,receivedAtMs:79000,dueAtMs:79000,payload:{type:'CLOSE_INPUT'}},frozenRules);expect(r.state).toMatchObject({phase:'FINISHED',winnerPlayerId:'p1',endReason:'TIMEOUT_TIEBREAK'});});
 it('fully tied close schedules the exact sudden-death timeout intent',()=>{const state=startedState().state;const id=`${state.matchId}:timer:CLOSE_INPUT:close`;const r=reduceMatch(state,{source:'TIMER',commandId:id,timerId:id,matchId:state.matchId,commandSeq:10,receivedAtMs:79000,dueAtMs:79000,payload:{type:'CLOSE_INPUT'}},frozenRules);expect(r.state.phase).toBe('SUDDEN_DEATH');expect(r.timerIntents).toEqual([{kind:'SCHEDULE',timerId:`${state.matchId}:timer:SUDDEN_DEATH_TIMEOUT:sd`,dueAtMs:89000,payload:{type:'SUDDEN_DEATH_TIMEOUT',objectiveId:'sd'}}]);});
 it.each([{label:'correct meaning',kind:'submit',optionId:'a',score:115},{label:'wrong meaning',kind:'submit',optionId:'b',score:100},{label:'meaning timeout',kind:'timeout',score:100}] as const)('atomically awards final package from score 75 for $label and selects winner',({kind,optionId,score})=>{const state=startedState().state;state.phase='SETTLING';state.players[0].score=75;state.players[0].finalAnswerStatus='MEANING_PENDING';state.meaningQuizzes=[{playerId:'p1',quizOrdinal:1,startedAtMs:79000,endsAtMs:84000,submitted:false}];let r;if(kind==='submit'){const requestId='00000000-0000-4000-8000-000000000981';r=reduceMatch(state,{source:'PLAYER',commandId:`${state.matchId}:player:p1:${requestId}`,matchId:state.matchId,commandSeq:10,receivedAtMs:83999,requestId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_MEANING',optionId}},frozenRules);}else{const id=`${state.matchId}:timer:MEANING_TIMEOUT:p1:1`;r=reduceMatch(state,{source:'TIMER',commandId:id,timerId:id,matchId:state.matchId,commandSeq:10,receivedAtMs:84000,dueAtMs:84000,payload:{type:'MEANING_TIMEOUT',playerId:'p1',quizOrdinal:1}},frozenRules);}expect(r.state.players[0].score).toBe(score);expect(r.state).toMatchObject({phase:'FINISHED',winnerPlayerId:'p1',endReason:'SCORE_TARGET'});expect(new Set(r.events.map(e=>e.stateRevision))).toEqual(new Set([state.stateRevision+1]));});
});

describe('createMatchInitialState',()=>it('pins immutable inputs and schedules exactly one asset deadline',()=>{
  const matchId='00000000-0000-4000-8000-000000000001';
  const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});
  const result=createMatchInitialState({matchId,createdAtMs:1000,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:16000,endsAfterMs:21000},{kind:'NORMAL',missionId:'w2',startsAfterMs:34000,endsAfterMs:39000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},frozenRules);
  expect(result.state.stateRevision).toBe(0);
  expect(result.state.nextEventSeq).toBe(1);
  expect(result.timerIntents).toEqual([{kind:'SCHEDULE',timerId:`${matchId}:timer:ASSET_LOAD_TIMEOUT:asset`,dueAtMs:21000,payload:{type:'ASSET_LOAD_TIMEOUT'}}]);
  expect(()=>parseMatchInitialStateV1({...result.state,players:[{...result.state.players[0],unexpected:true},result.state.players[1]]})).toThrow(/player strict/);
  expect(()=>parseMatchInitialStateV1({...result.state,privateSolution:{...result.state.privateSolution,unexpected:true}})).toThrow(/private solution strict/);
  const bundle={bundleVersion:1 as const,engineVersion:'1',ruleset:frozenRules,rulesetVersion:'1.0.0' as const,rulesetHash:canonicalJsonSha256(rules),contentRevisionId:solution.contentRevisionId,contentLanguage:'en' as const,contentHash:'d'.repeat(64),initialState:result.state,commands:[]};
  expect(new Set(Array.from({length:100},()=>canonicalJsonSha256(replayMatch(bundle)))).size).toBe(1);
  const ready={type:'READY' as const,contentRevisionId:solution.contentRevisionId,contentHash:'d'.repeat(64),assetHashes:['a'.repeat(64),'c'.repeat(64)],decodedDimensions:[{assetHash:'a'.repeat(64),width:1,height:1},{assetHash:'c'.repeat(64),width:1,height:1}]};
  const request1='00000000-0000-4000-8000-000000000101',request2='00000000-0000-4000-8000-000000000102';
  const mixed={...bundle,commands:[
    {source:'PLAYER' as const,commandId:`${matchId}:player:p1:${request1}`,matchId,commandSeq:1,receivedAtMs:1,requestId:request1,playerId:'p1',expectedRevision:0,payload:ready},
    {source:'SYSTEM' as const,commandId:`${matchId}:system:connection:p1:1:DISCONNECTED`,systemCommandId:`${matchId}:system:connection:p1:1:DISCONNECTED`,matchId,commandSeq:2,receivedAtMs:2,payload:{type:'PLAYER_CONNECTION_CHANGED' as const,playerId:'p1',disconnectEpoch:1,status:'DISCONNECTED' as const}},
    {source:'SYSTEM' as const,commandId:`${matchId}:system:connection:p1:1:CONNECTED`,systemCommandId:`${matchId}:system:connection:p1:1:CONNECTED`,matchId,commandSeq:3,receivedAtMs:3,payload:{type:'PLAYER_CONNECTION_CHANGED' as const,playerId:'p1',disconnectEpoch:1,status:'CONNECTED' as const}},
    {source:'PLAYER' as const,commandId:`${matchId}:player:p2:${request2}`,matchId,commandSeq:4,receivedAtMs:4,requestId:request2,playerId:'p2',expectedRevision:0,payload:ready},
    {source:'TIMER' as const,commandId:`${matchId}:timer:START_MATCH:countdown`,timerId:`${matchId}:timer:START_MATCH:countdown`,matchId,commandSeq:5,receivedAtMs:3004,dueAtMs:3004,payload:{type:'START_MATCH' as const}},
  ]};
  const runs=Array.from({length:100},()=>replayMatch(mixed));
  for(const key of ['decisions','timerIntents','events','state'] as const)expect(new Set(runs.map(run=>canonicalJsonSha256(run[key]))).size,`${key} hash`).toBe(1);
}));

it('applies both READY commands from revision zero and starts a deterministic countdown',()=>{
  const matchId='00000000-0000-4000-8000-000000000001'; const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});
  let state:MatchStateV1=createMatchInitialState({matchId,createdAtMs:0,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:16000,endsAfterMs:21000},{kind:'NORMAL',missionId:'w2',startsAfterMs:34000,endsAfterMs:39000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},frozenRules).state;
  const payload={type:'READY' as const,contentRevisionId:solution.contentRevisionId,contentHash:'d'.repeat(64),assetHashes:['c'.repeat(64),'a'.repeat(64)],decodedDimensions:[{assetHash:'a'.repeat(64),width:1,height:1},{assetHash:'c'.repeat(64),width:1,height:1}]};
  const cmd=(playerId:string,seq:number)=>({source:'PLAYER' as const,commandId:`${matchId}:player:${playerId}:00000000-0000-4000-8000-00000000000${seq}`,matchId,commandSeq:seq,receivedAtMs:1000,requestId:`00000000-0000-4000-8000-00000000000${seq}`,playerId,expectedRevision:0,payload});
  let r=reduceMatch(state,cmd('p1',1),frozenRules); expect(r.events[0]?.stateRevision).toBe(1); state=r.state;
  r=reduceMatch(state,cmd('p2',2),frozenRules); expect(r.state.phase).toBe('COUNTDOWN');expect(r.decision).toEqual({status:'APPLIED'});expect(r.timerIntents).toContainEqual({kind:'CANCEL',timerId:`${matchId}:timer:ASSET_LOAD_TIMEOUT:asset`});expect(r.events[0]?.eventSeq).toBe(2);const drained=drainDueTimers(r.state,r.timerIntents,64000,3,frozenRules);expect(drained.state.phase).toBe('FINAL_RUSH');expect(drained.results.flatMap(x=>x.events).find(e=>e.type==='MATCH_STARTED')?.occurredAtMs).toBe(4000);expect(drained.results.flatMap(x=>x.events).filter(e=>e.occurredAtMs===64000).map(e=>e.type).slice(0,2)).toEqual(['FINAL_RUSH_STARTED','WORD_HUNT_STARTED']);
  state=r.state;const startId=`${matchId}:timer:START_MATCH:countdown`;r=reduceMatch(state,{source:'TIMER',commandId:startId,timerId:startId,matchId,commandSeq:3,receivedAtMs:4000,dueAtMs:4000,payload:{type:'START_MATCH'}},frozenRules);expect(r.state.phase).toBe('PLAYING');expect(r.timerIntents).toHaveLength(9);state=r.state;
  const exactRushRequest='00000000-0000-4000-8000-000000000900';const exactRush=reduceAfterDrainingDueTimers(state,r.timerIntents,{source:'PLAYER',commandId:`${matchId}:player:p1:${exactRushRequest}`,matchId,commandSeq:4,receivedAtMs:64000,requestId:exactRushRequest,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'TAP_IMAGE',imageSide:'A',x:.1,y:.2}},frozenRules);expect(exactRush.drained.results.flatMap(x=>x.events).map(x=>x.type)).toContain('FINAL_RUSH_STARTED');expect(exactRush.drained.state.phase).toBe('FINAL_RUSH');expect(exactRush.commandResult.decision).toEqual({status:'REJECTED',reason:'INPUT_LOCKED'});expect(exactRush.drained.nextCommandSeq).toBeGreaterThan(4);
  const closeForTie=(candidate:MatchStateV1)=>reduceMatch(candidate,{source:'TIMER',commandId:`${matchId}:timer:CLOSE_INPUT:close`,timerId:`${matchId}:timer:CLOSE_INPUT:close`,matchId,commandSeq:90,receivedAtMs:79000,dueAtMs:79000,payload:{type:'CLOSE_INPUT'}},frozenRules).state;
  let claims=structuredClone(state);const claimDecisions=[];const claimEvents=[];for(let i=0;i<100;i++){const requestId=`00000000-0000-4000-8000-${String(200+i).padStart(12,'0')}`;const result=reduceMatch(claims,{source:'PLAYER',commandId:`${matchId}:player:p1:${requestId}`,matchId,commandSeq:200+i,receivedAtMs:5000,requestId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'TAP_IMAGE',imageSide:'A',x:.1,y:.2}},frozenRules);claimDecisions.push(result.decision);claimEvents.push(...result.events);claims=result.state;}expect(claimDecisions.filter(d=>d.status==='APPLIED')).toHaveLength(1);expect(claimDecisions.filter(d=>d.status==='REJECTED'&&d.reason==='ALREADY_CLAIMED')).toHaveLength(99);const projectedClaims=claimEvents.map(event=>projectMatchEvent(event,claims,'public'));expect(projectedClaims.filter(event=>event.type==='difference_claimed')).toHaveLength(1);expect(projectedClaims.find(event=>event.type==='difference_claimed')).toMatchObject({payload:{objectiveId:'d0',ownerPlayerId:'p1',displayCircles:solution.differences.find(d=>d.objectiveId==='d0')!.hitboxes}});expect(claimEvents.filter(event=>event.type==='TAP_RESOLVED')).toHaveLength(1);const staleDifferent='00000000-0000-4000-8000-000000000399';expect(reduceMatch(claims,{source:'PLAYER',commandId:`${matchId}:player:p2:${staleDifferent}`,matchId,commandSeq:300,receivedAtMs:6000,requestId:staleDifferent,playerId:'p2',expectedRevision:state.stateRevision,payload:{type:'TAP_IMAGE',imageSide:'A',x:.15,y:.2}},frozenRules).decision.status).toBe('APPLIED');
  const reveal=structuredClone(state);reveal.activeMission={missionId:'w1',kind:'NORMAL',publicPrompt:'one',startedAtMs:20000,endsAtMs:25000};reveal.finalChallenge={unlockedAtMs:4000,unlockSource:'TIME'};reveal.players[0].hintCredits=1;const revealCommand=(requestId:string,payload:{type:'TAP_IMAGE';imageSide:'A';x:number;y:number}|{type:'USE_HINT'}|{type:'SUBMIT_FINAL_ANSWER';answer:string},receivedAtMs:number)=>reduceMatch(reveal,{source:'PLAYER',commandId:`${matchId}:player:p1:${requestId}`,matchId,commandSeq:400,receivedAtMs,requestId,playerId:'p1',expectedRevision:reveal.stateRevision,payload},frozenRules);expect(revealCommand('00000000-0000-4000-8000-000000000401',{type:'TAP_IMAGE',imageSide:'A',x:.2,y:.8},21199).decision).toEqual({status:'REJECTED',reason:'INPUT_LOCKED'});expect(revealCommand('00000000-0000-4000-8000-000000000402',{type:'USE_HINT'},21199).decision.status).toBe('REJECTED');expect(revealCommand('00000000-0000-4000-8000-000000000403',{type:'SUBMIT_FINAL_ANSWER',answer:'Cat'},21199).decision.status).toBe('REJECTED');expect(revealCommand('00000000-0000-4000-8000-000000000404',{type:'TAP_IMAGE',imageSide:'A',x:.2,y:.8},21200).decision.status).toBe('APPLIED');
  for(const criterion of ['SCORE','FINAL','HARD','ERRORS','EQUAL'] as const){const candidate=structuredClone(state);if(criterion==='SCORE')candidate.players[0].score=1;if(criterion==='FINAL'){candidate.players[0].meaningCorrect=true;candidate.players[1].meaningCorrect=false;candidate.players[0].finalAnswerStatus='SETTLED';candidate.players[1].finalAnswerStatus='SETTLED';candidate.meaningQuizzes=[{playerId:'p1',quizOrdinal:1,startedAtMs:70000,endsAtMs:75000,submitted:true},{playerId:'p2',quizOrdinal:1,startedAtMs:70000,endsAtMs:75000,submitted:true}];}if(criterion==='HARD')candidate.objectives.find(o=>o.objectiveId==='d7')!.ownerPlayerId='p1';if(criterion==='ERRORS')candidate.players[1].wrongFinalAttempts=1;const resolved=closeForTie(candidate);expect(resolved.phase,criterion).toBe(criterion==='EQUAL'?'SUDDEN_DEATH':'FINISHED');if(criterion!=='EQUAL')expect(resolved.winnerPlayerId,criterion).toBe('p1');}
  let connectionState=structuredClone(state);const disconnectId=`${matchId}:system:connection:p1:1:DISCONNECTED`;let connectionResult=reduceMatch(connectionState,{source:'SYSTEM',commandId:disconnectId,systemCommandId:disconnectId,matchId,commandSeq:91,receivedAtMs:10000,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:1,status:'DISCONNECTED'}},frozenRules);connectionState=connectionResult.state;expect(reduceMatch(connectionState,{source:'SYSTEM',commandId:disconnectId,systemCommandId:disconnectId,matchId,commandSeq:92,receivedAtMs:10001,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:1,status:'DISCONNECTED'}},frozenRules).decision).toEqual({status:'REJECTED',reason:'OBSOLETE_SYSTEM_COMMAND'});const futureId=`${matchId}:system:connection:p1:3:DISCONNECTED`;expect(reduceMatch(connectionState,{source:'SYSTEM',commandId:futureId,systemCommandId:futureId,matchId,commandSeq:93,receivedAtMs:10002,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:3,status:'DISCONNECTED'}},frozenRules).decision).toEqual({status:'REJECTED',reason:'OBSOLETE_SYSTEM_COMMAND'});const reconnectId=`${matchId}:system:connection:p1:1:CONNECTED`;connectionResult=reduceMatch(connectionState,{source:'SYSTEM',commandId:reconnectId,systemCommandId:reconnectId,matchId,commandSeq:94,receivedAtMs:24999,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:1,status:'CONNECTED'}},frozenRules);expect(connectionResult.state.phase).toBe('PLAYING');connectionState=structuredClone(connectionResult.state);const staleTimer=`${matchId}:timer:DISCONNECT_FORFEIT_TIMEOUT:p1:1`;expect(reduceMatch(connectionState,{source:'TIMER',commandId:staleTimer,timerId:staleTimer,matchId,commandSeq:95,receivedAtMs:25000,dueAtMs:25000,payload:{type:'DISCONNECT_FORFEIT_TIMEOUT',playerId:'p1',disconnectEpoch:1}},frozenRules).decision).toEqual({status:'REJECTED',reason:'OBSOLETE_TIMER'});const disconnect2=`${matchId}:system:connection:p1:2:DISCONNECTED`;connectionResult=reduceMatch(connectionState,{source:'SYSTEM',commandId:disconnect2,systemCommandId:disconnect2,matchId,commandSeq:96,receivedAtMs:30000,payload:{type:'PLAYER_CONNECTION_CHANGED',playerId:'p1',disconnectEpoch:2,status:'DISCONNECTED'}},frozenRules);connectionState=connectionResult.state;const forfeitId=`${matchId}:timer:DISCONNECT_FORFEIT_TIMEOUT:p1:2`;connectionResult=reduceMatch(connectionState,{source:'TIMER',commandId:forfeitId,timerId:forfeitId,matchId,commandSeq:97,receivedAtMs:45000,dueAtMs:45000,payload:{type:'DISCONNECT_FORFEIT_TIMEOUT',playerId:'p1',disconnectEpoch:2}},frozenRules);expect(connectionResult.state).toMatchObject({phase:'FINISHED',winnerPlayerId:'p2',endReason:'FORFEIT'});const noContestId=`${matchId}:system:no-contest:incident-both`;expect(reduceMatch(state,{source:'SYSTEM',commandId:noContestId,systemCommandId:noContestId,matchId,commandSeq:98,receivedAtMs:50000,payload:{type:'CANCEL_NO_CONTEST',incidentId:'incident-both',reason:'BOTH_DISCONNECTED'}},frozenRules).state).toMatchObject({phase:'CANCELLED',winnerPlayerId:null,endReason:'NO_CONTEST'});
  let boundary=structuredClone(state);const hitCommand=(requestId:string,seq:number,time:number,x:number)=>({source:'PLAYER' as const,commandId:`${matchId}:player:p2:${requestId}`,matchId,commandSeq:seq,receivedAtMs:time,requestId,playerId:'p2',expectedRevision:boundary.stateRevision,payload:{type:'TAP_IMAGE' as const,imageSide:'A' as const,x,y:.2}});let boundaryResult=reduceMatch(boundary,hitCommand('00000000-0000-4000-8000-000000000130',30,63999,.1),frozenRules);expect(boundaryResult.events.find(e=>e.type==='SCORE_CHANGED')?.payload.delta).toBe(6);boundary=boundaryResult.state;const rushId=`${matchId}:timer:START_FINAL_RUSH:final-rush`;boundaryResult=reduceMatch(boundary,{source:'TIMER',commandId:rushId,timerId:rushId,matchId,commandSeq:31,receivedAtMs:64000,dueAtMs:64000,payload:{type:'START_FINAL_RUSH'}},frozenRules);boundary=boundaryResult.state;boundaryResult=reduceMatch(boundary,hitCommand('00000000-0000-4000-8000-000000000131',32,64000,.15),frozenRules);expect(boundaryResult.events.find(e=>e.type==='SCORE_CHANGED')?.payload.delta).toBe(12);
  const tap=(seq:number,time:number)=>({source:'PLAYER' as const,commandId:`${matchId}:player:p1:00000000-0000-4000-8000-${String(seq).padStart(12,'0')}`,matchId,commandSeq:seq,receivedAtMs:time,requestId:`00000000-0000-4000-8000-${String(seq).padStart(12,'0')}`,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'TAP_IMAGE' as const,imageSide:'A' as const,x:.99,y:.01}});
  for(let i=0;i<8;i++){r=reduceMatch(state,tap(4+i,4500),frozenRules);expect(r.decision.status).toBe('APPLIED');state=r.state;}r=reduceMatch(state,tap(12,4500),frozenRules);expect(r.decision).toEqual({status:'REJECTED',reason:'RATE_LIMITED'});r=reduceMatch(state,tap(13,5000),frozenRules);expect(r.decision.status).toBe('APPLIED');
  state=r.state;state.finalChallenge={unlockedAtMs:5000,unlockSource:'TIME'};const wrongId='00000000-0000-4000-8000-000000000099';r=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:p1:${wrongId}`,matchId,commandSeq:14,receivedAtMs:5001,requestId:wrongId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_FINAL_ANSWER',answer:'wrong'}},frozenRules);expect(r.events.find(e=>e.type==='SCORE_CHANGED')?.payload).toMatchObject({delta:0,absoluteScore:0});
  state=r.state;state.activeMission=null;const answerId='00000000-0000-4000-8000-000000000120';r=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:p2:${answerId}`,matchId,commandSeq:15,receivedAtMs:78999,requestId:answerId,playerId:'p2',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_FINAL_ANSWER',answer:'kitty'}},frozenRules);expect(r.state.players[1].finalAnswerStatus).toBe('MEANING_PENDING');state=r.state;const closeId=`${matchId}:timer:CLOSE_INPUT:close`;r=reduceMatch(state,{source:'TIMER',commandId:closeId,timerId:closeId,matchId,commandSeq:16,receivedAtMs:79000,dueAtMs:79000,payload:{type:'CLOSE_INPUT'}},frozenRules);expect(r.state.phase).toBe('SETTLING');state=r.state;const timeoutState=structuredClone(state);const meaningTimer=`${matchId}:timer:MEANING_TIMEOUT:p2:1`;const timedOut=reduceMatch(timeoutState,{source:'TIMER',commandId:meaningTimer,timerId:meaningTimer,matchId,commandSeq:17,receivedAtMs:83999,dueAtMs:83999,payload:{type:'MEANING_TIMEOUT',playerId:'p2',quizOrdinal:1}},frozenRules);expect(timedOut.state.players[1]).toMatchObject({meaningCorrect:false,finalAnswerStatus:'SETTLED'});expect(timeoutState.settlementCapAtMs).toBe(84000);const meaningId='00000000-0000-4000-8000-000000000121';r=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:p2:${meaningId}`,matchId,commandSeq:18,receivedAtMs:83998,requestId:meaningId,playerId:'p2',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_MEANING',optionId:'a'}},frozenRules);expect(r.timerIntents).toContainEqual({kind:'CANCEL',timerId:`${matchId}:timer:MEANING_TIMEOUT:p2:1`});expect(r.state.players[1].score).toBe(40);
});
