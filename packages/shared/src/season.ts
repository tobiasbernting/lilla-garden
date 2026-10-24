import type { Season } from './types.js';

/** Gregorian Easter Sunday (Meeus/Jones/Butcher). Returns month (1-12) and day. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const dayOfYear = (y: number, m: number, d: number): number =>
  Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);

/** Components of `date` in the Stockholm time zone. */
export function stockholmDate(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Which holiday season a calendar date falls in. */
export function seasonForDate(date: Date): Season {
  const { y, m, d } = stockholmDate(date);
  const doy = dayOfYear(y, m, d);

  // Halloween: 24 Oct – 1 Nov
  if ((m === 10 && d >= 24) || (m === 11 && d === 1)) return 'halloween';
  // Jul: 1 Dec – 6 Jan
  if (m === 12 || (m === 1 && d <= 6)) return 'jul';
  // Påsk: Palm Sunday (Easter - 7) through Easter Monday (Easter + 1)
  const e = easterSunday(y);
  const easterDoy = dayOfYear(y, e.month, e.day);
  if (doy >= easterDoy - 7 && doy <= easterDoy + 1) return 'pask';
  // Midsommar: the week ending on midsummer day (Saturday between 20–26 June)
  for (let dd = 20; dd <= 26; dd++) {
    if (new Date(Date.UTC(y, 5, dd)).getUTCDay() === 6) {
      const midsummerDoy = dayOfYear(y, 6, dd);
      if (doy >= midsummerDoy - 6 && doy <= midsummerDoy + 1) return 'midsommar';
      break;
    }
  }
  return 'none';
}

export const SEASONS: Season[] = ['none', 'halloween', 'jul', 'pask', 'midsommar'];

export const isSeason = (s: string): s is Season => (SEASONS as string[]).includes(s);
