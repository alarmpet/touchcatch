type RawEnv = Readonly<Record<string, string | undefined>>;
export type MobileAuthEnv = Readonly<{ EXPO_PUBLIC_SUPABASE_URL: string; EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string }>;
type Storage = Readonly<{ getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }>;
type Lock = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

export function parseMobileAuthEnv(raw: RawEnv): MobileAuthEnv {
  const url = raw.EXPO_PUBLIC_SUPABASE_URL;
  const key = raw.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL must not be empty');
  try { new URL(url); } catch { throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid URL'); }
  if (!key) throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not be empty');
  return { EXPO_PUBLIC_SUPABASE_URL: url.replace(/\/$/u, ''), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
}

export function createAuthClientFactory<T>(dependencies: Readonly<{
  env: RawEnv;
  storage: Storage;
  lock: Lock;
  createClient(url: string, key: string, options: unknown): T;
}>) {
  let client: T | undefined;
  return { getClient(): T {
    if (client) return client;
    const env = parseMobileAuthEnv(dependencies.env);
    client = dependencies.createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { storage: dependencies.storage, flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: dependencies.lock } });
    return client;
  } };
}
