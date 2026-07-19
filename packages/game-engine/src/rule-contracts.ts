export const MINIMUM_MATCH_DURATION_MS=15_000;

export type MatchmakingTicket={ticketId:string;playerId:string};

export function chooseRandomOneVsOne<T extends MatchmakingTicket>(queue:readonly T[],random:()=>number):readonly [T,T]|null {
 const eligible=queue.filter((ticket,index)=>queue.findIndex(candidate=>candidate.playerId===ticket.playerId)===index);
 if(eligible.length<2)return null;
 const draw=()=>{const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError('random draw must be in [0, 1)');return value;};
 const firstIndex=Math.floor(draw()*eligible.length);
 const first=eligible[firstIndex]!;
 const opponents=eligible.filter(ticket=>ticket.playerId!==first.playerId);
 return [first,opponents[Math.floor(draw()*opponents.length)]!];
}

export function hasMinimumMatchDuration(startedAtMs:number,completionAtMs:number):boolean {
 if(!Number.isSafeInteger(startedAtMs)||!Number.isSafeInteger(completionAtMs)||completionAtMs<startedAtMs)throw new RangeError('invalid match time');
 return completionAtMs-startedAtMs>=MINIMUM_MATCH_DURATION_MS;
}

export const WORD_HUNT_REWARD_CHOICES=['HINT','NEXT_DIFFERENCE_BONUS','FINAL_CHARACTER_REVEAL','OPPONENT_HINT_LOCK'] as const;
export type WordHuntRewardChoice=typeof WORD_HUNT_REWARD_CHOICES[number];

export function parseWordHuntRewardChoice(value:unknown):WordHuntRewardChoice {
 if(typeof value!=='string'||!(WORD_HUNT_REWARD_CHOICES as readonly string[]).includes(value))throw new TypeError('invalid reward choice');
 return value as WordHuntRewardChoice;
}

export type InputLockCause='NONE'|'WORD_HUNT_REVEAL'|'ANSWER_COOLDOWN'|'MEANING_QUIZ'|'RECONNECTING';
export function shouldKeepInputLocked(cause:InputLockCause):boolean{return cause!=='NONE';}
export function isTimedInputLocked(untilMs:number|null,nowMs:number):boolean {
 if(!Number.isSafeInteger(nowMs)||untilMs!==null&&!Number.isSafeInteger(untilMs))throw new RangeError('invalid input lock time');
 return untilMs!==null&&nowMs<untilMs;
}
