import type { MatchCommand, MatchInitialStateV1, ReplayBundleV1 } from './match.js';
const requestUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const matchUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safe=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
const exact=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));
export function parseMatchCommandV1(value:unknown):MatchCommand {
 if(!value||typeof value!=='object')throw Error('command must be an object');const x=value as Record<string,unknown>;
 const common=['source','commandId','matchId','commandSeq','receivedAtMs','payload'];
 if(typeof x.commandId!=='string'||!/^[\x21-\x7e]{1,512}$/.test(x.commandId)||typeof x.matchId!=='string'||!matchUuid.test(x.matchId)||!safe(x.commandSeq)||!safe(x.receivedAtMs)||!x.payload||typeof x.payload!=='object')throw Error('invalid command fields');
 if(x.source==='PLAYER') {if(!exact(x,[...common,'requestId','playerId','expectedRevision'])||typeof x.requestId!=='string'||!requestUuid.test(x.requestId)||typeof x.playerId!=='string'||!/^[\x21-\x7e]{1,128}$/.test(x.playerId)||!safe(x.expectedRevision))throw Error('invalid player command');}
 else if(x.source==='TIMER'){if(!exact(x,[...common,'timerId','dueAtMs'])||x.timerId!==x.commandId||!safe(x.dueAtMs)||Number(x.receivedAtMs)<Number(x.dueAtMs))throw Error('invalid timer command');}
 else if(x.source==='SYSTEM'){if(!exact(x,[...common,'systemCommandId'])||x.systemCommandId!==x.commandId)throw Error('invalid system command');}
 else throw Error('invalid source'); return value as MatchCommand;
}
export function parseMatchInitialStateV1(value:unknown):MatchInitialStateV1 {if(!value||typeof value!=='object'||(value as MatchInitialStateV1).phase!=='WAITING_FOR_ASSETS'||(value as MatchInitialStateV1).stateRevision!==0||(value as MatchInitialStateV1).nextEventSeq!==1)throw Error('invalid initial state');return value as MatchInitialStateV1;}
export function parseReplayBundleV1(value:unknown):ReplayBundleV1 {if(!value||typeof value!=='object')throw Error('invalid replay bundle');const b=value as ReplayBundleV1;if(b.bundleVersion!==1)throw Error('invalid bundle version');parseMatchInitialStateV1(b.initialState);let seq=0,time=-1;for(const c of b.commands){parseMatchCommandV1(c);if(c.matchId!==b.initialState.matchId||c.commandSeq!==++seq)throw Error('invalid command sequence');const t=c.source==='TIMER'?c.dueAtMs:c.receivedAtMs;if(t<time)throw Error('effective time decreased');time=t;}return b;}
