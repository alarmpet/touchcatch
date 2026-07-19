export type InputLockCause='NONE'|'WORD_HUNT_REVEAL'|'ANSWER_COOLDOWN'|'MEANING_QUIZ'|'RECONNECTING';
export function shouldKeepInputLocked(cause:InputLockCause):boolean{return cause!=='NONE';}
export function isTimedInputLocked(untilMs:number|null,nowMs:number):boolean {
 if(!Number.isSafeInteger(nowMs)||untilMs!==null&&!Number.isSafeInteger(untilMs))throw new RangeError('invalid input lock time');
 return untilMs!==null&&nowMs<untilMs;
}
