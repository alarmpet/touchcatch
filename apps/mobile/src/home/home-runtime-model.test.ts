import { describe, expect, it } from 'vitest';
import { buildRuntimeHomeModel } from './home-runtime-model';

describe('buildRuntimeHomeModel', () => {
  it('opens server-backed destinations when the mobile runtime is configured', () => {
    const cards = buildRuntimeHomeModel('READY').cards;
    expect(cards.find((card) => card.id === 'pets')?.availability).toBe('ENABLED');
    expect(cards.find((card) => card.id === 'ranking')?.availability).toBe('ENABLED');
  });

  it.each(['LOADING', 'CONFIG_ERROR'] as const)('keeps server-backed destinations unavailable for %s', (status) => {
    const cards = buildRuntimeHomeModel(status).cards;
    expect(cards.find((card) => card.id === 'pets')?.availability).not.toBe('ENABLED');
    expect(cards.find((card) => card.id === 'ranking')?.availability).not.toBe('ENABLED');
  });
});
