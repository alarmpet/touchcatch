export type MobileEnvironment = Readonly<{
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiOrigin: string;
  weeklySeasonId: string;
  /**
   * Where the published privacy policy and deletion pages live.
   *
   * Optional in development and required in production: Play will not accept a build whose
   * privacy policy is unreachable, and the footer that links to it has to have somewhere to
   * point. Null renders the footer as plain text rather than as a link that goes nowhere.
   */
  portalOrigin: string | null;
}>;

function exactOrigin(value: string | undefined, code: string): string {
  if (!value) throw new Error('MOBILE_ENV_INVALID');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(code); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || url.origin !== value) throw new Error(code);
  return url.origin;
}

function isLoopback(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function parseMobileEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  options: Readonly<{ production: boolean }>,
): MobileEnvironment {
  const supabaseUrl = exactOrigin(env['EXPO_PUBLIC_SUPABASE_URL'], 'MOBILE_SUPABASE_URL_INVALID');
  const apiOrigin = exactOrigin(env['EXPO_PUBLIC_API_ORIGIN'], 'MOBILE_API_ORIGIN_INVALID');
  const key = env['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']?.trim();
  const weeklySeasonId = env['EXPO_PUBLIC_WEEKLY_SEASON_ID']?.trim();
  if (!key) throw new Error('MOBILE_ENV_INVALID');
  if (/service[_-]?role|secret|sb_secret_/iu.test(key) || !/^sb_publishable_[A-Za-z0-9_-]{20,}$/u.test(key)) {
    throw new Error('MOBILE_KEY_FORBIDDEN');
  }
  if (options.production && isLoopback(apiOrigin)) throw new Error('MOBILE_API_LOOPBACK_FORBIDDEN');
  if (options.production && new URL(apiOrigin).protocol !== 'https:') throw new Error('MOBILE_API_HTTPS_REQUIRED');
  if (options.production && new URL(supabaseUrl).protocol !== 'https:') throw new Error('MOBILE_SUPABASE_URL_INVALID');
  if (!weeklySeasonId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(weeklySeasonId)) {
    throw new Error('MOBILE_SEASON_ID_INVALID');
  }
  const rawPortal = env['EXPO_PUBLIC_PORTAL_ORIGIN']?.trim();
  let portalOrigin: string | null = null;
  if (rawPortal) {
    portalOrigin = exactOrigin(rawPortal, 'MOBILE_PORTAL_ORIGIN_INVALID');
    if (options.production && new URL(portalOrigin).protocol !== 'https:') {
      throw new Error('MOBILE_PORTAL_HTTPS_REQUIRED');
    }
  } else if (options.production) {
    // A release build with no portal origin is one whose privacy policy and deletion page cannot
    // be opened from inside the app. That is a Play requirement, not a nicety.
    throw new Error('MOBILE_PORTAL_ORIGIN_REQUIRED');
  }

  return {
    supabaseUrl,
    supabasePublishableKey: key,
    apiOrigin,
    weeklySeasonId: weeklySeasonId.toLowerCase(),
    portalOrigin,
  };
}
