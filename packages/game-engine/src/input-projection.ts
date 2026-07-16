import type { MatchStateV1 } from '../../contracts/src/match.js';
import type { RulesetV1 } from '../../contracts/src/rules.js';
export type PlayerInputState={board:'ENABLED'|'RATE_LIMITED'|'DISABLED';answer:'LOCKED'|'ENABLED'|'COMPLETED';overlay:'NONE'|'WORD_HUNT_REVEAL'|'MEANING_QUIZ'|'RECONNECTING'};
const TERMINAL_PHASE={SCORE_TARGET:'FINISHED',TIMEOUT_TIEBREAK:'FINISHED',SUDDEN_DEATH:'FINISHED',DRAW:'FINISHED',FORFEIT:'FINISHED',NO_CONTEST_ASSET_LOAD:'CANCELLED',NO_CONTEST:'CANCELLED'} as const satisfies Record<import('../../contracts/src/match.js').MatchEndReason,'FINISHED'|'CANCELLED'>;
export function terminalPhaseForEndReason(reason:import('../../contracts/src/match.js').MatchEndReason){return TERMINAL_PHASE[reason];}
export function derivePlayerInputState(state:MatchStateV1,playerId:string,now:number,rules:RulesetV1,connection:'CONNECTED'|'RECONNECTING'):PlayerInputState {
 const p=state.players.find(x=>x.playerId===playerId);if(!p)throw Error('not a participant');
 const quiz=state.meaningQuizzes.some(q=>q.playerId===playerId&&!q.submitted&&now<q.endsAtMs);
 const reveal=!!state.activeMission&&now>=state.activeMission.startedAtMs&&now<state.activeMission.startedAtMs+rules.time.wordHuntRevealMs;
 const overlay=connection==='RECONNECTING'?'RECONNECTING':quiz?'MEANING_QUIZ':reveal?'WORD_HUNT_REVEAL':'NONE';
 const window=state.startedAtMs===null?null:Math.floor((now-state.startedAtMs)/1000);const rate=p.tapRateWindow.windowIndex===window&&p.tapRateWindow.acceptedCount>=rules.limits.maxBoardTapsPerSecond;
 const board=connection==='RECONNECTING'||quiz||reveal||!['PLAYING','FINAL_RUSH','SUDDEN_DEATH'].includes(state.phase)?'DISABLED':rate?'RATE_LIMITED':'ENABLED';
 const complete=p.finalAnswerStatus==='FAILED'||p.finalAnswerStatus==='SETTLED';const answer=complete?'COMPLETED':connection==='RECONNECTING'||quiz||reveal||state.finalChallenge.unlockedAtMs===null||(p.answerUntilMs!==null&&now<p.answerUntilMs)||!['PLAYING','FINAL_RUSH'].includes(state.phase)?'LOCKED':'ENABLED';
 return {board,answer,overlay};
}
