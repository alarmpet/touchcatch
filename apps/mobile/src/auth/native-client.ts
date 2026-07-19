import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { createAuthClientFactory } from './client.js';
import { getMobileRuntimeEnv } from '../config/runtime.js';

const storage = ((AsyncStorageModule as unknown as { default?: AsyncStorageStatic }).default ?? AsyncStorageModule) as AsyncStorageStatic;

const runtimeEnv = new Proxy({}, { get: (_target, property) => getMobileRuntimeEnv()[property as keyof ReturnType<typeof getMobileRuntimeEnv>] }) as Record<string, string>;
const factory = createAuthClientFactory({
  env: runtimeEnv,
  storage,
  lock: processLock,
  createClient: (url, key, options) => createClient(url, key, options as Parameters<typeof createClient>[2]),
});

export const getAuthClient = factory.getClient;
