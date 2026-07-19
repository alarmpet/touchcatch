import runtimePolicy from '../../../config/rule-runtime-policy.v1.json' with {type:'json'};

export const MINIMUM_MATCH_DURATION_MS=runtimePolicy.minimumMatchDurationMs;

export function hasMinimumMatchDuration(startedAtMs:number,completionAtMs:number):boolean {
 if(!Number.isSafeInteger(startedAtMs)||!Number.isSafeInteger(completionAtMs)||completionAtMs<startedAtMs)throw new RangeError('invalid match time');
 return completionAtMs-startedAtMs>=MINIMUM_MATCH_DURATION_MS;
}

export type InputLockCause='NONE'|'WORD_HUNT_REVEAL'|'ANSWER_COOLDOWN'|'MEANING_QUIZ'|'RECONNECTING';
export function shouldKeepInputLocked(cause:InputLockCause):boolean{return cause!=='NONE';}
export function isTimedInputLocked(untilMs:number|null,nowMs:number):boolean {
 if(!Number.isSafeInteger(nowMs)||untilMs!==null&&!Number.isSafeInteger(untilMs))throw new RangeError('invalid input lock time');
 return untilMs!==null&&nowMs<untilMs;
}
