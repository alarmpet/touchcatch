import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
// Must precede the supabase-js import: it reads `crypto.subtle` to decide between an S256 and
// a `plain` PKCE challenge. See webcrypto-install.ts for why `plain` is not acceptable here.
import './webcrypto-install';

import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { AuthSession, SupabaseAuthPort } from './session-controller';

type Storage = Readonly<{
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}>;

type AppStateSubscription = Readonly<{ remove(): void }>;
type ClientFactory = typeof createClient;

function projectSession(session: unknown): AuthSession | null {
  if (session === null) return null;
  if (!session || typeof session !== 'object') return null;
  const candidate = session as { access_token?: unknown; user?: { email?: unknown } };
  if (typeof candidate.access_token !== 'string' || !candidate.user || typeof candidate.user !== 'object') return null;
  return {
    access_token: candidate.access_token,
    user: typeof candidate.user.email === 'string' ? { email: candidate.user.email } : {},
  };
}

function authPort(client: SupabaseClient): SupabaseAuthPort {
  return {
    async getSession() {
      const result = await client.auth.getSession();
      return { data: { session: projectSession(result.data.session) }, error: result.error };
    },
    async refreshSession() {
      const result = await client.auth.refreshSession();
      return { data: { session: projectSession(result.data.session) }, error: result.error };
    },
    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange((event, session) => callback(event, projectSession(session)));
    },
    async signInWithPassword(input) {
      const result = await client.auth.signInWithPassword(input);
      return { data: { session: projectSession(result.data.session) }, error: result.error };
    },
    async signUpWithPassword(input) {
      const result = await client.auth.signUp(input);
      return { data: { session: projectSession(result.data.session) }, error: result.error };
    },
    async signInWithOAuth(input) {
      const result = await client.auth.signInWithOAuth(input);
      return { data: { url: result.data.url }, error: result.error };
    },
    async exchangeCodeForSession(code) {
      const result = await client.auth.exchangeCodeForSession(code);
      return { error: result.error };
    },
    async getSessionIdentity() {
      const result = await client.auth.getSession();
      return result.error ? null : result.data.session?.user.id ?? null;
    },
    signOut: (input) => client.auth.signOut(input),
  };
}

export function createMobileSupabaseRuntime(
  environment: Readonly<{ supabaseUrl: string; supabasePublishableKey: string }>,
  dependencies: Readonly<{
    createClient?: ClientFactory;
    storage?: Storage;
    lock?: typeof processLock;
    platform?: string;
    addAppStateListener?: (callback: (state: string) => void) => AppStateSubscription;
  }> = {},
): Readonly<{ auth: SupabaseAuthPort; dispose(): void }> {
  const storage = dependencies.storage ?? globalThis.localStorage;
  if (!storage) throw new Error('MOBILE_AUTH_STORAGE_UNAVAILABLE');
  const factory = dependencies.createClient ?? createClient;
  const client = factory(environment.supabaseUrl, environment.supabasePublishableKey, {
    auth: {
      storage,
      // supabase-js defaults to the implicit flow. Without this, signInWithOAuth omits
      // code_challenge, GoTrue answers with tokens in the URL fragment instead of ?code=,
      // and the coordinator rejects the callback — after the provider has already created
      // the user, which makes it look like the account exists but the login failed.
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: dependencies.lock ?? processLock,
    },
  });
  const platform = dependencies.platform ?? Platform.OS;
  const addListener = dependencies.addAppStateListener
    ?? ((callback: (state: string) => void) => AppState.addEventListener('change', callback));
  const subscription = platform === 'web' ? undefined : addListener((state) => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return {
    auth: authPort(client),
    dispose() {
      subscription?.remove();
      if (platform !== 'web') client.auth.stopAutoRefresh();
    },
  };
}
