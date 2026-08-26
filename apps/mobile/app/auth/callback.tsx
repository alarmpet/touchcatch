import { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useGlobalSearchParams, useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileRuntime } from '../../src/runtime/mobile-runtime';
import { colors, spacing } from '../../src/ui/design-tokens';
import { surface, text } from '../../src/ui/ui-kit';

const ready = '로그인이 완료됐어요.';
const setupFailed = '로그인은 완료됐지만 계정을 준비하지 못했어요. 다시 시도해 주세요.';
const failed = '로그인을 완료하지 못했어요. 다시 시도해 주세요.';

/** Must match the coordinator's constant; it rejects anything that is not exactly this shape. */
const callbackUrl = 'touchcatch://auth/callback';

/**
 * Rebuilds the callback URL from the router's own parsed parameters.
 *
 * `Linking.getInitialURL()` only reports the URL that *launched* the process, and this app is
 * always already running when the callback lands — it is what opened the browser. The `url`
 * event fires while this route is still mounting, so neither Linking source sees it.
 *
 * The exact-shape rule is enforced here rather than skipped: anything other than a lone
 * `code` yields null and the sign-in is refused, which is what the coordinator would have
 * done with the raw string.
 */
function urlFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const keys = Object.keys(params);
  const code = params['code'];
  if (keys.length !== 1 || keys[0] !== 'code' || typeof code !== 'string' || code === '') return null;
  return `${callbackUrl}?code=${encodeURIComponent(code)}`;
}

/** Where a completed sign-in lands. The flow starts here, and the screen shows the new session. */
const signedInRoute = '/profile';

export default function OAuthCallbackRoute() {
  const runtime = useMobileRuntime();
  const router = useRouter();
  // `useLocalSearchParams` is empty until this screen has focus, which a deep link beats.
  // The global params are not focus-gated, so they serve as the fallback.
  const localParams = useLocalSearchParams();
  const globalParams = useGlobalSearchParams();
  const paramUrl = useMemo(
    () => urlFromParams(localParams) ?? urlFromParams(globalParams),
    [localParams, globalParams],
  );
  const [message, setMessage] = useState('로그인을 완료하는 중이에요.');

  useEffect(() => {
    // The provider resolves asynchronously; failing on the first LOADING render would abandon
    // a perfectly good callback before the runtime ever had a chance to exist.
    if (runtime.status === 'LOADING') return undefined;
    if (runtime.status !== 'READY') { setMessage(failed); return undefined; }
    let active = true;
    const complete = async (url: string | null) => {
      if (!active || !url) { if (active) setMessage(failed); return; }
      try {
        const result = await runtime.oauth.completeOAuth(url);
        if (!active) return;
        setMessage(result.state === 'READY' ? ready : setupFailed);
        // This screen renders without the tab bar, so on success there is no way out of it
        // except the hardware back button. `replace` drops it from the history, otherwise
        // Back from the profile would land on a callback that has no code left to spend.
        if (result.state === 'READY') router.replace(signedInRoute);
      } catch { if (active) setMessage(failed); }
    };
    // Cold start wins when it has a URL; the router params cover the warm-start race.
    void Linking.getInitialURL()
      .then((initial) => complete(initial ?? paramUrl))
      .catch(() => complete(paramUrl));
    const subscription = Linking.addEventListener('url', ({ url }) => { void complete(url); });
    return () => { active = false; subscription.remove(); };
  }, [runtime, paramUrl, router]);

  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: colors.canvas }}>
    <View style={{ ...surface.cardLifted, maxWidth: 360, width: '100%', gap: 6 }}>
      <Text style={text.overline}>TOUCHCATCH</Text>
      <Text accessibilityLabel="OAuth 로그인 상태" accessibilityLiveRegion="polite" style={text.title}>{message}</Text>
    </View>
  </View>;
}
