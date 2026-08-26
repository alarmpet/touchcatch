import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PetDrawCeremony } from './PetDrawCeremony';

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
    loop: () => ({ start: vi.fn(), stop: vi.fn() }),
    sequence: () => ({ start: vi.fn(), stop: vi.fn() }),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Image: 'Image',
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PetDrawCeremony', () => {
  it('renders pending capsule state with skip ability', () => {
    const onSkip = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PetDrawCeremony
          rarity="EPIC"
          petName="루나"
          copies={1}
          opened={false}
          onSkip={onSkip}
        />
      );
    });
    const button = tree.root.findByProps({ testID: 'pet-draw-ceremony' });
    expect(button).toBeTruthy();
    act(() => {
      button.props.onPress();
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('renders opened state with pet details and aura', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PetDrawCeremony
          rarity="LEGENDARY"
          petName="피닉스"
          copies={2}
          opened={true}
          artUrl="https://cdn.example/phoenix.png"
        />
      );
    });
    expect(tree.root.findByProps({ accessibilityLabel: '피닉스 이미지' })).toBeTruthy();
  });
});
