import { expect, it, vi } from 'vitest';
import { createIdentityCoordinator } from './linking';

const google = { id: 'google-id', identity_id: 'google-id', provider: 'google' };
const email = { id: 'email-id', identity_id: 'email-id', provider: 'email' };

it('verifies a server-issued reauthentication OTP before linking a fresh provider', async () => {
  const calls: string[] = [];
  const auth = {
    verifyOtp: vi.fn(async () => { calls.push('reauth'); return { error: null }; }),
    getUserIdentities: vi.fn(async () => { calls.push('identities'); return { data: { identities: [email] }, error: null }; }),
    linkIdentity: vi.fn(async () => { calls.push('link'); return { data: { url: 'https://accounts.google.test' }, error: null }; }),
    unlinkIdentity: vi.fn(),
  };
  const result = await createIdentityCoordinator(auth).link('google', { email: 'player@example.test', token: '123456' });
  expect(result).toEqual({ status: 'AUTHORIZATION_REQUIRED', url: 'https://accounts.google.test' });
  expect(calls).toEqual(['reauth', 'identities', 'link']);
  expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'spotlearn://auth/callback', skipBrowserRedirect: true } });
});

it('opens and completes the identity-link PKCE callback then verifies fresh identities', async () => {
  const values = new Map<string,string>(); const storage = { getItem: async (key:string) => values.get(key) ?? null, setItem: async (key:string,value:string) => { values.set(key,value); }, removeItem: async (key:string) => { values.delete(key); } };
  const getUserIdentities = vi.fn().mockResolvedValueOnce({ data: { identities: [email] }, error: null }).mockResolvedValueOnce({ data: { identities: [email, google] }, error: null });
  const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
  const coordinator = createIdentityCoordinator({ verifyOtp: async () => ({ error: null }), getUserIdentities, linkIdentity: async () => ({ data: { url: 'https://accounts.google.test' }, error: null }), unlinkIdentity: vi.fn(), exchangeCodeForSession }, { storage, browser: { openAuthSessionAsync: async () => ({ type: 'success', url: 'spotlearn://auth/callback?code=pkce-code' }) } });
  await expect(coordinator.link('google', { email: 'player@example.test', token: '123456' })).resolves.toEqual({ status: 'LINKED', provider: 'google' });
  expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
  expect(values.size).toBe(0);
});

it('deduplicates simultaneous browser and app callback completion', async () => {
  const values = new Map([['touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'identity-link', provider: 'google' })]]); const storage = { getItem: async (key:string) => values.get(key) ?? null, setItem: async (key:string,value:string) => { values.set(key,value); }, removeItem: async (key:string) => { values.delete(key); } };
  const exchangeCodeForSession = vi.fn(async () => { await Promise.resolve(); return { error: null }; });
  const coordinator = createIdentityCoordinator({ verifyOtp: vi.fn(), getUserIdentities: async () => ({ data: { identities: [email, google] }, error: null }), linkIdentity: vi.fn(), unlinkIdentity: vi.fn(), exchangeCodeForSession }, { storage, browser: { openAuthSessionAsync: vi.fn() } });
  const url = 'spotlearn://auth/callback?code=one-time-code';
  const results = await Promise.all([coordinator.completeLink(url), coordinator.completeLink(url)]);
  expect(results[0]).toEqual(results[1]);
  expect(exchangeCodeForSession).toHaveBeenCalledOnce();
});

it('resumes identity verification after a consumed PKCE code and app restart', async () => {
  const values = new Map([['touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'identity-link', provider: 'google', stage: 'authorization-pending' })]]); const storage = { getItem: async (key:string) => values.get(key) ?? null, setItem: async (key:string,value:string) => { values.set(key,value); }, removeItem: async (key:string) => { values.delete(key); } };
  const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
  const failing = createIdentityCoordinator({ verifyOtp: vi.fn(), getUserIdentities: async () => { throw new Error('offline'); }, linkIdentity: vi.fn(), unlinkIdentity: vi.fn(), exchangeCodeForSession }, { storage, browser: { openAuthSessionAsync: vi.fn() } });
  await expect(failing.completeLink('spotlearn://auth/callback?code=consumed')).rejects.toThrow(/offline/);
  expect(JSON.parse(values.get('touchcatch.auth.pkce.pending')!)).toMatchObject({ stage: 'verification-pending', provider: 'google' });
  const resumedExchange = vi.fn();
  const resumed = createIdentityCoordinator({ verifyOtp: vi.fn(), getUserIdentities: async () => ({ data: { identities: [email, google] }, error: null }), linkIdentity: vi.fn(), unlinkIdentity: vi.fn(), exchangeCodeForSession: resumedExchange }, { storage, browser: { openAuthSessionAsync: vi.fn() } });
  await expect(resumed.resumeLink()).resolves.toEqual({ status: 'LINKED', provider: 'google' });
  expect(resumedExchange).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
});

it('retries an unconsumed PKCE exchange after restarting in the exchanging stage', async () => {
  const values = new Map([['touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'identity-link', provider: 'google', stage: 'exchanging', callbackUrl: 'spotlearn://auth/callback?code=retryable' })]]); const storage = { getItem: async (key:string) => values.get(key) ?? null, setItem: async (key:string,value:string) => { values.set(key,value); }, removeItem: async (key:string) => { values.delete(key); } };
  const getUserIdentities = vi.fn().mockResolvedValueOnce({ data: { identities: [email] }, error: null }).mockResolvedValueOnce({ data: { identities: [email, google] }, error: null });
  const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
  const resumed = createIdentityCoordinator({ verifyOtp: vi.fn(), getUserIdentities, linkIdentity: vi.fn(), unlinkIdentity: vi.fn(), exchangeCodeForSession }, { storage, browser: { openAuthSessionAsync: vi.fn() } });
  await expect(resumed.resumeLink()).resolves.toEqual({ status: 'LINKED', provider: 'google' });
  expect(exchangeCodeForSession).toHaveBeenCalledWith('retryable');
  expect(values.size).toBe(0);
});

it('reconciles a consumed PKCE exchange after restarting before its verification checkpoint', async () => {
  const values = new Map([['touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'identity-link', provider: 'google', stage: 'exchanging', callbackUrl: 'spotlearn://auth/callback?code=consumed' })]]); const storage = { getItem: async (key:string) => values.get(key) ?? null, setItem: async (key:string,value:string) => { values.set(key,value); }, removeItem: async (key:string) => { values.delete(key); } };
  const exchangeCodeForSession = vi.fn();
  const resumed = createIdentityCoordinator({ verifyOtp: vi.fn(), getUserIdentities: async () => ({ data: { identities: [email, google] }, error: null }), linkIdentity: vi.fn(), unlinkIdentity: vi.fn(), exchangeCodeForSession }, { storage, browser: { openAuthSessionAsync: vi.fn() } });
  await expect(resumed.resumeLink()).resolves.toEqual({ status: 'LINKED', provider: 'google' });
  expect(exchangeCodeForSession).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
});

it('requests the reauthentication nonce from Supabase instead of inventing client proof', async () => {
  const reauthenticate = vi.fn(async () => ({ error: null }));
  const coordinator = createIdentityCoordinator({ reauthenticate, verifyOtp: vi.fn(), getUserIdentities: vi.fn(), linkIdentity: vi.fn(), unlinkIdentity: vi.fn() });
  await expect(coordinator.requestReauthentication()).resolves.toEqual({ status: 'OTP_SENT' });
  expect(reauthenticate).toHaveBeenCalledOnce();
});

it('uses fresh provider and identity IDs rather than email matching when unlinking', async () => {
  const getUserIdentities = vi.fn().mockResolvedValueOnce({ data: { identities: [email, google] }, error: null }).mockResolvedValueOnce({ data: { identities: [email] }, error: null });
  const unlinkIdentity = vi.fn(async () => ({ error: null }));
  const coordinator = createIdentityCoordinator({ verifyOtp: async () => ({ error: null }), getUserIdentities, linkIdentity: vi.fn(), unlinkIdentity });
  await expect(coordinator.unlink('google-id', { email: 'player@example.test', token: '123456' })).resolves.toEqual({ status: 'UNLINKED' });
  expect(getUserIdentities).toHaveBeenCalledTimes(2);
  expect(unlinkIdentity).toHaveBeenCalledWith(google);
});

it('refuses stale, unknown, or last viable identity removal', async () => {
  const base = { verifyOtp: async () => ({ error: null }), linkIdentity: vi.fn(), unlinkIdentity: vi.fn() };
  await expect(createIdentityCoordinator({ ...base, getUserIdentities: async () => ({ data: { identities: [google] }, error: null }) }).unlink('google-id', { email: 'a@b.test', token: '1' })).rejects.toThrow(/LAST_IDENTITY/);
  await expect(createIdentityCoordinator({ ...base, getUserIdentities: async () => ({ data: { identities: [email, google] }, error: null }) }).unlink('stale-id', { email: 'a@b.test', token: '1' })).rejects.toThrow(/IDENTITY_NOT_FOUND/);
});
