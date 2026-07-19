import { parseMobileEnv, type Environment } from '../../../../packages/config/src/env.js';
type RawEnv = Readonly<Record<string, string | undefined>>;
export function parseMobileRuntimeEnv(raw: RawEnv, environment: Environment = 'development') {
  return parseMobileEnv({ EXPO_PUBLIC_API_ORIGIN: raw.EXPO_PUBLIC_API_ORIGIN, EXPO_PUBLIC_SUPABASE_URL: raw.EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: raw.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_POSTHOG_KEY: raw.EXPO_PUBLIC_POSTHOG_KEY, EXPO_PUBLIC_SENTRY_DSN: raw.EXPO_PUBLIC_SENTRY_DSN }, environment);
}
let cached: ReturnType<typeof parseMobileRuntimeEnv> | undefined;
export function getMobileRuntimeEnv() {
  return cached ??= parseMobileRuntimeEnv(process.env, process.env.NODE_ENV === 'production' ? 'production' : 'development');
}
