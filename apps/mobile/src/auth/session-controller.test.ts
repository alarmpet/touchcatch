import { describe, expect, it, vi } from 'vitest';
import { createSessionController } from './session-controller.js';

describe('mobile session controller', () => {
  it('tracks access sessions, refreshes once, and ignores callbacks after disposal', async () => {
    let callback: ((event: string, session: { access_token: string; user: { email?: string } } | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'access-1', user: { email: 'learner@example.test' } } }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'access-2', user: { email: 'learner@example.test' } } }, error: null }),
      onAuthStateChange: vi.fn((next: typeof callback) => { callback = next; return { data: { subscription: { unsubscribe } } }; }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    };
    const controller = createSessionController(auth);
    await controller.initialize();
    expect(await controller.getAccessToken()).toBe('access-1');
    expect(await controller.refreshAccessToken()).toBe('access-2');
    const listener = vi.fn();
    const stop = controller.subscribe(listener);
    callback?.('SIGNED_IN', { access_token: 'access-3', user: {} });
    expect(listener).toHaveBeenLastCalledWith({ status: 'signed-in', email: null });
    stop();
    controller.dispose();
    callback?.('SIGNED_OUT', null);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(controller.getState()).toEqual({ status: 'signed-in', email: null });
  });

  it('uses local-only sign-out and never exposes refresh tokens', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      refreshSession: vi.fn(), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), signOut,
    };
    const controller = createSessionController(auth);
    await controller.initialize();
    await controller.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(controller.getState()).toEqual({ status: 'signed-out' });
    expect(controller).not.toHaveProperty('getRefreshToken');
  });

  it('does not subscribe when disposed while initial session loading is in flight', async () => {
    let finish: ((value: { data: { session: null }; error: null }) => void) | undefined;
    const onAuthStateChange = vi.fn();
    const controller = createSessionController({
      getSession: () => new Promise((resolve) => { finish = resolve; }),
      refreshSession: vi.fn(), onAuthStateChange,
      signInWithPassword: vi.fn(), signOut: vi.fn(),
    });
    const initializing = controller.initialize();
    controller.dispose();
    finish?.({ data: { session: null }, error: null });
    await initializing;
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });

  it('projects thrown storage/client failures as a stable public auth error', async () => {
    const controller = createSessionController({
      getSession: vi.fn().mockRejectedValue(new Error('private storage detail')),
      refreshSession: vi.fn(), onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(), signOut: vi.fn(),
    });
    await expect(controller.initialize()).resolves.toBeUndefined();
    expect(controller.getState()).toEqual({ status: 'error', code: 'AUTH_UNAVAILABLE' });
  });
});
