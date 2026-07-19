import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateUiReferenceBundle } from './ui.js';

const load = (path:string) => JSON.parse(readFileSync(path,'utf8'));
const valid = () => ({ theme:load('config/ui-theme.v1.json'), screens:load('config/ui-screen-contract.v1.json'), references:load('docs/design/ui-reference/manifest.json'), rights:load('docs/design/ui-reference/rights-manifest.json') });

describe('strict UI reference bundle loader', () => {
  it('accepts the frozen bundle', () => expect(validateUiReferenceBundle(valid())).toEqual([]));
  it('pins exact semantic content, forbidden data, result roles, transitions and accessibility clauses',()=>{const b=valid(),screens=b.screens.screens;expect(screens.HOME_DEFAULT.requiredContentRoles).toEqual(['REPRESENTATIVE_PET','PET_LEVEL_EXP','QUICK_MATCH','FRIEND_MATCH','BOTTOM_TABS_HOME_PET_FUSION_COLLECTION']);expect(screens.MATCH_WORD_HUNT.requiredContentRoles).toEqual(['SCORES','TIMER','FINAL_ANSWER','HINT','TARGET_SCORE_100','FOUND_DIFFERENCE_RINGS','ANSWER_CHALLENGE']);expect(screens.MATCH_WORD_HUNT.forbiddenContentRoles).toEqual(['PET_STATS','FUSION_MATERIALS','PRIVATE_ANSWER']);expect(screens.MATCH_WORD_HUNT.transitionClauses).toContain('MISSION_OVERLAY_TO_BAR_1200MS');expect(screens.RESULT.requiredContentRoles).toEqual(['WIN_LOSS','SCORE_DETAIL','LEARNED_WORDS','PET_EXP','DRAW_POINTS','RETRY']);expect(screens.RESULT.accessibilityClauses).toContain('RESULT_LIVE_REGION');});
  it('rejects semantic role, transition, and accessibility drift',()=>{for(const [screen,key]of[['HOME_DEFAULT','requiredContentRoles'],['MATCH_WORD_HUNT','forbiddenContentRoles'],['MATCH_WORD_HUNT','transitionClauses'],['RESULT','accessibilityClauses']]as const){const b=valid();b.screens.screens[screen][key]=['FORGED'];expect(validateUiReferenceBundle(b)).toContain(`${screen} ${key}`);}});
  it('rejects extra keys, reordered blocks, mixed namespaces and rights/hash drift', () => {
    const a=valid(); a.theme.color.extra='#FFFFFF'; expect(validateUiReferenceBundle(a)).toContain('theme.color extra key');
    const b=valid(); b.screens.screens.HOME_DEFAULT.orderedBlockIds.reverse(); expect(validateUiReferenceBundle(b)).toContain('HOME_DEFAULT block order');
    const c=valid(); c.screens.screens.MATCH_WORD_HUNT.blocks.HUD=['HUD']; expect(validateUiReferenceBundle(c)).toContain('unknown component HUD');
    const d=valid(); d.references.entries[0].sha256='0'.repeat(64); expect(validateUiReferenceBundle(d)).toContain('reference/rights hash link HOME_DEFAULT');
  });
  it('rejects authoritative samples, approval forgery, and component authority', () => {
    const a=valid(); a.references.entries[0].usage='RUNTIME_GOLDEN'; expect(validateUiReferenceBundle(a)).toContain('reference usage HOME_DEFAULT');
    const b=valid(); b.references.betaReady=true; expect(validateUiReferenceBundle(b)).toContain('unapproved betaReady');
    const c=valid(); c.screens.componentPolicy.computesServerState=true; expect(validateUiReferenceBundle(c)).toContain('component authority policy');
  });
});
