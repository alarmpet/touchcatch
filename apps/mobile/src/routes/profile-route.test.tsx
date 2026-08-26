import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ProfileRouteView } from '../../app/profile.js';

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable', TextInput: 'TextInput', Linking: { openURL: async () => true } }));
vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('profile auth route', () => {
  it('shows local email authentication and never renders token data', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ProfileRouteView session={{ status: 'signed-out' }} email="" password="" busy={false} onEmail={vi.fn()} onPassword={vi.fn()} mode="SIGN_IN" onMode={vi.fn()} onSignIn={vi.fn()} onSignUp={vi.fn()} onSignOut={vi.fn()} onOAuth={vi.fn()} appVersion="1.0.0" />); });
    expect(tree.root.findByProps({ accessibilityLabel: '이메일' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '비밀번호' }).props.secureTextEntry).toBe(true);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/access[_-]?token|refresh[_-]?token/iu);
  });

  // Play requires an in-app deletion path, but a button that only signs the device out is a
  // false claim about the player's data. Signed-in is the state where the old fake button
  // rendered, so that is the state this pins.
  it('offers no account-deletion action until deletion actually deletes', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ProfileRouteView session={{ status: 'signed-in', email: 'a@test.com' }} email="" password="" busy={false} onEmail={vi.fn()} onPassword={vi.fn()} mode="SIGN_IN" onMode={vi.fn()} onSignIn={vi.fn()} onSignUp={vi.fn()} onSignOut={vi.fn()} onOAuth={vi.fn()} appVersion="1.0.0" />); });
    expect(tree.root.findAllByProps({ accessibilityLabel: '회원 탈퇴' })).toEqual([]);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/탈퇴|계정 삭제/u);
  });
});
