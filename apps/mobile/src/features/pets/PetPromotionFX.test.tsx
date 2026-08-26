import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PetPromotionFX } from './PetPromotionFX';

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
    spring: () => ({ start: (done?: () => void) => done?.() }),
    sequence: () => ({ start: (done?: () => void) => done?.() }),
    loop: () => ({ start: vi.fn(), stop: vi.fn() }),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Image: 'Image',
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PetPromotionFX', () => {
  it('renders tier up celebration banner and handles dismiss', () => {
    const onDismiss = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PetPromotionFX
          petName="코코"
          previousRarity="RARE"
          newRarity="EPIC"
          artUrl="https://cdn.example/coco.png"
          onDismiss={onDismiss}
        />
      );
    });
    const overlay = tree.root.findByProps({ testID: 'pet-promotion-fx' });
    expect(overlay).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '코코 이미지' })).toBeTruthy();
    const dismissButton = tree.root.findByProps({ accessibilityLabel: '승급 확인' });
    act(() => {
      dismissButton.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
