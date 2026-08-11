import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, radius, spacing } from '../src/ui/design-tokens';
import { RankingScreen } from '../src/features/ranking/RankingScreen';
import { WeeklyCategoryBoard } from '../src/features/leaderboard/WeeklyCategoryBoard';
import { createRankingRouteController, type RankingRouteState } from '../src/features/ranking/ranking-route-controller';
import type { RankedCategory } from '../src/features/ranking/ranking-model';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';

export function RankingRouteView({ state, onCategory, onRetry }: Readonly<{
  state: RankingRouteState;
  onCategory(category: RankedCategory): void;
  onRetry(): void;
}>) {
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, backgroundColor: colors.canvas }}>
    <Text accessibilityRole="header" style={{ marginTop: 18, color: colors.ink, fontSize: 28, fontWeight: '900' }}>주간 랭킹</Text>
    <Text style={{ marginTop: 6, color: colors.muted }}>서버에서 검증된 학습 기록만 순위에 반영돼요.</Text>
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
      {(['ENGLISH', 'PROVERB'] as const).map((category) => <Pressable key={category} accessibilityRole="tab" accessibilityState={{ selected: state.category === category }} accessibilityLabel={category === 'ENGLISH' ? '영어 랭킹' : '속담 랭킹'} onPress={() => onCategory(category)} style={{ flex: 1, padding: 12, borderRadius: radius.button, backgroundColor: state.category === category ? colors.sky : colors.white }}><Text style={{ textAlign: 'center', color: state.category === category ? colors.white : colors.ink, fontWeight: '800' }}>{category === 'ENGLISH' ? '영어' : '속담'}</Text></Pressable>)}
    </View>
    <View accessibilityLabel={`랭킹 상태 ${state.model.state}`} style={{ marginTop: spacing.md, padding: spacing.xl, borderRadius: radius.card, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1 }}>
      {state.reason === 'SIGNED_OUT' ? <Text>랭킹을 보려면 내 정보에서 로그인해 주세요.</Text>
        : state.board && (state.model.state === 'READY' || state.model.state === 'STALE')
          ? <>{state.model.state === 'STALE' && <Text accessibilityLiveRegion="polite">저장된 랭킹이에요. 연결되면 갱신할게요.</Text>}<WeeklyCategoryBoard category={state.category} top10={state.model.rows.map((row) => ({ rank: row.rank, nickname: row.nickname, displayScore: row.score }))} myRank={state.board.myRank?.rank} /></>
          : <RankingScreen model={state.model} />}
      {(state.model.state === 'ERROR' || state.model.state === 'STALE') && <Pressable accessibilityRole="button" accessibilityLabel="랭킹 다시 시도" onPress={onRetry} style={{ marginTop: spacing.md, padding: 12, borderRadius: radius.button, backgroundColor: colors.sky }}><Text style={{ color: colors.white, textAlign: 'center', fontWeight: '800' }}>다시 시도</Text></Pressable>}
    </View>
  </ScrollView>;
}

export default function RankingRoute() {
  const runtime = useMobileRuntime();
  const session = useMobileSession(runtime);
  const controller = useMemo(() => runtime.status === 'READY' ? createRankingRouteController({
    session: () => runtime.session.getState().status,
    seasonId: runtime.environment.weeklySeasonId,
    client: runtime.ranking,
  }) : null, [runtime]);
  const fallback: RankingRouteState = { category: 'ENGLISH', model: { state: 'ERROR', rows: [], totalRows: 0 }, board: null, reason: runtime.status === 'CONFIG_ERROR' ? runtime.code : 'MOBILE_RUNTIME_UNAVAILABLE' };
  const state = useSyncExternalStore(
    (listener) => controller?.subscribe(listener) ?? (() => undefined),
    () => controller?.getState() ?? fallback,
  );
  useEffect(() => {
    if (session.status !== 'loading') void controller?.load('ENGLISH');
  }, [controller, session.status]);
  useEffect(() => () => controller?.dispose(), [controller]);
  const visibleState: RankingRouteState = session.status === 'loading'
    ? { category: state.category, model: { state: 'LOADING', rows: [], totalRows: 0 }, board: null }
    : session.status !== 'signed-in' && runtime.status === 'READY'
      ? { category: state.category, model: { state: 'DISABLED', rows: [], totalRows: 0 }, board: null, reason: 'SIGNED_OUT' }
      : state;
  return <RankingRouteView state={visibleState} onCategory={(category) => void controller?.load(category)} onRetry={() => void controller?.load(state.category)} />;
}
