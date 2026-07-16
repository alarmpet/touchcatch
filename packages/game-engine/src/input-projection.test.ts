import { expect,it } from 'vitest';
import { derivePlayerInputState } from './input-projection.js';
it('derives rate and reconnect overlays without mutating state',()=>{
 const state={phase:'PLAYING',startedAtMs:1000,players:[{playerId:'p1',tapRateWindow:{windowIndex:1,acceptedCount:8},answerUntilMs:null,finalAnswerStatus:'NOT_SUBMITTED'}],activeMission:null,meaningQuizzes:[],finalChallenge:{unlockedAtMs:1}} as any;
 expect(derivePlayerInputState(state,'p1',2000,{limits:{maxBoardTapsPerSecond:8},time:{wordHuntRevealMs:1200}} as any,'CONNECTED').board).toBe('RATE_LIMITED');
 expect(derivePlayerInputState(state,'p1',3000,{limits:{maxBoardTapsPerSecond:8},time:{wordHuntRevealMs:1200}} as any,'RECONNECTING').overlay).toBe('RECONNECTING');
});
