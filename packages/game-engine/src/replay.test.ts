import { expect,it } from 'vitest';
import { replayMatch } from './replay.js';
it('rejects a structurally incomplete replay before reduction',()=>expect(()=>replayMatch({bundleVersion:1,engineVersion:'1',ruleset:{},rulesetVersion:'1.0.0',rulesetHash:'bad',contentRevisionId:'r',contentHash:'h',initialState:{phase:'WAITING_FOR_ASSETS',stateRevision:0,nextEventSeq:1},commands:[]})).toThrow());
