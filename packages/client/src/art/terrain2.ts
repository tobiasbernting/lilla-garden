// Ground of the wider world: cliffs (grey rock, red sandstone, black basalt), lava, ash, mud, bog water,
// moss, red sand, candy, chocolate, moon dust and the starry sky around the moon.
//
// Every tile is painted pixel by pixel into a 16×16 buffer. Grounds with edges come in 16 versions, one per
// neighbour mask (1 up, 2 right, 4 down, 8 left = that side borders other ground), and an edge always sits at
// the same place where two tiles meet, so shores, rims and cliff faces run on from tile to tile. Light comes
// from the top left. Each ground has a few variants, picked per tile with hash2, so nothing looks tiled.
import { isCliff, type Terrain } from '@lilla-garden/shared';
import { Px, hash2, hexToRgb, rgbToHex, shade } from './px.js';
import { CARPET_TILES, carpetTiles } from './arcade.ts';
import { cryptTiles, forgeTiles } from './saga.ts';

export interface BiomeTerrain {
  /** Tile index for one of the wider world's grounds, or null for any other ground. */
  index(t: Terrain, x: number, y: number, snowy: boolean, mask: number, frame: number): number | null;
}

/**
 * Which neighbours count as the same ground when a tile picks its edges (mask bits: 1 up, 2 right,
 * 4 down, 8 left = that side borders other ground). Null: the tile has no edges.
 */
export function edgeGroup(t: Terrain): ((n: Terrain | undefined) => boolean) | null {
  switch (t) {
    case 'water':
      return (n) => n === 'water' || n === undefined;
    case 'pool':
      return (n) => n === 'pool';
    case 'soil':
    case 'soil_wet':
      return (n) => n === 'soil' || n === 'soil_wet' || n === undefined;
    case 'road':
    case 'crossing':
      return (n) => n === 'road' || n === 'crossing';
    case 'bog':
    case 'lava':
    case 'choco':
      return (n) => n === t || n === undefined;
    case 'rock':
    case 'sandstone':
    case 'basalt':
      return (n) => n === undefined || isCliff(n);
    case 'moon':
      return (n) => n !== 'space';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

type Rnd = () => number;
type Shape = (x: number, y: number) => boolean;

/** Seeded random numbers (mulberry32), so the tiles come out the same every boot. */
function rng(...seeds: number[]): Rnd {
  let s = seeds.reduce((h, n) => Math.imul(h ^ (n | 0), 0x9e3779b1) >>> 0, 0x2545f491);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: Rnd, a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
const pickOf = <T>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const rgbCache = new Map<string, readonly [number, number, number]>();
const rgbOf = (c: string): readonly [number, number, number] => {
  let v = rgbCache.get(c);
  if (!v) rgbCache.set(c, (v = hexToRgb(c)));
  return v;
};
/** The colour part way (k = 0..1) from a to b. */
const mix = (a: string, b: string, k: number): string => {
  const [r0, g0, b0] = rgbOf(a);
  const [r1, g1, b1] = rgbOf(b);
  return rgbToHex(r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k);
};
/** Picks from xs by a 0..999 hash, each entry as likely as its weight. */
const weighted = <T>(xs: readonly T[], ws: readonly number[], h: number): T => {
  const total = ws.reduce((a, b) => a + b, 0);
  let k = h % total;
  for (let i = 0; i < xs.length; i++) {
    k -= ws[i] ?? 1;
    if (k < 0) return xs[i]!;
  }
  return xs[0]!;
};

/** A 16×16 tile being painted. Pixels outside it are ignored. */
class Tile {
  private readonly d = new Uint8ClampedArray(16 * 16 * 4);

  constructor(base: string) {
    this.rect(0, 0, 16, 16, base);
  }

  set(x: number, y: number, c: string): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x > 15 || y > 15) return this;
    const [r, g, b] = rgbOf(c);
    const i = (y * 16 + x) * 4;
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = 255;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    return this;
  }

  toPx(): Px {
    const p = new Px(16, 16);
    p.ctx.putImageData(new ImageData(this.d, 16, 16), 0, 0);
    return p;
  }
}

/** A few pixels at random places in a box. */
function specks(t: Tile, r: Rnd, n: number, c: string, x0 = 1, y0 = 1, x1 = 14, y1 = 14): void {
  for (let i = 0; i < n; i++) t.set(int(r, x0, x1), int(r, y0, y1), c);
}

/** The ellipse in the box (x0, y0, w, h), as a pixel test. */
const ellipse =
  (x0: number, y0: number, w: number, h: number, slack = 1): Shape =>
  (x, y) => {
    const dx = (x + 0.5 - x0 - w / 2) / (w / 2);
    const dy = (y + 0.5 - y0 - h / 2) / (h / 2);
    return dx * dx + dy * dy <= slack;
  };

/** An angular facet: the box (x0, y0, w, h) with its corners cut off by 0–2 px. */
function facet(r: Rnd, x0: number, y0: number, w: number, h: number): Shape {
  const c = [int(r, 0, 2), int(r, 0, 2), int(r, 0, 2), int(r, 0, 2)];
  return (x, y) => {
    const dx = x - x0;
    const dy = y - y0;
    if (dx < 0 || dy < 0 || dx >= w || dy >= h) return false;
    const ex = w - 1 - dx;
    const ey = h - 1 - dy;
    return dx + dy >= c[0]! && ex + dy >= c[1]! && dx + ey >= c[2]! && ex + ey >= c[3]!;
  };
}

/** Fills a shape inside the box around (x0, y0)–(x1, y1). */
function fill(t: Tile, s: Shape, x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (s(x, y)) t.set(x, y, c);
}

/** A soft irregular patch of another tone (three overlapping ellipses), kept off the tile's edges. */
function blotch(t: Tile, r: Rnd, w: number, h: number, c: string): void {
  const x0 = int(r, 1, 15 - w);
  const y0 = int(r, 1, 15 - h);
  const parts = [ellipse(x0, y0 + 1, w, h - 1), ellipse(x0 + int(r, 0, 2), y0, w - 2, h - 1), ellipse(x0 + int(r, 1, 3), y0 + int(r, 0, 1), w - 3, h)];
  fill(t, (x, y) => x >= 1 && y >= 1 && x <= 14 && y <= 14 && parts.some((s) => s(x, y)), 0, 0, 15, 15, c);
}

/** A thin crack running mostly across, its lower lip catching the light. */
function hairline(t: Tile, r: Rnd, x: number, y: number, len: number, c: string, lit?: string): void {
  for (let i = 0; i < len && x <= 14; i++, x++) {
    t.set(x, y, c);
    if (lit) t.set(x, y + 1, lit);
    if (r() < 0.3) y = clamp(y + (r() < 0.5 ? -1 : 1), 1, 13);
  }
}

/** A dry crack wandering across the ground, with a short branch off it. */
function fissure(t: Tile, r: Rnd, x: number, y: number, len: number, c: string): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < len && x <= 14 && y >= 1 && y <= 14; i++) {
    t.set(x, y, c);
    pts.push([x, y]);
    if (r() < 0.5) y += r() < 0.5 ? -1 : 1;
    else x++;
    if (r() < 0.6) x++;
  }
  const at = pts[pts.length >> 1];
  if (at) for (let i = 1; i <= 2; i++) t.set(at[0] + (i >> 1), at[1] + i, c);
}

/** Tiny bumps (lit above, shaded below) and pits (shaded above, lit below) that make a surface look rough. */
function grain(t: Tile, r: Rnd, n: number, hi: string, lo: string): void {
  for (let i = 0; i < n; i++) {
    const x = int(r, 1, 14);
    const y = int(r, 1, 13);
    if (r() < 0.6) t.set(x, y, hi).set(x, y + 1, lo);
    else t.set(x, y, lo).set(x, y + 1, hi);
  }
}

/** 16 offsets along a tile edge: 0 at both ends (so neighbouring tiles' edges meet), up to ±amp in between. */
function wobble(r: Rnd, amp: number): number[] {
  const k = [0, (r() * 2 - 1) * amp, (r() * 2 - 1) * amp, (r() * 2 - 1) * amp, 0];
  return Array.from({ length: 16 }, (_, x) => {
    const p = (x + 0.5) / 4;
    const i = Math.min(3, Math.floor(p));
    const f = p - i;
    const s = f * f * (3 - 2 * f);
    return k[i]! * (1 - s) + k[i + 1]! * s;
  });
}

/** Little drips along an edge, round at the end: how much further the edge reaches, per pixel (0 at the ends). */
function drips(r: Rnd, n: number): number[] {
  const out = new Array<number>(16).fill(0);
  const at: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = int(r, 3, 12) + (r() < 0.5 ? 0.5 : 0);
    if (at.some((a) => Math.abs(a - c) < 8)) continue;
    at.push(c);
    const w = r() < 0.5 ? 1.4 : 1.9;
    const len = 1.6 + r() * 1.4;
    for (let x = 0; x < 16; x++) {
      const k = Math.abs(x + 0.5 - c) / w;
      if (k < 1) out[x] = Math.max(out[x]!, len * Math.sqrt(1 - k ** 4));
    }
  }
  return out;
}

const SIDES = [1, 2, 4, 8] as const;

/**
 * Signed distance (px) from a pixel to the line where a masked tile's own ground ends: positive inside, negative
 * in the band along an open side. `depth(i, along)` is how far in from side SIDES[i] the line runs; where two
 * neighbouring sides are open the corner is rounded with radius `round`. `side` is the nearest open side.
 */
function edgeDist(x: number, y: number, mask: number, depth: (i: number, along: number) => number, round: number): { d: number; side: number } {
  const e = [Infinity, Infinity, Infinity, Infinity];
  let d = Infinity;
  let side = 0;
  for (let i = 0; i < 4; i++) {
    const s = SIDES[i]!;
    if (!(mask & s)) continue;
    const dist = s === 1 ? y + 0.5 : s === 2 ? 15.5 - x : s === 4 ? 15.5 - y : x + 0.5;
    e[i] = dist - depth(i, s === 1 || s === 4 ? x : y);
    if (e[i]! < d) {
      d = e[i]!;
      side = s;
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = e[i]!;
    const b = e[(i + 1) % 4]!;
    if (a < round && b < round) d = Math.min(d, round - Math.hypot(round - a, round - b));
  }
  return { d, side };
}

/** Calls `f` for every pixel of a masked tile with its distance to the edge line (see edgeDist). */
function eachEdge(mask: number, depth: (i: number, along: number) => number, round: number, f: (x: number, y: number, d: number, side: number) => void): void {
  if (!mask) return;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const { d, side } = edgeDist(x, y, mask, depth, round);
      f(x, y, d, side);
    }
}

/** A fixed scatter of pixels (about one in n) for textures in bands. */
const sprinkle = (x: number, y: number, n: number, salt = 0): boolean => hash2(x + salt * 17, y + salt * 31) % n === 0;

// ---------------------------------------------------------------------------
// Cliffs: grey rock, red sandstone, black basalt
//
// A cliff mass shows its rough top, seen from above. Where it ends towards open ground below (mask & 4) the
// lower half of the tile is the vertical face under a lit lip, so the cliff reads as raised. A top edge gets a
// lighter crumbly rim, the left edge a lit rim, the right edge a shaded one, and a dark line where the cliff
// meets open ground.
// ---------------------------------------------------------------------------

interface CliffPal {
  /** The dark line where the cliff meets open ground. */
  out: string;
  /** The rough top surface. */
  top: string;
  topL: string;
  topH: string;
  topD: string;
  crack: string;
  /** The crumbly rim along a top edge and the lip over a face. */
  rim: string;
  /** The vertical face: lit, mid, shaded, and the dark foot where it meets the ground. */
  faceL: string;
  face: string;
  faceD: string;
  foot: string;
}

const ROCK: CliffPal = {
  out: '#3a3a42',
  top: '#8b8c93',
  topL: '#97989f',
  topH: '#afb0b6',
  topD: '#77787f',
  crack: '#606169',
  rim: '#c9cace',
  faceL: '#787981',
  face: '#62636b',
  faceD: '#4d4e56',
  foot: '#2e2e35',
};
const ROCK_SNOW: CliffPal = { ...ROCK, out: '#58616f', top: '#f1f4f9', topL: '#f8fafd', topH: '#ffffff', topD: '#d5dde8', crack: '#b3bfcf', rim: '#ffffff' };
const SANDSTONE: CliffPal = {
  out: '#4e2318',
  top: '#c8703f',
  topL: '#d07a47',
  topH: '#e39a62',
  topD: '#b25e35',
  crack: '#8e4527',
  rim: '#f2b57c',
  faceL: '#c66a3d',
  face: '#a64f2c',
  faceD: '#883b21',
  foot: '#4f2116',
};
const BASALT: CliffPal = {
  out: '#110f14',
  top: '#3c3a42',
  topL: '#46444d',
  topH: '#57555f',
  topD: '#302e36',
  crack: '#211f26',
  rim: '#6e6b78',
  faceL: '#3d3b45',
  face: '#2c2a32',
  faceD: '#1d1b21',
  foot: '#0e0c10',
};
const EMBER = { d: '#8e2614', m: '#e8501c', h: '#ffb04a' };
const SNOW = { base: '#eef2f8', light: '#ffffff', shade: '#d6deea', deep: '#c0cbda' };
const ICE = { light: '#e4f2fc', deep: '#b9d9f0' };

type CliffKind = 'rock' | 'sandstone' | 'basalt';

/** Splits a tile's width into folds 3–6 px wide that fill it exactly. */
function folds(r: Rnd): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x < 16; ) {
    let w = int(r, 3, 6);
    if (16 - (x + w) < 3) w = 16 - x;
    out.push([x, x + w]);
    x += w;
  }
  return out;
}

/** A slab of harder rock standing a little proud of a cliff top: lit along its top edge, a soft shadow below. */
function slab(t: Tile, r: Rnd, p: CliffPal, wMin: number, wMax: number): void {
  const w = int(r, wMin, wMax);
  const h = int(r, 3, 4);
  const x0 = int(r, 2, 13 - w);
  const y0 = int(r, 2, 12 - h);
  const s = facet(r, x0, y0, w, h);
  for (let y = y0; y <= y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (s(x, y)) t.set(x, y, s(x, y - 1) ? p.topL : p.topH);
      else if (s(x, y - 1)) t.set(x, y, p.topD);
    }
}

/** A loose stone lying on a cliff top. */
function stone(t: Tile, r: Rnd, p: CliffPal): void {
  const x = int(r, 3, 12);
  const y = int(r, 3, 11);
  t.set(x, y, p.topH).set(x + 1, y, p.topL).set(x, y + 1, p.topD).set(x + 1, y + 1, p.topD);
}

/** Variant 0 is plain, 1 has a little more going on, 2 something special (picked least often). */
function rockTop(t: Tile, p: CliffPal, r: Rnd, v: number): void {
  if (v === 1) blotch(t, r, int(r, 5, 8), int(r, 4, 5), mix(p.top, p.topL, 0.7));
  specks(t, r, 2, p.topD);
  specks(t, r, 2, p.topL);
  grain(t, r, int(r, 4, 6), p.topL, p.topD);
  if (v === 2) slab(t, r, p, 4, 7);
  if (v === 1 || r() < 0.3) stone(t, r, p);
  if (v === 2 || r() < 0.3) hairline(t, r, int(r, 2, 9), int(r, 3, 12), int(r, 3, 5), p.crack, p.topL);
}

function sandstoneTop(t: Tile, p: CliffPal, r: Rnd, v: number): void {
  if (v === 1) blotch(t, r, int(r, 5, 8), int(r, 4, 5), p.topL);
  specks(t, r, 2, p.topD);
  specks(t, r, 4, p.topH);
  grain(t, r, int(r, 3, 4), p.topL, p.topD);
  if (v === 2) slab(t, r, p, 5, 8);
  if (v !== 0 && r() < 0.5) hairline(t, r, int(r, 2, 8), int(r, 3, 12), int(r, 4, 6), p.crack, p.topH);
}

// The tops of basalt columns: a honeycomb whose pattern repeats every 8 px, so it runs on across tiles.
const HONEYCOMB = (() => {
  const centres: [number, number][] = [];
  for (let gy = -1; gy <= 2; gy++) for (let gx = -1; gx <= 2; gx++) centres.push([gx * 8 + (gy & 1 ? 0 : 4), gy * 8 + 4]);
  const joint: boolean[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = centres.map(([cx, cy]) => Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15)).sort((a, b) => a - b);
      joint.push(d[1]! - d[0]! < 0.9);
    }
  return (x: number, y: number) => joint[(y & 15) * 16 + (x & 15)]!;
})();

function basaltTop(t: Tile, p: CliffPal, r: Rnd, v: number, ember: boolean): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (HONEYCOMB(x, y)) t.set(x, y, p.topD);
      else if (HONEYCOMB(x, y - 1)) t.set(x, y, p.topL);
    }
  specks(t, r, 3, p.topD, 2, 2, 13, 13);
  specks(t, r, 3, p.topL, 2, 2, 13, 13);
  if (v === 1) stone(t, r, p);
  if (ember) {
    // a joint glowing from below
    const cx = int(r, 4, 11);
    const cy = int(r, 4, 11);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const k = Math.hypot(x - cx, y - cy);
        if (HONEYCOMB(x, y) && k < 3.2) t.set(x, y, k < 1.5 ? EMBER.m : EMBER.d);
      }
  }
}

function snowTop(t: Tile, r: Rnd, v: number): void {
  specks(t, r, 3, SNOW.shade);
  specks(t, r, 3, SNOW.light);
  if (v === 1) {
    // a soft drift: lit on top, a blue shadow on its lee side
    const x = int(r, 2, 9);
    const y = int(r, 4, 12);
    const w = int(r, 4, 5);
    t.rect(x + 1, y - 1, w - 2, 1, SNOW.light).rect(x, y, w, 1, SNOW.shade);
  }
  if (v === 2) {
    // a rock poking out of the snow
    const x = int(r, 3, 11);
    const y = int(r, 3, 10);
    t.rect(x, y, 3, 1, SNOW.light).set(x, y + 1, ROCK.topL).set(x + 1, y + 1, ROCK.top).set(x + 2, y + 1, ROCK.topD);
    t.rect(x, y + 2, 3, 1, SNOW.deep);
  }
}

/** The crumbly rim along a cliff's top edge: one or two rows of lit stone, a broken shadow under it. */
function topRim(t: Tile, p: CliffPal, r: Rnd): void {
  const thick = wobble(r, 0.9);
  for (let x = 0; x < 16; x++) {
    const deep = 1 + Math.round(thick[x]! + 0.5);
    t.set(x, 1, p.rim);
    for (let y = 2; y <= deep; y++) t.set(x, y, p.topH);
    if (r() < 0.75) t.set(x, deep + 1, p.topD);
  }
  for (let i = int(r, 0, 2); i > 0; i--) t.set(int(r, 2, 13), 1, p.topH);
}

/** The lit left edge and the shaded right edge of a cliff top, uneven like the top rim. */
function sideRims(t: Tile, p: CliffPal, r: Rnd, left: boolean, right: boolean): void {
  const thickL = wobble(r, 0.9);
  const thickR = wobble(r, 0.9);
  for (let y = 0; y < 16; y++) {
    if (left) {
      t.set(1, y, p.rim);
      if (thickL[y]! > -0.3) t.set(2, y, p.topH);
    }
    if (right) {
      t.set(14, y, p.topD);
      if (thickR[y]! > 0.2) t.set(13, y, p.topD);
    }
  }
}

/** Grey rock face: rounded folds of rock, lit on their left, dark crevices between them and at the foot. */
function rockFace(t: Tile, p: CliffPal, r: Rnd, ft: number[], snowy: boolean): void {
  for (const [x0, x1] of folds(r)) {
    const w = x1 - x0;
    const sunk = r() < 0.4; // sits back under the lip, in its shadow
    const broken = r() < 0.35 ? int(r, 11, 12) : 0; // broken across, a ledge on the lower part
    for (let x = x0; x < x1; x++) {
      const u = (x - x0 + 0.5) / w;
      const top = ft[x]!;
      const crevice = x === x1 - 1 && x1 < 16;
      const rounded = x === x0 || x === x1 - 1;
      t.set(x, top - 1, p.rim);
      for (let y = top; y < 16; y++) {
        let c = u < 0.3 ? p.faceL : u > 0.7 ? p.faceD : p.face;
        if (sunk && y === top) c = p.faceD;
        if (broken && !crevice && y === broken) c = p.faceD;
        if (broken && !crevice && y === broken + 1) c = p.faceL;
        if (crevice) c = y >= 12 ? p.foot : p.faceD;
        if (y === 15 || (y === 14 && rounded)) c = p.foot;
        t.set(x, y, c);
      }
    }
  }
}

/** Sandstone face: horizontal strata that run on from tile to tile, the rock bulging in soft folds. */
function sandstoneFace(t: Tile, p: CliffPal, r: Rnd, ft: number[]): void {
  const s1 = wobble(r, 0.7);
  const s2 = wobble(r, 0.7);
  const lightBand = '#c8703f';
  const thinBand = '#b45a33';
  const darkBand = '#8e3e23';
  for (const [x0, x1] of folds(r)) {
    const w = x1 - x0;
    for (let x = x0; x < x1; x++) {
      const u = (x - x0 + 0.5) / w;
      const k = u < 0.3 ? 1.08 : u > 0.72 ? 0.88 : 1;
      const a = 10 + Math.round(s1[x]!);
      const b = 13 + Math.round(s2[x]!);
      t.set(x, ft[x]! - 1, p.rim);
      for (let y = ft[x]!; y < 16; y++) {
        const c = y === 15 ? p.foot : y < a ? lightBand : y === a ? p.faceD : y < b ? p.face : y === b ? thinBand : darkBand;
        t.set(x, y, y === 15 || k === 1 ? c : shade(c, k));
      }
    }
  }
  if (r() < 0.6) {
    // an erosion groove
    const x = int(r, 2, 12);
    for (let y = int(r, 10, 11); y <= 14; y++) t.set(x, y, p.faceD).set(x + 1, y, p.faceL);
  }
}

/** Basalt face: tall columns with dark joints, now and then an ember glowing in a joint. */
function basaltFace(t: Tile, p: CliffPal, r: Rnd, ft: number[], ember: boolean): void {
  const joints = [int(r, 2, 3)];
  while (joints[joints.length - 1]! < 10) joints.push(joints[joints.length - 1]! + int(r, 3, 5));
  for (let x = 0; x < 16; x++) {
    const j = joints.includes(x);
    const lit = joints.includes(x - 1);
    t.set(x, ft[x]! - 1, j ? p.faceL : p.rim);
    for (let y = ft[x]!; y < 16; y++) t.set(x, y, y === 15 ? p.foot : j ? p.faceD : lit || y === ft[x] ? p.faceL : p.face);
  }
  // a cross joint in a column, now and then
  for (let i = int(r, 0, 1); i > 0; i--) {
    const k = int(r, 0, joints.length);
    const x0 = k === 0 ? 0 : joints[k - 1]! + 1;
    const x1 = k === joints.length ? 15 : joints[k]! - 1;
    const y = int(r, 10, 13);
    for (let x = x0; x <= x1; x++) t.set(x, y, p.faceD);
  }
  if (ember) {
    const x = pickOf(r, joints);
    const y = int(r, 11, 12);
    t.set(x, y, EMBER.d).set(x, y + 1, EMBER.m).set(x, y + 2, EMBER.d);
  }
}

/** One cliff tile. v: 0 plain, 1 a little more detail, 2 something special (an ember in basalt). */
function cliffTile(kind: CliffKind, snowy: boolean, mask: number, v: number): Tile {
  const p = kind === 'rock' ? (snowy ? ROCK_SNOW : ROCK) : kind === 'sandstone' ? SANDSTONE : BASALT;
  const r = rng(kind === 'rock' ? 11 : kind === 'sandstone' ? 12 : 13, mask, v, snowy ? 1 : 0);
  const up = (mask & 1) !== 0;
  const right = (mask & 2) !== 0;
  const down = (mask & 4) !== 0;
  const left = (mask & 8) !== 0;
  const t = new Tile(p.top);
  if (snowy) snowTop(t, r, v);
  else if (kind === 'rock') rockTop(t, p, r, v);
  else if (kind === 'sandstone') sandstoneTop(t, p, r, v);
  else basaltTop(t, p, r, v, !down && v === 2);
  sideRims(t, p, r, left, right);
  if (up) topRim(t, p, r);
  // the face: the bottom half of a tile with open ground below it, under a lit lip
  const ft = wobble(r, 1.2).map((w) => 8 + Math.round(w));
  if (down) {
    if (kind === 'rock') rockFace(t, p, r, ft, snowy);
    else if (kind === 'sandstone') sandstoneFace(t, p, r, ft);
    else basaltFace(t, p, r, ft, v === 2);
    if (left) for (let y = ft[1]!; y < 15; y++) t.set(1, y, p.faceL);
    if (right) {
      for (let y = ft[14]!; y < 15; y++) t.set(14, y, p.faceD);
      t.set(14, ft[14]! - 1, p.topH);
    }
    if (snowy)
      for (let x = 0; x < 16; x++) {
        // snow hangs over the lip, with an icicle here and there, and lies drifted against the foot
        const n = r() < 0.3 ? 2 : 1;
        for (let i = 0; i < n; i++) t.set(x, ft[x]! + i, i === n - 1 ? SNOW.shade : SNOW.base);
        if (x > 0 && x < 15 && r() < 0.18) t.set(x, ft[x]! + n, ICE.light).set(x, ft[x]! + n + 1, ICE.deep);
        if (r() < 0.15) t.set(x, 15, SNOW.shade);
      }
  }
  if (up) t.rect(0, 0, 16, 1, p.out);
  if (left) t.rect(0, 0, 1, 16, p.out);
  if (right) t.rect(15, 0, 1, 16, p.out);
  if (up && left) t.set(1, 1, p.out);
  if (up && right) t.set(14, 1, p.out);
  return t;
}

// ---------------------------------------------------------------------------
// Liquids: lava, bog water, chocolate
// ---------------------------------------------------------------------------

const LAVA = {
  hot: '#fff3a8',
  yellow: '#ffd23e',
  light: '#ffad2a',
  orange: '#ff8a1c',
  deep: '#e85e16',
  glow: '#ff6a1a',
  crust: '#3e2622',
  crustL: '#5c3a30',
  crustD: '#2a1a18',
  cool: '#2b201e',
  coolM: '#3b2a24',
  coolH: '#5e3020',
};

/** A soft wavy streak across the tile. */
function streak(t: Tile, x0: number, y0: number, len: number, phase: number, c: string, hi?: string): void {
  for (let k = 0; k < len; k++) {
    const y = y0 + Math.round(Math.sin(phase + k * 0.75) * 0.8);
    t.set(x0 + k, y, hi && k === 1 ? hi : c);
  }
}

/** A long flat slab of cooled crust drifting with the lava: lit along its top, its underside dark, a cooler wake behind it. */
function crustPlate(t: Tile, r: Rnd, x0: number, y0: number, w: number, h: number): void {
  const cut = [int(r, 0, 1), int(r, 1, 2), int(r, 1, 2), int(r, 0, 1)];
  const s: Shape = (x, y) => {
    const dx = x - x0;
    const dy = y - y0;
    if (dx < 0 || dy < 0 || dx >= w || dy >= h) return false;
    if (dy === 0) return dx >= cut[0]! && dx < w - cut[1]!;
    if (dy === h - 1) return dx >= cut[2]! && dx < w - cut[3]!;
    return true;
  };
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) if (s(x, y)) t.set(x, y, !s(x, y - 1) ? LAVA.crustL : !s(x, y + 1) ? LAVA.crustD : LAVA.crust);
  t.rect(x0 - 2, y0 + h - 1, 2, 1, LAVA.deep);
}

function lavaTile(mask: number, v: number, f: number): Tile {
  const r = rng(21, mask, v);
  const t = new Tile(LAVA.orange);
  // currents: darker swirls and bright yellow ribbons, drifting along
  for (let i = 0; i < 2; i++) streak(t, int(r, 1, 5) + f, int(r, 2, 13), int(r, 6, 9), r() * 6, LAVA.deep);
  for (let i = 0; i < 3; i++) streak(t, int(r, 1, 7) + f * 2, int(r, 1, 14), int(r, 4, 6), r() * 6, LAVA.light, LAVA.yellow);
  for (let i = 0; i < 2; i++) t.set(int(r, 2, 13) + f, int(r, 2, 13), f ? LAVA.yellow : LAVA.hot);
  // cooled crust floating along: a flat plate on look 0, a small piece on look 1, open lava on the others
  if (v === 0) crustPlate(t, r, int(r, 3, 6) + f, int(r, 3, 10), int(r, 6, 8), int(r, 2, 3));
  else if (v === 1 && r() < 0.7) crustPlate(t, r, int(r, 3, 9) + f, int(r, 3, 11), int(r, 4, 5), 2);
  else if (v === 3) streak(t, int(r, 2, 6) + f * 2, int(r, 3, 12), 5, r() * 6, LAVA.yellow, LAVA.hot);
  // the banks: a dark, cooled crust that glows where it meets the lava
  const wob = SIDES.map(() => wobble(r, 1.3));
  eachEdge(mask, (i, a) => 2.6 + wob[i]![a]!, 5, (x, y, d) => {
    if (d < -1.5) t.set(x, y, sprinkle(x, y, 5, v) ? LAVA.coolM : sprinkle(x, y, 23, 7) ? LAVA.coolH : LAVA.cool);
    else if (d < -0.5) t.set(x, y, LAVA.coolM);
    else if (d < 0) t.set(x, y, LAVA.coolH);
    else if (d < 1) t.set(x, y, (x + y + f) % 3 === 0 ? LAVA.hot : LAVA.yellow);
  });
  return t;
}

const BOG = {
  base: '#3a4a31',
  deep: '#304029',
  murk: '#44553a',
  shine: '#5f7352',
  weed: '#7cb23e',
  weedL: '#a8d65a',
  weedD: '#5a8a30',
  shallow: '#4a5a3b',
  wet: '#42352a',
};

function bogTile(mask: number, v: number, f: number): Tile {
  const r = rng(22, mask, v);
  const t = new Tile(BOG.base);
  if (v === 0 || v === 3) blotch(t, r, int(r, 6, 9), int(r, 4, 5), mix(BOG.base, BOG.deep, 0.6));
  else if (v === 1) blotch(t, r, int(r, 4, 6), 3, mix(BOG.base, BOG.murk, 0.6));
  // a gentle shimmer drifting on the dark water
  for (let i = 0; i < 2; i++) {
    const w = int(r, 2, 4);
    t.rect(int(r, 1, 11 - w) + f * 2, int(r, 2, 13), w, 1, BOG.shine);
  }
  // duckweed: on look 0 a little cluster of tiny leaves, else a stray leaf or two
  if (v === 0 && r() < (mask ? 0.4 : 1)) {
    const cx = int(r, 4, 11);
    const cy = int(r, 4, 11);
    for (let k = int(r, 4, 7); k > 0; k--) {
      const x = cx + int(r, -2, 2);
      const y = cy + int(r, -1, 1);
      t.set(x, y, pickOf(r, [BOG.weed, BOG.weed, BOG.weedD]));
      if (r() < 0.3) t.set(x + 1, y, BOG.weedL);
    }
  }
  specks(t, r, int(r, 0, 2), BOG.weed, 2, 2, 13, 13);
  // muddy banks with a wet dark edge
  const wob = SIDES.map(() => wobble(r, 1.1));
  eachEdge(mask, (i, a) => 2.6 + wob[i]![a]!, 5, (x, y, d) => {
    if (d < -1) t.set(x, y, sprinkle(x, y, 6, v) ? MUD.light : sprinkle(x, y, 7, v + 3) ? MUD.dark : MUD.base);
    else if (d < 0) t.set(x, y, BOG.wet);
    else if (d < 1) t.set(x, y, BOG.shallow);
  });
  return t;
}

const CHOCO = {
  base: '#6a391d',
  dark: '#5c3019',
  swirl: '#7d4726',
  hi: '#a36a42',
  gloss: '#e9c3a0',
  shadow: '#4a2513',
  glaze: '#ffd8e8',
  pinkD: '#e48eb4',
};

function chocoTile(mask: number, v: number, f: number): Tile {
  const r = rng(23, mask, v);
  const t = new Tile(CHOCO.base);
  // a slow glossy ripple on looks 1 and 3: a lighter crest over a darker trough, a highlight (and a bright glint)
  const x0 = int(r, 1, 4) + f;
  const y0 = int(r, 4, 11);
  const len = int(r, 7, 10);
  const ph = r() * 6;
  const yAt = (x: number) => y0 + Math.round(Math.sin(ph + (x - x0) * 0.75) * 0.8);
  if (v === 1 || v === 3) {
    streak(t, x0, y0 + 1, len, ph, CHOCO.dark);
    streak(t, x0, y0, len, ph, CHOCO.swirl);
    const hx = x0 + int(r, 1, len - 4);
    for (let k = hx; k < hx + 3; k++) t.set(k, yAt(k), CHOCO.hi);
    if (v === 1) t.set(hx + 1, yAt(hx + 1), CHOCO.gloss);
  } else {
    // just a soft sheen
    streak(t, x0 + 2, y0, int(r, 3, 4), ph, CHOCO.swirl);
  }
  // the banks: pink candy melting into the chocolate in little drips (that grow in the second frame)
  const wob = SIDES.map(() => wobble(r, 0.6));
  // drips hang down from the far bank and the sides; the near bank just melts a little unevenly
  const drip = SIDES.map((s) => (s === 4 ? drips(r, 0) : drips(r, int(r, 1, 2))));
  eachEdge(mask, (i, a) => 2.5 + wob[i]![a]! + drip[i]![a]! * (f ? 1.35 : 1), 5, (x, y, d) => {
    if (d < -2) t.set(x, y, sprinkle(x, y, 13, v) ? CANDY.light : CANDY.base);
    else if (d < -1) t.set(x, y, CHOCO.glaze);
    else if (d < 0) t.set(x, y, CHOCO.pinkD);
    else if (d < 1) t.set(x, y, CHOCO.shadow);
  });
  return t;
}

// ---------------------------------------------------------------------------
// Ground: ash, mud, moss, red sand, candy
// ---------------------------------------------------------------------------

const ASH = { base: '#58524f', dark: '#4e4846', light: '#69625f', pale: '#7a7370', crack: '#3d3836' };
const MUD = { base: '#5d4934', dark: '#523f2d', light: '#6b5640', wet: '#4b3a29', puddle: '#424543', sky: '#6f7d82', glint: '#c3d2d8', stub: '#7a7442', stubL: '#9a9450' };
const MOSS = { base: '#3d8b7a', dark: '#357c6c', cushion: '#46988a', cushionL: '#5db39c', spore: '#e2fff6', sporeB: '#c4f2ff', sporeV: '#f2e0ff' };
const REDSAND = { base: '#d48a57', dark: '#c47a49', light: '#e09d6c', pebble: '#a6603a', pebbleL: '#dcaa82', pebbleD: '#86492a', crack: '#b4693a' };
const CANDY = { base: '#f6bcd5', light: '#ffd9e9', dark: '#edaccb', white: '#ffffff', yellow: '#ffe066', blue: '#6cc4f4', mint: '#86e3bf' };

function ashTile(v: number): Tile {
  const r = rng(31, v);
  const t = new Tile(ASH.base);
  if (v === 2) blotch(t, r, int(r, 6, 9), int(r, 4, 5), mix(ASH.base, ASH.dark, 0.6));
  specks(t, r, 4, ASH.dark);
  specks(t, r, 4, ASH.light);
  specks(t, r, 2, ASH.pale);
  if (v === 1) fissure(t, r, int(r, 2, 7), int(r, 3, 10), int(r, 5, 7), ASH.crack);
  if (v === 3) {
    // a crack with a glow deep down in it
    const x = int(r, 3, 7);
    const y = int(r, 4, 10);
    fissure(t, r, x, y, 6, ASH.crack);
    t.set(x, y, EMBER.d).set(x + 1, y, EMBER.m);
  }
  if (v === 0) {
    // a tiny ember
    const x = int(r, 3, 12);
    const y = int(r, 3, 12);
    t.set(x, y, EMBER.h).set(x + 1, y, EMBER.d);
  }
  return t;
}

function mudTile(v: number): Tile {
  const r = rng(32, v);
  const t = new Tile(MUD.base);
  if (v === 2) blotch(t, r, int(r, 6, 9), int(r, 4, 5), mix(MUD.base, MUD.dark, 0.6));
  specks(t, r, 4, MUD.dark);
  specks(t, r, 3, MUD.light);
  if (v === 0) {
    // a shallow puddle sunk in wet mud, a streak of sky mirrored in it
    const x = int(r, 2, 4);
    const y = int(r, 4, 8);
    const a = ellipse(x, y, int(r, 8, 10), 4);
    const b = ellipse(x + int(r, 2, 4), y + 2, 6, 3);
    const s: Shape = (px, py) => a(px, py) || b(px, py);
    for (let py = y - 1; py <= y + 5; py++)
      for (let px = x - 1; px <= x + 11; px++) {
        if (s(px, py)) t.set(px, py, MUD.puddle);
        else if (s(px + 1, py) || s(px - 1, py) || s(px, py + 1) || s(px, py - 1)) t.set(px, py, MUD.wet);
      }
    t.rect(x + 2, y + 1, 4, 1, MUD.sky).set(x + 3, y + 1, MUD.glint).set(x + 6, y + 2, MUD.sky);
  } else if (v === 3) {
    // a wet smear
    const x = int(r, 2, 12);
    const y = int(r, 2, 13);
    t.rect(x, y, 2, 1, MUD.puddle);
  }
  if (v === 1 || v === 3) {
    // a little tuft of dry stubble, leaning
    const x = int(r, 2, 11);
    const y = int(r, 4, 12);
    t.set(x, y, MUD.stub).set(x + 1, y, MUD.stub).set(x + 1, y - 1, MUD.stubL).set(x + 3, y, MUD.stub).set(x + 2, y - 1, MUD.stub).set(x + 3, y - 2, MUD.stubL);
  }
  return t;
}

function mossTile(v: number): Tile {
  const r = rng(33, v);
  const t = new Tile(MOSS.base);
  specks(t, r, 3, MOSS.dark);
  // a carpet of little cushions, each lit on its top-left and shaded below
  for (let i = int(r, 5, 7); i > 0; i--) {
    const x = int(r, 1, 12);
    const y = int(r, 1, 13);
    const w = r() < 0.5 ? 3 : 2;
    t.set(x, y, MOSS.cushionL).rect(x + 1, y, w - 1, 1, MOSS.cushion);
    t.set(x, y + 1, MOSS.cushion).rect(x + 1, y + 1, w - 1, 1, MOSS.dark);
  }
  // pale spores, the odd one faintly violet
  specks(t, r, 1, MOSS.spore);
  specks(t, r, 1, v === 1 ? MOSS.sporeV : mix(MOSS.cushionL, MOSS.sporeB, 0.6));
  return t;
}

function redsandTile(v: number): Tile {
  const r = rng(34, v);
  const t = new Tile(REDSAND.base);
  specks(t, r, 4, REDSAND.dark);
  specks(t, r, 4, REDSAND.light);
  for (let i = v === 1 ? 2 : v === 0 ? 1 : 0; i > 0; i--) {
    const x = int(r, 2, 12);
    const y = int(r, 2, 12);
    t.set(x, y, REDSAND.pebbleL).set(x + 1, y, REDSAND.pebble).set(x + 1, y + 1, REDSAND.pebbleD);
  }
  if (v === 2) fissure(t, r, int(r, 2, 6), int(r, 4, 10), int(r, 5, 7), REDSAND.crack);
  return t;
}

function candyTile(v: number): Tile {
  const r = rng(35, v);
  const t = new Tile(CANDY.base);
  specks(t, r, 3, CANDY.light);
  specks(t, r, 2, CANDY.dark);
  // sprinkles
  const cols = [CANDY.white, CANDY.yellow, CANDY.blue, CANDY.mint];
  for (let i = v + 1; i > 0; i--) {
    const x = int(r, 2, 12);
    const y = int(r, 2, 12);
    const c = cols[(v + i) % cols.length]!;
    // lying flat or slanting, never standing up
    const slant = r() < 0.5;
    t.set(x, y, c).set(x + 1, y + (slant ? 1 : 0), c);
  }
  return t;
}

// ---------------------------------------------------------------------------
// The moon and the starry sky
// ---------------------------------------------------------------------------

const MOON = {
  base: '#c6c7d0',
  dust: '#bcbdc7',
  dustL: '#d2d3db',
  sea: '#b4b5c0',
  crater: '#abacb8',
  craterD: '#9495a3',
  craterL: '#dddee6',
  rim: '#ffffff',
  rimDim: '#e2e3ec',
  glow: '#d8d9e1',
  shade1: '#9c9daa',
  shade2: '#a8a9b6',
  shade3: '#b5b6c1',
};
const SPACE = { base: '#0b0d1f', dim: '#363e6a', mid: '#7a84be', bright: '#dfe6ff', white: '#ffffff', warm: '#ffe2a8', neb: '#131232', neb2: '#0d192d' };

/** A small crater: shadowed inside towards the top-left, lit inside towards the bottom-right, a lit rim outside. */
function crater(t: Tile, cx: number, cy: number, rad: number): void {
  for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++)
    for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const k = (dx + dy) / rad;
      if (d <= rad) t.set(x, y, k < -0.25 ? MOON.craterD : k > 0.6 ? MOON.craterL : MOON.crater);
      else if (d <= rad + 1 && k < -0.5) t.set(x, y, MOON.craterL);
    }
}

// little craters too small to shade by formula: s shadow, c crater, l lit inner wall, h lit rim
const SMALL_CRATER = ['.hh.', 'hssc', 'hscl', '.cl.'];
const PIT = ['sc', 'cl'];
const CRATER_PAL = { s: MOON.craterD, c: MOON.crater, l: MOON.craterL, h: MOON.dustL };
/** Draws a little ASCII template; characters missing from the palette are left alone. */
function stamp(t: Tile, x0: number, y0: number, rows: string[], pal: Record<string, string>): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]!];
      if (c) t.set(x0 + x, y0 + y, c);
    }
  });
}

function moonTile(mask: number, v: number): Tile {
  const r = rng(41, mask, v);
  const t = new Tile(MOON.base);
  if (v === 1 || v === 2) blotch(t, r, int(r, 6, 10), int(r, 4, 6), v === 1 ? MOON.sea : mix(MOON.base, MOON.dust, 0.6));
  specks(t, r, 3, MOON.dust);
  specks(t, r, 3, MOON.dustL);
  // craters: a big one now and then, a small one, or just a pit or two
  if (v === 0) crater(t, int(r, 5, 10) + 0.5, int(r, 5, 10) + 0.5, 2.6);
  if (v === 3) stamp(t, int(r, 3, 10), int(r, 3, 10), SMALL_CRATER, CRATER_PAL);
  for (let i = v === 2 ? int(r, 1, 2) : int(r, 0, 1); i > 0; i--) stamp(t, int(r, 2, 12), int(r, 2, 12), PIT, CRATER_PAL);
  // the moon's edge against the sky: a crisp bright rim, then a soft shadow, deeper on the side away from the light
  const wob = SIDES.map(() => wobble(r, 1.3));
  eachEdge(mask, (i, a) => Math.max(0, wob[i]![a]!), 6, (x, y, d, side) => {
    const lit = side === 1 || side === 8;
    if (d < 0) t.set(x, y, SPACE.base);
    else if (d < 1) t.set(x, y, lit ? MOON.rim : MOON.rimDim);
    else if (lit) {
      if (d < 2) t.set(x, y, MOON.glow);
    } else if (d < 2) t.set(x, y, MOON.shade1);
    else if (d < 3) t.set(x, y, MOON.shade2);
    else if (d < 4.5) t.set(x, y, MOON.shade3);
  });
  return t;
}

function spaceTile(v: number): Tile {
  const r = rng(42, v);
  const t = new Tile(SPACE.base);
  if (v === 4 || v === 5) {
    // a faint haze of nebula, thinning out towards its edges
    const cx = int(r, 6, 9) + 0.5;
    const cy = int(r, 6, 9) + 0.5;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const k = Math.hypot((x + 0.5 - cx) / 6.5, (y + 0.5 - cy) / 5);
        if (k < 1 && hash2(x * 7 + v, y * 13) % 100 < (1 - k) * 140) t.set(x, y, v === 4 ? SPACE.neb : SPACE.neb2);
      }
  }
  for (let i = int(r, 3, 6); i > 0; i--) t.set(int(r, 0, 15), int(r, 0, 15), SPACE.dim);
  for (let i = int(r, 1, 2); i > 0; i--) t.set(int(r, 0, 15), int(r, 0, 15), pickOf(r, [SPACE.mid, SPACE.mid, SPACE.warm]));
  if (r() < 0.5) t.set(int(r, 0, 15), int(r, 0, 15), SPACE.bright);
  const x = int(r, 3, 12);
  const y = int(r, 3, 12);
  // a big bright star: two pixels wide, or with a little twinkle
  if (v === 1) t.set(x, y, SPACE.white).set(x + 1, y, SPACE.bright).set(x, y + 1, SPACE.mid);
  if (v === 3) t.set(x, y, SPACE.white).set(x - 1, y, SPACE.mid).set(x + 1, y, SPACE.mid).set(x, y - 1, SPACE.mid).set(x, y + 1, SPACE.mid);
  return t;
}

// ---------------------------------------------------------------------------
// Registering the tiles
// ---------------------------------------------------------------------------

/**
 * Draws the wider world's grounds and registers them with `add`.
 */
export function addBiomeTerrain(add: (p: Px) => number): BiomeTerrain {
  const put = (t: Tile) => add(t.toPx());
  const n = <T>(count: number, f: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => f(i));
  // cliffs: three looks for every edge mask (plain, a little detail, something special)
  const cliff = (kind: CliffKind, snowy: boolean) => n(16, (m) => n(3, (v) => put(cliffTile(kind, snowy, m, v))));
  // liquids: four looks out in the open, two along every kind of bank, two animation frames each
  const liquid = (draw: (m: number, v: number, f: number) => Tile) => n(16, (m) => n(m ? 2 : 4, (v) => n(2, (f) => put(draw(m, v, f)))));
  const rock = cliff('rock', false);
  const rockSnow = cliff('rock', true);
  const sandstone = cliff('sandstone', false);
  const basalt = cliff('basalt', false);
  const lava = liquid(lavaTile);
  const bog = liquid(bogTile);
  const choco = liquid(chocoTile);
  const moon = n(16, (m) => n(m ? 2 : 4, (v) => put(moonTile(m, v))));
  const ash = n(4, (v) => put(ashTile(v)));
  const mud = n(4, (v) => put(mudTile(v)));
  const moss = n(4, (v) => put(mossTile(v)));
  const redsand = n(3, (v) => put(redsandTile(v)));
  const candy = n(3, (v) => put(candyTile(v)));
  const space = n(6, (v) => put(spaceTile(v)));
  const carpet = carpetTiles().map(add);
  const crypt = cryptTiles().map(add);
  const forge = forgeTiles().map(add);
  // how often each variant shows: the eye-catching ones (embers, puddles, nebulae, big craters) only now and then
  const W = {
    cliff: [5, 3, 1],
    lava: [2, 2, 3, 2],
    bog: [1, 3, 3, 2],
    choco: [3, 2, 3, 1],
    moon: [1, 2, 4, 2],
    ash: [1, 2, 5, 1],
    mud: [1, 3, 8, 3],
    redsand: [3, 2, 1],
    candy: [2, 2, 1],
    space: [6, 2, 6, 2, 1, 1],
    crypt: [3, 2, 3, 2, 2, 3, 1, 1],
    forge: [4, 1, 3, 2, 3, 1],
  };
  return {
    index(t, x, y, snowy, mask, frame) {
      const h = hash2(x, y);
      const m = mask & 15;
      const f = frame & 1;
      switch (t) {
        case 'rock':
          return weighted((snowy ? rockSnow : rock)[m]!, W.cliff, h);
        case 'sandstone':
          return weighted(sandstone[m]!, W.cliff, h);
        case 'basalt':
          return weighted(basalt[m]!, W.cliff, h);
        case 'lava':
          return (m ? lava[m]![h % 2]! : weighted(lava[0]!, W.lava, h))[f]!;
        case 'bog':
          return (m ? bog[m]![h % 2]! : weighted(bog[0]!, W.bog, h))[f]!;
        case 'choco':
          return (m ? choco[m]![h % 2]! : weighted(choco[0]!, W.choco, h))[f]!;
        case 'moon':
          return m ? moon[m]![h % 2]! : weighted(moon[0]!, W.moon, h);
        case 'ash':
          return weighted(ash, W.ash, h);
        case 'mud':
          return weighted(mud, W.mud, h);
        case 'moss':
          return moss[h % moss.length]!;
        case 'redsand':
          return weighted(redsand, W.redsand, h);
        case 'candy':
          return weighted(candy, W.candy, h);
        case 'space':
          return weighted(space, W.space, h);
        case 'carpet': // one big pattern over 8×8 tiles
          return carpet[(x % CARPET_TILES) + CARPET_TILES * (y % CARPET_TILES)]!;
        case 'crypt':
          return weighted(crypt, W.crypt, h);
        case 'forge':
          return weighted(forge, W.forge, h);
        default:
          return null;
      }
    },
  };
}
