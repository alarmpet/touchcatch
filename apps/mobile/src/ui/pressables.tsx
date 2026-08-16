/**
 * Pressable-based controls. Imported only by screens whose tests mock
 * `Pressable` alongside `Text` and `View`.
 */
import { Pressable, Text, View } from 'react-native';
import { spacing } from './design-tokens';
import { buttonStyle, buttonTextStyle, tabs, type ButtonTone } from './ui-kit';

export function Button({ label, onPress, tone = 'primary', disabled = false, block = false, accessibilityLabel }: Readonly<{
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  block?: boolean;
  accessibilityLabel?: string;
}>) {
  const resolved: ButtonTone = disabled ? 'disabled' : tone;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={buttonStyle(resolved, { block })}
  >
    <Text style={buttonTextStyle(resolved)}>{label}</Text>
  </Pressable>;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: Readonly<{
  options: readonly { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (next: T) => void;
}>) {
  return <View style={tabs.bar}>
    {options.map((option) => {
      const selected = option.value === value;
      return <Pressable
        key={option.value}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={option.accessibilityLabel ?? option.label}
        onPress={() => onChange(option.value)}
        style={tabs.item(selected)}
      >
        <Text style={tabs.label(selected)}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function ListRow({ title, meta, onPress, accessibilityLabel }: Readonly<{
  title: string;
  meta?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}>) {
  const body = <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm }}>
    <Text style={{ flex: 1 }}>{title}</Text>
    {meta ? <Text>{meta}</Text> : null}
  </View>;
  if (!onPress) return <View {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}>{body}</View>;
  return <Pressable accessibilityRole="button" {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })} onPress={onPress}>{body}</Pressable>;
}
