import { describe, it, expect, vi } from 'vitest';
import { formatChampionStars } from './ChampionStars';

vi.mock('react-native', () => ({ Text: 'Text', View: 'View' }));

describe('ChampionStars Component logic', () => {
  it('formats star string for current <= 5 and > 5', () => {
    expect(formatChampionStars(3)).toBe('★★★');
    expect(formatChampionStars(12)).toBe('★×12');
  });
});
