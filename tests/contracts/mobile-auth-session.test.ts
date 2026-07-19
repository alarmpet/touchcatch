import { describe, expect, it } from 'vitest';
import { createSessionLifecycle } from '../../apps/mobile/src/auth/session.js';

describe('mobile auth session lifecycle', () => {
  it('restores, subscribes, refreshes in foreground, stops in background, and purges on logout', async () => {
    const calls: string[] = [];
    const auth = {
      getSession: async () => { calls.push('restore'); return { data: { session: { access_token: 'opaque' } } }; },
      onAuthStateChange: () => { calls.push('subscribe'); return { data: { subscription: { unsubscribe: () => calls.push('unsubscribe') } } }; },
      startAutoRefresh: () => calls.push('start'),
      stopAutoRefresh: () => calls.push('stop'),
      signOut: async () => { calls.push('signout'); return { error: null }; },
    };
    const lifecycle = createSessionLifecycle(auth, async () => { calls.push('purge'); }, async (sessionIdentity) => { calls.push(`resume:${sessionIdentity}`); });
    await lifecycle.restore();
    const unsubscribe = lifecycle.subscribe();
    lifecycle.onAppState('active');
    lifecycle.onAppState('background');
    await lifecycle.logout();
    unsubscribe();
    expect(calls).toEqual(['restore', 'resume:null', 'subscribe', 'start', 'stop', 'signout', 'purge', 'unsubscribe']);
  });
});
