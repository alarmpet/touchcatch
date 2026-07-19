type AuthLifecycle = Readonly<{
  getSession(): Promise<unknown>;
  onAuthStateChange(callback: (...args: unknown[]) => void): { data: { subscription: { unsubscribe(): void } } };
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
  signOut(): Promise<{ error: unknown }>;
}>;

export function createSessionLifecycle(auth: AuthLifecycle, purgeAuthCache: () => Promise<void>) {
  return {
    restore: () => auth.getSession(),
    subscribe() { const { data } = auth.onAuthStateChange(() => undefined); return () => data.subscription.unsubscribe(); },
    onAppState(state: 'active' | 'background' | 'inactive') { if (state === 'active') auth.startAutoRefresh(); else auth.stopAutoRefresh(); },
    async logout() { const { error } = await auth.signOut(); if (error) throw error; await purgeAuthCache(); },
  };
}
