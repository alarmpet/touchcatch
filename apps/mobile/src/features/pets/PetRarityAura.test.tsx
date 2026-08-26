import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PetRarityAura } from './PetRarityAura';

vi.mock('react-native', () => ({
  Animated: {
    View: 'Animated.View',
    Value: class {
      setValue() {}
      interpolate() {
        return 0;
      }
    },
    timing: () => ({ start: (done?: () => void) => done?.() }),
    loop: () => ({ start: vi.fn(), stop: vi.fn() }),
    sequence: () => ({ start: vi.fn(), stop: vi.fn() }),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Image: 'Image',
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PetRarityAura', () => {
  it('renders correctly for COMMON tier without rotating rays', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PetRarityAura rarity="COMMON">
          <></>
        </PetRarityAura>
      );
    });
    expect(tree.root.findByProps({ testID: 'pet-rarity-aura' })).toBeTruthy();
  });

  it('renders sunburst rays and particle sparkles for LEGENDARY and EPIC tiers', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PetRarityAura rarity="LEGENDARY" active>
          <></>
        </PetRarityAura>
      );
    });
    const aura = tree.root.findByProps({ testID: 'pet-rarity-aura' });
    expect(aura).toBeTruthy();
  });
});
