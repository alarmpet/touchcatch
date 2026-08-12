import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ProfileRouteView } from '../../app/profile';

vi.mock('react-native', () => ({
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
}));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ProfileRouteView social login', () => {
  it('offers Google and Kakao while signed out and routes exact providers', () => {
    const onOAuth = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ProfileRouteView
        session={{ status: 'signed-out' }} email="" password="" busy={false}
        onEmail={vi.fn()} onPassword={vi.fn()} onSignIn={vi.fn()} onSignOut={vi.fn()} onOAuth={onOAuth}
      />);
    });

    const google = tree.root.findByProps({ accessibilityLabel: 'Google로 계속' });
    const kakao = tree.root.findByProps({ accessibilityLabel: 'Kakao로 계속' });
    act(() => { google.props.onPress(); kakao.props.onPress(); });
    expect(onOAuth.mock.calls).toEqual([['google'], ['kakao']]);
  });

  it('does not render provider buttons for a signed-in session', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ProfileRouteView
        session={{ status: 'signed-in', email: null }} email="" password="" busy={false}
        onEmail={vi.fn()} onPassword={vi.fn()} onSignIn={vi.fn()} onSignOut={vi.fn()} onOAuth={vi.fn()}
      />);
    });
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Google로 계속' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Kakao로 계속' })).toHaveLength(0);
  });
});
