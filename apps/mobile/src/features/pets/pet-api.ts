export type PetApiRequest = Readonly<{
  method: 'GET' | 'POST';
  path: string;
  idempotencyKey?: string;
  body?: unknown;
}>;

export type PetApiTransport = Readonly<{
  request<T>(request: PetApiRequest): Promise<T>;
}>;

export type PetCollectionResponse = PetCollectionV1;
export type DailyDrawResponse = DailyFreeDrawV1;
export type DuplicatePromotionResponse = DuplicatePromotionV1;

function requireNonBlank(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function requireIdempotencyKey(value: string): string {
  const normalized = requireNonBlank(value, 'IDEMPOTENCY_KEY_REQUIRED').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)) {
    throw new Error('IDEMPOTENCY_KEY_INVALID');
  }
  return normalized;
}

export function createPetApi(transport: PetApiTransport) {
  return {
    getCollection: async () => {
      const value = await transport.request<unknown>({
        method: 'GET',
        path: '/v1/pets/collection',
      });
      const result = petCollectionV1Schema.safeParse(value);
      if (!result.success) throw new Error('PET_COLLECTION_RESPONSE_INVALID');
      return result.data;
    },
    claimDailyDraw: async (idempotencyKey: string) => {
      const value = await transport.request<unknown>({
        method: 'POST',
        path: '/v1/pets/daily-draw',
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
      });
      const result = dailyFreeDrawV1Schema.safeParse(value);
      if (!result.success) throw new Error('PET_DAILY_DRAW_RESPONSE_INVALID');
      return result.data;
    },
    promoteDuplicates: async (petId: string, idempotencyKey: string) => {
      const value = await transport.request<unknown>({
        method: 'POST',
        path: '/v1/pets/duplicate-promotion',
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        body: {
          materials: [
            { petId: requireNonBlank(petId, 'PET_ID_REQUIRED'), count: 10 },
          ],
        },
      });
      const result = duplicatePromotionV1Schema.safeParse(value);
      if (!result.success) throw new Error('PET_PROMOTION_RESPONSE_INVALID');
      return result.data;
    },
  } as const;
}
import {
  dailyFreeDrawV1Schema,
  duplicatePromotionV1Schema,
  petCollectionV1Schema,
  type DailyFreeDrawV1,
  type DuplicatePromotionV1,
  type PetCollectionV1,
} from '../../../../../packages/contracts/src/daily-pet-loop';
