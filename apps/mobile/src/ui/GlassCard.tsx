import React from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { colors, glass, glow, radius, spacing } from './design-tokens';
import { Sheen } from './Gradient';

export type GlassCardProps = Readonly<{
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glowColor?: string;
  glowStrength?: 'soft' | 'strong';
  variant?: 'base' | 'thick' | 'thin' | 'hero';
  accessibilityLabel?: string;
  accessibilityRole?: 'summary' | 'button' | 'none';
}>;

const defaultShadow = {
  shadowColor: '#0B2347',
  shadowOpacity: 0.07,
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 14,
  elevation: 3,
} as const;

export function GlassCard({
  children,
  style,
  glowColor,
  glowStrength = 'soft',
  variant = 'base',
  accessibilityLabel,
  accessibilityRole,
}: GlassCardProps) {
  const bg = variant === 'hero'
    ? colors.surface
    : variant === 'thick'
      ? 'rgba(255, 255, 255, 0.94)'
      : variant === 'thin'
        ? 'rgba(255, 255, 255, 0.72)'
        : 'rgba(255, 255, 255, 0.86)';

  const border = variant === 'hero'
    ? 'rgba(255, 255, 255, 0.45)'
    : glass.edge;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[
        {
          position: 'relative' as const,
          borderRadius: radius.xl,
          borderWidth: 1,
          overflow: 'hidden' as const,
          padding: spacing.md,
          backgroundColor: bg,
          borderColor: border,
        },
        glowColor ? glow(glowColor, glowStrength) : defaultShadow,
        style,
      ]}
    >
      <Sheen size={90} top={-40} left={-20} opacity={0.35} />
      <View style={{ position: 'relative' as const, zIndex: 2 }}>{children}</View>
    </View>
  );
}
