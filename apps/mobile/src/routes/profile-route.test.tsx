import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ProfileRouteView } from '../../app/profile.js';

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable', TextInput: 'TextInput' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('profile auth route', () => {
  it('shows local email authentication and never renders token data', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ProfileRouteView session={{ status: 'signed-out' }} email="" password="" busy={false} onEmail={vi.fn()} onPassword={vi.fn()} onSignIn={vi.fn()} onSignOut={vi.fn()} onOAuth={vi.fn()} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '이메일' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '비밀번호' }).props.secureTextEntry).toBe(true);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/access[_-]?token|refresh[_-]?token/iu);
  });
});
