import { describe, expect, it } from 'vitest';
import economy from '../../../../../config/economy.v1.json' with { type: 'json' };
import { drawOdds, drawOddsLine } from './draw-odds.js';

/**
 * The rates on this screen are a legal disclosure, not decoration: 게임산업진흥에 관한 법률
 * requires the published odds to be the odds actually drawn from. These assert the line is
 * derived from `config/economy.v1.json` rather than transcribed, which is what it used to be.
 */
describe('daily free draw odds', () => {
  it('renders every rarity in the config, from the config', () => {
    const configured = economy.draw.probabilities as Readonly<Record<string, number>>;
    const rendered = drawOdds();
    expect(rendered.map((odd) => odd.rarity).sort()).toEqual(Object.keys(configured).sort());
    for (const odd of rendered) {
      expect(odd.percent).toBe(Number((configured[odd.rarity]! * 100).toFixed(4)));
    }
  });

  it('states the current config exactly', () => {
    expect(drawOddsLine()).toBe('등장 확률: 일반 60% · 고급 25% · 희귀 10% · 영웅 4% · 전설 1%');
  });

  it('follows the config when the table changes, which a literal could not', () => {
    expect(drawOddsLine({ COMMON: 0.5, UNCOMMON: 0.3, RARE: 0.15, EPIC: 0.045, LEGENDARY: 0.005 }))
      .toBe('등장 확률: 일반 50% · 고급 30% · 희귀 15% · 영웅 4.5% · 전설 0.5%');
  });

  it('shows a rarity the label table has never heard of rather than dropping it', () => {
    // Silently omitting an unknown key would understate the table -- the exact failure mode
    // this module exists to prevent, just arriving from the other direction.
    const line = drawOddsLine({ COMMON: 0.9, MYTHIC: 0.1 });
    expect(line).toBe('등장 확률: 일반 90% · MYTHIC 10%');
  });

  it('does not leak binary floating point into a published number', () => {
    // 0.07 * 100 is 7.000000000000001 in IEEE 754; a user-facing legal figure must not say that.
    expect(drawOddsLine({ COMMON: 0.93, RARE: 0.07 })).toBe('등장 확률: 일반 93% · 희귀 7%');
  });

  it('orders common to legendary regardless of key order in the config', () => {
    const line = drawOddsLine({ LEGENDARY: 0.01, COMMON: 0.94, EPIC: 0.05 });
    expect(line).toBe('등장 확률: 일반 94% · 영웅 5% · 전설 1%');
  });
});
