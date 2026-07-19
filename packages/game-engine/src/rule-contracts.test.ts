import {describe,expect,it} from 'vitest';
import {MINIMUM_MATCH_DURATION_MS,hasMinimumMatchDuration,isTimedInputLocked,shouldKeepInputLocked} from './rule-contracts.js';
import {createTestingReplayBundle,testingRules} from './testing-fixtures.js';
import {reduceMatch} from './reducer.js';
import type {MatchStateV1} from '../../contracts/src/match.js';

it('loads the 15-second minimum from runtime policy SSOT',()=>{expect(MINIMUM_MATCH_DURATION_MS).toBe(15_000);});

describe('RULE-022 minimum match duration',()=>{
 it('permits completion only at or after 15 seconds from match start',()=>{
  expect(hasMinimumMatchDuration(10_000,24_999)).toBe(false);
  expect(hasMinimumMatchDuration(10_000,25_000)).toBe(true);
 });
 it('does not finish an authoritative score-target command before 15 seconds',()=>{
  const bundle=createTestingReplayBundle(),state:MatchStateV1=structuredClone(bundle.initialState);state.phase='PLAYING';state.startedAtMs=0;state.gameplayClosesAtMs=75_000;state.settlementCapAtMs=80_000;state.players[0].score=99;
  const requestId='00000000-0000-4000-8000-000000000777';
  const early=reduceMatch(state,{source:'PLAYER',commandId:`${state.matchId}:player:p1:${requestId}`,matchId:state.matchId,commandSeq:1,receivedAtMs:14_999,requestId,playerId:'p1',expectedRevision:0,payload:{type:'TAP_IMAGE',imageSide:'A',x:.1,y:.2}},testingRules);
  expect(early.state.phase).toBe('PLAYING');expect(early.state.endReason).toBeNull();expect(early.events.some(e=>e.type==='MATCH_FINISHED')).toBe(false);
 });
});

describe('RULE-035 word-hunt hint credit',()=>{
 it('awards exactly one hint credit through the authoritative reducer',()=>{
  const bundle=createTestingReplayBundle(),state:MatchStateV1=structuredClone(bundle.initialState);state.phase='PLAYING';state.startedAtMs=0;state.gameplayClosesAtMs=75_000;state.settlementCapAtMs=80_000;state.activeMission={missionId:'w1',kind:'NORMAL',publicPrompt:'one',startedAtMs:16_000,endsAtMs:21_000};
  const requestId='00000000-0000-4000-8000-000000000778',result=reduceMatch(state,{source:'PLAYER',commandId:`${state.matchId}:player:p1:${requestId}`,matchId:state.matchId,commandSeq:1,receivedAtMs:17_200,requestId,playerId:'p1',expectedRevision:0,payload:{type:'TAP_IMAGE',imageSide:'A',x:.2,y:.8}},testingRules);
  expect(result.state.players[0].hintCredits).toBe(1);expect(result.events).toContainEqual(expect.objectContaining({type:'HINT_CREDIT_CHANGED',payload:{playerId:'p1',delta:1,absoluteCredits:1}}));
 });
});

describe('RULE-050 input lock persistence',()=>{
 it('keeps every gameplay input locked while a lock cause remains active',()=>{
  for(const cause of ['WORD_HUNT_REVEAL','ANSWER_COOLDOWN','MEANING_QUIZ','RECONNECTING'] as const){
   expect(shouldKeepInputLocked(cause)).toBe(true);
  }
  expect(shouldKeepInputLocked('NONE')).toBe(false);
 });
 it('holds a timed lock until its exact expiry boundary',()=>{
  expect(isTimedInputLocked(20_000,19_999)).toBe(true);
  expect(isTimedInputLocked(20_000,20_000)).toBe(false);
  expect(isTimedInputLocked(null,19_999)).toBe(false);
 });
});
