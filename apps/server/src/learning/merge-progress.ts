import { createHash } from 'node:crypto';
import { learningProgressMergeRequestSchema, type LearningProgressMergeRequest } from '../../../../packages/contracts/src/auth.js';
import type { VerifiedIdentity } from '../auth/verify.js';

type MergeResult = Readonly<{ acceptedEventIds: readonly string[]; rejected: ReadonlyArray<Readonly<{ deviceEventId: string; code: string }>> }>;
type Store = Readonly<{ merge(input: Readonly<{ authSub: string; idempotencyKey: string; requestHash: string; events: LearningProgressMergeRequest['events'] }>): Promise<MergeResult> }>;
type Database = Readonly<{ query(text: string, values: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }> }>;

export function createLearningProgressStore(database: Database): Store {
  return { async merge(input) {
    const result = await database.query('select private.merge_learning_progress_v1($1::uuid,$2::uuid,$3::text,$4::jsonb) as value', [input.authSub, input.idempotencyKey, input.requestHash, JSON.stringify(input.events)]);
    const value = result.rows[0]?.value;
    if (!value || typeof value !== 'object' || !Array.isArray((value as MergeResult).acceptedEventIds) || !Array.isArray((value as MergeResult).rejected)) throw new Error('INVALID_PROGRESS_RESPONSE');
    return value as MergeResult;
  } };
}

function canonicalRequestHash(value: LearningProgressMergeRequest): string {
  const stable = JSON.stringify({ schemaVersion: value.schemaVersion, events: value.events.map((event) => ({ completedAt: event.completedAt, contentKey: event.contentKey, contentRevision: event.contentRevision, deviceEventId: event.deviceEventId })) });
  return createHash('sha256').update(stable).digest('hex');
}

export async function mergeLearningProgress(identity: VerifiedIdentity, idempotencyKey: string, body: unknown, store: Store): Promise<MergeResult> {
  if (identity.isAnonymous) throw new Error('ANONYMOUS_FORBIDDEN');
  const parsed = learningProgressMergeRequestSchema.safeParse(body);
  if (!parsed.success) throw new Error('INVALID_PROGRESS_BATCH');
  const ids = parsed.data.events.map((event) => event.deviceEventId);
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_DEVICE_EVENT_ID');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(idempotencyKey)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return store.merge({ authSub: identity.authSub, idempotencyKey, requestHash: canonicalRequestHash(parsed.data), events: parsed.data.events });
}
