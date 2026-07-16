import { describe, expect, it } from 'vitest';
import rules from '../../../config/ruleset.v1.json' with { type: 'json' };
import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import { parseRuleset } from '../../contracts/src/rules.schema.js';
import type { MatchStateV1 } from '../../contracts/src/match.js';
import { createMatchInitialState, reduceMatch } from './reducer.js';
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
  const result=createMatchInitialState({matchId,createdAtMs:1000,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:5000,endsAfterMs:10000},{kind:'NORMAL',missionId:'w2',startsAfterMs:30000,endsAfterMs:35000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},frozenRules);
  expect(result.state.stateRevision).toBe(0);
  expect(result.state.nextEventSeq).toBe(1);
  expect(result.timerIntents).toEqual([{kind:'SCHEDULE',timerId:`${matchId}:timer:ASSET_LOAD_TIMEOUT:asset`,dueAtMs:21000,payload:{type:'ASSET_LOAD_TIMEOUT'}}]);
}));

it('applies both READY commands from revision zero and starts a deterministic countdown',()=>{
  const matchId='00000000-0000-4000-8000-000000000001'; const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});
  let state:MatchStateV1=createMatchInitialState({matchId,createdAtMs:0,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:solution.contentRevisionId,publicContentHash:'d'.repeat(64),privateSolutionHash:solution.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:solution,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:5000,endsAfterMs:10000},{kind:'NORMAL',missionId:'w2',startsAfterMs:30000,endsAfterMs:35000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},frozenRules).state;
  const payload={type:'READY' as const,contentRevisionId:solution.contentRevisionId,contentHash:'d'.repeat(64),assetHashes:['c'.repeat(64),'a'.repeat(64)],decodedDimensions:[{assetHash:'a'.repeat(64),width:1,height:1},{assetHash:'c'.repeat(64),width:1,height:1}]};
  const cmd=(playerId:string,seq:number)=>({source:'PLAYER' as const,commandId:`${matchId}:player:${playerId}:00000000-0000-4000-8000-00000000000${seq}`,matchId,commandSeq:seq,receivedAtMs:1000,requestId:`00000000-0000-4000-8000-00000000000${seq}`,playerId,expectedRevision:0,payload});
  let r=reduceMatch(state,cmd('p1',1),frozenRules); expect(r.events[0]?.stateRevision).toBe(1); state=r.state;
  r=reduceMatch(state,cmd('p2',2),frozenRules); expect(r.state.phase).toBe('COUNTDOWN');expect(r.decision).toEqual({status:'APPLIED'});expect(r.timerIntents).toContainEqual({kind:'CANCEL',timerId:`${matchId}:timer:ASSET_LOAD_TIMEOUT:asset`});expect(r.events[0]?.eventSeq).toBe(2);
});
