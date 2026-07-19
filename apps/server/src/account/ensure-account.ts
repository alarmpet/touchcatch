type QueryResult = Readonly<{ rows: Array<Readonly<{ value: unknown }>> }>;
type Queryable = Readonly<{ query(text: string, values: readonly unknown[]): Promise<QueryResult> }>;

type AccountProjection = Readonly<{
  apiSubjectKey: string;
  economySubjectKey: string;
  nickname: string;
  points?: number;
}>;

function projection(value: unknown): AccountProjection {
  if (typeof value !== 'object' || value === null) throw new Error('ACCOUNT_SETUP_FAILED');
  return value as AccountProjection;
}

export function createAccountStore(database: Queryable) {
  return {
    async ensureAccount(authSub: string): Promise<boolean> {
      const result = await database.query('select private.ensure_account_v1($1::uuid) as value', [authSub]);
      return result.rows.length === 1 && result.rows[0]?.value !== null;
    },
    async readMe(authSub: string): Promise<Readonly<{ profile: Readonly<{ displayName: string }>; points: number }>> {
      const result = await database.query('select private.read_me_v1($1::uuid) as value', [authSub]);
      const value = projection(result.rows[0]?.value);
      if (typeof value.nickname === 'string') return { profile: { displayName: value.nickname }, points: value.points ?? 0 };
      const nested = value as unknown as { profile?: { displayName?: unknown }; points?: unknown };
      if (typeof nested.profile?.displayName !== 'string' || typeof nested.points !== 'number') throw new Error('ACCOUNT_SETUP_FAILED');
      return { profile: { displayName: nested.profile.displayName }, points: nested.points };
    },
  };
}
