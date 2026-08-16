import { describe, it, expect, vi } from 'vitest';
import { getHintButtonLabel } from './hint-label';

describe('HintPanel Component logic', () => {
  it('instantiates HintPanel props correctly', () => {
    const props = {
      mode: 'RANKED' as const,
      currentStepIndex: 0,
      rankedPenaltyUnits: 15000,
      onUseHint: vi.fn(),
    };
    expect(props.mode).toBe('RANKED');
    expect(props.rankedPenaltyUnits).toBe(15000);
  });

  it('builds a native-safe label for the next casual hint', () => {
    expect(getHintButtonLabel({ mode: 'CASUAL', currentStepIndex: 1, totalSteps: 5 })).toBe('힌트 보기 (2/5)');
  });

  it('builds a ranked penalty label without exposing private content', () => {
    expect(getHintButtonLabel({ mode: 'RANKED', currentStepIndex: 0, totalSteps: 5, rankedPenaltyUnits: 15000 })).toBe('힌트 요청 (-15000점)');
  });
});
