import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { createAuthClientFactory } from './client.js';

const storage = ((AsyncStorageModule as unknown as { default?: AsyncStorageStatic }).default ?? AsyncStorageModule) as AsyncStorageStatic;

const factory = createAuthClientFactory({
  env: {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  storage,
  lock: processLock,
  createClient: (url, key, options) => createClient(url, key, options as Parameters<typeof createClient>[2]),
});

export const getAuthClient = factory.getClient;
