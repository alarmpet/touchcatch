import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { createEmailAuth } from './email.js';
import { getAuthClient } from './native-client.js';
import { createOAuthCoordinator } from './oauth.js';
import { createSessionLifecycle } from './session.js';
import { getMobileRuntimeEnv } from '../config/runtime.js';

let services: ReturnType<typeof buildServices> | undefined;
function buildServices() {
  const storage = ((AsyncStorageModule as unknown as { default?: AsyncStorageStatic }).default ?? AsyncStorageModule) as AsyncStorageStatic;
  const client = getAuthClient();
  async function ensureAccount(): Promise<void> {
    const origin = getMobileRuntimeEnv().EXPO_PUBLIC_API_ORIGIN.replace(/\/$/u, '');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Authenticated session required');
    const response = await fetch(`${origin}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Account bootstrap failed (${response.status})`);
  }
  const emailAuth = createEmailAuth({ auth: client.auth, ensureAccount, storage });
  const oauthCoordinator = createOAuthCoordinator({ auth: client.auth, browser: WebBrowser, storage, ensureAccount });
  const sessionLifecycle = createSessionLifecycle(client.auth, () => storage.removeItem('touchcatch.auth.pkce.pending'), async (sessionIdentity) => {
    const oauthGate = await oauthCoordinator.resume(sessionIdentity);
    const recoveryRequired = await emailAuth.resumeRecovery(sessionIdentity);
    if (recoveryRequired) return { state: 'RECOVERY_REQUIRED' as const };
    return oauthGate;
  });
  return { emailAuth, oauthCoordinator, sessionLifecycle };
}

export function getNativeAuthServices() { return services ??= buildServices(); }
