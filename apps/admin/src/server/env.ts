import 'server-only';

const exactKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'ADMIN_ALLOWED_ORIGIN',
  'ADMIN_ATTESTATION_KEY',
] as const;

export function parseAdminRuntimeEnv(raw: Readonly<Record<string, string | undefined>>) {
  const unknown = Object.keys(raw).filter((key) => !exactKeys.includes(key as (typeof exactKeys)[number]));
  if (unknown.length) throw new Error(`unknown admin environment keys: ${unknown.join(', ')}`);
  const values = Object.fromEntries(exactKeys.map((key) => {
    const value = raw[key];
    if (!value?.trim()) throw new Error(`${key} must not be empty`);
    return [key, value];
  })) as Record<(typeof exactKeys)[number], string>;
  const origin = new URL(values.ADMIN_ALLOWED_ORIGIN);
  if (origin.origin !== values.ADMIN_ALLOWED_ORIGIN || origin.protocol !== 'https:') throw new Error('ADMIN_ALLOWED_ORIGIN must be an exact HTTPS origin');
  if (values.ADMIN_ATTESTATION_KEY.length < 32) throw new Error('ADMIN_ATTESTATION_KEY is too short');
  return values;
}
