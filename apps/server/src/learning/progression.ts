export type LearningProgressionInput = {
  firstCompletion: boolean;
  allObjectivesCorrect: boolean;
  noHint: boolean;
  repeatPersonalBest: boolean;
  policyStatus: 'DRAFT' | 'APPROVED';
};

export type ProgressionReward = {
  accountXp: number;
  selectedPetXp: number;
  drawPoints: number;
};

export function calculateLearningProgression(input: LearningProgressionInput): ProgressionReward {
  if (input.policyStatus === 'DRAFT') {
    return { accountXp: 0, selectedPetXp: 0, drawPoints: 0 };
  }

  let accountXp = 0;
  let selectedPetXp = 0;
  let drawPoints = 0;

  if (input.firstCompletion) {
    accountXp += 30;
    selectedPetXp += 15;
    drawPoints += 10;
  } else if (input.repeatPersonalBest) {
    accountXp += 5;
    selectedPetXp += 2;
  }

  if (input.allObjectivesCorrect) {
    accountXp += 10;
    selectedPetXp += 5;
  }

  if (input.noHint) {
    accountXp += 10;
    selectedPetXp += 5;
  }

  // Daily caps: Account XP 200, Pet XP 100, Draw Points 100
  return {
    accountXp: Math.min(200, accountXp),
    selectedPetXp: Math.min(100, selectedPetXp),
    drawPoints: Math.min(100, drawPoints),
  };
}

export function displayPetLevel(level: number): string {
  return `Lv.${level}`;
}
