import { Slot } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MobileRuntimeProvider } from '../src/runtime/mobile-runtime';
import { MusicProvider } from '../src/features/feedback/music-context';
import { colors } from '../src/ui/design-tokens';

/**
 * Every route renders inside the safe area. Without this the status bar sits on top of
 * each screen's first line of text on Android — something only a real device or emulator
 * reveals, since the test renderer has no window insets.
 */
export default function Layout() {
  return <SafeAreaProvider>
    <MobileRuntimeProvider>
      <MusicProvider>
        {/* `bottom` joined the list when the tab bar was pinned to the window: without it the
            bar sits under the Android gesture/navigation bar and its labels are unreadable. */}
        <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}>
          <Slot />
        </SafeAreaView>
      </MusicProvider>
    </MobileRuntimeProvider>
  </SafeAreaProvider>;
}
