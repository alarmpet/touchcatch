export const PRIVACY_OPERATOR_ROLE='privacy_operator' as const;
export type QuarantinePolicyV1={policyVersion:string;approvalId:string;action:'REDACT'|'DELETE';fields:readonly string[];legalHoldPrecedence:'BLOCK_ACTION'};
export type QuarantineStatus='PENDING'|'PLANNED'|'APPLYING'|'COMPLETED';
export type QuarantineAuditV1={jobId:string;action:'REDACT'|'DELETE';affectedFieldCount:number;status:'PLANNED'|'COMPLETED'};
type QuarantineRecord={jobId:string;policy:QuarantinePolicyV1;source:unknown;value:unknown;legalHold:boolean;status:QuarantineStatus;checkpoint:number;fence:number;workerId:string|null;affectedFieldCount:number};
export type QuarantineReceipt={jobId:string;status:QuarantineStatus;checkpoint:number;affectedFieldCount:number};
export type QuarantineLease={jobId:string;workerId:string;fence:number};
export const quarantinePolicyV1Schema={type:'object',additionalProperties:false,required:['policyVersion','approvalId','action','fields','legalHoldPrecedence'],properties:{policyVersion:{type:'string',minLength:1},approvalId:{type:'string',minLength:1},action:{enum:['REDACT','DELETE']},fields:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',minLength:1}},legalHoldPrecedence:{const:'BLOCK_ACTION'}}} as const;

export function parseQuarantinePolicy(input:unknown):QuarantinePolicyV1 {
 if(!input||typeof input!=='object')throw Error('approved quarantine policy required');
 const p=input as Record<string,unknown>;const keys=Object.keys(p).sort();
 if(JSON.stringify(keys)!==JSON.stringify(['action','approvalId','fields','legalHoldPrecedence','policyVersion']))throw Error('approved quarantine policy shape');
 const safePath=/^[A-Za-z][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[\])?)*$/u;
 if(typeof p.policyVersion!=='string'||!p.policyVersion||typeof p.approvalId!=='string'||!p.approvalId||!['REDACT','DELETE'].includes(String(p.action))||p.legalHoldPrecedence!=='BLOCK_ACTION'||!Array.isArray(p.fields)||!p.fields.length||new Set(p.fields).size!==p.fields.length||p.fields.some(x=>typeof x!=='string'||!safePath.test(x)||/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/u.test(x)))throw Error('approved quarantine policy values');
 return Object.freeze({policyVersion:p.policyVersion,approvalId:p.approvalId,action:p.action as 'REDACT'|'DELETE',fields:Object.freeze([...p.fields] as string[]),legalHoldPrecedence:'BLOCK_ACTION'});
}
function targets(root:unknown,path:string):Array<{parent:Record<string,unknown>;key:string}>{const parts=path.split('.');let nodes:unknown[]=[root];for(let i=0;i<parts.length-1;i++){const array=parts[i]!.endsWith('[]');const key=array?parts[i]!.slice(0,-2):parts[i]!;nodes=nodes.flatMap(n=>{if(!n||typeof n!=='object')return [];const v=(n as Record<string,unknown>)[key];return array&&Array.isArray(v)?v:[v];});}const key=parts.at(-1)!;return nodes.filter(n=>n&&typeof n==='object'&&key in (n as Record<string,unknown>)).map(parent=>({parent:parent as Record<string,unknown>,key}));}
const receipt=(record:QuarantineRecord):QuarantineReceipt=>({jobId:record.jobId,status:record.status,checkpoint:record.checkpoint,affectedFieldCount:record.affectedFieldCount});

/** @internal Trusted persistence boundary. Serialized state can contain quarantined PII and must never cross the operator service boundary. */
export class MemoryQuarantineStore {
 private serialized:string;
 constructor(serialized='[]'){this.serialized=serialized;JSON.parse(serialized);}
 rehydrate(){return new MemoryQuarantineStore(this.serialized);}
 /** @internal repository-only persistence operation */
 load():Map<string,QuarantineRecord>{return new Map((JSON.parse(this.serialized) as QuarantineRecord[]).map(record=>[record.jobId,record]));}
 /** @internal repository-only persistence operation */
 save(records:Map<string,QuarantineRecord>){this.serialized=JSON.stringify([...records.values()]);}
}

export class MemoryQuarantineRepository {
 constructor(private readonly store=new MemoryQuarantineStore()){}
 private load(){return this.store.load();}
 private save(records:Map<string,QuarantineRecord>){this.store.save(records);}
 private record(records:Map<string,QuarantineRecord>,jobId:string){const record=records.get(jobId);if(!record)throw Error('quarantine job not found');return record;}
 private mutable(records:Map<string,QuarantineRecord>,jobId:string){const record=this.record(records,jobId);if(record.legalHold)throw Error('legal hold blocks action');return record;}
 create(jobId:string,policy:QuarantinePolicyV1,source:unknown,legalHold:boolean){const records=this.load();if(!jobId||records.has(jobId))throw Error('duplicate quarantine job');const value=structuredClone(source);const affectedFieldCount=policy.fields.reduce((n,p)=>n+targets(value,p).length,0);records.set(jobId,{jobId,policy,source:structuredClone(source),value,legalHold,status:'PENDING',checkpoint:0,fence:0,workerId:null,affectedFieldCount});this.save(records);return receipt(this.record(records,jobId));}
 inspect(jobId:string){return receipt(this.record(this.load(),jobId));}
 plan(jobId:string){const records=this.load();const record=this.mutable(records,jobId);if(record.status==='COMPLETED')return receipt(record);record.status='PLANNED';record.workerId=null;this.save(records);return receipt(record);}
 claim(jobId:string,workerId:string):QuarantineLease|QuarantineReceipt{const records=this.load();const record=this.mutable(records,jobId);if(record.status==='COMPLETED')return receipt(record);if(!workerId)throw Error('worker required');record.fence++;record.workerId=workerId;record.status='APPLYING';this.save(records);return {jobId,workerId,fence:record.fence};}
 applyNext(lease:QuarantineLease){const records=this.load();const record=this.record(records,lease.jobId);if(record.status==='COMPLETED')return receipt(record);if(record.fence!==lease.fence)throw Error('stale fence');if(record.workerId!==lease.workerId)throw Error('lease owner mismatch');if(record.legalHold)throw Error('legal hold blocks action');const path=record.policy.fields[record.checkpoint];if(path===undefined){record.status='COMPLETED';record.workerId=null;this.save(records);return receipt(record);}for(const target of targets(record.value,path)){if(record.policy.action==='DELETE')delete target.parent[target.key];else target.parent[target.key]=null;}record.checkpoint++;if(record.checkpoint===record.policy.fields.length){record.status='COMPLETED';record.workerId=null;}this.save(records);return receipt(record);}
 /** @internal operator facade only; never expose through an API. */
 result(jobId:string){const record=this.record(this.load(),jobId);return {job:receipt(record),audit:{jobId:record.jobId,action:record.policy.action,affectedFieldCount:record.affectedFieldCount,status:(record.status==='COMPLETED'?'COMPLETED':'PLANNED') as 'COMPLETED'|'PLANNED'},value:record.status==='COMPLETED'?structuredClone(record.value):undefined};}
 isHeld(jobId:string){return this.record(this.load(),jobId).legalHold;}
}
export function runQuarantineJob(repo:MemoryQuarantineRepository,jobId:string,mode:'DRY_RUN'|'APPLY',role:string,workerId='privacy-worker'){
 if(role!==PRIVACY_OPERATOR_ROLE)throw Error('privacy operator authorization required');if(repo.isHeld(jobId))throw Error('legal hold blocks action');const current=repo.inspect(jobId);if(current.status==='COMPLETED')return repo.result(jobId);if(mode==='DRY_RUN'){repo.plan(jobId);return repo.result(jobId);}const claimed=repo.claim(jobId,workerId);if(!('fence' in claimed))return repo.result(jobId);let record=repo.inspect(jobId);while(record.status!=='COMPLETED')record=repo.applyNext(claimed);return repo.result(jobId);
}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, PHONE=/^(?:\+?\d[\d ()-]{6,}\d)$/u;
const SENSITIVE_EXACT_KEYS=new Set(['email','emailAddress','phone','phoneNumber','telephone','contact','address','accessToken','refreshToken']);
export function scanNestedPii(value:unknown):readonly string[]{const found:string[]=[];const visit=(node:unknown,path:string)=>{if(Array.isArray(node)){node.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}if(!node||typeof node!=='object')return;for(const [key,child] of Object.entries(node as Record<string,unknown>)){const next=path?`${path}.${key}`:key;if(child!==null&&child!==undefined&&(SENSITIVE_EXACT_KEYS.has(key)||(typeof child==='string'&&(EMAIL.test(child)||PHONE.test(child)))))found.push(next);visit(child,next);}};visit(value,'');return [...new Set(found)].sort();}
