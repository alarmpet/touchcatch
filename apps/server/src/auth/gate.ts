export type AuthContext = Readonly<{ authSub: string; isAnonymous: boolean; accountReady: boolean }>;
export type AuthDecision =
  | Readonly<{ ok: true; authSub: string }>
  | Readonly<{ ok: false; code: 'UNAUTHORIZED' | 'ANONYMOUS_FORBIDDEN' | 'ACCOUNT_SETUP_FAILED'; status: 401 | 403 | 503 }>;

export function authorize(context: AuthContext | null): AuthDecision {
  if (!context) return { ok: false, code: 'UNAUTHORIZED', status: 401 };
  if (context.isAnonymous) return { ok: false, code: 'ANONYMOUS_FORBIDDEN', status: 403 };
  if (!context.accountReady) return { ok: false, code: 'ACCOUNT_SETUP_FAILED', status: 503 };
  return { ok: true, authSub: context.authSub };
}
