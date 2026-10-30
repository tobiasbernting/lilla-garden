// Dansbanan's music: original disco songs written as data (one chord per bar, a melody, and a style
// for the drums, the bass and the keys in each section) and expanded into one sorted list of timed
// events. The synth plays those events and the note chart is built from the very same melody and drums.
// Pure data and maths (no DOM), so it can be checked from Node too.

export type Kind = 'count' | 'intro' | 'verse' | 'pre' | 'chorus' | 'break' | 'outro';
export type Inst =
  | 'kick'
  | 'clap'
  | 'snare'
  | 'hat'
  | 'ohat'
  | 'crash'
  | 'tamb'
  | 'tomH'
  | 'tomL'
  | 'stick'
  | 'boom'
  | 'riser'
  | 'bass'
  | 'pad'
  | 'stab'
  | 'arp'
  | 'lead'
  | 'lead2';

type DrumStyle = 'count' | 'intro' | 'four' | 'funk' | 'build' | 'chorus' | 'break' | 'outro';
type BassStyle = 'none' | 'octave' | 'disco' | 'pulse' | 'gallop' | 'funk' | 'long';
type KeyStyle = 'none' | 'stab' | 'pad' | 'both';

interface SecDef {
  k: Kind;
  /** One chord per bar, separated by spaces: C, Am, F#m, G7 … */
  ch: string;
  /** One melody bar per chord: tokens like "E5:2" (pitch : sixteenths) or "r:2" (a rest). */
  mel?: string[];
  dr: DrumStyle;
  bs: BassStyle;
  ky: KeyStyle;
  arp?: 8 | 16;
  /** A drum fill in the last bar. */
  fill?: boolean;
  /** Semitones up (a key change). */
  tr?: number;
  crash?: boolean;
  riser?: boolean;
}

export interface Voice {
  lead: 'square' | 'saw';
  bass: 'saw' | 'square';
  fill: 'snare' | 'toms';
  /** The backbeat on 2 and 4. */
  back: 'clap' | 'both';
}

interface SongDef {
  id: string;
  name: string;
  blurb: string;
  bpm: number;
  /** Semitones the whole song is moved (written in C major / A minor). */
  key: number;
  voice: Voice;
  secs: SecDef[];
}

export interface Ev {
  /** Song time in seconds. */
  t: number;
  /** Sixteenth step from the start of the song. */
  step: number;
  inst: Inst;
  /** MIDI pitch for the pitched instruments. */
  p: number;
  /** Length in seconds. */
  d: number;
  /** Velocity 0..1. */
  v: number;
  /** An extra layer that only plays while Discofeber is on. */
  fever?: boolean;
}

export interface LeadNote {
  step: number;
  len: number;
  p: number;
  t: number;
  d: number;
  sec: number;
}

export interface DrumHit {
  step: number;
  t: number;
  kind: 'kick' | 'snare' | 'tomH' | 'tomL' | 'crash';
}

export interface Chord {
  /** Pitch class of the root (after the key and any key change). */
  root: number;
  /** Semitones above the root. */
  tones: number[];
  minor: boolean;
}

export interface Section {
  k: Kind;
  bar: number;
  bars: number;
  step0: number;
  step1: number;
  t0: number;
  t1: number;
  chords: Chord[];
  melody: boolean;
}

export interface Song {
  id: string;
  name: string;
  blurb: string;
  bpm: number;
  voice: Voice;
  /** Seconds per beat and per sixteenth. */
  spb: number;
  sps: number;
  bars: number;
  events: Ev[];
  lead: LeadNote[];
  hits: DrumHit[];
  sections: Section[];
  /** When the final hit sounds, and when the last ring has died away. */
  end: number;
  length: number;
  /** A loop for the song picker (the first chorus). */
  preview: [number, number];
}

// ---------------------------------------------------------------- the songs

const LADUGARD: SongDef = {
  id: 'ladugard',
  name: 'Ladugårdsdisco',
  blurb: 'Glad och studsig',
  bpm: 120,
  key: -2,
  voice: { lead: 'square', bass: 'saw', fill: 'snare', back: 'clap' },
  secs: [
    { k: 'count', ch: 'C', dr: 'count', bs: 'none', ky: 'none' },
    { k: 'intro', ch: 'C G Am F', dr: 'intro', bs: 'octave', ky: 'stab', arp: 16, fill: true },
    {
      k: 'verse',
      ch: 'C G Am F C G Am F',
      mel: [
        'r:2 E5:2 G5:2 E5:2 C5:2 D5:2 E5:4',
        'r:2 D5:2 G5:2 D5:2 B4:2 C5:2 D5:4',
        'r:2 C5:2 E5:2 A5:4 G5:2 E5:4',
        'F5:4 E5:2 D5:2 C5:8',
        'r:2 E5:2 G5:2 E5:2 C5:2 D5:2 E5:4',
        'r:2 D5:2 G5:2 D5:2 B4:2 C5:2 D5:4',
        'r:2 C5:2 E5:2 A5:2 C6:2 B5:2 C6:4',
        'A5:4 G5:4 F5:2 E5:2 D5:4',
      ],
      dr: 'four',
      bs: 'disco',
      ky: 'stab',
      fill: true,
    },
    {
      k: 'pre',
      ch: 'Dm Em F G',
      mel: ['D5:2 F5:2 A5:2 F5:2 D5:2 F5:2 A5:4', 'E5:2 G5:2 B5:2 G5:2 E5:2 G5:2 B5:4', 'F5:2 A5:2 C6:2 A5:2 F5:2 A5:2 C6:4', 'D6:4 C6:2 B5:2 A5:2 G5:2 r:2 G5:2'],
      dr: 'build',
      bs: 'pulse',
      ky: 'pad',
      riser: true,
    },
    {
      k: 'chorus',
      ch: 'F G Em Am F G C C',
      mel: ['A5:3 A5:3 G5:2 A5:4 C6:4', 'B5:3 B5:3 A5:2 B5:4 D6:4', 'G5:3 G5:3 E5:2 G5:4 B5:4', 'C6:4 B5:2 A5:2 E5:8', 'A5:3 A5:3 G5:2 A5:4 C6:4', 'B5:3 B5:3 A5:2 B5:4 D6:4', 'E6:4 D6:2 C6:2 D6:2 E6:2 G6:4', 'C6:10 r:6'],
      dr: 'chorus',
      bs: 'octave',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
    },
    { k: 'break', ch: 'Am F C G', dr: 'break', bs: 'octave', ky: 'pad', arp: 16, fill: true },
    {
      k: 'verse',
      ch: 'C G Am F',
      mel: ['r:2 E5:2 G5:2 E5:2 C5:2 D5:2 E5:4', 'r:2 D5:2 G5:2 D5:2 B4:2 C5:2 D5:4', 'r:2 C5:2 E5:2 A5:2 C6:2 B5:2 C6:4', 'A5:4 G5:4 F5:2 E5:2 D5:4'],
      dr: 'four',
      bs: 'disco',
      ky: 'stab',
    },
    {
      k: 'pre',
      ch: 'Dm Em F G',
      mel: ['D5:2 F5:2 A5:2 F5:2 D5:2 F5:2 A5:4', 'E5:2 G5:2 B5:2 G5:2 E5:2 G5:2 B5:4', 'F5:2 A5:2 C6:2 A5:2 F5:2 A5:2 C6:4', 'D6:4 C6:2 B5:2 A5:2 G5:2 r:2 G5:2'],
      dr: 'build',
      bs: 'pulse',
      ky: 'pad',
      riser: true,
    },
    {
      k: 'chorus',
      ch: 'F G Em Am F G C C',
      mel: ['A5:3 A5:3 G5:2 A5:4 C6:4', 'B5:3 B5:3 A5:2 B5:4 D6:4', 'G5:3 G5:3 E5:2 G5:4 B5:4', 'C6:4 B5:2 A5:2 E5:8', 'A5:3 A5:3 G5:2 A5:4 C6:4', 'B5:3 B5:3 A5:2 B5:4 D6:4', 'E6:4 D6:2 C6:2 D6:2 E6:2 G6:4', 'C6:10 r:2 G5:2 G5:2'],
      dr: 'chorus',
      bs: 'octave',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
    },
    {
      k: 'chorus',
      ch: 'F G Em Am F G C C',
      mel: ['A5:3 A5:3 G5:2 A5:4 C6:4', 'B5:3 B5:3 A5:2 B5:4 D6:4', 'G5:3 G5:3 E5:2 G5:4 B5:4', 'C6:4 B5:2 A5:2 E5:8', 'A5:3 A5:3 G5:2 A5:4 C6:4', 'B5:3 B5:3 A5:2 B5:4 D6:4', 'E6:4 D6:2 C6:2 D6:2 E6:2 G6:4', 'C6:10 r:6'],
      dr: 'chorus',
      bs: 'octave',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
      tr: 2,
    },
    { k: 'outro', ch: 'C C', mel: ['E6:2 D6:2 C6:2 D6:2 E6:4 G6:4', 'C6:16'], dr: 'outro', bs: 'octave', ky: 'both', arp: 16, tr: 2 },
  ],
};

const MIDNATT: SongDef = {
  id: 'midnatt',
  name: 'Midnattsgalopp',
  blurb: 'Snabb och svängig',
  bpm: 128,
  key: 0,
  voice: { lead: 'saw', bass: 'square', fill: 'toms', back: 'both' },
  secs: [
    { k: 'count', ch: 'Am', dr: 'count', bs: 'none', ky: 'none' },
    { k: 'intro', ch: 'Am F C G', dr: 'intro', bs: 'pulse', ky: 'pad', arp: 16, fill: true },
    {
      k: 'verse',
      ch: 'Am F C G Am F C G',
      mel: [
        'r:2 E5:1 E5:1 E5:2 D5:2 C5:2 D5:2 E5:4',
        'r:2 F5:1 F5:1 F5:2 E5:2 D5:2 E5:2 F5:4',
        'r:2 G5:1 G5:1 G5:2 F5:2 E5:2 F5:2 G5:4',
        'B5:4 A5:2 G5:2 D5:8',
        'r:2 E5:1 E5:1 E5:2 D5:2 C5:2 D5:2 E5:4',
        'r:2 F5:1 F5:1 F5:2 E5:2 D5:2 E5:2 F5:4',
        'r:2 G5:1 G5:1 G5:2 A5:2 B5:2 C6:2 D6:4',
        'B5:2 C6:2 D6:4 B5:4 G5:4',
      ],
      dr: 'four',
      bs: 'pulse',
      ky: 'stab',
      fill: true,
    },
    { k: 'pre', ch: 'Dm Am Dm E', mel: ['F5:4 E5:4 D5:4 F5:4', 'E5:4 C5:4 A4:4 C5:4', 'D5:4 F5:4 A5:4 D6:4', 'E6:4 D6:2 C6:2 B5:4 G#5:4'], dr: 'build', bs: 'pulse', ky: 'pad', riser: true },
    {
      k: 'chorus',
      ch: 'Am F C G Am F G Am',
      mel: ['A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'F5:2 A5:2 C6:2 A5:2 D6:4 C6:4', 'G5:2 G5:2 C6:4 G5:2 G5:2 E6:4', 'D6:2 C6:2 B5:2 C6:2 D6:8', 'A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'F6:2 E6:2 D6:2 C6:2 D6:4 C6:4', 'B5:2 C6:2 D6:2 E6:2 D6:4 B5:4', 'A5:12 r:4'],
      dr: 'chorus',
      bs: 'gallop',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
    },
    { k: 'break', ch: 'F G Am Am', dr: 'break', bs: 'gallop', ky: 'pad', arp: 16, fill: true },
    {
      k: 'verse',
      ch: 'Am F C G Am F C G',
      mel: [
        'r:2 E5:1 E5:1 E5:2 D5:2 C5:2 D5:2 E5:4',
        'r:2 F5:1 F5:1 F5:2 E5:2 D5:2 E5:2 F5:4',
        'r:2 G5:1 G5:1 G5:2 F5:2 E5:2 F5:2 G5:4',
        'B5:4 A5:2 G5:2 D5:8',
        'r:2 E5:1 E5:1 E5:2 D5:2 C5:2 D5:2 E5:4',
        'r:2 F5:1 F5:1 F5:2 E5:2 D5:2 E5:2 F5:4',
        'r:2 G5:1 G5:1 G5:2 A5:2 B5:2 C6:2 D6:4',
        'B5:2 C6:2 D6:4 B5:4 G5:4',
      ],
      dr: 'four',
      bs: 'pulse',
      ky: 'stab',
      fill: true,
    },
    { k: 'pre', ch: 'Dm Am Dm E', mel: ['F5:4 E5:4 D5:4 F5:4', 'E5:4 C5:4 A4:4 C5:4', 'D5:4 F5:4 A5:4 D6:4', 'E6:4 D6:2 C6:2 B5:4 G#5:4'], dr: 'build', bs: 'pulse', ky: 'pad', riser: true },
    {
      k: 'chorus',
      ch: 'Am F C G Am F G Am',
      mel: ['A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'F5:2 A5:2 C6:2 A5:2 D6:4 C6:4', 'G5:2 G5:2 C6:4 G5:2 G5:2 E6:4', 'D6:2 C6:2 B5:2 C6:2 D6:8', 'A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'F6:2 E6:2 D6:2 C6:2 D6:4 C6:4', 'B5:2 C6:2 D6:2 E6:2 D6:4 B5:4', 'A5:12 r:4'],
      dr: 'chorus',
      bs: 'gallop',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
    },
    {
      k: 'chorus',
      ch: 'Am F C G Am F G Am',
      mel: ['A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'F5:2 A5:2 C6:2 A5:2 D6:4 C6:4', 'G5:2 G5:2 C6:4 G5:2 G5:2 E6:4', 'D6:2 C6:2 B5:2 C6:2 D6:8', 'A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'F6:2 E6:2 D6:2 C6:2 D6:4 C6:4', 'B5:2 C6:2 D6:2 E6:2 D6:4 B5:4', 'A5:12 r:4'],
      dr: 'chorus',
      bs: 'gallop',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
    },
    { k: 'outro', ch: 'Am Am', mel: ['A5:2 A5:2 C6:4 A5:2 A5:2 E6:4', 'A5:16'], dr: 'outro', bs: 'gallop', ky: 'both', arp: 16 },
  ],
};

const KYCKLING: SongDef = {
  id: 'kyckling',
  name: 'Kycklingfunk',
  blurb: 'Lugn och funkig',
  bpm: 110,
  key: -3,
  voice: { lead: 'square', bass: 'square', fill: 'toms', back: 'both' },
  secs: [
    { k: 'count', ch: 'C', dr: 'count', bs: 'none', ky: 'none' },
    { k: 'intro', ch: 'C7 C7 F7 F7', dr: 'funk', bs: 'funk', ky: 'stab', fill: true },
    {
      k: 'verse',
      ch: 'C7 C7 F7 F7 C7 C7 G7 F7',
      mel: [
        'r:4 G5:2 A5:2 C6:3 A5:1 G5:4',
        'r:4 G5:2 A5:2 G5:2 E5:2 C5:4',
        'r:4 A5:2 C6:2 D6:3 C6:1 A5:4',
        'r:4 A5:2 G5:2 F5:2 D5:2 C5:4',
        'r:4 G5:2 A5:2 C6:3 A5:1 G5:4',
        'r:4 G5:2 A5:2 G5:2 E5:2 C5:4',
        'D6:3 D6:3 B5:2 D6:4 r:4',
        'C6:3 C6:3 A5:2 C6:4 r:4',
      ],
      dr: 'funk',
      bs: 'funk',
      ky: 'stab',
      fill: true,
    },
    { k: 'pre', ch: 'Dm Em F G', mel: ['F5:4 F5:4 E5:4 D5:4', 'G5:4 G5:4 B5:4 E5:4', 'A5:4 A5:4 C6:4 A5:4', 'B5:4 C6:4 D6:6 r:2'], dr: 'build', bs: 'pulse', ky: 'pad', riser: true },
    {
      k: 'chorus',
      ch: 'F C G Am F C G G',
      mel: ['A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'G5:2 G5:2 G5:2 E5:2 G5:4 C6:4', 'B5:2 B5:2 B5:2 A5:2 B5:4 D6:4', 'C6:4 B5:4 A5:8', 'A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'G5:2 G5:2 G5:2 E5:2 G5:4 C6:4', 'D6:4 B5:4 G5:4 A5:2 B5:2', 'G5:12 r:4'],
      dr: 'chorus',
      bs: 'octave',
      ky: 'both',
      arp: 8,
      crash: true,
      fill: true,
    },
    { k: 'break', ch: 'C7 C7 F7 G7', dr: 'break', bs: 'funk', ky: 'stab', arp: 16, fill: true },
    { k: 'verse', ch: 'C7 C7 F7 F7', mel: ['r:4 G5:2 A5:2 C6:3 A5:1 G5:4', 'r:4 G5:2 A5:2 G5:2 E5:2 C5:4', 'r:4 A5:2 C6:2 D6:3 C6:1 A5:4', 'r:4 A5:2 G5:2 F5:2 D5:2 C5:4'], dr: 'funk', bs: 'funk', ky: 'stab', fill: true },
    {
      k: 'chorus',
      ch: 'F C G Am F C G G',
      mel: ['A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'G5:2 G5:2 G5:2 E5:2 G5:4 C6:4', 'B5:2 B5:2 B5:2 A5:2 B5:4 D6:4', 'C6:4 B5:4 A5:8', 'A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'G5:2 G5:2 G5:2 E5:2 G5:4 C6:4', 'D6:4 B5:4 G5:4 A5:2 B5:2', 'G5:12 r:4'],
      dr: 'chorus',
      bs: 'octave',
      ky: 'both',
      arp: 8,
      crash: true,
      fill: true,
    },
    {
      k: 'chorus',
      ch: 'F C G Am F C G G',
      mel: ['A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'G5:2 G5:2 G5:2 E5:2 G5:4 C6:4', 'B5:2 B5:2 B5:2 A5:2 B5:4 D6:4', 'C6:4 B5:4 A5:8', 'A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'G5:2 G5:2 G5:2 E5:2 G5:4 C6:4', 'D6:4 B5:4 G5:4 A5:2 B5:2', 'G5:12 r:4'],
      dr: 'chorus',
      bs: 'octave',
      ky: 'both',
      arp: 16,
      crash: true,
      fill: true,
    },
    { k: 'outro', ch: 'C C', mel: ['A5:2 A5:2 A5:2 G5:2 A5:4 C6:4', 'C6:16'], dr: 'outro', bs: 'funk', ky: 'both', arp: 8 },
  ],
};

const DEFS: SongDef[] = [KYCKLING, LADUGARD, MIDNATT];

// ---------------------------------------------------------------- building

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const acc = (s: string | undefined): number => (s === '#' ? 1 : s === 'b' ? -1 : 0);

export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Dansbanan: bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]!]! + acc(m[2]);
}

export function parseChord(sym: string, tr: number): Chord {
  const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(sym);
  if (!m) throw new Error(`Dansbanan: bad chord ${sym}`);
  const root = (((PC[m[1]!]! + acc(m[2]) + tr) % 12) + 12) % 12;
  const minor = m[3] === 'm';
  const tones = [0, minor ? 3 : 4, 7];
  if (m[4]) tones.push(10);
  return { root, tones, minor };
}

/** The pitch with pitch class `pc` in [lo, lo + 12). */
export const near = (pc: number, lo: number): number => lo + ((((pc - lo) % 12) + 12) % 12);

/** The chord's notes inside [lo, lo + 12), lowest first. */
export function voicing(c: Chord, lo: number): number[] {
  return c.tones.map((t) => near(c.root + t, lo)).sort((a, b) => a - b);
}

type Hit = [step: number, inst: Inst, vel: number];

function drumBar(style: DrumStyle, b: number, bars: number, voice: Voice): Hit[] {
  const out: Hit[] = [];
  const four = (): void => {
    for (const s of [0, 4, 8, 12]) out.push([s, 'kick', s === 0 ? 1 : 0.9]);
  };
  const back = (): void => {
    out.push([4, 'clap', 0.85], [12, 'clap', 0.9]);
    if (voice.back === 'both') out.push([4, 'snare', 0.55], [12, 'snare', 0.6]);
  };
  const hats16 = (vol = 1): void => {
    for (let s = 0; s < 16; s++) out.push(s % 4 === 2 ? [s, 'ohat', 0.55 * vol] : [s, 'hat', (s % 2 ? 0.3 : 0.5) * vol]);
  };
  const hats8 = (vol = 1): void => {
    for (let s = 0; s < 16; s += 2) out.push(s % 4 === 2 ? [s, 'ohat', 0.5 * vol] : [s, 'hat', 0.42 * vol]);
  };
  switch (style) {
    case 'count':
      for (const s of [0, 4, 8, 12]) out.push([s, 'stick', s === 12 ? 1 : 0.85]);
      break;
    case 'intro':
      if (b < bars / 2) {
        out.push([0, 'kick', 0.95], [8, 'kick', 0.85]);
        hats8(0.8);
      } else {
        four();
        back();
        hats16(0.9);
      }
      break;
    case 'four':
      four();
      back();
      hats16();
      break;
    case 'funk':
      out.push([0, 'kick', 1], [6, 'kick', 0.75], [10, 'kick', 0.85]);
      back();
      for (let s = 0; s < 16; s++) out.push(s === 14 ? [s, 'ohat', 0.5] : [s, 'hat', s % 4 === 0 ? 0.5 : s % 2 ? 0.26 : 0.38]);
      break;
    case 'build':
      if (b < bars - 2) {
        four();
        back();
        hats8();
      } else if (b === bars - 2) {
        four();
        for (let s = 0; s < 16; s += 2) out.push([s, 'snare', 0.35 + s / 40]);
        hats8(0.7);
      } else {
        // a snare roll, then one beat of silence before the chorus lands
        for (const s of [0, 4, 8]) out.push([s, 'kick', 0.9]);
        for (let s = 0; s < 12; s++) out.push([s, 'snare', 0.42 + s / 22]);
      }
      break;
    case 'chorus':
      four();
      back();
      hats16();
      for (let s = 0; s < 16; s++) out.push([s, 'tamb', s % 2 ? 0.22 : 0.38]);
      break;
    case 'break':
      if (b < bars / 2) {
        out.push([0, 'kick', 1], [6, 'kick', 0.7], [10, 'kick', 0.85], [8, 'clap', 0.9]);
        hats8(0.8);
      } else {
        four();
        back();
        hats16();
      }
      break;
    case 'outro':
      if (b < bars - 1) {
        four();
        back();
        hats16();
        for (let s = 0; s < 16; s++) out.push([s, 'tamb', s % 2 ? 0.22 : 0.38]);
      } else out.push([0, 'kick', 1], [0, 'crash', 1], [0, 'boom', 1]);
      break;
  }
  return out;
}

function fillBar(hits: Hit[], voice: Voice): Hit[] {
  const out = hits.filter(([s, inst]) => s < 12 || inst === 'kick');
  if (voice.fill === 'toms') out.push([12, 'tomH', 0.8], [13, 'tomH', 0.7], [14, 'tomL', 0.85], [15, 'tomL', 0.95]);
  else out.push([12, 'snare', 0.55], [13, 'snare', 0.65], [14, 'snare', 0.75], [15, 'snare', 0.9]);
  return out;
}

const BASS: Record<BassStyle, [step: number, interval: number, len: number, vel: number][]> = {
  none: [],
  octave: [
    [0, 0, 2, 1],
    [2, 12, 2, 0.75],
    [4, 0, 2, 0.9],
    [6, 12, 2, 0.75],
    [8, 0, 2, 0.95],
    [10, 12, 2, 0.75],
    [12, 0, 2, 0.9],
    [14, 12, 2, 0.75],
  ],
  disco: [
    [0, 0, 3, 1],
    [3, 0, 1, 0.7],
    [4, 12, 2, 0.85],
    [6, 0, 2, 0.8],
    [8, 0, 3, 0.95],
    [11, 0, 1, 0.7],
    [12, 12, 2, 0.85],
    [14, 7, 2, 0.8],
  ],
  pulse: [
    [0, 0, 2, 1],
    [2, 0, 2, 0.7],
    [4, 0, 2, 0.85],
    [6, 0, 2, 0.7],
    [8, 0, 2, 0.95],
    [10, 0, 2, 0.7],
    [12, 0, 2, 0.85],
    [14, 0, 2, 0.7],
  ],
  gallop: [
    [0, 0, 1.5, 1],
    [2, 12, 1, 0.75],
    [3, 12, 1, 0.7],
    [4, 0, 1.5, 0.95],
    [6, 12, 1, 0.75],
    [7, 12, 1, 0.7],
    [8, 0, 1.5, 1],
    [10, 12, 1, 0.75],
    [11, 12, 1, 0.7],
    [12, 0, 1.5, 0.95],
    [14, 12, 1, 0.75],
    [15, 7, 1, 0.7],
  ],
  funk: [
    [0, 0, 2, 1],
    [3, 0, 1, 0.6],
    [4, 12, 1, 0.8],
    [6, 10, 2, 0.7],
    [8, 0, 2, 0.9],
    [10, 7, 1, 0.6],
    [11, 0, 1, 0.7],
    [12, 12, 2, 0.8],
    [14, 10, 2, 0.7],
  ],
  long: [[0, 0, 15, 0.9]],
};

/** Up and down over the chord's four notes. */
const ARP16 = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3];

function parseBar(src: string, where: string): [pitch: number | null, len: number][] {
  const out: [number | null, number][] = [];
  let sum = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const [n, l] = tok.split(':');
    const len = Number(l);
    if (!n || !Number.isFinite(len) || len <= 0) throw new Error(`Dansbanan: bad token ${tok} in ${where}`);
    out.push([n === 'r' ? null : midi(n), len]);
    sum += len;
  }
  if (sum !== 16) throw new Error(`Dansbanan: bar "${src}" in ${where} is ${sum} sixteenths long`);
  return out;
}

function build(def: SongDef): Song {
  const sps = 60 / def.bpm / 4;
  const events: Ev[] = [];
  const lead: LeadNote[] = [];
  const sections: Section[] = [];
  const add = (step: number, inst: Inst, p: number, len: number, v: number, fever = false): void => {
    events.push({ t: step * sps, step, inst, p, d: len * sps, v, ...(fever ? { fever: true } : {}) });
  };
  let bar = 0;
  def.secs.forEach((s, si) => {
    const tr = def.key + (s.tr ?? 0);
    const chordSyms = s.ch.trim().split(/\s+/);
    const bars = chordSyms.length;
    const chords = chordSyms.map((c) => parseChord(c, tr));
    if (s.mel && s.mel.length !== bars) throw new Error(`Dansbanan: ${def.id} section ${si} has ${s.mel.length} melody bars for ${bars} chords`);
    const step0 = bar * 16;
    for (let b = 0; b < bars; b++) {
      const base = (bar + b) * 16;
      const c = chords[b]!;
      const last = b === bars - 1;
      const ending = s.k === 'outro' && last;
      // the last beat before a chorus is left empty (only the riser and a melody pickup)
      const gap = s.k === 'pre' && last;
      // drums
      let hits = drumBar(s.dr, b, bars, def.voice);
      if (s.fill && last && !ending) hits = fillBar(hits, def.voice);
      if (s.crash && (b === 0 || b === 4)) hits.push([0, 'crash', b === 0 ? 0.95 : 0.7]);
      if (s.k === 'chorus' && b === 0) hits.push([0, 'boom', 0.8]);
      for (const [st, inst, v] of hits) add(base + st, inst, 0, 1, v);
      // bass
      const root = near(c.root, 36);
      if (ending) add(base, 'bass', root, 14, 1);
      else
        for (const [st, iv, len, v] of BASS[s.bs]) {
          if (gap && st >= 12) continue;
          add(base + st, 'bass', root + iv, len, v);
        }
      // keys
      const padNotes = voicing(c, 55);
      const stabNotes = voicing(c, 60);
      if (ending) {
        for (const p of [...padNotes, near(c.root, 67)]) add(base, 'pad', p, 14, 1);
        for (const p of stabNotes) add(base, 'stab', p, 2, 1);
      } else {
        if (s.ky === 'pad' || s.ky === 'both') for (const p of padNotes) add(base, 'pad', p, gap ? 12 : 16, s.ky === 'both' ? 0.75 : 1);
        if (s.ky === 'stab' || s.ky === 'both')
          for (const st of [2, 6, 10, 14]) {
            if (gap && st >= 12) continue;
            for (const p of stabNotes) add(base + st, 'stab', p, 1.5, st === 14 ? 0.8 : 0.7);
          }
      }
      // arpeggio
      if (s.arp && !ending) {
        const tones = voicing(c, 64);
        const four = [...tones, tones[0]! + 12];
        const stepBy = s.arp === 16 ? 1 : 2;
        for (let st = 0; st < 16; st += stepBy) {
          if (gap && st >= 12) continue;
          const i = s.arp === 16 ? ARP16[st]! : (st / 2) % 4;
          add(base + st, 'arp', four[i]!, stepBy * 0.9, st % 4 === 0 ? 0.85 : 0.6);
        }
      }
      // the Discofeber layer: a tambourine wherever there is none
      if (s.k !== 'count' && !ending && s.dr !== 'chorus' && s.dr !== 'outro')
        for (let st = 0; st < 16; st++) {
          if (gap && st >= 12) continue;
          add(base + st, 'tamb', 0, 1, st % 2 ? 0.22 : 0.38, true);
        }
      if (s.riser && b === bars - 2) add(base, 'riser', 0, 32, 0.9);
    }
    // the melody
    if (s.mel) {
      let st = step0;
      s.mel.forEach((src, b) => {
        for (const [p, len] of parseBar(src, `${def.id} section ${si} bar ${b}`)) {
          if (p !== null) {
            const pitch = p + tr;
            const gate = len >= 4 ? 0.94 : 0.86;
            add(st, 'lead', pitch, len * gate, 1);
            add(st, 'lead2', pitch + 12, len * gate, 0.55, true);
            lead.push({ step: st, len, p: pitch, t: st * sps, d: len * sps, sec: si });
          }
          st += len;
        }
      });
    }
    sections.push({ k: s.k, bar, bars, step0, step1: step0 + bars * 16, t0: step0 * sps, t1: (step0 + bars * 16) * sps, chords, melody: !!s.mel });
    bar += bars;
  });
  // the order of events at the same time does not matter to the synth, but keep it stable
  events.sort((a, b) => a.step - b.step);
  const order: Record<DrumHit['kind'], number> = { crash: 5, tomH: 4, tomL: 4, snare: 3, kick: 2 };
  const byStep = new Map<number, DrumHit['kind']>();
  for (const e of events) {
    if (e.fever) continue;
    const kind: DrumHit['kind'] | null = e.inst === 'kick' ? 'kick' : e.inst === 'clap' || e.inst === 'snare' ? 'snare' : e.inst === 'tomH' ? 'tomH' : e.inst === 'tomL' ? 'tomL' : e.inst === 'crash' ? 'crash' : null;
    if (!kind) continue;
    const had = byStep.get(e.step);
    if (!had || order[kind] > order[had]) byStep.set(e.step, kind);
  }
  const hits: DrumHit[] = [...byStep].map(([step, kind]) => ({ step, t: step * sps, kind })).sort((a, b) => a.step - b.step);
  const end = (bar - 1) * 16 * sps;
  const chorus = sections.find((s) => s.k === 'chorus')!;
  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    bpm: def.bpm,
    voice: def.voice,
    spb: sps * 4,
    sps,
    bars: bar,
    events,
    lead,
    hits,
    sections,
    end,
    length: end + 3.2,
    preview: [chorus.t0, chorus.t0 + Math.min(8, chorus.bars) * 16 * sps],
  };
}

let cache: Song[] | null = null;
/** Every song, built once. */
export function songs(): Song[] {
  if (!cache) cache = DEFS.map(build);
  return cache;
}

/** The section and the chord at a song time. */
export function sectionAt(song: Song, t: number): Section {
  const secs = song.sections;
  for (let i = secs.length - 1; i >= 0; i--) if (t >= secs[i]!.t0) return secs[i]!;
  return secs[0]!;
}

export function chordAt(song: Song, t: number): Chord {
  const s = sectionAt(song, t);
  const b = Math.max(0, Math.min(s.bars - 1, Math.floor((t - s.t0) / (song.sps * 16))));
  return s.chords[b]!;
}
