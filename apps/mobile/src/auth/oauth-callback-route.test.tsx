import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeOAuth = vi.fn();
const getInitialURL = vi.fn();
const addEventListener = vi.fn(() => ({ remove: vi.fn() }));

vi.mock('react-native', () => ({
  Linking: { getInitialURL, addEventListener },
  Text: 'Text', View: 'View',
}));
vi.mock('../runtime/mobile-runtime', () => ({
  useMobileRuntime: () => ({ status: 'READY', oauth: { completeOAuth } }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('OAuth callback route', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('completes the initial deep link through the runtime coordinator', async () => {
    getInitialURL.mockResolvedValue('spotlearn://auth/callback?code=one-time');
    completeOAuth.mockResolvedValue({ state: 'READY' });
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CallbackRoute />); });
    expect(completeOAuth).toHaveBeenCalledWith('spotlearn://auth/callback?code=one-time');
    expect(tree.root.findByProps({ accessibilityLabel: 'OAuth 로그인 상태' }).props.children).toBe('로그인이 완료됐어요.');
  });

  it('shows a generic failure without rendering callback details', async () => {
    getInitialURL.mockResolvedValue('spotlearn://auth/callback?error=sensitive-provider-detail');
    completeOAuth.mockRejectedValue(new Error('private callback detail'));
    const CallbackRoute = (await import('../../app/auth/callback')).default;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CallbackRoute />); });
    const message = tree.root.findByProps({ accessibilityLabel: 'OAuth 로그인 상태' }).props.children;
    expect(message).toBe('로그인을 완료하지 못했어요. 다시 시도해 주세요.');
    expect(JSON.stringify(tree.toJSON())).not.toContain('sensitive-provider-detail');
    expect(JSON.stringify(tree.toJSON())).not.toContain('private callback detail');
  });
});
