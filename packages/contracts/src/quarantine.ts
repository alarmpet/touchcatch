export const PRIVACY_OPERATOR_ROLE='privacy_operator' as const;
export type QuarantinePolicyV1={policyVersion:string;approvalId:string;action:'REDACT'|'DELETE';fields:readonly string[];legalHoldPrecedence:'BLOCK_ACTION'};
export type QuarantineStatus='PENDING'|'PLANNED'|'APPLYING'|'COMPLETED';
export type QuarantineAuditV1={jobId:string;action:'REDACT'|'DELETE';affectedFieldCount:number;status:'PLANNED'|'COMPLETED'};
export type QuarantineRecord={jobId:string;policy:QuarantinePolicyV1;source:unknown;value:unknown;legalHold:boolean;status:QuarantineStatus;checkpoint:number;fence:number;affectedFieldCount:number};
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

export class MemoryQuarantineRepository {
 private readonly records=new Map<string,QuarantineRecord>();
 create(jobId:string,policy:QuarantinePolicyV1,source:unknown,legalHold:boolean){if(!jobId||this.records.has(jobId))throw Error('duplicate quarantine job');const value=structuredClone(source);const affectedFieldCount=policy.fields.reduce((n,p)=>n+targets(value,p).length,0);this.records.set(jobId,{jobId,policy,source:structuredClone(source),value,legalHold,status:'PENDING',checkpoint:0,fence:0,affectedFieldCount});}
 read(jobId:string){const r=this.records.get(jobId);if(!r)throw Error('quarantine job not found');return structuredClone(r);}
 plan(jobId:string){const r=this.requireMutable(jobId);r.status='PLANNED';return this.read(jobId);}
 claim(jobId:string,workerId:string):QuarantineLease{const r=this.requireMutable(jobId);if(!workerId)throw Error('worker required');r.fence++;r.status='APPLYING';return {jobId,workerId,fence:r.fence};}
 applyNext(lease:QuarantineLease){const r=this.records.get(lease.jobId);if(!r||r.fence!==lease.fence)throw Error('stale fence');if(r.status==='COMPLETED')return this.read(r.jobId);const path=r.policy.fields[r.checkpoint];if(path===undefined){r.status='COMPLETED';return this.read(r.jobId);}for(const t of targets(r.value,path)){if(r.policy.action==='DELETE')delete t.parent[t.key];else t.parent[t.key]=null;}r.checkpoint++;if(r.checkpoint===r.policy.fields.length)r.status='COMPLETED';return this.read(r.jobId);}
 private requireMutable(jobId:string){const r=this.records.get(jobId);if(!r)throw Error('quarantine job not found');if(r.legalHold)throw Error('legal hold blocks action');if(r.status==='COMPLETED')return r;return r;}
}
function result(r:QuarantineRecord){return {job:r,audit:{jobId:r.jobId,action:r.policy.action,affectedFieldCount:r.affectedFieldCount,status:(r.status==='COMPLETED'?'COMPLETED':'PLANNED') as 'COMPLETED'|'PLANNED'},value:r.status==='COMPLETED'?r.value:undefined};}
export function runQuarantineJob(repo:MemoryQuarantineRepository,jobId:string,mode:'DRY_RUN'|'APPLY',role:string,workerId='privacy-worker'){
 if(role!==PRIVACY_OPERATOR_ROLE)throw Error('privacy operator authorization required');const current=repo.read(jobId);if(current.legalHold)throw Error('legal hold blocks action');if(current.status==='COMPLETED')return result(current);if(mode==='DRY_RUN')return result(repo.plan(jobId));let lease=repo.claim(jobId,workerId);let record=repo.read(jobId);while(record.status!=='COMPLETED')record=repo.applyNext(lease);return result(record);
}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, PHONE=/^(?:\+?\d[\d ()-]{6,}\d)$/u;
const SENSITIVE_EXACT_KEYS=new Set(['email','emailAddress','phone','phoneNumber','telephone','contact','address','accessToken','refreshToken']);
export function scanNestedPii(value:unknown):readonly string[]{const found:string[]=[];const visit=(node:unknown,path:string)=>{if(Array.isArray(node)){node.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}if(!node||typeof node!=='object')return;for(const [key,child] of Object.entries(node as Record<string,unknown>)){const next=path?`${path}.${key}`:key;if(child!==null&&child!==undefined&&(SENSITIVE_EXACT_KEYS.has(key)||(typeof child==='string'&&(EMAIL.test(child)||PHONE.test(child)))))found.push(next);visit(child,next);}};visit(value,'');return [...new Set(found)].sort();}
