import { Pressable, Text, View } from 'react-native';
import { colors, spacing } from '../../ui/design-tokens';
import { section, surface, tabs, text } from '../../ui/ui-kit';
import { useMusicSettings } from './music-context';

/**
 * Three steps rather than a slider.
 *
 * A slider would mean a new native dependency, and it asks the player to hunt for a value on
 * a continuum they cannot hear while dragging. Named steps are reachable with one tap and
 * every one of them is a level someone actually wants.
 */
const VOLUME_STEPS = [
  { label: '작게', value: 0.15 },
  { label: '보통', value: 0.35 },
  { label: '크게', value: 0.6 },
] as const;

/** The step a stored volume belongs to, so a hand-edited value still lights something up. */
function nearestStep(volume: number): number {
  return VOLUME_STEPS.reduce<number>((best, step) =>
    Math.abs(step.value - volume) < Math.abs(best - volume) ? step.value : best,
    VOLUME_STEPS[0].value);
}

export function MusicSettingsCard() {
  const { settings, setSettings } = useMusicSettings();
  const selected = nearestStep(settings.volume);

  return <View style={section.wrap}>
    <Text style={section.heading}>설정</Text>
    <View style={{ ...surface.card, gap: spacing.md }}>
      <View style={surface.row}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={text.bodyStrong}>배경음악</Text>
          <Text style={text.caption}>효과음은 이 설정과 별개예요.</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="배경음악"
          accessibilityState={{ checked: settings.enabled }}
          onPress={() => setSettings({ ...settings, enabled: !settings.enabled })}
          style={{
            minWidth: 68,
            minHeight: 36,
            paddingHorizontal: spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            borderWidth: 1,
            backgroundColor: settings.enabled ? colors.accentSoft : colors.surfaceMuted,
            borderColor: settings.enabled ? colors.accent : colors.line,
          }}
        >
          <Text style={{ ...text.caption, fontWeight: '700', color: settings.enabled ? colors.accent : colors.muted }}>
            {settings.enabled ? '켜짐' : '꺼짐'}
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.xs, opacity: settings.enabled ? 1 : 0.4 }}>
        <Text style={section.hint}>음량</Text>
        <View style={tabs.bar}>
          {VOLUME_STEPS.map((step) => {
            const active = settings.enabled && selected === step.value;
            return <Pressable
              key={step.label}
              accessibilityRole="button"
              accessibilityLabel={`음량 ${step.label}`}
              accessibilityState={{ selected: active, disabled: !settings.enabled }}
              disabled={!settings.enabled}
              onPress={() => setSettings({ ...settings, volume: step.value })}
              style={tabs.item(active)}
            >
              <Text style={tabs.label(active)}>{step.label}</Text>
            </Pressable>;
          })}
        </View>
      </View>
    </View>
  </View>;
}
