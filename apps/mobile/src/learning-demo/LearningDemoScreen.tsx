import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Keyboard, Pressable, ScrollView, Share, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HintStepV1 } from '../../../../packages/contracts/src/content';
import { createDemoState, pendingWordHunt, reduceDemoState, scoreDemoState, type Circle, type DemoScoreBreakdown, type DemoState, type DemoWordHunt } from './controller';
import ruleset from '../../../../config/ruleset.v1.json' with { type: 'json' };
import { EMPTY_COMBO, FEEDBACK_MS, FLIGHT_MS, SLOT_POP_MS, advanceCombo, comboExpired, comboLabel, missNudge, nextPulse, pulseStyle, streakColor, type ComboState, type FeedbackPulse, type LetterFlight } from './feedback-model';
import { answerUnits, buildAnswerPattern, evaluatePreviewAnswer, newlyOpenedUnitIndex, revealAnswerPattern } from '../features/answer-modes/answer-mode';
import { buildShareCard, buildShareGrid } from './share-card';
import { COACH_MS, COACH_TEXT, nextCoachStep, type CoachStep } from './coach-model';
import { createFeedbackPlayer } from '../features/feedback/feedback-player';
import { useMusicMood } from '../features/feedback/music-context';
import { dailyPuzzleIndex, dailyPuzzleNumber } from './daily-puzzle';
import { ghostFindCountBy, ghostRevealedIds, ghostStanding, sealGhostRun, type GhostFind } from './ghost-model';
import { readGhostRun, saveGhostRunIfBetter } from './ghost-store';
import { readSeenCoachSteps, writeSeenCoachSteps } from './coach-store';
import { categoryPalette, colors, gradients, radius, shadow, spacing } from '../ui/design-tokens';
import { VerticalGradient } from '../ui/Gradient';
import { badgeStyle, badgeTextStyle, buttonStyle, buttonTextStyle, field, surface as surfaceStyle, text as textStyle } from '../ui/ui-kit';

/** Side gutter around the boards. Kept tiny so the artwork stays as large as possible. */
const BOARD_GUTTER = 6;

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export type LearningDemoEntry = Readonly<{
  key: string;
  category: 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';
  preferredInputSurface: 'MULTIPLE_CHOICE' | 'FREE_TEXT';
  assistPattern: 'SPELLING' | 'INITIAL_PATTERN' | 'NONE';
  title: string;
  imageA: ImageSourcePropType;
  imageB: ImageSourcePropType;
  differences: ReadonlyArray<Readonly<{ id: string; imageA: Circle; imageB: Circle }>>;
  prompt: string;
  options: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  correctOptionId: string;
  hintUnits?: readonly string[];
  hintLadder?: readonly HintStepV1[];
  hintAdmissionHash?: string;
  /** Prompt-and-tap word hunts, mirroring the match engine's `wordHunts`. */
  wordHunts?: readonly DemoWordHunt[];
  /**
   * Source width divided by height. Boards render at this ratio so `contain` never
   * letterboxes: with letterboxing the normalized tap coordinates stop lining up with
   * the artwork. Defaults to square, which is what every 1:1 pack needs.
   */
  aspectRatio?: number;
}>;

export function LearningDemoScreen({ entries, onExit, initialCategory, daily = false, nowMs }: Readonly<{
  entries: readonly LearningDemoEntry[];
  onExit?: () => void;
  /** Category chosen on the home screen; falls back to the first entry when absent. */
  initialCategory?: LearningDemoEntry['category'];
  /** Play today's shared board instead of a category pack. */
  daily?: boolean;
  /** Injectable clock so the daily choice is testable without freezing time globally. */
  nowMs?: number;
}>) {
  if (!entries.length) throw new Error('LEARNING_DEMO_REQUIRES_CONTENT');
  // Resolved once per mount: the board must not swap under the player at Seoul midnight.
  const [dailyNumber] = useState(() => daily ? dailyPuzzleNumber(nowMs ?? Date.now()) : null);
  const [selectedKey, setSelectedKey] = useState(
    dailyNumber !== null
      ? entries[dailyPuzzleIndex(dailyNumber, entries.length)]!.key
      : (initialCategory ? entries.find((entry) => entry.category === initialCategory) : undefined)?.key ?? entries[0]!.key,
  );
  const selected = useMemo(() => entries.find((entry) => entry.key === selectedKey) ?? entries[0]!, [entries, selectedKey]);
  const [state, setState] = useState<DemoState>(() => createDemoState(selected));
  /**
   * The freshest reduced state, updated synchronously inside the tap handler.
   *
   * Reducing from the render closure's `state` loses finds as soon as anyone taps quickly:
   * two taps landing in one React batch both reduce from the same stale value, and the
   * second `setState` overwrites the first one's claim. The bug was invisible while nothing
   * rewarded speed, and the combo made it the first thing you hit.
   *
   * A ref rather than a functional updater on purpose: the updater has to stay pure, and the
   * pulse and the letter flight are decided by comparing before against after out here.
   */
  const latestState = useRef(state);
  const [layouts, setLayouts] = useState({ A: { width: 1, height: 1 }, B: { width: 1, height: 1 } });
  const [hintIndex, setHintIndex] = useState(0);
  /** Frozen at the moment of the correct answer, so the clock ticking on cannot change it. */
  const [settledScore, setSettledScore] = useState<DemoScoreBreakdown | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [pulse, setPulse] = useState<FeedbackPulse | null>(null);
  // Wall clock rather than the round's 1s tick: a 4s combo window needs finer resolution
  // than the countdown does. The tick still drives the re-render that retires a lapsed chip.
  const [combo, setCombo] = useState<ComboState>(EMPTY_COMBO);
  const [boardArea, setBoardArea] = useState({ width: 0, height: 0 });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [seenCoachSteps, setSeenCoachSteps] = useState<readonly CoachStep[]>(() => readSeenCoachSteps());
  /** The run being recorded now, and the personal best it is racing. */
  const recordedFinds = useRef<GhostFind[]>([]);
  const [ghost, setGhost] = useState(() => readGhostRun(selectedKey));
  const [flight, setFlight] = useState<LetterFlight | null>(null);
  const [poppedSlot, setPoppedSlot] = useState<number | null>(null);
  const rootRef = useRef<{ measureInWindow?: (cb: (x: number, y: number) => void) => void } | null>(null);
  const rootOrigin = useRef({ x: 0, y: 0 });
  const slotRefs = useRef<Record<number, { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null>>({});
  const boardRefs = useRef<Record<'A' | 'B', { measureInWindow?: (cb: (x: number, y: number) => void) => void } | null>>({ A: null, B: null });
  const flightProgress = useRef(new Animated.Value(0)).current;
  /**
   * Hands and ears. One player for the screen so each note keeps a single audio handle and a
   * fast tapper is not allocating one per touch.
   */
  const feedback = useMemo(() => createFeedbackPlayer(), []);
  useEffect(() => () => feedback.dispose(), [feedback]);

  /**
   * The manifest asks for `adjustResize`, but Android edge-to-edge (the SDK 57 default)
   * stops the window from resizing, so the answer bar and its submit button end up behind
   * the keyboard with no way to reach them. Reserving the measured keyboard height puts
   * them back on screen; the board area is `flex: 1` and gives up the space.
   */
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  /**
   * Every clock on this screen comes off one elapsed counter and the admitted ruleset, so
   * practice runs on the numbers a real match runs on. Three moments come out of it:
   * the final rush at `finalRushStartsAtMs`, the deadline at `playingMs`, and the end of
   * sudden death `suddenDeathMs` after that.
   *
   * The tick stops once the board closes, which keeps a finished countdown from re-rendering
   * the screen once a second forever.
   */
  const boardOpen = state.phase === 'FIND' || state.phase === 'SUDDEN_DEATH';
  const remainingMs = Math.max(0, ruleset.time.playingMs - elapsedMs);
  const finalRush = state.phase === 'FIND' && remainingMs > 0 && elapsedMs >= ruleset.time.finalRushStartsAtMs;
  const suddenDeathRemainingMs = Math.max(0, ruleset.time.playingMs + ruleset.time.suddenDeathMs - elapsedMs);
  useEffect(() => {
    if (!boardOpen) return undefined;
    const tick = setInterval(() => setElapsedMs((current) => current + 1000), 1000);
    return () => clearInterval(tick);
  }, [boardOpen, state.contentKey]);
  /**
   * The two moments the clock decides, kept out of the tick itself: a state updater must
   * stay pure, and both of these are reductions.
   */
  useEffect(() => {
    if (state.phase === 'FIND' && remainingMs <= 0) act({ type: 'DEADLINE' });
  }, [remainingMs, state.phase]);
  useEffect(() => {
    if (state.phase === 'SUDDEN_DEATH' && suddenDeathRemainingMs <= 0) act({ type: 'END_SUDDEN_DEATH' });
  }, [suddenDeathRemainingMs, state.phase]);
  useEffect(() => {
    if (state.phase === 'FIND' && !state.finalUnlocked && elapsedMs >= ruleset.finalChallenge.unlock.atMs) {
      act({ type: 'UNLOCK_FINAL' });
    }
  }, [elapsedMs, state.phase, state.finalUnlocked]);
  /** The only two stretches of this screen that are a race are the only two that sound like one. */
  useMusicMood(finalRush || state.phase === 'SUDDEN_DEATH' ? 'RUSH' : 'RELAX');

  useEffect(() => {
    if (pulse === null) return undefined;
    const timer = setTimeout(() => setPulse(null), FEEDBACK_MS[pulse.kind]);
    return () => clearTimeout(timer);
  }, [pulse?.id]);

  const coachStep = nextCoachStep({
    phase: state.phase,
    claimedCount: state.claimedIds.length,
    finalUnlocked: state.finalUnlocked,
    missionActive: state.activeMission !== null,
    seen: seenCoachSteps,
  });
  // Each note retires itself. Marking it seen on a timer rather than on a tap keeps the
  // coaching out of the way of the game — nothing here is ever something to dismiss.
  useEffect(() => {
    if (coachStep === null) return undefined;
    const timer = setTimeout(() => {
      setSeenCoachSteps((current) => {
        if (current.includes(coachStep)) return current;
        const next = [...current, coachStep];
        writeSeenCoachSteps(next);
        return next;
      });
    }, COACH_MS);
    return () => clearTimeout(timer);
  }, [coachStep]);

  const choose = (entry: LearningDemoEntry) => {
    setSelectedKey(entry.key);
    setState(createDemoState(entry));
    latestState.current = createDemoState(entry);
    setHintIndex(0);
    setSettledScore(null);
    setElapsedMs(0);
    setAnswerInput('');
    recordedFinds.current = [];
    setGhost(readGhostRun(entry.key));
  };
  const act = (action: Parameters<typeof reduceDemoState>[2]) => setState((current) => {
    const next = reduceDemoState(current, selected, action);
    latestState.current = next;
    return next;
  });

  // Word hunts run on the same clock the match engine uses, so practice teaches real timing.
  const pending = pendingWordHunt(selected, state);
  const activeMission = state.activeMission === null
    ? null
    : selected.wordHunts?.find((mission) => mission.missionId === state.activeMission!.missionId) ?? null;
  useEffect(() => {
    if (pending === null) return undefined;
    const missionId = pending.missionId;
    act({ type: 'START_WORD_HUNT', missionId });
    return () => undefined;
  }, [pending?.missionId]);
  useEffect(() => {
    if (state.activeMission === null) return undefined;
    const { missionId, stage } = state.activeMission;
    if (stage === 'READING') {
      const open = setTimeout(() => act({ type: 'OPEN_WORD_HUNT', missionId }), ruleset.time.wordHuntRevealMs);
      return () => clearTimeout(open);
    }
    const close = setTimeout(
      () => act({ type: 'END_WORD_HUNT', missionId }),
      Math.max(0, ruleset.time.wordHuntMs - ruleset.time.wordHuntRevealMs),
    );
    return () => clearTimeout(close);
  }, [state.activeMission?.missionId, state.activeMission?.stage]);

  /**
   * Both boards must be visible at once — comparing them is the entire game, so a layout
   * that requires scrolling between them is broken. Each board is sized to fit half the
   * available height while keeping the source aspect ratio, so taps still map to artwork.
   */
  const boardAspect = selected.aspectRatio ?? 1;
  const boardGap = 6;
  const boardWidth = boardArea.width > 0 && boardArea.height > 0
    ? Math.min(boardArea.width, ((boardArea.height - boardGap) / 2) * boardAspect)
    : 0;
  const boardSize = boardWidth > 0
    ? { width: boardWidth, height: boardWidth / boardAspect }
    : { width: '100%' as const, aspectRatio: boardAspect };

  const clock = { remainingMs, totalMs: ruleset.time.playingMs };
  const score = scoreDemoState(state, selected, ruleset.score, clock);
  const liveScore = score.total;
  const answerPattern = selected.assistPattern === 'NONE'
    ? null
    : revealAnswerPattern(selected.category, selected.title, state.claimedIds.length);

  const submitAnswer = () => {
    const result = evaluatePreviewAnswer({
      category: selected.category,
      surface: state.hintsUsed > 0 ? 'PATTERN_ASSISTED' : 'FREE_TEXT',
      rawAnswer: answerInput,
      expectedAnswer: selected.title,
    });
    const optionId = result.correct ? selected.correctOptionId : '__free_text_wrong__';
    if (result.correct) {
      // Score the state the reducer will actually produce rather than re-deriving the
      // formula here, which is how the displayed total drifts from the real one.
      const settled = scoreDemoState(
        reduceDemoState(state, selected, { type: 'ANSWER', optionId }),
        selected,
        ruleset.score,
        clock,
      );
      setSettledScore(settled);
      // Only a finished run becomes a ghost, and only if it beat the stored one.
      setGhost(saveGhostRunIfBetter(sealGhostRun({
        contentKey: selected.key,
        finds: recordedFinds.current,
        solved: true,
        score: settled.total,
      })));
    }
    if (result.correct) feedback.play({ kind: 'SOLVED' });
    act({ type: 'ANSWER', optionId });
    setAnswerInput('');
  };

  const categoryLabel = selected.category === 'ENGLISH' ? '영어 단어' : selected.category === 'PROVERB' ? '속담' : selected.category === 'IDIOM' ? '사자성어' : '상식';
  /** Same tint the home screen's mode card used, so the board reads as that card opened. */
  const headerPalette = categoryPalette[selected.category] ?? categoryPalette.ENGLISH;
  const fallbackHintText = selected.hintUnits?.length && selected.assistPattern !== 'NONE'
    ? `${selected.assistPattern === 'SPELLING' ? '스펠링' : '초성'} 힌트: ${buildAnswerPattern(selected.category, selected.title)}`
    : undefined;
  const totalHintSteps = selected.hintLadder?.length ?? (fallbackHintText ? 1 : 0);
  const currentHintText = hintIndex > 0
    ? selected.hintLadder?.[hintIndex - 1]?.localizedText.ko ?? fallbackHintText
    : undefined;
  const hintsExhausted = hintIndex >= totalHintSteps;
  // A running word hunt owns the board, so the answer bar stands down until it ends. It also
  // stands down once the board closes: from there the quiz screen carries the real input, and
  // two answer fields on one screen is a way to type into the wrong one.
  const showEarlyAnswer = boardOpen && state.finalUnlocked && activeMission === null;
  const finalBreakdown = settledScore ?? score;
  const ghostFinds = ghostFindCountBy(ghost, elapsedMs);
  const ghostIds = ghostRevealedIds(ghost, elapsedMs);
  const standing = ghostStanding(state.claimedIds.length, ghostFinds);
  const shareInput = {
    category: selected.category,
    stageNumber: entries.findIndex((candidate) => candidate.key === selected.key) + 1,
    ...(dailyNumber !== null ? { dailyNumber } : {}),
    foundCount: state.claimedIds.length,
    totalDifferences: selected.differences.length,
    wordHuntCount: state.solvedMissionIds.length,
    hintsUsed: state.hintsUsed,
    score: finalBreakdown.total,
    solved: state.phase === 'COMPLETE',
  } as const;
  const patternUnits = selected.assistPattern === 'NONE'
    ? null
    : answerUnits(selected.category, selected.title, state.claimedIds.length, selected.differences.length);

  /**
   * Sends the earned letter from the spot the player tapped into the slot it just opened.
   *
   * Positions come from `measureInWindow` rather than accumulated `onLayout` offsets: the
   * strip, the scroll container and the board sit at different depths, and summing those
   * offsets by hand is exactly the kind of arithmetic that silently drifts. Every step is
   * optional-chained, so a host without measurement simply skips the flourish — the find
   * itself has already been committed by the reducer above.
   */
  const launchLetterFlight = (side: 'A' | 'B', tapX: number, tapY: number, before: number, after: number) => {
    if (selected.assistPattern === 'NONE') return;
    const slotIndex = newlyOpenedUnitIndex(selected.category, selected.title, before, after, selected.differences.length);
    if (slotIndex === null) return;
    const char = answerUnits(selected.category, selected.title, after, selected.differences.length)[slotIndex]?.text;
    if (char === undefined || char === ' ') return;

    const board = boardRefs.current[side];
    const slot = slotRefs.current[slotIndex];
    if (!board?.measureInWindow || !slot?.measureInWindow) return;

    board.measureInWindow((boardX, boardY) => {
      slot.measureInWindow!((slotX, slotY, slotWidth, slotHeight) => {
        const origin = rootOrigin.current;
        setFlight({
          id: Date.now(),
          char,
          slotIndex,
          from: {
            x: boardX + tapX * (layouts[side].width || 0) - origin.x,
            y: boardY + tapY * (layouts[side].height || 0) - origin.y,
          },
          to: {
            x: slotX + slotWidth / 2 - origin.x,
            y: slotY + slotHeight / 2 - origin.y,
          },
        });
        flightProgress.setValue(0);
        Animated.timing(flightProgress, { toValue: 1, duration: FLIGHT_MS, useNativeDriver: true }).start(() => {
          setFlight(null);
          setPoppedSlot(slotIndex);
          setTimeout(() => setPoppedSlot(null), SLOT_POP_MS);
        });
      });
    });
  };

  return <SafeAreaView
    accessibilityLabel="Learning spot the difference"
    ref={(node: never) => { rootRef.current = node; }}
    onLayout={() => rootRef.current?.measureInWindow?.((x, y) => { rootOrigin.current = { x, y }; })}
    style={{ flex: 1, backgroundColor: colors.canvas, paddingBottom: keyboardHeight }}
  >
    {/* Header */}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 2, gap: spacing.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={onExit ?? (() => choose(selected))} style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>‹</Text>
      </Pressable>
      {/* Title and category split apart so neither truncates. The old single line
          ("레벨 1 · 영어 단어") ran out of room next to the badges and cut mid-word. The chip
          also carries the category colour from the home screen, so a board looks like the
          card that opened it. */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <Text accessibilityRole="header" numberOfLines={1} style={textStyle.subtitle}>{dailyNumber !== null
          ? `오늘의 도전 #${dailyNumber}`
          : `레벨 ${entries.findIndex((e) => e.key === selected.key) + 1}`}</Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: headerPalette.bg }}>
          <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '800', color: headerPalette.fg }}>{categoryLabel}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* The live clock is the most important number on the screen while it runs, so it is
            filled rather than left as grey chrome. It is now a deadline, so the last stretch
            has to be legible with the sound off: the badge turns red and grows. It does not
            blink — a full-screen flicker above 3Hz is the photosensitivity threshold, and a
            timer is exactly the element an eye is already locked onto. */}
        {(() => {
          const tone = state.phase === 'SUDDEN_DEATH' || finalRush ? 'danger' : boardOpen ? 'accent' : 'neutral';
          const urgent = state.phase === 'SUDDEN_DEATH' || finalRush;
          const label = state.phase === 'SUDDEN_DEATH'
            ? `서든데스 ${Math.ceil(suddenDeathRemainingMs / 1000)}초 남음`
            : boardOpen
              ? `${finalRush ? '파이널 러시, ' : ''}남은 시간 ${Math.ceil(remainingMs / 1000)}초`
              : '시간 종료';
          const shown = state.phase === 'SUDDEN_DEATH'
            ? `SD ${Math.ceil(suddenDeathRemainingMs / 1000)}`
            : boardOpen ? formatClock(remainingMs) : '시간 종료';
          return <View
            testID="hud-timer"
            accessibilityLabel={label}
            style={{ ...badgeStyle(tone), ...(urgent ? { transform: [{ scale: 1.14 }] } : {}) }}
          >
            <Text style={badgeTextStyle(tone)}>{shown}</Text>
          </View>;
        })()}
        {/* Named as your own record, never dressed up as another player. */}
        {ghost !== null && boardOpen ? <View
          testID="hud-ghost"
          accessibilityLabel={`내 기록 ${ghostFinds}개, 나 ${state.claimedIds.length}개`}
          style={badgeStyle(standing === 'AHEAD' ? 'success' : standing === 'BEHIND' ? 'danger' : 'neutral')}
        >
          <Text style={badgeTextStyle(standing === 'AHEAD' ? 'success' : standing === 'BEHIND' ? 'danger' : 'neutral')}>
            {`나 ${state.claimedIds.length} · 기록 ${ghostFinds}`}
          </Text>
        </View> : null}
        <View testID="hud-score" accessibilityLabel={`점수 ${liveScore}점`} style={badgeStyle('accent')}>
          <Text style={badgeTextStyle('accent')}>{`${liveScore}점`}</Text>
        </View>
      </View>
    </View>

    {/* Discrete slots, shown from the first second with every unit masked. Boxes make the
        rule visible — one find fills one box — in a way a run of underscores cannot. */}
    {boardOpen && patternUnits !== null && answerPattern !== null ? <View
      testID="hud-pattern"
      accessibilityLabel={`정답 패턴 ${answerPattern}`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 3, marginHorizontal: spacing.md, marginTop: 2, paddingVertical: 5, paddingHorizontal: spacing.sm, borderRadius: radius.card, backgroundColor: colors.surfaceMuted }}
    >
      {patternUnits.map((unit, index) => {
        // A slot the letter is still travelling to stays empty until it lands. Filling it
        // on the tap would make the flight decorative; the point is that it *delivers*.
        const inFlight = flight?.slotIndex === index;
        const shown = unit.revealed && !inFlight;
        return unit.space
          ? <View key={`gap-${index}`} style={{ width: 10 }} />
          : <View
            key={`slot-${index}`}
            testID={`pattern-slot-${index}`}
            ref={(node: never) => { slotRefs.current[index] = node; }}
            style={{
              minWidth: 24, height: 32, paddingHorizontal: 4, borderRadius: 8,
              alignItems: 'center', justifyContent: 'center',
              // A landed letter fills rather than merely outlines. An empty slot and a filled
              // one differing only by border colour is too quiet for the one thing the whole
              // board is working toward.
              backgroundColor: shown ? colors.accentSoft : colors.surface,
              borderWidth: shown ? 1.5 : 1,
              borderColor: shown ? colors.accent : colors.lineStrong,
              transform: [{ scale: poppedSlot === index ? 1.3 : 1 }],
            }}
          >
            <Text style={{ fontSize: 17, lineHeight: 21, fontWeight: '800', color: shown ? colors.accent : colors.faint }}>
              {shown ? unit.text : ''}
            </Text>
          </View>;
      })}
    </View> : null}

    {/* Find progress. The dashes alone never said how many there were to find, so a player
        could not tell a nearly-finished board from a fresh one at a glance. The count sits on
        the same row rather than a new one — vertical space here belongs to the artwork. */}
    <View
      accessibilityLabel={`찾은 차이 ${state.claimedIds.length} / ${selected.differences.length}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginVertical: 5, paddingHorizontal: spacing.md }}
    >
      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: selected.differences.length }).map((_, idx) => {
          const isFound = idx < state.claimedIds.length;
          return <View key={idx} style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: isFound ? colors.accent : colors.line }} />;
        })}
      </View>
      {/* The combo sits on the progress row rather than in the top bar. The bar already
          carries a back button, a title, a category, a clock and a score, and adding a
          sixth thing there pushed the chevron over the title. This is also where the eye
          already is between finds. It reads as its own streak colour or not at all, and it
          lapses on the window alone — a missed tap never breaks it, because looking is the
          behaviour this game wants. */}
      {(() => {
        const label = comboLabel(combo);
        if (label === null || comboExpired(combo, Date.now())) return null;
        return <View
          testID="hud-combo"
          accessibilityLabel={`${combo.count}연속 발견`}
          style={{ paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: streakColor(combo.count, colors.success) }}
        >
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.onAccent }}>{label}</Text>
        </View>;
      })()}
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.accent }}>
        {state.claimedIds.length}/{selected.differences.length}
      </Text>
    </View>

    {/* Word hunt prompt: read first, then tap the matching object. */}
    {state.phase === 'FIND' && activeMission !== null ? <View
      testID="word-hunt-banner"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`단어 찾기 ${activeMission.publicPrompt}`}
      style={{
        marginHorizontal: spacing.sm,
        marginBottom: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: state.activeMission?.stage === 'HUNTING' ? colors.accent : colors.line,
        gap: 2,
      }}
    >
      <Text style={textStyle.overline}>
        {activeMission.kind === 'SPECIAL' ? '스페셜 단어 찾기' : '단어 찾기'}
      </Text>
      <Text testID="word-hunt-prompt" style={textStyle.title}>{activeMission.publicPrompt}</Text>
      <Text testID="word-hunt-stage" style={textStyle.caption}>
        {state.activeMission?.stage === 'READING' ? '잠시 후 시작해요' : '그림에서 찾아 터치하세요'}
      </Text>
    </View> : null}

    {/* Play boards */}
    {boardOpen && <ScrollView
      accessibilityLabel="Difference boards"
      scrollEnabled={false}
      onLayout={({ nativeEvent }: { nativeEvent: { layout: { width: number; height: number } } }) => {
        const { width, height } = nativeEvent.layout;
        if (width > 0 && height > 0) setBoardArea({ width: width - BOARD_GUTTER * 2, height });
      }}
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: boardGap, paddingHorizontal: BOARD_GUTTER, paddingBottom: 2, flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      {(['A', 'B'] as const).map((side) => <Pressable key={side} testID={`demo-board-${side}`} accessibilityRole="imagebutton" accessibilityLabel={`Difference image ${side}`} ref={(node: never) => { boardRefs.current[side] = node; }} onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setLayouts((current) => ({ ...current, [side]: { width, height } }));
        }
      }} onPress={(event: any) => {
        const ne = event.nativeEvent || {};
        const containerElem = event.currentTarget || event.target;

        let clientX: number | undefined;
        let clientY: number | undefined;

        if (ne.changedTouches && ne.changedTouches[0]) {
          clientX = ne.changedTouches[0].clientX;
          clientY = ne.changedTouches[0].clientY;
        } else if (ne.touches && ne.touches[0]) {
          clientX = ne.touches[0].clientX;
          clientY = ne.touches[0].clientY;
        } else {
          clientX = ne.clientX ?? ne.pageX;
          clientY = ne.clientY ?? ne.pageY;
        }

        let tapX = 0;
        let tapY = 0;

        if (typeof clientX === 'number' && typeof clientY === 'number' && containerElem && typeof containerElem.getBoundingClientRect === 'function') {
          const rect = containerElem.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            tapX = (clientX - rect.left) / rect.width;
            tapY = (clientY - rect.top) / rect.height;
          }
        } else {
          const locX = ne.locationX ?? ne.offsetX ?? 0;
          const locY = ne.locationY ?? ne.offsetY ?? 0;
          const width = layouts[side].width || 300;
          const height = layouts[side].height || 300;
          tapX = locX / width;
          tapY = locY / height;
        }

        tapX = Math.max(0, Math.min(1, tapX));
        tapY = Math.max(0, Math.min(1, tapY));
        // Compare before and after so the pulse reports what actually happened, rather
        // than re-deciding the hit test here. Both setters run in the event handler:
        // a state updater must stay pure, so the pulse is never raised from inside one.
        const base = latestState.current;
        const next = reduceDemoState(base, selected, { type: 'TAP', side, x: tapX, y: tapY });
        latestState.current = next;
        setState(next);
        if (base.activeMission?.stage !== 'READING') {
          const kind = next.solvedMissionIds.length > base.solvedMissionIds.length ? 'MISSION_HIT'
            : next.claimedIds.length > base.claimedIds.length ? 'HIT'
              : 'MISS';
          setPulse((previous) => nextPulse(previous, { kind, side, x: tapX, y: tapY }));
          // The hand and the ear get told at the same instant as the eye. Fire-and-forget:
          // a slow audio start must never sit between the tap and the next one.
          feedback.play(kind === 'MISS'
            ? { kind: 'MISS' }
            : { kind: 'FIND', foundCount: next.claimedIds.length, differenceCount: selected.differences.length });
          if (kind === 'HIT') {
            setCombo((previous) => advanceCombo(previous, Date.now()));
            launchLetterFlight(side, tapX, tapY, base.claimedIds.length, next.claimedIds.length);
            const found = next.claimedIds.at(-1);
            if (found !== undefined) recordedFinds.current.push({ id: found, atMs: elapsedMs });
          }
        }
      }} style={{
        ...boardSize, minHeight: 48, borderRadius: radius.card, overflow: 'hidden',
        backgroundColor: colors.surface, borderWidth: 1,
        // The warning bleeds in at the edge of the artwork itself, which is where the eye
        // already is. Colour only — widening the border would move the image by a pixel and
        // every difference with it, mid-play.
        borderColor: finalRush || state.phase === 'SUDDEN_DEATH' ? colors.danger : colors.line,
      }}>
        <Image source={side === 'A' ? selected.imageA : selected.imageB} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        {selected.differences.filter((difference) => state.claimedIds.includes(difference.id)).map((difference) => { const circle = side === 'A' ? difference.imageA : difference.imageB; const displayR = Math.max(circle.r, 0.08); return <View key={difference.id} testID={`claimed-${side}-${difference.id}`} style={{ position: 'absolute', left: `${(circle.cx - displayR) * 100}%`, top: `${(circle.cy - displayR) * 100}%`, width: `${displayR * 200}%`, height: `${displayR * 200}%`, borderRadius: radius.pill, borderWidth: 3, borderColor: colors.success, backgroundColor: 'rgba(0, 135, 90, 0.14)', pointerEvents: 'none' }} />; })}
        {/* Where the record was by now, drawn only for spots you have not reached yet.
            Amber and dashed rather than the muted grey tried first: over a photograph a
            low-contrast outline is simply invisible, and this has to be both legible and
            impossible to mistake for your own solid green find. */}
        {selected.differences.filter((difference) => ghostIds.includes(difference.id) && !state.claimedIds.includes(difference.id)).map((difference) => {
          const circle = side === 'A' ? difference.imageA : difference.imageB;
          const displayR = Math.max(circle.r, 0.08);
          return <View key={`ghost-${difference.id}`} testID={`ghost-${side}-${difference.id}`} pointerEvents="none" style={{ position: 'absolute', left: `${(circle.cx - displayR) * 100}%`, top: `${(circle.cy - displayR) * 100}%`, width: `${displayR * 200}%`, height: `${displayR * 200}%`, borderRadius: radius.pill, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.reward, backgroundColor: 'rgba(255, 212, 71, 0.16)' }} />;
        })}
        {pulse !== null && pulse.side === side ? (() => {
          const shape = pulseStyle(pulse.kind, { success: colors.success, danger: colors.danger, accent: colors.accent }, combo.count);
          const half = shape.size / 2;
          return <View testID={`pulse-${side}`} accessibilityLabel={`피드백 ${pulse.kind}`} pointerEvents="none" style={{ position: 'absolute', left: `${(pulse.x - half) * 100}%`, top: `${(pulse.y - half) * 100}%`, width: `${shape.size * 100}%`, aspectRatio: 1, borderRadius: radius.pill, borderWidth: 3, borderColor: shape.color, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: missNudge(pulse) }] }}>
            {shape.label !== null ? <Text style={{ fontSize: 13, fontWeight: '700', color: shape.color }}>{shape.label}</Text> : null}
          </View>;
        })() : null}
      </Pressable>)}
    </ScrollView>}

    {/* Quiz */}
    {state.phase === 'QUIZ' && <View accessibilityLabel="Meaning quiz" style={{ flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, margin: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, ...shadow.lifted }}>
      {/* Three ways in, and the screen has to be honest about which one happened. It used to
          congratulate unconditionally, which was true while a full clear was the only way
          here; the deadline made that a lie. What never changes is the sentence underneath —
          the answer is open whichever way the board ended. */}
      {(() => {
        const ending = state.boardClosedBy === 'SUDDEN_DEATH_WIN'
          ? { status: 'SUDDEN DEATH', tone: colors.success, soft: colors.successSoft, headline: '마지막 순간에 하나 더 찾았어요' }
          : state.boardClosedBy === 'DEADLINE'
            ? { status: 'TIME UP', tone: colors.warning, soft: colors.warningSoft, headline: '시간이 끝났어요' }
            : { status: 'STAGE CLEAR', tone: colors.success, soft: colors.successSoft, headline: '차이점을 모두 찾았어요' };
        return <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          {/* The result is stated as one. A bare overline made the most satisfying moment of
              the round look like a section label. */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: spacing.sm, paddingVertical: 5,
            borderRadius: radius.pill, backgroundColor: ending.soft,
          }}>
            <Text testID="quiz-status" style={{ ...textStyle.overline, color: ending.tone }}>{ending.status}</Text>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: ending.tone }}>
              {state.claimedIds.length}/{selected.differences.length}
            </Text>
          </View>
          <Text style={{ ...textStyle.title, textAlign: 'center' }}>{ending.headline}</Text>
          <Text style={{ ...textStyle.caption, textAlign: 'center' }}>{`그림과 힌트를 바탕으로 ${categoryLabel} 정답을 직접 입력해 보세요.`}</Text>
        </View>;
      })()}
      <TextInput accessibilityLabel="Answer input" value={answerInput} onChangeText={setAnswerInput} autoCapitalize="none" autoCorrect={false} placeholder="정답 입력" placeholderTextColor={colors.faint} style={{ ...field.input, fontSize: 17, textAlign: 'center' }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Submit answer" onPress={() => submitAnswer()} style={{ ...buttonStyle('primary', { block: true }), minHeight: 56, borderRadius: radius.pill }}><Text style={{ ...buttonTextStyle('primary'), fontSize: 16 }}>정답 제출</Text></Pressable>
      {state.wrongAnswers > 0 && <Text accessibilityLiveRegion="polite" style={{ ...textStyle.danger, textAlign: 'center' }}>다시 생각해 보세요.</Text>}
    </View>}

    {/* Completion */}
    {state.phase === 'COMPLETE' && <ScrollView accessibilityLabel="Learning complete" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      {/* The score is the payoff of the whole round, so it is the largest thing on the screen.
          It used to sit under the word "정답" in a smaller weight, which put the label above
          the result. The gradient is the home hero's, so finishing a board lands on the same
          surface that started it. */}
      <View accessibilityLabel="Casual result" style={{ borderRadius: radius.xl, overflow: 'hidden', ...shadow.lifted }}>
        <VerticalGradient from={gradients.hero.from} to={gradients.hero.to} style={{ padding: spacing.xl, alignItems: 'center', gap: 4 }}>
          <Text style={{ ...textStyle.overline, color: 'rgba(255,255,255,0.78)' }}>정답 · {categoryLabel}</Text>
          <Text style={{ ...textStyle.display, fontSize: 44, lineHeight: 52, color: colors.onAccent }}>
            {finalBreakdown.total.toLocaleString()}
          </Text>
          <Text style={{ ...textStyle.caption, fontWeight: '700', color: 'rgba(255,255,255,0.86)' }}>최종 점수</Text>
        </VerticalGradient>
      </View>

      {/* A ranked game has to show how the number was reached, or players cannot tell what
          to do differently next run. */}
      <View testID="score-breakdown" accessibilityLabel="Score breakdown" style={{ ...surfaceStyle.card, gap: 6 }}>
        <Text style={{ ...textStyle.overline, color: colors.faint }}>점수 상세</Text>
        {([
          [`차이점 ${state.claimedIds.length}/${selected.differences.length}`, `+${finalBreakdown.finds}`],
          ...(finalBreakdown.wordHunts > 0 ? [[`단어 찾기 ${state.solvedMissionIds.length}개`, `+${finalBreakdown.wordHunts}`]] as const : []),
          ['정답 + 뜻', `+${finalBreakdown.finalAnswer}`],
          ...(finalBreakdown.penalty > 0 ? [['오답', `-${finalBreakdown.penalty}`]] as const : []),
          ['빠른 풀이 보너스', `×${finalBreakdown.speedMultiplier.toFixed(2)}`],
          ...(state.hintsUsed > 0 ? [[`힌트 ${state.hintsUsed}회`, `×${finalBreakdown.hintMultiplier.toFixed(2)}`]] as const : []),
        ] as ReadonlyArray<readonly [string, string]>).map(([label, value]) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={textStyle.caption}>{label}</Text>
          {/* A penalty is the one row a player needs to spot without reading, so it is the one
              row that changes colour. Multipliers stay neutral: they are not losses. */}
          <Text style={{
            ...textStyle.caption,
            fontWeight: '800',
            color: value.startsWith('-') ? colors.danger : value.startsWith('+') ? colors.success : colors.ink,
          }}>{value}</Text>
        </View>)}
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 2 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={textStyle.bodyStrong}>합계</Text>
          <Text style={{ ...textStyle.subtitle, color: colors.accent }}>{finalBreakdown.total.toLocaleString()}점</Text>
        </View>
        <Text style={{ ...textStyle.caption, marginTop: 2 }}>빠른 풀이 보너스는 찾은 차이점 비율만큼 붙습니다.</Text>
      </View>

      {/* The card the player can paste anywhere. Shown before the share button so they can
          see exactly what leaves the app — nothing here names the answer. */}
      <View testID="share-preview" accessibilityLabel="공유 카드 미리보기" style={{ ...surfaceStyle.quiet, alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 18, lineHeight: 24, letterSpacing: 1 }}>{buildShareGrid(shareInput)}</Text>
        <Text style={{ ...textStyle.caption, textAlign: 'center' }}>적게 찾고 맞힐수록 좋은 기록이에요</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share result"
        onPress={() => { void Share.share?.({ message: buildShareCard(shareInput) }); }}
        style={buttonStyle('secondary', { block: true })}
      >
        <Text style={buttonTextStyle('secondary')}>결과 공유하기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Play again" onPress={() => { const fresh = createDemoState(selected); setState(fresh); latestState.current = fresh; setHintIndex(0); setSettledScore(null); setElapsedMs(0); setAnswerInput(''); recordedFinds.current = []; }} style={buttonStyle('primary', { block: true })}><Text style={buttonTextStyle('primary')}>{ghost !== null ? '내 기록에 다시 도전' : '다시 도전하기'}</Text></Pressable>
    </ScrollView>}

    {/* Footer: answer, submit and hint share one row. Two stacked full-width rows cost the
        boards roughly a fifth of the screen, and the artwork is what the game is about. */}
    <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, gap: 6, ...shadow.lifted }}>
      {/* Hints outlive the board.
          They used to be gated on the finding stage, which was correct while a full clear was
          the only way out of it — every letter was already open by then. The deadline broke
          that: a player who ran out of time reaches the answer with nothing revealed, and
          gating the hint there would take the learning away for being slow, which is the one
          thing the clock must never do. The answer field is the quiz screen's own, so only
          the hint half of this row survives past the buzzer. */}
      {state.phase !== 'COMPLETE' && currentHintText ? <View style={surfaceStyle.quiet}><Text testID="current-hint" accessibilityLiveRegion="polite" style={{ ...textStyle.caption, textAlign: 'center', color: colors.ink }}>{currentHintText}</Text></View> : null}
      {state.phase !== 'COMPLETE' && (showEarlyAnswer || totalHintSteps > 0) ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {showEarlyAnswer ? <View testID="early-answer" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <TextInput
            accessibilityLabel="Early answer input"
            value={answerInput}
            onChangeText={setAnswerInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="정답을 알겠다면 입력"
            placeholderTextColor={colors.faint}
            style={{ ...field.input, flex: 1, minHeight: 44, paddingVertical: 8 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit early answer"
            disabled={answerInput.trim().length === 0}
            onPress={() => submitAnswer()}
            style={{ ...buttonStyle(answerInput.trim().length === 0 ? 'disabled' : 'primary'), minHeight: 44, minWidth: 60, paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.pill }}
          >
            <Text style={buttonTextStyle(answerInput.trim().length === 0 ? 'disabled' : 'primary')}>제출</Text>
          </Pressable>
        </View> : null}
        {totalHintSteps > 0 ? <Pressable
          accessibilityLabel="Use hint"
          disabled={hintsExhausted}
          onPress={() => { setHintIndex((prev) => Math.min(prev + 1, totalHintSteps)); act({ type: 'USE_HINT' }); }}
          style={{
            ...buttonStyle(hintsExhausted ? 'disabled' : 'secondary'),
            minHeight: 44, paddingVertical: 8, paddingHorizontal: spacing.sm, gap: 6,
            borderRadius: radius.pill,
            // `block` only stretches cross-axis inside a row, so claim the row with flex.
            ...(showEarlyAnswer ? {} : { flex: 1 }),
          }}
        >
          <Text style={buttonTextStyle(hintsExhausted ? 'disabled' : 'secondary')}>힌트</Text>
          {/* The remaining count reads as a stock to spend, the way the reference games badge
              a consumable, rather than as part of the label. */}
          <View style={{
            minWidth: 20, height: 20, borderRadius: radius.pill, paddingHorizontal: 5,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hintsExhausted ? colors.disabled : colors.accent,
          }}>
            <Text testID="hint-remaining" style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: hintsExhausted ? colors.disabledInk : colors.onAccent }}>{Math.max(0, totalHintSteps - hintIndex)}</Text>
          </View>
        </Pressable> : null}
      </View> : null}
    </View>

    {/* Sudden death: the deadline passed with differences still on the board, so ten seconds
        buy one more find — any one of them.

        It floats for the same reason the coach note does. Laying a banner into the column at
        the moment the phase flips would resize both boards and move every difference under
        the player's finger, which is the one thing a ten-second stage cannot afford. It is
        also `pointerEvents="none"`: the board underneath stays tappable through it. */}
    {state.phase === 'SUDDEN_DEATH' ? <View
      testID="sudden-death-banner"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`서든데스, ${Math.ceil(suddenDeathRemainingMs / 1000)}초 안에 하나만 더 찾으세요`}
      pointerEvents="none"
      style={{
        // Sized to its content and centred rather than stretched edge to edge. On device the
        // full-width pill covered the bottom of board B; a centred one leaves the artwork
        // either side of it visible, and the seconds are repeated in the header anyway.
        position: 'absolute', alignSelf: 'center', maxWidth: '92%', bottom: 104,
        paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
        borderRadius: radius.pill, backgroundColor: colors.danger,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      }}
    >
      {/* One row, the coach note's proven height. Two rows sat over enough of the lower
          board to matter, and the seconds still have to be the largest thing here — a
          countdown in small type is the one place the plan names outright. */}
      <Text testID="sudden-death-clock" style={{ ...textStyle.display, fontSize: 26, lineHeight: 30, color: colors.onAccent }}>
        {Math.ceil(suddenDeathRemainingMs / 1000)}
      </Text>
      <Text numberOfLines={1} style={{ ...textStyle.bodyStrong, flexShrink: 1, color: colors.onAccent }}>
        서든데스 · 하나만 더 찾으면 돼요
      </Text>
    </View> : null}

    {/* Coaching floats over the layout rather than sitting in it: pushing the boards down
        for three seconds would resize the artwork and re-measure every slot mid-play. */}
    {coachStep !== null ? <View
      testID="coach-note"
      accessibilityLiveRegion="polite"
      accessibilityLabel={COACH_TEXT[coachStep]}
      pointerEvents="none"
      style={{
        // Clears the footer row: a transient note must not sit on top of a live control.
        position: 'absolute', left: spacing.md, right: spacing.md, bottom: 104,
        paddingVertical: 8, paddingHorizontal: spacing.md,
        borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.onAccent, textAlign: 'center' }}>
        {COACH_TEXT[coachStep]}
      </Text>
    </View> : null}

    {/* The earned letter, in flight from the difference to its slot. Rendered last and
        non-interactive so it floats over the boards without stealing a tap. */}
    {flight !== null ? <Animated.View
      testID="letter-flight"
      accessibilityLabel={`획득한 글자 ${flight.char}`}
      pointerEvents="none"
      style={{
        position: 'absolute', left: flight.from.x - 15, top: flight.from.y - 15,
        width: 30, height: 30, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.accent,
        transform: [
          { translateX: flightProgress.interpolate({ inputRange: [0, 1], outputRange: [0, flight.to.x - flight.from.x] }) },
          { translateY: flightProgress.interpolate({ inputRange: [0, 1], outputRange: [0, flight.to.y - flight.from.y] }) },
          { scale: flightProgress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.5, 1.25, 0.85] }) },
        ],
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.onAccent }}>{flight.char}</Text>
    </Animated.View> : null}
  </SafeAreaView>;
}
