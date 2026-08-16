import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colors, layout, spacing } from './design-tokens';
import { tabBar } from './ui-kit';

/**
 * The app's four destinations, on every one of them.
 *
 * This used to live inside `HomeScreen`, which meant three of the four tabs were dead ends:
 * you could reach 펫 or 랭킹 from home but not from each other, and the only way back was the
 * system back button. A four-tab information architecture has to actually behave like one.
 */

export type TabKey = 'home' | 'pets' | 'ranking' | 'profile';

const TABS = [
  { key: 'home', route: '/', glyph: '⌂', label: '홈' },
  { key: 'pets', route: '/pets', glyph: '❍', label: '펫' },
  { key: 'ranking', route: '/ranking', glyph: '△', label: '랭킹' },
  { key: 'profile', route: '/profile', glyph: '○', label: '내 정보' },
] as const satisfies readonly { key: TabKey; route: string; glyph: string; label: string }[];

/**
 * Pinned to the bottom of the window, not scrolled with the content.
 *
 * It first shipped as the last child of each screen's `ScrollView`, which worked only while
 * the pages were short: as soon as the home screen grew the bar fell below the fold, and a
 * tab bar you have to scroll to find is not a tab bar. Callers place this as a sibling of
 * their scroll view.
 */
export function TabBar({ active }: Readonly<{ active: TabKey }>) {
  return <View style={{
    paddingHorizontal: layout.screenX,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.canvas,
  }}>
    <View accessibilityRole="tablist" style={{ ...tabBar.wrap, marginTop: 0, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' }}>
    {TABS.map((tab) => {
      const selected = tab.key === active;
      const body = <>
        <Text style={tabBar.glyph(selected)}>{tab.glyph}</Text>
        <Text style={tabBar.label(selected)}>{tab.label}</Text>
      </>;
      // The current tab is not a link: re-navigating to the screen you are already on reads
      // as a dead tap, and on a stack router it can push a duplicate entry.
      if (selected) {
        return <View key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: true }} style={tabBar.item}>
          {body}
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
