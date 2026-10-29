// The cozy extras, each on its own so they can be compared: `?fx=seasons,smoke` in the address bar turns on just
// those, `?fx=none` none of them. `?year=winter` (spring, summer, autumn) previews another time of year.
import type { Season } from '@lilla-garden/shared';

export const FEATURES = ['seasons', 'windows', 'smoke', 'indoors', 'critters', 'pond', 'mist', 'puddles', 'glow', 'tiltshift'] as const;
export type Feature = (typeof FEATURES)[number];

/** On unless the address bar says otherwise (tilt-shift is a look to try, not a default). */
const DEFAULT: Feature[] = FEATURES.filter((f) => f !== 'tiltshift');

const params = new URLSearchParams(location.search);
const list = params.get('fx');
const enabled = new Set<string>(list === null ? DEFAULT : list.split(','));

export const on = (f: Feature): boolean => enabled.has(f);

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
