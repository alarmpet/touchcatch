import { evaluatePreviewAnswer, type AnswerResult, type AnswerSubmission } from './answer-mode';

export type AnswerState = Readonly<{
  submitted: boolean;
  hintsUsed: number;
  lastResult: AnswerResult | null;
}>;

export type AnswerAction =
  | { type: 'SUBMIT'; submission: AnswerSubmission }
  | { type: 'REVEAL_HINT' }
  | { type: 'RESET' };

export const initialAnswerState: AnswerState = { submitted: false, hintsUsed: 0, lastResult: null };

export function reduceAnswerState(state: AnswerState, action: AnswerAction): AnswerState {
  if (action.type === 'RESET') return initialAnswerState;
  if (action.type === 'REVEAL_HINT') return { ...state, hintsUsed: state.hintsUsed + 1 };
  return { ...state, submitted: true, lastResult: evaluatePreviewAnswer(action.submission) };
}
