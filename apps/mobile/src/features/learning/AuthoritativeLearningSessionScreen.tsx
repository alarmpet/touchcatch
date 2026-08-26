import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing } from '../../ui/design-tokens';
import { buttonStyle, buttonTextStyle, screen, surface, text } from '../../ui/ui-kit';
import { VividScreenHeader } from '../../ui/atoms';
import { useMobileRuntime, useMobileSession } from '../../runtime/mobile-runtime';
import { createRankedSessionController, type RankedSessionState } from './ranked-session-controller';
import { sessionUnavailableCopy } from './session-unavailable';
import type { AttemptCommandEventV1, WeeklyChallengeV1 } from '../../../../../packages/contracts/src/learning-attempt';

const CATEGORIES = ['ENGLISH', 'PROVERB'] as const;

export type AuthoritativeSessionViewState = RankedSessionState & Readonly<{
  sessionStatus: 'loading' | 'signed-out' | 'signed-in' | 'error';
  challenges: readonly WeeklyChallengeV1[];
  loadingChallenges: boolean;
}>;

export function AuthoritativeLearningSessionView({
  state,
  onOpen,
  onRetry,
  onTap,
  onBoardReady,
  onSubmit,
  onReset,
}: Readonly<{
  state: AuthoritativeSessionViewState;
  onOpen(challenge: WeeklyChallengeV1): void;
  onRetry(): void;
  onTap(side: 'A' | 'B', x: number, y: number): void;
  onBoardReady(side: 'A' | 'B'): void;
  onSubmit(): void;
  onReset(): void;
}>) {
  if (state.sessionStatus === 'loading') {
    return <Shell accessibilityLabel="학습 세션 상태 LOADING"><Text style={text.caption}>학습을 준비하고 있어요.</Text></Shell>;
  }
  if (state.sessionStatus === 'signed-out' || state.phase === 'UNAVAILABLE' && state.reason === 'SIGNED_OUT') {
    const copy = sessionUnavailableCopy('SIGNED_OUT');
    return <Shell accessibilityLabel="학습 세션 상태 SIGNED_OUT">
      <Message title={copy.title} detail={copy.detail} />
      <Link href={'/profile' as never} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="로그인하러 가기" style={buttonStyle('primary', { block: true })}>
          <Text style={buttonTextStyle('primary')}>로그인하러 가기</Text>
        </Pressable>
      </Link>
    </Shell>;
  }

  if (state.phase === 'UNAVAILABLE' || state.sessionStatus === 'error') {
    const copy = sessionUnavailableCopy(state.reason ?? 'UNKNOWN_ERROR');
    return <Shell accessibilityLabel={`학습 세션 상태 UNAVAILABLE ${state.reason ?? ''}`}>
      <Message title={copy.title} detail={copy.detail} />
      {copy.retry ? <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={onRetry} style={buttonStyle('primary', { block: true })}>
        <Text style={buttonTextStyle('primary')}>다시 시도</Text>
      </Pressable> : null}
      {copy.support ? <Text style={text.caption}>문제가 계속되면 지원 채널로 코드 {state.reason ?? 'UNKNOWN_ERROR'}를 알려 주세요.</Text> : null}
    </Shell>;
  }

  if (state.phase === 'IDLE' || state.phase === 'OPENING') {
    return <Shell accessibilityLabel={`학습 세션 상태 ${state.phase}`}>
      {state.loadingChallenges || state.phase === 'OPENING'
        ? <Text style={text.caption}>{state.phase === 'OPENING' ? '보드를 열고 있어요.' : '이번 주 학습을 불러오고 있어요.'}</Text>
        : state.challenges.length === 0
          ? <Message title="오늘 열린 보드가 없어요" detail="서버가 공개한 학습이 없으면 시작할 수 없어요." />
          : state.challenges.map((challenge) => (
            <Pressable
              key={challenge.contentRevisionId}
              accessibilityRole="button"
              accessibilityLabel={`${challenge.category} 학습 시작`}
              onPress={() => onOpen(challenge)}
              style={{ ...surface.card, marginBottom: spacing.sm }}
            >
              <Text style={text.overline}>{challenge.category}</Text>
              <Text style={text.subtitle}>{challenge.differenceCount}개의 다른 곳</Text>
            </Pressable>
          ))}
      <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={onRetry} style={buttonStyle('secondary', { block: true })}>
        <Text style={buttonTextStyle('secondary')}>다시 불러오기</Text>
      </Pressable>
    </Shell>;
  }

  if (state.phase === 'SETTLED' && state.result) {
    return <Shell accessibilityLabel="학습 세션 상태 SETTLED">
      <Message
        title="서버가 이 판을 기록했어요"
        detail={state.result.status === 'COMPLETED_VERIFIED'
          ? `검증 완료 · ${state.result.completionMs}ms`
          : state.result.status}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="다시 하기" onPress={onReset} style={buttonStyle('primary', { block: true })}>
        <Text style={buttonTextStyle('primary')}>다시 하기</Text>
      </Pressable>
    </Shell>;
  }

  const challenge = state.challenge;
  const found = state.finds.length;
  const total = challenge?.differenceCount ?? 0;
  return <Shell accessibilityLabel={`학습 세션 상태 ${state.phase}`}>
    <Text style={text.caption}>{found} / {total} 찾음{state.wrongTaps > 0 ? ` · 빗나감 ${state.wrongTaps}` : ''}</Text>
    {challenge ? <>
      <Board side="A" uri={challenge.imageA.url} finds={state.finds} onTap={onTap} onReady={() => onBoardReady('A')} ready={state.phase !== 'LOADING_ASSETS'} />
      <Board side="B" uri={challenge.imageB.url} finds={state.finds} onTap={onTap} onReady={() => onBoardReady('B')} ready={state.phase !== 'LOADING_ASSETS'} />
    </> : null}
    {state.reason ? <Text accessibilityLiveRegion="polite" style={text.danger}>{state.reason}</Text> : null}
    {state.phase === 'PLAYING' ? <Pressable accessibilityRole="button" accessibilityLabel="판 제출" onPress={onSubmit} style={buttonStyle('primary', { block: true })}>
      <Text style={buttonTextStyle('primary')}>서버에 제출</Text>
    </Pressable> : null}
    {state.phase === 'SUBMITTING' ? <Text style={text.caption}>서버가 판을 기록하는 중이에요.</Text> : null}
  </Shell>;
}

function Shell({ children, accessibilityLabel }: Readonly<{ children: ReactNode; accessibilityLabel: string }>) {
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScrollView accessibilityLabel={accessibilityLabel} style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ ...screen.scroll, ...screen.content, gap: spacing.md }}>
      <VividScreenHeader tone="hero" eyebrow="LEARN" title="다른 곳 찾기" lede="보이는 그림만 받고, 맞았는지는 서버가 말해요." />
      <Link href={'/' as never} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="홈으로"><Text style={text.caption}>홈으로</Text></Pressable>
      </Link>
      {children}
    </ScrollView>
  </View>;
}

function Message({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return <View style={{ ...surface.card, gap: 6 }}>
    <Text style={text.subtitle}>{title}</Text>
    <Text style={text.caption}>{detail}</Text>
  </View>;
}

function Board({
  side,
  uri,
  finds,
  onTap,
  onReady,
  ready,
}: Readonly<{
  side: 'A' | 'B';
  uri: string;
  finds: RankedSessionState['finds'];
  onTap(side: 'A' | 'B', x: number, y: number): void;
  onReady(): void;
  ready: boolean;
}>) {
  const size = useRef({ width: 1, height: 1 });
  const circleKey = side === 'A' ? 'imageA' : 'imageB';
  return <Pressable
    accessibilityRole="imagebutton"
    accessibilityLabel={side === 'A' ? '그림 A' : '그림 B'}
    disabled={!ready}
    onLayout={(event) => { size.current = event.nativeEvent.layout; }}
    onPress={(event) => {
      const { locationX, locationY } = event.nativeEvent;
      const x = clamp01(locationX / size.current.width);
      const y = clamp01(locationY / size.current.height);
      onTap(side, x, y);
    }}
    style={{ ...surface.card, padding: 0, overflow: 'hidden', aspectRatio: 1 }}
  >
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri }}
      onLoad={onReady}
      style={{ width: '100%', height: '100%' }}
    />
    {finds.map((find) => {
      const circle = find.displayCircles[circleKey];
      return <View
        key={`${find.objectiveId}-${side}`}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: `${(circle.cx - circle.r) * 100}%`,
          top: `${(circle.cy - circle.r) * 100}%`,
          width: `${circle.r * 200}%`,
          height: `${circle.r * 200}%`,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: colors.accent,
        }}
      />;
    })}
  </Pressable>;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function AuthoritativeLearningSessionScreen() {
  const runtime = useMobileRuntime();
  const session = useMobileSession(runtime);
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const wanted = (CATEGORIES as readonly string[]).includes(String(category)) ? category as typeof CATEGORIES[number] : undefined;
  const controller = useMemo(() => runtime.status === 'READY' ? createRankedSessionController({
    session: () => runtime.session.getState().status,
    seasonId: runtime.environment.weeklySeasonId,
    client: runtime.attempts,
    createMutationKey: runtime.createMutationKey,
  }) : null, [runtime]);
  const [challenges, setChallenges] = useState<readonly WeeklyChallengeV1[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const events = useRef<AttemptCommandEventV1[]>([]);
  const clockOrigin = useRef(0);
  const boardsReady = useRef({ A: false, B: false });
  const ranked = useSyncExternalStore(
    (listener) => controller?.subscribe(listener) ?? (() => undefined),
    () => controller?.getState() ?? idleUnavailable(runtime.status === 'CONFIG_ERROR' ? runtime.code : 'MOBILE_RUNTIME_UNAVAILABLE'),
  );

  const load = async () => {
    if (!controller || session.status !== 'signed-in') {
      setChallenges([]);
      return;
    }
    setLoadingChallenges(true);
    const listed = await controller.listChallenges();
    const filtered = wanted ? listed.filter((entry) => entry.category === wanted) : listed;
    setChallenges(filtered);
    setLoadingChallenges(false);
  };

  useEffect(() => {
    if (session.status !== 'loading') void load();
  }, [controller, session.status, wanted]);
  useEffect(() => () => controller?.dispose(), [controller]);

  const onBoardReady = (side: 'A' | 'B') => {
    boardsReady.current[side] = true;
    if (boardsReady.current.A && boardsReady.current.B) {
      clockOrigin.current = Date.now();
      events.current = [];
      void controller?.markAssetsReady();
    }
  };

  const viewState: AuthoritativeSessionViewState = {
    ...ranked,
    sessionStatus: session.status,
    challenges,
    loadingChallenges,
  };

  return <AuthoritativeLearningSessionView
    state={viewState}
    onOpen={(challenge) => {
      boardsReady.current = { A: false, B: false };
      events.current = [];
      void controller?.open(challenge);
    }}
    onRetry={() => { controller?.reset(); void load(); }}
    onTap={(side, x, y) => {
      const elapsed = Math.max(0, Date.now() - clockOrigin.current);
      events.current = [...events.current, { type: 'TAP', timestampMs: elapsed }];
      void controller?.tap(side, x, y);
    }}
    onBoardReady={onBoardReady}
    onSubmit={() => { void controller?.submit({ events: events.current, hintsUsed: 0, wrongTaps: ranked.wrongTaps, wrongAnswers: 0 }); }}
    onReset={() => { controller?.reset(); void load(); router.replace('/game/spot-difference'); }}
  />;
}

function idleUnavailable(reason: string): RankedSessionState {
  return {
    phase: 'UNAVAILABLE',
    challenge: null,
    attemptId: null,
    expiresAt: null,
    finds: [],
    openedUnits: {},
    wrongTaps: 0,
    result: null,
    reason,
  };
}

export default AuthoritativeLearningSessionScreen;
