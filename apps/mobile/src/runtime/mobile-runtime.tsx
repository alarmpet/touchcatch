import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { parseMobileEnvironment, type MobileEnvironment } from '../auth/env';
import { createMobileSupabaseRuntime } from '../auth/supabase-client';
import { createSessionController, type PublicSessionState, type SessionController } from '../auth/session-controller';
import { createOAuthCoordinator } from '../auth/oauth-coordinator';
import { createMobileApiTransport, createIdempotencyKey } from '../api/mobile-api-transport';
import { createPetApi } from '../features/pets/pet-api';
import { createRankingClient } from '../features/ranking/ranking-client';
import { createAttemptClient } from '../features/learning/attempt-client';

type Runtime = Readonly<{ status: 'LOADING' }> | Readonly<{
  status: 'READY';
  environment: MobileEnvironment;
  session: SessionController;
  oauth: ReturnType<typeof createOAuthCoordinator>;
  pets: ReturnType<typeof createPetApi>;
  ranking: ReturnType<typeof createRankingClient>;
  attempts: ReturnType<typeof createAttemptClient>;
  createMutationKey(): string;
}> | Readonly<{ status: 'CONFIG_ERROR'; code: string }>;

const RuntimeContext = createContext<Runtime | null>(null);

function environmentInput(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_API_ORIGIN: process.env.EXPO_PUBLIC_API_ORIGIN,
    EXPO_PUBLIC_WEEKLY_SEASON_ID: process.env.EXPO_PUBLIC_WEEKLY_SEASON_ID,
  };
}

export function MobileRuntimeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [runtime, setRuntime] = useState<Runtime>({ status: 'LOADING' });
  useEffect(() => {
    let dispose = () => undefined;
    try {
      const environment = parseMobileEnvironment(environmentInput(), { production: !__DEV__ });
      const supabase = createMobileSupabaseRuntime(environment);
      const session = createSessionController(supabase.auth);
      const transport = createMobileApiTransport({ baseUrl: environment.apiOrigin, tokens: session });
      const oauth = createOAuthCoordinator({
        auth: supabase.auth,
        browser: WebBrowser,
        storage: globalThis.localStorage,
        ensureAccount: async () => {
          const token = await session.getAccessToken();
          if (!token) throw new Error('AUTH_SESSION_REQUIRED');
          const response = await fetch(`${environment.apiOrigin}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
          if (!response.ok) throw new Error('ACCOUNT_SETUP_FAILED');
        },
      });
      const ready: Runtime = {
        status: 'READY', environment, session, oauth,
        pets: createPetApi(transport), ranking: createRankingClient(transport),
        attempts: createAttemptClient(transport),
        createMutationKey: () => createIdempotencyKey(Crypto.randomUUID),
      };
      dispose = () => { session.dispose(); supabase.dispose(); };
      setRuntime(ready);
      void session.initialize();
    } catch (error) {
      setRuntime({ status: 'CONFIG_ERROR', code: error instanceof Error ? error.message : 'MOBILE_CONFIG_INVALID' });
    }
    return () => dispose();
  }, []);
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useMobileRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('MOBILE_RUNTIME_PROVIDER_REQUIRED');
  return runtime;
}

const configErrorSession: PublicSessionState = { status: 'error', code: 'AUTH_UNAVAILABLE' };
const loadingSession: PublicSessionState = { status: 'loading' };
export function useMobileSession(runtime: Runtime): PublicSessionState {
  const session = runtime.status === 'READY' ? runtime.session : null;
  return useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => undefined),
    () => session?.getState() ?? (runtime.status === 'LOADING' ? loadingSession : configErrorSession),
    () => session?.getState() ?? (runtime.status === 'LOADING' ? loadingSession : configErrorSession),
  );
}
