export type OAuthProvider = 'google' | 'kakao';
export type OAuthGateResult = Readonly<{ state: 'READY' | 'ACCOUNT_SETUP_FAILED' }>;

type Storage = Readonly<{
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}>;

type OAuthAuthPort = Readonly<{
  getSessionIdentity?(): Promise<string | null>;
  signInWithOAuth?(input: Readonly<{
    provider: OAuthProvider;
    options: Readonly<{ redirectTo: string; skipBrowserRedirect: true }>;
  }>): Promise<Readonly<{ data?: Readonly<{ url?: string | null }>; error?: unknown }>>;
  exchangeCodeForSession?(code: string): Promise<Readonly<{ error?: unknown }>>;
}>;

type PendingTransaction = Readonly<{
  kind: 'oauth';
  provider?: OAuthProvider;
  stage: 'authorization-pending' | 'exchanging' | 'bootstrap-pending';
  previousSessionId?: string | null;
}>;

const callbackUrl = 'spotlearn://auth/callback';
const pendingKey = 'touchcatch.auth.pkce.pending';

function callbackCode(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('OAUTH_CALLBACK_INVALID'); }
  if (url.protocol !== 'spotlearn:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
    throw new Error('OAUTH_CALLBACK_INVALID');
  }
  if (url.hash !== '') throw new Error('OAUTH_CALLBACK_FRAGMENT_FORBIDDEN');
  if (url.searchParams.has('error')) throw new Error('OAUTH_CALLBACK_PROVIDER_ERROR');
  const keys = [...url.searchParams.keys()];
  const code = url.searchParams.get('code');
  if (keys.length !== 1 || keys[0] !== 'code' || !code) throw new Error('OAUTH_CALLBACK_CODE_INVALID');
  return code;
}

function parsePending(raw: string | null): PendingTransaction | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingTransaction>;
    if (value.kind !== 'oauth' || !['authorization-pending', 'exchanging', 'bootstrap-pending'].includes(value.stage ?? '')) return null;
    return value as PendingTransaction;
  } catch { return null; }
}

export function createOAuthCoordinator(dependencies: Readonly<{
  auth: OAuthAuthPort;
  browser: Readonly<{ openAuthSessionAsync?(url: string, redirectUrl: string): Promise<Readonly<{ type: string; url?: string }>> }>;
  storage: Storage;
  ensureAccount(): Promise<void>;
}>) {
  const inFlight = new Map<string, Promise<OAuthGateResult>>();

  const completeOAuth = async (rawUrl: string): Promise<OAuthGateResult> => {
    const existing = inFlight.get(rawUrl);
    if (existing) return existing;
    const operation: Promise<OAuthGateResult> = (async () => {
      const code = callbackCode(rawUrl);
      const pending = parsePending(await dependencies.storage.getItem(pendingKey));
      if (pending === null) throw new Error('OAUTH_PENDING_MISSING');
      const exchange = dependencies.auth.exchangeCodeForSession;
      if (!exchange) throw new Error('OAUTH_UNAVAILABLE');
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ ...pending, stage: 'exchanging' } satisfies PendingTransaction));
      const result = await exchange(code);
      if (result.error) throw new Error('OAUTH_EXCHANGE_FAILED');
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'oauth', stage: 'bootstrap-pending' } satisfies PendingTransaction));
      try {
        await dependencies.ensureAccount();
        await dependencies.storage.removeItem(pendingKey);
        return { state: 'READY' };
      } catch {
        return { state: 'ACCOUNT_SETUP_FAILED' };
      }
    })();
    inFlight.set(rawUrl, operation);
    try { return await operation; } finally { inFlight.delete(rawUrl); }
  };

  return {
    completeOAuth,
    async startOAuth(provider: OAuthProvider): Promise<OAuthGateResult> {
      const signIn = dependencies.auth.signInWithOAuth;
      const open = dependencies.browser.openAuthSessionAsync;
      if (!signIn || !open) throw new Error('OAUTH_UNAVAILABLE');
      const previousSessionId = await dependencies.auth.getSessionIdentity?.() ?? null;
      await dependencies.storage.setItem(pendingKey, JSON.stringify({
        kind: 'oauth', provider, stage: 'authorization-pending', previousSessionId,
      } satisfies PendingTransaction));
      try {
        const authorization = await signIn({ provider, options: { redirectTo: callbackUrl, skipBrowserRedirect: true } });
        if (authorization.error || !authorization.data?.url) throw new Error('OAUTH_AUTHORIZATION_FAILED');
        const browserResult = await open(authorization.data.url, callbackUrl);
        if (browserResult.type !== 'success' || !browserResult.url) throw new Error('OAUTH_CANCELLED');
        return await completeOAuth(browserResult.url);
      } catch (error) {
        const pending = parsePending(await dependencies.storage.getItem(pendingKey));
        if (pending?.stage === 'authorization-pending') await dependencies.storage.removeItem(pendingKey);
        throw error;
      }
    },
  };
}
