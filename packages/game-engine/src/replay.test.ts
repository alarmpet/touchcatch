import { expect,it } from 'vitest';
import { replayMatch } from './replay.js';
it('rejects a replay whose ruleset hash does not match',()=>expect(()=>replayMatch({bundleVersion:1,engineVersion:'1',ruleset:{},rulesetVersion:'1.0.0',rulesetHash:'bad',contentRevisionId:'r',contentHash:'h',initialState:{phase:'WAITING_FOR_ASSETS',stateRevision:0,nextEventSeq:1,engineVersion:'1',rulesetVersion:'1.0.0',rulesetHash:'bad',contentRevisionId:'r',contentHash:'h'},commands:[]} as any)).toThrow(/ruleset/i));
