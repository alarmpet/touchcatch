type AuthLifecycle = Readonly<{
  getSession(): Promise<unknown>;
  onAuthStateChange(callback: (...args: unknown[]) => void): { data: { subscription: { unsubscribe(): void } } };
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
  signOut(): Promise<{ error: unknown }>;
}>;

export function createSessionLifecycle(auth: AuthLifecycle, purgeAuthCache: () => Promise<void>, resumeBootstrap?: (sessionIdentity: string | null) => Promise<unknown>) {
  return {
    async restore() {
      const result = await auth.getSession();
      const session = (result as { data?: { session?: { user?: { id?: string } } } }).data?.session;
      const resumeResult = await resumeBootstrap?.(session?.user?.id ?? null);
      return { sessionResult: result, resumeResult };
    },
    subscribe(listener: (...args: unknown[]) => void = () => undefined) { const { data } = auth.onAuthStateChange(listener); return () => data.subscription.unsubscribe(); },
    onAppState(state: string) { if (state === 'active') auth.startAutoRefresh(); else auth.stopAutoRefresh(); },
    async logout() { const { error } = await auth.signOut(); if (error) throw error; await purgeAuthCache(); },
  };
}
