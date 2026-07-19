import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthRuntime } from '../src/auth/index.js';
export default function Layout(){return <AuthRuntime><SafeAreaProvider><Stack screenOptions={{headerShown:false}}/></SafeAreaProvider></AuthRuntime>}
