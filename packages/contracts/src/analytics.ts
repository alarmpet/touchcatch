export type MatchStage='queue'|'handshake'|'preload'|'command'|'finish'|'reward';
type RiskData={cellBucket:string;countBucket:string;windowDurationBucket:string}|{durationBucket:string};
export type AnalyticsEventV1={eventVersion:1;eventSeq:number;stateRevision:number;occurredAt:string;matchId:string;anonymousUserId:string;traceId:string;engineVersion:string;rulesetVersion:string;contentRevisionId:string;experimentVariant:'CONTROL'|'TREATMENT';serverVersion:string;protocolVersion:1;name:'same_coordinate_burst_signal'|'answer_reaction_time_signal'|'match_stage';data:RiskData|{stage:MatchStage}};

const envelopeKeys=['eventVersion','eventSeq','stateRevision','occurredAt','matchId','anonymousUserId','traceId','engineVersion','rulesetVersion','contentRevisionId','experimentVariant','serverVersion','protocolVersion','name','data'];
const forbidden=/(jwt|token|service.?key|secret|auth.?uuid|user.?id|email|phone|name|canonical.?answer|alias|correct.?option.?id|hitbox|raw.?upload|source.?data|coordinate|timestamp|objective.?id|option.?id|correctness|answer|^x$|^y$)/i;
const record=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
function privacyScan(value:unknown,path='$'):void {
  if(typeof value==='string'&&(/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(value)||/^sb_(?:secret|publishable)_/i.test(value)))throw new TypeError(`forbidden analytics value ${path}`);
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
export class AnalyticsCollector{
  private readonly seen=new Set<string>(); private unique=0; private expected=0; private unexpected=0;
  recordRequest(r:{requestId:string;outcome:'SUCCESS'|'EXPECTED_REJECTION'|'UNEXPECTED_FAILURE';reason?:string}){if(this.seen.has(r.requestId))return;this.seen.add(r.requestId);this.unique++;if(r.outcome==='EXPECTED_REJECTION'&&r.reason&&expected.has(r.reason))this.expected++;else if(r.outcome==='UNEXPECTED_FAILURE')this.unexpected++;}
  snapshot(){return{uniqueSchemaValidRequests:this.unique,expectedDomainRejections:this.expected,unexpectedFailures:this.unexpected};}
}
export function reconstructTrace(events:readonly AnalyticsEventV1[],traceId:string):MatchStage[]{return events.filter(e=>e.traceId===traceId&&e.name==='match_stage').sort((a,b)=>a.eventSeq-b.eventSeq).map(e=>(e.data as {stage:MatchStage}).stage);}
