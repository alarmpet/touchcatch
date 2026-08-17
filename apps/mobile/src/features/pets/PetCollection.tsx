import React from 'react';
import { Image, View, Text, Pressable, ScrollView } from 'react-native';
import { colors, glow, radius, rarityGradients, rarityLabels, rarityLadder, rarityPalette, spacing, type RarityKey } from '../../ui/design-tokens';
import { VerticalGradient } from '../../ui/Gradient';
import { buttonStyle, buttonTextStyle, progress, rarityBadgeStyle, rarityBadgeTextStyle, surface, text } from '../../ui/ui-kit';
import { orderedRarityProgress, promotionCeiling } from './reveal-model';

export type PetItem = {
  id: string;
  name: string;
  rarity: RarityKey;
  ownedCopies: number;
  selected?: boolean;
  locked?: boolean;
  artUrl?: string;
};
export type PetCollectionProps = {
  pets: PetItem[];
  totalCatalogCount: number;
  status?: 'READY' | 'LOADING' | 'EMPTY' | 'ERROR';
  /** Per-tier collection progress from the server projection. */
  rarityProgress?: Readonly<Partial<Record<RarityKey, { ownedCount: number; totalCount: number }>>>;
  onPromotePet?: (petId: string) => void;
};

function Notice({ label, title, detail }: Readonly<{ label: string; title: string; detail?: string }>) {
  return <View accessibilityLabel={label} style={{ ...surface.card, gap: 4, marginVertical: spacing.xs }}>
    <Text style={text.bodyStrong}>{title}</Text>
    {detail ? <Text style={text.caption}>{detail}</Text> : null}
  </View>;
}

export function PetCollection({ pets, totalCatalogCount, status = pets.length ? 'READY' : 'EMPTY', rarityProgress, onPromotePet }: PetCollectionProps) {
  if (status === 'LOADING') return <Notice label="펫 컬렉션 로딩 중" title="펫 컬렉션을 불러오는 중이에요." />;
  if (status === 'ERROR') return <Notice label="펫 컬렉션 오류" title="펫 컬렉션을 불러오지 못했어요." detail="연결을 확인하고 다시 시도해 주세요." />;
  if (status === 'EMPTY' || pets.length === 0) return <Notice label="펫 컬렉션 비어 있음" title="아직 보유한 펫이 없어요." detail="학습을 완료하면 친구가 하나씩 늘어나요." />;

  const groupedPets = groupInventoryRows(pets);
  const ownedCount = groupedPets.length;
  const completionPercentage = totalCatalogCount ? Math.round((ownedCount / totalCatalogCount) * 100) : 0;
  const tierRows = orderedRarityProgress(rarityProgress ?? {});

  return <View style={{ ...surface.card, marginVertical: spacing.xs, gap: spacing.sm }}>
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={text.subtitle}>펫 컬렉션</Text>
        <Text accessibilityLabel="펫 수집률" style={text.caption}>{`수집률 ${completionPercentage}% (${ownedCount}/${totalCatalogCount})`}</Text>
      </View>
      <View style={progress.track}><View style={progress.fill(totalCatalogCount ? ownedCount / totalCatalogCount : 0)} /></View>
    </View>

    {tierRows.length > 0 ? <View accessibilityLabel="등급별 수집 진행도" style={{ gap: 6 }}>
      {tierRows.map((row) => <View key={row.rarity} accessibilityLabel={`${rarityLabels[row.rarity as RarityKey]} 진행도 ${row.ownedCount}/${row.totalCount}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text style={{ ...text.caption, width: 34, color: rarityPalette[row.rarity as RarityKey].fg, fontWeight: '700' }}>{rarityLabels[row.rarity as RarityKey]}</Text>
        <View style={{ ...progress.track, flex: 1, height: 5 }}>
          <View style={{ ...progress.fill(row.ratio), backgroundColor: rarityPalette[row.rarity as RarityKey].fg }} />
        </View>
        <Text style={{ ...text.caption, width: 44, textAlign: 'right' }}>{`${row.ownedCount}/${row.totalCount}`}</Text>
      </View>)}
    </View> : null}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
      {groupedPets.map((pet) => {
        const ramp = rarityGradients[pet.rarity];
        return <View key={pet.id} accessibilityLabel={`${pet.name} 펫 카드`} style={{
        width: 136,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        gap: 6,
        // Lit by its own tier. A shelf of identically-bordered white cards hides the one
        // thing a collection screen exists to show — that some of these are rarer.
        ...glow(ramp.via, pet.rarity === 'LEGENDARY' || pet.rarity === 'EPIC' ? 'strong' : 'soft'),
      }}>
        {/* The art sits in a tier-coloured frame rather than a grey well. */}
        <VerticalGradient from={ramp.from} via={ramp.via} to={ramp.to} style={{ height: 92, borderRadius: radius.card, padding: 2 }}>
          <View style={{ flex: 1, borderRadius: radius.card - 2, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {pet.artUrl
              ? <Image accessibilityLabel={`${pet.name} 펫 이미지`} source={{ uri: pet.artUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
              : <Text style={{ fontSize: 20, color: colors.faint }}>❍</Text>}
          </View>
        </VerticalGradient>
        <Text numberOfLines={1} style={text.bodyStrong}>{pet.name}</Text>
        <View accessibilityLabel={`${pet.name} 등급`} style={rarityBadgeStyle(pet.rarity)}><Text style={rarityBadgeTextStyle(pet.rarity)}>{rarityLabels[pet.rarity]}</Text></View>
        <Text accessibilityLabel={`${pet.name} 보유 수량`} style={text.caption}>{`보유: ${pet.ownedCopies}개`}</Text>
        {(() => {
          const ceiling = promotionCeiling(pet);
          if (ceiling !== null && ceiling.remaining === 0) return <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${pet.name} 승급`}
            onPress={() => onPromotePet?.(pet.id)}
            style={{ ...buttonStyle('secondary', { block: true }), minHeight: 36, paddingVertical: 8, paddingHorizontal: spacing.sm }}
          >
            <Text style={buttonTextStyle('secondary')}>승급 (10개)</Text>
          </Pressable>;
          if (ceiling === null) return null;
          /**
           * The ceiling, as a meter rather than a footnote.
           *
           * It used to be grey caption text — the smallest, quietest thing on the card — for
           * the one number that says "keep going". The count now leads at card scale, and the
           * bar underneath makes the distance readable without reading. The tier being climbed
           * to is named, because "3 more" means nothing without "to what".
           *
           * The glow is the whole point of a jackpot meter and also the place one could start
           * lying, so it is tied to a fact: `nearing` is a real distance to a guaranteed
           * threshold, not a tease. It brightens and stops — no pulsing, which would be both a
           * flicker risk and a nudge.
           */
          const tone = ceiling.nearing ? colors.reward : rarityPalette[pet.rarity].fg;
          return <View
            accessibilityLabel={`${pet.name} ${rarityLabels[ceiling.nextRarity as RarityKey]} 승급까지 ${ceiling.remaining}개, ${ceiling.held}/${ceiling.required}`}
            style={{ gap: 3, ...(ceiling.nearing ? glow(colors.reward, 'soft') : {}) }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ ...text.caption, color: colors.faint }}>{`→ ${rarityLabels[ceiling.nextRarity as RarityKey]}`}</Text>
              <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '800', color: tone }}>{`${ceiling.remaining}개`}</Text>
            </View>
            <View style={{ ...progress.track, height: 5 }}>
              <View style={{ ...progress.fill(ceiling.ratio), backgroundColor: tone }} />
            </View>
          </View>;
        })()}
      </View>;
      })}
    </ScrollView>
  </View>;
}

function groupInventoryRows(pets: readonly PetItem[]) {
  const grouped = new Map<string, PetItem & { eligibleCopies: number }>();
  for (const pet of pets) {
    const existing = grouped.get(pet.id);
    const eligibleCopies = pet.selected || pet.locked ? 0 : pet.ownedCopies;
    if (existing) {
      existing.ownedCopies += pet.ownedCopies;
      existing.eligibleCopies += eligibleCopies;
      if (!existing.artUrl && pet.artUrl) existing.artUrl = pet.artUrl;
      continue;
    }
    grouped.set(pet.id, { ...pet, eligibleCopies });
  }
  return [...grouped.values()].sort((left, right) => {
    const byRarity = rarityLadder.indexOf(right.rarity) - rarityLadder.indexOf(left.rarity);
    return byRarity !== 0 ? byRarity : left.name.localeCompare(right.name);
  });
}
