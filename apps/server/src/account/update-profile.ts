import type { VerifiedIdentity } from '../auth/verify.js';

type UpdateInput = Readonly<{ authSub: string; idempotencyKey: string; nickname: string }>;
type Profile = Readonly<{ profile: Readonly<{ displayName: string }>; points: number }>;
type Store = Readonly<{ update(input: UpdateInput): Promise<Profile> }>;
type Database = Readonly<{ query(text: string, values: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }> }>;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function updateProfile(identity: VerifiedIdentity, idempotencyKey: string, body: unknown, store: Store): Promise<Profile> {
  if (identity.isAnonymous) throw new Error('ANONYMOUS_FORBIDDEN');
  if (!uuidV4.test(idempotencyKey) || typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('VALIDATION_FAILED');
  const values = body as Record<string, unknown>;
  if (Object.keys(values).length !== 1 || typeof values.nickname !== 'string') throw new Error('VALIDATION_FAILED');
  if (values.nickname.trim().length < 1 || values.nickname.length > 256) throw new Error('VALIDATION_FAILED');
  return store.update({ authSub: identity.authSub, idempotencyKey, nickname: values.nickname });
}

export function createProfileStore(database: Database): Store {
  return {
    async update(input) {
      const result = await database.query('select private.update_profile_v1($1::uuid,$2::uuid,$3::text) as value', [input.authSub, input.idempotencyKey, input.nickname]);
      const value = result.rows[0]?.value;
      if (typeof value !== 'object' || value === null) throw new Error('ACCOUNT_SETUP_FAILED');
      const profile = value as { profile?: { displayName?: unknown }; points?: unknown };
      if (typeof profile.profile?.displayName !== 'string' || typeof profile.points !== 'number') throw new Error('ACCOUNT_SETUP_FAILED');
      return { profile: { displayName: profile.profile.displayName }, points: profile.points };
    },
  };
}
