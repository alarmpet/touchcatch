import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import { getAuthClient } from '../auth/native-client.js';
import { createGuestProgressQueue } from './progress.js';
import { createGuestProgressSync } from './sync.js';
import { getMobileRuntimeEnv } from '../config/runtime.js';

const storage = ((AsyncStorageModule as unknown as { default?: AsyncStorageStatic }).default ?? AsyncStorageModule) as AsyncStorageStatic;
export const guestProgressQueue = createGuestProgressQueue(storage);
export const syncGuestProgress = createGuestProgressSync({
  queue: guestProgressQueue,
  async getAccessToken() { const { data } = await getAuthClient().auth.getSession(); return data.session?.access_token ?? null; },
  async post(batch, token) {
    const origin = getMobileRuntimeEnv().EXPO_PUBLIC_API_ORIGIN.replace(/\/$/u, '');
    const response = await fetch(`${origin}/v1/learning/progress/merge`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': batch.idempotencyKey }, body: JSON.stringify(batch.body) });
    if (!response.ok) throw new Error(`PROGRESS_MERGE_FAILED_${response.status}`);
    return await response.json() as { acceptedEventIds: string[]; rejected: Array<{ deviceEventId: string; code: string }> };
  },
});
