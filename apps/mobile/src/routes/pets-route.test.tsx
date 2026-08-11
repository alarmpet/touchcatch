import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PetsRouteView } from '../../app/pets.js';

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable', Image: 'Image' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('pets live route view', () => {
  it.each(['LOADING', 'SIGNED_OUT', 'DISABLED', 'ERROR'] as const)('renders %s explicitly', (status) => {
    const state = status === 'DISABLED' ? { status, code: 'REWARD_POLICY_NOT_APPROVED' }
      : status === 'ERROR' ? { status, code: 'NETWORK_UNAVAILABLE', retry: 'LOAD' as const }
        : { status };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetsRouteView state={state} onClaim={vi.fn()} onPromote={vi.fn()} onRetry={vi.fn()} />); });
    expect(tree.root.findByProps({ accessibilityLabel: `펫 화면 상태 ${status}` })).toBeTruthy();
  });
});
