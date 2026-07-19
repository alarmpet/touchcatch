type MergeResult = Readonly<{ acceptedEventIds: readonly string[]; rejected: ReadonlyArray<Readonly<{ deviceEventId: string; code: string }>> }>;
type PreparedBatch = Readonly<{ idempotencyKey: string; body: unknown }>;
export function createGuestProgressSync(dependencies: Readonly<{ queue: { prepareMergeBatch(): Promise<PreparedBatch>; applyMergeResult(result: MergeResult): Promise<void> }; getAccessToken(): Promise<string | null>; post(batch: PreparedBatch, token: string): Promise<MergeResult> }>) {
  return async () => {
    const token = await dependencies.getAccessToken(); if (!token) return false;
    let batch: PreparedBatch; try { batch = await dependencies.queue.prepareMergeBatch(); } catch (error) { if (error instanceof Error && error.message === 'NO_PENDING_PROGRESS') return false; throw error; }
    const result = await dependencies.post(batch, token); await dependencies.queue.applyMergeResult(result); return true;
  };
}
