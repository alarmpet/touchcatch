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

export function supabaseBrowserAuthShell(): BrowserAuthShell {
  return { async acquireAccessToken() {
    const provider = (globalThis as typeof globalThis & { __touchcatchAuth?: { getAccessToken(): Promise<string | null> } }).__touchcatchAuth;
    const token = await provider?.getAccessToken();
    if (!token) throw new Error('AUTH_PROVIDER_UNAVAILABLE');
    return token;
  } };
}
