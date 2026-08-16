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

/** Bands across the fill. 28 keeps each step under a perceptible colour jump at phone density. */
const BANDS = 28;

/**
 * How much taller each band is drawn than its slot.
 *
 * Laying the bands out with `flex: 1` looked right and rendered wrong: Android rounds each
 * child's height independently, and the accumulated rounding error opens hairline gaps that
 * show the parent through as bright horizontal stripes — worst on small tiles, and worse the
 * more bands there are. Positioning each band absolutely and drawing it half again as tall as
 * its slot makes consecutive bands overlap, so there is no seam left for rounding to expose.
 */
const BAND_OVERLAP = 1.6;

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

export function VerticalGradient({ from, via, to, style, testID, children }: Readonly<{
  from: string;
  /** Optional middle stop. Two related hues alone wash out; the middle stop carries the character. */
  via?: string;
  to: string;
  style?: ViewStyle;
  /** Passed through so a gradient can stand in for a plain view a test already targets. */
  testID?: string;
  children?: React.ReactNode;
}>) {
  return <View {...(testID === undefined ? {} : { testID })} style={{ ...style, overflow: 'hidden', position: 'relative' }}>
    {/* The bands sit behind the content, filling the parent. `pointerEvents` is none so a
        button inside still receives every touch. */}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {Array.from({ length: BANDS }, (_unused, index) => <View
        key={index}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${(index * 100) / BANDS}%`,
          height: `${(100 / BANDS) * BAND_OVERLAP}%`,
          backgroundColor: rampAt(from, via, to, index / (BANDS - 1)) as ColorValue,
        }}
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
/**
 * Concentric ring scales. Each adds its share of the opacity, so the centre reaches the
 * requested value and the outer edge is a sixth of it.
 *
 * Three rings was not enough: at a third of the opacity each, every ring boundary was its own
 * visible arc. Six at a sixth puts each step near the limit of what the eye picks out.
 */
const SHEEN_RINGS = [1, 0.87, 0.74, 0.61, 0.47, 0.32] as const;

export function Sheen({ size = 260, top = -110, left = -70, opacity = 0.16 }: Readonly<{
  size?: number;
  top?: number;
  left?: number;
  opacity?: number;
}>) {
  // One flat circle has a hard edge, and a hard-edged white disc on a gradient reads as a
  // rendering fault rather than as light. Nesting a few rings and splitting the opacity
  // between them approximates a radial falloff — still just views, no blur, no native module.
  return <View pointerEvents="none" style={{
    position: 'absolute', top, left,
    width: size, height: size,
    alignItems: 'center', justifyContent: 'center',
  }}>
    {SHEEN_RINGS.map((scale) => <View
      key={scale}
      style={{
        position: 'absolute',
        width: size * scale, height: size * scale, borderRadius: (size * scale) / 2,
        backgroundColor: '#FFFFFF', opacity: opacity / SHEEN_RINGS.length,
      }}
    />)}
  </View>;
}
