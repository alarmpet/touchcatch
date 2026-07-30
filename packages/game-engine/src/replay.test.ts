import { expect,it } from 'vitest';
import { parseReplayBundleV1 } from '../../contracts/src/match.schema.js';
import { replayMatch } from './replay.js';
import { createTestingReplayBundle } from './testing-fixtures.js';
it('rejects a structurally incomplete replay before reduction',()=>expect(()=>replayMatch({bundleVersion:1,engineVersion:'1',ruleset:{},rulesetVersion:'1.0.0',rulesetHash:'bad',contentRevisionId:'r',contentHash:'h',initialState:{phase:'WAITING_FOR_ASSETS',stateRevision:0,nextEventSeq:1},commands:[]})).toThrow());

it('normalizes a frozen pre-learning-hints V1 replay fixture before replay',()=>{
 const current=createTestingReplayBundle();
 const legacyPlayers=current.initialState.players.map(({learningHints:_,...player})=>Object.freeze(player));
 const legacy=Object.freeze({...current,initialState:Object.freeze({...current.initialState,players:Object.freeze(legacyPlayers)})});
 const parsed=parseReplayBundleV1(legacy);
 expect(parsed.initialState.players.map(player=>player.learningHints)).toEqual([null,null]);
 expect(replayMatch(legacy).state.players.map(player=>player.learningHints)).toEqual([null,null]);
 expect('learningHints' in legacy.initialState.players[0]!).toBe(false);
});
