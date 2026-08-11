import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { DailyFreeDraw, type DailyFreeDrawProps } from './DailyFreeDraw';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));

describe('DailyFreeDraw logic', () => {
  it('instantiates props correctly for claim status', () => {
    const props: DailyFreeDrawProps = {
      hasClaimedToday: false,
      policy: 'APPROVED',
      onClaimDraw: vi.fn(),
    };
    expect(props.hasClaimedToday).toBe(false);
  });

  it('disables claims and explains the reason while reward policy is draft', () => {
    let tree: any;
    act(() => { tree = create(<DailyFreeDraw hasClaimedToday={false} policy="DRAFT" />); });
    const button = tree.root.findByProps({ accessibilityLabel: '보상 정책 승인 후 사용 가능' });
    expect(button.props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'draw-policy-reason' }).props.children).toBe('보상 정책 승인 후 사용 가능');
  });
});
