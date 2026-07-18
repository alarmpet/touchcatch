import fs from'node:fs';import path from'node:path';
import{parseRuleset}from'../packages/contracts/src/rules.schema.js';
import{parseEconomy}from'../packages/contracts/src/economy.schema.js';
import{emitRequirementGateStatus,type RequirementGateResult}from'../packages/contracts/src/analytics.js';

type Row={id:string;source:string;sourceLine:number;text:string};
type Claim={oracle:{kind:string;expected:RequirementGateResult;input?:string};blockerReason?:string};
export function executeRequirementOracle(root:string,row:Row,claim:Claim){let status:RequirementGateResult='FAIL';try{const line=fs.readFileSync(path.join(root,row.source),'utf8').split(/\r?\n/u)[row.sourceLine-1]??'';if(!line.includes(`<!-- REQ: ${row.id} -->`)||!line.includes(row.text))throw Error('source projection mismatch');switch(claim.oracle.kind){case'RULESET_PARSE':parseRuleset(JSON.parse(fs.readFileSync(path.join(root,claim.oracle.input??'config/ruleset.v1.json'),'utf8')));status='PASS';break;case'ECONOMY_PARSE':parseEconomy(JSON.parse(fs.readFileSync(path.join(root,claim.oracle.input??'config/economy.v1.json'),'utf8')));status='PASS';break;case'ANALYTICS_CONTRACT':emitRequirementGateStatus(row.id,'PASS');status='PASS';break;default:if(!claim.blockerReason)throw Error('unimplemented oracle without blocker');status='BLOCKED';}}catch{status='FAIL';}return{status,metric:emitRequirementGateStatus(row.id,status)};}
