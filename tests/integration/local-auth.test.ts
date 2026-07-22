import fs from 'node:fs';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEmailAuth } from '../../apps/mobile/src/auth/email.js';
import { createOAuthCoordinator } from '../../apps/mobile/src/auth/oauth.js';
import { createAccessTokenVerifier, type VerifiedIdentity } from '../../apps/server/src/auth/verify.js';
import { createNodeServer } from '../../apps/server/src/http/node-adapter.js';
import { createAppServerDatabase, createServerRuntime } from '../../apps/server/src/runtime.js';
import { loadLocalSupabaseStatus, type LocalSupabaseStatus as LocalStatus } from './support/local-supabase-status.js';

const HTTP_TIMEOUT_MS = 2_000;
const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 250;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
type MailAddress = Readonly<{ Address?: string }>;
type MailSummary = Readonly<{ ID?: string; Created?: string; To?: MailAddress[] }>;
type MailDetail = Readonly<{ HTML?: string; Text?: string }>;

async function http(input: string | URL, init: RequestInit = {}): Promise<Response> {
  try { return await fetch(input, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) }); }
  catch { throw new Error('LOCAL_SUPABASE_UNAVAILABLE'); }
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
}

function sanitizedAuthFailure(label: string, error: unknown): Error {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  const name = typeof record.name === 'string' ? record.name.replace(/[^A-Za-z0-9_-]/gu, '') : 'Error';
  const code = typeof record.code === 'string' ? record.code.replace(/[^A-Za-z0-9_-]/gu, '') : 'unknown';
  const status = typeof record.status === 'number' ? String(record.status) : 'unknown';
  const message = typeof record.message === 'string' ? record.message
    .replace(/https?:\/\/\S+/giu, '[url]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/gu, '[email]')
    .replace(/[A-Za-z0-9_-]{32,}/gu, '[redacted]')
    .replace(new RegExp(UUID_PATTERN.source, 'giu'), '[uuid]')
    .slice(0, 160) : 'unknown';
  return new Error(`${label}:${name}:${code}:${status}:${message}`);
}

function restrictedDbUrl(adminUrl: string): string {
  const roles = fs.readFileSync(resolve('supabase/roles.sql'), 'utf8');
  const credential = /create role\s+(touchcatch_api_test)\s+login[^;]*password\s+'([^']+)'/iu.exec(roles);
  if (!credential) throw new Error('LOCAL_APP_DATABASE_CREDENTIAL_UNAVAILABLE');
  const url = new URL(adminUrl);
  url.username = credential[1]!;
  url.password = credential[2]!;
  return url.toString();
}

async function waitForOwnedMessage(status: LocalStatus, recipient: string, ownedIds: Set<string>): Promise<MailSummary> {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
    const response = await http(`${status.mailpitUrl}/api/v1/messages?start=0&limit=100`);
    if (!response.ok) throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
    const payload = await response.json() as { messages?: MailSummary[] };
    const matches = (payload.messages ?? []).filter((message) => message.To?.some((address) => address.Address === recipient));
    for (const message of matches) if (message.ID) ownedIds.add(message.ID);
    if (matches.length > 0) {
      matches.sort((left, right) => String(right.Created).localeCompare(String(left.Created)));
      return matches[0]!;
    }
    if (attempt < POLL_ATTEMPTS) await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_INTERVAL_MS));
  }
  throw new Error('MAILPIT_CONFIRMATION_NOT_DELIVERED');
}

async function findOwnedMessageIds(status: LocalStatus, recipient: string): Promise<string[]> {
  const response = await http(`${status.mailpitUrl}/api/v1/messages?start=0&limit=100`);
  if (!response.ok) throw new Error('LOCAL_AUTH_CLEANUP_FAILED');
  const payload = await response.json() as { messages?: MailSummary[] };
  return (payload.messages ?? [])
    .filter((message) => message.To?.some((address) => address.Address === recipient))
    .flatMap((message) => message.ID ? [message.ID] : []);
}

function confirmationUrl(detail: MailDetail, apiUrl: string): URL {
  const source = `${detail.HTML ?? ''}\n${detail.Text ?? ''}`.replaceAll('&amp;', '&');
  const candidates = source.match(/https?:\/\/[^\s"'<>]+/giu) ?? [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.origin === new URL(apiUrl).origin && url.pathname === '/auth/v1/verify' && (url.searchParams.has('token') || url.searchParams.has('token_hash'))) return url;
    } catch { /* ignore non-URL email text */ }
  }
  throw new Error('MAILPIT_CONFIRMATION_LINK_MISSING');
}

async function closeServer(server: ReturnType<typeof createNodeServer>): Promise<void> {
  if (!server.listening) return;
  server.close();
  await Promise.race([
    once(server, 'close'),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LOCAL_AUTH_SERVER_CLOSE_TIMEOUT')), HTTP_TIMEOUT_MS)),
  ]);
}

describe.sequential('actual local Supabase authentication', () => {
  let status: LocalStatus;
  let adminPool: Pool;
  let appPool: Pool;
  let server: ReturnType<typeof createNodeServer>;
  let appOrigin: string;
  let client: SupabaseClient;
  let emailAuth: ReturnType<typeof createEmailAuth>;
  let coordinator: ReturnType<typeof createOAuthCoordinator>;
  let callbackUrl: string;
  let accessToken: string;
  let signupCreatedUser = false;
  let syntheticVerifierCalls = 0;
  let signSynthetic: (claims: Readonly<{ anonymous: boolean; expired: boolean }>) => Promise<string>;
  const ownedMailIds = new Set<string>();
  const capturedLogs: string[] = [];
  const logSpies: Array<ReturnType<typeof vi.spyOn>> = [];
  const recipient = `local-auth-${Date.now()}-${randomBytes(8).toString('hex')}@example.test`;
  const password = `${randomBytes(24).toString('base64url')}aA1!`;

  beforeAll(async () => {
    status = loadLocalSupabaseStatus();
    adminPool = new Pool({ connectionString: status.dbUrl, connectionTimeoutMillis: HTTP_TIMEOUT_MS, query_timeout: HTTP_TIMEOUT_MS, max: 2 });
    try {
      const [health, mailpit, settings] = await Promise.all([
        http(`${status.apiUrl}/auth/v1/health`),
        http(`${status.mailpitUrl}/api/v1/info`),
        http(`${status.apiUrl}/auth/v1/settings`, { headers: { apikey: status.publishableKey } }),
        adminPool.query('select 1'),
      ]);
      if (!health.ok || !mailpit.ok || !settings.ok) throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
      const authSettings = await settings.json() as { mailer_autoconfirm?: boolean };
      if (authSettings.mailer_autoconfirm !== false) throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
    } catch { throw new Error('LOCAL_SUPABASE_UNAVAILABLE'); }

    for (const method of ['log', 'warn', 'error'] as const) {
      logSpies.push(vi.spyOn(console, method).mockImplementation((...values: unknown[]) => { capturedLogs.push(values.map(String).join(' ')); }));
    }

    const localVerifier = createAccessTokenVerifier({
      supabaseUrl: status.apiUrl,
      async loadJwks() {
        const response = await http(`${status.apiUrl}/auth/v1/.well-known/jwks.json`);
        if (!response.ok) throw new Error('JWKS_FETCH_FAILED');
        return await response.json() as JSONWebKeySet;
      },
    });
    const keyPair = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(keyPair.publicKey)), kid: 'integration-only', alg: 'ES256', use: 'sig' };
    const syntheticVerifier = createAccessTokenVerifier({ supabaseUrl: status.apiUrl, loadJwks: async () => ({ keys: [jwk] }) });
    const issuer = `${status.apiUrl}/auth/v1`;
    signSynthetic = async ({ anonymous, expired }) => {
      const now = Math.floor(Date.now() / 1_000);
      return new SignJWT({ role: 'authenticated', is_anonymous: anonymous })
        .setProtectedHeader({ alg: 'ES256', kid: 'integration-only' })
        .setSubject(randomUUID())
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setIssuedAt(expired ? now - 120 : now)
        .setExpirationTime(expired ? now - 60 : now + 300)
        .sign(keyPair.privateKey);
    };
    const verifyAccessToken = async (token: string): Promise<VerifiedIdentity> => {
      try { return await localVerifier.verifyAccessToken(token); }
      catch {
        syntheticVerifierCalls++;
        return syntheticVerifier.verifyAccessToken(token);
      }
    };

    appPool = new Pool({ connectionString: restrictedDbUrl(status.dbUrl), connectionTimeoutMillis: HTTP_TIMEOUT_MS, query_timeout: HTTP_TIMEOUT_MS, max: 4 });
    server = createNodeServer(createServerRuntime({ database: createAppServerDatabase(appPool), verifyAccessToken }));
    server.listen(0, '127.0.0.1');
    await Promise.race([
      once(server, 'listening'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LOCAL_AUTH_SERVER_START_TIMEOUT')), HTTP_TIMEOUT_MS)),
    ]);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('LOCAL_AUTH_SERVER_START_FAILED');
    appOrigin = `http://127.0.0.1:${address.port}`;

    const storage = memoryStorage();
    client = createClient(status.apiUrl, status.publishableKey, { auth: { storage, flowType: 'pkce', autoRefreshToken: false, persistSession: true, detectSessionInUrl: false } });
    const ensureAccount = async () => {
      const session = await client.auth.getSession();
      const token = session.data.session?.access_token;
      if (session.error || !token) throw new Error('ACCOUNT_SESSION_UNAVAILABLE');
      const response = await http(`${appOrigin}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('ACCOUNT_SETUP_FAILED');
    };
    emailAuth = createEmailAuth({ auth: client.auth, ensureAccount, storage });
    coordinator = createOAuthCoordinator({ auth: client.auth, browser: {}, storage, ensureAccount });
  }, 15_000);

  afterAll(async () => {
    for (const spy of logSpies) spy.mockRestore();
    const failures: string[] = [];
    if (status && recipient) {
      try {
        const admin = createClient(status.apiUrl, status.cleanupKey, { auth: { autoRefreshToken: false, persistSession: false } });
        let removed = false;
        for (let page = 1; page <= 10 && !removed; page++) {
          const users = await admin.auth.admin.listUsers({ page, perPage: 100 });
          if (users.error) throw new Error('cleanup');
          const owned = users.data.users.find((user) => user.email === recipient);
          if (owned) {
            const deletion = await admin.auth.admin.deleteUser(owned.id);
            if (deletion.error) throw new Error('cleanup');
            removed = true;
          }
          if (users.data.users.length < 100) break;
        }
        if (signupCreatedUser && !removed) failures.push('auth-user');
      } catch { failures.push('auth-user'); }
      try {
        for (const id of await findOwnedMessageIds(status, recipient)) ownedMailIds.add(id);
        if (ownedMailIds.size > 0) {
          const response = await http(`${status.mailpitUrl}/api/v1/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: [...ownedMailIds] }) });
          if (!response.ok) throw new Error('cleanup');
        }
      } catch { failures.push('mailpit-message'); }
    }
    try { await client?.auth.signOut({ scope: 'local' }); } catch { /* user deletion invalidates the session */ }
    try { await closeServer(server); } catch { failures.push('node-server'); }
    try { await appPool?.end(); } catch { failures.push('app-database'); }
    try { await adminPool?.end(); } catch { failures.push('admin-database'); }
    if (failures.length > 0) throw new Error('LOCAL_AUTH_CLEANUP_FAILED');
  }, 15_000);

  it('keeps a real email signup unverified until its owned Mailpit confirmation', async () => {
    let result: Awaited<ReturnType<typeof emailAuth.signUpEmail>>;
    try { result = await emailAuth.signUpEmail(recipient, password); }
    catch (error) { throw sanitizedAuthFailure('LOCAL_GOTRUE_SIGNUP_FAILED', error); }
    signupCreatedUser = true;
    expect(result).toEqual({ state: 'VERIFICATION_PENDING' });

    const unverified = await http(`${appOrigin}/v1/me`);
    expect(unverified.status).toBe(401);
    await expect(unverified.json()).resolves.toEqual({ code: 'UNAUTHORIZED' });

    const message = await waitForOwnedMessage(status, recipient, ownedMailIds);
    expect(ownedMailIds.size).toBe(1);
    if (!message.ID) throw new Error('MAILPIT_CONFIRMATION_MESSAGE_INVALID');
    const detailResponse = await http(`${status.mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`);
    if (!detailResponse.ok) throw new Error('MAILPIT_CONFIRMATION_MESSAGE_INVALID');
    const link = confirmationUrl(await detailResponse.json() as MailDetail, status.apiUrl);
    const confirmation = await http(link, { redirect: 'manual' });
    expect([302, 303]).toContain(confirmation.status);
    const location = confirmation.headers.get('location');
    if (!location) throw new Error('LOCAL_GOTRUE_CONFIRMATION_CALLBACK_MISSING');
    const callback = new URL(location);
    expect(callback.protocol === 'spotlearn:' && callback.hostname === 'auth' && callback.pathname === '/callback').toBe(true);
    expect(callback.searchParams.has('code')).toBe(true);
    expect(callback.hash === '').toBe(true);
    callbackUrl = location;
  }, 15_000);

  it('exchanges the actual GoTrue PKCE code and replays authoritative me without identity leakage', async () => {
    if (!callbackUrl) throw new Error('LOCAL_AUTH_CONFIRMATION_PREREQUISITE_FAILED');
    let gate: Awaited<ReturnType<typeof coordinator.completeOAuth>>;
    try { gate = await coordinator.completeOAuth(callbackUrl); }
    catch (error) { throw sanitizedAuthFailure('LOCAL_GOTRUE_PKCE_EXCHANGE_FAILED', error); }
    expect(gate).toEqual({ state: 'READY' });
    const session = await client.auth.getSession();
    if (session.error || !session.data.session?.access_token) throw new Error('LOCAL_GOTRUE_SESSION_MISSING');
    accessToken = session.data.session.access_token;

    const requestMe = async () => {
      const response = await http(`${appOrigin}/v1/me`, { headers: { authorization: `Bearer ${accessToken}` } });
      expect(response.status).toBe(200);
      return await response.json() as unknown;
    };
    const first = await requestMe();
    const replay = await requestMe();
    expect(JSON.stringify(replay) === JSON.stringify(first)).toBe(true);
    const publicBody = first as { profile?: { displayName?: unknown }; points?: unknown };
    expect(typeof publicBody.profile?.displayName).toBe('string');
    expect(publicBody.points).toBe(0);
    expect(UUID_PATTERN.test(JSON.stringify(first))).toBe(false);
    expect(capturedLogs.some((entry) => UUID_PATTERN.test(entry))).toBe(false);
  }, 15_000);

  it('sends forged and expired tokens through the real verifier ingress and distinguishes anonymous access', async () => {
    if (!accessToken) throw new Error('LOCAL_AUTH_SESSION_PREREQUISITE_FAILED');
    const segments = accessToken.split('.');
    if (segments.length !== 3 || !segments[2]) throw new Error('LOCAL_GOTRUE_SESSION_INVALID');
    const forged = `${segments[0]}.${segments[1]}.${segments[2][0] === 'A' ? 'B' : 'A'}${segments[2].slice(1)}`;
    const expired = await signSynthetic({ anonymous: false, expired: true });
    const anonymous = await signSynthetic({ anonymous: true, expired: false });
    const callsBefore = syntheticVerifierCalls;

    for (const token of [forged, expired]) {
      const response = await http(`${appOrigin}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ code: 'UNAUTHORIZED' });
    }
    const anonymousResponse = await http(`${appOrigin}/v1/me`, { headers: { authorization: `Bearer ${anonymous}` } });
    expect(anonymousResponse.status).toBe(403);
    await expect(anonymousResponse.json()).resolves.toEqual({ code: 'ANONYMOUS_FORBIDDEN' });
    expect(syntheticVerifierCalls - callsBefore).toBe(3);
  }, 15_000);

  it('rejects fragments, extra callback parameters, and replay without external provider traffic', async () => {
    await expect(coordinator.completeOAuth('spotlearn://auth/callback#access_token=redacted')).rejects.toThrow(/fragment/iu);
    await expect(coordinator.completeOAuth('spotlearn://auth/callback?code=opaque&extra=forbidden')).rejects.toThrow(/only a code/iu);
    if (!callbackUrl) throw new Error('LOCAL_AUTH_CONFIRMATION_PREREQUISITE_FAILED');
    await expect(coordinator.completeOAuth(callbackUrl)).rejects.toThrow(/pending/iu);
  });
});
