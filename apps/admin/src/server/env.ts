import 'server-only';
import { parseContentAssetOrigins } from '../../../../packages/contracts/src/index.js';

const exactKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'ADMIN_ALLOWED_ORIGIN',
  'ADMIN_ATTESTATION_KEY',
  'ADMIN_AUDIT_KEY',
  'ADMIN_DATABASE_URL',
  'CONTENT_ASSET_ORIGINS',
] as const;

export function parseAdminRuntimeEnv(raw: Readonly<Record<string, string | undefined>>) {
  const unknown = Object.keys(raw).filter((key) => !exactKeys.includes(key as (typeof exactKeys)[number]));
  if (unknown.length) throw new Error(`unknown admin environment keys: ${unknown.join(', ')}`);
  const values = Object.fromEntries(exactKeys.map((key) => {
    const value = raw[key];
    if (!value?.trim()) throw new Error(`${key} must not be empty`);
    if (value !== value.trim()) throw new Error(`${key} must not contain surrounding whitespace`);
    return [key, value];
  })) as Record<(typeof exactKeys)[number], string>;
  const origin = new URL(values.ADMIN_ALLOWED_ORIGIN);
  if (origin.origin !== values.ADMIN_ALLOWED_ORIGIN || origin.protocol !== 'https:') throw new Error('ADMIN_ALLOWED_ORIGIN must be an exact HTTPS origin');
  if (values.ADMIN_ATTESTATION_KEY.length < 32) throw new Error('ADMIN_ATTESTATION_KEY is too short');
  if (values.ADMIN_AUDIT_KEY.length < 32) throw new Error('ADMIN_AUDIT_KEY is too short');
  const database = new URL(values.ADMIN_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('ADMIN_DATABASE_URL must be PostgreSQL');
  return { ...values, CONTENT_ASSET_ORIGINS: parseContentAssetOrigins(values.CONTENT_ASSET_ORIGINS) };
}
