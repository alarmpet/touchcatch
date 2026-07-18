import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import rules from '../../../config/ruleset.v1.json' with { type: 'json' };
import { parseRuleset } from '../../contracts/src/rules.schema.js';
import { createMatchInitialState } from './reducer.js';

export const privateSolutionFixture = {
  schemaVersion: '1.0.0' as const, contentRevisionId: '00000000-0000-4000-8000-000000000010', privateSolutionHash: 'b'.repeat(64),
  differences: Array.from({length: 10},(_,i)=>({objectiveId:`d${i}`,tier:i<7?'NORMAL' as const:'HARD' as const,hitboxes:{imageA:{cx:.1+i*.05,cy:.2,r:.01},imageB:{cx:.1+i*.05,cy:.2,r:.01}}})),
  wordHunts: [{missionId:'w1',kind:'NORMAL' as const,publicPrompt:'one',hitboxes:{imageA:{cx:.2,cy:.8,r:.02},imageB:{cx:.2,cy:.8,r:.02}}},{missionId:'w2',kind:'NORMAL' as const,publicPrompt:'two',hitboxes:{imageA:{cx:.4,cy:.8,r:.02},imageB:{cx:.4,cy:.8,r:.02}}},{missionId:'w3',kind:'SPECIAL' as const,publicPrompt:'three',hitboxes:{imageA:{cx:.6,cy:.8,r:.02},imageB:{cx:.6,cy:.8,r:.02}}}],
  suddenDeath:{objectiveId:'sd',hitboxes:{imageA:{cx:.9,cy:.9,r:.02},imageB:{cx:.9,cy:.9,r:.02}}},
  finalChallenge:{canonicalAnswer:'cat',aliases:['kitty'],hintUnits:['c','a','t'],meaning:{prompt:'meaning',options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],correctOptionId:'a'}}
};
const {privateSolutionHash:_ignoredHash,...hashableSolution}=privateSolutionFixture;
privateSolutionFixture.privateSolutionHash=canonicalJsonSha256(hashableSolution);

export const testingRules=parseRuleset(rules);
export function createTestingReplayBundle(){const matchId='00000000-0000-4000-8000-000000000001';const asset=(side:'A'|'B')=>({side,url:`https://cdn.test/${side}.png`,sha256:(side==='A'?'a':'c').repeat(64),encodedBytes:1,width:1,height:1,mimeType:'image/png' as const});const created=createMatchInitialState({matchId,createdAtMs:0,engineVersion:'1',rulesetHash:canonicalJsonSha256(rules),playerIds:['p1','p2'],contentManifest:{contentRevisionId:privateSolutionFixture.contentRevisionId,contentLanguage:'en',publicContentHash:'d'.repeat(64),privateSolutionHash:privateSolutionFixture.privateSolutionHash,assetPolicyVersion:'1.0.0',expectedAssets:[asset('A'),asset('B')]},privateSolution:privateSolutionFixture,randomSchedule:{wordHunts:[{kind:'NORMAL',missionId:'w1',startsAfterMs:16000,endsAfterMs:21000},{kind:'NORMAL',missionId:'w2',startsAfterMs:34000,endsAfterMs:39000},{kind:'SPECIAL',missionId:'w3',startsAfterMs:60000,endsAfterMs:65000}],hintRevealOrder:[2,0,1],suddenDeathObjectiveId:'sd'}},testingRules);return {bundleVersion:1 as const,engineVersion:'1',ruleset:testingRules,rulesetVersion:'1.0.0' as const,rulesetHash:canonicalJsonSha256(rules),contentRevisionId:privateSolutionFixture.contentRevisionId,contentLanguage:'en' as const,contentHash:'d'.repeat(64),initialState:created.state,commands:[]};}
