type GateResult = Readonly<{ state: 'VERIFICATION_PENDING' | 'READY' | 'ACCOUNT_SETUP_FAILED' }>;
type AuthResult = Readonly<{ data?: { session?: unknown; user?: unknown }; error?: unknown }>;
type EmailAuthClient = Readonly<{
  signUp?(input: { email: string; password: string; options: { emailRedirectTo: string } }): Promise<AuthResult>;
  signInWithPassword?(input: { email: string; password: string }): Promise<AuthResult>;
  resend?(input: { type: 'signup'; email: string; options: { emailRedirectTo: string } }): Promise<unknown>;
  resetPasswordForEmail?(email: string, options: { redirectTo: string }): Promise<unknown>;
  exchangeCodeForSession?(code: string): Promise<AuthResult>;
  updateUser?(input: { password: string }): Promise<AuthResult>;
  getSession?(): Promise<{ data?: { session?: { user?: { id?: string } } | null } }>;
}>;

function requireMethod<T extends (...args: never[]) => unknown>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`Auth client does not implement ${name}`);
  return method;
}
function throwAuthError(result: AuthResult): void { if (result.error) throw result.error; }
function recoveryCode(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'spotlearn:' || url.hostname !== 'auth' || url.pathname !== '/recovery' || url.hash) throw new Error('Invalid recovery callback');
  const code = url.searchParams.get('code');
  if (!code || [...url.searchParams.keys()].some((key) => key !== 'code')) throw new Error('Invalid recovery callback');
  return code;
}

type Storage = Readonly<{ getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }>;
const pendingKey = 'touchcatch.auth.pkce.pending';
const emailCallback = 'spotlearn://auth/callback';
const recoveryCallback = 'spotlearn://auth/recovery';

export function createEmailAuth(dependencies: Readonly<{ auth: EmailAuthClient; ensureAccount(): Promise<void>; storage: Storage }>) {
  const recoveryInFlight = new Map<string, Promise<GateResult>>();
  const bootstrap = async (): Promise<GateResult> => {
    try { await dependencies.ensureAccount(); return { state: 'READY' }; }
    catch { return { state: 'ACCOUNT_SETUP_FAILED' }; }
  };
  return {
    async resumeRecovery(sessionIdentity: string | null): Promise<boolean> {
      const raw = await dependencies.storage.getItem(pendingKey);
      if (!raw || !sessionIdentity) return false;
      const pending = JSON.parse(raw) as { kind?: string; stage?: string; previousSessionId?: string | null };
      if (pending.kind !== 'recovery' || !['exchanging', 'recovery-session-ready'].includes(pending.stage ?? '')) return false;
      if (pending.stage === 'exchanging' && pending.previousSessionId === sessionIdentity) return false;
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'recovery', stage: 'recovery-session-ready', previousSessionId: pending.previousSessionId ?? null }));
      return true;
    },
    async signUpEmail(email: string, password: string): Promise<GateResult> {
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'email-confirmation', stage: 'authorization-pending' }));
      let result: AuthResult;
      try {
        result = await requireMethod(dependencies.auth.signUp, 'signUp').call(dependencies.auth, { email, password, options: { emailRedirectTo: emailCallback } });
        throwAuthError(result);
      } catch (error) {
        await dependencies.storage.removeItem(pendingKey);
        throw error;
      }
      if (!result.data?.session) return { state: 'VERIFICATION_PENDING' };
      await dependencies.storage.removeItem(pendingKey);
      return bootstrap();
    },
    async signInEmail(email: string, password: string): Promise<GateResult> {
      const result = await requireMethod(dependencies.auth.signInWithPassword, 'signInWithPassword')({ email, password });
      throwAuthError(result);
      return bootstrap();
    },
    async resendVerification(email: string) {
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'email-confirmation', stage: 'authorization-pending' }));
      await requireMethod(dependencies.auth.resend, 'resend')({ type: 'signup', email, options: { emailRedirectTo: emailCallback } });
      return { accepted: true as const };
    },
    async requestPasswordReset(email: string) {
      const current = await dependencies.auth.getSession?.();
      const previousSessionId = current?.data?.session?.user?.id ?? null;
      await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'recovery', stage: 'authorization-pending', previousSessionId }));
      await requireMethod(dependencies.auth.resetPasswordForEmail, 'resetPasswordForEmail')(email, { redirectTo: recoveryCallback });
      return { accepted: true as const };
    },
    async completePasswordRecovery(url: string | null, password: string): Promise<GateResult> {
      const operationKey = url ?? 'recovery-session-ready';
      const existing = recoveryInFlight.get(operationKey);
      if (existing) return existing;
      const operation = (async () => {
        const pending = await dependencies.storage.getItem(pendingKey);
        if (!pending || JSON.parse(pending).kind !== 'recovery') throw new Error('Password recovery pending transaction missing');
        const transaction = JSON.parse(pending) as { stage?: string; previousSessionId?: string | null };
        const stage = transaction.stage;
        if (stage !== 'recovery-session-ready') {
          if (!url) throw new Error('Password recovery callback missing');
          await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'recovery', stage: 'exchanging', previousSessionId: transaction.previousSessionId ?? null }));
          const exchanged = await requireMethod(dependencies.auth.exchangeCodeForSession, 'exchangeCodeForSession')(recoveryCode(url));
          throwAuthError(exchanged);
          await dependencies.storage.setItem(pendingKey, JSON.stringify({ kind: 'recovery', stage: 'recovery-session-ready', previousSessionId: transaction.previousSessionId ?? null }));
        }
        const updated = await requireMethod(dependencies.auth.updateUser, 'updateUser')({ password });
        throwAuthError(updated);
        await dependencies.storage.removeItem(pendingKey);
        return bootstrap();
      })();
      recoveryInFlight.set(operationKey, operation);
      try { return await operation; } finally { recoveryInFlight.delete(operationKey); }
    },
  };
}
