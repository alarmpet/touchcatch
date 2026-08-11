import { describe, expect, it } from 'vitest';
import { buildHomeModel } from './home-model';

describe('buildHomeModel', () => {
  it('keeps private content out of the public card model', () => {
    const model = buildHomeModel({ hasAdmittedContent: true, serverAvailable: false, rewardPolicy: 'DRAFT', rankingEnabled: false });
    expect(model.cards.map(({ id, route, availability }) => ({ id, route, availability }))).toEqual([
      { id: 'spot-difference', route: '/game/spot-difference', availability: 'ENABLED' },
      { id: 'pets', route: '/pets', availability: 'POLICY_DRAFT' },
      { id: 'ranking', route: '/ranking', availability: 'CATEGORY_DISABLED_FOR_RANKED' },
    ]);
    expect(JSON.stringify(model)).not.toMatch(/canonicalAnswer|correctOptionId|privateSolutionHash|differences/);
  });
});
