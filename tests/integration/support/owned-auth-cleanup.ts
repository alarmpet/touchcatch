type QueryOwnedUser = (
  text: string,
  values: unknown[],
) => PromiseLike<Readonly<{ rows: ReadonlyArray<Readonly<{ value?: unknown }>> }>>;

export async function confirmOwnedAuthUserAbsent(
  query: QueryOwnedUser,
  userId: string,
  recipient: string,
  options: Readonly<{ timeoutMs?: number }> = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      query(
        'select exists(select 1 from auth.users where id = $1 and email = $2) as value',
        [userId, recipient],
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    if (result.rows[0]?.value !== false) throw new Error('user remains');
  } catch {
    throw new Error('LOCAL_AUTH_CLEANUP_FAILED');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
