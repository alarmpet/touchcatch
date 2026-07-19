import { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { Button, Text, TextInput, View } from 'react-native';
import { captureRecoveryLinks, getNativeAuthServices } from '../../src/auth/index.js';

export default function RecoveryScreen() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const recoveryUrl = useRef<string | null>(null);
  useEffect(() => {
    const capture = captureRecoveryLinks(Linking, (url) => { recoveryUrl.current = url; });
    return capture.dispose;
  }, []);
  const completePasswordRecovery = async () => {
    const url = recoveryUrl.current;
    try { const result = await getNativeAuthServices().emailAuth.completePasswordRecovery(url, password); setMessage(result.state); }
    catch { setMessage('RECOVERY_FAILED'); }
  };
  return <View><Text>새 비밀번호</Text><TextInput secureTextEntry value={password} onChangeText={setPassword} /><Button title="비밀번호 변경" onPress={() => void completePasswordRecovery()} /><Text>{message}</Text></View>;
}
