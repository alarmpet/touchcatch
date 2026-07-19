import { useState } from 'react';
import { Button, SafeAreaView, Text, TextInput, View } from 'react-native';
import { getNativeAuthServices } from '../../src/auth/index.js';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const run = async (operation: () => Promise<{ state: string }>) => {
    try { const result = await operation(); setMessage(result.state); }
    catch { setMessage('AUTH_FAILED'); }
  };
  return <SafeAreaView><View>
    <Text>TouchCatch 로그인</Text>
    <TextInput accessibilityLabel="이메일" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
    <TextInput accessibilityLabel="비밀번호" secureTextEntry value={password} onChangeText={setPassword} />
    <Button title="이메일 로그인" onPress={() => void run(() => getNativeAuthServices().emailAuth.signInEmail(email, password))} />
    <Button title="이메일 가입" onPress={() => void run(() => getNativeAuthServices().emailAuth.signUpEmail(email, password))} />
    <Button title="비밀번호 찾기" onPress={() => void getNativeAuthServices().emailAuth.requestPasswordReset(email).then(() => setMessage('RESET_EMAIL_ACCEPTED')).catch(() => setMessage('RESET_EMAIL_ACCEPTED'))} />
    <Button title="Google로 계속" onPress={() => void run(() => getNativeAuthServices().oauthCoordinator.startOAuth('google'))} />
    <Button title="Kakao로 계속" onPress={() => void run(() => getNativeAuthServices().oauthCoordinator.startOAuth('kakao'))} />
    <Text accessibilityLiveRegion="polite">{message}</Text>
  </View></SafeAreaView>;
}
