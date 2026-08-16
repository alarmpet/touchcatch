import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PublicSessionState } from '../src/auth/session-controller';
import type { OAuthProvider } from '../src/auth/oauth-coordinator';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';
import { colors, spacing } from '../src/ui/design-tokens';
import { buttonStyle, buttonTextStyle, field, screen, surface, tabs, text } from '../src/ui/ui-kit';
import { ScreenHeader } from '../src/ui/atoms';
import { TabBar } from '../src/ui/TabBar';
import { MusicSettingsCard } from '../src/features/feedback/MusicSettingsCard';

export type AuthMode = 'SIGN_IN' | 'SIGN_UP';

/** Passwords Supabase will reject anyway; saying so first avoids a pointless round trip. */
const MIN_PASSWORD = 6;

export function ProfileRouteView(props: Readonly<{
  session: PublicSessionState;
  email: string;
  password: string;
  busy: boolean;
  message?: string;
  mode: AuthMode;
  onMode(value: AuthMode): void;
  onEmail(value: string): void;
  onPassword(value: string): void;
  onSignIn(): void;
  onSignUp(): void;
  onSignOut(): void;
  onOAuth(provider: OAuthProvider): void;
}>) {
  const signedIn = props.session.status === 'signed-in';
  const registering = props.mode === 'SIGN_UP';
  const tooShort = registering && props.password.length > 0 && props.password.length < MIN_PASSWORD;
  const loginDisabled = props.busy || !props.email.trim() || !props.password
    || (registering && props.password.length < MIN_PASSWORD);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ ...screen.scroll, ...screen.content }}>
    <ScreenHeader eyebrow="ACCOUNT" title="내 정보" />
    <View style={{ ...surface.cardLifted, gap: 6 }}>
      <Text style={text.overline}>{signedIn ? 'SIGNED IN' : 'GUEST'}</Text>
      <Text numberOfLines={1} style={text.title}>{signedIn ? (props.session.email ?? 'TouchCatch 학습자') : '학습 기록을 이어가세요'}</Text>
      <Text style={text.caption}>{signedIn ? '펫과 주간 랭킹이 이 계정에 안전하게 연결돼요.' : '로그인하면 서버에 저장된 펫과 기록을 다시 불러와요.'}</Text>
    </View>
    {signedIn ? <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" disabled={props.busy} onPress={props.onSignOut} style={{ ...buttonStyle(props.busy ? 'disabled' : 'secondary', { block: true }), marginTop: spacing.lg }}><Text style={buttonTextStyle(props.busy ? 'disabled' : 'secondary')}>이 기기에서 로그아웃</Text></Pressable> : props.session.status === 'signed-out' ? <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
      {/* One form, two modes. A separate sign-up screen would strand anyone who guessed wrong
          about whether they already have an account. */}
      <View style={tabs.bar}>
        {([['SIGN_IN', '로그인'], ['SIGN_UP', '가입하기']] as const).map(([value, label]) => {
          const selected = props.mode === value;
          return <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => props.onMode(value)}
            style={tabs.item(selected)}
          >
            <Text style={tabs.label(selected)}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <TextInput accessibilityLabel="이메일" autoCapitalize="none" keyboardType="email-address" value={props.email} onChangeText={props.onEmail} placeholder="email@example.com" placeholderTextColor={colors.faint} style={field.input} />
      <TextInput accessibilityLabel="비밀번호" secureTextEntry value={props.password} onChangeText={props.onPassword} placeholder={registering ? `비밀번호 (${MIN_PASSWORD}자 이상)` : '비밀번호'} placeholderTextColor={colors.faint} style={field.input} />
      {tooShort ? <Text accessibilityLiveRegion="polite" style={{ ...text.caption, color: colors.danger }}>{`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={registering ? '가입하기' : '로그인'}
        disabled={loginDisabled}
        onPress={registering ? props.onSignUp : props.onSignIn}
        style={{ ...buttonStyle(loginDisabled ? 'disabled' : 'primary', { block: true }), marginTop: 4 }}
      >
        <Text style={buttonTextStyle(loginDisabled ? 'disabled' : 'primary')}>
          {props.busy ? (registering ? '가입 중…' : '로그인 중…') : (registering ? '가입하고 시작하기' : '로그인')}
        </Text>
      </Pressable>
      <View accessibilityLabel="소셜 로그인" style={{ marginTop: spacing.lg, gap: spacing.xs }}>
        <Text style={text.overline}>OR CONTINUE WITH</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Google로 계속" disabled={props.busy} onPress={() => props.onOAuth('google')} style={buttonStyle('secondary', { block: true })}><Text style={buttonTextStyle('secondary')}>Google로 계속</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Kakao로 계속" disabled={props.busy} onPress={() => props.onOAuth('kakao')} style={{ ...buttonStyle('secondary', { block: true }), backgroundColor: '#FEE500', borderColor: '#FEE500' }}><Text style={{ ...buttonTextStyle('secondary'), color: '#191919' }}>Kakao로 계속</Text></Pressable>
      </View>
    </View> : <Text accessibilityLiveRegion="polite" style={{ ...text.caption, marginTop: spacing.lg }}>{props.session.status === 'loading' ? '로그인 상태를 확인하는 중이에요.' : '로그인 상태를 불러오지 못했어요.'}</Text>}
    {props.message && <Text accessibilityRole="alert" style={{ ...text.danger, marginTop: spacing.md }}>{props.message}</Text>}
    {/* Settings live here rather than behind a fifth tab: one card does not earn its own destination. */}
    <MusicSettingsCard />
    </ScrollView>
    <TabBar active="profile" />
  </View>;
}

export default function ProfileRoute() {
  const runtime = useMobileRuntime();
  const session = useMobileSession(runtime);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [mode, setMode] = useState<AuthMode>('SIGN_IN');
  const signUp = async () => {
    if (runtime.status !== 'READY') return;
    setBusy(true); setMessage(undefined);
    try {
      const result = await runtime.session.signUp(email, password);
      setPassword('');
      // A project with confirmations on leaves the player signed out, and a screen that just
      // goes quiet reads as a failed attempt. Say what happened.
      if (result === 'CONFIRM_EMAIL') setMessage('가입 확인 메일을 보냈어요. 메일의 링크를 열면 로그인할 수 있어요.');
    } catch { setMessage('가입하지 못했어요. 이미 가입된 이메일인지 확인해 주세요.'); }
    finally { setBusy(false); }
  };
  const signIn = async () => {
    if (runtime.status !== 'READY') return;
    setBusy(true); setMessage(undefined);
    try { await runtime.session.signIn(email, password); setPassword(''); }
    catch { setMessage('로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    if (runtime.status !== 'READY') return;
    setBusy(true); setMessage(undefined);
    try { await runtime.session.signOut(); }
    catch { setMessage('이 기기에서 로그아웃하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const oauth = async (provider: OAuthProvider) => {
    if (runtime.status !== 'READY') return;
    setBusy(true); setMessage(undefined);
    try {
      const result = await runtime.oauth.startOAuth(provider);
      if (result.state === 'ACCOUNT_SETUP_FAILED') setMessage('로그인은 완료됐지만 계정을 준비하지 못했어요. 다시 시도해 주세요.');
    } catch { setMessage('소셜 로그인을 완료하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const visibleMessage = runtime.status === 'CONFIG_ERROR' ? '모바일 연결 설정이 필요해요.' : message;
  return <ProfileRouteView
    session={session}
    email={email}
    password={password}
    busy={busy}
    mode={mode}
    {...(visibleMessage === undefined ? {} : { message: visibleMessage })}
    onMode={(next) => { setMode(next); setMessage(undefined); }}
    onEmail={setEmail}
    onPassword={setPassword}
    onSignIn={() => void signIn()}
    onSignUp={() => void signUp()}
    onSignOut={() => void signOut()}
    onOAuth={(provider) => void oauth(provider)}
  />;
}
