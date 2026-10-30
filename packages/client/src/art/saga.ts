// Sagan om Världsträdet: the three dungeons and what belongs to them. Walls, gates, torches, the way out, rest
// stones, chests and the things along the walls; the arches out in the world, Kämpastenen on the city square, the
// keepsakes for home, the crypt's and the forge's floors, and icons for the dungeons' loot. A dungeon's things come
// in three looks (variant = the dungeon: 0 Draugkryptan, 1 Frostjättens borg, 2 Surts smedja). Light comes from the
// top-left like everywhere else. Spooky-cute, never gory: skulls are round and smile.
import { Px, hash2, shade } from './px.js';
import { OUTLINE } from './world.js';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;

const n = <T>(count: number, f: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => f(i));

// ---------------------------------------------------------------------------
// Painting helpers (sagaanimals.ts uses them too)
// ---------------------------------------------------------------------------

/** Five tones of one material, darkest to lightest. */
export interface Pal {
  d2: string;
  d: string;
  b: string;
  l: string;
  l2: string;
}
export const pal = (d2: string, d: string, b: string, l: string, l2: string): Pal => ({ d2, d, b, l, l2 });
/** A material's tones around one colour. */
export const ramp = (c: string): Pal => pal(shade(c, 0.42), shade(c, 0.68), c, shade(c, 1.35), shade(c, 1.72));

const rgbCache = new Map<string, [number, number, number]>();
const rgb = (c: string): [number, number, number] => {
  let v = rgbCache.get(c);
  if (!v) {
    const num = parseInt(c.slice(1, 7), 16);
    v = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    rgbCache.set(c, v);
  }
  return v;
};

/** Colours every pixel of a box that `f` gives a colour (straight into the image data, so big shaded shapes stay quick). */
export function paint(p: Px, x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => string | null | undefined): Px {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(p.w, Math.ceil(x0 + w));
  const yb = Math.min(p.h, Math.ceil(y0 + h));
  if (xb <= xa || yb <= ya) return p;
  const img = p.ctx.getImageData(xa, ya, xb - xa, yb - ya);
  const d = img.data;
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const c = f(x, y);
      if (!c) continue;
      const [r, g, b] = rgb(c);
      const i = ((y - ya) * (xb - xa) + x - xa) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  p.ctx.putImageData(img, xa, ya);
  return p;
}

/** Light falling on what is already drawn: pulls the pixels around (cx, cy) towards a colour, in three soft steps. */
export function glowOn(p: Px, cx: number, cy: number, r: number, col: string, k: number): Px {
  const [R, G, B] = rgb(col);
  const xa = Math.max(0, Math.floor(cx - r));
  const ya = Math.max(0, Math.floor(cy - r));
  const xb = Math.min(p.w, Math.ceil(cx + r));
  const yb = Math.min(p.h, Math.ceil(cy + r));
  if (xb <= xa || yb <= ya) return p;
  const img = p.ctx.getImageData(xa, ya, xb - xa, yb - ya);
  const d = img.data;
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const i = ((y - ya) * (xb - xa) + x - xa) * 4;
      if (!d[i + 3]) continue;
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (dist >= 1) continue;
      const f = k * (dist < 0.4 ? 1 : dist < 0.7 ? 0.6 : 0.28);
      d[i] = Math.round(d[i]! + (R - d[i]!) * f);
      d[i + 1] = Math.round(d[i + 1]! + (G - d[i + 1]!) * f);
      d[i + 2] = Math.round(d[i + 2]! + (B - d[i + 2]!) * f);
    }
  p.ctx.putImageData(img, xa, ya);
  return p;
}

/** Soft light around (cx, cy) on the empty pixels too: a halo, `a` its strongest alpha (drawn after the outline). */
export function halo(p: Px, cx: number, cy: number, r: number, col: string, a: number): Px {
  const [R, G, B] = rgb(col);
  const xa = Math.max(0, Math.floor(cx - r));
  const ya = Math.max(0, Math.floor(cy - r));
  const xb = Math.min(p.w, Math.ceil(cx + r));
  const yb = Math.min(p.h, Math.ceil(cy + r));
  if (xb <= xa || yb <= ya) return p;
  const img = p.ctx.getImageData(xa, ya, xb - xa, yb - ya);
  const d = img.data;
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const i = ((y - ya) * (xb - xa) + x - xa) * 4;
      if (d[i + 3]) continue;
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (dist >= 1) continue;
      d[i] = R;
      d[i + 1] = G;
      d[i + 2] = B;
      d[i + 3] = Math.round(255 * a * (dist < 0.45 ? 1 : dist < 0.75 ? 0.55 : 0.25));
    }
  p.ctx.putImageData(img, xa, ya);
  return p;
}

// Light from the top-left and a little from the front (x right, y down, z towards the viewer).
export const light = (nx: number, ny: number, nz: number): number => (nx * -0.45 + ny * -0.55 + nz * 0.7) / (Math.hypot(nx, ny, nz) || 1);
/** The palette's tone for an amount of light. */
export const tone = (c: Pal, v: number): string => (v > 0.985 ? c.l2 : v > 0.86 ? c.l : v > 0.42 ? c.b : v > 0.05 ? c.d : c.d2);
/** Fixed per-pixel noise, -0.5..0.5. */
export const grain = (x: number, y: number, salt = 0): number => hash2(x * 7 + salt * 131 + 3, y * 13 + salt * 71 + 5) / 1000 - 0.5;

/** A rounded lump (a boulder, a bowl, a belly) shaded like a ball lit from the top-left. */
export function lump(p: Px, x: number, y: number, w: number, h: number, c: Pal, rough = 0.2, salt = 0, flat = 0.25): Px {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return paint(p, x, y, w + 1, h + 1, (px, py) => {
    const dx = (px + 0.5 - cx) / (w / 2);
    const dy = (py + 0.5 - cy) / (h / 2);
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return null;
    return tone(c, light(dx, dy, Math.sqrt(1 - r2) + flat) + rough * grain(px, py, salt));
  });
}

/** A tiny four-pointed twinkle (drawn after the outline, so it has none). */
export const twinkle = (p: Px, x: number, y: number, c = '#fff3b0', core = '#ffffff'): Px => p.px(x, y - 1, c).px(x - 1, y, c).px(x + 1, y, c).px(x, y + 1, c).px(x, y, core);

/** A crystal shard standing on (bx, by) (bottom middle), w wide and h tall, its tip leaning `lean` px. */
export function shard(p: Px, bx: number, by: number, w: number, h: number, lean: number, c: Pal): Px {
  const tip = Math.max(2, Math.round(w * 0.75));
  return paint(p, bx - w - Math.abs(lean) - 1, by - h, 2 * w + 2 * Math.abs(lean) + 3, h + 1, (x, y) => {
    const i = by - y; // 0 on the bottom row
    if (i < 0 || i >= h) return null;
    const cx = bx + (lean * i) / h;
    const half = i >= h - tip ? (w / 2) * ((h - i) / (tip + 1)) : w / 2;
    const u = (x + 0.5 - cx) / Math.max(0.5, half);
    if (Math.abs(u) > 1) return null;
    if (i >= h - tip) return u < 0 ? c.l2 : c.l;
    return u < -0.4 ? c.l : u < 0.35 ? c.b : c.d;
  });
}

/** A flame from its foot (bx, by), w wide and h tall, bent `lean` px at the tip: outer colour, middle, core. */
export function flame(p: Px, bx: number, by: number, w: number, h: number, lean: number, outer: string, mid: string, core: string): Px {
  return paint(p, bx - w, by - h, w * 2 + 2, h + 1, (x, y) => {
    const t = (by - y) / h; // 0 at the foot, 1 at the tip
    if (t < 0 || t > 1) return null;
    const cx = bx + lean * t * t;
    const half = (w / 2) * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)) * (1 - t * 0.35);
    const u = Math.abs(x + 0.5 - cx) / Math.max(0.5, half);
    if (u > 1) return null;
    if (u < 0.45 && t < 0.55) return core;
    if (u < 0.75 && t < 0.8) return mid;
    return outer;
  });
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** Draugkryptan's stone: grey with a little green in it. */
const CRYPT = pal('#262b27', '#3c433c', '#5a6257', '#788072', '#979f8e');
const MOSS = pal('#24401f', '#365e28', '#4f8231', '#6ea443', '#98c862');
/** The ice of Frostjättens borg, and snow. */
const ICE = pal('#2c5a86', '#4c82b2', '#84bae0', '#bfe1f5', '#eef9ff');
const SNOW = pal('#9cb4cc', '#c4d8ea', '#e6f0f8', '#f6fbff', '#ffffff');
/** Surts smedja: black basalt, and the glow between its stones. */
const BASALT = pal('#121014', '#1f1d23', '#302d35', '#45414c', '#5c5866');
const EMBER = { d: '#7a2210', m: '#d8481a', h: '#ffa040', hot: '#fff0a0' };
const IRON = pal('#24262c', '#3e4048', '#5e626c', '#8a8e9a', '#bcc0ca');
const STEEL_PAL = pal('#596476', '#7c8798', '#b8c2d0', '#e2e8f0', '#ffffff');
const GOLD = pal('#8a5a10', '#b8861a', '#e8b830', '#ffe27a', '#fff6c8');
const WOOD = pal('#3e2614', '#5e3c20', '#86582f', '#b07c48', '#d4a46c');
const BONE = pal('#8a7c60', '#b8aa88', '#e2d6b8', '#f4ecd8', '#fffaf0');
const STONE = pal('#3a3a40', '#55555c', '#76767c', '#98989c', '#bcbcc0');
/** Each dungeon's glow: the crypt's ghostly green, the castle's frost blue, the forge's fire. */
const GLOW = [
  { outer: '#2fae4a', mid: '#7cf06a', core: '#e4ffd0', light: '#9cff8a' },
  { outer: '#3a9ad8', mid: '#8ad8ff', core: '#f0fcff', light: '#a8e8ff' },
  { outer: '#e04a14', mid: '#ff9a2a', core: '#fff0a0', light: '#ffb04a' },
] as const;
/** Glowing runes (rest stones, the gate, Kämpastenen). */
const RUNE = { d: '#1a8aa8', b: '#38d8f0', l: '#a8f8ff', core: '#ffffff' };
const VOID = '#0c0a0e';

/** Little runes, 3 wide and 4 tall, to scatter over stones (none of them a cross: these are not graves). */
const RUNES: string[][] = [
  ['#..', '##.', '#.#', '#..'],
  ['##.', '#.#', '##.', '#.#'],
  ['#.#', '.#.', '#.#', '...'],
  ['##.', '#.#', '##.', '#..'],
  ['#.#', '##.', '#.#', '..#'],
  ['.#.', '#.#', '.#.', '#.#'],
];
const rune = (p: Px, x: number, y: number, i: number, c: string): Px => p.tpl(x, y, RUNES[i % RUNES.length]!, { '#': c });

// ---------------------------------------------------------------------------
// Floors: Draugkryptan's flagstones and the forge's black slabs (16×16, seamless; terrain2.ts picks the variant)
// ---------------------------------------------------------------------------

const FLAG = { joint: '#30332d', d: '#5a5e53', b: '#6a6e62', l: '#7a7f71', l2: '#8c9182', crack: '#484c42' };

/**
 * Flagstone layouts of a tile: the slabs' joints inside it. Every tile also has a joint along its top row and its
 * left column, so tiles meet at a joint whichever layouts lie side by side.
 */
const SLABS: { x?: number; y?: number; from?: number; to?: number }[][] = [
  [],
  [{ x: 9 }],
  [{ y: 9 }, { x: 6, from: 9, to: 16 }],
  [{ y: 6 }, { x: 11, from: 6, to: 16 }],
  [{ x: 8 }, { y: 8 }],
  [{ x: 5 }, { y: 11, from: 5, to: 16 }],
];

/** A tile of flagstones in layout `l`: the joints, and each slab bevelled (lit top-left, shaded bottom-right). */
function slabs(p: Px, l: number, c: { joint: string; d: string; b: string; l: string }, salt: number, rim?: string): Px {
  const cuts = SLABS[l % SLABS.length]!;
  const jointAt = (x: number, y: number): boolean => {
    if (x === 0 || y === 0) return true;
    return cuts.some((k) => (k.x !== undefined ? x === k.x && y >= (k.from ?? 0) && y < (k.to ?? 16) : y === k.y && x >= (k.from ?? 0) && x < (k.to ?? 16)));
  };
  return paint(p, 0, 0, 16, 16, (x, y) => {
    if (jointAt(x, y)) return c.joint;
    if (rim && (jointAt(x - 1, y) || jointAt(x, y - 1) || jointAt(x + 1, y) || jointAt(x, y + 1) || x === 15 || y === 15)) return rim;
    if (jointAt(x - 1, y) || jointAt(x, y - 1)) return c.l;
    if (jointAt(x + 1, y) || jointAt(x, y + 1) || x === 15 || y === 15) return c.d;
    const g = grain(x, y, salt);
    return g > 0.36 ? c.l : g < -0.4 ? c.d : c.b;
  });
}

/** The crypt's floor: big worn flagstones, moss in the joints; now and then a crack, a cushion of moss or a rune. */
function cryptTile(v: number): Px {
  const p = new Px(16, 16);
  slabs(p, [0, 1, 2, 3, 4, 5, 1, 2][v]!, FLAG, 21 + v);
  // moss creeping along the joints
  for (let i = 0; i < (v % 3 === 1 ? 6 : 3); i++) {
    const h = hash2(i * 17 + v * 5, 41 + v);
    const along = h % 2 === 0;
    const x = along ? 2 + ((h >> 2) % 12) : 0;
    const y = along ? 0 : 2 + ((h >> 2) % 12);
    p.px(x, y, MOSS.d).px(along ? x + 1 : x, along ? y : y + 1, MOSS.b);
    if (h % 3 === 0) p.px(along ? x : x + 1, along ? y + 1 : y, MOSS.d);
  }
  if (v === 6) {
    // moss growing out of a corner of the joints
    p.rect(1, 1, 3, 1, MOSS.d).px(1, 2, MOSS.d).px(1, 3, MOSS.d2).px(2, 1, MOSS.b).px(4, 1, MOSS.d2).px(2, 2, MOSS.d2);
  }
  if (v === 1 || v === 3) {
    // a crack across a slab, its lower lip catching the light
    const o = v === 1 ? 0 : 5;
    for (const [x, y] of [[3, 3], [4, 4], [5, 4], [6, 5], [7, 5]] as const) p.px(x + (o >> 1), y + o, FLAG.crack).px(x + (o >> 1), y + o + 1, FLAG.l2);
  }
  if (v === 7) {
    // an old rune worn into the stone
    rune(p, 3, 3, 3, FLAG.crack);
    p.px(2, 3, FLAG.l2).px(6, 6, FLAG.l2);
  }
  // grit
  p.px(2 + (hash2(v, 3) % 12), 2 + (hash2(v, 7) % 12), FLAG.l2).px(2 + (hash2(v, 13) % 12), 2 + (hash2(v, 17) % 12), FLAG.d);
  return p;
}

const FORGE = { joint: '#6a1e10', d: '#1c1a20', b: '#29262e', l: '#37333d' };

/** Surts smedja's floor: big black basalt slabs, their joints glowing dull red, now and then hotter. */
function forgeTile(v: number): Px {
  const p = new Px(16, 16);
  slabs(p, [0, 1, 4, 2, 3, 5][v]!, FORGE, 31 + v, '#2c1818');
  // hot spots along the joints
  for (let i = 0; i < 3; i++) {
    const h = hash2(i * 13 + v * 7, 59 + v);
    const k = 1 + ((h >> 2) % 14);
    p.px(h % 2 === 0 ? k : 0, h % 2 === 0 ? 0 : k, h % 5 === 0 ? EMBER.h : EMBER.m);
  }
  p.px(0, 0, EMBER.m);
  if (v === 1) {
    // a crack glowing from below
    for (const [x, y] of [[3, 3], [4, 4], [4, 5], [5, 6], [5, 7]] as const) p.px(x, y, EMBER.m).px(x + 1, y, '#3a1612');
    p.px(4, 5, EMBER.h);
  }
  if (v === 2) {
    // a slab warmed through
    paint(p, 10, 10, 5, 5, (x, y) => (Math.hypot(x + 0.5 - 12.5, y + 0.5 - 12.5) < 2.2 ? '#3e1a16' : null));
    p.px(12, 12, '#5a2216');
  }
  if (v === 5) rune(p, 9, 3, 1, '#4a1a12');
  return p;
}

export const cryptTiles = (): Px[] => n(8, cryptTile);
export const forgeTiles = (): Px[] => n(6, forgeTile);

// ---------------------------------------------------------------------------
// Walls (16×24 at oy -8), like the cave walls: the top 16 rows wrap every 16 px both ways, so a mass of walls is
// seamless; the lowest 8 rows (the lit lip and the face) only show where a wall has floor below it.
// ---------------------------------------------------------------------------

/** Courses of blocks seen from above: `joints(y)` the mortar columns of a row's course; courses `h` rows tall. */
function blockTop(p: Px, c: Pal, mortar: string, h: number, joints: (course: number) => number[], salt: number): Px {
  return paint(p, 0, 0, 16, 16, (x, y) => {
    const course = Math.floor(y / h);
    const yy = y % h;
    const j = joints(course);
    if (yy === h - 1 || j.includes(x)) return mortar;
    if (yy === 0 || j.includes((x + 15) % 16)) return c.l;
    if (yy === h - 2 || j.includes((x + 1) % 16)) return c.d;
    const g = grain(x, y, salt);
    return g > 0.38 ? c.l : g < -0.42 ? c.d : c.b;
  });
}

/** The tops of the crypt's walls: darker than the face and the floor, so the rooms' shapes read at a glance. */
const CRYPT_TOP = pal('#191d1a', '#272c28', '#363d36', '#475047', '#5b655a');

function wallCrypt(): Px {
  const p = new Px(16, 24);
  blockTop(p, CRYPT_TOP, '#121513', 8, (k) => (k % 2 ? [1, 9] : [5, 13]), 3);
  // moss on top of the blocks
  for (const [x, y, w] of [[2, 1, 4], [10, 9, 4], [14, 3, 2], [6, 12, 3]] as const) {
    p.rect(x, y, w, 1, MOSS.d).px(x, y, MOSS.b).px(x + 1, y, MOSS.l);
    if (w > 2) p.rect(x + 1, y + 1, w - 2, 1, MOSS.d2);
  }
  // the face: a lit lip with moss hanging over it, two courses of cut stone, a dark foot
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return x % 5 === 2 ? CRYPT.l : CRYPT.l2;
    if (r === 1) return CRYPT.d;
    if (r === 7) return CRYPT.d2;
    const course = r < 4 ? [2, 10] : [6, 14];
    if (r === 4 || course.includes(x)) return CRYPT.d2;
    if (r === 2 || r === 5 || course.includes((x + 15) % 16)) return CRYPT.b;
    return grain(x, y, 4) > 0.3 ? CRYPT.b : CRYPT.d;
  });
  for (const [x, len] of [[3, 3], [4, 2], [12, 4], [8, 1]] as const) {
    p.rect(x, 16, 1, len, MOSS.b).px(x, 16, MOSS.l).px(x, 15 + len, MOSS.d);
  }
  p.px(13, 17, MOSS.l).px(7, 21, CRYPT.l).px(1, 18, CRYPT.l);
  return p;
}

function wallIce(): Px {
  const p = new Px(16, 24);
  // blocks of deep blue ice with a little snow on each, so the walls stand out from the white floors
  paint(p, 0, 0, 16, 16, (x, y) => {
    const course = Math.floor(y / 8);
    const yy = y % 8;
    const j = course % 2 ? [3, 11] : [7, 15];
    if (yy === 7 || j.includes(x)) return ICE.d2;
    if (yy === 6 || j.includes((x + 1) % 16)) return ICE.d;
    if (yy === 0) return grain(x, y, 8) > -0.25 ? SNOW.l : ICE.l;
    if (j.includes((x + 15) % 16) || yy === 1) return ICE.l;
    const g = grain(x, y, 7);
    return (x + y * 2) % 9 === 0 ? ICE.l : g > 0.38 ? ICE.l : ICE.b;
  });
  for (const [x, y] of [[2, 3], [12, 12], [9, 4], [5, 11]] as const) p.px(x, y, '#ffffff');
  // the face: snow on the lip, blue ice bricks with streaks of light, icicles
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return SNOW.l2;
    if (r === 7) return ICE.d2;
    const course = r < 4 ? [4, 12] : [0, 8];
    if (r === 4 || course.includes(x)) return ICE.d;
    if ((x + r) % 7 === 0) return ICE.l2;
    return r === 1 ? SNOW.d : ICE.b;
  });
  for (const [x, len] of [[1, 4], [5, 2], [9, 5], [13, 3]] as const) {
    p.rect(x, 17, 1, len, '#e4f6ff').px(x, 16 + len, '#a8d4f0');
    if (len > 3) p.px(x + 1, 17, '#cfeaff');
  }
  return p;
}

/** Tops of basalt columns: a honeycomb whose pattern repeats every 8 px, so it runs on across tiles. */
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

function wallForge(): Px {
  const p = new Px(16, 24);
  paint(p, 0, 0, 16, 16, (x, y) => {
    if (HONEYCOMB(x, y)) {
      // two of the joints glow
      const hot = Math.hypot(x - 4, y - 12) < 2.6 || Math.hypot(x - 13, y - 3) < 2;
      return hot ? EMBER.d : BASALT.d2;
    }
    if (HONEYCOMB(x, y - 1)) return BASALT.l;
    return grain(x, y, 9) > 0.4 ? BASALT.l : BASALT.b;
  });
  p.px(4, 12, EMBER.m).px(13, 3, EMBER.m);
  // the face: tall columns of basalt, embers glowing in the joints near the floor
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    const joint = x % 5 === 4;
    if (r === 0) return joint ? BASALT.b : BASALT.l2;
    if (r === 7) return joint ? EMBER.m : EMBER.d;
    if (joint) return r >= 4 ? EMBER.d : BASALT.d2;
    if (x % 5 === 0) return BASALT.l;
    return r === 1 ? BASALT.d : BASALT.b;
  });
  p.px(4, 21, EMBER.m).px(14, 22, EMBER.h).px(9, 22, EMBER.m);
  return p;
}

const sagaWall = (look: number): Px => (look === 1 ? wallIce() : look === 2 ? wallForge() : wallCrypt());

// ---------------------------------------------------------------------------
// The gate after the mid-boss (16×24 at oy -8): a portcullis under a lintel with a glowing rune, seen from the
// front where the corridor runs up and down, and on end (frame + 1) where it runs sideways
// ---------------------------------------------------------------------------

function sagaGate(look: number, side: boolean): Px {
  const p = new Px(16, 24);
  const bar = look === 1 ? ICE : IRON;
  const lintel = look === 1 ? ICE : look === 2 ? BASALT : CRYPT;
  const g = GLOW[look]!;
  if (!side) {
    // the bars: four thick ones, two cross bars, spikes at the foot
    for (const bx of [1, 5, 9, 13]) {
      paint(p, bx, 5, 2, 18, (x, y) => (y === 22 && x === bx + 1 ? null : x === bx ? bar.l : bar.d));
      p.px(bx, 22, bar.b);
    }
    for (const by of [10, 16]) p.rect(0, by, 16, 2, bar.b).rect(0, by, 16, 1, bar.l).px(2, by + 1, bar.l2).px(10, by + 1, bar.l2);
    for (const bx of [1, 5, 9, 13]) p.px(bx, 10, bar.l2).px(bx + 1, 17, bar.d2);
    // the lintel stone, its rune lit
    p.rect(0, 0, 16, 6, lintel.b).rect(0, 0, 16, 1, lintel.l2).rect(0, 1, 16, 1, lintel.l).rect(0, 5, 16, 1, lintel.d2).rect(0, 4, 16, 1, lintel.d);
    rune(p, 6, 1, look * 2 + 1, g.mid);
    p.px(7, 1, g.core);
    if (look === 2) p.rect(0, 21, 16, 1, EMBER.d).px(2, 22, EMBER.m).px(10, 22, EMBER.m);
    if (look === 1) p.px(3, 7, '#ffffff').px(11, 13, '#ffffff');
  } else {
    // on end: two heavy rails with the cross bars between them, seen from above, a rune glowing down the middle
    paint(p, 3, 0, 10, 24, (x, y) => {
      const rail = x <= 4 || x >= 11;
      if (rail) return x === 3 ? bar.l : x === 4 ? bar.b : x === 11 ? bar.d : bar.d2;
      if (y % 4 === 1) return bar.l;
      if (y % 4 === 2) return bar.d;
      return null;
    });
    for (let y = 3; y < 22; y += 8) p.rect(7, y, 2, 3, g.mid).px(7, y + 1, g.core);
    p.rect(3, 22, 10, 2, bar.d2).px(5, 23, bar.l).px(10, 23, bar.l);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Torches (16×24 at oy -24: hung on the wall face above their tile). Frames: the three looks, then the three
// again with the flame a step on. The crypt's a candle in an iron cup with a ghostly green flame, the castle's
// a lantern with a blue crystal, the forge's a fire basket.
// ---------------------------------------------------------------------------

function sagaTorch(look: number, f: number): Px {
  const p = new Px(16, 24);
  const g = GLOW[look]!;
  if (look === 0) {
    // the bracket on the wall, an iron cup, a fat candle dripping wax
    p.rect(6, 19, 4, 4, IRON.d).rect(6, 19, 4, 1, IRON.b).px(7, 21, IRON.l).px(8, 21, IRON.d2);
    p.rect(7, 16, 2, 3, IRON.d).px(7, 16, IRON.b);
    p.rect(4, 14, 8, 2, IRON.b).rect(4, 14, 8, 1, IRON.l).rect(5, 16, 6, 1, IRON.d);
    p.rect(5, 8, 6, 6, '#e8e0c8').rect(5, 8, 2, 6, '#fffaf0').rect(10, 9, 1, 5, '#c4b89c').px(9, 13, '#c4b89c');
    p.px(5, 10, '#fffaf0').px(5, 11, '#e8e0c8').rect(10, 8, 1, 3, '#fffaf0');
    p.px(8, 7, '#3a3026');
    p.outline(OUTLINE);
    flame(p, 8, 7, f ? 4 : 5, f ? 7 : 6, f ? 1 : -1, g.outer, g.mid, g.core);
    halo(p, 8, 4, 6, g.light, 0.28);
  } else if (look === 1) {
    // a hook from the wall, a lantern of iron and frosted glass round a glowing crystal
    p.rect(6, 20, 4, 3, IRON.d).rect(6, 20, 4, 1, IRON.b);
    p.rect(7, 16, 2, 4, IRON.d).rect(8, 4, 1, 2, IRON.d).rect(7, 3, 3, 1, IRON.b);
    p.rect(4, 6, 8, 1, IRON.b).rect(5, 5, 6, 1, IRON.l).rect(4, 15, 8, 1, IRON.d).rect(5, 16, 6, 1, IRON.d2);
    paint(p, 4, 7, 8, 8, (x) => (x === 4 || x === 11 ? IRON.d : x === 7 || x === 8 ? null : '#9cd8f4'));
    p.rect(4, 7, 1, 8, IRON.b);
    shard(p, 8, 14, 3, f ? 7 : 6, f ? 1 : 0, pal('#3a8ac0', '#70c8f0', '#b4ecff', '#e8faff', '#ffffff'));
    p.px(6, 8, '#e8faff').px(10, 12, '#e8faff');
    p.outline(OUTLINE);
    halo(p, 8, 10, 7, g.light, f ? 0.3 : 0.24);
    if (f) twinkle(p, 11, 6, '#d8f6ff');
  } else {
    // a fire basket on an arm from the wall, glowing coals, flames licking up
    p.rect(6, 19, 4, 4, IRON.d).rect(6, 19, 4, 1, IRON.b);
    p.rect(7, 15, 2, 4, IRON.d).px(7, 15, IRON.b);
    paint(p, 3, 10, 10, 6, (x, y) => {
      const half = 5 - (y - 10) * 0.6;
      const u = Math.abs(x + 0.5 - 8) / half;
      if (u > 1) return null;
      if (y === 10) return IRON.l;
      return x % 3 === 0 ? IRON.b : y > 13 ? IRON.d : EMBER.d;
    });
    p.px(5, 11, EMBER.m).px(8, 11, EMBER.h).px(10, 11, EMBER.m).px(7, 12, EMBER.m);
    p.outline(OUTLINE);
    flame(p, 8, 10, f ? 7 : 8, f ? 9 : 8, f ? -1 : 1, g.outer, g.mid, g.core);
    flame(p, f ? 5 : 11, 10, 3, f ? 4 : 5, 0, g.outer, g.mid, g.mid);
    halo(p, 8, 5, 7, g.light, 0.26);
  }
  return p;
}

// ---------------------------------------------------------------------------
// The way out (flat, 16×16): stairs going up to the daylight
// ---------------------------------------------------------------------------

function sagaExit(look: number): Px {
  const p = new Px(16, 16);
  const side = look === 1 ? ICE : look === 2 ? BASALT : CRYPT;
  // the steps, lit more and more by the day at the top
  const steps = ['#fffbe8', '#f4e8c0', '#d8caa0', '#b0a684', '#8a8470'];
  const stepsIce = ['#ffffff', '#eef8ff', '#cfe6f6', '#a8c8e4', '#86a8c8'];
  const stepsForge = ['#fff4d8', '#e8d4b0', '#a89480', '#6e6268', '#4a4450'];
  const S = look === 1 ? stepsIce : look === 2 ? stepsForge : steps;
  paint(p, 0, 0, 16, 16, (x, y) => {
    if (x <= 1 || x >= 14) return x === 0 || x === 15 ? side.d2 : x === 1 ? side.l : side.d;
    const i = Math.min(4, Math.floor(y / 3));
    const r = y % 3;
    if (r === 2) return shade(S[i]!, 0.72);
    return r === 0 ? S[i]! : shade(S[i]!, 0.92);
  });
  // the sunbeam slanting in from the top-left
  paint(p, 2, 0, 12, 16, (x, y) => {
    const d = x - y * 0.6;
    if (d < 2 || d > 6) return null;
    const i = Math.min(4, Math.floor(y / 3));
    return y % 3 === 2 ? null : shade(S[Math.max(0, i - 1)]!, 1.04);
  });
  p.rect(2, 0, 12, 1, '#ffffff');
  if (look === 0) p.px(1, 6, MOSS.b).px(1, 7, MOSS.d).px(14, 11, MOSS.b);
  if (look === 1) p.px(2, 13, '#ffffff').px(3, 10, '#ffffff').px(13, 4, '#ffffff');
  if (look === 2) p.px(1, 12, EMBER.m).px(14, 8, EMBER.d);
  return p;
}

// ---------------------------------------------------------------------------
// Rest stones (16×28 at oy -12): a runestone with a carved serpent band; lit, its runes glow and it heals.
// Frames: dormant, lit, then both again with the glow a step on.
// ---------------------------------------------------------------------------

function sagaRest(lit: boolean, f: number): Px {
  const p = new Px(16, 28);
  const S = pal('#3a3e44', '#575c63', '#7a8088', '#9aa0a8', '#babfc6');
  // a rough standing stone, its top worn to a slant, in a few stones
  paint(p, 2, 2, 12, 23, (x, y) => {
    const u = (x + 0.5 - 2) / 12; // 0 at its left edge, 1 at its right
    const top = 3 + u * 4 + (u < 0.15 ? (0.15 - u) * 14 : 0) + (u > 0.85 ? (u - 0.85) * 18 : 0);
    if (y + 0.5 < top) return null;
    const dx = (x + 0.5 - 8) / 6;
    return tone(S, light(dx, (y - 14) / 14 - (y < top + 1.5 ? 0.6 : 0), 0.75) + 0.22 * grain(x, y, 12));
  });
  lump(p, 0, 22, 6, 5, STONE, 0.2, 3);
  lump(p, 10, 23, 6, 4, STONE, 0.2, 4);
  lump(p, 5, 24, 6, 3, STONE, 0.2, 5);
  p.px(4, 13, S.d2).px(5, 14, S.d2).px(11, 20, S.d2).px(12, 21, S.d);
  // three runes down its middle: life, the World Tree's seed and the sun
  const cut = lit ? (f ? RUNE.core : RUNE.l) : S.d2;
  const edge = lit ? RUNE.b : S.d;
  p.tpl(5, 6, ['#.#.#', '.###.', '..#..', '..#..'], { '#': cut });
  p.tpl(6, 11, ['.#.', '#.#', '.#.'], { '#': cut });
  p.tpl(6, 15, ['##.', '.#.', '.##', '..#'].map((r) => r), { '#': cut });
  for (const [x, y] of [[5, 10], [10, 10], [4, 17], [11, 16]] as const) p.px(x, y, edge);
  p.outline(OUTLINE);
  if (lit) {
    glowOn(p, 8, 13, 9, RUNE.l, f ? 0.24 : 0.15);
    halo(p, 8, 13, 10, RUNE.b, f ? 0.3 : 0.2);
    twinkle(p, f ? 2 : 14, f ? 7 : 11, RUNE.l, RUNE.core);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Chests (24×20 at ox -4, oy -4, the small ones in the middle of it): 0 the side room's treasure, 1 the mid-boss's
// (iron-bound, a blue gem), 2 the boss's (gilded, gems, gold spilling round its foot)
// ---------------------------------------------------------------------------

function sagaChest(kind: number): Px {
  if (kind === 2) return bossChest();
  return new Px(24, 20).blit(smallChest(kind), 4, 4);
}

function smallChest(kind: number): Px {
  const p = new Px(16, 16);
  const w = kind === 1 ? pal('#24160c', '#3a2414', '#5a3a22', '#7a5434', '#9a7048') : WOOD;
  const b = kind === 1 ? pal('#5a6474', '#8a94a4', '#c4ccd8', '#e8eef4', '#ffffff') : IRON;
  // a rounded lid over a full box, a little treasure glinting through the seam
  p.rect(3, 3, 10, 1, w.l).rect(2, 4, 12, 1, w.l).rect(1, 5, 14, 3, w.b).rect(1, 5, 1, 3, w.l).rect(14, 5, 1, 3, w.d).rect(3, 4, 6, 1, w.l2);
  p.rect(1, 7, 14, 1, w.d).rect(1, 8, 14, 1, w.d2).px(5, 8, GOLD.l).px(6, 8, GOLD.l2).px(10, 8, GOLD.l);
  p.rect(1, 9, 14, 6, w.b).rect(1, 9, 14, 1, w.l).rect(1, 10, 1, 5, w.l).rect(14, 10, 1, 5, w.d).rect(2, 14, 13, 1, w.d).rect(2, 12, 12, 1, w.d);
  for (const bx of [3, 11]) p.rect(bx, 3, 2, 5, b.b).px(bx, 4, b.l).px(bx + 1, 7, b.d).rect(bx, 9, 2, 6, b.b).px(bx, 9, b.l).px(bx + 1, 14, b.d);
  if (kind === 1) {
    // a silver clasp with a blue gem, knotwork on the lid
    p.rect(6, 6, 4, 5, b.b).rect(6, 6, 4, 1, b.l).px(9, 10, b.d);
    p.rect(7, 7, 2, 2, '#3a7ae8').px(7, 7, '#9ac8ff').px(8, 8, '#1a4ab0');
    p.px(6, 4, b.l).px(9, 4, b.l).px(7, 5, b.b).px(8, 5, b.b);
  } else {
    p.rect(7, 6, 2, 4, GOLD.b).px(7, 6, GOLD.l2).px(8, 9, GOLD.d).px(7, 8, GOLD.d2);
    // a carved knot on the lid
    p.px(6, 4, w.d).px(7, 5, w.d).px(8, 4, w.d).px(9, 5, w.d);
  }
  p.outline(OUTLINE);
  twinkle(p, 14, 2);
  return p;
}

function bossChest(): Px {
  const p = new Px(24, 20);
  const w = pal('#4a1a12', '#6a2418', '#8e3420', '#b44a2a', '#d0683a');
  // coins and a gem heaped round the foot
  for (const [x, y] of [[1, 17], [3, 18], [20, 17], [22, 18], [18, 18], [5, 18]] as const) p.rect(x, y, 2, 1, GOLD.b).px(x, y, GOLD.l2).px(x + 1, y + 1, GOLD.d);
  // the domed lid with gold bands and a row of gems
  paint(p, 2, 1, 20, 8, (x, y) => {
    const dy = (y + 0.5 - 9) / 8;
    const dx = (x + 0.5 - 12) / 10;
    if (dy * dy + dx * dx * 0.12 > 1) return null;
    if (x === 6 || x === 7 || x === 16 || x === 17) return y < 3 ? GOLD.l2 : GOLD.b;
    return tone(w, light(dx * 0.6, dy, 0.6));
  });
  p.rect(2, 7, 20, 2, GOLD.b).rect(2, 7, 20, 1, GOLD.l2).rect(2, 9, 20, 1, GOLD.d2);
  for (const [x, c] of [[4, '#e83a3a'], [11, '#3a8ae8'], [19, '#3ac85a']] as const) p.rect(x, 4, 2, 2, c).px(x, 4, '#ffffff');
  // the box
  p.rect(2, 10, 20, 8, w.b).rect(2, 10, 20, 1, w.l).rect(2, 11, 1, 7, w.l).rect(21, 11, 1, 7, w.d).rect(3, 17, 19, 1, w.d2).rect(3, 14, 18, 1, w.d);
  for (const bx of [6, 16]) p.rect(bx, 10, 2, 8, GOLD.b).px(bx, 10, GOLD.l2).px(bx + 1, 17, GOLD.d);
  p.rect(2, 16, 20, 1, GOLD.d);
  // the big clasp: a gold plate with a sun
  p.rect(10, 8, 4, 6, GOLD.b).rect(10, 8, 4, 1, GOLD.l2).rect(10, 13, 4, 1, GOLD.d).px(11, 10, '#ff8a2a').px(12, 10, '#ffd23f').px(11, 11, '#ffd23f').px(12, 11, '#ff8a2a');
  p.outline(OUTLINE);
  twinkle(p, 21, 2);
  twinkle(p, 3, 15, '#fff3b0');
  return p;
}

// ---------------------------------------------------------------------------
// Draugkryptan's things: stone coffins, bones, candles, urns (three of each, picked at random)
// ---------------------------------------------------------------------------

/** A stone coffin (16×20 at oy -4) seen from above and in front: 0 a lid carved with a knot, 1 the lid pushed down
 * and two little eyes peeking out of the dark, 2 an old wooden one under a cobweb. */
function coffin(v: number): Px {
  const p = new Px(16, 20);
  const c = v === 2 ? WOOD : CRYPT;
  // the classic shape: widest at the shoulders
  const shape = (x: number, y: number, y0: number, y1: number) => {
    const t = (y - y0) / (y1 - y0);
    const half = t < 0.3 ? 4.5 + t * 6.5 : 6.4 - (t - 0.3) * 4.2;
    return Math.abs(x + 0.5 - 8) <= half;
  };
  // the box's front, then the lid on top
  paint(p, 1, 12, 14, 7, (x, y) => (shape(x, 13, 1, 13) ? (y === 18 ? c.d2 : y === 12 ? c.l : x < 4 ? c.b : c.d) : null));
  const lid = (dy: number) =>
    paint(p, 1, 1 + dy, 14, 13, (x, y) => {
      if (!shape(x, y - dy, 1, 13) || y > 14) return null;
      const u = (x + 0.5 - 8) / 6;
      if (y === 1 + dy || !shape(x, y - dy - 1, 1, 13)) return c.l2;
      return u < -0.6 ? c.l : u > 0.6 ? c.d : grain(x, y, 6) > 0.4 ? c.l : c.b;
    });
  if (v === 1) {
    // the dark inside where the lid has slid down, and someone in there looking out
    paint(p, 1, 1, 14, 13, (x, y) => (shape(x, y, 1, 13) ? VOID : null));
    p.px(6, 3, '#c8ff8a').px(9, 3, '#c8ff8a').px(6, 4, '#5ae05a').px(9, 4, '#5ae05a');
    lid(4);
    p.rect(3, 5, 10, 1, c.d2);
  } else lid(0);
  if (v === 0) {
    // a carved ring knot on the lid, a rune at its foot
    paint(p, 4, 3, 8, 8, (x, y) => {
      const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 7);
      return r > 2 && r < 3.3 ? c.d : null;
    });
    p.px(8, 7, c.d).px(5, 5, c.l2);
    rune(p, 7, 11, 2, c.d);
  }
  if (v === 2) {
    for (const y of [4, 9]) p.rect(3, y, 10, 1, IRON.b).px(3, y, IRON.l);
    p.rect(7, 2, 2, 10, c.d);
  }
  p.outline(OUTLINE);
  if (v === 2) {
    // a cobweb in the corner, with a tiny smiling spider
    p.line(0, 0, 5, 3, '#d8d8d8').line(0, 0, 2, 6, '#d8d8d8').line(3, 1, 1, 4, '#bdbdbd').line(5, 3, 2, 6, '#bdbdbd');
    p.rect(4, 6, 2, 2, '#2a2430').px(4, 6, '#ffffff');
  }
  return p;
}

/** Bones on the floor (flat): 0 a round, friendly skull and two bones, 1 a ribcage and a bone, 2 an old helmet. */
function boneHeap(v: number): Px {
  const p = new Px(16, 16);
  const bone = (x0: number, y0: number, x1: number, y1: number) => {
    p.line(x0, y0, x1, y1, BONE.b).line(x0, y0 - 1, x1, y1 - 1, BONE.l);
    for (const [x, y] of [[x0, y0], [x1, y1]] as const) p.rect(x - 1, y - 1, 2, 2, BONE.l).px(x - 1, y, BONE.b).px(x, y + 1, BONE.d);
  };
  const skull = (cx: number, cy: number) => {
    paint(p, cx - 4, cy - 4, 9, 8, (x, y) => {
      const dx = (x + 0.5 - cx) / 4;
      const dy = (y + 0.5 - cy) / 3.4;
      if (dx * dx + dy * dy > 1) return null;
      return tone(BONE, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
    });
    p.rect(cx - 2, cy + 3, 5, 2, BONE.b).rect(cx - 2, cy + 3, 5, 1, BONE.l).px(cx - 1, cy + 4, BONE.d).px(cx + 1, cy + 4, BONE.d);
    p.rect(cx - 2, cy - 1, 2, 2, '#3a3026').rect(cx + 1, cy - 1, 2, 2, '#3a3026').px(cx - 2, cy - 1, '#ffffff').px(cx + 1, cy - 1, '#ffffff');
  };
  if (v === 0) {
    bone(2, 13, 9, 12);
    bone(10, 14, 14, 11);
    skull(9, 6);
  } else if (v === 1) {
    // a little ribcage lying on its side
    p.rect(3, 6, 1, 7, BONE.l).rect(3, 12, 9, 1, BONE.b);
    for (let i = 0; i < 4; i++) p.line(4, 7 + i * 2, 9 - (i === 3 ? 1 : 0), 6 + i * 2, BONE.b).px(4, 7 + i * 2, BONE.l2);
    bone(9, 3, 14, 5);
  } else {
    // a dented iron helmet, a bone poking out from under it
    bone(9, 13, 14, 10);
    paint(p, 2, 4, 10, 8, (x, y) => {
      const dx = (x + 0.5 - 7) / 5;
      const dy = (y + 0.5 - 10) / 6;
      if (dx * dx + dy * dy > 1 || y > 10) return null;
      return tone(IRON, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.2));
    });
    p.rect(2, 10, 10, 1, IRON.d).rect(6, 10, 2, 3, IRON.b).px(6, 12, IRON.d).px(5, 6, IRON.l2);
  }
  return p.outline(OUTLINE);
}

/** Candles (16×20 at oy -4), warm little flames: 0 a cluster on a puddle of wax, 1 on a skull, 2 an iron candelabra. */
function candles(v: number, f: number): Px {
  const p = new Px(16, 20);
  const wax = pal('#9a8a6a', '#c8b890', '#ece2c4', '#fbf6e6', '#ffffff');
  const candle = (x: number, foot: number, h: number) => {
    p.rect(x, foot - h, 2, h, wax.b).px(x, foot - h, wax.l2).rect(x + 1, foot - h + 1, 1, h - 1, wax.d);
    p.px(x, foot - h + 1 + (x % 3), wax.l);
  };
  const tops: [number, number][] = [];
  if (v === 0) {
    p.ellipse(1, 15, 14, 4, wax.d).ellipse(2, 15, 12, 3, wax.b);
    for (const [x, h] of [[3, 7], [6, 11], [10, 9], [12, 5]] as const) {
      candle(x, 17, h);
      tops.push([x + 1, 17 - h]);
    }
  } else if (v === 1) {
    // a round skull wearing a candle like a hat
    paint(p, 2, 9, 12, 10, (x, y) => {
      const dx = (x + 0.5 - 8) / 5.5;
      const dy = (y + 0.5 - 13.5) / 4.6;
      if (dx * dx + dy * dy > 1) return null;
      return tone(BONE, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
    });
    p.rect(5, 13, 2, 2, '#3a3026').rect(9, 13, 2, 2, '#3a3026').px(5, 13, '#ffffff').px(9, 13, '#ffffff');
    p.rect(6, 17, 4, 1, BONE.d).px(7, 16, BONE.d);
    candle(7, 10, 6);
    tops.push([8, 4]);
    p.rect(6, 9, 4, 1, wax.l).px(5, 10, wax.b).px(10, 11, wax.b);
  } else {
    // three arms of black iron on a little foot
    p.rect(7, 12, 2, 6, IRON.d).rect(5, 17, 6, 2, IRON.d).rect(5, 17, 6, 1, IRON.b);
    p.rect(2, 11, 12, 1, IRON.b);
    for (const [x, h] of [[1, 5], [6, 7], [11, 5]] as const) {
      p.rect(x, 9, 4, 1, IRON.l).rect(x + 1, 10, 2, 1, IRON.d);
      candle(x + 1, 9, h);
      tops.push([x + 2, 9 - h]);
    }
  }
  p.outline(OUTLINE);
  for (const [x, y] of tops) {
    const tall = (x + y + f) % 2 === 0;
    flame(p, x, y, 3, tall ? 5 : 4, f ? 0.6 : -0.6, '#f08a24', '#ffd23a', '#fff6c8');
    p.px(x, y, '#3a3026');
  }
  return halo(p, 8, tops[0]![1] + 2, 8, '#ffcc66', 0.16);
}

/** A burial urn (16×20 at oy -4): 0 tall with a lid, 1 round and squat, 2 cracked with old coins showing. */
function urn(v: number): Px {
  const p = new Px(16, 20);
  const c = pal('#5a2e1c', '#7a4228', '#9e5a36', '#c07a4e', '#d89a6a');
  const w = v === 1 ? 6.6 : 5.6;
  paint(p, 1, 4, 14, 15, (x, y) => {
    const t = (y - 4) / 14;
    const half = v === 1 ? w * Math.sin(Math.PI * (0.15 + t * 0.8)) + 0.8 : w * Math.sin(Math.PI * (0.12 + t * 0.78)) + 1;
    const u = (x + 0.5 - 8) / half;
    if (Math.abs(u) > 1 || t < 0) return null;
    return tone(c, light(u, t - 0.5, Math.sqrt(Math.max(0, 1 - u * u))) + 0.12 * grain(x, y, 15));
  });
  // a band of runes round its belly
  const by = v === 1 ? 10 : 9;
  p.rect(2, by, 12, 2, c.d).rect(2, by, 12, 1, c.d2);
  for (let x = 3; x < 13; x += 3) p.px(x, by + 1, '#e8c890');
  p.rect(5, 3, 6, 2, c.b).rect(5, 3, 6, 1, c.l).rect(6, 2, 4, 1, c.d);
  if (v === 0) p.rect(4, 1, 8, 2, c.d).rect(5, 0, 6, 1, c.b).rect(7, 0, 2, 1, c.l2);
  if (v === 2) {
    p.line(10, 5, 8, 9, c.d2).line(8, 9, 10, 13, c.d2).px(9, 6, VOID).px(9, 11, VOID);
    p.rect(9, 16, 2, 1, GOLD.b).px(9, 16, GOLD.l2).rect(12, 17, 2, 1, GOLD.b).px(12, 17, GOLD.l2);
  }
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// Frostjättens borg's things: glowing ice crystals, frozen pillars, snowdrifts
// ---------------------------------------------------------------------------

const FROST = pal('#2a6aa0', '#4a9ad0', '#8ad8f8', '#ccf2ff', '#ffffff');

/** Ice crystals (16×24 at oy -8) with a cold light in them: 0 a cluster, 1 one tall spike, 2 a flower of shards. */
function iceCrystal(v: number, f: number): Px {
  const p = new Px(16, 24);
  lump(p, 2, 18, 12, 5, SNOW, 0.1, 21);
  if (v === 0) {
    shard(p, 5, 21, 4, 11, -2, FROST);
    shard(p, 11, 21, 4, 9, 2, FROST);
    shard(p, 8, 21, 5, 17, 0, FROST);
  } else if (v === 1) {
    shard(p, 8, 21, 6, 21, 1, FROST);
    shard(p, 4, 21, 3, 6, -2, FROST);
  } else {
    for (const [x, h, lean] of [[3, 8, -3], [13, 8, 3], [6, 13, -1], [10, 13, 1], [8, 16, 0]] as const) shard(p, x, 21, 3, h, lean, FROST);
  }
  p.outline('#1e3a5a');
  glowOn(p, 8, 12, 9, '#e8faff', f ? 0.2 : 0.12);
  twinkle(p, f ? 6 : 10, f ? 7 : 11, '#d8f6ff');
  return p;
}

/** A pillar locked in ice (16×32 at oy -16): 0 whole, 1 broken off, 2 with an old shield frozen into it. */
function frozenPillar(v: number): Px {
  const p = new Px(16, 32);
  const top = v === 1 ? 10 : 2;
  // the stone column inside, then the ice over it
  paint(p, 4, top + 2, 8, 28 - top, (x) => (x === 4 ? STONE.l : x === 11 ? STONE.d : x === 8 ? STONE.d : STONE.b));
  if (v !== 1) p.rect(3, top, 10, 3, STONE.l).rect(3, top, 10, 1, STONE.l2).rect(3, top + 2, 10, 1, STONE.d);
  else p.px(4, top + 1, STONE.l2).px(6, top, STONE.l).px(9, top + 1, STONE.l).px(10, top, STONE.b);
  if (v === 2) {
    // a round shield, red and white
    paint(p, 4, 14, 8, 8, (x, y) => {
      const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 18);
      return r > 4 ? null : r < 1.3 ? '#c0c4cc' : r > 3.2 ? '#6a4a2a' : Math.floor(Math.atan2(y + 0.5 - 18, x + 0.5 - 8) / (Math.PI / 2) + 4) % 2 ? '#d84a3a' : '#f0e8d8';
    });
  }
  p.rect(2, 28, 12, 4, STONE.b).rect(2, 28, 12, 1, STONE.l).rect(2, 31, 12, 1, STONE.d);
  // the ice: see-through blue over everything, lit edges, a cap of snow and icicles
  p.ctx.fillStyle = 'rgba(150,215,250,0.45)';
  p.ctx.fillRect(2, top, 12, 30 - top);
  p.ctx.fillStyle = 'rgba(230,248,255,0.8)';
  p.ctx.fillRect(2, top, 1, 30 - top);
  p.ctx.fillRect(5, top + 3, 1, 9);
  p.ctx.fillStyle = 'rgba(60,120,180,0.55)';
  p.ctx.fillRect(13, top, 1, 30 - top);
  lump(p, 1, top - 2, 14, 4, SNOW, 0.1, 23);
  for (const [x, len] of [[3, 3], [7, 5], [12, 2]] as const) p.rect(x, top + 2, 1, len, '#e4f6ff').px(x, top + 1 + len, '#a8d4f0');
  p.outline('#1e3a5a');
  twinkle(p, 4, top + 6, '#e8faff');
  return p;
}

/** A snowdrift on the floor (flat 16×16): 0 a soft heap, 1 a pile of snowballs, 2 a heap with a tiny snow hare. */
function snowdrift(v: number): Px {
  const p = new Px(16, 16);
  // shaded blue underneath, so it shows as a heap even on a snowy floor
  const drift = pal('#7e98b6', '#a2bad4', '#d4e2f0', '#f0f6fb', '#ffffff');
  p.ellipse(1, 12, 14, 4, '#9cb4cc');
  lump(p, 1, 6, 14, 9, drift, 0.08, 31, 0.15);
  lump(p, 4, 4, 8, 7, drift, 0.08, 32, 0.2);
  if (v === 1) {
    for (const [x, y] of [[3, 9], [8, 9], [5, 5], [11, 10]] as const) lump(p, x, y, 4, 4, SNOW, 0.05, x + y, 0.6);
  }
  if (v === 2) {
    // a tiny hare made of snow, with twig ears and a berry nose
    lump(p, 9, 4, 5, 4, SNOW, 0.05, 41, 0.6);
    p.rect(10, 1, 1, 3, '#7a5230').rect(12, 1, 1, 3, '#7a5230').px(13, 6, '#d83a3a').px(11, 5, '#2a2430');
  }
  p.outline('#7a8ea8');
  p.px(4, 7, '#ffffff').px(10, 9, '#ffffff');
  return p;
}

// ---------------------------------------------------------------------------
// Surts smedja's things: anvils, fire braziers, glowing cracks in the floor
// ---------------------------------------------------------------------------

/** An anvil on a stump (16×20 at oy -4): 0 bare, 1 a hammer leaning on it, 2 a sword blank glowing on top. */
function anvil(v: number): Px {
  const p = new Px(16, 20);
  // the stump
  p.rect(4, 13, 8, 6, WOOD.b).rect(4, 13, 8, 1, WOOD.l).rect(4, 14, 1, 5, WOOD.l).rect(11, 14, 1, 5, WOOD.d).rect(5, 18, 7, 1, WOOD.d2);
  p.px(7, 13, WOOD.d).px(8, 13, WOOD.d);
  // the anvil: a horn to the left, a flat face, a waist and a foot
  paint(p, 0, 6, 16, 7, (x, y) => {
    if (y <= 8) {
      const horn = x < 4 ? y === 7 || (y === 8 && x > 1) : true;
      if (!horn || x > 14) return null;
      return y === 6 ? (x < 4 ? null : IRON.l2) : y === 7 ? IRON.l : IRON.b;
    }
    if (y <= 10) return x >= 5 && x <= 10 ? (x === 5 ? IRON.b : IRON.d) : null;
    return x >= 3 && x <= 12 ? (y === 11 ? IRON.b : IRON.d) : null;
  });
  p.rect(1, 7, 3, 1, IRON.l).px(0, 7, IRON.b);
  if (v === 1) p.line(13, 18, 15, 9, WOOD.l).line(14, 18, 15, 11, WOOD.d).rect(13, 6, 3, 3, IRON.b).px(13, 6, IRON.l2);
  if (v === 2) p.rect(3, 5, 9, 1, EMBER.h).px(11, 5, EMBER.hot).rect(1, 5, 2, 1, IRON.d).px(4, 5, '#ffd27a');
  p.outline(OUTLINE);
  if (v === 2) halo(p, 7, 5, 5, '#ff9a3a', 0.3);
  return p;
}

/** A fire brazier (16×26 at oy -10): 0 an iron bowl on three legs, 1 a stone pillar with a fire on top, 2 a bowl
 * held up by a little iron dragon. */
function brazier(v: number, f: number): Px {
  const p = new Px(16, 26);
  const g = GLOW[2]!;
  if (v === 1) {
    p.rect(4, 14, 8, 11, STONE.b).rect(4, 14, 1, 11, STONE.l).rect(11, 14, 1, 11, STONE.d).rect(3, 23, 10, 3, STONE.d).rect(3, 23, 10, 1, STONE.b);
    p.rect(3, 12, 10, 3, STONE.l).rect(3, 12, 10, 1, STONE.l2);
    rune(p, 7, 17, 4, EMBER.m);
  } else {
    // legs
    p.line(4, 24, 6, 15, IRON.d).line(12, 24, 10, 15, IRON.d).rect(7, 15, 2, 9, IRON.b).px(4, 24, IRON.b).px(12, 24, IRON.b);
    if (v === 2) p.tpl(5, 16, ['..##..', '.#..#.', '#.##.#'], { '#': IRON.l });
  }
  // the bowl of glowing coals
  paint(p, 2, 9, 12, 5, (x, y) => {
    const half = 6 - (y - 9) * 0.8;
    const u = Math.abs(x + 0.5 - 8) / half;
    if (u > 1) return null;
    return y === 9 ? IRON.l : u > 0.75 ? IRON.d : y < 11 ? EMBER.d : IRON.b;
  });
  p.px(5, 10, EMBER.h).px(9, 10, EMBER.m).px(7, 10, EMBER.hot);
  p.outline(OUTLINE);
  flame(p, 8, 9, 8, f ? 10 : 9, f ? 1.2 : -1.2, g.outer, g.mid, g.core);
  flame(p, f ? 4 : 12, 9, 3, f ? 4 : 6, 0, g.outer, g.mid, g.mid);
  flame(p, f ? 11 : 5, 9, 3, f ? 5 : 3, 0, g.outer, g.mid, g.mid);
  return halo(p, 8, 4, 8, g.light, 0.22);
}

/** A crack in the floor with lava glowing in it (flat 16×16): 0 a jagged crack, 1 a forked one, 2 a little pool. */
function lavaCrack(v: number, f: number): Px {
  const p = new Px(16, 16);
  const hot = f ? EMBER.hot : EMBER.h;
  const draw = (pts: [number, number][], w: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      for (let t = 0; t <= 1; t += 0.1) {
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        p.rect(x - 1, y - 1, w + 2, 3, '#2a1612').rect(x, y, w, 1, EMBER.m);
      }
    }
    for (let i = 1; i + 1 < pts.length; i++) p.px(pts[i]![0], pts[i]![1], hot);
  };
  if (v === 0) draw([[2, 3], [5, 6], [7, 6], [9, 10], [13, 12]], 1);
  else if (v === 1) {
    draw([[3, 13], [6, 9], [8, 8], [12, 3]], 1);
    draw([[8, 8], [12, 11]], 1);
  } else {
    paint(p, 3, 4, 10, 8, (x, y) => {
      const r = Math.hypot((x + 0.5 - 8) / 5, (y + 0.5 - 8) / 4);
      return r > 1 ? null : r > 0.8 ? '#2a1612' : r > 0.55 ? EMBER.m : r > 0.3 ? EMBER.h : hot;
    });
    p.px(4, 4, EMBER.d).px(12, 11, EMBER.d);
  }
  return p;
}

// ---------------------------------------------------------------------------
// The arches out in the world (48×56 at oy -24, a 3×2 footprint walked into from below): 0 a barrow of the dead in
// the forest, mossy, its doorway glowing green; 1 an ice castle's gatehouse in the snow; 2 an iron door into the
// volcano between two fires. Frames: the three, then the three with their doorways' glow a step on.
// ---------------------------------------------------------------------------

/** The dark doorway (an arch from `top` to the bottom of the picture, half width `hw`), the glow deep inside. */
function doorway(p: Px, cx: number, top: number, hw: number, bottom: number, glow: string, glowCore: string, f: number): Px {
  paint(p, cx - hw - 1, top, hw * 2 + 2, bottom - top, (x, y) => {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) > hw) return null;
    const yc = top + hw;
    if (y + 0.5 < yc && dx * dx + (y + 0.5 - yc) ** 2 > hw * hw) return null;
    const deep = bottom - y;
    return deep < 3 ? '#2a2620' : VOID;
  });
  // light rising from deep inside: bright on the lowest steps, fading upwards in dithered rows, a few motes in it
  paint(p, cx - hw + 1, top, hw * 2 - 2, bottom - top, (x, y) => {
    const up = bottom - 3 - y;
    if (up < 0) return null;
    const reach = f ? 9 : 8;
    if (up < 2) return glowCore;
    if (up < reach * 0.5) return glow;
    return up < reach && (x + y) % 2 === 0 ? glow : null;
  });
  const motes: [number, number][] = f ? [[-2, 9], [3, 13]] : [[2, 8], [-3, 12]];
  for (const [mx, my] of motes) p.px(cx + mx, bottom - my, glowCore);
  // steps going down into it
  for (let i = 0; i < 3; i++) p.rect(cx - hw + 1 + i, bottom - 2 - i * 2, hw * 2 - 2 - i * 2, 1, i === 0 ? '#6a6458' : '#3a3630');
  return p;
}

function barrow(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[0]!;
  // the grassy mound
  paint(p, 0, 6, 48, 50, (x, y) => {
    const dx = (x + 0.5 - 24) / 23.5;
    const dy = (y + 0.5 - 56) / 46;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    const v = light(dx, dy, Math.sqrt(1 - r) + 0.3) + 0.25 * grain(x, y, 61);
    return tone(pal('#1e3a1a', '#2e5626', '#447a34', '#5e9a44', '#86bc5c'), v);
  });
  // grass tufts and little flowers on it
  for (const [x, y] of [[10, 14], [20, 9], [31, 10], [38, 17], [6, 26], [42, 28], [15, 20], [33, 19]] as const) p.px(x, y, '#9ad06a').px(x + 1, y - 1, '#6aa04a').px(x - 1, y - 1, '#6aa04a');
  for (const [x, y, c] of [[13, 11, '#ffffff'], [36, 13, '#f5e04a'], [9, 31, '#e87ab8'], [40, 24, '#ffffff']] as const) p.px(x, y, c);
  // standing stones round the doorway: jambs and a lintel with runes
  const S = CRYPT;
  const stone = (x: number, y: number, w: number, h: number) => {
    p.rect(x, y, w, h, S.b).rect(x, y, w, 1, S.l2).rect(x, y + 1, 1, h - 1, S.l).rect(x + w - 1, y + 1, 1, h - 1, S.d).rect(x, y + h - 1, w, 1, S.d2);
  };
  stone(13, 28, 6, 28);
  stone(29, 28, 6, 28);
  stone(11, 22, 26, 7);
  for (let i = 0; i < 5; i++) rune(p, 14 + i * 4, 24, i + 1, S.d2);
  doorway(p, 24, 29, 5, 56, g.outer, g.mid, f);
  // moss over the lintel, roots hanging down, two smaller stones beside
  lump(p, 9, 19, 12, 5, MOSS, 0.2, 63, 0.5);
  lump(p, 26, 20, 14, 4, MOSS, 0.2, 64, 0.5);
  p.line(19, 29, 19, 33, '#3a2414').line(27, 29, 28, 32, '#3a2414').px(19, 29, '#7a5230');
  stone(3, 40, 6, 13);
  stone(39, 42, 5, 11);
  rune(p, 4, 43, 2, S.d2);
  rune(p, 40, 45, 4, S.d2);
  // a skull lantern by the door, glowing like the doorway
  p.rect(36, 49, 3, 7, IRON.d).rect(35, 46, 5, 4, BONE.l).px(36, 47, '#2a2430').px(38, 47, '#2a2430').px(37, 49, BONE.d);
  p.outline(OUTLINE);
  halo(p, 24, 47, 8, g.light, f ? 0.3 : 0.22);
  halo(p, 37, 44, 4, g.light, 0.3);
  p.px(37, 44, g.core);
  return p;
}

function iceGate(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[1]!;
  const block = (x0: number, y0: number, w: number, h: number) =>
    paint(p, x0, y0, w, h, (x, y) => {
      const course = Math.floor((y - y0) / 5);
      const yy = (y - y0) % 5;
      const xx = (x - x0 + (course % 2) * 4) % 8;
      if (yy === 4 || xx === 7) return ICE.d;
      if (yy === 0 || xx === 0) return ICE.l;
      return (x + y) % 11 === 0 ? ICE.l2 : x - x0 > w - 3 ? ICE.d : ICE.b;
    });
  // the wall between the towers, then the two towers with pointed roofs of ice
  block(4, 22, 40, 34);
  block(0, 12, 12, 44);
  block(36, 12, 12, 44);
  for (const tx of [0, 36]) {
    for (let i = 0; i < 12; i++) {
      const h = Math.round(10 - Math.abs(i + 0.5 - 6) * 1.7);
      p.rect(tx + i, 12 - h, 1, h, i < 6 ? FROST.l : FROST.b);
    }
    p.rect(tx, 12, 12, 1, SNOW.l2).rect(tx + 1, 13, 10, 1, SNOW.b);
    p.rect(tx + 4, 20, 4, 6, '#1e3a5a').rect(tx + 4, 20, 4, 1, ICE.l2).px(tx + 5, 22, g.mid).px(tx + 6, 22, g.core);
  }
  // battlements on the wall
  for (let x = 12; x < 36; x += 4) p.rect(x, 18, 3, 4, ICE.b).rect(x, 18, 3, 1, SNOW.l2);
  // the great arched gate, a portcullis of ice, blue light behind it
  doorway(p, 24, 28, 8, 56, g.outer, g.mid, f);
  for (let x = 17; x < 32; x += 3) p.rect(x, 30, 1, 22, x % 2 ? FROST.l : FROST.b);
  p.rect(16, 36, 16, 1, FROST.l).rect(16, 44, 16, 1, FROST.l);
  paint(p, 15, 27, 18, 4, (x, y) => (Math.abs(x + 0.5 - 24) < 9 - (y - 27) * 0.2 && y === 27 ? SNOW.l2 : null));
  // icicles and snow
  for (const [x, len] of [[6, 4], [9, 2], [15, 5], [20, 3], [28, 4], [33, 2], [39, 5], [43, 3]] as const) p.rect(x, 23, 1, len, '#e4f6ff').px(x, 22 + len, '#a8d4f0');
  lump(p, 2, 52, 12, 5, SNOW, 0.08, 71, 0.5);
  lump(p, 34, 52, 13, 5, SNOW, 0.08, 72, 0.5);
  p.outline('#1e3a5a');
  halo(p, 24, 44, 10, g.light, f ? 0.32 : 0.24);
  twinkle(p, 6, 8, '#e8faff');
  twinkle(p, f ? 42 : 40, f ? 5 : 9, '#e8faff');
  return p;
}

function forgeDoor(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[2]!;
  // a face of black rock with glowing seams
  paint(p, 0, 4, 48, 52, (x, y) => {
    const dx = (x + 0.5 - 24) / 24;
    const dy = (y + 0.5 - 60) / 56;
    if (dx * dx * 0.9 + dy * dy > 1) return null;
    if (HONEYCOMB(x, y) && grain(x, y, 81) > 0.1) return y > 30 && grain(x, y, 82) > 0.2 ? EMBER.d : BASALT.d2;
    return tone(BASALT, light(dx, dy, 0.6) + 0.25 * grain(x, y, 83));
  });
  // a lava seam running down the rock
  for (const [x, y] of [[8, 14], [9, 17], [8, 20], [10, 24], [40, 16], [39, 19], [41, 23]] as const) p.px(x, y, EMBER.m).px(x, y + 1, EMBER.h);
  // the door frame of big iron-bound stones, the double door of iron with rivets, a glowing anvil sign above
  p.rect(12, 20, 24, 36, IRON.d).rect(12, 20, 24, 2, IRON.b).rect(12, 20, 2, 36, IRON.b).rect(34, 20, 2, 36, IRON.d2);
  p.rect(15, 24, 18, 32, IRON.b).rect(23, 24, 2, 32, IRON.d2);
  for (const y of [28, 38, 48]) for (const x of [17, 21, 27, 31]) p.px(x, y, IRON.l2).px(x + 1, y + 1, IRON.d);
  p.rect(15, 24, 18, 1, IRON.l);
  // the light of the forge through the crack between the doors and under them
  p.rect(23, 26, 2, 30, f ? EMBER.h : EMBER.m).px(23, 30, EMBER.hot).px(24, 44, EMBER.hot);
  p.rect(15, 54, 18, 2, f ? EMBER.h : EMBER.m);
  p.rect(18, 10, 12, 8, IRON.d).rect(18, 10, 12, 1, IRON.b);
  p.tpl(19, 11, ['..####....', '.######..#', '..######.#', '....##....', '...####...', '..######..'], { '#': f ? EMBER.h : EMBER.m });
  // fire baskets on both sides
  for (const bx of [4, 38]) {
    p.rect(bx + 2, 44, 2, 12, IRON.d).rect(bx, 40, 6, 4, IRON.b).rect(bx, 40, 6, 1, IRON.l).px(bx + 1, 41, EMBER.h).px(bx + 3, 41, EMBER.m);
  }
  p.outline(OUTLINE);
  for (const bx of [4, 38]) flame(p, bx + 3, 40, 6, f ? 9 : 8, f ? 1 : -1, g.outer, g.mid, g.core);
  halo(p, 24, 40, 12, g.light, f ? 0.24 : 0.18);
  halo(p, 7, 34, 6, g.light, 0.25);
  halo(p, 41, 34, 6, g.light, 0.25);
  // smoke rising from the top
  for (const [x, y, r] of [[22, 3, 2], [25, 1, 1.5]] as const) p.circle(x, y, r, 'rgba(90,84,96,0.6)');
  return p;
}

const sagaPortal = (look: number, f: number): Px => (look === 1 ? iceGate(f) : look === 2 ? forgeDoor(f) : barrow(f));

// ---------------------------------------------------------------------------
// Kämpastenen (24×36 at ox -4, oy -20): a tall runestone painted like the old ones, red serpent and black runes,
// with the four classes' signs: Väktare's shield, Helare's leaf, Krigare's axe and Magiker's lightning
// ---------------------------------------------------------------------------

function kampasten(f: number): Px {
  const p = new Px(24, 36);
  const S = pal('#4a4a50', '#6a6a70', '#8e8c8c', '#b0aca6', '#d0ccc4');
  lump(p, 0, 30, 9, 5, STONE, 0.2, 91);
  lump(p, 15, 31, 9, 5, STONE, 0.2, 92);
  // a tall stone, broad at the foot, its top worn higher on the left
  const inside = (x: number, y: number): boolean => {
    if (x < 2 || x > 21 || y > 33) return false;
    const u = (x + 0.5 - 2) / 20;
    const top = 1 + 10 * (u - 0.3) ** 2 + u * 2 + (u < 0.12 ? (0.12 - u) * 40 : 0);
    return y + 0.5 >= top;
  };
  paint(p, 2, 0, 20, 34, (x, y) => (inside(x, y) ? tone(S, light((x + 0.5 - 12) / 10, (y - 17) / 17, 0.7) + 0.2 * grain(x, y, 93)) : null));
  // the red serpent winding round its edge, its head at the top left
  const red = '#c83a2a';
  paint(p, 2, 0, 20, 31, (x, y) => {
    if (!inside(x, y) || y > 30) return null;
    const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => inside(x + dx!, y + dy!));
    const deep = [[-3, 0], [3, 0], [0, -3]].every(([dx, dy]) => inside(x + dx!, y + dy!));
    return near && !deep ? red : null;
  });
  p.rect(4, 6, 3, 2, '#e86a4a').px(5, 6, '#2a2430').px(7, 7, red);
  // the four classes' signs, two by two, each lighting the stone round it in its colour
  const sign = (cx: number, cy: number, col: string) => glowOn(p, cx, cy, 5, col, 0.25);
  sign(8.5, 12.5, '#4f8fe8');
  sign(15.5, 12.5, '#5fd38d');
  sign(8.5, 20.5, '#e8613b');
  sign(15.5, 20.5, '#b06ef0');
  // Väktare: a round blue shield with a boss
  paint(p, 6, 10, 6, 6, (x, y) => {
    const r = Math.hypot(x + 0.5 - 8.5, y + 0.5 - 12.5);
    return r > 2.9 ? null : r < 1 ? '#e8ecf4' : r > 2.1 ? '#2a5ab0' : '#4f8fe8';
  });
  p.px(7, 11, '#9ac0ff');
  // Helare: a green leaf with its vein
  p.tpl(13, 10, ['...##', '..###', '.####', '####.', '.##..', '#....'], { '#': '#5fd38d' }).line(14, 14, 16, 11, '#2e9a5a').px(16, 10, '#c8ffd8');
  // Krigare: an axe
  p.tpl(6, 18, ['.####', '#####', '.###.', '...#.', '...#.', '...#.'], { '#': '#e8613b' }).px(7, 18, '#ffb08a').rect(9, 21, 1, 3, '#6f4a26');
  // Magiker: a bolt of lightning
  p.tpl(13, 18, ['...##', '..##.', '.####', '..##.', '.##..', '##...'], { '#': '#b06ef0' }).px(16, 18, '#e8c8ff');
  // runes below
  for (let i = 0; i < 3; i++) rune(p, 6 + i * 5, 26, i * 2 + 1, '#2a2430');
  p.outline(OUTLINE);
  // the signs shine, one after another
  const at: [number, number][] = [[10, 10], [17, 10], [10, 18], [17, 18]];
  const [sx, sy] = at[f % 4]!;
  twinkle(p, sx, sy, '#ffffff');
  return p;
}

// ---------------------------------------------------------------------------
// The saga's keepsakes for home: Solrunan, a runestone glowing like the sun (16×24 at oy -8), and a shoot of
// Yggdrasil, a little glittering tree (24×32 at ox -4, oy -16)
// ---------------------------------------------------------------------------

function solruna(f: number): Px {
  const p = new Px(16, 24);
  const S = pal('#5a4a3a', '#7a6650', '#9e8a6a', '#c4ae86', '#e2cea6');
  paint(p, 2, 2, 12, 21, (x, y) => {
    const dx = (x + 0.5 - 8) / 6;
    const top = y < 8 ? Math.sqrt(Math.max(0, 1 - ((8 - y - 0.5) / 6) ** 2)) : 1;
    if (Math.abs(dx) > top) return null;
    return tone(S, light(dx, (y - 12) / 12, 0.75) + 0.2 * grain(x, y, 101));
  });
  p.rect(1, 21, 14, 3, STONE.b).rect(1, 21, 14, 1, STONE.l);
  // the sun: a golden disc with rays, carved and glowing
  paint(p, 2, 4, 12, 12, (x, y) => {
    const dx = x + 0.5 - 8;
    const dy = y + 0.5 - 10;
    const r = Math.hypot(dx, dy);
    if (r < 2.6) return r < 1.4 ? GOLD.l2 : GOLD.l;
    const a = Math.atan2(dy, dx) / (Math.PI / 4) + (f ? 0.5 : 0);
    return r < 5.2 && Math.abs(a - Math.round(a)) < 0.22 ? GOLD.b : null;
  });
  rune(p, 7, 16, 5, GOLD.d);
  p.outline(OUTLINE);
  glowOn(p, 8, 10, 7, '#fff0a0', 0.22);
  halo(p, 8, 10, 8, '#ffd23f', f ? 0.3 : 0.22);
  return p;
}

function yggdrasil(f: number): Px {
  const p = new Px(24, 32);
  const leaf = pal('#1e6a3a', '#30a050', '#5ad070', '#a0f08a', '#e0ffc8');
  const bark = pal('#4a3a2e', '#6e5a48', '#958070', '#bca690', '#dccab0');
  // a little mound, the three roots of the World Tree reaching into it, a slender silver-barked trunk
  lump(p, 3, 27, 18, 5, pal('#2a3a1e', '#3e5428', '#567436', '#6e9444', '#8ab45a'), 0.2, 114, 0.4);
  p.line(12, 27, 6, 30, bark.d).line(12, 27, 18, 30, bark.d).line(12, 28, 12, 30, bark.d);
  p.rect(11, 17, 3, 11, bark.b).rect(11, 17, 1, 11, bark.l).rect(13, 18, 1, 10, bark.d);
  p.line(11, 20, 6, 13, bark.b).line(13, 19, 18, 12, bark.b).line(12, 17, 12, 9, bark.l);
  // the crown: clouds of leaves that glow a little, lit from the top-left
  lump(p, 1, 6, 11, 10, leaf, 0.3, 111, 0.4);
  lump(p, 12, 5, 11, 10, leaf, 0.3, 112, 0.4);
  lump(p, 6, 0, 12, 10, leaf, 0.3, 113, 0.4);
  // golden leaves here and there
  for (const [x, y] of [[4, 9], [9, 3], [16, 7], [19, 11], [12, 12], [7, 13]] as const) p.px(x, y, GOLD.l).px(x + 1, y, GOLD.b);
  p.outline('#14301a');
  // glitter: sparks in the leaves and drifting round it, a new set each frame
  const sparks: [number, number][] = f ? [[5, 7], [15, 3], [20, 9], [10, 11], [1, 4], [22, 15]] : [[8, 2], [17, 8], [3, 12], [13, 9], [21, 3], [2, 17]];
  for (const [x, y] of sparks) p.px(x, y, '#ffffff');
  twinkle(p, f ? 18 : 5, f ? 2 : 5, '#fff3b0');
  twinkle(p, f ? 4 : 19, f ? 14 : 13, '#d8ffc8');
  glowOn(p, 12, 8, 10, '#e8ffd0', 0.12);
  return halo(p, 12, 9, 12, '#9cff8a', 0.18);
}

// ---------------------------------------------------------------------------
// Icons (16×16) for the dungeons' loot: weapons glowing in their colour, the potion, what the villagers ask for,
// and the keepsakes (the tall ones get their own icon)
// ---------------------------------------------------------------------------

/** A blade from the hilt at (x0, y0) to the tip at (x1, y1), w wide, with a light edge. */
function blade(p: Px, x0: number, y0: number, x1: number, y1: number, c: Pal): void {
  p.line(x0, y0, x1, y1, c.b).line(x0 - 1, y0, x1 - 1, y1, c.l).line(x0, y0 + 1, x1, y1 + 1, c.d).px(x1, y1, c.l2);
}

/** A glow round a weapon: a soft halo of its colour on the empty pixels near the blade (after the outline). */
const aura = (p: Px, cx: number, cy: number, r: number, col: string): Px => halo(p, cx, cy, r + 1, col, 0.5);

function weaponIcon(id: string): Px {
  const p = new Px(16, 16);
  const hilt = (x: number, y: number, guard: string, grip = WOOD.d) => {
    p.rect(x - 2, y - 2, 2, 2, grip).rect(x - 3, y, 3, 2, grip).px(x - 3, y + 1, guard);
    p.line(x - 1, y - 3, x + 2, y, guard).px(x - 1, y - 2, guard);
  };
  switch (id) {
    case 'runsvard': {
      blade(p, 4, 11, 13, 2, STEEL_PAL);
      hilt(4, 12, GOLD.b);
      for (const [x, y] of [[7, 8], [9, 6], [11, 4]] as const) p.px(x, y, '#7fd8ff');
      p.outline(OUTLINE);
      aura(p, 9, 7, 9, '#7fd8ff');
      for (const [x, y] of [[7, 8], [9, 6], [11, 4]] as const) p.px(x, y, '#d8f6ff');
      break;
    }
    case 'frostbett': {
      blade(p, 4, 11, 13, 2, FROST);
      p.line(5, 9, 12, 2, '#ffffff');
      hilt(4, 12, '#bfe9ff', '#3a6a96');
      p.outline('#1e3a5a');
      aura(p, 9, 7, 9, '#a8e8ff');
      twinkle(p, 12, 4, '#e8faff');
      break;
    }
    case 'surtsvard': {
      const fire = pal('#8e1a0a', '#d8401a', '#ff8a2a', '#ffd060', '#fff6c8');
      blade(p, 4, 11, 13, 2, fire);
      hilt(4, 12, '#3a3036', '#1a1418');
      p.outline(OUTLINE);
      for (const [x, y] of [[8, 5], [11, 2], [6, 8], [13, 4]] as const) p.px(x, y - 1, '#ffb04a').px(x + 1, y - 2, '#ffe27a');
      aura(p, 9, 6, 9, '#ff9a3a');
      break;
    }
    case 'gungner': {
      // Odin's spear: a long shaft, a golden leaf of a head with runes, a little ribbon
      p.line(2, 14, 10, 6, WOOD.b).line(3, 14, 11, 6, WOOD.d);
      p.tpl(9, 1, ['....##', '...###', '..####', '.####.', '####..', '.##...'], { '#': GOLD.b });
      p.line(10, 5, 14, 1, GOLD.l2);
      p.px(11, 4, '#8a5a10').px(12, 3, '#8a5a10');
      p.rect(6, 9, 2, 2, '#3a5ac8').px(5, 11, '#3a5ac8');
      p.outline(OUTLINE);
      aura(p, 12, 3, 6, '#ffe27a');
      twinkle(p, 14, 1);
      break;
    }
    case 'draugyxa':
    case 'isyxa': {
      const head = id === 'isyxa' ? FROST : pal('#2a3a2a', '#4a5e4a', '#7a8e74', '#a8bc9e', '#d8f0c8');
      p.line(3, 14, 11, 4, WOOD.b).line(4, 14, 12, 4, WOOD.d);
      // a bearded axe head
      p.tpl(8, 1, ['.####.', '######', '#####.', '.###..', '..##..', '...#..'], { '#': head.b });
      p.line(8, 2, 8, 4, head.l2).line(9, 1, 12, 1, head.l);
      p.px(13, 2, head.d).px(12, 3, head.d);
      p.outline(id === 'isyxa' ? '#1e3a5a' : OUTLINE);
      aura(p, 10, 4, 7, id === 'isyxa' ? '#bfe9ff' : '#9cff8a');
      if (id === 'draugyxa') p.px(10, 2, '#9cff8a').px(11, 4, '#9cff8a');
      else twinkle(p, 9, 3, '#e8faff');
      break;
    }
    case 'volvastav': {
      // a crooked staff of wood with a glowing stone held in its top
      p.line(4, 15, 9, 6, WOOD.b).line(5, 15, 10, 6, WOOD.d).px(6, 12, WOOD.l).px(8, 9, WOOD.l);
      p.line(9, 6, 8, 3, WOOD.b).line(10, 6, 13, 3, WOOD.b).px(13, 2, WOOD.l);
      p.rect(9, 2, 3, 3, '#fff0a0').px(9, 2, '#ffffff').px(11, 4, '#e8c860');
      p.outline(OUTLINE);
      aura(p, 10, 3, 6, '#fff0a0');
      p.px(5, 13, '#5fd38d').px(7, 10, '#5fd38d');
      break;
    }
    case 'ullrsbage': {
      // a white bow with a string of northern lights
      p.line(4, 1, 10, 5, '#e8eef4').line(10, 5, 11, 8, '#e8eef4').line(11, 8, 10, 11, '#e8eef4').line(10, 11, 4, 15, '#e8eef4');
      p.line(5, 1, 10, 4, '#b8c4d0').px(11, 9, '#b8c4d0');
      for (let y = 2; y < 15; y++) p.px(4, y, y < 6 ? '#7affb0' : y < 10 ? '#7ad8ff' : '#d08aff');
      p.rect(9, 7, 2, 3, '#7a5230');
      p.outline(OUTLINE);
      aura(p, 7, 8, 8, '#d0f0ff');
      break;
    }
    case 'mjolner': {
      // Tor's hammer: a short handle wrapped in leather with a loop, a broad head flaring at both ends, knotwork, sparks
      p.rect(7, 8, 2, 6, WOOD.d).rect(7, 8, 1, 6, WOOD.b).px(7, 10, '#c8a060').px(8, 12, '#c8a060');
      p.rect(6, 14, 4, 1, '#8a5a2a').px(6, 15, '#8a5a2a').px(9, 15, '#8a5a2a');
      p.tpl(1, 2, ['##..........##', '##############', '.############.', '.############.', '##############', '##..........##'], { '#': IRON.b });
      p.rect(1, 2, 14, 1, IRON.l2).rect(1, 3, 1, 4, IRON.l).rect(14, 3, 1, 4, IRON.d).rect(3, 7, 10, 1, IRON.d2);
      p.tpl(4, 3, ['#..##..#', '.##..##.', '#..##..#'], { '#': GOLD.d });
      p.outline(OUTLINE);
      aura(p, 8, 5, 8, '#9ad8ff');
      p.line(0, 4, 1, 6, '#e8f8ff').px(15, 1, '#e8f8ff').px(14, 9, '#9ad8ff').px(1, 9, '#9ad8ff');
      break;
    }
  }
  return p;
}

function potionIcon(): Px {
  const p = new Px(16, 16);
  // a round flask of red healing drink with a cork and a little heart on its label
  paint(p, 2, 4, 12, 12, (x, y) => {
    const dx = (x + 0.5 - 8) / 5.6;
    const dy = (y + 0.5 - 10) / 5.4;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (y < 8) return r > 0.75 ? '#c8e8f0' : '#e8f8ff';
    return tone(pal('#7a1020', '#b8202e', '#e8404a', '#ff8a8a', '#ffd0d0'), light(dx, dy, Math.sqrt(1 - r) + 0.3));
  });
  p.rect(6, 1, 4, 4, '#e8f8ff').rect(6, 1, 4, 1, '#ffffff').rect(6, 0, 4, 2, '#b07c48').px(6, 0, '#d4a46c');
  p.tpl(6, 9, ['##.##', '#####', '.###.', '..#..'], { '#': '#ffffff' });
  p.outline(OUTLINE);
  return twinkle(p, 4, 6, '#ffffff');
}

function questIcon(id: string): Px {
  const p = new Px(16, 16);
  if (id === 'draugjarn') {
    // a broken old blade gone rusty, its hilt still on, a ghostly green glint in the iron
    const rust = pal('#3a2418', '#6a3a22', '#8e5a3a', '#a8785a', '#c49a7a');
    p.line(4, 12, 10, 6, rust.b).line(5, 12, 11, 6, rust.d).line(4, 11, 10, 5, rust.l).px(11, 5, rust.l).px(12, 5, rust.b).px(11, 4, rust.d);
    p.px(6, 9, '#7a6a6a').px(8, 8, '#a85a2a').px(9, 6, '#7a6a6a');
    p.rect(2, 12, 2, 2, WOOD.d).rect(1, 14, 2, 1, WOOD.b).line(2, 10, 5, 13, IRON.b).px(2, 10, IRON.l);
    p.outline(OUTLINE);
    halo(p, 8, 8, 6, '#9cff8a', 0.25);
    p.px(7, 8, '#9cff8a');
    twinkle(p, 12, 3, '#c8ffb8');
  } else if (id === 'frostros') {
    // a rose of ice on a frosty stem
    p.line(8, 9, 7, 15, '#7ab8d8').rect(4, 12, 3, 1, '#a8d8f0').px(4, 11, '#a8d8f0');
    paint(p, 3, 2, 10, 9, (x, y) => {
      const r = Math.hypot(x + 0.5 - 8, (y + 0.5 - 6) * 1.1);
      if (r > 4.6) return null;
      const swirl = Math.floor(Math.atan2(y + 0.5 - 6, x + 0.5 - 8) * 2 + r * 1.3) % 2 === 0;
      return r < 1.4 ? '#ffffff' : swirl ? FROST.l : FROST.b;
    });
    p.outline('#1e3a5a');
    twinkle(p, 12, 3, '#e8faff');
  } else {
    // a lump of coal glowing in its cracks
    paint(p, 2, 4, 12, 10, (x, y) => {
      const dx = (x + 0.5 - 8) / 5.8;
      const dy = (y + 0.5 - 9) / 4.6;
      if (dx * dx + dy * dy > 1) return null;
      if (HONEYCOMB(x * 2, y * 2)) return dy > -0.2 ? EMBER.h : EMBER.m;
      return tone(pal('#0e0c10', '#1a181e', '#2a272e', '#3c3842', '#56525c'), light(dx, dy, 0.7));
    });
    p.outline(OUTLINE);
    halo(p, 8, 10, 7, '#ff8a2a', 0.25);
  }
  return p;
}

function solrunaIcon(): Px {
  const p = new Px(16, 16);
  paint(p, 2, 1, 12, 15, (x, y) => {
    const dx = (x + 0.5 - 8) / 6;
    const top = y < 6 ? Math.sqrt(Math.max(0, 1 - ((6 - y - 0.5) / 5) ** 2)) : 1;
    return Math.abs(dx) > top ? null : tone(pal('#5a4a3a', '#7a6650', '#9e8a6a', '#c4ae86', '#e2cea6'), light(dx, (y - 8) / 8, 0.75));
  });
  paint(p, 3, 3, 10, 10, (x, y) => {
    const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (r < 2.4) return r < 1.2 ? GOLD.l2 : GOLD.l;
    const a = Math.atan2(y + 0.5 - 8, x + 0.5 - 8) / (Math.PI / 4);
    return r < 4.6 && Math.abs(a - Math.round(a)) < 0.25 ? GOLD.b : null;
  });
  p.outline(OUTLINE);
  return halo(p, 8, 8, 8, '#ffd23f', 0.28);
}

function yggdrasilIcon(): Px {
  const p = new Px(16, 16);
  const leaf = pal('#1e5a2a', '#2e8a3a', '#4ec05a', '#8ae07a', '#c8ffb0');
  p.rect(7, 9, 2, 5, WOOD.b).px(7, 9, WOOD.l).line(8, 13, 4, 15, WOOD.d).line(8, 13, 12, 15, WOOD.d);
  lump(p, 1, 3, 8, 8, leaf, 0.3, 131, 0.35);
  lump(p, 7, 3, 8, 8, leaf, 0.3, 132, 0.35);
  lump(p, 4, 0, 8, 7, leaf, 0.3, 133, 0.35);
  p.outline('#14301a');
  for (const [x, y] of [[4, 5], [11, 4], [8, 7]] as const) p.px(x, y, '#fff6a0');
  return twinkle(p, 13, 2);
}

/** Icons for the dungeons' items, by item id (the clothes are drawn from the player sprite, the animals from theirs). */
export function sagaIcons(): Record<string, Px> {
  const out: Record<string, Px> = {};
  for (const id of ['runsvard', 'draugyxa', 'volvastav', 'frostbett', 'isyxa', 'ullrsbage', 'surtsvard', 'mjolner', 'gungner']) out[id] = weaponIcon(id);
  for (const id of ['draugjarn', 'frostros', 'glodkol']) out[id] = questIcon(id);
  out.healing_potion = potionIcon();
  out.solruna = solrunaIcon();
  out.yggdrasil = yggdrasilIcon();
  return out;
}

// ---------------------------------------------------------------------------

export function drawSaga(set: SetArt): void {
  set('saga_wall', n(3, sagaWall), 0, -8);
  // per dungeon: on its face (a corridor running up and down), then on end (running sideways)
  set('saga_gate', n(6, (i) => sagaGate(Math.floor(i / 2), i % 2 === 1)), 0, -8);
  set('saga_torch', n(6, (i) => sagaTorch(i % 3, Math.floor(i / 3))), 0, -24);
  set('saga_exit', n(3, sagaExit));
  set('saga_rest', n(4, (i) => sagaRest(i % 2 === 1, Math.floor(i / 2))), 0, -12);
  set('saga_chest', n(3, sagaChest), -4, -4);
  set('saga_portal', n(6, (i) => sagaPortal(i % 3, Math.floor(i / 3))), 0, -24);
  set('saga_stone', n(4, kampasten), -4, -20, true);
  set('saga_coffin', n(3, coffin), 0, -4);
  set('saga_bones', n(3, boneHeap));
  set('saga_candles', n(6, (i) => candles(i % 3, Math.floor(i / 3))), 0, -4);
  set('saga_urn', n(3, urn), 0, -4);
  set('saga_icecrystal', n(6, (i) => iceCrystal(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_frozenpillar', n(3, frozenPillar), 0, -16);
  set('saga_snowdrift', n(3, snowdrift));
  set('saga_anvil', n(3, anvil), 0, -4);
  set('saga_brazier', n(6, (i) => brazier(i % 3, Math.floor(i / 3))), 0, -10);
  set('saga_lavacrack', n(6, (i) => lavaCrack(i % 3, Math.floor(i / 3))));
  set('solruna', n(2, solruna), 0, -8, true);
  set('yggdrasil', n(2, yggdrasil), -4, -16, true);
}

/** Per kind, how many looks its frames hold before the same looks come again a step on (flames, glows). */
export const SAGA_STEPPED: Record<string, number> = { saga_torch: 3, saga_rest: 2, saga_portal: 3, saga_candles: 3, saga_icecrystal: 3, saga_brazier: 3, saga_lavacrack: 3 };
