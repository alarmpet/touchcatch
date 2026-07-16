import {expect,it} from 'vitest';import {projectMatchEvent,projectSnapshot} from './projection.js';import type {MatchEvent,MatchStateV1} from './match.js';
it('preserves every cursor while redacting opponent-private tap results',()=>{const e={type:'TAP_RESOLVED',eventId:'e',matchId:'m',eventSeq:7,causedByCommandSeq:1,stateRevision:4,occurredAtMs:1,phase:'PLAYING',payload:{playerId:'p1',requestId:'123e4567-e89b-42d3-a456-426614174000',hit:false,objectiveId:null}} satisfies MatchEvent;expect(projectMatchEvent(e,{} as MatchStateV1,'p2')).toMatchObject({type:'state_advanced',eventSeq:7,payload:{redacted:true}});expect(projectMatchEvent(e,{} as MatchStateV1,'p1')).toMatchObject({type:'tap_result',eventSeq:7,payload:{hit:false,objectiveId:null}});expect(JSON.stringify(projectMatchEvent(e,{} as MatchStateV1,'p1'))).not.toMatch(/playerId|auth|jwt/i)});
it('projects viewer snapshot without private solution material',()=>{const state={matchId:'m',engineVersion:'e',rulesetVersion:'1.0.0',rulesetHash:'a'.repeat(64),contentRevisionId:'r',contentHash:'b'.repeat(64),assetPolicyVersion:'1.0.0',assetLoadDeadlineMs:20,expectedAssets:[],phase:'PLAYING',phaseEndsAtMs:30,stateRevision:4,nextEventSeq:8,players:[{playerId:'p1',assetLoadStatus:'READY',score:2,wrongFinalAttempts:1,hintCredits:2,revealedHintIndexes:[0],publicPattern:'c_t',answerUntilMs:null},{playerId:'p2',assetLoadStatus:'READY',score:1,wrongFinalAttempts:0,hintCredits:0,revealedHintIndexes:[],publicPattern:null,answerUntilMs:null}],connections:[{playerId:'p1',status:'CONNECTED',disconnectEpoch:0,forfeitAtMs:null},{playerId:'p2',status:'CONNECTED',disconnectEpoch:0,forfeitAtMs:null}],objectives:[],activeMission:null,finalChallenge:{unlockedAtMs:10,unlockSource:'TIME'},meaningQuizzes:[],suddenDeath:null,winnerPlayerId:null,endReason:null,privateSolution:{finalChallenge:{canonicalAnswer:'cat',aliases:['kitty'],meaning:{prompt:'meaning?',options:[{id:'a',label:'A'},{id:'b',label:'B'}],correctOptionId:'a'}},differences:[],suddenDeath:{objectiveId:'sd',hitboxes:{imageA:{cx:.1,cy:.1,r:.1},imageB:{cx:.1,cy:.1,r:.1}}}}} as unknown as MatchStateV1;const out=projectSnapshot(state,'p1',15);expect(out.lastEventSeq).toBe(7);expect(out.finalChallenge.viewer.publicPattern).toBe('c_t');expect(JSON.stringify(out)).not.toMatch(/canonicalAnswer|aliases|correctOptionId|kitty|privateSolution/)});

const forbidden=/canonicalAnswer|aliases|correctOptionId|privateSolution|authSubject|authUuid|rawJwt|assetAttestation|assetFailure|hitboxes/i;
function forbiddenPaths(value:object):string[]{const found:string[]=[];const visit=(current:object,path:string)=>{for(const [key,item] of Object.entries(current)){const next=path?`${path}.${key}`:key;if(forbidden.test(key))found.push(next);if(item!==null&&typeof item==='object')visit(item,next)}};visit(value,'');return found}

it('maps every domain event for owner, opponent, and public visibility without leaking private keys',()=>{
 const base={eventId:'e',matchId:'m',eventSeq:8,causedByCommandSeq:1,stateRevision:5,occurredAtMs:10,phase:'PLAYING' as const};
 const events=[
  {...base,type:'ASSET_READY_CHANGED',payload:{playerId:'p1',readyCount:1 as const,countdownEndsAtMs:null}},
  {...base,type:'MATCH_STARTED',payload:{startedAtMs:10}},
  {...base,type:'FINAL_RUSH_STARTED',payload:{startedAtMs:10}},
  {...base,type:'FINAL_CHALLENGE_UNLOCKED',payload:{unlockedAtMs:10,source:'TIME' as const,publicPattern:'c_t'}},
  {...base,type:'HINT_REVEALED',payload:{playerId:'p1',hintIndex:0,publicPattern:'ca_'}},
  {...base,type:'HINT_CREDIT_CHANGED',payload:{playerId:'p1',delta:1,absoluteCredits:2}},
  {...base,type:'SCORE_CHANGED',payload:{playerId:'p1',delta:5,absoluteScore:5}},
  {...base,type:'ANSWER_LOCK_CHANGED',payload:{playerId:'p1',answerUntilMs:20,reason:'WRONG_ANSWER' as const}},
  {...base,type:'TAP_RESOLVED',payload:{playerId:'p1',requestId:'00000000-0000-4000-8000-000000000001',hit:false,objectiveId:null}},
  {...base,type:'OBJECTIVE_CLAIMED',payload:{objectiveId:'missing',ownerPlayerId:'p1',kind:'DIFFERENCE' as const}},
  {...base,type:'WORD_HUNT_STARTED',payload:{missionId:'w',kind:'NORMAL' as const,publicPrompt:'find',startedAtMs:10,endsAtMs:20}},
  {...base,type:'WORD_HUNT_WON',payload:{missionId:'w',playerId:'p1'}},
  {...base,type:'WORD_HUNT_ENDED',payload:{missionId:'w',reason:'TIMEOUT' as const}},
  {...base,type:'MEANING_QUIZ_STARTED',payload:{playerId:'p1',quizOrdinal:1,endsAtMs:20}},
  {...base,type:'SUDDEN_DEATH_STARTED',payload:{objectiveId:'sd',endsAtMs:20}},
  {...base,type:'INPUT_CLOSED',payload:{closedAtMs:10,settlementCapAtMs:20}},
  {...base,type:'PLAYER_CONNECTION_CHANGED',payload:{playerId:'p1',status:'CONNECTED' as const,disconnectEpoch:1,forfeitAtMs:null}},
  {...base,type:'MATCH_FINISHED',payload:{winnerPlayerId:'p1',endReason:'SCORE_TARGET' as const}},
 ] satisfies MatchEvent[];
 const state={privateSolution:{schemaVersion:'1.0.0',contentRevisionId:'r',privateSolutionHash:'a'.repeat(64),finalChallenge:{canonicalAnswer:'cat',aliases:[],hintUnits:[],meaning:{prompt:'safe prompt',options:[],correctOptionId:'a'}},suddenDeath:{objectiveId:'sd',hitboxes:{imageA:{cx:0,cy:0,r:1},imageB:{cx:0,cy:0,r:1}}},differences:[],wordHunts:[]}} satisfies Pick<MatchStateV1,'privateSolution'>;
 expect(new Set(events.map(e=>e.type)).size).toBe(18);
 for(const event of events)for(const viewer of ['p1','p2','public']){const projected=projectMatchEvent(event,state,viewer);expect(projected.eventSeq).toBe(event.eventSeq);expect(forbiddenPaths(projected)).toEqual([])}
});

it('keeps owner-private then public delivery contiguous and scans representative persistence/auth/notification shapes',()=>{
 const privateEvent={eventId:'private',matchId:'m',eventSeq:40,causedByCommandSeq:1,stateRevision:9,occurredAtMs:1,phase:'PLAYING',type:'TAP_RESOLVED',payload:{playerId:'p1',requestId:'00000000-0000-4000-8000-000000000001',hit:false,objectiveId:null}} satisfies MatchEvent;
 const publicEvent={eventId:'public',matchId:'m',eventSeq:41,causedByCommandSeq:2,stateRevision:10,occurredAtMs:2,phase:'PLAYING',type:'SCORE_CHANGED',payload:{playerId:'p1',delta:1,absoluteScore:1}} satisfies MatchEvent;
 const state={privateSolution:{schemaVersion:'1.0.0',contentRevisionId:'r',privateSolutionHash:'a'.repeat(64),finalChallenge:{canonicalAnswer:'cat',aliases:[],hintUnits:[],meaning:{prompt:'safe prompt',options:[],correctOptionId:'a'}},suddenDeath:{objectiveId:'sd',hitboxes:{imageA:{cx:0,cy:0,r:1},imageB:{cx:0,cy:0,r:1}}},differences:[],wordHunts:[]}} satisfies Pick<MatchStateV1,'privateSolution'>;
 expect([privateEvent,publicEvent].map(e=>projectMatchEvent(e,state,'p2')).map(e=>e.eventSeq)).toEqual([40,41]);
 const samples=[{journal:{event:projectMatchEvent(privateEvent,state,'p2')}},{auth:{participantKey:'opaque-player'}},{notification:{type:'match_found',contentHash:'a'.repeat(64)}}];
 for(const sample of samples)expect(forbiddenPaths(sample)).toEqual([]);
});
