import { View, type ViewStyle, type ColorValue } from 'react-native';

/**
 * A vertical gradient built from stacked bands, with no native dependency.
 *
 * `expo-linear-gradient` would be the obvious choice, but it is a native module: adding it
 * means a dependency, a lockfile change in a repo with hash-locked gates, and a 10-20 minute
 * native rebuild — a steep price for one linear fill. Enough thin bands are visually
 * indistinguishable from a real gradient at phone density.
 *
 * The colours come from `config/ui-theme.v1.json`'s `gradient.header`, which the frozen
 * contract already specifies; this renders what the contract asked for.
 */

/** Bands across the fill. 24 puts each band under 4px on a 90px header — below a pixel seam. */
const BANDS = 24;

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ] as const;
}

/** Mixes two hex colours in sRGB. Good enough here: both ends are the same hue family. */
function mix(from: string, to: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`;
}

/**
 * Colour at `ratio` along a two- or three-stop ramp.
 *
 * With a `via` stop the ramp is walked in halves. Without one it behaves exactly as before,
 * so existing two-stop callers are unaffected.
 */
function rampAt(from: string, via: string | undefined, to: string, ratio: number): string {
  if (via === undefined) return mix(from, to, ratio);
  return ratio < 0.5 ? mix(from, via, ratio * 2) : mix(via, to, (ratio - 0.5) * 2);
}

export function VerticalGradient({ from, via, to, style, children }: Readonly<{
  from: string;
  /** Optional middle stop. Two related hues alone wash out; the middle stop carries the character. */
  via?: string;
  to: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}>) {
  return <View style={{ ...style, overflow: 'hidden', position: 'relative' }}>
    {/* The bands sit behind the content, filling the parent. `pointerEvents` is none so a
        button inside still receives every touch. */}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'column' }}>
      {Array.from({ length: BANDS }, (_unused, index) => <View
        key={index}
        style={{ flex: 1, backgroundColor: rampAt(from, via, to, index / (BANDS - 1)) as ColorValue }}
      />)}
    </View>
    {children}
  </View>;
}

/**
 * A soft off-centre highlight laid over a gradient.
 *
 * A pure vertical ramp still reads as flat because the light has no source. An oversized,
 * very low-opacity white circle bled off the top corner is enough to imply one, and it costs
 * a single view — no native module, no blur, no image.
 */
export function Sheen({ size = 260, top = -110, left = -70, opacity = 0.16 }: Readonly<{
  size?: number;
  top?: number;
  left?: number;
  opacity?: number;
}>) {
  return <View
    pointerEvents="none"
    style={{
      position: 'absolute', top, left,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#FFFFFF', opacity,
    }}
  />;
}
