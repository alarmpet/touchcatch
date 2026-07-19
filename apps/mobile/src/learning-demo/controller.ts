export type Circle = Readonly<{ cx: number; cy: number; r: number }>;
export type DemoContent = Readonly<{ key: string; differences: ReadonlyArray<Readonly<{ id: string; imageA: Circle; imageB: Circle }>>; correctOptionId: string }>;
export type DemoState = Readonly<{ contentKey: string; claimedIds: string[]; phase: 'FIND' | 'QUIZ' | 'COMPLETE'; wrongAnswers: number }>;
export type DemoAction = Readonly<{ type: 'TAP'; side: 'A' | 'B'; x: number; y: number }> | Readonly<{ type: 'ANSWER'; optionId: string }>;

export function createDemoState(content: DemoContent): DemoState {
  return { contentKey: content.key, claimedIds: [], phase: 'FIND', wrongAnswers: 0 };
}

export function reduceDemoState(state: DemoState, content: DemoContent, action: DemoAction): DemoState {
  if (state.contentKey !== content.key) return createDemoState(content);
  if (action.type === 'ANSWER') {
    if (state.phase !== 'QUIZ') return state;
    return action.optionId === content.correctOptionId ? { ...state, phase: 'COMPLETE' } : { ...state, wrongAnswers: state.wrongAnswers + 1 };
  }
  if (state.phase !== 'FIND' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
  const match = content.differences.find((difference) => {
    if (state.claimedIds.includes(difference.id)) return false;
    const circle = action.side === 'A' ? difference.imageA : difference.imageB;
    return Math.hypot(action.x - circle.cx, action.y - circle.cy) <= circle.r;
  });
  if (!match) return state;
  const claimedIds = [...state.claimedIds, match.id];
  return { ...state, claimedIds, phase: claimedIds.length === content.differences.length ? 'QUIZ' : 'FIND' };
}
