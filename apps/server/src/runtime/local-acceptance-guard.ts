const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const CONFIRMATION = 'TOUCHCATCH_LOCAL_ACCEPTANCE_V1';

export function assertLocalAcceptanceEnvironment(input: Readonly<{
  marker: string | undefined;
  supabaseUrl: string;
  databaseUrl: string;
}>): Readonly<{ supabaseOrigin: string; databaseHost: string }> {
  if (input.marker !== CONFIRMATION) {
    throw new TypeError('Local acceptance confirmation marker is required');
  }
  let supabase: URL;
  let database: URL;
  try {
    supabase = new URL(input.supabaseUrl);
    database = new URL(input.databaseUrl);
  } catch {
    throw new TypeError('Local acceptance endpoints must be absolute URLs');
  }
  if (
    supabase.protocol !== 'http:'
    || !LOOPBACK_HOSTS.has(supabase.hostname)
    || supabase.username
    || supabase.password
    || supabase.pathname !== '/'
    || supabase.search
    || supabase.hash
  ) throw new TypeError('Local acceptance Supabase endpoint must be credential-free HTTP loopback');
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol)
    || !LOOPBACK_HOSTS.has(database.hostname)
    || database.search
    || database.hash
  ) throw new TypeError('Local acceptance database endpoint must be PostgreSQL loopback');
  return { supabaseOrigin: supabase.origin, databaseHost: database.hostname };
}
