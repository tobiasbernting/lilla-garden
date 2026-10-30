// Hilda's own pixel font: capitals 5 × 7 (Å Ä Ö reach two pixels above the line), digits and a little
// punctuation. Rows are separated by '/', '#' is ink. `y` is the first row's place (0 = the top of a capital).
import type { Screen } from './gfx.ts';

interface Glyph {
  w: number;
  y: number;
  rows: string[];
}

const SRC: Record<string, [string, number?]> = {
  A: ['.###./#...#/#...#/#####/#...#/#...#/#...#'],
  B: ['####./#...#/#...#/####./#...#/#...#/####.'],
  C: ['.###./#...#/#..../#..../#..../#...#/.###.'],
  D: ['####./#...#/#...#/#...#/#...#/#...#/####.'],
  E: ['#####/#..../#..../####./#..../#..../#####'],
  F: ['#####/#..../#..../####./#..../#..../#....'],
  G: ['.###./#...#/#..../#.###/#...#/#...#/.####'],
  H: ['#...#/#...#/#...#/#####/#...#/#...#/#...#'],
  I: ['###/.#./.#./.#./.#./.#./###'],
  J: ['..###/...#./...#./...#./...#./#..#./.##..'],
  K: ['#...#/#..#./#.#../##.../#.#../#..#./#...#'],
  L: ['#..../#..../#..../#..../#..../#..../#####'],
  M: ['#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#'],
  N: ['#...#/##..#/##..#/#.#.#/#..##/#..##/#...#'],
  O: ['.###./#...#/#...#/#...#/#...#/#...#/.###.'],
  P: ['####./#...#/#...#/####./#..../#..../#....'],
  Q: ['.###./#...#/#...#/#...#/#.#.#/#..#./.##.#'],
  R: ['####./#...#/#...#/####./#.#../#..#./#...#'],
  S: ['.####/#..../#..../.###./....#/....#/####.'],
  T: ['#####/..#../..#../..#../..#../..#../..#..'],
  U: ['#...#/#...#/#...#/#...#/#...#/#...#/.###.'],
  V: ['#...#/#...#/#...#/#...#/#...#/.#.#./..#..'],
  W: ['#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#'],
  X: ['#...#/#...#/.#.#./..#../.#.#./#...#/#...#'],
  Y: ['#...#/#...#/.#.#./..#../..#../..#../..#..'],
  Z: ['#####/....#/...#./..#../.#.../#..../#####'],
  Å: ['..#../.#.#./..#../.#.#./#...#/#####/#...#/#...#/#...#', -2],
  Ä: ['.#.#./...../.###./#...#/#...#/#####/#...#/#...#/#...#', -2],
  Ö: ['.#.#./...../.###./#...#/#...#/#...#/#...#/#...#/.###.', -2],
  É: ['...#./..#../#####/#..../#..../####./#..../#..../#####', -2],
  '0': ['.###./#...#/#..##/#.#.#/##..#/#...#/.###.'],
  '1': ['.#./##./.#./.#./.#./.#./###'],
  '2': ['.###./#...#/....#/...#./..#../.#.../#####'],
  '3': ['####./....#/....#/.###./....#/....#/####.'],
  '4': ['...#./..##./.#.#./#..#./#####/...#./...#.'],
  '5': ['#####/#..../####./....#/....#/#...#/.###.'],
  '6': ['..##./.#.../#..../####./#...#/#...#/.###.'],
  '7': ['#####/....#/...#./..#../.#.../.#.../.#...'],
  '8': ['.###./#...#/#...#/.###./#...#/#...#/.###.'],
  '9': ['.###./#...#/#...#/.####/....#/...#./.##..'],
  '.': ['#', 6],
  ',': ['.#/#.', 6],
  '!': ['#/#/#/#/#/./#', 0],
  '?': ['.###./#...#/....#/...#./..#../...../..#..', 0],
  ':': ['#/./././#', 1],
  '-': ['###', 3],
  '+': ['.#./###/.#.', 2],
  '×': ['#.#/.#./#.#', 2],
  '/': ['....#/...#./...#./..#../.#.../.#.../#....', 0],
  '(': ['.#/#./#./#./#./#./.#', 0],
  ')': ['#./.#/.#/.#/.#/.#/#.', 0],
  "'": ['#/#', 0],
  '"': ['#.#/#.#', 0],
  '%': ['##..#/##.#./...#./..#../.#.../.#.##/#..##', 0],
  '·': ['#', 3],
  '=': ['###/.../###', 2],
  '>': ['#../.#./..#/.#./#..', 1],
  '<': ['..#/.#./#../.#./..#', 1],
};

const GLYPHS = new Map<string, Glyph>();
for (const [ch, [src, y]] of Object.entries(SRC)) {
  const rows = src.split('/');
  GLYPHS.set(ch, { w: rows[0]!.length, y: y ?? 7 - rows.length, rows });
}
const SPACE = 3;

const glyph = (ch: string): Glyph | null => GLYPHS.get(ch) ?? GLYPHS.get(ch.toUpperCase()) ?? null;

/** Width in pixels of a line of text at scale 1. */
export function textWidth(str: string, scale = 1): number {
  let w = 0;
  for (const ch of str) w += ((glyph(ch)?.w ?? SPACE) + 1) * scale;
  return Math.max(0, w - scale);
}

function ink(s: Screen, str: string, x: number, y: number, c: number, scale: number): void {
  let cx = Math.round(x);
  y = Math.round(y);
  for (const ch of str) {
    const g = glyph(ch);
    if (!g) {
      cx += (SPACE + 1) * scale;
      continue;
    }
    for (let j = 0; j < g.rows.length; j++) {
      const row = g.rows[j]!;
      for (let i = 0; i < row.length; i++) {
        if (row.charCodeAt(i) !== 35) continue;
        if (scale === 1) s.px(cx + i, y + g.y + j, c);
        else s.rect(cx + i * scale, y + (g.y + j) * scale, scale, scale, c);
      }
    }
    cx += (g.w + 1) * scale;
  }
}

export interface TextOpts {
  /** A one-pixel border all round in this shade, so text reads on any background. */
  outline?: number;
  /** A drop shadow down and right in this shade. */
  shadow?: number;
  scale?: number;
  /** 'left' (default), 'center' or 'right' of x. */
  align?: 'left' | 'center' | 'right';
}

/** Draw a line of text; y is the top of the capitals. Returns the width. */
export function text(s: Screen, str: string, x: number, y: number, c: number, o: TextOpts = {}): number {
  const scale = o.scale ?? 1;
  const w = textWidth(str, scale);
  if (o.align === 'center') x -= Math.floor(w / 2);
  else if (o.align === 'right') x -= w;
  if (o.outline !== undefined) {
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      ink(s, str, x + dx, y + dy, o.outline, scale);
  }
  if (o.shadow !== undefined) ink(s, str, x + scale, y + scale, o.shadow, scale);
  ink(s, str, x, y, c, scale);
  return w;
}
