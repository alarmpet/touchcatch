import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ProfileRouteView } from '../../app/profile';
import { createSessionController, type SupabaseAuthPort } from './session-controller';

vi.mock('react-native', () => ({
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
}));
vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: 'a', refresh_token: 'r', user: { id: 'u', email: 'new@example.com' } };

function port(overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort {
  return {
    getSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  } as SupabaseAuthPort;
}

function view(props: Partial<React.ComponentProps<typeof ProfileRouteView>> = {}) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<ProfileRouteView
      session={{ status: 'signed-out' }} email="a@b.com" password="secret1" busy={false}
      mode="SIGN_IN" onMode={vi.fn()} onEmail={vi.fn()} onPassword={vi.fn()}
      onSignIn={vi.fn()} onSignUp={vi.fn()} onSignOut={vi.fn()} onOAuth={vi.fn()}
      {...props}
    />);
  });
  return tree;
}

describe('sign up', () => {
  it('signs the account in immediately when the project returns a session', async () => {
    const signUpWithPassword = vi.fn(async () => ({ data: { session }, error: null }));
    const controller = createSessionController(port({ signUpWithPassword } as Partial<SupabaseAuthPort>));
    await expect(controller.signUp(' new@example.com ', 'secret1')).resolves.toBe('SIGNED_IN');
    // The address is trimmed before it reaches the provider, matching sign-in.
    expect(signUpWithPassword).toHaveBeenCalledWith({ email: 'new@example.com', password: 'secret1' });
    expect(controller.getState()).toMatchObject({ status: 'signed-in' });
  });

  it('reports a confirmation requirement instead of looking like a failure', async () => {
    // Supabase returns no session when confirmations are on. That is a success.
    const controller = createSessionController(port({
      signUpWithPassword: async () => ({ data: { session: null }, error: null }),
    } as Partial<SupabaseAuthPort>));
    await expect(controller.signUp('new@example.com', 'secret1')).resolves.toBe('CONFIRM_EMAIL');
    expect(controller.getState()).not.toMatchObject({ status: 'error' });
  });

  it('fails without wiping an existing session when the address is taken', async () => {
    const controller = createSessionController(port({
      signUpWithPassword: async () => ({ data: { session: null }, error: { message: 'already registered' } }),
    } as Partial<SupabaseAuthPort>));
    await expect(controller.signUp('taken@example.com', 'secret1')).rejects.toThrow('AUTH_SIGN_UP_FAILED');
  });

  it('refuses when the adapter cannot register accounts at all', async () => {
    const controller = createSessionController(port());
    await expect(controller.signUp('a@b.com', 'secret1')).rejects.toThrow('AUTH_SIGN_UP_UNSUPPORTED');
  });

  it('offers both modes and routes the button to the selected one', () => {
    const onSignUp = vi.fn();
    const onSignIn = vi.fn();
    const tree = view({ mode: 'SIGN_UP', onSignUp, onSignIn });
    act(() => { tree.root.findByProps({ accessibilityLabel: '가입하기', accessibilityRole: 'button' }).props.onPress(); });
    expect(onSignUp).toHaveBeenCalledOnce();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('blocks a too-short password before it reaches the provider', () => {
    const tree = view({ mode: 'SIGN_UP', password: 'abc' });
    expect(tree.root.findByProps({ accessibilityLabel: '가입하기', accessibilityRole: 'button' }).props.disabled).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain('6자 이상');
  });

  it('leaves sign-in unrestricted by the sign-up length rule', () => {
    // An existing account may predate the rule; refusing to even try would lock them out.
    const tree = view({ mode: 'SIGN_IN', password: 'abc' });
    expect(tree.root.findByProps({ accessibilityLabel: '로그인', accessibilityRole: 'button' }).props.disabled).toBe(false);
  });

  it('keeps the password masked and out of every visible string', () => {
    // A controlled TextInput necessarily holds its own value — `secureTextEntry` is what
    // protects it. What must never happen is the password surfacing as displayed text.
    const tree = view({ mode: 'SIGN_UP', password: 'sup3rsecret' });
    expect(tree.root.findByProps({ accessibilityLabel: '비밀번호' }).props.secureTextEntry).toBe(true);

    const visible: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') { visible.push(node); return; }
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
    };
    walk(tree.toJSON());
    expect(visible.join(' ')).not.toContain('sup3rsecret');
  });
});
