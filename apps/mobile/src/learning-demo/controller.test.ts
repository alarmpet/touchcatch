import { describe, expect, it } from 'vitest';
import { createDemoState, reduceDemoState, type DemoContent } from './controller.js';

const content: DemoContent = {
  key: 'demo',
  differences: [{ id: 'a', imageA: { cx: .2, cy: .3, r: .1 }, imageB: { cx: .2, cy: .3, r: .1 } }, { id: 'b', imageA: { cx: .8, cy: .7, r: .1 }, imageB: { cx: .8, cy: .7, r: .1 } }],
  correctOptionId: 'right',
};

describe('learning demo controller', () => {
  it('claims each difference once and opens the quiz after the final claim', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, content, { type: 'TAP', side: 'B', x: .2, y: .3 });
    expect(state.claimedIds).toEqual(['a']);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'B', x: .8, y: .7 });
    expect(state.phase).toBe('QUIZ');
  });

  it('ignores misses and completes only for the correct meaning', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .5, y: .5 });
    expect(state.claimedIds).toEqual([]);
    state = { ...state, phase: 'QUIZ' };
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'wrong' });
    expect(state.phase).toBe('QUIZ');
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    expect(state.phase).toBe('COMPLETE');
  });
});
