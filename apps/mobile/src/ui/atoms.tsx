/**
 * View/Text-only building blocks for the Minimal Light system.
 *
 * Only `View` and `Text` are imported so that screens whose tests mock React
 * Native down to those two host components can use these freely.
 */
import { Text, View } from 'react-native';
import { colors, spacing } from './design-tokens';
import { badgeStyle, badgeTextStyle, header, progress, section, surface, text, type BadgeTone } from './ui-kit';

export function ScreenHeader({ eyebrow, title, lede, trailing }: Readonly<{
  eyebrow?: string;
  title: string;
  lede?: string;
  trailing?: React.ReactNode;
}>) {
  return <View style={header.wrap}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md }}>
      <View style={{ flex: 1, gap: 6 }}>
        {eyebrow ? <Text style={header.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={header.title}>{title}</Text>
      </View>
      {trailing}
    </View>
    {lede ? <Text style={header.lede}>{lede}</Text> : null}
  </View>;
}

export function SectionHeading({ title, hint }: Readonly<{ title: string; hint?: string }>) {
  return <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
    <Text style={section.heading}>{title}</Text>
    {hint ? <Text style={section.hint}>{hint}</Text> : null}
  </View>;
}

export function Badge({ label, tone = 'neutral', accessibilityLabel }: Readonly<{
  label: string;
  tone?: BadgeTone;
  accessibilityLabel?: string;
}>) {
  return <View {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })} style={badgeStyle(tone)}>
    <Text style={badgeTextStyle(tone)}>{label}</Text>
  </View>;
}

export function Divider() {
  return <View style={surface.divider} />;
}

export function ProgressBar({ ratio, accessibilityLabel }: Readonly<{ ratio: number; accessibilityLabel?: string }>) {
  return <View {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })} style={progress.track}>
    <View style={progress.fill(ratio)} />
  </View>;
}

export function StatusNote({ tone = 'muted', children }: Readonly<{
  tone?: 'muted' | 'danger';
  children: React.ReactNode;
}>) {
  return <Text accessibilityLiveRegion="polite" style={tone === 'danger' ? text.danger : text.caption}>{children}</Text>;
}

export function EmptyState({ title, detail }: Readonly<{ title: string; detail?: string }>) {
  return <View style={{ ...surface.card, alignItems: 'center', gap: 6, paddingVertical: spacing.xxl }}>
    <Text style={{ ...text.bodyStrong, textAlign: 'center' }}>{title}</Text>
    {detail ? <Text style={{ ...text.caption, textAlign: 'center', color: colors.faint }}>{detail}</Text> : null}
  </View>;
}
