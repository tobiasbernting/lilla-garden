// The light of the day: what colour the world is lit with, where the sun is (for the shadows it casts) and how dark
// it is (for lamps), from the time of day, the weather and the season.
import { DAY_LENGTH_MS, type Season, type WeatherKind } from '@lilla-garden/shared';
import { clamp01, lerp, smooth } from './gfx.ts';

type RGB = [number, number, number];

export interface SkyLight {
  /** Colour the scene is multiplied by where no lamp shines. */
  ambient: RGB;
  /** 0 bright day … 1 deep night: how strongly lamps, windows and lanterns shine. */
  dark: number;
  /** Direction shadows fall (unit vector, world pixels, y down) and how long they are per pixel of height. */
  shadowX: number;
  shadowY: number;
  shadowLen: number;
  /** How dark a shadow is (0 none: overcast, rain, night without moon). */
  shadowAlpha: number;
  /** 0..1 golden hour warmth, for the glints on water. */
  golden: number;
  /** How much the wind sways trees and grass. */
  wind: number;
}

/** Ambient colour through the day (f = time of day 0..1, the day starts in the morning). */
const DAY: [number, RGB][] = [
  [0.0, [1.0, 0.84, 0.68]], // sunrise, golden
  [0.1, [1.0, 0.95, 0.88]],
  [0.25, [1.0, 1.0, 0.98]],
  [0.5, [1.0, 0.98, 0.93]],
  [0.62, [1.0, 0.86, 0.66]], // golden hour
  [0.7, [0.94, 0.6, 0.5]], // sunset
  [0.76, [0.48, 0.36, 0.56]], // dusk
  [0.82, [0.23, 0.25, 0.43]],
  [0.9, [0.21, 0.24, 0.43]], // night
  [0.955, [0.23, 0.25, 0.43]],
  [0.985, [0.62, 0.46, 0.55]], // dawn
  [1.0, [1.0, 0.84, 0.68]],
];

const sample = (keys: [number, RGB][], f: number): RGB => {
  for (let i = 1; i < keys.length; i++) {
    const [f1, c1] = keys[i]!;
    const [f0, c0] = keys[i - 1]!;
    if (f <= f1) {
      const t = smooth((f - f0) / (f1 - f0));
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return keys[keys.length - 1]![1];
};

/** Overcast skies: how much of the sun gets through, and the tint of the grey light. */
const WEATHER: Record<WeatherKind, { sun: number; tint: RGB; wind: number }> = {
  sun: { sun: 1, tint: [1, 1, 1], wind: 0.35 },
  cloudy: { sun: 0.35, tint: [0.86, 0.88, 0.92], wind: 0.55 },
  rain: { sun: 0, tint: [0.72, 0.77, 0.86], wind: 0.7 },
  storm: { sun: 0, tint: [0.52, 0.56, 0.68], wind: 1.5 },
  snow: { sun: 0.2, tint: [0.93, 0.96, 1.0], wind: 0.45 },
  hail: { sun: 0, tint: [0.7, 0.75, 0.82], wind: 0.9 },
  wind: { sun: 0.85, tint: [1.0, 0.97, 0.93], wind: 1.7 },
  fog: { sun: 0.15, tint: [0.88, 0.9, 0.93], wind: 0.15 },
};

const mul = (a: RGB, b: RGB): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function skyLight(timeMs: number, weather: WeatherKind | null, season: Season): SkyLight {
  const f = (((timeMs / DAY_LENGTH_MS) % 1) + 1) % 1;
  let ambient = sample(DAY, f);
  // night is purple at Halloween, and the snow makes Christmas nights lighter
  const night = clamp01((f - 0.74) / 0.08) * clamp01((0.99 - f) / 0.04);
  if (season === 'halloween') ambient = mix(ambient, [0.27, 0.18, 0.43], night * 0.85);
  if (season === 'jul') ambient = mix(ambient, [0.27, 0.32, 0.48], night * 0.8);
  const w = WEATHER[weather ?? 'sun'];
  // clouds grey the day; at night they make no difference
  ambient = mix(ambient, mul(ambient, w.tint), 1 - night * 0.7);
  // the sun climbs from the east (f -0.02) to the south (noon) and sets in the west (f 0.72)
  const sunT = (f + 0.02) / 0.74;
  const up = sunT > 0 && sunT < 1;
  const az = Math.PI * clamp01(sunT); // 0 east, π/2 south, π west
  const elevation = up ? Math.sin(Math.PI * sunT) : 0;
  const dark = clamp01(1 - (ambient[0] * 0.3 + ambient[1] * 0.55 + ambient[2] * 0.15 - 0.2) / 0.6);
  return {
    ambient,
    dark,
    // shadows fall away from the sun: west in the morning, north at noon, east in the evening
    shadowX: -Math.cos(az),
    shadowY: -Math.sin(az),
    shadowLen: 0.45 + 1.5 * (1 - elevation),
    shadowAlpha: up ? 0.24 * w.sun * smooth(Math.min(sunT, 1 - sunT) / 0.06) : 0,
    golden: up ? clamp01(1 - elevation * 2.2) : 0,
    wind: w.wind,
  };
}
