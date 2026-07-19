import {describe,expect,it} from 'vitest';
import {chooseRandomOneVsOne,hasMinimumMatchDuration,isTimedInputLocked,parseWordHuntRewardChoice,shouldKeepInputLocked} from './rule-contracts.js';

describe('RULE-013 random 1v1',()=>{
 it('selects exactly two distinct queued players using the supplied random draw',()=>{
  const queue=[{ticketId:'t1',playerId:'p1'},{ticketId:'t2',playerId:'p2'},{ticketId:'t3',playerId:'p3'}] as const;
  expect(chooseRandomOneVsOne(queue,()=>0)).toEqual([queue[0],queue[1]]);
  expect(chooseRandomOneVsOne(queue,()=>0.999999)).toEqual([queue[2],queue[1]]);
 });
 it('does not form a match with fewer than two distinct players',()=>{
  expect(chooseRandomOneVsOne([{ticketId:'t1',playerId:'p1'}],()=>0)).toBeNull();
  expect(chooseRandomOneVsOne([{ticketId:'t1',playerId:'p1'},{ticketId:'t2',playerId:'p1'}],()=>0)).toBeNull();
 });
});

describe('RULE-022 minimum match duration',()=>{
 it('permits completion only at or after 15 seconds from match start',()=>{
  expect(hasMinimumMatchDuration(10_000,24_999)).toBe(false);
  expect(hasMinimumMatchDuration(10_000,25_000)).toBe(true);
 });
});

describe('RULE-035 word-hunt reward choice',()=>{
 it.each(['HINT','NEXT_DIFFERENCE_BONUS','FINAL_CHARACTER_REVEAL','OPPONENT_HINT_LOCK'] as const)('accepts %s as exactly one reward',choice=>{
  expect(parseWordHuntRewardChoice(choice)).toBe(choice);
 });
 it.each([null,[],['HINT','FINAL_CHARACTER_REVEAL'],'SCORE_BONUS'])('rejects missing, multiple, and unknown rewards',choice=>{
  expect(()=>parseWordHuntRewardChoice(choice)).toThrow(/reward choice/);
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
