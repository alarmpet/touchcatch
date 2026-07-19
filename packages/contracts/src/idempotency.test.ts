import { describe,expect,it } from 'vitest';
import { MemoryCommandReceiptStore } from './idempotency.js';
describe('command receipt conformance',()=>{it('allows one owner across 20 callers, replays and fences stale owners',async()=>{
 const s=new MemoryCommandReceiptStore(); const key={matchId:'m',playerId:'p',requestId:'r'};
 const claims=await Promise.all(Array.from({length:20},(_,i)=>s.claimOrReplay(key,'h',`o${i}`,100)));
 expect(claims.filter(x=>x.kind==='OWNER')).toHaveLength(1); expect(claims.filter(x=>x.kind==='PENDING')).toHaveLength(19);
 const owner=claims.find(x=>x.kind==='OWNER')!; await s.complete(key,owner.ownerToken,{protocolVersion:1,requestId:'r',accepted:true,stateRevision:1,lastEventSeq:1,snapshotRequired:false},1);
 expect((await s.claimOrReplay(key,'h','later',200)).kind).toBe('REPLAY');
 expect((await s.claimOrReplay(key,'different','later',200)).kind).toBe('CONFLICT');
 await expect(s.complete(key,'stale',{protocolVersion:1,requestId:'r',accepted:true,stateRevision:2,lastEventSeq:2,snapshotRequired:false},2)).rejects.toThrow();
});});
