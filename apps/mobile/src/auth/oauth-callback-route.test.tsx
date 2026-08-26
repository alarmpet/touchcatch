import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeOAuth = vi.fn();
const getInitialURL = vi.fn();
const addEventListener = vi.fn(() => ({ remove: vi.fn() }));
/** Router params are the warm-start source; tests drive them like any other input. */
const searchParams = vi.fn<() => Record<string, string | string[] | undefined>>(() => ({}));
const replace = vi.fn();

vi.mock('react-native', () => ({
  Linking: { getInitialURL, addEventListener },
  Text: 'Text', View: 'View',
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => searchParams(),
  // The route reads the global params too: the local ones are empty until the screen has
  // focus, which a deep link arrives before.
  useGlobalSearchParams: () => searchParams(),
  useRouter: () => ({ replace }),
}));
vi.mock('../runtime/mobile-runtime', () => ({
  useMobileRuntime: () => ({ status: 'READY', oauth: { completeOAuth } }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('OAuth callback route', () => {
  beforeEach(() => { vi.clearAllMocks(); searchParams.mockReturnValue({}); });

  it('completes the initial deep link through the runtime coordinator', async () => {
    getInitialURL.mockResolvedValue('touchcatch://auth/callback?code=one-time');
    completeOAuth.mockResolvedValue({ state: 'READY' });
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CallbackRoute />); });
    expect(completeOAuth).toHaveBeenCalledWith('touchcatch://auth/callback?code=one-time');
    expect(tree.root.findByProps({ accessibilityLabel: 'OAuth 로그인 상태' }).props.children).toBe('로그인이 완료됐어요.');
  });

  it('shows a generic failure without rendering callback details', async () => {
    getInitialURL.mockResolvedValue('touchcatch://auth/callback?error=sensitive-provider-detail');
    completeOAuth.mockRejectedValue(new Error('private callback detail'));
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CallbackRoute />); });
    const message = tree.root.findByProps({ accessibilityLabel: 'OAuth 로그인 상태' }).props.children;
    expect(message).toBe('로그인을 완료하지 못했어요. 다시 시도해 주세요.');
    expect(JSON.stringify(tree.toJSON())).not.toContain('sensitive-provider-detail');
    expect(JSON.stringify(tree.toJSON())).not.toContain('private callback detail');
  });

  it('completes from router params when the app was already running', async () => {
    // getInitialURL only reports the URL that launched the process. The app is always already
    // running here — it is what opened the browser — so this was the real-device failure.
    getInitialURL.mockResolvedValue(null);
    searchParams.mockReturnValue({ code: 'warm-start-code' });
    completeOAuth.mockResolvedValue({ state: 'READY' });
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CallbackRoute />); });
    expect(completeOAuth).toHaveBeenCalledWith('touchcatch://auth/callback?code=warm-start-code');
    expect(tree.root.findByProps({ accessibilityLabel: 'OAuth 로그인 상태' }).props.children).toBe('로그인이 완료됐어요.');
  });

  it('refuses router params carrying anything beyond a lone code', async () => {
    // Rebuilding the URL must not become a way around the coordinator's exact-shape rule.
    getInitialURL.mockResolvedValue(null);
    searchParams.mockReturnValue({ code: 'c', state: 'extra' });
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CallbackRoute />); });
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: 'OAuth 로그인 상태' }).props.children).toBe('로그인을 완료하지 못했어요. 다시 시도해 주세요.');
  });

  it('prefers a real launch URL over the reconstructed one', async () => {
    getInitialURL.mockResolvedValue('touchcatch://auth/callback?code=cold');
    searchParams.mockReturnValue({ code: 'warm' });
    completeOAuth.mockResolvedValue({ state: 'READY' });
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    await act(async () => { create(<CallbackRoute />); });
    expect(completeOAuth).toHaveBeenCalledWith('touchcatch://auth/callback?code=cold');
  });

  it('hands a completed sign-in back to the profile instead of parking on the callback', async () => {
    // The screen renders without the tab bar, so staying here strands the user on a success
    // card they can only leave with the hardware back button.
    getInitialURL.mockResolvedValue('touchcatch://auth/callback?code=one-time');
    completeOAuth.mockResolvedValue({ state: 'READY' });
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    await act(async () => { create(<CallbackRoute />); });
    // `replace`, not `push`: Back must not return to a callback whose code is already spent.
    expect(replace).toHaveBeenCalledWith('/profile');
  });

  it.each([
    ['account setup failed', { state: 'ACCOUNT_SETUP_FAILED' as const }, undefined],
    ['completion threw', undefined, new Error('private callback detail')],
  ])('stays put so the user can read the message when %s', async (_case, resolved, thrown) => {
    getInitialURL.mockResolvedValue('touchcatch://auth/callback?code=one-time');
    if (thrown) completeOAuth.mockRejectedValue(thrown); else completeOAuth.mockResolvedValue(resolved);
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    await act(async () => { create(<CallbackRoute />); });
    expect(replace).not.toHaveBeenCalled();
  });
});
