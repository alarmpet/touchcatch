import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { AppState, Text } from 'react-native';
import { getNativeAuthServices } from './native-auth.js';
import { syncGuestProgress } from '../guest-content/native.js';

export function AuthRuntime({ children }: Readonly<{ children: ReactNode }>) {
  const [configurationError, setConfigurationError] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const router = useRouter();
  useEffect(() => {
    try {
      const { sessionLifecycle } = getNativeAuthServices();
      void sessionLifecycle.restore().then(({ resumeResult }) => {
        const gate = resumeResult as { state?: string } | null | undefined;
        if (gate?.state === 'RECOVERY_REQUIRED') router.replace('/auth/recovery');
        if (gate?.state === 'ACCOUNT_SETUP_FAILED') setSetupError(true);
      }).catch(() => setSetupError(true));
      const unsubscribeAuth = sessionLifecycle.subscribe(() => { void syncGuestProgress().catch(() => undefined); });
      void syncGuestProgress().catch(() => undefined);
      const appState = AppState.addEventListener('change', (state) => sessionLifecycle.onAppState(state));
      sessionLifecycle.onAppState(AppState.currentState);
      return () => { unsubscribeAuth(); appState.remove(); };
    } catch { setConfigurationError(true); return undefined; }
  }, []);
  if (configurationError) return <Text>인증 설정을 확인해 주세요.</Text>;
  if (setupError) return <Text>계정 설정을 완료하지 못했습니다. 다시 시도해 주세요.</Text>;
  return children;
}
