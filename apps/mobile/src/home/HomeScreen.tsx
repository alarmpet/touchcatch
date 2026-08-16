import { Link } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { PublicHomeModel, PublicHomeCard } from './home-model';
import { categoryGradients, categoryPalette, colors, glass, glow, onDark, radius, rarityGradients, rarityLabels, spacing, vivid, vividGradients, type CategoryKey, type RarityKey } from '../ui/design-tokens';
import { Badge, SectionHeading } from '../ui/atoms';
import { FadeInUp, STAGGER_MS } from '../ui/FadeInUp';
import { Sheen, VerticalGradient } from '../ui/Gradient';
import { LockedPetSlots } from '../ui/LockedPetSlots';
import { TabBar } from '../ui/TabBar';
import { useMusicMood } from '../features/feedback/music-context';
import { glowCard, header, progress, screen, text, textOnDark, vividButtonStyle, vividButtonTextStyle, vividSurface } from '../ui/ui-kit';

/** Empty 도감 slots are drawn so the collection reads as a board to fill, not an empty list. */
const SHOWCASE_SLOTS = 4;

/** Rounds in a day's run. The hero's progress dots are drawn from this, not from a literal 3. */
const DAILY_ROUNDS = 3;

/**
 * Learning modes the player can enter directly. The hero picks for them; this row is for
 * when they already know what they want to practise.
 */
const LEARNING_MODES = [
  { category: 'ENGLISH', label: '영어 단어', hint: '그림 속 사물의 영어 이름 맞히기', glyph: 'A' },
  { category: 'PROVERB', label: '속담', hint: '장면이 말하는 속담 찾기', glyph: '말' },
  { category: 'IDIOM', label: '사자성어', hint: '네 글자로 압축된 이야기', glyph: '四' },
] as const;

/**
 * Full-width rows rather than three small tiles.
 *
 * The tiles were the weakest thing on the screen: at a third of the width each there was only
 * room for a label, so the row read as three placeholder buttons. A row gives every mode a
 * colour, a mark, and a sentence saying what it actually is — which is what makes it a menu
 * rather than a set of switches.
 */
function ModePicker({ enabled, route }: Readonly<{ enabled: boolean; route: string }>) {
  return <View style={{ gap: spacing.sm }}>
    <SectionHeading title="골라서 시작" {...(enabled ? { hint: '원하는 것만 골라 연습해요' } : {})} />
    <View style={{ gap: spacing.xs }}>
      {LEARNING_MODES.map((mode) => {
        const palette = categoryPalette[mode.category];
        const ramp = categoryGradients[mode.category as CategoryKey];
        // A disabled card drops to grey rather than a faded tint: half-colour reads as a
        // rendering fault, plain grey reads as "not yet".
        const body = <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radius.xl,
          backgroundColor: enabled ? colors.surface : colors.surfaceMuted,
          borderWidth: 1,
          borderColor: enabled ? palette.edge : 'transparent',
          // Each row is lit by its own mode colour, which is what separates the three at a
          // glance without making the card itself loud enough to compete with the hero.
          ...(enabled ? glow(palette.fg, 'soft') : {}),
        }}>
          {/* The glyph tile carries the saturation for the whole row. */}
          <VerticalGradient
            from={enabled ? ramp.from : colors.disabled}
            via={enabled ? ramp.via : colors.disabled}
            to={enabled ? ramp.to : colors.disabled}
            style={{
              width: 56, height: 56, borderRadius: radius.card,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {enabled ? <Sheen size={70} top={-34} left={-18} opacity={0.3} /> : null}
            <Text style={{ fontSize: 23, lineHeight: 28, fontWeight: '800', color: enabled ? colors.onAccent : colors.faint }}>{mode.glyph}</Text>
          </VerticalGradient>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...text.subtitle, color: enabled ? colors.ink : colors.muted }}>{mode.label}</Text>
            <Text numberOfLines={1} style={{ ...text.caption, color: enabled ? colors.muted : colors.faint }}>{mode.hint}</Text>
          </View>
          <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: enabled ? palette.fg : colors.faint }}>›</Text>
        </View>;
        if (!enabled) return <View key={mode.category} accessibilityLabel={`${mode.label} 준비 중`}>{body}</View>;
        return <Link key={mode.category} href={`${route}?category=${mode.category}` as never} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`${mode.label} 시작`}>{body}</Pressable>
        </Link>;
      })}
    </View>
  </View>;
}

function CollectionStrip({ collection }: Readonly<{ collection: PublicHomeModel['collection'] }>) {
  const owned = collection?.ownedCount ?? 0;
  const total = collection?.totalCount ?? 0;
  const showcase = collection?.showcase ?? [];
  const slots = Array.from({ length: SHOWCASE_SLOTS }, (_unused, index) => showcase[index] ?? null);

  return <Link href={'/pets' as never} asChild>
    <Pressable accessibilityRole="button" accessibilityLabel={`내 펫 ${owned}마리, 전체 ${total}종`} style={{ ...glowCard(vivid.azure), gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={text.subtitle}>내 펫</Text>
          {/* A collection is a count before it is anything else — the reference roster strips
              all lead with one. Reading it as a chip rather than body text is what makes it
              feel like a score to raise. */}
          <View style={{ paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.accentSoft }}>
            <Text style={{ ...text.caption, fontWeight: '800', color: colors.accent }}>{owned} / {total > 0 ? total : '?'}</Text>
          </View>
        </View>
        <Text style={{ ...text.caption, color: colors.accent, fontWeight: '700' }}>전체 보기 ›</Text>
      </View>
      {total > 0 ? <View style={progress.track}><View style={progress.fill(owned / total)} /></View> : null}
      {/* Nothing owned yet is the common case on a fresh install, and the shared preview says
          what the collection will look like. Once a single pet lands the row switches to the
          real thumbnails so progress is visible immediately. */}
      {showcase.length === 0
        ? <LockedPetSlots count={SHOWCASE_SLOTS} />
        : <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {slots.map((pet, index) => {
          if (pet === null) {
            return <View key={`empty-${index}`} accessibilityLabel="아직 만나지 않은 펫" style={{
              flex: 1, aspectRatio: 1, borderRadius: radius.card,
              backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed',
            }} />;
          }
          const ramp = rarityGradients[pet.rarity as RarityKey] ?? rarityGradients.COMMON;
          // The frame is the rarity. A 2px gradient edge around the art says "legendary"
          // faster than any label, and costs nothing at thumbnail size.
          return <View key={pet.petId} accessibilityLabel={`${rarityLabels[pet.rarity as RarityKey] ?? ''} 펫`} style={{ flex: 1, aspectRatio: 1 }}>
            <VerticalGradient from={ramp.from} via={ramp.via} to={ramp.to} style={{ flex: 1, borderRadius: radius.card, padding: 2, ...glow(ramp.via, 'soft') }}>
              <View style={{ flex: 1, borderRadius: radius.card - 2, overflow: 'hidden', backgroundColor: colors.surface }}>
                <Image accessibilityIgnoresInvertColors source={{ uri: pet.thumbnailUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
              </View>
            </VerticalGradient>
          </View>;
        })}
        </View>}
    </Pressable>
  </Link>;
}

export function HomeScreen({ model }: Readonly<{ model: PublicHomeModel }>) {
  useMusicMood('LOBBY');
  const [primary] = model.cards;
  const ranking = model.cards.find((card) => card.id === 'ranking');
  // Both still come from the model's zero state; they are read through named values so the
  // screen stops hard-coding "0" in three places once progress is actually wired.
  const streakDays = 0;
  const doneToday = 0;
  const primaryEnabled = primary?.availability === 'ENABLED';
  const ctaTone = primaryEnabled ? 'bright' : 'disabled';
  // White on the blue hero rather than a blue button on a blue field: the CTA has to be the
  // highest-contrast thing on the card, and against a saturated ground that means going light.
  const primaryAction = <Pressable
    disabled={!primaryEnabled}
    accessibilityRole="button"
    accessibilityLabel={primaryEnabled ? '오늘의 학습 시작' : '오늘의 학습 준비 중'}
    accessibilityState={{ disabled: !primaryEnabled }}
    style={vividButtonStyle(ctaTone, { block: true })}
  >
    <Text style={vividButtonTextStyle(ctaTone)}>
      {primaryEnabled ? '오늘의 도전 시작' : '콘텐츠 준비 중'}
    </Text>
  </Pressable>;

  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ ...screen.scroll, ...screen.content }}>
    <View style={{ ...header.wrap, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ ...header.title, fontSize: 26, lineHeight: 32 }}>TouchCatch</Text>
      {/* A zero streak is not a number worth showing — it just says "you have nothing". Until
          there is a run to protect, the badge invites one instead of reporting its absence. */}
      {streakDays > 0
        ? <Badge label={`연속 ${streakDays}일`} tone="warning" accessibilityLabel={`연속 학습 ${streakDays}일`} />
        : <Badge label="오늘 시작하면 1일차" tone="accent" accessibilityLabel="아직 연속 기록이 없어요" />}
    </View>

    {/* The one saturated surface on the screen: it fixes the eye before anything else. */}
    <FadeInUp style={{ ...vividSurface.heroShell, ...glow(vivid.violet, 'strong') }}>
      <VerticalGradient
        from={vividGradients.hero.from}
        via={vividGradients.hero.via}
        to={vividGradients.hero.to}
        style={{ padding: spacing.xl, gap: spacing.lg }}
      >
      {/* Implies a light source, so the ramp stops reading as a flat wash. */}
      <Sheen size={300} top={-130} left={-80} opacity={0.18} />
      <View style={{ gap: 8 }}>
        <View style={{ ...vividSurface.glassChip }}>
          <Text style={{ ...textOnDark.overline, color: onDark.primary }}>오늘의 도전 · 약 3분</Text>
        </View>
        <Text style={{ ...textOnDark.title, fontSize: 27, lineHeight: 34, letterSpacing: -0.6 }}>그림을 찾고{`\n`}단어를 잡아보세요</Text>
      </View>
      <View style={{ gap: spacing.xs }}>
        {/* The three dots never said three of what. */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={textOnDark.caption}>오늘 진행</Text>
          <Text style={{ ...textOnDark.caption, fontWeight: '800', color: onDark.primary }}>{doneToday} / {DAILY_ROUNDS}판</Text>
        </View>
        <View accessibilityLabel={`오늘의 진행 ${doneToday} / ${DAILY_ROUNDS}`} style={{ flexDirection: 'row', gap: 5 }}>
          {Array.from({ length: DAILY_ROUNDS }, (_unused, step) => <View key={step} style={{
            flex: 1, height: 7, borderRadius: radius.pill,
            backgroundColor: step < doneToday ? onDark.primary : glass.base,
            ...(step < doneToday ? glow(onDark.primary, 'soft') : {}),
          }} />)}
        </View>
      </View>
      {/* The hero goes to today's shared board; `골라서 시작` below is for free play. */}
      {primaryEnabled ? <Link href={`${primary.route}?daily=1` as never} asChild>{primaryAction}</Link> : primaryAction}
      </VerticalGradient>
    </FadeInUp>

    {/* Each block enters one beat after the one above it, so the page assembles downward
        instead of appearing all at once. */}
    <FadeInUp delay={STAGGER_MS} style={{ marginTop: spacing.lg }}>
      <ModePicker enabled={primaryEnabled} route={primary?.route ?? '/game/spot-difference'} />
    </FadeInUp>

    <FadeInUp delay={STAGGER_MS * 2} style={{ marginTop: spacing.lg }}>
      <CollectionStrip collection={model.collection} />
    </FadeInUp>

    {/* A disabled ranking card is a dead full-width block in the middle of the screen. When
        the season is not live the row collapses to a single quiet line instead. */}
    {ranking ? <FadeInUp delay={STAGGER_MS * 3} style={{ marginTop: spacing.sm }}>
      <RankingRow card={ranking} />
    </FadeInUp> : null}
    </ScrollView>
    <TabBar active="home" />
  </View>;
}

function RankingRow({ card }: Readonly<{ card: PublicHomeCard }>) {
  if (card.availability !== 'ENABLED') {
    return <Text accessibilityLabel="랭킹 준비 중" style={{ ...text.caption, textAlign: 'center', color: colors.faint }}>
      주간 랭킹은 준비 중이에요
    </Text>;
  }
  return <Link href={card.route as never} asChild>
    <Pressable accessibilityRole="button" accessibilityLabel={card.label} style={{ ...glowCard(vivid.amber), flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
      {/* A trophy tile gives the row the same weight as the mode cards above it, which is
          what stops the leaderboard reading as a footnote. */}
      <VerticalGradient
        from={vividGradients.podium.from}
        via={vividGradients.podium.via}
        to={vividGradients.podium.to}
        style={{ width: 48, height: 48, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' }}
      >
        <Sheen size={60} top={-30} left={-16} opacity={0.3} />
        <Text style={{ fontSize: 21, lineHeight: 26 }}>🏆</Text>
      </VerticalGradient>
      <View style={{ gap: 2, flex: 1 }}>
        <Text style={text.subtitle}>주간 랭킹</Text>
        <Text style={text.caption}>검증된 기록만 반영돼요</Text>
      </View>
      <Text style={{ ...text.subtitle, color: vivid.amber }}>›</Text>
    </Pressable>
  </Link>;
}

