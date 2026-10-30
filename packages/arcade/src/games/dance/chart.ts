// The note chart: built from the song's own melody (and its drums where nobody sings), so every press
// lands on something you hear. Also the levels, the timing windows and the scoring rules.
import type { Song } from './songs.ts';

export type Level = 0 | 1 | 2;

export interface LevelDef {
  name: string;
  /** ± seconds for Perfekt, Bra and Okej. */
  win: [number, number, number];
  /** Seconds a note takes from the top of the lane to the line. */
  scroll: number;
  /** Fewest sixteenths between two notes. */
  gap: number;
  /** Melody notes at least this many sixteenths long become hold notes. */
  hold: number;
  /** The combo for ×2, for ×3 and for Discofeber (×4). */
  tiers: [number, number, number];
  /** Points for a perfect run (every note Perfekt, never a break). */
  max: number;
}

export const LEVELS: LevelDef[] = [
  { name: 'Lätt', win: [0.085, 0.15, 0.24], scroll: 2.6, gap: 8, hold: 8, tiers: [4, 8, 12], max: 14_000 },
  { name: 'Medel', win: [0.05, 0.095, 0.15], scroll: 1.8, gap: 3, hold: 8, tiers: [10, 20, 30], max: 28_000 },
  { name: 'Svår', win: [0.04, 0.075, 0.12], scroll: 1.35, gap: 2, hold: 6, tiers: [10, 25, 40], max: 38_000 },
];

/** 1 Perfekt, 2 Bra, 3 Okej, 4 Miss. */
export type Judgement = 1 | 2 | 3 | 4;
export const JUDGE_NAME = ['', 'PERFEKT!', 'BRA!', 'OKEJ', 'MISS'] as const;
/** Base points for Perfekt, Bra, Okej. */
const BASE = [0, 100, 70, 40, 0];
/** Base points per beat of a hold kept to the end. */
const HOLD_BASE = 30;
/** How much a judgement counts towards the accuracy. */
export const ACC = [0, 1, 0.7, 0.4, 0];

export interface Note {
  t: number;
  step: number;
  lane: number;
  hold: boolean;
  /** Hold end (= t for a tap). */
  end: number;
  /** 0 waiting; otherwise the judgement. */
  judged: 0 | Judgement;
  /** Seconds early (−) or late (+) when hit. */
  off: number;
  /** A hold: 0 not started, 1 held now, 2 kept to the end, 3 let go early. */
  hs: 0 | 1 | 2 | 3;
  /** Lab autoplay has looked at it. */
  bot?: boolean;
}

export interface Chart {
  notes: Note[];
  /** Points multiplier that makes a perfect run worth LEVELS[level].max. */
  scale: number;
}

/** The combo multiplier: ×1, ×2, ×3, and ×4 in Discofeber. */
export function multFor(level: Level, combo: number): number {
  const t = LEVELS[level]!.tiers;
  return combo >= t[2] ? 4 : combo >= t[1] ? 3 : combo >= t[0] ? 2 : 1;
}

export const feverOn = (level: Level, combo: number): boolean => combo >= LEVELS[level]!.tiers[2];

export function judge(level: Level, off: number): Judgement | 0 {
  const w = LEVELS[level]!.win;
  const a = Math.abs(off);
  return a <= w[0] ? 1 : a <= w[1] ? 2 : a <= w[2] ? 3 : 0;
}

/** Points for a hit: the judgement's base points × the combo multiplier (combo before this hit). */
export function points(level: Level, j: Judgement, combo: number, scale: number): number {
  return Math.round(BASE[j]! * multFor(level, combo) * scale);
}

/** Points for a hold kept to its end. */
export function holdPoints(level: Level, n: Note, song: Song, combo: number, scale: number): number {
  const beats = (n.end - n.t) / song.spb;
  return Math.round(HOLD_BASE * beats * multFor(level, combo) * scale);
}

interface Cand {
  step: number;
  len: number;
  /** Melody pitch, or a drum lane hint (negative). */
  p: number;
  drum: 'kick' | 'snare' | 'tomH' | 'tomL' | 'crash' | null;
  /** Restart the up/down mapping here. */
  fresh: boolean;
}

const strength = (c: Cand): number => {
  const s = c.step % 16;
  const base = s === 0 ? 5 : s % 8 === 0 ? 4 : s % 4 === 0 ? 3 : s % 2 === 0 ? 2 : 1;
  return base + (c.len >= 4 ? 1 : 0);
};

/** Keep notes at least `gap` sixteenths apart, preferring the ones on stronger beats. */
function thin(cands: Cand[], gap: number): Cand[] {
  const kept: Cand[] = [];
  for (const c of cands) {
    const last = kept[kept.length - 1];
    if (!last || c.step - last.step >= gap) {
      kept.push(c);
      continue;
    }
    const before = kept[kept.length - 2];
    if (strength(c) > strength(last) && (!before || c.step - before.step >= gap)) {
      c.fresh = c.fresh || last.fresh;
      kept[kept.length - 1] = c;
    }
  }
  return kept;
}

export function buildChart(song: Song, level: Level): Chart {
  const L = LEVELS[level]!;
  const sps = song.sps;
  const cands: Cand[] = [];
  const lo = Math.min(...song.lead.map((n) => n.p));
  const hi = Math.max(...song.lead.map((n) => n.p));
  song.sections.forEach((sec, si) => {
    if (sec.k === 'count') return;
    const notes = song.lead.filter((n) => n.sec === si);
    const hits = song.hits.filter((h) => h.step >= sec.step0 && h.step < sec.step1);
    let fresh = true;
    if (level === 0) {
      // Lätt: one note on the first beat of each bar (two in a chorus), nothing else
      for (let b = 0; b < sec.bars; b++) {
        const beats = sec.k === 'chorus' ? [0, 8] : [0];
        for (const off of beats) {
          const step = sec.step0 + b * 16 + off;
          if (step > song.end / sps + 0.5) continue;
          if (notes.length) {
            const on = notes.find((n) => n.step === step);
            const next = notes.find((n) => n.step >= step) ?? notes[notes.length - 1]!;
            cands.push({ step, len: on && on.len >= L.hold ? on.len : 0, p: (on ?? next).p, drum: null, fresh });
          } else if (hits.some((h) => h.step === step)) cands.push({ step, len: 0, p: 0, drum: 'kick', fresh });
          fresh = false;
        }
      }
      return;
    }
    if (notes.length) {
      for (const n of notes) {
        cands.push({ step: n.step, len: n.len >= L.hold ? n.len : 0, p: n.p, drum: null, fresh });
        fresh = false;
      }
      return;
    }
    for (const h of hits) {
      // Medel: the beats and the fills; Svår: every drum hit
      if (level === 1 && h.step % 4 !== 0 && h.kind !== 'tomH' && h.kind !== 'tomL' && !(h.kind === 'snare' && h.step % 16 >= 12)) continue;
      cands.push({ step: h.step, len: 0, p: 0, drum: h.kind, fresh });
      fresh = false;
    }
  });
  cands.sort((a, b) => a.step - b.step);
  const kept = thin(cands, L.gap);

  // lanes: the melody moves right when it goes up and left when it goes down; drums dance a pattern
  const notes: Note[] = [];
  let lane = 1;
  let prevP = -1;
  let drumI = 0;
  let same = 0;
  for (const c of kept) {
    let next = lane;
    if (c.drum) {
      const inBar = c.step % 16;
      if (level === 0) next = drumI % 2 ? 3 : 0;
      else if (c.drum === 'kick' || c.drum === 'crash') next = inBar < 8 ? 0 : 3;
      else if (c.drum === 'tomH') next = 2;
      else if (c.drum === 'tomL') next = 1;
      else next = inBar === 4 ? 1 : inBar === 12 ? 2 : drumI % 2 ? 1 : 2;
      if (level > 0 && next === lane && same >= 1 && (c.drum === 'kick' || c.drum === 'crash')) next = 3 - next;
      drumI++;
      prevP = -1;
    } else if (c.fresh || prevP < 0) {
      next = Math.max(0, Math.min(3, Math.round(((c.p - lo) / Math.max(1, hi - lo)) * 3)));
      prevP = c.p;
    } else {
      const d = c.p - prevP;
      const stepBy = level === 0 ? 1 : Math.abs(d) >= 5 ? 2 : 1;
      if (d > 0) next = lane + stepBy;
      else if (d < 0) next = lane - stepBy;
      if (next > 3) next = lane === 3 ? 2 : 3;
      if (next < 0) next = lane === 0 ? 1 : 0;
      // too many in a row on one lane: step aside
      if (next === lane && same >= (level === 2 ? 2 : 1)) next = lane >= 2 ? lane - 1 : lane + 1;
      prevP = c.p;
    }
    same = next === lane ? same + 1 : 0;
    lane = next;
    const t = c.step * sps;
    let end = t;
    if (c.len > 0) end = (c.step + c.len) * sps - Math.min(0.12, sps);
    notes.push({ t, step: c.step, lane, hold: c.len > 0, end, judged: 0, off: 0, hs: 0 });
  }

  // a hold must end before the next note on its lane
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    if (!n.hold) continue;
    const after = notes.slice(i + 1).find((m) => m.lane === n.lane);
    if (after && after.t - 0.2 < n.end) n.end = after.t - 0.2;
    if (n.end - n.t < song.spb * 0.9) {
      n.hold = false;
      n.end = n.t;
    }
  }

  // the final hit is a plain press (the song stops right after it)
  const lastStep = notes[notes.length - 1]?.step;
  for (const n of notes)
    if (n.step === lastStep && n.hold) {
      n.hold = false;
      n.end = n.t;
    }

  // jumps (two arrows at once) on the final hit, and on Svår where a chorus starts
  const jumps: Note[] = [];
  const last = notes[notes.length - 1];
  const chorusSteps = new Set(song.sections.filter((s) => s.k === 'chorus').map((s) => s.step0));
  for (const n of notes) {
    const finalHit = n === last && level > 0;
    if (finalHit || (level === 2 && chorusSteps.has(n.step) && !n.hold)) {
      const other = n.lane <= 1 ? 3 : 0;
      jumps.push({ ...n, lane: other, hold: false, end: n.t });
    }
  }
  notes.push(...jumps);
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);

  // scale the points so a perfect run is worth the level's max
  let raw = 0;
  let combo = 0;
  for (const n of notes) {
    raw += points(level, 1, combo, 1);
    combo++;
    if (n.hold) raw += holdPoints(level, n, song, combo, 1);
  }
  return { notes, scale: L.max / Math.max(1, raw) };
}
