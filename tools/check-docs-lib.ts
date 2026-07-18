export type TraceRow={id:string;source:string;schema:string;phase:string;test:string;metric:string};
export function checkTraceability(x:{normativeIds:string[];rows:TraceRow[];existingPaths:Set<string>}){const counts=new Map<string,number>();for(const r of x.rows)counts.set(r.id,(counts.get(r.id)??0)+1);const missing=[...new Set(x.normativeIds)].filter(id=>!counts.has(id)).sort();const orphan=[...counts.keys()].filter(id=>!x.normativeIds.includes(id)).sort();const duplicates=[...counts].filter(([,n])=>n!==1).map(([id])=>id).sort();const broken=x.rows.flatMap(r=>[r.source,r.schema,r.test].filter(p=>!x.existingPaths.has(p)).map(path=>`${r.id}:${path}`));return{missing,orphan,duplicates,broken};}
export const normativeNumericTokens:Record<string,readonly string[]>={
  '07_REALTIME_SERVER_SPEC.md':['100 concurrent matches/200 sockets','p95 <=250ms','<0.1%','10,000 unique requests','200-match/400-socket 30-minute soak'],
  '11_TEST_AND_BALANCE_PLAN.md':['50~70초','40~65%','70% 이상','0.5~1.5회','50 matches','10,000 matches','100,000 draws','botModelVersion'],
};
export function checkNormativeNumbers(textByPath:Record<string,string>){return Object.entries(normativeNumericTokens).flatMap(([file,tokens])=>tokens.filter(token=>!textByPath[file]?.includes(token)).map(token=>`${file}:${token}`));}
