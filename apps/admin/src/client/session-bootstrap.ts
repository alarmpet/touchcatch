export interface BrowserAuthShell { acquireAccessToken(): Promise<string>; }
export type BrowserSessionState = Readonly<{ status: 'ready'; csrfToken: string }> | Readonly<{ status: 'error'; code: string }>;

export async function bootstrapBrowserSession(auth: BrowserAuthShell, request: typeof fetch = fetch): Promise<BrowserSessionState> {
  try {
    const token = await auth.acquireAccessToken();
    if (!token) return { status: 'error', code: 'AUTH_TOKEN_UNAVAILABLE' };
    const response = await request('/api/admin/session', { method: 'POST', credentials: 'same-origin', headers: { authorization: `Bearer ${token}` } });
    const value = await response.json() as { ok?: unknown; csrfToken?: unknown };
    if (!response.ok || value.ok !== true || typeof value.csrfToken !== 'string') return { status: 'error', code: 'SESSION_BOOTSTRAP_FAILED' };
    return { status: 'ready', csrfToken: value.csrfToken };
  } catch { return { status: 'error', code: 'SESSION_BOOTSTRAP_FAILED' }; }
}

export function createSupabaseBrowserTokenAdapter(config: Readonly<{ supabaseUrl: string; storage: Pick<Storage, 'getItem'> }>): BrowserAuthShell {
  const projectRef = new URL(config.supabaseUrl).hostname.split('.')[0];
  if (!projectRef) throw new Error('AUTH_PROVIDER_CONFIG_INVALID');
  return { async acquireAccessToken() {
    const raw = config.storage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) throw new Error('AUTH_PROVIDER_UNAVAILABLE');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('AUTH_PROVIDER_INVALID'); }
    const token = (parsed as { access_token?: unknown }).access_token;
    if (typeof token !== 'string' || token.length < 8) throw new Error('AUTH_PROVIDER_INVALID');
    return token;
  } };
}
