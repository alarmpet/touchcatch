import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MobileRuntimeProvider } from '../src/runtime/mobile-runtime';
export default function Layout(){return <SafeAreaProvider><MobileRuntimeProvider><Slot /></MobileRuntimeProvider></SafeAreaProvider>}
