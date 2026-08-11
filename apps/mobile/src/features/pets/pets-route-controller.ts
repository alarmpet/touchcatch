import { MobileApiError } from '../../api/mobile-api-transport';
import type { createPetApi, PetCollectionResponse } from './pet-api';

type PetApi = ReturnType<typeof createPetApi>;
type SessionStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';
type Operation = 'IDLE' | 'CLAIMING' | 'PROMOTING';

export type PetsRouteState =
  | Readonly<{ status: 'LOADING' }>
  | Readonly<{ status: 'SIGNED_OUT' }>
  | Readonly<{ status: 'DISABLED'; code: string }>
  | Readonly<{ status: 'ERROR'; code: string; retry: 'LOAD' | 'CLAIM' | 'PROMOTION'; petId?: string }>
  | Readonly<{ status: 'EMPTY'; collection: PetCollectionResponse; claimedToday: boolean; operation: Operation }>
  | Readonly<{ status: 'READY'; collection: PetCollectionResponse; claimedToday: boolean; operation: Operation }>;

export interface PetsRouteController {
  getState(): PetsRouteState;
  subscribe(listener: (state: PetsRouteState) => void): () => void;
  load(): Promise<void>;
  claimDaily(): Promise<void>;
  promote(petId: string): Promise<void>;
  dispose(): void;
}

const disabledCodes = new Set(['REWARD_POLICY_NOT_APPROVED', 'PET_ART_NOT_APPROVED', 'POLICY_MISMATCH']);

function errorCode(error: unknown): string {
  return error instanceof MobileApiError || error instanceof Error ? error.message : 'UNKNOWN_ERROR';
}

function isRetryable(error: unknown): boolean {
  if (error instanceof MobileApiError) {
    return error.status === null || error.status === 408 || error.status === 429 || error.status >= 500 || error.code === 'RESPONSE_INVALID';
  }
  return error instanceof Error && error.message.endsWith('RESPONSE_INVALID');
}

export function createPetsRouteController(input: Readonly<{
  session(): SessionStatus;
  api: PetApi;
  createKey(): string;
}>): PetsRouteController {
  let disposed = false;
  let claimedToday = false;
  let claimKey: string | null = null;
  const promotionKeys = new Map<string, string>();
  const listeners = new Set<(state: PetsRouteState) => void>();
  let state: PetsRouteState = input.session() === 'signed-in'
    ? { status: 'LOADING' }
    : { status: 'SIGNED_OUT' };

  const publish = (next: PetsRouteState) => {
    if (disposed) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const failure = (error: unknown, retry: 'LOAD' | 'CLAIM' | 'PROMOTION', petId?: string) => {
    const code = errorCode(error);
    publish(disabledCodes.has(code) ? { status: 'DISABLED', code } : { status: 'ERROR', code, retry, ...(petId ? { petId } : {}) });
  };
  const requireSession = (): boolean => {
    if (input.session() === 'signed-in') return true;
    claimedToday = false;
    claimKey = null;
    promotionKeys.clear();
    publish({ status: 'SIGNED_OUT' });
    return false;
  };

  const controller: PetsRouteController = {
    getState: () => state,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      if (!requireSession()) return;
      publish({ status: 'LOADING' });
      try {
        const collection = await input.api.getCollection();
        if (!requireSession()) return;
        claimedToday = collection.claimedToday;
        publish({
          status: collection.pets.length === 0 ? 'EMPTY' : 'READY',
          collection,
          claimedToday,
          operation: 'IDLE',
        });
      } catch (error) {
        if (input.session() !== 'signed-in') { requireSession(); return; }
        failure(error, 'LOAD');
      }
    },
    async claimDaily() {
      if (!requireSession()) return;
      claimKey ??= input.createKey();
      if (state.status === 'READY') publish({ status: 'READY', collection: state.collection, claimedToday, operation: 'CLAIMING' });
      else if (state.status === 'EMPTY') publish({ status: 'EMPTY', collection: state.collection, claimedToday, operation: 'CLAIMING' });
      try {
        await input.api.claimDailyDraw(claimKey);
        if (!requireSession()) return;
        claimKey = null;
        claimedToday = true;
        await controller.load();
      } catch (error) {
        if (input.session() !== 'signed-in') { publish({ status: 'SIGNED_OUT' }); return; }
        if (!isRetryable(error)) claimKey = null;
        failure(error, 'CLAIM');
      }
    },
    async promote(petId) {
      if (!requireSession()) return;
      const key = promotionKeys.get(petId) ?? input.createKey();
      promotionKeys.set(petId, key);
      if (state.status === 'READY') publish({ status: 'READY', collection: state.collection, claimedToday, operation: 'PROMOTING' });
      else if (state.status === 'EMPTY') publish({ status: 'EMPTY', collection: state.collection, claimedToday, operation: 'PROMOTING' });
      try {
        await input.api.promoteDuplicates(petId, key);
        if (!requireSession()) return;
        promotionKeys.delete(petId);
        await controller.load();
      } catch (error) {
        if (input.session() !== 'signed-in') { publish({ status: 'SIGNED_OUT' }); return; }
        if (!isRetryable(error)) promotionKeys.delete(petId);
        failure(error, 'PROMOTION', petId);
      }
    },
    dispose() {
      disposed = true;
      listeners.clear();
      claimKey = null;
      promotionKeys.clear();
    },
  };
  return controller;
}
