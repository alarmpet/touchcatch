export type HintButtonLabelInput = {
  mode: 'CASUAL' | 'RANKED';
  currentStepIndex: number;
  totalSteps?: number;
  rankedPenaltyUnits?: number;
};

export function getHintButtonLabel({ mode, currentStepIndex, totalSteps = 5, rankedPenaltyUnits = 15000 }: HintButtonLabelInput): string {
  return mode === 'RANKED'
    ? `힌트 요청 (-${rankedPenaltyUnits}점)`
    : `힌트 보기 (${currentStepIndex + 1}/${totalSteps})`;
}
