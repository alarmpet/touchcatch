import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { createEmailAuth } from './email.js';
import { getAuthClient } from './native-client.js';
import { createOAuthCoordinator } from './oauth.js';
import { createIdentityCoordinator } from './linking.js';
import { createSessionLifecycle } from './session.js';
import { getMobileRuntimeEnv } from '../config/runtime.js';

let services: ReturnType<typeof buildServices> | undefined;

type SuccessfulData<Result> = Result extends Readonly<{ data: infer Data; error: null }> ? Data : never;
type ExactAuthResult<Data> =
  | Readonly<{ data: Data; error: null }>
  | Readonly<{ data: null; error: unknown }>;

function toAuthResult<Result extends Readonly<{ data: unknown; error: unknown }>>(
  result: Result,
): ExactAuthResult<SuccessfulData<Result>>;
function toAuthResult(result: Readonly<{ data: unknown; error: unknown }>) {
  return result.error === null
    ? { data: result.data, error: null } as const
    : { data: null, error: result.error } as const;
}

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
  const identityAuth = {
    reauthenticate: async () => toAuthResult(await client.auth.reauthenticate()),
    verifyOtp: async (input: Parameters<typeof client.auth.verifyOtp>[0]) => toAuthResult(await client.auth.verifyOtp(input)),
    getUserIdentities: async () => toAuthResult(await client.auth.getUserIdentities()),
    linkIdentity: async (input: Readonly<{ provider: 'google' | 'kakao'; options: Readonly<{ redirectTo: string; skipBrowserRedirect: true }> }>) => toAuthResult(await client.auth.linkIdentity(input)),
    unlinkIdentity: async (identity: Parameters<typeof client.auth.unlinkIdentity>[0]) => toAuthResult(await client.auth.unlinkIdentity(identity)),
    exchangeCodeForSession: async (code: string) => toAuthResult(await client.auth.exchangeCodeForSession(code)),
  };
  const identityCoordinator = createIdentityCoordinator(identityAuth, { storage, browser: WebBrowser });
  const sessionLifecycle = createSessionLifecycle(client.auth, () => storage.removeItem('touchcatch.auth.pkce.pending'), async (sessionIdentity) => {
    const linkedIdentity = await identityCoordinator.resumeLink();
    if (linkedIdentity) return linkedIdentity;
    const oauthGate = await oauthCoordinator.resume(sessionIdentity);
    const recoveryRequired = await emailAuth.resumeRecovery(sessionIdentity);
    if (recoveryRequired) return { state: 'RECOVERY_REQUIRED' as const };
    return oauthGate;
  });
  const completeAuthCallback = async (url: string) => {
    const raw = await storage.getItem('touchcatch.auth.pkce.pending');
    if (raw && (JSON.parse(raw) as { kind?: string }).kind === 'identity-link') return identityCoordinator.completeLink(url);
    return oauthCoordinator.completeOAuth(url);
  };
  return { emailAuth, oauthCoordinator, identityCoordinator, completeAuthCallback, sessionLifecycle };
}

export function getNativeAuthServices() { return services ??= buildServices(); }
