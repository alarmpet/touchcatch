import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertPublicUiValue, buildBattleScreen, createTapIntent, layoutContainedPair, parseUiBundle } from '../../apps/mobile/src/ui/battle-shell.js';

const snapshot = JSON.parse(readFileSync('tests/fixtures/public-match-snapshot.json','utf8'));

describe('Task 7 acceptance regressions', () => {
  it('rejects every non-playable input state and malformed coordinates', () => {
    for (const phase of ['WAITING_FOR_ASSETS','COUNTDOWN','SETTLING','TIEBREAK_EVAL','FINISHED','CANCELLED']) {
      expect(createTapIntent({...snapshot,phase}, {side:'A',x:.5,y:.5})).toBeNull();
    }
    for (const connection of ['OFFLINE','RECONNECTING']) expect(createTapIntent({...snapshot,connection},{side:'A',x:.5,y:.5})).toBeNull();
    expect(createTapIntent({...snapshot,pendingIntentId:'p'},{side:'A',x:.5,y:.5})).toBeNull();
    expect(createTapIntent({...snapshot,viewerInput:{enabled:false,reason:'INPUT_LOCKED'}},{side:'A',x:.5,y:.5})).toBeNull();
    for (const x of [NaN,Infinity,-.01,1.01]) expect(createTapIntent(snapshot,{side:'A',x,y:.5})).toBeNull();
  });

  it('keeps A/B contain rectangles synchronized and offset after resize', () => {
    for (const viewport of [{width:320,height:568},{width:390,height:844},{width:412,height:915}]) {
      const pair=layoutContainedPair(viewport,{width:941,height:1672},8);
      expect(pair.a.content).toEqual(pair.b.content);
      expect(pair.b.viewport.y).toBe(pair.a.viewport.height+8);
    }
    expect(() => layoutContainedPair({width:0,height:10},{width:1,height:1},0)).toThrow();
  });

  it('uses a real public projection fixture and exposes native accessibility semantics', () => {
    const screen=buildBattleScreen(snapshot,{platform:'ios',reducedMotion:true,textScale:2});
    expect(screen.nativeTree.type).toBe('SafeAreaView');
    expect(screen.nativeTree.props.accessibilityViewIsModal).toBe(false);
    expect(JSON.stringify(screen)).not.toMatch(/correctOptionId|canonicalAnswer|hitboxes/i);
  });

  it('recursively rejects private keys at arbitrary nesting and arrays',()=>{
    expect(()=>assertPublicUiValue({safe:[{nested:{canonicalAnswer:'leak'}}]})).toThrow(/canonicalAnswer/);
    expect(()=>assertPublicUiValue({safe:{correctOptionId:'x'}})).toThrow(/correctOptionId/);
    expect(()=>assertPublicUiValue(snapshot)).not.toThrow();
  });

  it('validates all nested UI documents with Draft 2020-12 schemas', () => {
    const bundle={theme:JSON.parse(readFileSync('config/ui-theme.v1.json','utf8')),screens:JSON.parse(readFileSync('config/ui-screen-contract.v1.json','utf8')),references:JSON.parse(readFileSync('docs/design/ui-reference/manifest.json','utf8')),rights:JSON.parse(readFileSync('docs/design/ui-reference/rights-manifest.json','utf8')),assets:JSON.parse(readFileSync('config/ui-runtime-assets.v1.json','utf8'))};
    expect(parseUiBundle(bundle).assets.lifecycle).toBe('DRAFT');
    expect(() => parseUiBundle({...bundle,theme:{...bundle.theme,color:{...bundle.theme.color,extra:'#fff'}}})).toThrow();
    expect(() => parseUiBundle({...bundle,assets:{...bundle.assets,lifecycle:'APPROVED'}})).toThrow();
  });
});
