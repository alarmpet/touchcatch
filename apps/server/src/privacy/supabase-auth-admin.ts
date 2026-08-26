/**
 * Deletes the auth user, and refuses to guess when it cannot tell whether it did.
 *
 * Sessions, identities, refresh tokens and provider links live behind GoTrue, not in a table this
 * repository's SQL can reach — which is why the disposal function deliberately leaves `auth.users`
 * alone. This is the other half.
 *
 * The important case is the one in the middle. A request that times out, or comes back 5xx, may
 * have deleted the user or may not. Retrying is not free: a blind retry against a provider is how
 * one ambiguous call becomes several, and the effect journal cannot record what it does not know.
 * So an indeterminate result is reported as UNKNOWN_OUTCOME and the request goes to a person.
 *
 * 404 is success. If the user is already gone, the goal is met, whoever met it.
 */

export type AuthDeletionOutcome =
  | Readonly<{ kind: 'COMPLETED' }>
  | Readonly<{ kind: 'NOT_APPLICABLE'; detail: string }>
  | Readonly<{ kind: 'FAILED_PERMANENT'; detail: string }>
  | Readonly<{ kind: 'UNKNOWN_OUTCOME'; detail: string }>;

export interface AuthAdminClient {
  deleteUser(authenticatedUserId: string): Promise<AuthDeletionOutcome>;
}

export type FetchLike = (
  url: string,
  init: Readonly<{ method: string; headers: Record<string, string>; signal?: AbortSignal }>,
) => Promise<Readonly<{ status: number; text(): Promise<string> }>>;

export type AuthAdminOptions = Readonly<{
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
}>;

export function createSupabaseAuthAdmin(options: AuthAdminOptions): AuthAdminClient {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const origin = options.supabaseUrl.replace(/\/+$/u, '');

  return {
    async deleteUser(authenticatedUserId) {
      if (!/^[0-9a-f-]{36}$/u.test(authenticatedUserId)) {
        return { kind: 'FAILED_PERMANENT', detail: 'INVALID_USER_ID' };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status: number;
      try {
        const response = await options.fetchImpl(
          `${origin}/auth/v1/admin/users/${authenticatedUserId}`,
          {
            method: 'DELETE',
            headers: {
              apikey: options.serviceRoleKey,
              Authorization: `Bearer ${options.serviceRoleKey}`,
            },
            signal: controller.signal,
          },
        );
        status = response.status;
      } catch (error) {
        // Aborted, refused, DNS, TLS. None of these tell us whether the server acted.
        return {
          kind: 'UNKNOWN_OUTCOME',
          detail: error instanceof Error ? error.name : 'TRANSPORT_ERROR',
        };
      } finally {
        clearTimeout(timer);
      }

      if (status === 200 || status === 204) return { kind: 'COMPLETED' };
      if (status === 404) return { kind: 'NOT_APPLICABLE', detail: 'USER_ALREADY_ABSENT' };
      // 401/403 are a misconfigured worker, not a transient fault: retrying with the same
      // credential will fail the same way, and a person has to look at the deployment.
      if (status === 401 || status === 403) {
        return { kind: 'FAILED_PERMANENT', detail: `AUTH_ADMIN_${status}` };
      }
      if (status >= 500 || status === 429) {
        return { kind: 'UNKNOWN_OUTCOME', detail: `AUTH_ADMIN_${status}` };
      }
      return { kind: 'FAILED_PERMANENT', detail: `AUTH_ADMIN_${status}` };
    },
  };
}
