import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
type Screen = { orderedBlockIds:string[];blocks:Record<string,string[]>;requiredBehaviorIds:string[] };
const contract = JSON.parse(readFileSync('config/ui-screen-contract.v1.json','utf8')) as {
  componentIds:string[];componentPolicy:Record<string,unknown>;screens:Record<string,Screen> & {HOME_DEFAULT:Screen;MATCH_WORD_HUNT:Screen};
};

it('pins exact component boundaries, block order, behavior and one-way policies', () => {
  expect(contract.componentIds).toHaveLength(16);
  expect(contract.componentIds[0]).toBe('ScreenScaffold');
  expect(contract.componentIds[15]).toBe('FusionGuide');
  expect(contract.componentPolicy).toMatchObject({ viewModelOnly:true, computesServerState:false, emitsIntentOnly:true, pendingBeforeServerConfirmation:true });
  expect(contract.screens.HOME_DEFAULT.orderedBlockIds).toEqual(['BRAND_HEADER','PROFILE_CURRENCY','PET_HERO','PRIMARY_ACTIONS','SECONDARY_MODES','DAILY_MISSION','LEARNING_MESSAGE','BOTTOM_TABS']);
  expect(contract.screens.MATCH_WORD_HUNT.requiredBehaviorIds).toContain('FINAL_RUSH_COORDINATE_INVARIANCE');
  const allowed = new Set(contract.componentIds);
  for (const screen of Object.values(contract.screens)) for (const ids of Object.values(screen.blocks)) for (const id of ids) expect(allowed.has(id)).toBe(true);
});
