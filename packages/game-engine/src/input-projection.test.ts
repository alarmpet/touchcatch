import { expect,it } from 'vitest';
import type { MatchEndReason } from '../../contracts/src/match.js';
import { derivePlayerInputState, reconnectOverlayForElapsed, terminalPhaseForEndReason } from './input-projection.js';
it('derives rate and reconnect overlays without mutating state',()=>{
 const player={playerId:'p1',assetLoadStatus:'READY' as const,assetFailure:null,assetAttestation:null,score:0,wrongFinalAttempts:0,hintCredits:0,revealedHintIndexes:[],publicPattern:null,learningHints:null,finalAnswerStatus:'NOT_SUBMITTED' as const,meaningCorrect:null,answerUntilMs:null,tapRateWindow:{windowIndex:1,acceptedCount:8}};
 const state={phase:'PLAYING' as const,startedAtMs:1000,players:[player,player] as const,activeMission:null,meaningQuizzes:[],finalChallenge:{unlockedAtMs:1,unlockSource:'TIME' as const}};
 const rules={limits:{maxBoardTapsPerSecond:8},time:{wordHuntRevealMs:1200}};
 expect(derivePlayerInputState(state,'p1',2000,rules,'CONNECTED').board).toBe('RATE_LIMITED');
 expect(derivePlayerInputState(state,'p1',3000,rules,'RECONNECTING').overlay).toBe('RECONNECTING');
});
it('maps every terminal reason exhaustively',()=>{const reasons=['SCORE_TARGET','TIMEOUT_TIEBREAK','SUDDEN_DEATH','DRAW','FORFEIT','NO_CONTEST','NO_CONTEST_ASSET_LOAD'] as const satisfies readonly MatchEndReason[];expect(reasons.map(terminalPhaseForEndReason)).toEqual(['FINISHED','FINISHED','FINISHED','FINISHED','FINISHED','CANCELLED','CANCELLED']);});
it('ends the client reconnect overlay at five seconds independently of server forfeit',()=>{
 expect(reconnectOverlayForElapsed(4999)).toBe('RECONNECTING');
 expect(reconnectOverlayForElapsed(5000)).toBe('OFFLINE');
});
