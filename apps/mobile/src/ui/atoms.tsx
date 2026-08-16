/**
 * View/Text-only building blocks for the Minimal Light system.
 *
 * Only `View` and `Text` are imported so that screens whose tests mock React
 * Native down to those two host components can use these freely.
 */
import { Text, View } from 'react-native';
import { colors, glow, onDark, radius, spacing, vividGradients, type VividGradientKey } from './design-tokens';
import { Sheen, VerticalGradient } from './Gradient';
import { badgeStyle, badgeTextStyle, header, progress, section, surface, text, textOnDark, vividSurface, type BadgeTone } from './ui-kit';

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

/**
 * The gradient banner version of `ScreenHeader`.
 *
 * A screen that opens on black-on-white type has no moment of arrival; the banner gives each
 * one a face and lets the tab you are on be recognisable from its colour alone. `ScreenHeader`
 * stays for the places that want the quiet treatment.
 */
export function VividScreenHeader({ eyebrow, title, lede, tone, trailing }: Readonly<{
  eyebrow?: string;
  title: string;
  lede?: string;
  tone: VividGradientKey;
  trailing?: React.ReactNode;
}>) {
  const ramp = vividGradients[tone];
  return <View style={{ ...vividSurface.heroShell, marginBottom: spacing.lg, ...glow(ramp.via, 'strong') }}>
    <VerticalGradient from={ramp.from} via={ramp.via} to={ramp.to} style={{ padding: spacing.xl, gap: spacing.sm }}>
      <Sheen size={260} top={-120} left={-70} opacity={0.18} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 8 }}>
          {eyebrow ? <View style={vividSurface.glassChip}>
            <Text style={{ ...textOnDark.overline, color: onDark.primary }}>{eyebrow}</Text>
          </View> : null}
          <Text accessibilityRole="header" style={{ ...textOnDark.display, fontSize: 29, lineHeight: 35 }}>{title}</Text>
        </View>
        {trailing}
      </View>
      {lede ? <Text style={textOnDark.body}>{lede}</Text> : null}
    </VerticalGradient>
  </View>;
}

/** A white card lifted by a coloured glow, for content sitting under a vivid header. */
export function GlowPanel({ tone, children, style }: Readonly<{
  tone: VividGradientKey;
  children: React.ReactNode;
  style?: Record<string, unknown>;
}>) {
  return <View style={{
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...glow(vividGradients[tone].via, 'soft'),
    ...style,
  }}>{children}</View>;
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
