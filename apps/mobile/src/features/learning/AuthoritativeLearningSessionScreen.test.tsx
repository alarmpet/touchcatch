import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { AuthoritativeLearningSessionView, type AuthoritativeSessionViewState } from './AuthoritativeLearningSessionScreen';
import type { RankedSessionState } from './ranked-session-controller';

vi.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
  Image: 'Image',
}));
vi.mock('expo-router', () => ({ Link: 'Link', useLocalSearchParams: () => ({}), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const image = { url: 'https://cdn.test/a.png', sha256: '1'.repeat(64), encodedBytes: 10, width: 8, height: 8, mimeType: 'image/png' as const };
const challenge = {
  category: 'ENGLISH' as const,
  ordinal: 1,
  contentRevisionId: '40000000-0000-4000-8000-000000000001',
  contentHash: 'a'.repeat(64),
  imageA: image,
  imageB: { ...image, url: 'https://cdn.test/b.png', sha256: '2'.repeat(64) },
  differenceCount: 2,
  assistPattern: 'SPELLING' as const,
  answerUnitCount: 3,
  spaceIndexes: [],
};

const idle: RankedSessionState = {
  phase: 'IDLE', challenge: null, attemptId: null, expiresAt: null,
  finds: [], openedUnits: {}, wrongTaps: 0, result: null, reason: null,
};

function view(state: AuthoritativeSessionViewState) {
  const handlers = {
    onOpen: vi.fn(),
    onRetry: vi.fn(),
    onTap: vi.fn(),
    onBoardReady: vi.fn(),
    onSubmit: vi.fn(),
    onReset: vi.fn(),
  };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<AuthoritativeLearningSessionView state={state} {...handlers} />); });
  return { tree, ...handlers };
}

describe('AuthoritativeLearningSessionView', () => {
  it('sends signed-out players to login instead of a 준비 중 screen', () => {
    const { tree } = view({
      ...idle, sessionStatus: 'signed-out', challenges: [], loadingChallenges: false,
    });
    expect(tree.root.findByProps({ accessibilityLabel: '학습 세션 상태 SIGNED_OUT' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '로그인하러 가기' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '학습 콘텐츠 준비 중' })).toHaveLength(0);
  });

  it('names a policy-disabled failure with retry and support', () => {
    const { tree, onRetry } = view({
      ...idle, phase: 'UNAVAILABLE', reason: 'RANKING_POLICY_NOT_APPROVED',
      sessionStatus: 'signed-in', challenges: [], loadingChallenges: false,
    });
    expect(tree.root.findByProps({ accessibilityLabel: '학습 세션 상태 UNAVAILABLE RANKING_POLICY_NOT_APPROVED' })).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('RANKING_POLICY_NOT_APPROVED');
    tree.root.findByProps({ accessibilityLabel: '다시 시도' }).props.onPress();
    expect(onRetry).toHaveBeenCalled();
  });

  it('opens a listed challenge after start succeeds', () => {
    const { tree, onOpen } = view({
      ...idle, sessionStatus: 'signed-in', challenges: [challenge], loadingChallenges: false,
    });
    tree.root.findByProps({ accessibilityLabel: 'ENGLISH 학습 시작' }).props.onPress();
    expect(onOpen).toHaveBeenCalledWith(challenge);
  });

  it('keeps play going after a tap retry surface', () => {
    const { tree, onTap } = view({
      ...idle,
      phase: 'PLAYING',
      challenge,
      attemptId: '50000000-0000-4000-8000-000000000001',
      sessionStatus: 'signed-in',
      challenges: [challenge],
      loadingChallenges: false,
      reason: 'NETWORK_TIMEOUT',
    });
    expect(tree.root.findByProps({ accessibilityLabel: '학습 세션 상태 PLAYING' })).toBeTruthy();
    expect(tree.root.findByProps({ children: 'NETWORK_TIMEOUT' })).toBeTruthy();
    tree.root.findByProps({ accessibilityLabel: '그림 A' }).props.onPress({ nativeEvent: { locationX: 10, locationY: 10 } });
    expect(onTap).toHaveBeenCalled();
  });

  it('renders a retryable network failure from UNAVAILABLE', () => {
    const { tree } = view({
      ...idle, phase: 'UNAVAILABLE', reason: 'NETWORK_TIMEOUT',
      sessionStatus: 'signed-in', challenges: [], loadingChallenges: false,
    });
    expect(tree.root.findByProps({ accessibilityLabel: '다시 시도' })).toBeTruthy();
  });

  it('shows the server completion, never a local answer verdict', () => {
    const { tree } = view({
      ...idle,
      phase: 'SETTLED',
      sessionStatus: 'signed-in',
      challenges: [challenge],
      loadingChallenges: false,
      result: {
        attemptId: '50000000-0000-4000-8000-000000000001',
        status: 'COMPLETED_VERIFIED',
        completionMs: 12_000,
        acceptedAt: '2026-08-24T00:00:32.000+00:00',
        bestChanged: true,
      },
    });
    expect(tree.root.findByProps({ accessibilityLabel: '학습 세션 상태 SETTLED' })).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('검증 완료');
    expect(JSON.stringify(tree.toJSON())).not.toContain('판정 완료');
  });
});
