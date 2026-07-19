import { describe, expect, it, vi } from 'vitest';
import { captureRecoveryLinks, consumeOAuthLinks } from '../../apps/mobile/src/auth/links.js';

function linking(initial: string | null) {
  let listener: ((event: { url: string }) => void) | undefined;
  return { adapter: { getInitialURL: async () => initial, addEventListener: (_type: 'url', next: (event: { url: string }) => void) => { listener = next; return { remove: vi.fn() }; } }, emit: (url: string) => listener?.({ url }) };
}

describe('auth deep-link lifecycle', () => {
  it('reports callback failures instead of swallowing them', async () => {
    const source = linking('spotlearn://auth/callback?code=bad');
    const onError = vi.fn();
    const done = consumeOAuthLinks(source.adapter, async () => { throw new Error('expired'); }, { onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('AUTH_CALLBACK_FAILED'));
    done();
  });

  it('propagates the exact resolved gate instead of assuming READY', async () => {
    const source = linking('spotlearn://auth/callback?code=setup-failed');
    const onResult = vi.fn();
    const done = consumeOAuthLinks(source.adapter, async () => ({ state: 'ACCOUNT_SETUP_FAILED' }), { onResult });
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith({ state: 'ACCOUNT_SETUP_FAILED' }));
    done();
  });

  it('retains exact cold and warm recovery links', async () => {
    const source = linking('spotlearn://auth/recovery?code=cold');
    const recovery = captureRecoveryLinks(source.adapter);
    await vi.waitFor(() => expect(recovery.current()).toContain('code=cold'));
    source.emit('spotlearn://auth/recovery?code=warm');
    expect(recovery.current()).toContain('code=warm');
    source.emit('spotlearn://auth/callback?code=wrong-kind');
    expect(recovery.current()).toContain('code=warm');
    recovery.dispose();
  });
});
