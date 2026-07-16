export type QuarantinePolicyV1={policyVersion:string;approvalId:string;action:'REDACT'|'DELETE';fields:readonly string[];legalHoldPrecedence:'BLOCK_ACTION'};
export type QuarantineJobV1={jobId:string;policy:QuarantinePolicyV1;source:unknown;status:'PENDING'|'PLANNED'|'COMPLETED';value?:unknown};
export type QuarantineAuditV1={jobId:string;action:'REDACT'|'DELETE';affectedFieldCount:number;status:'PLANNED'|'COMPLETED'};
export const quarantinePolicyV1Schema={type:'object',additionalProperties:false,required:['policyVersion','approvalId','action','fields','legalHoldPrecedence'],properties:{policyVersion:{type:'string',minLength:1},approvalId:{type:'string',minLength:1},action:{enum:['REDACT','DELETE']},fields:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',minLength:1}},legalHoldPrecedence:{const:'BLOCK_ACTION'}}} as const;

export function parseQuarantinePolicy(input:unknown):QuarantinePolicyV1 {
 if(!input||typeof input!=='object')throw Error('approved quarantine policy required');
 const p=input as Record<string,unknown>; const keys=Object.keys(p).sort();
 if(JSON.stringify(keys)!==JSON.stringify(['action','approvalId','fields','legalHoldPrecedence','policyVersion']))throw Error('approved quarantine policy shape');
 const safePath=/^[A-Za-z][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[\])?)*$/u;
 if(typeof p.policyVersion!=='string'||!p.policyVersion||typeof p.approvalId!=='string'||!p.approvalId||!['REDACT','DELETE'].includes(String(p.action))||p.legalHoldPrecedence!=='BLOCK_ACTION'||!Array.isArray(p.fields)||!p.fields.length||p.fields.some(x=>typeof x!=='string'||!safePath.test(x)||/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/u.test(x)))throw Error('approved quarantine policy values');
 return Object.freeze({policyVersion:p.policyVersion,approvalId:p.approvalId,action:p.action as 'REDACT'|'DELETE',fields:Object.freeze([...p.fields] as string[]),legalHoldPrecedence:'BLOCK_ACTION'});
}
export function createQuarantineJob(jobId:string,policy:QuarantinePolicyV1,source:unknown):QuarantineJobV1 {if(!jobId)throw Error('job id required');return {jobId,policy,source,status:'PENDING'};}
function targets(root:unknown,path:string):Array<{parent:Record<string,unknown>;key:string}>{
 const parts=path.split('.');let nodes:unknown[]=[root];
 for(let i=0;i<parts.length-1;i++){const array=parts[i]!.endsWith('[]');const key=array?parts[i]!.slice(0,-2):parts[i]!;nodes=nodes.flatMap(n=>{if(!n||typeof n!=='object')return [];const v=(n as Record<string,unknown>)[key];return array&&Array.isArray(v)?v:[v];});}
 const key=parts.at(-1)!;return nodes.filter(n=>n&&typeof n==='object'&&key in (n as Record<string,unknown>)).map(parent=>({parent:parent as Record<string,unknown>,key}));
}
function clone<T>(v:T):T{return structuredClone(v);}
export function runQuarantineJob(job:QuarantineJobV1,mode:'DRY_RUN'|'APPLY'):{job:QuarantineJobV1;audit:QuarantineAuditV1;value?:unknown}{
 const count=job.policy.fields.reduce((n,p)=>n+targets(job.source,p).length,0);
 if(mode==='DRY_RUN')return {job:{...job,status:'PLANNED'},audit:{jobId:job.jobId,action:job.policy.action,affectedFieldCount:count,status:'PLANNED'}};
 if(job.status==='COMPLETED')return {job,audit:{jobId:job.jobId,action:job.policy.action,affectedFieldCount:count,status:'COMPLETED'},value:job.value};
 const value=clone(job.source);for(const path of job.policy.fields)for(const t of targets(value,path)){if(job.policy.action==='DELETE')delete t.parent[t.key];else t.parent[t.key]=null;}
 const complete={...job,status:'COMPLETED' as const,value};return {job:complete,audit:{jobId:job.jobId,action:job.policy.action,affectedFieldCount:count,status:'COMPLETED'},value};
}
export function scanNestedPii(value:unknown,forbiddenKeys:readonly string[]=['email','phone','contact','address','token']):readonly string[]{
 const found:string[]=[];const visit=(node:unknown,path:string)=>{if(Array.isArray(node)){node.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}if(!node||typeof node!=='object')return;for(const [key,child] of Object.entries(node as Record<string,unknown>)){const next=path?`${path}.${key}`:key;if(forbiddenKeys.some(k=>key.toLowerCase().includes(k)))found.push(next);visit(child,next);}};visit(value,'');return found.sort();
}
