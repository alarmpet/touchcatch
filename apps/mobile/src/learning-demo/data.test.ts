import { expect, it } from 'vitest';
import { buildDemoEntry, type MobileSemanticSnapshot } from './data.js';

it('projects only a complete pinned semantic snapshot and ignores later draft mutation', () => {
  const ladder = [1,2,3,4,5].map(ordinal=>({ordinal:ordinal as 1|2|3|4|5,kind:'DEFINITION' as const,localizedText:{ko:`힌트 ${ordinal}`,en:`Hint ${ordinal}`},revealIndexes:[],rankedPenaltyUnits:1 as const}));
  const snapshot: MobileSemanticSnapshot = {key:'demo',category:'ENGLISH',title:'answer',canonicalAnswer:'answer',contentRevisionId:'revision',privateSolutionHash:'b'.repeat(64),differences:[{id:'d',imageA:{cx:.1,cy:.2,r:.03},imageB:{cx:.2,cy:.3,r:.04}}],prompt:'Meaning?',options:[{id:'yes',label:'Yes'}],correctOptionId:'yes',hintUnits:['a'],hintAdmissionStatus:'ADMITTED',rankedEligible:true,hintAdmissionHash:'a'.repeat(64),hintLadder:ladder};
  const mutableDraft = structuredClone(snapshot);
  const entry = buildDemoEntry(snapshot,{imageA:1,imageB:2});
  (mutableDraft as any).title='mutated';
  (mutableDraft as any).prompt='mutated';
  expect(entry).toMatchObject({key:'demo',title:'answer',prompt:'Meaning?',hintLadder:ladder,hintAdmissionHash:'a'.repeat(64)});
  expect(buildDemoEntry({...snapshot,hintAdmissionStatus:'MISSING',rankedEligible:false,hintAdmissionHash:null,hintLadder:ladder},{imageA:1,imageB:2})).not.toHaveProperty('hintLadder');
});
