import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateUiReferenceBundle } from './ui.js';

const load = (path:string) => JSON.parse(readFileSync(path,'utf8'));
const valid = () => ({ theme:load('config/ui-theme.v1.json'), screens:load('config/ui-screen-contract.v1.json'), references:load('docs/design/ui-reference/manifest.json'), rights:load('docs/design/ui-reference/rights-manifest.json') });

describe('strict UI reference bundle loader', () => {
  it('accepts the frozen bundle', () => expect(validateUiReferenceBundle(valid())).toEqual([]));
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
