import { describe, expect, it, vi } from 'vitest';
import { createEmailAuth } from '../../apps/mobile/src/auth/email.js';

const user = { id: '00000000-0000-4000-8000-000000000001' };
function memoryStore() { const values = new Map<string, string>(); return { values, getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } }; }

describe('mobile email authentication', () => {
  it('keeps confirm-email signups pending until a session exists', async () => {
    const ensureAccount = vi.fn();
    const storage = memoryStore();
    const signUp = vi.fn(async () => ({ data: { session: null, user }, error: null }));
    const email = createEmailAuth({
      auth: { signUp }, ensureAccount, storage,
    });

    await expect(email.signUpEmail('player@example.com', 'password123')).resolves.toEqual({ state: 'VERIFICATION_PENDING' });
    expect(ensureAccount).not.toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledWith({ email: 'player@example.com', password: 'password123', options: { emailRedirectTo: 'spotlearn://auth/callback' } });
  });

  it('bootstraps signed-in users and preserves setup failure as an explicit gate', async () => {
    const auth = { signInWithPassword: vi.fn(async () => ({ data: { session: { access_token: 'opaque' }, user }, error: null })) };
    const ready = createEmailAuth({ auth, ensureAccount: vi.fn(async () => undefined), storage: memoryStore() });
    await expect(ready.signInEmail('player@example.com', 'password123')).resolves.toEqual({ state: 'READY' });

    const failed = createEmailAuth({ auth, ensureAccount: vi.fn(async () => { throw new Error('offline'); }), storage: memoryStore() });
    await expect(failed.signInEmail('player@example.com', 'password123')).resolves.toEqual({ state: 'ACCOUNT_SETUP_FAILED' });
  });

  it('uses non-enumerating resend/reset results and completes recovery in order', async () => {
    const calls: string[] = [];
    const storage = memoryStore();
    const email = createEmailAuth({
      auth: {
        resend: vi.fn(async () => ({ data: {}, error: null })),
        resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
        exchangeCodeForSession: vi.fn(async () => { calls.push('exchange'); return { data: { session: {} }, error: null }; }),
        updateUser: vi.fn(async () => { calls.push('update'); return { data: { user }, error: null }; }),
      },
      ensureAccount: vi.fn(async () => undefined), storage,
    });

    await expect(email.resendVerification('player@example.com')).resolves.toEqual({ accepted: true });
    await expect(email.requestPasswordReset('player@example.com')).resolves.toEqual({ accepted: true });
    const recovery = email.completePasswordRecovery('spotlearn://auth/recovery?code=one-time', 'new-password123');
    await expect(Promise.all([recovery, email.completePasswordRecovery('spotlearn://auth/recovery?code=one-time', 'new-password123')])).resolves.toEqual([{ state: 'READY' }, { state: 'READY' }]);
    expect(calls).toEqual(['exchange', 'update']);
  });

  it('rejects recovery callbacks without a pending reset transaction', async () => {
    const email = createEmailAuth({ auth: { exchangeCodeForSession: vi.fn() }, ensureAccount: vi.fn(), storage: memoryStore() });
    await expect(email.completePasswordRecovery('spotlearn://auth/recovery?code=unsolicited', 'new-password123')).rejects.toThrow(/pending/i);
  });

  it('does not let recovery consume another PKCE flow kind', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const email = createEmailAuth({ auth: { exchangeCodeForSession: vi.fn() }, ensureAccount: vi.fn(), storage });
    await expect(email.completePasswordRecovery('spotlearn://auth/recovery?code=unsolicited', 'new-password123')).rejects.toThrow(/pending/i);
  });

  it('resumes password update without re-exchanging after a crash', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'recovery', stage: 'recovery-session-ready' }));
    const exchange = vi.fn();
    const updateUser = vi.fn(async () => ({ data: { user }, error: null }));
    const email = createEmailAuth({ auth: { exchangeCodeForSession: exchange, updateUser }, ensureAccount: vi.fn(async () => undefined), storage });
    await expect(email.completePasswordRecovery(null, 'new-password123')).resolves.toEqual({ state: 'READY' });
    expect(exchange).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledTimes(1);
  });

  it('promotes an ambiguous exchange stage when session restoration proves exchange succeeded', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'recovery', stage: 'exchanging' }));
    const email = createEmailAuth({ auth: {}, ensureAccount: vi.fn(), storage });
    await expect(email.resumeRecovery('recovery-user')).resolves.toBe(true);
    expect(JSON.parse((await storage.getItem('touchcatch.auth.pkce.pending'))!)).toMatchObject({ kind: 'recovery', stage: 'recovery-session-ready' });
  });

  it('does not treat the pre-reset session as a completed recovery exchange', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'recovery', stage: 'exchanging', previousSessionId: 'old-user' }));
    const email = createEmailAuth({ auth: {}, ensureAccount: vi.fn(), storage });
    await expect(email.resumeRecovery('old-user')).resolves.toBe(false);
    expect(JSON.parse((await storage.getItem('touchcatch.auth.pkce.pending'))!).stage).toBe('exchanging');
  });
});
