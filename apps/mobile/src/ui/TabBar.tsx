import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colors, glow, onDark, radius, layout, spacing, vividGradients, type VividGradientKey } from './design-tokens';
import { VerticalGradient } from './Gradient';
import { tabBar } from './ui-kit';

/**
 * The app's four destinations, on every one of them.
 *
 * This used to live inside `HomeScreen`, which meant three of the four tabs were dead ends:
 * you could reach 펫 or 랭킹 from home but not from each other, and the only way back was the
 * system back button. A four-tab information architecture has to actually behave like one.
 */

export type TabKey = 'home' | 'pets' | 'ranking' | 'profile';

/**
 * Each tab carries the gradient its screen leads with, so the bar tells you where you are by
 * colour before you read the label — and arriving on the screen confirms it.
 */
const TABS = [
  { key: 'home', route: '/', glyph: '🏠', label: '홈', tone: 'hero' },
  { key: 'pets', route: '/pets', glyph: '🐾', label: '펫', tone: 'collection' },
  { key: 'ranking', route: '/ranking', glyph: '🏆', label: '랭킹', tone: 'podium' },
  { key: 'profile', route: '/profile', glyph: '👤', label: '내 정보', tone: 'profile' },
] as const satisfies readonly { key: TabKey; route: string; glyph: string; label: string; tone: VividGradientKey }[];

/**
 * Pinned to the bottom of the window, not scrolled with the content.
 *
 * Designed with a floating 3D glassmorphic pill bar and glowing active tab indicator.
 */
export function TabBar({
  active,
  rewardSurfaces = typeof __DEV__ !== 'undefined' && __DEV__,
}: Readonly<{ active: TabKey; rewardSurfaces?: boolean }>) {
  const tabs = TABS.filter((tab) => rewardSurfaces || tab.key === 'home' || tab.key === 'profile');
  return <View style={{
    paddingHorizontal: layout.screenX,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.canvas,
  }}>
    <View accessibilityRole="tablist" style={{
      ...tabBar.wrap,
      marginTop: 0,
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
      borderRadius: radius.pill,
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      borderWidth: 1,
      borderColor: 'rgba(212, 229, 242, 0.7)',
      shadowColor: '#0B2347',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 16,
      elevation: 4,
    }}>
    {tabs.map((tab) => {
      const selected = tab.key === active;
      const ramp = vividGradients[tab.tone];
      const body = <>
        <Text style={tabBar.glyph(selected)}>{tab.glyph}</Text>
        <Text style={tabBar.label(selected)}>{tab.label}</Text>
      </>;
      // The current tab is not a link: re-navigating to the screen you are already on reads
      // as a dead tap, and on a stack router it can push a duplicate entry.
      if (selected) {
        return <View key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: true }} style={tabBar.item}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 2, left: -2, right: -2, bottom: 2 }}>
            <VerticalGradient
              from={ramp.from}
              via={ramp.via}
              to={ramp.to}
              style={{ flex: 1, borderRadius: radius.pill, ...glow(ramp.via, 'soft') }}
            />
          </View>
          <Text style={{ ...tabBar.glyph(true), color: onDark.primary }}>{tab.glyph}</Text>
          <Text style={{ ...tabBar.label(true), color: onDark.primary, fontWeight: '800' }}>{tab.label}</Text>
        </View>;
      }
      return <Link key={tab.key} href={tab.route as never} asChild>
        <Pressable accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: false }} style={tabBar.item}>
          {body}
        </Pressable>
      </Link>;
    })}
    </View>
  </View>;
}

