export const PRIVACY_OPERATOR_ROLE='privacy_operator' as const;
export type QuarantinePolicyV1={policyVersion:string;approvalId:string;action:'REDACT'|'DELETE';fields:readonly string[];legalHoldPrecedence:'BLOCK_ACTION'};
export type QuarantineStatus='PENDING'|'PLANNED'|'APPLYING'|'COMPLETED';
export type QuarantineAuditV1={jobId:string;action:'REDACT'|'DELETE';affectedFieldCount:number;status:'PLANNED'|'COMPLETED'};
export const quarantinePolicyV1Schema={type:'object',additionalProperties:false,required:['policyVersion','approvalId','action','fields','legalHoldPrecedence'],properties:{policyVersion:{type:'string',minLength:1},approvalId:{type:'string',minLength:1},action:{enum:['REDACT','DELETE']},fields:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',minLength:1}},legalHoldPrecedence:{const:'BLOCK_ACTION'}}} as const;

export function parseQuarantinePolicy(input:unknown):QuarantinePolicyV1 {
 if(!input||typeof input!=='object')throw Error('approved quarantine policy required');
 const p=input as Record<string,unknown>;const keys=Object.keys(p).sort();
 if(JSON.stringify(keys)!==JSON.stringify(['action','approvalId','fields','legalHoldPrecedence','policyVersion']))throw Error('approved quarantine policy shape');
 const safePath=/^[A-Za-z][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[\])?)*$/u;
 if(typeof p.policyVersion!=='string'||!p.policyVersion||typeof p.approvalId!=='string'||!p.approvalId||!['REDACT','DELETE'].includes(String(p.action))||p.legalHoldPrecedence!=='BLOCK_ACTION'||!Array.isArray(p.fields)||!p.fields.length||new Set(p.fields).size!==p.fields.length||p.fields.some(x=>typeof x!=='string'||!safePath.test(x)||/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/u.test(x)))throw Error('approved quarantine policy values');
 return Object.freeze({policyVersion:p.policyVersion,approvalId:p.approvalId,action:p.action as 'REDACT'|'DELETE',fields:Object.freeze([...p.fields] as string[]),legalHoldPrecedence:'BLOCK_ACTION'});
}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, PHONE=/^(?:\+?\d[\d ()-]{6,}\d)$/u;
const SENSITIVE_EXACT_KEYS=new Set(['email','emailAddress','phone','phoneNumber','telephone','contact','address','accessToken','refreshToken']);
export function scanNestedPii(value:unknown):readonly string[]{const found:string[]=[];const visit=(node:unknown,path:string)=>{if(Array.isArray(node)){node.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}if(!node||typeof node!=='object')return;for(const [key,child] of Object.entries(node as Record<string,unknown>)){const next=path?`${path}.${key}`:key;if(child!==null&&child!==undefined&&(SENSITIVE_EXACT_KEYS.has(key)||(typeof child==='string'&&(EMAIL.test(child)||PHONE.test(child)))))found.push(next);visit(child,next);}};visit(value,'');return [...new Set(found)].sort();}
