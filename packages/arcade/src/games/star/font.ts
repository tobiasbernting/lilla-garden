// A small stroke font in the old vector-display style: every glyph is a few straight lines on a
// 4 × 6 grid (y down). Uppercase only, with Å Ä Ö. Points are two characters: 0–9 are whole grid
// steps and a–f are half steps (a = 0.5 … f = 5.5).

const RAW: Record<string, string> = {
  A: '06 02 20 42 46|04 44',
  B: '06 00 30 41 42 33 03|33 44 45 36 06',
  C: '41 30 10 01 05 16 36 45',
  D: '00 06 26 44 42 20 00',
  E: '40 00 06 46|03 33',
  F: '40 00 06|03 33',
  G: '41 30 10 01 05 16 36 45 43 23',
  H: '00 06|40 46|03 43',
  I: '10 30|20 26|16 36',
  J: '40 45 36 16 05',
  K: '00 06|40 03 46',
  L: '00 06 46',
  M: '06 00 23 40 46',
  N: '06 00 46 40',
  O: '10 30 41 45 36 16 05 01 10',
  P: '06 00 30 41 42 33 03',
  Q: '10 30 41 45 36 16 05 01 10|34 46',
  R: '06 00 30 41 42 33 03|23 46',
  S: '41 30 10 01 02 13 33 44 45 36 16 05',
  T: '00 40|20 26',
  U: '00 05 16 36 45 40',
  V: '00 26 40',
  W: '00 16 23 36 40',
  X: '00 46|40 06',
  Y: '00 23 40|23 26',
  Z: '00 40 06 46',
  '0': '10 30 d1 d5 36 16 a5 a1 10',
  '1': '11 20 26|16 36',
  '2': '01 10 30 41 42 06 46',
  '3': '01 10 30 41 42 33 13|33 44 45 36 16 05',
  '4': '36 30 04 44',
  '5': '40 00 02 32 43 45 36 06',
  '6': '41 30 10 01 05 16 36 45 43 32 02',
  '7': '00 40 41 16',
  '8': '10 30 41 42 33 13 02 01 10|13 04 05 16 36 45 44 33',
  '9': '43 34 14 03 01 10 30 41 45 36 06',
  '.': '2f 26',
  ',': '25 16',
  '!': '20 24|2f 26',
  '?': '01 10 30 41 42 23 24|2f 26',
  ':': '21 22|24 25',
  '-': '13 33',
  '+': '13 33|22 24',
  '×': '12 34|32 14',
  '/': '06 40',
  '·': '2c 2d',
  "'": '20 21',
  '(': '30 12 14 36',
  ')': '10 32 34 16',
};

/** Accents drawn above a base glyph. */
const MARKS: Record<string, { base: string; mark: 'ring' | 'dots' | 'acute' }> = {
  Å: { base: 'A', mark: 'ring' },
  Ä: { base: 'A', mark: 'dots' },
  Ö: { base: 'O', mark: 'dots' },
  É: { base: 'E', mark: 'acute' },
  Ü: { base: 'U', mark: 'dots' },
};

const NARROW = new Set(['.', ',', '!', ':', "'", '·']);

export interface Glyph {
  /** Polylines as flat x,y lists in grid units. */
  strokes: number[][];
  /** Grid units to the next glyph. */
  adv: number;
  /** Shift of the drawing inside its cell. */
  dx: number;
}

const val = (c: string): number => {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  return code - 97 + 0.5; // a..f
};

function parse(src: string): number[][] {
  return src.split('|').map((s) =>
    s
      .trim()
      .split(/\s+/)
      .flatMap((tok) => [val(tok[0]!), val(tok[1]!)]),
  );
}

const GLYPHS = new Map<string, Glyph>();
for (const [ch, src] of Object.entries(RAW)) {
  const narrow = NARROW.has(ch);
  GLYPHS.set(ch, { strokes: parse(src), adv: narrow ? 3 : 5.6, dx: narrow ? -1 : 0 });
}
const ringPts = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push(2 + Math.cos(a) * 0.75, -1.35 + Math.sin(a) * 0.65);
  }
  return out;
};
for (const [ch, { base, mark }] of Object.entries(MARKS)) {
  const b = GLYPHS.get(base)!;
  const extra =
    mark === 'ring'
      ? [ringPts()]
      : mark === 'dots'
        ? [
            [1, -1.7, 1, -0.8],
            [3, -1.7, 3, -0.8],
          ]
        : [[1.5, -0.6, 3, -1.8]];
  GLYPHS.set(ch, { strokes: [...b.strokes, ...extra], adv: b.adv, dx: 0 });
}
const SPACE: Glyph = { strokes: [], adv: 3.6, dx: 0 };

export function glyph(ch: string): Glyph {
  if (ch === ' ') return SPACE;
  return GLYPHS.get(ch) ?? GLYPHS.get(ch.toUpperCase()) ?? GLYPHS.get('?')!;
}

/** Width of a line of text in grid units (cap height is 6 units). */
export function measureUnits(text: string): number {
  let w = 0;
  for (const ch of text.toUpperCase()) w += glyph(ch).adv;
  // no gap after the last glyph
  return Math.max(0, w - 1.6);
}
