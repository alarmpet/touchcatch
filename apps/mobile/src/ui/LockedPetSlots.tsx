import { Text, View } from 'react-native';
import { colors, radius, rarityPalette, spacing, type RarityKey } from './design-tokens';

/**
 * The shape of a collection you do not have yet.
 *
 * An empty collection screen carrying only a sentence gives a new player nothing to want.
 * Drawing the slots — tinted along the rarity ladder rather than as identical greys — says
 * what the collection is, and that it has tiers, before a single pet exists.
 *
 * Shared by the home strip and the pets screen so the promise looks the same in both places.
 */

/** Ascending, so the row reads as a ladder rather than a set. */
const LADDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const satisfies readonly RarityKey[];

function Slot({ index }: Readonly<{ index: number }>) {
  const tint = rarityPalette[LADDER[index % LADDER.length]!];
  return <View
    accessibilityLabel="아직 만나지 않은 펫"
    style={{
      flex: 1,
      aspectRatio: 1,
      borderRadius: radius.card,
      backgroundColor: tint.bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: 'dashed',
    }}
  >
    <Text style={{ fontSize: 20, lineHeight: 24, color: tint.fg, opacity: 0.35 }}>❍</Text>
  </View>;
}

export function LockedPetSlots({ count, columns = count }: Readonly<{
  count: number;
  /** Slots per row. Defaults to a single row. */
  columns?: number;
}>) {
  // Laid out as explicit rows of `flex: 1` slots rather than percentage widths: with a gap
  // between them, percentages overflow the container and the last slot in each row clips.
  const rows = Array.from({ length: Math.ceil(count / columns) }, (_unused, row) =>
    Array.from({ length: columns }, (_u, column) => row * columns + column).filter((index) => index < count));

  return <View style={{ gap: spacing.xs }}>
    {rows.map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: 'row', gap: spacing.xs }}>
      {row.map((index) => <Slot key={index} index={index} />)}
      {/* A short final row keeps the slot size of a full one instead of stretching. */}
      {Array.from({ length: columns - row.length }, (_u, filler) => <View key={`filler-${filler}`} style={{ flex: 1 }} />)}
    </View>)}
  </View>;
}
