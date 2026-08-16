type Circle = Readonly<{ id: string; cx: number; cy: number; r: number }>;

export type ChallengeGeometry = Readonly<{
  differences: readonly Circle[];
  wordHunts: readonly Circle[];
  suddenDeath: Circle;
}>;

export function validateChallengeGeometry(geometry: ChallengeGeometry): true {
  const challenges = [...geometry.wordHunts, geometry.suddenDeath];
  for (const circle of [...geometry.differences, ...challenges]) {
    if (
      !Number.isFinite(circle.cx) || !Number.isFinite(circle.cy) || !Number.isFinite(circle.r) ||
      circle.r <= 0 || circle.cx < 0 || circle.cy < 0 || circle.cx > 1 || circle.cy > 1
    ) {
      throw new Error(`CIRCLE_OUT_OF_BOUNDS:${circle.id}`);
    }
  }

  for (const challenge of challenges) {
    for (const difference of geometry.differences) {
      const distance = Math.hypot(challenge.cx - difference.cx, challenge.cy - difference.cy);
      if (distance < challenge.r + difference.r) {
        throw new Error(`CHALLENGE_OVERLAPS_DIFFERENCE:${challenge.id}:${difference.id}`);
      }
    }
  }
  return true;
}
