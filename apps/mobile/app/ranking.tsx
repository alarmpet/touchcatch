import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, spacing, vivid } from '../src/ui/design-tokens';
import { buttonStyle, buttonTextStyle, glowCard, screen, tabs, text } from '../src/ui/ui-kit';
import { VividScreenHeader } from '../src/ui/atoms';
import { TabBar } from '../src/ui/TabBar';
import { GhostBoard, RankingScreen } from '../src/features/ranking/RankingScreen';
import { WeeklyCategoryBoard } from '../src/features/leaderboard/WeeklyCategoryBoard';
import { createRankingRouteController, type RankingRouteState } from '../src/features/ranking/ranking-route-controller';
import type { RankedCategory } from '../src/features/ranking/ranking-model';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';

export function RankingRouteView({ state, onCategory, onRetry }: Readonly<{
  state: RankingRouteState;
  onCategory(category: RankedCategory): void;
  onRetry(): void;
}>) {
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ ...screen.scroll, ...screen.content }}>
    <VividScreenHeader tone="podium" eyebrow="THIS WEEK" title="주간 랭킹" lede="서버에서 검증된 학습 기록만 순위에 반영돼요." />
    <View style={tabs.bar}>
      {(['ENGLISH', 'PROVERB'] as const).map((category) => {
        const selected = state.category === category;
        return <Pressable key={category} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={category === 'ENGLISH' ? '영어 랭킹' : '속담 랭킹'} onPress={() => onCategory(category)} style={tabs.item(selected)}><Text style={tabs.label(selected)}>{category === 'ENGLISH' ? '영어' : '속담'}</Text></Pressable>;
      })}
    </View>
    <View accessibilityLabel={`랭킹 상태 ${state.model.state}`} style={{ ...glowCard(vivid.magenta), marginTop: spacing.md, gap: spacing.sm }}>
      {/* Signed out is "not started", not "broken", so it gets the same shape preview the
          empty board does rather than a bare line of grey text. */}
      {state.reason === 'SIGNED_OUT' ? <><Text style={text.caption}>로그인하면 이번 주 순위에 이름을 올릴 수 있어요.</Text><GhostBoard /></>
        : state.board && (state.model.state === 'READY' || state.model.state === 'STALE')
          ? <>{state.model.state === 'STALE' && <Text accessibilityLiveRegion="polite" style={text.caption}>저장된 랭킹이에요. 연결되면 갱신할게요.</Text>}<WeeklyCategoryBoard category={state.category} top10={state.model.rows.map((row) => ({ rank: row.rank, nickname: row.nickname, displayScore: row.score }))} {...(state.board.myRank === null ? {} : { myRank: state.board.myRank.rank })} /></>
          : <RankingScreen model={state.model} />}
      {(state.model.state === 'ERROR' || state.model.state === 'STALE') && <Pressable accessibilityRole="button" accessibilityLabel="랭킹 다시 시도" onPress={onRetry} style={buttonStyle('secondary', { block: true })}><Text style={buttonTextStyle('secondary')}>다시 시도</Text></Pressable>}
    </View>
    </ScrollView>
    <TabBar active="ranking" />
  </View>;
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
