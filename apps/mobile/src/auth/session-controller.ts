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
  /**
   * Optional so an adapter that cannot register accounts still satisfies the port; the
   * controller reports a closed sign-up rather than pretending the attempt failed.
   */
  signUpWithPassword?(input: Readonly<{ email: string; password: string }>): AuthResult;
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
  /**
   * Resolves `CONFIRM_EMAIL` when the project requires a confirmation click before the
   * account can be used. The caller has to say so — silently landing on a signed-out screen
   * after a successful registration reads as a failure.
   */
  signUp(email: string, password: string): Promise<'SIGNED_IN' | 'CONFIRM_EMAIL'>;
  signOut(): Promise<void>;
  /** Latches signed-out after a deletion request so a late auth callback cannot reopen it. */
  closeForDeletion(): void;
  isClosed(): boolean;
  dispose(): void;
}

function publicState(session: Session | null): PublicSessionState {
  return session === null ? { status: 'signed-out' } : { status: 'signed-in', email: session.user.email?.trim() || null };
}

export function createSessionController(auth: SupabaseAuthPort): SessionController {
  let session: Session | null = null;
  let state: PublicSessionState = { status: 'loading' };
  let disposed = false;
  // Once the account is closed, no late arrival may reopen it. Supabase's auth listener fires
  // asynchronously, so a TOKEN_REFRESHED or SIGNED_IN callback already in flight when deletion
  // was requested would otherwise land afterwards and publish a signed-in state for an account
  // the server has already blocked. The person would be looking at a working session for an
  // account that no longer exists.
  let closed = false;
  let unsubscribeAuth: (() => void) | undefined;
  const listeners = new Set<(value: PublicSessionState) => void>();
  const publish = (nextSession: Session | null) => {
    if (disposed) return;
    if (closed && nextSession !== null) return;
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
    async signUp(email, password) {
      if (disposed) throw new Error('SESSION_CONTROLLER_DISPOSED');
      const register = auth.signUpWithPassword;
      if (register === undefined) throw new Error('AUTH_SIGN_UP_UNSUPPORTED');
      try {
        const result = await register.call(auth, { email: email.trim(), password });
        if (result.error) throw new Error('AUTH_SIGN_UP_FAILED');
        // A project with confirmations on returns no session. That is a success, not a
        // failure, so the state is left signed-out without tripping the error path.
        if (result.data.session === null) return 'CONFIRM_EMAIL';
        publish(result.data.session);
        return 'SIGNED_IN';
      } catch (error) {
        if (error instanceof Error && error.message === 'AUTH_SIGN_UP_FAILED') throw error;
        throw new Error('AUTH_SIGN_UP_FAILED');
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
    /**
     * Latches this device signed-out for good.
     *
     * Called after a deletion request is accepted. Sign-out alone is not enough: it clears the
     * session but leaves the listener free to publish the next one that arrives.
     */
    closeForDeletion() {
      if (disposed) return;
      closed = true;
      session = null;
      state = { status: 'signed-out' };
      listeners.forEach((listener) => listener(state));
    },
    isClosed: () => closed,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeAuth?.();
      listeners.clear();
    },
  };
}
