type PendingEvent = Readonly<{ deviceEventId: string; contentKey: string; contentRevision: string; completedAt: string; rejectionCode?: string }>;
type Storage = Readonly<{ getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }>;
const key = 'touchcatch.learning.pending.v1';
type QueueState = { events: PendingEvent[]; batch?: { idempotencyKey: string; eventIds: string[] } };

function uuidV4(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createGuestProgressQueue(storage: Storage, createId: () => string = uuidV4) {
  let chain = Promise.resolve();
  const locked = <T>(operation: () => Promise<T>): Promise<T> => { const result = chain.then(operation, operation); chain = result.then(() => undefined, () => undefined); return result; };
  const readState = async (): Promise<QueueState> => { const value = JSON.parse(await storage.getItem(key) ?? '{"events":[]}') as QueueState | PendingEvent[]; return Array.isArray(value) ? { events: value } : value; };
  const write = (state: QueueState) => storage.setItem(key, JSON.stringify(state));
  return {
    pending() { return locked(async () => (await readState()).events); },
    async record(event: Omit<PendingEvent, 'deviceEventId' | 'rejectionCode'>): Promise<PendingEvent> {
      return locked(async () => { const receipt = { ...event, deviceEventId: createId() }; const state = await readState(); await write({ ...state, events: [...state.events, receipt] }); return receipt; });
    },
    prepareMergeBatch() { return locked(async () => {
      const state = await readState();
      if (!state.batch) {
        const eventIds = state.events.filter((event) => !event.rejectionCode).map((event) => event.deviceEventId);
        if (eventIds.length === 0) throw new Error('NO_PENDING_PROGRESS');
        state.batch = { idempotencyKey: createId(), eventIds }; await write(state);
      }
      const selected = new Set(state.batch.eventIds);
      return { idempotencyKey: state.batch.idempotencyKey, body: { schemaVersion: '1' as const, events: state.events.filter((event) => selected.has(event.deviceEventId)).map(({ rejectionCode: _ignored, ...event }) => event) } };
    }); },
    applyMergeResult(result: Readonly<{ acceptedEventIds: readonly string[]; rejected: ReadonlyArray<Readonly<{ deviceEventId: string; code: string }>> }>) { return locked(async () => {
      const accepted = new Set(result.acceptedEventIds);
      const rejected = new Map(result.rejected.map((item) => [item.deviceEventId, item.code]));
      const state = await readState();
      await write({ events: state.events.filter((event) => !accepted.has(event.deviceEventId)).map((event) => rejected.has(event.deviceEventId) ? { ...event, rejectionCode: rejected.get(event.deviceEventId) } : event) });
    }); },
  };
}
