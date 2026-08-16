import { MobileApiError } from '../../api/mobile-api-transport';
import type { createPetApi, PetCollectionResponse } from './pet-api';
import type { PetRevealV1 } from './reveal-model';

type PetApi = ReturnType<typeof createPetApi>;
type SessionStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';
type Operation = 'IDLE' | 'CLAIMING' | 'PROMOTING';

export type PetsRouteState =
  | Readonly<{ status: 'LOADING' }>
  | Readonly<{ status: 'SIGNED_OUT' }>
  | Readonly<{ status: 'DISABLED'; code: string }>
  | Readonly<{ status: 'ERROR'; code: string; retry: 'LOAD' | 'CLAIM' | 'PROMOTION'; petId?: string }>
  | Readonly<{ status: 'EMPTY'; collection: PetCollectionResponse; claimedToday: boolean; operation: Operation; reveal?: PetRevealV1 }>
  | Readonly<{ status: 'READY'; collection: PetCollectionResponse; claimedToday: boolean; operation: Operation; reveal?: PetRevealV1 }>;

export interface PetsRouteController {
  getState(): PetsRouteState;
  subscribe(listener: (state: PetsRouteState) => void): () => void;
  load(): Promise<void>;
  claimDaily(): Promise<void>;
  promote(petId: string): Promise<void>;
  /** Clears the pending reveal once the player has closed it. */
  dismissReveal(): void;
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
  let pendingReveal: PetRevealV1 | null = null;
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
    pendingReveal = null;
    claimKey = null;
    promotionKeys.clear();
    publish({ status: 'SIGNED_OUT' });
    return false;
  };
  /** A pet the collection did not hold before this acquisition is a new 도감 entry. */
  const ownsPet = (petId: string): boolean =>
    (state.status === 'READY' || state.status === 'EMPTY')
    && state.collection.pets.some((pet) => pet.petId === petId);
  /**
   * The reveal is presentational only. A committed acquisition must never be reported as
   * a failure because the celebration could not be built, so this never throws.
   */
  const toReveal = (source: PetRevealV1['source'], awarded: unknown): PetRevealV1 | null => {
    const pet = (awarded as { pet?: unknown; output?: unknown } | null | undefined)?.[source === 'DAILY_DRAW' ? 'pet' : 'output'];
    if (!pet || typeof pet !== 'object') return null;
    const { petId, rarity, copies } = pet as Record<string, unknown>;
    if (typeof petId !== 'string' || typeof rarity !== 'string' || typeof copies !== 'number') return null;
    return { source, petId, rarity: rarity as PetRevealV1['rarity'], copies, isFirstCopy: !ownsPet(petId) };
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
          ...(pendingReveal ? { reveal: pendingReveal } : {}),
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
        const drawn = await input.api.claimDailyDraw(claimKey);
        if (!requireSession()) return;
        claimKey = null;
        claimedToday = true;
        pendingReveal = toReveal('DAILY_DRAW', drawn);
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
        const promoted = await input.api.promoteDuplicates(petId, key);
        if (!requireSession()) return;
        promotionKeys.delete(petId);
        pendingReveal = toReveal('PROMOTION', promoted);
        await controller.load();
      } catch (error) {
        if (input.session() !== 'signed-in') { publish({ status: 'SIGNED_OUT' }); return; }
        if (!isRetryable(error)) promotionKeys.delete(petId);
        failure(error, 'PROMOTION', petId);
      }
    },
    dismissReveal() {
      pendingReveal = null;
      if (state.status !== 'READY' && state.status !== 'EMPTY') return;
      publish({
        status: state.status,
        collection: state.collection,
        claimedToday: state.claimedToday,
        operation: state.operation,
      });
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
