import { Text, View } from 'react-native';
import type { RankingModel } from './ranking-model';
import { colors, glow, podiumGradients, podiumPalette, radius, spacing } from '../../ui/design-tokens';
import { VerticalGradient } from '../../ui/Gradient';
import { text } from '../../ui/ui-kit';

const stateCopy = {
  LOADING: '랭킹을 불러오는 중이에요.',
  EMPTY: '아직 검증된 기록이 없어요.',
  STALE: '저장된 랭킹이에요. 연결되면 갱신할게요.',
  ERROR: '랭킹을 불러오지 못했어요.',
  DISABLED: '서버 검증과 주간 정책 승인 후 열려요.',
} as const;

/** States where the board is empty because nothing has happened yet, not because it broke. */
const PREVIEW_STATES = new Set(['EMPTY', 'DISABLED', 'LOADING']);

/**
 * The rank chip. Ranks 1–3 get the podium tints; everyone else stays quiet so the top three
 * keep their meaning.
 */
function RankChip({ rank, ghost = false }: Readonly<{ rank: number; ghost?: boolean }>) {
  const medal = podiumGradients[rank as 1 | 2 | 3];
  // Ranks 1–3 become metal: a gold, silver and bronze ramp reads as a podium instantly and
  // needs no label. Everyone below stays a flat tint so the three keep meaning something.
  if (medal !== undefined) {
    return <VerticalGradient
      from={medal.from}
      via={medal.via}
      to={medal.to}
      style={{
        minWidth: 32, height: 32, borderRadius: radius.pill, paddingHorizontal: 6,
        alignItems: 'center', justifyContent: 'center',
        opacity: ghost ? 0.5 : 1,
        ...(ghost ? {} : glow(medal.via, 'soft')),
      }}
    >
      {/* No sheen here. Its rings are a few pixels apart inside a 32pt chip, which reads as
          a moiré texture on the metal rather than as a highlight. */}
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '900', color: '#3A2A05' }}>{rank}</Text>
    </VerticalGradient>;
  }
  const tint = podiumPalette[rank as 1 | 2 | 3] ?? { bg: colors.surfaceMuted, fg: colors.muted };
  return <View style={{
    minWidth: 32, height: 32, borderRadius: radius.pill, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tint.bg, opacity: ghost ? 0.55 : 1,
  }}>
    <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '800', color: tint.fg }}>{rank}</Text>
  </View>;
}

/**
 * Three greyed-out rows shown while the board has nothing in it.
 *
 * A single grey sentence gave a first-time visitor no idea what the screen becomes. Drawing
 * the shape of a leaderboard answers that without inventing fake names or scores.
 */
export function GhostBoard() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 0 }}>
    {[1, 2, 3].map((rank) => <View key={rank} style={{
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: rank === 1 ? 0 : 1, borderTopColor: colors.line,
    }}>
      <RankChip rank={rank} ghost />
      <View style={{ flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }} />
      <View style={{ width: 44, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }} />
    </View>)}
  </View>;
}

export function RankingScreen({ model }: Readonly<{ model: RankingModel }>) {
  return <View accessibilityLabel={`랭킹 상태 ${model.state}`} style={{ gap: spacing.sm }}>
    {model.state !== 'READY' && <Text accessibilityLiveRegion="polite" style={text.caption}>{stateCopy[model.state]}</Text>}
    {PREVIEW_STATES.has(model.state) && model.rows.length === 0 ? <GhostBoard /> : null}
    {(model.state === 'READY' || model.state === 'STALE') && model.rows.map((row, index) =>
      <View
        key={`${row.rank}-${row.nickname}`}
        accessibilityLabel={`${row.rank}위 ${row.nickname} ${row.score}점`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.sm,
          // The podium rows lift out of the list rather than sitting in it. Below rank 3 the
          // hairline rule comes back, so the break between the two groups is the design.
          ...(row.rank <= 3
            ? {
                paddingHorizontal: spacing.sm,
                marginBottom: 6,
                borderRadius: radius.card,
                backgroundColor: podiumPalette[row.rank as 1 | 2 | 3]?.bg ?? colors.surfaceMuted,
              }
            : {
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.line,
              }),
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
          <RankChip rank={row.rank} />
          <Text numberOfLines={1} style={{ ...text.bodyStrong, flex: 1, ...(row.rank === 1 ? { fontSize: 17, lineHeight: 24 } : {}) }}>{row.nickname}</Text>
        </View>
        {/* The score is the reason the row is where it is, so it stops being a caption. */}
        <Text style={{ ...text.bodyStrong, color: row.rank <= 3 ? colors.ink : colors.muted }}>{row.score.toLocaleString()}점</Text>
      </View>,
    )}
  </View>;
}
