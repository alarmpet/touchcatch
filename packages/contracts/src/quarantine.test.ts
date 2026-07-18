import { describe, expect, it } from 'vitest';
import * as publicContracts from './index.js';
import { PRIVACY_OPERATOR_ROLE, parseQuarantinePolicy, scanNestedPii } from './quarantine.js';
import { MemoryQuarantineRepository, MemoryQuarantineStore, runQuarantineJob } from './quarantine.internal.js';

const redactPolicy=()=>parseQuarantinePolicy({policyVersion:'approved-2026-07',approvalId:'LEGAL-123',action:'REDACT',fields:['profile.email','events[].payload.contact'],legalHoldPrecedence:'BLOCK_ACTION'});

describe('durable policy-neutral quarantine',()=>{
 it('does not export persistence capabilities through the public contracts barrel',()=>{
  // @ts-expect-error persistence is deliberately absent from the public type surface
  expect(publicContracts.MemoryQuarantineStore).toBeUndefined();
  // @ts-expect-error repository capability is deliberately absent from the public type surface
  expect(publicContracts.MemoryQuarantineRepository).toBeUndefined();
  // @ts-expect-error operator execution is deliberately absent from the public type surface
  expect(publicContracts.runQuarantineJob).toBeUndefined();
  expect(Object.keys(publicContracts)).not.toContain('MemoryQuarantineStore');
  expect(Object.keys(publicContracts)).not.toContain('MemoryQuarantineRepository');
  expect(Object.keys(publicContracts)).not.toContain('runQuarantineJob');
 });
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
  const store=new MemoryQuarantineStore();const repo=new MemoryQuarantineRepository(store);repo.create('job-1',redactPolicy(),{profile:{email:'person@example.test'},events:[{payload:{contact:'010-1234-5678'}}]},false);
  const dry=runQuarantineJob(repo,'job-1','DRY_RUN',PRIVACY_OPERATOR_ROLE);
  expect(dry.audit).toEqual({jobId:'job-1',action:'REDACT',affectedFieldCount:2,status:'PLANNED'});
  const lease=repo.claim('job-1','worker-a');if(!('fence' in lease))throw new Error('expected active lease');repo.applyNext(lease); // simulated crash after checkpoint 1
  expect(()=>repo.applyNext({...lease,workerId:'worker-b'})).toThrow('lease owner');
  expect(()=>repo.applyNext({...lease,fence:lease.fence-1})).toThrow('stale fence');
  const restarted=new MemoryQuarantineRepository(store.rehydrate());
  const done=runQuarantineJob(restarted,'job-1','APPLY',PRIVACY_OPERATOR_ROLE,'worker-b');
  expect(done.value).toEqual({profile:{email:null},events:[{payload:{contact:null}}]});
  expect(scanNestedPii(done.value)).toEqual([]);
  expect(runQuarantineJob(restarted,'job-1','DRY_RUN',PRIVACY_OPERATOR_ROLE)).toEqual(done);
  expect(restarted.plan('job-1')).toEqual(done.job);
  expect(restarted.claim('job-1','worker-c')).toEqual(done.job);
  expect(restarted.applyNext({jobId:'job-1',workerId:'worker-c',fence:999})).toEqual(done.job);
  expect(JSON.stringify(done.audit)).not.toMatch(/person|010|hash|sha/i);
 });
 it('returns only sanitized public receipts and aggregate audit data',()=>{
  const repo=new MemoryQuarantineRepository();repo.create('safe',redactPolicy(),{profile:{email:'secret@example.test'},events:[]},false);
  const result=runQuarantineJob(repo,'safe','APPLY',PRIVACY_OPERATOR_ROLE);
  expect(result).toEqual({job:{jobId:'safe',status:'COMPLETED',checkpoint:2,affectedFieldCount:1},audit:{jobId:'safe',action:'REDACT',affectedFieldCount:1,status:'COMPLETED'},value:{profile:{email:null},events:[]}});
  expect(scanNestedPii(result)).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/policy|approval|source|legalHold|fence|worker|secret@example/i);
 });
 it('applies DELETE only when supplied by approved policy input',()=>{
  const policy=parseQuarantinePolicy({policyVersion:'approved-delete',approvalId:'LEGAL-DELETE',action:'DELETE',fields:['profile.email'],legalHoldPrecedence:'BLOCK_ACTION'});
  const repo=new MemoryQuarantineRepository();repo.create('delete',policy,{profile:{email:'p@example.test',name:'safe'}},false);
  expect(runQuarantineJob(repo,'delete','APPLY',PRIVACY_OPERATOR_ROLE).value).toEqual({profile:{name:'safe'}});
 });
});
