import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useMobileRuntime } from '../../src/runtime/mobile-runtime';
import { colors, spacing } from '../../src/ui/design-tokens';

const ready = '로그인이 완료됐어요.';
const setupFailed = '로그인은 완료됐지만 계정을 준비하지 못했어요. 다시 시도해 주세요.';
const failed = '로그인을 완료하지 못했어요. 다시 시도해 주세요.';

export default function OAuthCallbackRoute() {
  const runtime = useMobileRuntime();
  const [message, setMessage] = useState('로그인을 완료하는 중이에요.');
  useEffect(() => {
    if (runtime.status !== 'READY') { setMessage(failed); return undefined; }
    let active = true;
    const complete = async (url: string | null) => {
      if (!active || !url) { if (active) setMessage(failed); return; }
      try {
        const result = await runtime.oauth.completeOAuth(url);
        if (active) setMessage(result.state === 'READY' ? ready : setupFailed);
      } catch { if (active) setMessage(failed); }
    };
    void Linking.getInitialURL().then(complete).catch(() => { if (active) setMessage(failed); });
    const subscription = Linking.addEventListener('url', ({ url }) => { void complete(url); });
    return () => { active = false; subscription.remove(); };
  }, [runtime]);

  return <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.canvas }}>
    <Text accessibilityLabel="OAuth 로그인 상태" accessibilityLiveRegion="polite" style={{ color: colors.ink, textAlign: 'center', fontSize: 18, fontWeight: '800' }}>{message}</Text>
  </View>;
}
