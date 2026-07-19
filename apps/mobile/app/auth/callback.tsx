import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Text } from 'react-native';
import { consumeOAuthLinks, getNativeAuthServices } from '../../src/auth/index.js';

export default function OAuthCallbackScreen() {
  const [message, setMessage] = useState('로그인을 완료하는 중입니다.');
  useEffect(() => {
    try { return consumeOAuthLinks(Linking, (url) => getNativeAuthServices().completeAuthCallback(url), { onResult: (result) => setMessage('status' in result ? result.status : result.state), onError: () => setMessage('AUTH_CALLBACK_FAILED') }); }
    catch { setMessage('AUTH_CONFIGURATION_FAILED'); return undefined; }
  }, []);
  return <Text>{message}</Text>;
}
