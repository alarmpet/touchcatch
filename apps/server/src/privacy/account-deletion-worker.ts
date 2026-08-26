import { randomUUID } from 'node:crypto';
import { PgRpcError } from '../database/pg-rpc.js';
import type { AuthAdminClient } from './supabase-auth-admin.js';
import type { PrivacyWorkerRpc } from './privacy-worker-rpc.js';
import { verifyDisposition, type DispositionVerdict } from './disposition-approval-verifier.js';

/**
 * Advances account-deletion requests through their stages.
 *
 * The request itself is durable and the account is already closed by the time anything here runs
 * — that happened in the same transaction that accepted the request. This is the part that makes
 * the closure mean something: app data, then the auth user, then the record that it finished.
 *
 * Everything about this loop is written for the case where it dies in the middle. It claims one
 * request at a time under a lease, does exactly one stage per external call, and writes the
 * outcome before moving on. A crash loses the lease and nothing else; the next worker picks the
 * request up where the journal says it stopped.
 *
 * What it will not do is guess. A stage whose outcome cannot be established stops the request and
 * puts it in front of a person, because the alternative — retry and hope — turns one ambiguous
 * provider call into several real ones.
 */

export type WorkerLogEvent = Readonly<{
  event: string;
  requestId?: string;
  stage?: string;
  outcome?: string;
  durationMs?: number;
  detail?: string;
}>;

/**
 * Nothing identifying is ever logged: no auth id, no subject key, no email, no receipt. The
 * request id is enough to follow one deletion through the logs, and it is not a person.
 */
export type WorkerLogger = (event: WorkerLogEvent) => void;

export type WorkerDependencies = Readonly<{
  rpc: PrivacyWorkerRpc;
  authAdmin: AuthAdminClient;
  /** The exact bytes of docs/legal/data-disposition.v1.json. */
  dispositionDocument: string;
  log: WorkerLogger;
  now?: () => number;
  leaseSeconds?: number;
  maxAttempts?: number;
}>;

type Claim = Readonly<{
  claimed: boolean;
  requestId?: string;
  subjectKey?: string;
  authenticatedUserId?: string;
  state?: string;
  fence?: number;
  attempts?: number;
}>;

export type TickResult =
  | Readonly<{ kind: 'IDLE' }>
  | Readonly<{ kind: 'REFUSED'; reason: string }>
  | Readonly<{ kind: 'ADVANCED'; requestId: string; state: string }>
  | Readonly<{ kind: 'HANDED_OFF'; requestId: string; reason: string }>;

export class AccountDeletionWorker {
  private readonly leaseSeconds: number;
  private readonly maxAttempts: number;
  private readonly verdict: DispositionVerdict;

  constructor(private readonly deps: WorkerDependencies) {
    this.leaseSeconds = deps.leaseSeconds ?? 60;
    this.maxAttempts = deps.maxAttempts ?? 8;
    this.verdict = verifyDisposition(deps.dispositionDocument);
  }

  /** What the worker would refuse to start for, if anything. Exposed so a health check can say. */
  get refusal(): string | null {
    return this.verdict.allowed ? null : this.verdict.reason;
  }

  /**
   * Claims at most one request and advances it by one stage.
   *
   * One stage per tick, not a loop to completion: each stage is a separate external effect, and
   * committing them one at a time is what lets the journal be the record of what happened rather
   * than a summary written afterwards.
   */
  async tick(): Promise<TickResult> {
    if (!this.verdict.allowed) {
      // Requests keep arriving and keep closing accounts; they simply do not advance. Said out
      // loud on every tick so this cannot be a quiet no-op nobody notices for a month.
      this.deps.log({ event: 'worker.refused', detail: this.verdict.reason });
      return { kind: 'REFUSED', reason: this.verdict.reason };
    }

    const ownerToken = randomUUID();
    const claim = (await this.deps.rpc.call('claim_account_deletion_v1', [
      ownerToken,
      this.leaseSeconds,
      this.maxAttempts,
    ])) as Claim;

    if (!claim?.claimed) return { kind: 'IDLE' };

    const requestId = claim.requestId!;
    const fence = Number(claim.fence);
    this.deps.log({
      event: 'worker.claimed',
      requestId,
      ...(claim.state === undefined ? {} : { stage: claim.state }),
    });

    try {
      if (claim.state === 'ACCESS_BLOCKED') {
        return await this.disposeAppData(requestId, ownerToken, fence);
      }
      if (claim.state === 'APP_DATA_DISPOSED') {
        return await this.revokeProviders(requestId, ownerToken, fence);
      }
      if (claim.state === 'PROVIDERS_REVOKED') {
        return await this.deleteAuthUser(requestId, ownerToken, fence, claim.authenticatedUserId!);
      }
      if (claim.state === 'AUTH_DELETED') {
        return await this.notify(requestId, ownerToken, fence);
      }
      if (claim.state === 'FAILED_RETRYABLE') {
        // Re-entering wherever the stages say it stopped. The claim raised `attempts`, so a
        // request that keeps failing runs out of them rather than spinning.
        return { kind: 'HANDED_OFF', requestId, reason: 'RETRY_FROM_RECORDED_STAGE' };
      }
      return { kind: 'HANDED_OFF', requestId, reason: `UNEXPECTED_STATE:${claim.state}` };
    } catch (error) {
      if (error instanceof PgRpcError && error.code === 'LEASE_LOST') {
        // Another worker owns it. Not a failure, and specifically not something to record against
        // the request: whoever holds the lease is writing the outcome.
        this.deps.log({ event: 'worker.lease-lost', requestId });
        return { kind: 'HANDED_OFF', requestId, reason: 'LEASE_LOST' };
      }
      throw error;
    }
  }

  private async disposeAppData(
    requestId: string,
    ownerToken: string,
    fence: number,
  ): Promise<TickResult> {
    const startedAt = this.deps.now?.() ?? Date.now();
    const result = (await this.deps.rpc.call('dispose_account_app_data_v1', [
      requestId,
      ownerToken,
      fence,
    ])) as Readonly<{ deletedRows: number; alreadyDone: boolean }>;
    this.deps.log({
      event: 'worker.stage',
      requestId,
      stage: 'APP_DATA',
      outcome: result.alreadyDone ? 'ALREADY_DONE' : 'COMPLETED',
      durationMs: (this.deps.now?.() ?? Date.now()) - startedAt,
    });
    return { kind: 'ADVANCED', requestId, state: 'APP_DATA_DISPOSED' };
  }

  /**
   * Provider unlink. Deliberately NOT_APPLICABLE for now.
   *
   * Deleting the Supabase auth user removes the identity rows that hold the Google link, so there
   * is nothing left pointing at the provider from our side. Calling Google's revocation endpoint
   * as well would need the user's refresh token kept past the point they asked to be forgotten,
   * which is a worse trade and needs its own approval. Recorded explicitly rather than skipped so
   * the receipt says what happened.
   */
  private async revokeProviders(
    requestId: string,
    ownerToken: string,
    fence: number,
  ): Promise<TickResult> {
    await this.deps.rpc.call('complete_deletion_stage_v1', [
      requestId,
      ownerToken,
      fence,
      'PROVIDERS',
      'supabase-identities',
      'NOT_APPLICABLE',
      null,
    ]);
    this.deps.log({ event: 'worker.stage', requestId, stage: 'PROVIDERS', outcome: 'NOT_APPLICABLE' });
    return { kind: 'ADVANCED', requestId, state: 'PROVIDERS_REVOKED' };
  }

  private async deleteAuthUser(
    requestId: string,
    ownerToken: string,
    fence: number,
    authenticatedUserId: string,
  ): Promise<TickResult> {
    const startedAt = this.deps.now?.() ?? Date.now();
    const outcome = await this.deps.authAdmin.deleteUser(authenticatedUserId);
    const detail = 'detail' in outcome ? outcome.detail : null;

    await this.deps.rpc.call('complete_deletion_stage_v1', [
      requestId,
      ownerToken,
      fence,
      'AUTH',
      'auth-user',
      outcome.kind,
      detail,
    ]);

    this.deps.log({
      event: 'worker.stage',
      requestId,
      stage: 'AUTH',
      outcome: outcome.kind,
      durationMs: (this.deps.now?.() ?? Date.now()) - startedAt,
      ...(detail === null ? {} : { detail }),
    });

    if (outcome.kind === 'UNKNOWN_OUTCOME') {
      return { kind: 'HANDED_OFF', requestId, reason: 'MANUAL_REVIEW' };
    }
    if (outcome.kind === 'FAILED_PERMANENT') {
      return { kind: 'HANDED_OFF', requestId, reason: 'FAILED_PERMANENT' };
    }
    return { kind: 'ADVANCED', requestId, state: 'AUTH_DELETED' };
  }

  /**
   * The completion notice.
   *
   * There is nowhere to send it: the email address was the thing being deleted, and keeping a copy
   * so we can write to it afterwards defeats the request. The device holds the receipt and can
   * read the status without an account, which is the channel this stage would otherwise duplicate.
   * Recorded as NOT_APPLICABLE so the receipt shows a finished stage rather than a pending one.
   */
  private async notify(requestId: string, ownerToken: string, fence: number): Promise<TickResult> {
    await this.deps.rpc.call('complete_deletion_stage_v1', [
      requestId,
      ownerToken,
      fence,
      'NOTIFICATION',
      'device-receipt',
      'NOT_APPLICABLE',
      null,
    ]);
    this.deps.log({
      event: 'worker.stage',
      requestId,
      stage: 'NOTIFICATION',
      outcome: 'NOT_APPLICABLE',
    });
    return { kind: 'ADVANCED', requestId, state: 'COMPLETED' };
  }
}
