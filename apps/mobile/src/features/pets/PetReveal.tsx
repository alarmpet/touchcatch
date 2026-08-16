import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, glow, onDark, radius, rarityGradients, rarityLabels, spacing, type RarityKey } from '../../ui/design-tokens';
import { Sheen, VerticalGradient } from '../../ui/Gradient';
import { buttonStyle, buttonTextStyle, shadowless, surface, text } from '../../ui/ui-kit';
import {
  revealDurationMs,
  revealLadder,
  revealPresentation,
  REVEAL_STEP_MS,
  type PetRevealV1,
  type RevealEmphasis,
} from './reveal-model';

const emphasisGlyph: Readonly<Record<RevealEmphasis, string>> = {
  QUIET: '◦',
  NOTABLE: '◈',
  CELEBRATE: '✦',
};

/** Medallion size per tier climbed. The object grows as the ladder rises. */
const STEP_SIZE = [64, 70, 78, 88, 100] as const;

/**
 * Presents an already-decided acquisition. The outcome arrives from the server before
 * this component mounts, so the sequence is purely presentational — closing early or
 * backgrounding the app cannot change what was awarded.
 *
 * The presentation climbs the rarity ladder rather than cutting straight to the result:
 * a LEGENDARY travels through four tiers before it lands, and how far it travelled is what
 * makes the rarity legible without reading a word. Tapping cuts to the result immediately,
 * because a ceremony you cannot skip stops being a reward on the second day.
 */
export function PetReveal({ reveal, onDismiss }: Readonly<{ reveal: PetRevealV1; onDismiss: () => void }>) {
  const rarity = reveal.rarity as RarityKey;
  const ladder = revealLadder(reveal.rarity);
  const [stepIndex, setStepIndex] = useState(0);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    setStepIndex(0);
    setOpened(false);
    // One timer per rung rather than an interval: the last rung holds longer than the
    // climb, and a single interval cannot express that.
    const timers = ladder.slice(1).map((_tier, index) => setTimeout(
      () => setStepIndex(index + 1),
      (index + 1) * REVEAL_STEP_MS,
    ));
    const settle = setTimeout(() => setOpened(true), revealDurationMs(reveal.rarity));
    return () => {
      for (const timer of timers) clearTimeout(timer);
      clearTimeout(settle);
    };
  }, [reveal.petId, reveal.source, reveal.copies, reveal.rarity, ladder.length]);

  const skip = () => {
    setStepIndex(ladder.length - 1);
    setOpened(true);
  };

  const presentation = revealPresentation(reveal, rarityLabels[rarity]);
  const shownTier = (ladder[stepIndex] ?? rarity) as RarityKey;
  const ramp = rarityGradients[shownTier];
  const size = STEP_SIZE[stepIndex] ?? STEP_SIZE[0];
  // The glow only reaches full strength once the climb has stopped, so the landing is the
  // brightest moment rather than one of several equally bright ones.
  const lit = opened && presentation.emphasis === 'CELEBRATE';

  return <Pressable
    accessibilityRole="alert"
    accessibilityLiveRegion="polite"
    accessibilityLabel={`펫 획득 ${rarityLabels[rarity]} ${presentation.headline}`}
    onPress={opened ? undefined : skip}
    style={{
      ...surface.cardLifted,
      marginBottom: spacing.sm,
      borderColor: opened ? ramp.via : colors.line,
      gap: spacing.md,
      ...(opened ? glow(ramp.via, lit ? 'strong' : 'soft') : {}),
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <VerticalGradient
        testID="reveal-medallion"
        from={ramp.from}
        via={ramp.via}
        to={ramp.to}
        style={{
          width: size,
          height: size,
          borderRadius: radius.xl,
          alignItems: 'center',
          justifyContent: 'center',
          ...glow(ramp.via, lit ? 'strong' : 'soft'),
        }}
      >
        <Sheen size={size} top={-size * 0.45} left={-size * 0.2} opacity={0.22} />
        <Text style={{ fontSize: opened ? 30 : 24, color: onDark.primary, fontWeight: '800' }}>
          {opened ? emphasisGlyph[presentation.emphasis] : '?'}
        </Text>
      </VerticalGradient>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={text.overline}>{presentation.eyebrow}</Text>
        {opened
          ? <Text style={text.title}>{presentation.headline}</Text>
          : <Text testID="reveal-pending" style={{ ...text.title, color: ramp.via }}>{rarityLabels[shownTier]}…</Text>}
        {opened ? <Text style={text.caption}>{presentation.detail}</Text> : null}
        {/* The climb is worth narrating only while it is still climbing. */}
        {!opened && ladder.length > 1
          ? <Text style={text.caption}>{`${stepIndex + 1} / ${ladder.length} · 탭하면 바로 확인`}</Text>
          : null}
      </View>
    </View>

    {opened ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View style={{ ...shadowless, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: ramp.via }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: onDark.primary }}>{rarityLabels[rarity]}</Text>
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
  </Pressable>;
}
