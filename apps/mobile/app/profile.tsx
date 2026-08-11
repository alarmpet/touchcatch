import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PublicSessionState } from '../src/auth/session-controller';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';
import { colors, radius, spacing } from '../src/ui/design-tokens';

export function ProfileRouteView(props: Readonly<{
  session: PublicSessionState;
  email: string;
  password: string;
  busy: boolean;
  message?: string;
  onEmail(value: string): void;
  onPassword(value: string): void;
  onSignIn(): void;
  onSignOut(): void;
}>) {
  return <ScrollView contentContainerStyle={{ padding: spacing.lg, backgroundColor: colors.canvas, flexGrow: 1 }}>
    <Text accessibilityRole="header" style={{ marginTop: 18, color: colors.ink, fontSize: 28, fontWeight: '900' }}>내 정보</Text>
    <View style={{ marginTop: spacing.xl, padding: spacing.xl, borderRadius: radius.card, backgroundColor: colors.sky }}>
      <Text style={{ color: colors.white, fontSize: 22, fontWeight: '900' }}>{props.session.status === 'signed-in' ? (props.session.email ?? 'TouchCatch 학습자') : '학습 기록을 이어가세요'}</Text>
      <Text style={{ marginTop: 6, color: '#DFF2FF' }}>{props.session.status === 'signed-in' ? '펫과 주간 랭킹이 이 계정에 안전하게 연결돼요.' : '로그인하면 서버에 저장된 펫과 기록을 다시 불러와요.'}</Text>
    </View>
    {props.session.status === 'signed-in' ? <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" disabled={props.busy} onPress={props.onSignOut} style={{ marginTop: spacing.xl, padding: 14, borderRadius: radius.button, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1 }}><Text style={{ textAlign: 'center', color: colors.ink, fontWeight: '800' }}>이 기기에서 로그아웃</Text></Pressable> : <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
      <TextInput accessibilityLabel="이메일" autoCapitalize="none" keyboardType="email-address" value={props.email} onChangeText={props.onEmail} placeholder="email@example.com" style={{ padding: 14, borderRadius: radius.button, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }} />
      <TextInput accessibilityLabel="비밀번호" secureTextEntry value={props.password} onChangeText={props.onPassword} placeholder="비밀번호" style={{ padding: 14, borderRadius: radius.button, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }} />
      <Pressable accessibilityRole="button" accessibilityLabel="로그인" disabled={props.busy || !props.email.trim() || !props.password} onPress={props.onSignIn} style={{ padding: 14, borderRadius: radius.button, backgroundColor: colors.sky }}><Text style={{ textAlign: 'center', color: colors.white, fontWeight: '900' }}>{props.busy ? '로그인 중…' : '로그인'}</Text></Pressable>
    </View>}
    {props.message && <Text accessibilityRole="alert" style={{ marginTop: spacing.md, color: '#B42318' }}>{props.message}</Text>}
  </ScrollView>;
}

export default function ProfileRoute() {
  const runtime = useMobileRuntime();
  const session = useMobileSession(runtime);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
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
  return <ProfileRouteView session={session} email={email} password={password} busy={busy} message={runtime.status === 'CONFIG_ERROR' ? '모바일 연결 설정이 필요해요.' : message} onEmail={setEmail} onPassword={setPassword} onSignIn={() => void signIn()} onSignOut={() => void signOut()} />;
}
