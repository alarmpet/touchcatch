import { describe, expect, it } from 'vitest';
import { MemoryQuarantineRepository, PRIVACY_OPERATOR_ROLE, parseQuarantinePolicy, runQuarantineJob, scanNestedPii } from './quarantine.js';

const redactPolicy=()=>parseQuarantinePolicy({policyVersion:'approved-2026-07',approvalId:'LEGAL-123',action:'REDACT',fields:['profile.email','events[].payload.contact'],legalHoldPrecedence:'BLOCK_ACTION'});

describe('durable policy-neutral quarantine',()=>{
 it('uses an approved classifier contract for keys and values without key-substring false positives',()=>{
  expect(scanNestedPii({emailPreferences:true,note:'person@example.test',telephone:'010-1234-5678',safe:'hello'})).toEqual(['note','telephone']);
 });
 it('requires the explicit privacy operator and enforces legal hold before every mode',()=>{
  const repo=new MemoryQuarantineRepository();repo.create('job-1',redactPolicy(),{profile:{email:'person@example.test'},events:[{payload:{contact:'010-1234-5678'}}]},false);
  expect(()=>runQuarantineJob(repo,'job-1','DRY_RUN','app_server')).toThrow('privacy operator');
  repo.create('held',redactPolicy(),{profile:{email:'p@example.test'}},true);
  expect(()=>runQuarantineJob(repo,'held','DRY_RUN',PRIVACY_OPERATOR_ROLE)).toThrow('legal hold');
 });
 it('persists receipts/checkpoints, fences stale workers, resumes after a partial crash, and never regresses completed',()=>{
  const repo=new MemoryQuarantineRepository();repo.create('job-1',redactPolicy(),{profile:{email:'person@example.test'},events:[{payload:{contact:'010-1234-5678'}}]},false);
  const dry=runQuarantineJob(repo,'job-1','DRY_RUN',PRIVACY_OPERATOR_ROLE);
  expect(dry.audit).toEqual({jobId:'job-1',action:'REDACT',affectedFieldCount:2,status:'PLANNED'});
  const lease=repo.claim('job-1','worker-a');repo.applyNext(lease); // simulated crash after checkpoint 1
  expect(()=>repo.applyNext({...lease,fence:lease.fence-1})).toThrow('stale fence');
  const done=runQuarantineJob(repo,'job-1','APPLY',PRIVACY_OPERATOR_ROLE,'worker-b');
  expect(done.value).toEqual({profile:{email:null},events:[{payload:{contact:null}}]});
  expect(scanNestedPii(done.value)).toEqual([]);
  expect(runQuarantineJob(repo,'job-1','DRY_RUN',PRIVACY_OPERATOR_ROLE)).toEqual(done);
  expect(JSON.stringify(done.audit)).not.toMatch(/person|010|hash|sha/i);
 });
 it('applies DELETE only when supplied by approved policy input',()=>{
  const policy=parseQuarantinePolicy({policyVersion:'approved-delete',approvalId:'LEGAL-DELETE',action:'DELETE',fields:['profile.email'],legalHoldPrecedence:'BLOCK_ACTION'});
  const repo=new MemoryQuarantineRepository();repo.create('delete',policy,{profile:{email:'p@example.test',name:'safe'}},false);
  expect(runQuarantineJob(repo,'delete','APPLY',PRIVACY_OPERATOR_ROLE).value).toEqual({profile:{name:'safe'}});
 });
});
