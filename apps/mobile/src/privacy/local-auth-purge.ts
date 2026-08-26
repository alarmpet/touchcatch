import { pendingKey } from '../auth/oauth-coordinator';
import { RECEIPT_STORAGE_KEY } from './account-deletion-client';

/**
 * Clears every local trace of the signed-in account, and reports honestly when it cannot.
 *
 * The old deletion path swallowed sign-out errors, so a device that failed to clear its stored
 * session showed a success message anyway. What made that worse than a plain bug is that the
 * person was told their account was gone while their tokens were still on disk.
 *
 * The receipt is the one thing deliberately kept. It is not a credential for the account — it
 * only resolves the deletion request — and it has to outlive the session, because after the
 * auth stage there is no session left to ask with.
 */

export interface PurgeStorage {
  removeItem(key: string): void | Promise<void>;
}

export interface LocalAuthPurgePort {
  purgeSession(): Promise<void>;
  purgePendingOAuth(): Promise<void>;
}

export type PurgeOutcome = Readonly<{
  ok: boolean;
  /** Names of the steps that failed, for a message that says what is still on the device. */
  failed: readonly string[];
}>;

export function createLocalAuthPurge(dependencies: Readonly<{
  signOutLocal(): Promise<void>;
  storage: PurgeStorage;
}>): LocalAuthPurgePort & { purgeAll(): Promise<PurgeOutcome> } {
  const purgeSession = async () => { await dependencies.signOutLocal(); };
  const purgePendingOAuth = async () => { await dependencies.storage.removeItem(pendingKey); };

  return {
    purgeSession,
    purgePendingOAuth,
    /**
     * Runs every step even when an earlier one fails, then reports what did not clear.
     *
     * Stopping at the first failure would leave later steps untried for no reason — the
     * pending PKCE transaction is worth clearing whether or not sign-out succeeded.
     */
    async purgeAll(): Promise<PurgeOutcome> {
      const failed: string[] = [];
      for (const [name, step] of [['session', purgeSession], ['pendingOAuth', purgePendingOAuth]] as const) {
        try {
          await step();
        } catch {
          failed.push(name);
        }
      }
      return { ok: failed.length === 0, failed };
    },
  };
}

/** Exported so a test can assert the receipt is not among the swept keys. */
export const PURGED_KEYS = [pendingKey] as const;
export const PRESERVED_KEYS = [RECEIPT_STORAGE_KEY] as const;
