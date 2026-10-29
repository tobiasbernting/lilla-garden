// The cozy extras, each on its own so they can be compared: `?fx=seasons,smoke` in the address bar turns on just
// those, `?fx=none` none of them. `?year=winter` (spring, summer, autumn) previews another time of year, and
// `?quality=high` keeps the glow and tilt-shift on even on a slow screen.
import type { Season } from '@lilla-garden/shared';

export const FEATURES = ['seasons', 'windows', 'smoke', 'indoors', 'critters', 'pond', 'mist', 'puddles', 'glow', 'tiltshift', 'sounds'] as const;
export type Feature = (typeof FEATURES)[number];

/** All on, unless the address bar says otherwise. */
const DEFAULT: Feature[] = [...FEATURES];

const params = new URLSearchParams(location.search);
const list = params.get('fx');
const enabled = new Set<string>(list === null ? DEFAULT : list.split(','));

export const on = (f: Feature): boolean => enabled.has(f);

/** Keep the glow and tilt-shift even when the screen turns out to be slow. */
export const forceQuality = params.get('quality') === 'high';

export type YearSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** The time of year by the calendar (Christmas is always winter). */
export function yearSeason(fest: Season, date = new Date()): YearSeason {
  const forced = params.get('year');
  if (forced === 'spring' || forced === 'summer' || forced === 'autumn' || forced === 'winter') return forced;
  if (fest === 'jul') return 'winter';
  const m = date.getMonth();
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

/** How far into autumn the leaves have turned (0 early September … 1 late November). */
export function autumnProgress(date = new Date()): number {
  if (params.get('year') === 'autumn') return 0.8;
  const start = new Date(date.getFullYear(), 8, 1).getTime();
  const end = new Date(date.getFullYear(), 10, 30).getTime();
  return Math.max(0, Math.min(1, (date.getTime() - start) / (end - start)));
}
