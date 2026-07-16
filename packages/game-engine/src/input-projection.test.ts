import { expect,it } from 'vitest';
import type { MatchEndReason, MatchStateV1 } from '../../contracts/src/match.js';
import type { RulesetV1 } from '../../contracts/src/rules.js';
import { derivePlayerInputState, terminalPhaseForEndReason } from './input-projection.js';
it('derives rate and reconnect overlays without mutating state',()=>{
 const state={phase:'PLAYING',startedAtMs:1000,players:[{playerId:'p1',tapRateWindow:{windowIndex:1,acceptedCount:8},answerUntilMs:null,finalAnswerStatus:'NOT_SUBMITTED'}],activeMission:null,meaningQuizzes:[],finalChallenge:{unlockedAtMs:1}} as unknown as MatchStateV1;
 const rules={limits:{maxBoardTapsPerSecond:8},time:{wordHuntRevealMs:1200}} as unknown as RulesetV1;
 expect(derivePlayerInputState(state,'p1',2000,rules,'CONNECTED').board).toBe('RATE_LIMITED');
 expect(derivePlayerInputState(state,'p1',3000,rules,'RECONNECTING').overlay).toBe('RECONNECTING');
});
it('maps every terminal reason exhaustively',()=>{const reasons=['SCORE_TARGET','TIMEOUT_TIEBREAK','SUDDEN_DEATH','DRAW','FORFEIT','NO_CONTEST','NO_CONTEST_ASSET_LOAD'] as const satisfies readonly MatchEndReason[];expect(reasons.map(terminalPhaseForEndReason)).toEqual(['FINISHED','FINISHED','FINISHED','FINISHED','FINISHED','CANCELLED','CANCELLED']);});
