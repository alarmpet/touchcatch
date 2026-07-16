import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import type { CreateMatchInitialStateInput, MatchCommand, MatchEvent, MatchInitialStateV1, MatchStateV1, ReduceResult, TimerIntent } from '../../contracts/src/match.js';
import type { RulesetV1 } from '../../contracts/src/rules.js';

export function createMatchInitialState(input:CreateMatchInitialStateInput,rules:RulesetV1) {
 if(input.rulesetHash!==canonicalJsonSha256(rules))throw Error('rulesetHash mismatch');
 if(input.playerIds[0]===input.playerIds[1])throw Error('players must differ');
 if(input.privateSolution.contentRevisionId!==input.contentManifest.contentRevisionId||input.privateSolution.privateSolutionHash!==input.contentManifest.privateSolutionHash)throw Error('content mismatch');
 const schedule=input.randomSchedule.wordHunts;
 if(new Set(schedule.map(x=>x.missionId)).size!==3||schedule.some((x,i)=>x.kind!==rules.wordHuntSchedule[i]!.kind||x.endsAfterMs-x.startsAfterMs!==rules.time.wordHuntMs))throw Error('invalid schedule');
 if(new Set(input.randomSchedule.hintRevealOrder).size!==input.privateSolution.finalChallenge.hintUnits.length||input.randomSchedule.hintRevealOrder.some(x=>x<0||x>=input.privateSolution.finalChallenge.hintUnits.length))throw Error('invalid hint order');
 const player=(playerId:string)=>({playerId,assetLoadStatus:'PENDING' as const,assetFailure:null,assetAttestation:null,score:0,wrongFinalAttempts:0,hintCredits:0,revealedHintIndexes:[],publicPattern:null,finalAnswerStatus:'NOT_SUBMITTED' as const,meaningCorrect:null,answerUntilMs:null,tapRateWindow:{windowIndex:null,acceptedCount:0}});
 const state:MatchInitialStateV1={matchId:input.matchId,engineVersion:input.engineVersion,rulesetVersion:'1.0.0',rulesetHash:input.rulesetHash,contentRevisionId:input.contentManifest.contentRevisionId,contentHash:input.contentManifest.publicContentHash,assetPolicyVersion:'1.0.0',createdAtMs:input.createdAtMs,assetLoadDeadlineMs:input.createdAtMs+rules.time.assetLoadMs,expectedAssets:input.contentManifest.expectedAssets,phase:'WAITING_FOR_ASSETS',phaseEndsAtMs:null,startedAtMs:null,gameplayClosesAtMs:null,settlementCapAtMs:null,stateRevision:0,nextEventSeq:1,players:[player(input.playerIds[0]),player(input.playerIds[1])],connections:[{playerId:input.playerIds[0],status:'CONNECTED',disconnectEpoch:0,disconnectedAtMs:null,forfeitAtMs:null},{playerId:input.playerIds[1],status:'CONNECTED',disconnectEpoch:0,disconnectedAtMs:null,forfeitAtMs:null}],objectives:[...input.privateSolution.differences.map(x=>({objectiveId:x.objectiveId,kind:'DIFFERENCE' as const,ownerPlayerId:null})),...input.privateSolution.wordHunts.map(x=>({objectiveId:x.missionId,kind:'WORD_HUNT' as const,ownerPlayerId:null}))],activeMission:null,finalChallenge:{unlockedAtMs:null,unlockSource:null},meaningQuizzes:[],suddenDeath:null,randomSchedule:input.randomSchedule,privateSolution:input.privateSolution,winnerPlayerId:null,endReason:null};
 return {state,timerIntents:[{kind:'SCHEDULE' as const,timerId:`${input.matchId}:timer:ASSET_LOAD_TIMEOUT:asset`,dueAtMs:state.assetLoadDeadlineMs,payload:{type:'ASSET_LOAD_TIMEOUT' as const}}] as const};
}

export function reduceMatch(state:MatchStateV1,command:MatchCommand,rules:RulesetV1):ReduceResult {
 if(command.matchId!==state.matchId)throw Error('match mismatch');
 if(command.source!=='PLAYER'||command.payload.type!=='READY')return rejected(state,'INPUT_LOCKED');
 if(command.expectedRevision>state.stateRevision)return rejected(state,'REVISION_AHEAD');
 const index=state.players.findIndex(p=>p.playerId===command.playerId);if(index<0)return rejected(state,'NOT_A_PARTICIPANT');
 const current=state.players[index]!;if(current.assetLoadStatus!=='PENDING')return rejected(state,'ALREADY_READY');
 const payload=command.payload;const expected=new Map(state.expectedAssets.map(a=>[a.sha256,a]));
 const valid=payload.contentRevisionId===state.contentRevisionId&&payload.contentHash===state.contentHash&&payload.assetHashes.length===expected.size&&new Set(payload.assetHashes).size===expected.size&&payload.assetHashes.every(h=>expected.has(h))&&payload.decodedDimensions.length===expected.size&&payload.decodedDimensions.every(d=>{const a=expected.get(d.assetHash);return a?.width===d.width&&a.height===d.height});
 const next=structuredClone(state) as MatchStateV1;const player=next.players[index]!;const intents:TimerIntent[]=[];let type='ASSET_READY_CHANGED';let eventPayload:Record<string,unknown>;
 if(!valid){player.assetLoadStatus='FAILED';player.assetFailure={reason:'ATTESTATION_MISMATCH'};next.phase='CANCELLED';next.endReason='NO_CONTEST_ASSET_LOAD';eventPayload={winnerPlayerId:null,endReason:next.endReason};type='MATCH_FINISHED';}
 else {player.assetLoadStatus='READY';player.assetAttestation={contentHash:payload.contentHash,assetHashes:payload.assetHashes,decodedDimensions:payload.decodedDimensions};const readyCount=next.players.filter(p=>p.assetLoadStatus==='READY').length as 1|2;if(readyCount===2){next.phase='COUNTDOWN';next.phaseEndsAtMs=command.receivedAtMs+rules.time.countdownMs;intents.push({kind:'CANCEL',timerId:`${state.matchId}:timer:ASSET_LOAD_TIMEOUT:asset`},{kind:'SCHEDULE',timerId:`${state.matchId}:timer:START_MATCH:countdown`,dueAtMs:next.phaseEndsAtMs,payload:{type:'START_MATCH'}});}eventPayload={playerId:player.playerId,readyCount,countdownEndsAtMs:next.phaseEndsAtMs};}
 next.stateRevision=state.stateRevision+1;const event:MatchEvent={eventId:`${state.matchId}:${state.nextEventSeq}`,matchId:state.matchId,eventSeq:state.nextEventSeq,causedByCommandSeq:command.commandSeq,stateRevision:next.stateRevision,occurredAtMs:command.receivedAtMs,phase:next.phase,type,payload:eventPayload};next.nextEventSeq++;
 return {state:next,events:[event],timerIntents:intents,decision:{status:'APPLIED'}};
}
function rejected(state:MatchStateV1,reason:'REVISION_AHEAD'|'ALREADY_READY'|'INPUT_LOCKED'|'NOT_A_PARTICIPANT'):ReduceResult{return {state,events:[],timerIntents:[],decision:{status:'REJECTED',reason}};}
