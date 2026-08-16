import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { spacing } from '../../ui/design-tokens';
import { buttonStyle, buttonTextStyle, surface, text } from '../../ui/ui-kit';
import { getHintButtonLabel } from './hint-label';
export { getHintButtonLabel } from './hint-label';

export type HintPanelProps = {
  mode: 'CASUAL' | 'RANKED';
  currentStepIndex: number;
  totalSteps?: number;
  hintText?: string;
  rankedPenaltyUnits?: number;
  onUseHint: () => void;
  disabled?: boolean;
};

export const HintPanel: React.FC<HintPanelProps> = ({
  mode,
  currentStepIndex,
  totalSteps = 5,
  hintText,
  rankedPenaltyUnits = 15000,
  onUseHint,
  disabled = false,
}) => {
  const isRanked = mode === 'RANKED';
  const accessibilityLabel = isRanked
    ? `힌트 사용 시 ${rankedPenaltyUnits}점 감소`
    : `힌트 보기 (${currentStepIndex + 1}/${totalSteps})`;
  const buttonLabel = getHintButtonLabel({ mode, currentStepIndex, totalSteps, rankedPenaltyUnits });
  const isExhausted = currentStepIndex >= totalSteps - 1;
  const blocked = disabled || isExhausted;
  const tone = blocked ? 'disabled' : 'secondary';

  return (
    <View accessibilityLabel="힌트 영역" accessibilityRole="summary" style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
      {hintText ? (
        <View style={surface.quiet}>
          <Text accessibilityLiveRegion="polite" style={text.body}>{hintText}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={onUseHint}
        style={buttonStyle(tone, { block: true })}
      >
        <Text style={buttonTextStyle(tone)}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
};
