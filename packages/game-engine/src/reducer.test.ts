import { describe, expect, it } from 'vitest';
import rules from '../../../config/ruleset.v1.json' with { type: 'json' };
import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import { parseRuleset } from '../../contracts/src/rules.schema.js';
import { parseMatchInitialStateV1 } from '../../contracts/src/match.schema.js';
import type { MatchStateV1 } from '../../contracts/src/match.js';
import { createMatchInitialState, reduceMatch } from './reducer.js';
import { replayMatch } from './replay.js';
const frozenRules = parseRuleset(rules);

const solution = {
  schemaVersion: '1.0.0' as const, contentRevisionId: '00000000-0000-4000-8000-000000000010', privateSolutionHash: 'b'.repeat(64),
  differences: Array.from({length: 10},(_,i)=>({objectiveId:`d${i}`,tier:i<7?'NORMAL' as const:'HARD' as const,hitboxes:{imageA:{cx:.1+i*.05,cy:.2,r:.01},imageB:{cx:.1+i*.05,cy:.2,r:.01}}})),
  wordHunts: [{missionId:'w1',kind:'NORMAL' as const,publicPrompt:'one',hitboxes:{imageA:{cx:.2,cy:.8,r:.02},imageB:{cx:.2,cy:.8,r:.02}}},{missionId:'w2',kind:'NORMAL' as const,publicPrompt:'two',hitboxes:{imageA:{cx:.4,cy:.8,r:.02},imageB:{cx:.4,cy:.8,r:.02}}},{missionId:'w3',kind:'SPECIAL' as const,publicPrompt:'three',hitboxes:{imageA:{cx:.6,cy:.8,r:.02},imageB:{cx:.6,cy:.8,r:.02}}}],
  suddenDeath:{objectiveId:'sd',hitboxes:{imageA:{cx:.9,cy:.9,r:.02},imageB:{cx:.9,cy:.9,r:.02}}},
  finalChallenge:{canonicalAnswer:'Cat',aliases:['kitty'],hintUnits:['C','a','t'],meaning:{prompt:'meaning',options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],correctOptionId:'a'}}
};

describe('createMatchInitialState',()=>it('pins immutable inputs and schedules exactly one asset deadline',()=>{
  const matchId='00000000-0000-4000-8000-000000000001';
  const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});
  const result=createMatchInitialState({matchId,createdAtMs:1000,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:16000,endsAfterMs:21000},{kind:'NORMAL',missionId:'w2',startsAfterMs:34000,endsAfterMs:39000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},frozenRules);
  expect(result.state.stateRevision).toBe(0);
  expect(result.state.nextEventSeq).toBe(1);
  expect(result.timerIntents).toEqual([{kind:'SCHEDULE',timerId:`${matchId}:timer:ASSET_LOAD_TIMEOUT:asset`,dueAtMs:21000,payload:{type:'ASSET_LOAD_TIMEOUT'}}]);
  expect(()=>parseMatchInitialStateV1({...result.state,players:[{...result.state.players[0],unexpected:true},result.state.players[1]]})).toThrow(/player strict/);
  expect(()=>parseMatchInitialStateV1({...result.state,privateSolution:{...result.state.privateSolution,unexpected:true}})).toThrow(/private solution strict/);
  const bundle={bundleVersion:1 as const,engineVersion:'1',ruleset:frozenRules,rulesetVersion:'1.0.0' as const,rulesetHash:canonicalJsonSha256(rules),contentRevisionId:solution.contentRevisionId,contentHash:'d'.repeat(64),initialState:result.state,commands:[]};
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
  r=reduceMatch(state,cmd('p2',2),frozenRules); expect(r.state.phase).toBe('COUNTDOWN');expect(r.decision).toEqual({status:'APPLIED'});expect(r.timerIntents).toContainEqual({kind:'CANCEL',timerId:`${matchId}:timer:ASSET_LOAD_TIMEOUT:asset`});expect(r.events[0]?.eventSeq).toBe(2);
  state=r.state;const startId=`${matchId}:timer:START_MATCH:countdown`;r=reduceMatch(state,{source:'TIMER',commandId:startId,timerId:startId,matchId,commandSeq:3,receivedAtMs:4000,dueAtMs:4000,payload:{type:'START_MATCH'}},frozenRules);expect(r.state.phase).toBe('PLAYING');expect(r.timerIntents).toHaveLength(9);state=r.state;
  let boundary=structuredClone(state);const hitCommand=(requestId:string,seq:number,time:number,x:number)=>({source:'PLAYER' as const,commandId:`${matchId}:player:p2:${requestId}`,matchId,commandSeq:seq,receivedAtMs:time,requestId,playerId:'p2',expectedRevision:boundary.stateRevision,payload:{type:'TAP_IMAGE' as const,imageSide:'A' as const,x,y:.2}});let boundaryResult=reduceMatch(boundary,hitCommand('00000000-0000-4000-8000-000000000130',30,63999,.1),frozenRules);expect(boundaryResult.events.find(e=>e.type==='SCORE_CHANGED')?.payload.delta).toBe(6);boundary=boundaryResult.state;const rushId=`${matchId}:timer:START_FINAL_RUSH:final-rush`;boundaryResult=reduceMatch(boundary,{source:'TIMER',commandId:rushId,timerId:rushId,matchId,commandSeq:31,receivedAtMs:64000,dueAtMs:64000,payload:{type:'START_FINAL_RUSH'}},frozenRules);boundary=boundaryResult.state;boundaryResult=reduceMatch(boundary,hitCommand('00000000-0000-4000-8000-000000000131',32,64000,.15),frozenRules);expect(boundaryResult.events.find(e=>e.type==='SCORE_CHANGED')?.payload.delta).toBe(12);
  const tap=(seq:number,time:number)=>({source:'PLAYER' as const,commandId:`${matchId}:player:p1:00000000-0000-4000-8000-${String(seq).padStart(12,'0')}`,matchId,commandSeq:seq,receivedAtMs:time,requestId:`00000000-0000-4000-8000-${String(seq).padStart(12,'0')}`,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'TAP_IMAGE' as const,imageSide:'A' as const,x:.99,y:.01}});
  for(let i=0;i<8;i++){r=reduceMatch(state,tap(4+i,4500),frozenRules);expect(r.decision.status).toBe('APPLIED');state=r.state;}r=reduceMatch(state,tap(12,4500),frozenRules);expect(r.decision).toEqual({status:'REJECTED',reason:'RATE_LIMITED'});r=reduceMatch(state,tap(13,5000),frozenRules);expect(r.decision.status).toBe('APPLIED');
  state=r.state;state.finalChallenge={unlockedAtMs:5000,unlockSource:'TIME'};const wrongId='00000000-0000-4000-8000-000000000099';r=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:p1:${wrongId}`,matchId,commandSeq:14,receivedAtMs:5001,requestId:wrongId,playerId:'p1',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_FINAL_ANSWER',answer:'wrong'}},frozenRules);expect(r.events.find(e=>e.type==='SCORE_CHANGED')?.payload).toMatchObject({delta:0,absoluteScore:0});
  state=r.state;state.activeMission=null;const answerId='00000000-0000-4000-8000-000000000120';r=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:p2:${answerId}`,matchId,commandSeq:15,receivedAtMs:78999,requestId:answerId,playerId:'p2',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_FINAL_ANSWER',answer:'kitty'}},frozenRules);expect(r.state.players[1].finalAnswerStatus).toBe('MEANING_PENDING');state=r.state;const closeId=`${matchId}:timer:CLOSE_INPUT:close`;r=reduceMatch(state,{source:'TIMER',commandId:closeId,timerId:closeId,matchId,commandSeq:16,receivedAtMs:79000,dueAtMs:79000,payload:{type:'CLOSE_INPUT'}},frozenRules);expect(r.state.phase).toBe('SETTLING');state=r.state;const meaningId='00000000-0000-4000-8000-000000000121';r=reduceMatch(state,{source:'PLAYER',commandId:`${matchId}:player:p2:${meaningId}`,matchId,commandSeq:17,receivedAtMs:83998,requestId:meaningId,playerId:'p2',expectedRevision:state.stateRevision,payload:{type:'SUBMIT_MEANING',optionId:'a'}},frozenRules);expect(r.timerIntents).toContainEqual({kind:'CANCEL',timerId:`${matchId}:timer:MEANING_TIMEOUT:p2:1`});expect(r.state.players[1].score).toBe(40);
});
