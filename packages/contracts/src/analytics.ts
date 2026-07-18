export type MatchStage='queue'|'handshake'|'preload'|'command'|'finish'|'reward';
type RiskData={cellBucket:string;countBucket:string;windowDurationBucket:string}|{durationBucket:string};
export type AnalyticsEventV1={eventVersion:1;eventSeq:number;stateRevision:number;occurredAt:string;matchId:string;anonymousUserId:string;traceId:string;engineVersion:string;rulesetVersion:string;contentRevisionId:string;experimentVariant:'CONTROL'|'TREATMENT';serverVersion:string;protocolVersion:1;name:'same_coordinate_burst_signal'|'answer_reaction_time_signal'|'match_stage';data:RiskData|{stage:MatchStage}};

const envelopeKeys=['eventVersion','eventSeq','stateRevision','occurredAt','matchId','anonymousUserId','traceId','engineVersion','rulesetVersion','contentRevisionId','experimentVariant','serverVersion','protocolVersion','name','data'];
const forbidden=/(jwt|token|service.?key|secret|auth.?uuid|user.?id|email|phone|name|canonical.?answer|alias|correct.?option.?id|hitbox|raw.?upload|source.?data|coordinate|timestamp|objective.?id|option.?id|correctness|answer|^x$|^y$)/i;
const record=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const forbiddenValue=[/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/,/^sb_(?:secret|publishable)_/i,/^[^\s@]+@[^\s@]+\.[^\s@]+$/i,/^Bearer\s+\S+$/i,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,/^[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i,/^(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}$/i,/-----BEGIN [A-Z ]+PRIVATE KEY-----/];
function privacyScan(value:unknown,path='$'):void {
  if(typeof value==='string'&&forbiddenValue.some(pattern=>pattern.test(value)))throw new TypeError(`forbidden analytics value ${path}`);
  if(Array.isArray(value)){value.forEach((v,i)=>privacyScan(v,`${path}[${i}]`));return;}
  if(!record(value))return;
  for(const [key,nested] of Object.entries(value)){if(!(path==='$'&&envelopeKeys.includes(key))&&forbidden.test(key))throw new TypeError(`forbidden analytics field ${path}.${key}`);privacyScan(nested,`${path}.${key}`);}
}
function exact(value:Record<string,unknown>,keys:string[]){return Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));}
export function parseAnalyticsEventV1(input:unknown):AnalyticsEventV1{
  privacyScan(input);
  if(!record(input)||!exact(input,envelopeKeys)||input.eventVersion!==1||input.protocolVersion!==1||!Number.isSafeInteger(input.eventSeq)||Number(input.eventSeq)<0||!Number.isSafeInteger(input.stateRevision)||Number(input.stateRevision)<0)throw new TypeError('invalid analytics envelope');
  for(const key of ['matchId','anonymousUserId','traceId','engineVersion','rulesetVersion','contentRevisionId','serverVersion'])if(typeof input[key]!=='string'||input[key]===''||String(input[key]).length>128)throw new TypeError(`invalid ${key}`);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(String(input.occurredAt))||!['CONTROL','TREATMENT'].includes(String(input.experimentVariant))||!record(input.data))throw new TypeError('invalid analytics values');
  const data=input.data;
  if(input.name==='match_stage'){if(!exact(data,['stage'])||!['queue','handshake','preload','command','finish','reward'].includes(String(data.stage)))throw new TypeError('invalid stage');}
  else if(input.name==='same_coordinate_burst_signal'){if(!exact(data,['cellBucket','countBucket','windowDurationBucket'])||!/^\d{2}:\d{2}$/.test(String(data.cellBucket))||!['1','2-3','4-7','8-15','16+'].includes(String(data.countBucket))||!['<1s','1-2s','2-5s','5s+'].includes(String(data.windowDurationBucket)))throw new TypeError('invalid bucket');}
  else if(input.name==='answer_reaction_time_signal'){if(!exact(data,['durationBucket'])||!['<250ms','250-499ms','500-999ms','1-2s','2s+'].includes(String(data.durationBucket)))throw new TypeError('invalid bucket');}
  else throw new TypeError('invalid analytics name');
  return input as AnalyticsEventV1;
}

const expected=new Set(['ALREADY_CLAIMED','ALREADY_READY','INPUT_LOCKED','RATE_LIMITED','REVISION_AHEAD']);
type RequestObservation={requestId:string;outcome:'SUCCESS'|'EXPECTED_REJECTION'|'UNEXPECTED_FAILURE';reason?:string|undefined;occurredAtMs?:number|undefined;schemaValid?:boolean|undefined};
export class AnalyticsCollector{
  private readonly terminal=new Map<string,RequestObservation>();
  recordRequest(r:RequestObservation){if(!r.requestId||r.schemaValid===false)return;if(r.outcome==='EXPECTED_REJECTION'&&(!r.reason||!expected.has(r.reason)))throw new TypeError('unexpected rejection reason');const previous=this.terminal.get(r.requestId);if(previous&&Number(r.occurredAtMs??0)<Number(previous.occurredAtMs??0))throw new TypeError('retry order must be monotonic');this.terminal.set(r.requestId,r);}
  snapshot(){let expectedCount=0,unexpected=0;for(const r of this.terminal.values()){if(r.outcome==='EXPECTED_REJECTION')expectedCount++;else if(r.outcome==='UNEXPECTED_FAILURE')unexpected++;}return{uniqueSchemaValidRequests:this.terminal.size,expectedDomainRejections:expectedCount,unexpectedFailures:unexpected};}
}
export function reconstructTrace(events:readonly AnalyticsEventV1[],traceId:string):MatchStage[]{return events.filter(e=>e.traceId===traceId&&e.name==='match_stage').sort((a,b)=>a.eventSeq-b.eventSeq).map(e=>(e.data as {stage:MatchStage}).stage);}

export type ExperimentContractV1={schemaVersion:1;experimentId:string;assignmentUnit:'anonymousUserId';assignmentSaltVersion:string;variants:['CONTROL','TREATMENT'];allocationBasisPoints:[number,number];primaryMetric:'final_attempt_rate';mde:number;alpha:number;power:number;minSamplePerVariant:number;guardrails:['tap_result_p95','unexpected_failure_rate','srm'];stoppingRule:'FIXED_HORIZON';cellBucket:string};
export function parseExperimentContractV1(x:unknown):ExperimentContractV1{if(!record(x)||!exact(x,['schemaVersion','experimentId','assignmentUnit','assignmentSaltVersion','variants','allocationBasisPoints','primaryMetric','mde','alpha','power','minSamplePerVariant','guardrails','stoppingRule','cellBucket']))throw TypeError('invalid experiment contract');const y=x as unknown as ExperimentContractV1;if(y.schemaVersion!==1||y.assignmentUnit!=='anonymousUserId'||JSON.stringify(y.variants)!=='["CONTROL","TREATMENT"]'||!Array.isArray(y.allocationBasisPoints)||y.allocationBasisPoints.length!==2||y.allocationBasisPoints.some(n=>!Number.isInteger(n)||n<0)||y.allocationBasisPoints[0]+y.allocationBasisPoints[1]!==10000)throw TypeError('invalid assignment allocation');if(y.primaryMetric!=='final_attempt_rate'||!(y.mde>0&&y.mde<1)||!(y.alpha>0&&y.alpha<1)||!(y.power>0&&y.power<1)||!Number.isSafeInteger(y.minSamplePerVariant)||y.minSamplePerVariant<1||JSON.stringify(y.guardrails)!=='["tap_result_p95","unexpected_failure_rate","srm"]'||y.stoppingRule!=='FIXED_HORIZON'||!/^\d{2}:\d{2}$/.test(y.cellBucket))throw TypeError('invalid experiment statistics');for(const value of [y.experimentId,y.assignmentSaltVersion])if(!/^[a-z][a-z0-9_-]{2,63}$/i.test(value))throw TypeError('invalid experiment identifier');return y;}

type LifecycleRow={stage:MatchStage;eventSeq:number;traceId:string;matchId:string;requestId:string;effectId:string|null};
export function validateLifecycleTrace(rows:readonly LifecycleRow[]){privacyScan(rows);const stages:MatchStage[]=['queue','handshake','preload','command','finish','reward'];if(rows.length!==stages.length||rows.some((r,i)=>r.stage!==stages[i]||r.eventSeq!==i+1)||new Set(rows.map(r=>r.eventSeq)).size!==rows.length)throw TypeError('trace must be unique and ordered');const first=rows[0]!;if(!/^trace_opaque_[a-z0-9]+$/i.test(first.traceId)||!/^match_opaque_[a-z0-9]+$/i.test(first.matchId)||rows.some(r=>r.traceId!==first.traceId||r.matchId!==first.matchId||!/^request_opaque_[a-z0-9]+$/i.test(r.requestId))||!/^effect_opaque_[a-z0-9]+$/i.test(rows[5]!.effectId??''))throw TypeError('invalid opaque correlation');return{traceId:first.traceId,matchId:first.matchId,stages};}
