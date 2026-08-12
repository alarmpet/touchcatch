export type PublicSessionState =
  | Readonly<{ status: 'loading' | 'signed-out' }>
  | Readonly<{ status: 'signed-in'; email: string | null }>
  | Readonly<{ status: 'error'; code: 'AUTH_UNAVAILABLE' }>;

export type AuthSession = Readonly<{ access_token: string; user: Readonly<{ email?: string }> }>;
type Session = AuthSession;
type AuthResult = Promise<Readonly<{ data: Readonly<{ session: Session | null }>; error: unknown }>>;

export interface SupabaseAuthPort {
  getSession(): AuthResult;
  refreshSession(): AuthResult;
  onAuthStateChange(callback: (event: string, session: Session | null) => void): Readonly<{ data: Readonly<{ subscription: Readonly<{ unsubscribe(): void }> }> }>;
  signInWithPassword(input: Readonly<{ email: string; password: string }>): AuthResult;
  signInWithOAuth?(input: Readonly<{
    provider: 'google' | 'kakao';
    options: Readonly<{ redirectTo: string; skipBrowserRedirect: true }>;
  }>): Promise<Readonly<{ data: Readonly<{ url: string | null }>; error: unknown }>>;
  exchangeCodeForSession?(code: string): Promise<Readonly<{ error: unknown }>>;
  getSessionIdentity?(): Promise<string | null>;
  signOut(input: Readonly<{ scope: 'local' }>): Promise<Readonly<{ error: unknown }>>;
}

export interface SessionController {
  initialize(): Promise<void>;
  getState(): PublicSessionState;
  subscribe(listener: (state: PublicSessionState) => void): () => void;
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  dispose(): void;
}

function publicState(session: Session | null): PublicSessionState {
  return session === null ? { status: 'signed-out' } : { status: 'signed-in', email: session.user.email?.trim() || null };
}

export function createSessionController(auth: SupabaseAuthPort): SessionController {
  let session: Session | null = null;
  let state: PublicSessionState = { status: 'loading' };
  let disposed = false;
  let unsubscribeAuth: (() => void) | undefined;
  const listeners = new Set<(value: PublicSessionState) => void>();
  const publish = (nextSession: Session | null) => {
    if (disposed) return;
    session = nextSession;
    state = publicState(session);
    listeners.forEach((listener) => listener(state));
  };
  const fail = () => {
    if (disposed) return;
    session = null;
    state = { status: 'error', code: 'AUTH_UNAVAILABLE' };
    listeners.forEach((listener) => listener(state));
  };

  return {
    async initialize() {
      if (disposed) throw new Error('SESSION_CONTROLLER_DISPOSED');
      try {
        const result = await auth.getSession();
        if (disposed) return;
        if (result.error) { fail(); return; }
        publish(result.data.session);
        const subscription = auth.onAuthStateChange((_event, nextSession) => publish(nextSession));
        unsubscribeAuth = () => subscription.data.subscription.unsubscribe();
      } catch { fail(); }
    },
    getState: () => state,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async getAccessToken() { return session?.access_token ?? null; },
    async refreshAccessToken() {
      if (disposed) return null;
      try {
        const result = await auth.refreshSession();
        if (result.error) { fail(); return null; }
        publish(result.data.session);
        return result.data.session?.access_token ?? null;
      } catch { fail(); return null; }
    },
    async signIn(email, password) {
      if (disposed) throw new Error('SESSION_CONTROLLER_DISPOSED');
      try {
        const result = await auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) { fail(); throw new Error('AUTH_SIGN_IN_FAILED'); }
        publish(result.data.session);
      } catch (error) {
        fail();
        if (error instanceof Error && error.message === 'AUTH_SIGN_IN_FAILED') throw error;
        throw new Error('AUTH_SIGN_IN_FAILED');
      }
    },
    async signOut() {
      if (disposed) return;
      try {
        const result = await auth.signOut({ scope: 'local' });
        if (result.error) { fail(); throw new Error('AUTH_SIGN_OUT_FAILED'); }
        publish(null);
      } catch (error) {
        fail();
        if (error instanceof Error && error.message === 'AUTH_SIGN_OUT_FAILED') throw error;
        throw new Error('AUTH_SIGN_OUT_FAILED');
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeAuth?.();
      listeners.clear();
    },
  };
}
