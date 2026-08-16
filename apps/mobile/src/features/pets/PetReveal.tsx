import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, rarityLabels, rarityPalette, spacing, type RarityKey } from '../../ui/design-tokens';
import { buttonStyle, buttonTextStyle, shadowless, surface, text } from '../../ui/ui-kit';
import {
  nextRevealPhase,
  REVEAL_OPENING_MS,
  revealPresentation,
  type PetRevealV1,
  type RevealEmphasis,
  type RevealPhase,
} from './reveal-model';

const emphasisGlyph: Readonly<Record<RevealEmphasis, string>> = {
  QUIET: '◦',
  NOTABLE: '◈',
  CELEBRATE: '✦',
};

/**
 * Presents an already-decided acquisition. The outcome arrives from the server before
 * this component mounts, so the sequence is purely presentational — closing early or
 * backgrounding the app cannot change what was awarded.
 */
export function PetReveal({ reveal, onDismiss }: Readonly<{ reveal: PetRevealV1; onDismiss: () => void }>) {
  const [phase, setPhase] = useState<RevealPhase>('SEALED');

  useEffect(() => {
    setPhase('SEALED');
    const openTimer = setTimeout(() => setPhase((current) => nextRevealPhase(current)), 40);
    const revealTimer = setTimeout(() => setPhase('REVEALED'), REVEAL_OPENING_MS);
    return () => { clearTimeout(openTimer); clearTimeout(revealTimer); };
  }, [reveal.petId, reveal.source, reveal.copies]);

  const rarity = reveal.rarity as RarityKey;
  const palette = rarityPalette[rarity];
  const presentation = revealPresentation(reveal, rarityLabels[rarity]);
  const opened = phase === 'REVEALED';

  return <View
    accessibilityRole="alert"
    accessibilityLiveRegion="polite"
    accessibilityLabel={`펫 획득 ${rarityLabels[rarity]} ${presentation.headline}`}
    style={{ ...surface.cardLifted, marginBottom: spacing.sm, borderColor: opened ? palette.fg : colors.line, gap: spacing.md }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View
        testID="reveal-medallion"
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.xl,
          backgroundColor: opened ? palette.bg : colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: opened ? 26 : 22, color: opened ? palette.fg : colors.faint }}>
          {opened ? emphasisGlyph[presentation.emphasis] : '□'}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={text.overline}>{presentation.eyebrow}</Text>
        {opened
          ? <Text style={text.title}>{presentation.headline}</Text>
          : <Text testID="reveal-pending" style={{ ...text.title, color: colors.faint }}>상자를 여는 중…</Text>}
        {opened ? <Text style={text.caption}>{presentation.detail}</Text> : null}
      </View>
    </View>

    {opened ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View style={{ ...shadowless, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: palette.bg }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.fg }}>{rarityLabels[rarity]}</Text>
      </View>
      <Text style={text.caption}>{`보유 ${reveal.copies}마리`}</Text>
    </View> : null}

    <Pressable
      accessibilityRole="button"
      accessibilityLabel="획득 결과 닫기"
      disabled={!opened}
      onPress={onDismiss}
      style={buttonStyle(opened ? 'secondary' : 'disabled', { block: true })}
    >
      <Text style={buttonTextStyle(opened ? 'secondary' : 'disabled')}>{opened ? '확인' : '…'}</Text>
    </Pressable>
  </View>;
}
