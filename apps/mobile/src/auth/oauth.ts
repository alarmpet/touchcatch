export type OAuthProvider = 'google' | 'kakao';
type GateResult = Readonly<{ state: 'READY' | 'ACCOUNT_SETUP_FAILED' }>;
type Storage = Readonly<{ getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }>;
type OAuthAuthClient = Readonly<{
  signInWithOAuth?(input: { provider: OAuthProvider; options: { redirectTo: string; skipBrowserRedirect: true } }): Promise<{ data?: { url?: string | null }; error?: unknown }>;
  exchangeCodeForSession?(code: string): Promise<{ error?: unknown }>;
  getSession?(): Promise<{ data?: { session?: { user?: { id?: string } } | null } }>;
}>;
const CALLBACK = 'spotlearn://auth/callback';
const pendingKey = 'touchcatch.auth.pkce.pending';

function parseCallback(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'spotlearn:' || url.hostname !== 'auth' || url.pathname !== '/callback') throw new Error('Invalid OAuth callback');
  if (url.hash) throw new Error('OAuth callback fragments are forbidden');
  if (url.searchParams.has('error')) throw new Error('OAuth provider rejected authentication');
  const code = url.searchParams.get('code');
  if (!code || [...url.searchParams.keys()].some((key) => key !== 'code')) throw new Error('OAuth callback must contain only a code');
  return code;
}

export function createOAuthCoordinator(dependencies: Readonly<{
  auth: OAuthAuthClient;
  browser: { openAuthSessionAsync?(url: string, redirectUrl: string): Promise<{ type: string; url?: string }> };
  storage: Storage;
  ensureAccount(): Promise<void>;
}>) {
  const inFlight = new Map<string, Promise<GateResult>>();
  const completeOAuth = async (url: string): Promise<GateResult> => {
    const existing = inFlight.get(url);
    if (existing) return existing;
    const operation = (async () => {
      const code = parseCallback(url);
      const pending = await dependencies.storage.getItem(pendingKey);
      if (!pending || !['oauth', 'email-confirmation'].includes(JSON.parse(pending).kind)) throw new Error('OAuth pending transaction missing');
      const pendingTransaction = JSON.parse(pending) as { kind: 'oauth' | 'email-confirmation'; previousSessionId?: string | null };
      const kind = pendingTransaction.kind;
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind, stage: 'exchanging', previousSessionId: pendingTransaction.previousSessionId ?? null }));
      const exchange = dependencies.auth.exchangeCodeForSession;
      if (!exchange) throw new Error('Auth client does not implement exchangeCodeForSession');
      const result = await exchange.call(dependencies.auth, code);
      if (result.error) throw result.error;
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind, stage: 'bootstrap-pending' }));
      try { await dependencies.ensureAccount(); await dependencies.storage.removeItem(pendingKey); return { state: 'READY' as const }; }
      catch { return { state: 'ACCOUNT_SETUP_FAILED' as const }; }
    })();
    inFlight.set(url, operation);
    try { return await operation; } finally { inFlight.delete(url); }
  };
  return {
    completeOAuth,
    async resume(sessionIdentity: string | null): Promise<GateResult | null> {
      const raw = await dependencies.storage.getItem(pendingKey);
      if (!raw || !sessionIdentity) return null;
      const pending = JSON.parse(raw) as { kind?: string; stage?: string; previousSessionId?: string | null };
      if (!['oauth', 'email-confirmation'].includes(pending.kind ?? '') || !['exchanging', 'bootstrap-pending'].includes(pending.stage ?? '')) return null;
      if (pending.stage === 'exchanging' && pending.previousSessionId === sessionIdentity) return null;
      try { await dependencies.ensureAccount(); await dependencies.storage.removeItem(pendingKey); return { state: 'READY' }; }
      catch { return { state: 'ACCOUNT_SETUP_FAILED' }; }
    },
    async startOAuth(provider: OAuthProvider): Promise<GateResult> {
      const signIn = dependencies.auth.signInWithOAuth;
      const open = dependencies.browser.openAuthSessionAsync;
      if (!signIn || !open) throw new Error('OAuth browser flow is unavailable');
      const current = await dependencies.auth.getSession?.();
      const previousSessionId = current?.data?.session?.user?.id ?? null;
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'oauth', provider, stage: 'authorization-pending', previousSessionId }));
      let callbackUrl: string;
      try {
        const result = await signIn.call(dependencies.auth, { provider, options: { redirectTo: CALLBACK, skipBrowserRedirect: true } });
        if (result.error) throw result.error;
        if (!result.data?.url) throw new Error('OAuth authorization URL missing');
        const browserResult = await open(result.data.url, CALLBACK);
        if (browserResult.type !== 'success' || !browserResult.url) throw new Error('OAuth browser flow cancelled');
        callbackUrl = browserResult.url;
      } catch (error) {
        await dependencies.storage.removeItem(pendingKey);
        throw error;
      }
      return completeOAuth(callbackUrl);
    },
  };
}
