import { describe, expect, it } from 'vitest';
import { buildRuntimeHomeModel } from './home-runtime-model';

describe('buildRuntimeHomeModel', () => {
  it('opens server-backed destinations when the mobile runtime is configured', () => {
    const cards = buildRuntimeHomeModel('READY', { hasAdmittedContent: true, rewardSurfacesEnabled: true }).cards;
    expect(cards.find((card) => card.id === 'pets')?.availability).toBe('ENABLED');
    expect(cards.find((card) => card.id === 'ranking')?.availability).toBe('ENABLED');
  });

  it('hides pet and ranking rewards unless the Android beta explicitly enables them', () => {
    const cards = buildRuntimeHomeModel('READY', { hasAdmittedContent: true }).cards;
    expect(cards.find((card) => card.id === 'spot-difference')?.availability).toBe('ENABLED');
    expect(cards.find((card) => card.id === 'pets')?.availability).toBe('POLICY_DRAFT');
    expect(cards.find((card) => card.id === 'ranking')?.availability).not.toBe('ENABLED');
  });

  it.each(['LOADING', 'CONFIG_ERROR'] as const)('keeps server-backed destinations unavailable for %s', (status) => {
    const cards = buildRuntimeHomeModel(status, { hasAdmittedContent: true }).cards;
    expect(cards.find((card) => card.id === 'pets')?.availability).not.toBe('ENABLED');
    expect(cards.find((card) => card.id === 'ranking')?.availability).not.toBe('ENABLED');
  });

  it('keeps the learning route unavailable without admitted content', () => {
    const card = buildRuntimeHomeModel('READY', { hasAdmittedContent: false }).cards[0];
    expect(card?.availability).toBe('CONTENT_NOT_ADMITTED');
  });
});
