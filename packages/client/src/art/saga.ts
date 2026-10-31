// Sagan om Världsträdet: the dungeons and what belongs to them. Walls, gates, torches, the way out, rest stones,
// chests and the things along the walls; the arches out in the world, Kämpastenen on the city square, the keepsakes
// for home, the crypt's, the forge's and Bifrost's floors, and icons for the dungeons' loot. A dungeon's things come
// in nine looks (variant = the dungeon's wall look: 0 Draugkryptan, 1 Frostjättens borg, 2 Surts smedja, 3 Helheim,
// 4 Svartalfheims gruvor, 5 Havsormens tempel, 6 Alvernas lund, 7 Fenrisklyftan, 8 Bifrost). Light comes from the
// top-left like everywhere else. Spooky-cute, never gory: skulls are round and smile.
import { Px, hash2, rgbToHex, shade } from './px.js';
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
/** Helheim: dark teal stone, the walls' tops darker still. */
const HEL = pal('#0e1c1e', '#1a3034', '#28464a', '#3c6264', '#5a8482');
const HEL_TOP = pal('#0a1517', '#122326', '#1b3134', '#284346', '#385a5c');
/** Svartalfheim: carved grey stone (the gold runs through it in veins). */
const DWARF = pal('#26262c', '#3a3a42', '#55555e', '#74747e', '#9898a2');
const DWARF_TOP = pal('#18181d', '#24242a', '#313138', '#42424a', '#585862');
/** Havsormens tempel: blue stone grown over with barnacles, coral and pearls. */
const SEA = pal('#0e2a40', '#184260', '#24608a', '#3a84ac', '#64aed0');
const SEA_TOP = pal('#0a1e2e', '#112c42', '#1a3c58', '#265070', '#36688a');
const CORAL = pal('#7a2034', '#b83a4e', '#e86a6e', '#ff9e94', '#ffd2c4');
const PEARL = pal('#9a8ca8', '#c8bed4', '#ece6f2', '#faf6fc', '#ffffff');
/** Alvernas lund: living wood with a violet shimmer, purple leaves, mushrooms that glow. */
const BARK = pal('#1e1420', '#33222e', '#4c3442', '#6a4c5a', '#8c6c78');
const ALV_LEAF = pal('#24163a', '#38245a', '#523a7e', '#7458a4', '#9c80c8');
const SHROOM = { stem: '#ece2f4', stemD: '#b8a8c8', violet: '#b45ae8', violetL: '#e2acff', cyan: '#3ad0e4', cyanL: '#b4f6ff', pink: '#f06ab4', pinkL: '#ffc4e4' };
/** Fenrisklyftan: rough grey rock with frost on it. */
const ROCK = pal('#262a32', '#3a4049', '#545c68', '#727c88', '#98a2ae');
const ROCK_TOP = pal('#181b22', '#242830', '#323842', '#444c58', '#5c6672');
const FROSTW = '#eaf4ff';
/** Bifrost: black obsidian, and the bridge's own rainbow. */
const OBSIDIAN = pal('#07060b', '#110e18', '#1d1828', '#2c2540', '#463c62');
const RAINBOW = ['#ff6a7a', '#ffa64a', '#ffe45a', '#7ae070', '#5ac4ff', '#a07aff'];
/** Bronze gone green in the sea. */
const VERDIGRIS = pal('#163430', '#24544a', '#3a7a68', '#62a88c', '#9cd4b8');
/** Each dungeon's glow: the crypt's ghostly green, the castle's frost blue, the forge's fire, Hel's pale green
 * ghost-light, the mines' amber lanterns, the temple's sea light, the grove's violet, the cleft's cold white-blue and
 * Bifrost's rainbow shimmer. */
const GLOW: { outer: string; mid: string; core: string; light: string }[] = [
  { outer: '#2fae4a', mid: '#7cf06a', core: '#e4ffd0', light: '#9cff8a' },
  { outer: '#3a9ad8', mid: '#8ad8ff', core: '#f0fcff', light: '#a8e8ff' },
  { outer: '#e04a14', mid: '#ff9a2a', core: '#fff0a0', light: '#ffb04a' },
  { outer: '#22b880', mid: '#8affc8', core: '#eafff6', light: '#9cffd0' },
  { outer: '#d87a14', mid: '#ffbe3a', core: '#fff2b8', light: '#ffcc66' },
  { outer: '#1aa0c0', mid: '#6ae8f0', core: '#eaffff', light: '#8af0ff' },
  { outer: '#8a3ad8', mid: '#c88aff', core: '#f6e8ff', light: '#d0a0ff' },
  { outer: '#5a8ad8', mid: '#a8ccff', core: '#ffffff', light: '#bcd8ff' },
  { outer: '#b070ff', mid: '#ffc8f0', core: '#ffffff', light: '#f0d0ff' },
];

/** A colour from hue (0..360), saturation and lightness (0..1). */
const hsl = (h: number, sa: number, l: number): string => {
  const k = (m: number) => (m + h / 30) % 12;
  const a = sa * Math.min(l, 1 - l);
  const f = (m: number) => 255 * (l - a * Math.max(-1, Math.min(k(m) - 3, 9 - k(m), 1)));
  return rgbToHex(f(0), f(8), f(4));
};
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

/** The rainbow's colours washed nearly white, for glass. */
const PASTEL = RAINBOW.map((c) => shade(c, 1.8));

/**
 * Bifrost's floor: panes of pale glass, lit along their top-left edges, with now and then a faint rainbow streaking
 * through a pane on the slant, a sparkle, or a star far below. Kept light so whoever walks on it stands out.
 */
function bifrostTile(v: number): Px {
  const p = new Px(16, 16);
  const cuts = SLABS[[0, 4, 1, 3, 2, 5][v]!]!;
  const jointAt = (x: number, y: number): boolean =>
    x === 0 || y === 0 || cuts.some((k) => (k.x !== undefined ? x === k.x && y >= (k.from ?? 0) && y < (k.to ?? 16) : y === k.y && x >= (k.from ?? 0) && x < (k.to ?? 16)));
  const streak = [2, 3, 5].includes(v) ? 6 + ((v * 7) % 13) : -99;
  paint(p, 0, 0, 16, 16, (x, y) => {
    if (jointAt(x, y)) return '#c4bcdc';
    if (jointAt(x - 1, y) || jointAt(x, y - 1)) return '#fdfcff';
    if (jointAt(x + 1, y) || jointAt(x, y + 1) || x === 15 || y === 15) return '#d8d4ea';
    const t = x + y - streak;
    if (t >= 0 && t < 9) return PASTEL[Math.floor(t / 1.5)]!;
    // a gentle sheen on the slant the other way
    if ((x - y + 32) % 11 === 0) return '#f4f2fc';
    const g = grain(x, y, 51 + v);
    return g > 0.4 ? '#eeecf8' : g < -0.42 ? '#e0dcee' : '#e8e5f4';
  });
  if (v === 1 || v === 4) {
    const x = 4 + (hash2(v, 5) % 8);
    const y = 4 + (hash2(v, 9) % 8);
    p.px(x, y - 1, '#ffffff').px(x - 1, y, '#ffffff').px(x + 1, y, '#ffffff').px(x, y + 1, '#ffffff').px(x, y, '#fff6c8');
  }
  // a star glimmering far down through the glass
  p.px(3 + (hash2(v, 23) % 10), 3 + (hash2(v, 29) % 10), v % 2 ? '#cfc6ea' : '#f8e6f0');
  if (v === 5) p.px(11, 12, '#c8c0e4').px(12, 11, '#ffffff');
  return p;
}

export const cryptTiles = (): Px[] => n(8, cryptTile);
export const forgeTiles = (): Px[] => n(6, forgeTile);
export const bifrostTiles = (): Px[] => n(6, bifrostTile);

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

/**
 * Lumps that tile every 16 px both ways (rough rock, glassy facets): for a pixel, which lump it lies in, how far from
 * that lump's middle, and whether it lies in the crack between two.
 */
function lumps(centres: [number, number][], squash = 1): (x: number, y: number) => { i: number; dx: number; dy: number; gap: number } {
  const all: [number, number, number][] = [];
  centres.forEach(([cx, cy], i) => {
    for (let oy = -16; oy <= 16; oy += 16) for (let ox = -16; ox <= 16; ox += 16) all.push([cx + ox, cy + oy, i]);
  });
  const memo: { i: number; dx: number; dy: number; gap: number }[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let a = Infinity;
      let b = Infinity;
      let best = all[0]!;
      for (const c of all) {
        const d = Math.hypot(x + 0.5 - c[0], (y + 0.5 - c[1]) * squash);
        if (d < a) {
          b = a;
          a = d;
          best = c;
        } else if (d < b) b = d;
      }
      memo.push({ i: best[2], dx: x + 0.5 - best[0], dy: y + 0.5 - best[1], gap: b - a });
    }
  return (x, y) => memo[(y & 15) * 16 + (x & 15)]!;
}
const RUBBLE = lumps([[3, 3], [11, 2], [7, 8], [14, 10], [2, 12], [10, 14], [6, 1.5]], 1.1);
const FACETS = lumps([[4, 4], [12, 3], [8, 10], [1, 11], [14, 13]], 0.9);

/** A little bone lying on top of something, from (x, y) `len` px to the right. */
const smallBone = (p: Px, x: number, y: number, len: number): Px =>
  p.rect(x + 1, y, len - 2, 1, BONE.l).px(x, y - 1, BONE.l2).px(x, y, BONE.b).px(x + len - 1, y - 1, BONE.l).px(x + len - 1, y, BONE.d).rect(x + 1, y + 1, len - 2, 1, BONE.d);

function wallHel(): Px {
  const p = new Px(16, 24);
  blockTop(p, HEL_TOP, '#060e10', 8, (k) => (k % 2 ? [2, 10] : [6, 14]), 40);
  // old bones lying on the stones, and a ghost-light's spark here and there
  smallBone(p, 3, 4, 6);
  p.px(11, 12, HEL_TOP.l2).px(12, 12, HEL_TOP.l).px(11, 13, HEL_TOP.d);
  p.px(12, 3, GLOW[3]!.mid).px(4, 11, GLOW[3]!.outer).px(15, 7, GLOW[3]!.outer);
  // the face: a capping of pale bone, two courses of teal stone, a little round skull peeking out of every stretch
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return x % 4 === 3 ? BONE.b : BONE.l;
    if (r === 1) return x % 4 === 3 ? BONE.d : BONE.b;
    if (r === 7) return HEL.d2;
    const course = r < 4 ? [3, 11] : [7, 15];
    if (r === 4 || course.includes(x)) return HEL.d2;
    if (r === 2 || r === 5 || course.includes((x + 15) % 16)) return HEL.b;
    return grain(x, y, 41) > 0.32 ? HEL.b : HEL.d;
  });
  p.tpl(5, 18, ['.llll.', 'lLllbl', 'lEElEE', 'lbblbd', '.dbbd.', '.d.d..'], { l: BONE.l, L: BONE.l2, b: BONE.b, d: BONE.d, E: '#06100f' }).px(5, 18, OUTLINE).px(5, 22, OUTLINE);
  p.px(6, 20, GLOW[3]!.mid).px(9, 20, GLOW[3]!.mid);
  p.px(13, 23, GLOW[3]!.outer).px(1, 22, HEL.l);
  return p;
}

function wallDwarf(): Px {
  const p = new Px(16, 24);
  blockTop(p, DWARF_TOP, '#0e0e12', 8, (k) => (k % 2 ? [4, 12] : [0, 8]), 42);
  // gold running through the stone in two veins, wrapping round the tile so they run on from wall to wall
  for (let x = 0; x < 16; x++) {
    const y1 = 4 + Math.round(1.5 * Math.sin((2 * Math.PI * x) / 16));
    const y2 = 12 + Math.round(1.2 * Math.sin((4 * Math.PI * (x + 3)) / 16));
    p.px(x, y1, x % 5 === 2 ? GOLD.l2 : GOLD.b).px(x, y1 + 1, GOLD.d2);
    if (x % 8 < 5) p.px(x, y2, x % 8 === 2 ? GOLD.l : GOLD.d);
  }
  // the face: carved and smooth, a band of knotwork, big dressed blocks below, a little gold glinting in the joints
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return DWARF.l2;
    if (r === 1) return DWARF.d;
    if (r === 2) return x % 4 === 0 ? DWARF.d2 : x % 4 === 2 ? DWARF.l : DWARF.b;
    if (r === 3) return x % 4 === 2 ? DWARF.d2 : DWARF.d;
    if (r === 7) return DWARF.d2;
    if (x === 7 || x === 15) return DWARF.d2;
    if (x === 8 || x === 0 || r === 4) return DWARF.l;
    return grain(x, y, 43) > 0.36 ? DWARF.l : DWARF.b;
  });
  p.px(3, 21, GOLD.b).px(4, 21, GOLD.l2).px(5, 22, GOLD.d).px(12, 20, GOLD.b).px(13, 21, GOLD.d);
  return p;
}

function wallSea(): Px {
  const p = new Px(16, 24);
  blockTop(p, SEA_TOP, '#06121c', 8, (k) => (k % 2 ? [5, 13] : [1, 9]), 44);
  // barnacles crusting the stones, a tuft of coral
  const barnacle = (x: number, y: number) => p.px(x, y, PEARL.l).px(x + 1, y, PEARL.b).px(x, y + 1, PEARL.d).px(x + 1, y + 1, '#2a3a4a');
  for (const [x, y] of [[3, 3], [5, 2], [11, 10], [13, 11], [7, 13], [14, 4]] as const) barnacle(x, y);
  p.tpl(8, 3, ['#.#', '#.#', '.#.', '.#.'], { '#': CORAL.b }).px(8, 3, CORAL.l).px(10, 3, CORAL.l2);
  // the face: wet stone with a shining lip, coral growing up from the foot, barnacles and a pearl
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return x % 6 === 1 ? '#e8fbff' : SEA.l2;
    if (r === 1) return SEA.d;
    if (r === 7) return SEA.d2;
    const course = r < 4 ? [6, 14] : [2, 10];
    if (r === 4 || course.includes(x)) return SEA.d2;
    if (r === 2 || r === 5 || course.includes((x + 15) % 16)) return SEA.l;
    return grain(x, y, 45) > 0.3 ? SEA.l : SEA.b;
  });
  p.tpl(1, 19, ['#.#.', '#.#.', '.##.', '..#.', '..#.'], { '#': CORAL.b }).px(1, 19, CORAL.l2).px(3, 19, CORAL.l);
  barnacle(9, 18);
  barnacle(12, 21);
  p.px(7, 21, PEARL.l2).px(7, 22, PEARL.d).px(13, 17, '#e8fbff');
  return p;
}

function wallAlv(): Px {
  const p = new Px(16, 24);
  // living roots seen from above: two running sideways, one running up and down between them, dark earth between
  paint(p, 0, 0, 16, 16, (x, y) => {
    const up = x >= 9 && x <= 13 && !(y >= 9 && y <= 13);
    if (up) return x === 9 ? BARK.l : x === 13 ? BARK.d2 : x === 12 ? BARK.d : (y * 3 + x) % 7 === 0 ? BARK.d : BARK.b;
    const across = y >= 1 && y <= 5 ? y - 1 : y >= 9 && y <= 13 ? y - 9 : -1;
    if (across >= 0) {
      if (across === 0) return BARK.l;
      if (across === 4) return BARK.d2;
      if (across === 3) return BARK.d;
      return (x * 2 + y * 5) % 9 === 0 ? BARK.d : grain(x, y, 46) > 0.35 ? BARK.l : BARK.b;
    }
    return grain(x, y, 47) > 0.2 ? ALV_LEAF.d2 : '#140c18';
  });
  // leaves and tiny glowing mushrooms in the dark between the roots
  p.px(2, 7, ALV_LEAF.b).px(3, 7, ALV_LEAF.l).px(6, 15, ALV_LEAF.b).px(15, 7, ALV_LEAF.d);
  p.px(4, 7, SHROOM.cyan).px(4, 6, SHROOM.cyanL).px(6, 8, SHROOM.violet).px(1, 15, SHROOM.pinkL);
  // the face: bark in long streaks, roots hanging over the lip, a cluster of glowing mushrooms at the foot
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return x % 5 === 1 ? ALV_LEAF.l : BARK.l2;
    if (r === 7) return BARK.d2;
    const k = (x + Math.floor(r / 3)) % 4;
    return k === 0 ? BARK.d2 : k === 1 ? BARK.l : grain(x, y, 48) > 0.3 ? BARK.b : BARK.d;
  });
  for (const [x, len] of [[2, 4], [7, 2], [10, 5]] as const) p.rect(x, 17, 1, len, BARK.l).px(x, 16 + len, BARK.d);
  p.rect(12, 21, 3, 1, SHROOM.violet).px(12, 21, SHROOM.violetL).px(13, 22, SHROOM.stem).px(14, 20, SHROOM.cyan).px(14, 21, SHROOM.cyanL);
  p.px(4, 22, SHROOM.pink).px(4, 23, SHROOM.stemD);
  return p;
}

function wallFenris(): Px {
  const p = new Px(16, 24);
  // rough lumps of rock, the frost lying on their top-left sides
  paint(p, 0, 0, 16, 16, (x, y) => {
    const c = RUBBLE(x, y);
    if (c.gap < 0.9) return '#0e1014';
    const r = Math.hypot(c.dx, c.dy);
    if (c.i % 3 !== 1 && c.dx + c.dy < -3 && r > 2) return grain(x, y, 49) > -0.2 ? FROSTW : '#c4d6e8';
    return tone(ROCK_TOP, light(c.dx / 4, c.dy / 4, 0.8) + 0.25 * grain(x, y, 50));
  });
  // the face: frost on the lip, icicles, rough rock, and a heavy chain hanging along every wall
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return x % 7 === 3 ? '#c4d6e8' : FROSTW;
    if (r === 7) return ROCK.d2;
    const c = RUBBLE(x * 2, y * 3);
    if (c.gap < 0.8) return ROCK.d2;
    return tone(ROCK, light(c.dx / 5, c.dy / 5, 0.8) + 0.2 * grain(x, y, 52));
  });
  for (const [x, len] of [[1, 3], [6, 2], [13, 4]] as const) p.rect(x, 17, 1, len, '#dceeff').px(x, 16 + len, '#a8c8e8');
  for (let x = 0; x < 16; x++) {
    const y = 19 + Math.round(2.4 * Math.sin((Math.PI * x) / 16));
    if (x % 3 === 0) p.px(x, y - 1, IRON.l).px(x, y + 1, IRON.d2).px(x, y, '#14161c');
    else p.px(x, y, x % 3 === 1 ? IRON.l : IRON.b);
  }
  return p;
}

function wallBifrost(): Px {
  const p = new Px(16, 24);
  // glassy facets of obsidian, each tilted its own way, their edges catching the light; a rainbow crystal or two
  paint(p, 0, 0, 16, 16, (x, y) => {
    const c = FACETS(x, y);
    if (c.gap < 0.8) return c.dx + c.dy < 0 ? OBSIDIAN.l : OBSIDIAN.d2;
    const tilt = [0.75, 0.3, 0.55, 0.1, 0.9][c.i]!;
    const v = tilt + 0.35 * light(c.dx / 6, c.dy / 6, 0.4) + 0.1 * grain(x, y, 53);
    return v > 0.95 ? OBSIDIAN.l2 : v > 0.65 ? OBSIDIAN.l : v > 0.35 ? OBSIDIAN.b : OBSIDIAN.d;
  });
  const crystal = (x0: number, y0: number) => {
    for (const [dx, dy, k] of [[0, 0, 0], [1, 0, 1], [0, 1, 2], [1, 1, 3], [1, -1, 4], [2, 0, 5]] as const) p.px(x0 + dx, y0 + dy, RAINBOW[k]!);
    p.px(x0, y0 - 1, '#ffffff');
  };
  crystal(5, 6);
  crystal(12, 12);
  // the face: black glass with a sheen sweeping across it, rainbow crystals growing at the foot
  paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    if (r === 0) return x % 8 === 3 ? '#8a7cc0' : OBSIDIAN.l2;
    if (r === 7) return OBSIDIAN.d2;
    if (x % 8 === 7) return OBSIDIAN.d2;
    if ((x + r) % 8 === 0 || (x + r) % 8 === 1) return r < 4 ? OBSIDIAN.l : OBSIDIAN.b;
    return r === 1 ? OBSIDIAN.d : OBSIDIAN.d;
  });
  for (const [x, h, k] of [[2, 3, 0], [3, 4, 4], [4, 2, 2], [11, 3, 5], [12, 2, 3]] as const) p.rect(x, 23 - h, 1, h, RAINBOW[k]!).px(x, 23 - h, '#ffffff');
  return p;
}

const WALLS = [wallCrypt, wallIce, wallForge, wallHel, wallDwarf, wallSea, wallAlv, wallFenris, wallBifrost];
const sagaWall = (look: number): Px => WALLS[look % WALLS.length]!();

// ---------------------------------------------------------------------------
// The gate after the mid-boss (16×24 at oy -8): a portcullis under a lintel with a glowing rune, seen from the
// front where the corridor runs up and down, and on end (frame + 1) where it runs sideways
// ---------------------------------------------------------------------------

function sagaGate(look: number, side: boolean): Px {
  const p = new Px(16, 24);
  // bars of iron, ice, bone, sea-green bronze, living wood or black glass; the lintel of the dungeon's own stone
  const bar = [IRON, ICE, IRON, BONE, IRON, VERDIGRIS, BARK, IRON, OBSIDIAN][look]!;
  const lintel = [CRYPT, ICE, BASALT, HEL, DWARF, SEA, BARK, ROCK, OBSIDIAN][look]!;
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
    if (look === 3) p.tpl(1, 1, ['.l.', 'lEl', '.l.'], { l: BONE.l, E: g.mid }).tpl(12, 1, ['.l.', 'lEl', '.l.'], { l: BONE.l, E: g.mid });
    if (look === 4) for (const by of [10, 16]) p.rect(0, by, 16, 1, GOLD.b).px(4, by, GOLD.l2).px(12, by, GOLD.l2);
    if (look === 5) p.px(2, 2, PEARL.l2).px(13, 3, PEARL.l2).tpl(1, 18, ['#.#', '.#.', '.#.'], { '#': CORAL.l }).px(13, 13, PEARL.l);
    if (look === 6) p.rect(2, 1, 2, 1, SHROOM.violet).px(2, 1, SHROOM.violetL).px(12, 2, SHROOM.cyan).line(3, 6, 2, 12, ALV_LEAF.l).line(14, 6, 15, 9, ALV_LEAF.b);
    if (look === 7) p.rect(0, 0, 16, 1, FROSTW).px(3, 6, FROSTW).px(10, 12, FROSTW).px(14, 18, '#dceeff');
    if (look === 8) for (const by of [10, 16]) for (let x = 0; x < 16; x++) p.px(x, by, RAINBOW[Math.floor(x / 2.7)]!);
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
// Torches (16×24 at oy -24: hung on the wall face above their tile). Frames: the nine looks, then the nine
// again with the flame a step on. The crypt's a candle in an iron cup with a ghostly green flame, the castle's
// a lantern with a blue crystal, the forge's a fire basket (the second act's are further down).
// ---------------------------------------------------------------------------

function sagaTorch(look: number, f: number): Px {
  if (look >= 3) return sagaTorchII(look, f);
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

/** The bracket every wall light hangs on: a plate on the wall and an arm up from it. */
const bracket = (p: Px, c: Pal = IRON, top = 16): Px => p.rect(6, 19, 4, 4, c.d).rect(6, 19, 4, 1, c.b).px(7, 21, c.l).px(8, 21, c.d2).rect(7, top, 2, 19 - top, c.d).px(7, top, c.b);

/** The second act's wall lights: Hel's skull with a ghost-light in it, the dwarves' amber lantern, a shell holding a
 * glowing pearl, glowing mushrooms on a root, a cold white fire in an iron cup on a chain, a floating rainbow crystal. */
function sagaTorchII(look: number, f: number): Px {
  const p = new Px(16, 24);
  const g = GLOW[look]!;
  if (look === 3) {
    bracket(p);
    paint(p, 4, 9, 9, 8, (x, y) => {
      const dx = (x + 0.5 - 8) / 4;
      const dy = (y + 0.5 - 12.5) / 3.5;
      if (dx * dx + dy * dy > 1) return null;
      return tone(BONE, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
    });
    p.rect(6, 12, 2, 2, '#0e1a1a').rect(9, 12, 2, 2, '#0e1a1a').px(6, 12, g.mid).px(9, 12, g.mid);
    p.rect(6, 15, 4, 2, BONE.b).px(7, 16, BONE.d).px(9, 16, BONE.d).rect(6, 15, 4, 1, BONE.l);
    p.outline(OUTLINE);
    flame(p, 8, 9, f ? 4 : 5, f ? 8 : 7, f ? 1 : -1, g.outer, g.mid, g.core);
    halo(p, 8, 7, 7, g.light, f ? 0.3 : 0.24);
  } else if (look === 4) {
    // a squat brass lantern on a hook, amber glass, a little flame inside
    p.rect(6, 20, 4, 3, IRON.d).rect(6, 20, 4, 1, IRON.b);
    p.rect(7, 17, 2, 3, IRON.d).rect(8, 3, 1, 2, GOLD.d).rect(7, 2, 3, 1, GOLD.b);
    p.rect(4, 5, 8, 2, GOLD.b).rect(5, 4, 6, 1, GOLD.l).rect(4, 5, 8, 1, GOLD.l).rect(4, 15, 8, 2, GOLD.d).rect(5, 17, 6, 1, GOLD.d2);
    paint(p, 4, 7, 8, 8, (x, y) => (x === 4 || x === 11 ? GOLD.d : x === 8 ? GOLD.d2 : y < 9 ? '#ffe7a0' : '#ffcc5a'));
    p.rect(4, 7, 1, 8, GOLD.b);
    p.outline(OUTLINE);
    flame(p, f ? 6 : 6, 14, 3, f ? 6 : 5, f ? 0.6 : -0.6, '#ff9a1a', '#ffd84a', '#fff8d0');
    flame(p, 10, 14, 2, f ? 4 : 5, 0, '#ff9a1a', '#ffd84a', '#ffd84a');
    p.px(5, 8, '#fff6d8');
    halo(p, 8, 10, 8, g.light, f ? 0.32 : 0.26);
  } else if (look === 5) {
    // a scallop shell, open, a pearl glowing in it; bubbles going up
    bracket(p, VERDIGRIS, 17);
    paint(p, 2, 9, 12, 9, (x, y) => {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 17;
      const r = Math.hypot(dx, dy * 1.1);
      if (r > 6.2 || dy > 0) return null;
      const rib = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 7)) % 2;
      return r > 5.2 ? CORAL.l : rib ? CORAL.b : CORAL.l;
    });
    p.rect(6, 17, 4, 1, CORAL.d);
    p.outline(OUTLINE);
    lump(p, 6, 9, 5, 5, PEARL, 0.05, 141, 0.7);
    p.px(7, 10, '#ffffff');
    glowOn(p, 8, 12, 5, g.core, 0.25);
    halo(p, 8, 11, 7, g.light, f ? 0.32 : 0.24);
    for (const [x, y] of (f ? [[5, 6], [11, 3], [9, 1]] : [[6, 3], [10, 6], [4, 1]]) as [number, number][]) p.px(x, y, '#c8f8ff').px(x + 1, y, '#78d8f0').px(x, y - 1, '#ffffff');
  } else if (look === 6) {
    // a root curling out of the wall with three mushrooms on it, each glowing its own colour, spores drifting
    p.line(8, 22, 8, 15, BARK.b).line(9, 22, 9, 14, BARK.d).line(8, 15, 4, 12, BARK.b).line(9, 15, 12, 13, BARK.b).px(7, 18, BARK.l);
    const cap = (x: number, y: number, w: number, c: string, cl: string) => {
      p.rect(x - 1, y + 2, 2, 3, SHROOM.stem).px(x, y + 3, SHROOM.stemD);
      paint(p, x - w, y - 2, w * 2 + 1, 5, (px, py) => {
        const dx = (px + 0.5 - x) / (w + 0.3);
        const dy = (py + 0.5 - (y + 2)) / 3.6;
        if (dy > 0 || dx * dx + dy * dy > 1) return null;
        return dx < -0.25 && dy < -0.35 ? cl : c;
      });
      p.px(x - 1, y, '#ffffff');
    };
    cap(4, 8, 3, SHROOM.violet, SHROOM.violetL);
    cap(12, 9, 2, SHROOM.cyan, SHROOM.cyanL);
    cap(8, 3, 3, SHROOM.pink, SHROOM.pinkL);
    p.outline(OUTLINE);
    halo(p, 8, 7, 8, g.light, f ? 0.3 : 0.22);
    for (const [x, y] of (f ? [[2, 3], [13, 4], [10, 0]] : [[3, 1], [14, 6], [6, 0]]) as [number, number][]) p.px(x, y, f ? SHROOM.cyanL : SHROOM.violetL);
  } else if (look === 7) {
    // an iron cup hanging from the bracket on a short chain, a cold white-blue fire in it, frost on the rim
    bracket(p, IRON, 17);
    for (let y = 13; y < 17; y++) p.px(8, y, y % 2 ? IRON.l : IRON.d);
    paint(p, 3, 10, 10, 4, (x, y) => {
      const half = 5 - (y - 10) * 0.8;
      const u = Math.abs(x + 0.5 - 8) / half;
      if (u > 1) return null;
      return y === 10 ? FROSTW : u > 0.7 ? IRON.d : y === 11 ? '#2a3a5a' : IRON.b;
    });
    p.outline(OUTLINE);
    flame(p, 8, 10, f ? 6 : 7, f ? 9 : 8, f ? 1 : -1, g.outer, g.mid, g.core);
    halo(p, 8, 6, 7, g.light, f ? 0.3 : 0.24);
    p.px(f ? 4 : 12, f ? 3 : 2, '#ffffff');
  } else {
    // a claw of black glass holding up a crystal that floats a little and turns through the colours
    p.rect(6, 19, 4, 4, OBSIDIAN.b).rect(6, 19, 4, 1, OBSIDIAN.l).rect(7, 16, 2, 3, OBSIDIAN.b).px(7, 16, OBSIDIAN.l2);
    p.line(5, 15, 7, 16, OBSIDIAN.l).line(11, 15, 9, 16, OBSIDIAN.b).px(4, 14, OBSIDIAN.l2).px(12, 14, OBSIDIAN.l);
    const c = ramp(hsl(f ? 200 : 320, 0.85, 0.62));
    shard(p, 8, f ? 12 : 13, 5, 10, 0, c);
    p.px(7, f ? 6 : 7, '#ffffff');
    p.outline(OUTLINE);
    glowOn(p, 8, 8, 6, '#ffffff', 0.12);
    halo(p, 8, 8, 8, f ? '#a8e0ff' : '#ffc0f0', 0.28);
    twinkle(p, f ? 12 : 4, f ? 3 : 4, f ? '#ffe8a0' : '#c8ffd8');
  }
  return p;
}

// ---------------------------------------------------------------------------
// The way out (flat, 16×16): stairs going up to the daylight
// ---------------------------------------------------------------------------

function sagaExit(look: number): Px {
  const p = new Px(16, 16);
  const side = [CRYPT, ICE, BASALT, HEL, DWARF, SEA, BARK, ROCK, OBSIDIAN][look % 9]!;
  // the steps, lit more and more by the day at the top
  const S = [
    ['#fffbe8', '#f4e8c0', '#d8caa0', '#b0a684', '#8a8470'],
    ['#ffffff', '#eef8ff', '#cfe6f6', '#a8c8e4', '#86a8c8'],
    ['#fff4d8', '#e8d4b0', '#a89480', '#6e6268', '#4a4450'],
    ['#f4fff8', '#dcefe4', '#b8d0c4', '#8eaaa0', '#6a8680'],
    ['#fff8e0', '#ecdcb8', '#c8b48c', '#9a8a6e', '#70665a'],
    ['#fffbe8', '#f4e8c4', '#e0d0a0', '#b8a880', '#8a8068'],
    ['#fbf4ff', '#e4d8ec', '#c4b4d0', '#9a8aa8', '#726480'],
    ['#ffffff', '#eef4fa', '#d4e0ec', '#aebccc', '#8a98aa'],
    // Bifrost's stairs: each step one of the rainbow's colours, washed pale
    ['#ffffff', shade(RAINBOW[2]!, 1.7), shade(RAINBOW[3]!, 1.6), shade(RAINBOW[4]!, 1.5), shade(RAINBOW[5]!, 1.4)],
  ][look % 9]!;
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
  if (look === 3) p.px(1, 9, BONE.l).px(1, 10, BONE.b).px(14, 5, GLOW[3]!.mid);
  if (look === 4) p.px(1, 5, GOLD.l2).px(14, 10, GOLD.b).px(14, 11, GOLD.d);
  if (look === 5) p.px(1, 11, CORAL.l).px(1, 12, CORAL.b).px(14, 6, PEARL.l2);
  if (look === 6) p.px(14, 12, SHROOM.cyanL).px(14, 13, SHROOM.stem).px(1, 7, SHROOM.violetL);
  if (look === 7) p.px(1, 3, FROSTW).px(14, 9, FROSTW).px(14, 10, '#c4d6e8');
  if (look === 8) p.px(1, 8, RAINBOW[0]!).px(1, 9, RAINBOW[4]!).px(14, 4, '#ffffff').px(14, 13, RAINBOW[2]!);
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
// volcano between two fires; 3 Hel's gate of bones; 4 the dwarves' mine; 5 the sea serpent's temple; 6 the elves'
// old tree; 7 the wolf's cleft; 8 Bifrost's arch of black glass. Frames: the nine, then the nine with their
// doorways' glow a step on.
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

/** A chain from (x0, y0) to (x1, y1) sagging `sag` px in the middle: links turned face-on and edge-on by turns. */
function chain(p: Px, x0: number, y0: number, x1: number, y1: number, sag = 0, c: Pal = IRON): Px {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.round(len / 2.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
    if (i % 2 === 0) p.px(x - 1, y, c.l).px(x + 1, y, c.d).px(x, y - 1, c.l2).px(x, y + 1, c.d).px(x, y, c.d2);
    else p.px(x, y, c.b).px(x, y - 1, c.l);
  }
  return p;
}

/** Hel's gate: a heap of dark teal rock, an arch of great bones round a doorway full of pale green light, a round skull
 * smiling on top, ghost-lights bobbing either side and reeds of the swamp at its foot. */
function helGate(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[3]!;
  paint(p, 0, 4, 48, 52, (x, y) => {
    const dx = (x + 0.5 - 24) / 24;
    const dy = (y + 0.5 - 60) / 54;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    const c = RUBBLE(x, y);
    if (c.gap < 0.7 && grain(x, y, 151) > -0.1) return HEL.d2;
    return tone(HEL, 0.75 * light(dx, dy, Math.sqrt(1 - r) + 0.2) + 0.3 * light(c.dx / 5, c.dy / 5, 0.6) + 0.15 * grain(x, y, 152));
  });
  // mossy green-grey patches
  for (const [x, y] of [[7, 26], [39, 22], [12, 15], [33, 13], [5, 40]] as const) p.rect(x, y, 3, 1, '#2e5a48').px(x + 1, y - 1, '#4a7a5e');
  doorway(p, 24, 21, 11, 56, g.outer, g.mid, f);
  // the arch of bones: vertebrae round the top, long bones down the sides
  paint(p, 8, 14, 32, 42, (x, y) => {
    const dx = x + 0.5 - 24;
    const dy = y + 0.5 - 32;
    const r = dy < 0 ? Math.hypot(dx, dy) : Math.abs(dx);
    if (r < 11.5 || r > 15.5) return null;
    const u = ((r - 11.5) / 4 - 0.5) * 2;
    const nx = dy < 0 ? dx / r : Math.sign(dx);
    const ny = dy < 0 ? dy / r : 0;
    if (dy < 0) {
      const a = Math.atan2(dy, dx) / (Math.PI / 7);
      if (Math.abs(a - Math.round(a)) < 0.12) return BONE.d;
    } else if ((y - 32) % 8 === 7 && Math.abs(u) < 0.8) return BONE.d;
    return tone(BONE, light(nx * u, ny * u, Math.sqrt(Math.max(0, 1 - u * u)) + 0.25));
  });
  // the skull keystone
  paint(p, 18, 6, 13, 11, (x, y) => {
    const dx = (x + 0.5 - 24) / 6;
    const dy = (y + 0.5 - 11.5) / 5.2;
    if (dx * dx + dy * dy > 1) return null;
    return tone(BONE, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
  });
  p.rect(20, 10, 3, 3, '#0a1414').rect(25, 10, 3, 3, '#0a1414').px(21, 11, g.mid).px(26, 11, g.mid).px(20, 10, g.core).px(25, 10, g.core);
  p.rect(21, 15, 6, 2, BONE.b).rect(21, 15, 6, 1, BONE.l).px(22, 16, BONE.d).px(24, 16, BONE.d).px(26, 16, BONE.d).px(24, 14, BONE.d);
  // reeds and cattails of the swamp, bones lying in the mud
  for (const [x, h] of [[2, 9], [4, 12], [6, 8], [41, 10], [43, 13], [45, 8], [9, 6], [38, 7]] as const) {
    p.rect(x, 56 - h, 1, h, '#3e6a3a').px(x, 56 - h, '#6a9a54');
    if (h > 9) p.rect(x, 56 - h + 1, 1, 3, '#6a4a2a');
  }
  smallBone(p, 12, 53, 5);
  smallBone(p, 32, 54, 4);
  p.outline(OUTLINE);
  halo(p, 24, 44, 11, g.light, f ? 0.3 : 0.22);
  halo(p, 24, 11, 5, g.light, 0.25);
  // ghost-lights bobbing up and down beside it
  for (const [x, y] of [[5, f ? 22 : 24], [43, f ? 27 : 25]] as const) {
    flame(p, x, y, 4, 6, f ? 1 : -1, g.outer, g.mid, g.core);
    halo(p, x, y - 3, 6, g.light, 0.3);
  }
  return p;
}

/** Svartalfheim's mine: a mountainside of grey stone run through with gold, a dwarf's bearded face carved over a
 * timbered doorway, rails running out of it and two amber lanterns. */
function mineDoor(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[4]!;
  paint(p, 0, 0, 48, 56, (x, y) => {
    const dx = (x + 0.5 - 24) / 24;
    const top = 2 + Math.pow(Math.abs(dx), 1.5) * 24 + (x > 28 ? 2 : 0) + Math.round(1.5 * Math.sin(x * 0.9));
    if (y + 0.5 < top) return null;
    const c = RUBBLE(Math.floor(x * 0.7), Math.floor(y * 0.7));
    if (c.gap < 0.6) return DWARF.d2;
    return tone(DWARF, 0.55 - dx * 0.35 + 0.35 * light(c.dx / 4, c.dy / 4, 0.6) + 0.15 * grain(x, y, 161));
  });
  for (const [x0, y0, len] of [[4, 34, 8], [38, 30, 7], [8, 18, 5], [36, 44, 6]] as const)
    for (let i = 0; i < len; i++) p.px(x0 + i, y0 + Math.round(Math.sin(i * 1.3)), i % 3 === 1 ? GOLD.l2 : GOLD.b);
  doorway(p, 24, 27, 9, 56, g.outer, g.mid, f);
  // the timbers
  p.rect(13, 30, 3, 26, WOOD.b).rect(13, 30, 1, 26, WOOD.l).rect(15, 30, 1, 26, WOOD.d);
  p.rect(32, 30, 3, 26, WOOD.b).rect(32, 30, 1, 26, WOOD.l).rect(34, 30, 1, 26, WOOD.d);
  p.rect(10, 26, 28, 4, WOOD.b).rect(10, 26, 28, 1, WOOD.l2).rect(10, 29, 28, 1, WOOD.d2).px(12, 27, IRON.l).px(35, 27, IRON.l);
  // the dwarf's face carved above: a helmet, bushy brows, a nose and a great braided beard with gold rings
  const S = pal('#4a4a52', '#66666e', '#8a8a92', '#acacb4', '#ccccd2');
  paint(p, 16, 4, 17, 9, (x, y) => {
    const dx = (x + 0.5 - 24.5) / 8;
    const dy = (y + 0.5 - 12) / 7;
    if (dx * dx + dy * dy > 1 || y > 11) return null;
    return tone(S, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.2));
  });
  p.rect(16, 11, 17, 2, S.d).rect(16, 11, 17, 1, S.l).px(24, 4, S.l2).rect(24, 2, 1, 2, S.b);
  p.rect(19, 13, 11, 5, S.b).rect(19, 13, 1, 5, S.l);
  p.rect(20, 14, 3, 1, S.d2).rect(26, 14, 3, 1, S.d2).px(21, 15, g.mid).px(27, 15, g.mid);
  p.rect(24, 15, 1, 3, S.l).px(25, 17, S.d);
  paint(p, 17, 17, 15, 9, (x, y) => {
    const half = 7.5 - (y - 17) * 0.75;
    const u = (x + 0.5 - 24.5) / half;
    if (Math.abs(u) > 1) return null;
    return (x + y) % 3 === 0 ? S.d : u < -0.3 ? S.l : S.b;
  });
  p.rect(22, 21, 5, 1, GOLD.b).px(22, 21, GOLD.l2).rect(23, 24, 3, 1, GOLD.b).px(23, 24, GOLD.l2);
  // rails running out of the mine
  for (let y = 44; y < 56; y++) {
    const spread = (y - 44) * 0.35;
    if (y % 3 === 0) p.rect(Math.round(19 - spread), y, Math.round(11 + spread * 2), 1, WOOD.d);
    p.px(Math.round(20 - spread), y, IRON.l).px(Math.round(28 + spread), y, IRON.l);
  }
  // a pickaxe leaning on the rock
  p.line(41, 54, 44, 42, WOOD.b).line(40, 44, 44, 41, IRON.b).line(44, 41, 47, 44, IRON.b).px(40, 44, IRON.l2);
  // the lanterns hanging from the beam's ends
  for (const lx of [8, 37]) {
    p.rect(lx + 1, 30, 1, 3, IRON.d).rect(lx, 33, 3, 1, GOLD.b).rect(lx, 34, 3, 3, '#ffcc5a').px(lx, 34, '#fff2c0').rect(lx, 37, 3, 1, GOLD.d);
  }
  p.outline(OUTLINE);
  for (const lx of [9, 38]) halo(p, lx, 35, 6, g.light, f ? 0.34 : 0.26);
  halo(p, 24, 46, 10, g.light, f ? 0.26 : 0.2);
  twinkle(p, f ? 6 : 41, f ? 34 : 31, '#fff3b0');
  return p;
}

/** Havsormens tempel: a little temple of blue stone risen out of the sand, pillars grown over with coral, the sea
 * serpent carved on its roof round a glowing pearl, bubbles going up from the doorway. */
function seaTemple(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[5]!;
  const SAND = pal('#a88a50', '#c8ac70', '#e2cc94', '#f2e2b4', '#fff6d8');
  lump(p, 0, 48, 48, 10, SAND, 0.15, 171, 0.3);
  // the back wall, then the roof
  paint(p, 10, 18, 28, 32, (x, y) => {
    const course = Math.floor((y - 18) / 4);
    const yy = (y - 18) % 4;
    const xx = (x - 10 + (course % 2) * 3) % 6;
    if (yy === 3 || xx === 5) return SEA.d;
    return yy === 0 || xx === 0 ? SEA.l : SEA.b;
  });
  paint(p, 0, 3, 48, 15, (x, y) => {
    const half = (y - 3) * 1.75 + 2;
    const u = (x + 0.5 - 24) / half;
    if (Math.abs(u) > 1) return null;
    if (y >= 16) return y === 16 ? SEA.l2 : SEA.d;
    if (Math.abs(u) > 0.86) return u < 0 ? SEA.l2 : SEA.l;
    return grain(x, y, 172) > 0.3 ? SEA.l : SEA.b;
  });
  // the serpent winding along the roof, its head at the right
  for (let x = 12; x < 36; x++) {
    const y = 13 + Math.round(1.6 * Math.sin((x - 12) * 0.55));
    p.px(x, y, SEA.d2).px(x, y - 1, SEA.l2);
  }
  p.rect(35, 10, 4, 3, SEA.d2).px(36, 10, SEA.l2).px(37, 11, PEARL.l2);
  // the pillars: fluted, a capital and a foot
  for (const px0 of [3, 37]) {
    paint(p, px0 + 1, 18, 7, 30, (x) => {
      const k = x - px0 - 1;
      return k === 0 ? SEA.l2 : k === 6 ? SEA.d : k % 2 ? SEA.b : SEA.l;
    });
    p.rect(px0, 17, 9, 2, SEA.l).rect(px0, 17, 9, 1, SEA.l2).rect(px0, 46, 9, 3, SEA.b).rect(px0, 46, 9, 1, SEA.l);
  }
  doorway(p, 24, 28, 7, 56, g.outer, g.mid, f);
  // coral on the pillars, seaweed swaying, barnacles
  const ORANGE = pal('#8a3a14', '#c8601e', '#f08a3a', '#ffb878', '#ffe0c0');
  p.tpl(1, 36, ['#..#..#', '#.#..#.', '.##.#..', '..###..', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'], { '#': CORAL.b }).px(1, 36, CORAL.l2).px(4, 36, CORAL.l).px(7, 36, CORAL.l2);
  p.tpl(39, 38, ['#...#.', '#..#..', '.##..#', '..#.#.', '..##..', '..#...', '..#...', '..#...'], { '#': ORANGE.b }).px(39, 38, ORANGE.l2).px(43, 38, ORANGE.l).px(44, 40, ORANGE.l);
  for (const sx of [12, 35]) for (let y = 38; y < 48; y++) p.px(sx + Math.round(Math.sin(y * 0.8 + f * 1.5)), y, y % 3 ? '#3a8a4a' : '#5ab05a');
  for (const [x, y] of [[6, 24], [40, 30], [14, 22], [30, 20]] as const) p.px(x, y, PEARL.l).px(x + 1, y, PEARL.d);
  // a starfish and shells on the sand
  p.tpl(5, 51, ['..#..', '#####', '.###.', '#...#'], { '#': '#f07a8a' }).px(7, 52, '#ffc0c8');
  p.tpl(41, 52, ['.##.', '####'], { '#': PEARL.l }).px(42, 53, PEARL.d);
  p.outline(OUTLINE);
  // the pearl in the roof
  lump(p, 22, 7, 5, 5, PEARL, 0.05, 173, 0.7);
  p.px(23, 8, '#ffffff');
  halo(p, 24, 9, 6, g.light, 0.32);
  halo(p, 24, 44, 10, g.light, f ? 0.3 : 0.22);
  for (const [x, y] of (f ? [[22, 40], [27, 34], [24, 27], [20, 31]] : [[26, 41], [21, 36], [25, 30], [28, 26]]) as [number, number][]) p.px(x, y, '#c8f8ff').px(x + 1, y, '#78d8f0').px(x, y - 1, '#ffffff');
  return p;
}

/** Alvernas lund: an old, old tree with purple leaves, a doorway between its roots glowing violet, mushrooms glowing
 * on the roots and fairy lights twinkling in the crown. */
function alvTree(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[6]!;
  // the trunk, broadening into roots at the foot
  paint(p, 0, 8, 48, 48, (x, y) => {
    const half = 11 + (y > 38 ? (y - 38) * 0.7 : 0);
    const u = (x + 0.5 - 24) / half;
    if (Math.abs(u) > 1) return null;
    if ((x * 3 + Math.floor(y / 5)) % 7 === 0) return BARK.d2;
    return tone(BARK, light(u, -0.1, Math.sqrt(Math.max(0, 1 - u * u))) + 0.2 * grain(x, y, 181));
  });
  // roots spreading over the ground
  for (const [x0, y0, x1, y1] of [[14, 48, 3, 55], [16, 51, 9, 56], [34, 48, 45, 55], [32, 51, 39, 56]] as const) {
    p.line(x0, y0, x1, y1, BARK.b).line(x0, y0 - 1, x1, y1 - 1, BARK.l).line(x0, y0 + 1, x1, y1 + 1, BARK.d);
  }
  doorway(p, 24, 32, 7, 56, g.outer, g.mid, f);
  // the doorway's rim of grown wood
  paint(p, 14, 29, 20, 27, (x, y) => {
    const dx = x + 0.5 - 24;
    const dy = y + 0.5 - 39;
    const r = dy < 0 ? Math.hypot(dx, dy) : Math.abs(dx);
    return r >= 7 && r < 9 ? (dx < 0 ? BARK.l : BARK.d) : null;
  });
  // the crown
  lump(p, 0, 2, 20, 16, ALV_LEAF, 0.3, 182, 0.35);
  lump(p, 28, 2, 20, 16, ALV_LEAF, 0.3, 183, 0.35);
  lump(p, 10, 0, 28, 14, ALV_LEAF, 0.3, 184, 0.35);
  lump(p, 6, 10, 36, 10, ALV_LEAF, 0.3, 185, 0.3);
  for (const [x, y] of [[6, 8], [16, 4], [30, 5], [40, 9], [22, 12], [12, 14]] as const) p.px(x, y, SHROOM.pinkL).px(x + 1, y, ALV_LEAF.l2);
  // glowing mushrooms on the roots
  const cap = (x: number, y: number, c: string, cl: string) => p.rect(x, y + 1, 1, 2, SHROOM.stem).rect(x - 1, y, 3, 1, c).px(x - 1, y, cl).px(x, y - 1, c);
  cap(6, 51, SHROOM.violet, SHROOM.violetL);
  cap(42, 50, SHROOM.cyan, SHROOM.cyanL);
  cap(13, 44, SHROOM.pink, SHROOM.pinkL);
  cap(35, 43, SHROOM.cyan, SHROOM.cyanL);
  cap(10, 53, SHROOM.cyan, SHROOM.cyanL);
  p.outline('#140c18');
  halo(p, 24, 46, 10, g.light, f ? 0.3 : 0.22);
  for (const [x, y] of [[6, 50], [42, 49], [13, 43], [35, 42]] as const) halo(p, x, y, 4, g.light, 0.3);
  const fairies: [number, number, string][] = f
    ? [[4, 20], [45, 18], [20, 2], [36, 24], [10, 28]].map(([x, y], i) => [x!, y!, [SHROOM.cyanL, '#fff3b0', SHROOM.pinkL][i % 3]!])
    : [[2, 16], [43, 22], [26, 1], [38, 27], [8, 25]].map(([x, y], i) => [x!, y!, ['#fff3b0', SHROOM.pinkL, SHROOM.cyanL][i % 3]!]);
  for (const [x, y, c] of fairies) twinkle(p, x, y, c);
  return p;
}

/** Fenrisklyftan: a cleft in rough grey rock with frost and snow on it, cold light inside, a wolf's head carved over it
 * and the old chains that once held Fenris hanging broken down its sides. */
function fenrisCleft(f: number): Px {
  const p = new Px(48, 56);
  const g = GLOW[7]!;
  paint(p, 0, 0, 48, 56, (x, y) => {
    const dx = (x + 0.5 - 24) / 24;
    const top = 3 + dx * dx * 16 + Math.round(1.6 * Math.sin(x * 0.8));
    if (y + 0.5 < top) return null;
    const c = RUBBLE(Math.floor(x * 0.6), Math.floor(y * 0.6));
    if (c.gap < 0.6) return ROCK.d2;
    if (c.dx + c.dy < -3.2 && y < 40 && c.i % 3 !== 1) return grain(x, y, 191) > -0.1 ? FROSTW : '#c4d6e8';
    return tone(ROCK, 0.5 * light(dx, (y - 30) / 30, 0.7) + 0.35 * light(c.dx / 4, c.dy / 4, 0.6) + 0.15 * grain(x, y, 192));
  });
  // snow lying along the top
  paint(p, 0, 0, 48, 24, (x, y) => {
    const dx = (x + 0.5 - 24) / 24;
    const top = 3 + dx * dx * 16 + Math.round(1.6 * Math.sin(x * 0.8));
    return y + 0.5 >= top && y + 0.5 < top + 2 ? (y + 0.5 < top + 1 ? '#ffffff' : FROSTW) : null;
  });
  // the cleft, widening towards the ground, its edges ragged, cold light rising in it
  paint(p, 8, 16, 32, 40, (x, y) => {
    const hw = 1.5 + (y - 18) * 0.27 + (hash2(y, 7) % 3) * 0.4;
    const dx = Math.abs(x + 0.5 - 24);
    if (y < 18 || dx > hw) return null;
    const up = 53 - y;
    if (up < 3) return g.mid;
    if (up < 6) return g.outer;
    if (up < 12 && (x + y) % 2 === 0) return g.outer;
    return dx > hw - 1 ? ROCK.d2 : VOID;
  });
  for (let i = 0; i < 3; i++) p.rect(17 + i * 2, 54 - i * 2, 14 - i * 4, 1, i === 0 ? '#c8d8ec' : '#6a7a8e');
  // icicles hanging over the cleft
  for (const [x, len] of [[21, 4], [23, 6], [26, 3], [28, 5]] as const) p.rect(x, 19, 1, len, '#dceeff').px(x, 18 + len, '#a8c8e8');
  // the wolf's head carved above
  const W = pal('#3a4048', '#5a626e', '#7a8490', '#a0aab6', '#c4ccd6');
  p.tpl(17, 4, ['#............#', '##..........##', '###........###', '.############.', '.############.', '..##########..', '...########...', '....######....', '.....####.....', '......##......'], { '#': W.b });
  p.line(17, 4, 20, 7, W.l2).line(18, 7, 22, 7, W.l).px(30, 4, W.l).rect(20, 8, 2, 1, VOID).rect(26, 8, 2, 1, VOID).px(21, 8, g.mid).px(26, 8, g.mid).rect(23, 12, 2, 1, VOID);
  // the broken chains, hanging from iron rings in the rock
  for (const [rx, ry, ex, ey] of [[9, 20, 15, 44], [39, 18, 34, 46]] as const) {
    p.rect(rx - 2, ry - 2, 5, 5, IRON.d).rect(rx - 1, ry - 1, 3, 3, IRON.b).px(rx - 1, ry - 1, IRON.l2).px(rx, ry, IRON.d2);
    chain(p, rx, ry + 3, ex, ey, 2);
  }
  lump(p, 0, 50, 14, 6, SNOW, 0.08, 193, 0.5);
  lump(p, 34, 51, 14, 5, SNOW, 0.08, 194, 0.5);
  p.outline(OUTLINE);
  halo(p, 24, 46, 10, g.light, f ? 0.3 : 0.22);
  twinkle(p, f ? 7 : 40, f ? 9 : 12, '#e8faff');
  twinkle(p, f ? 30 : 15, f ? 32 : 28, '#ffffff');
  return p;
}

/** Bifrost's gate: an arch of black glass crowned with rainbow crystals, the rainbow bridge itself shimmering in it. */
function bifrostArch(f: number): Px {
  const p = new Px(48, 56);
  const glass = (x: number, y: number, dx: number): string => {
    const k = (x * 2 + y) % 11;
    return k === 0 || k === 1 ? OBSIDIAN.l : dx < -0.5 ? OBSIDIAN.l : dx > 0.5 ? OBSIDIAN.d : OBSIDIAN.b;
  };
  // the steps
  p.rect(2, 50, 44, 6, OBSIDIAN.b).rect(2, 50, 44, 1, OBSIDIAN.l2).rect(4, 53, 40, 1, OBSIDIAN.l).rect(2, 55, 44, 1, OBSIDIAN.d2);
  // the arch
  paint(p, 5, 4, 38, 46, (x, y) => {
    const dx = x + 0.5 - 24;
    const dy = y + 0.5 - 22;
    const r = dy < 0 ? Math.hypot(dx, dy) : Math.abs(dx);
    if (r < 10 || r > 18) return null;
    const u = (r - 14) / 4;
    return glass(x, y, dy < 0 ? (dx < 0 ? -u : u) : dx < 0 ? -1 : 1);
  });
  // the rainbow in the doorway: arcs of colour, brightest near the ground, shifting a step each frame
  paint(p, 14, 12, 20, 38, (x, y) => {
    const dx = x + 0.5 - 24;
    const dy = y + 0.5 - 22;
    if (Math.abs(dx) >= 10 || (dy < 0 && Math.hypot(dx, dy) >= 10)) return null;
    const r = Math.hypot(dx, y + 0.5 - 62);
    const band = (((Math.floor((r + f * 1.5) / 2.4) % 6) + 6) % 6);
    const fade = (y - 12) / 38;
    if (fade < 0.3 && (x + y) % 2 === 0) return '#1a1430';
    return shade(RAINBOW[band]!, 1.15 + fade * 0.45);
  });
  for (const [x, y] of (f ? [[18, 20], [28, 30], [22, 40]] : [[27, 18], [19, 33], [25, 44]]) as [number, number][]) p.px(x, y, '#ffffff');
  // crystals growing along the top of the arch
  for (const [x, y, h, lean, k] of [[9, 24, 7, -2, 0], [12, 14, 8, -2, 1], [18, 8, 9, -1, 2], [24, 6, 11, 0, 3], [30, 8, 9, 1, 4], [36, 14, 8, 2, 5], [39, 24, 7, 2, 0]] as const)
    shard(p, x, y, 4, h, lean, ramp(RAINBOW[k]!));
  p.outline(OUTLINE);
  halo(p, 24, 40, 12, f ? '#ffe0f4' : '#e0f0ff', 0.26);
  halo(p, 24, 4, 8, '#fff6c8', 0.22);
  twinkle(p, f ? 4 : 44, f ? 8 : 4, '#ffffff');
  twinkle(p, f ? 43 : 3, f ? 30 : 36, '#fff3b0');
  twinkle(p, f ? 24 : 15, f ? 0 : 3, '#ffd8f8');
  return p;
}

const PORTALS = [barrow, iceGate, forgeDoor, helGate, mineDoor, seaTemple, alvTree, fenrisCleft, bifrostArch];
const sagaPortal = (look: number, f: number): Px => PORTALS[look % PORTALS.length]!(f);

// ---------------------------------------------------------------------------
// The rune plates of the puzzle rooms (flat 16×16): 0 dark, 1 lit; then both again with the glow a step on
// ---------------------------------------------------------------------------

function sagaPlate(lit: boolean, f: number): Px {
  const p = new Px(16, 16);
  const S = pal('#2a2a30', '#3e3e46', '#58585f', '#76767e', '#94949c');
  // a square slab sunk into the floor, bevelled, a ring of gold round a rune
  paint(p, 1, 1, 14, 14, (x, y) => {
    const e = Math.min(x - 1, y - 1, 14 - x, 14 - y);
    if ((x === 1 || x === 14) && (y === 1 || y === 14)) return null;
    if (e === 0) return x === 1 || y === 1 ? S.d2 : S.l;
    if (e === 1) return x === 2 || y === 2 ? S.l2 : S.d;
    return grain(x, y, 201) > 0.38 ? S.l : S.b;
  });
  paint(p, 3, 3, 10, 10, (x, y) => {
    const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    return r > 3.6 && r < 4.6 ? (lit ? GOLD.l : GOLD.d) : null;
  });
  const cut = lit ? (f ? RUNE.core : RUNE.l) : S.d2;
  p.tpl(6, 5, ['#..#', '##.#', '#.##', '#..#', '#..#', '.##.'], { '#': cut });
  if (!lit) return p;
  glowOn(p, 8, 8, 7, RUNE.b, f ? 0.34 : 0.24);
  for (const [x, y] of (f ? [[3, 3], [12, 12]] : [[12, 3], [3, 12]]) as [number, number][]) p.px(x, y, RUNE.core);
  return p;
}

// ---------------------------------------------------------------------------
// Helheim's things: gravestones, heaps of round skulls, ghost-lights, dead trees
// ---------------------------------------------------------------------------

const GRAVE = pal('#2c3a3c', '#455658', '#62767a', '#82989a', '#a8bcbc');

/** A round little skull (w ~6), smiling, its eyes dark (or glowing `eye`). */
function tinySkull(p: Px, cx: number, cy: number, eye = '#14201e', big = false): Px {
  const rx = big ? 4 : 3;
  const ry = big ? 3.4 : 2.6;
  paint(p, cx - rx - 1, cy - ry - 1, rx * 2 + 2, ry * 2 + 2, (x, y) => {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy > 1) return null;
    return tone(BONE, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
  });
  const e = big ? 2 : 1;
  p.rect(cx - 2, cy, e, e, eye).rect(cx + (big ? 1 : 1), cy, e, e, eye);
  p.rect(cx - 1, cy + Math.ceil(ry), 3, 1, BONE.b).px(cx, cy + Math.ceil(ry), BONE.d);
  return p;
}

/** A gravestone (16×20 at oy -4): 0 a round-topped stone with a carved moon and moss, 1 an old one leaning and
 * cracked, 2 a little stone with a wreath of bones and a candle. Never a cross. */
function gravestone(v: number): Px {
  const p = new Px(16, 20);
  // a mound of dark earth
  lump(p, 1, 15, 14, 5, pal('#141c18', '#20302a', '#2e4238', '#3e5648', '#527060'), 0.2, 211, 0.3);
  const w = v === 2 ? 8 : 10;
  const h = v === 2 ? 9 : 14;
  const lean = v === 1 ? 0.22 : 0;
  const x0 = 8 - w / 2;
  paint(p, 0, 17 - h, 16, h + 1, (x, y) => {
    const off = Math.round((17 - y) * lean);
    const xx = x - off;
    if (xx < x0 || xx >= x0 + w) return null;
    const u = (xx + 0.5 - 8) / (w / 2);
    const topY = 17 - h + (1 - Math.sqrt(Math.max(0, 1 - u * u))) * (w / 2) * 0.8;
    if (y + 0.5 < topY) return null;
    if (y + 0.5 < topY + 1) return GRAVE.l2;
    return u < -0.65 ? GRAVE.l : u > 0.65 ? GRAVE.d : grain(x, y, 212) > 0.38 ? GRAVE.l : GRAVE.b;
  });
  if (v === 0) {
    // a crescent moon carved in it, a rune under, moss on its shoulder
    p.tpl(6, 6, ['.##.', '#...', '#...', '.##.'], { '#': GRAVE.d2 }).px(9, 7, GRAVE.l2);
    rune(p, 6, 11, 3, GRAVE.d2);
    p.rect(3, 6, 3, 1, MOSS.b).px(3, 7, MOSS.d).px(4, 5, MOSS.l);
  } else if (v === 1) {
    p.line(9, 5, 7, 9, GRAVE.d2).line(7, 9, 9, 12, GRAVE.d2).px(10, 5, GRAVE.l2);
    rune(p, 5, 9, 5, GRAVE.d);
    p.px(4, 16, MOSS.b).px(12, 16, MOSS.l);
  } else {
    smallBone(p, 3, 16, 5);
    smallBone(p, 8, 17, 5);
    rune(p, 7, 11, 1, GRAVE.d2);
    p.rect(12, 12, 2, 4, '#ece2c4').px(12, 12, '#fffaf0').px(13, 11, '#3a3026');
  }
  p.outline(OUTLINE);
  if (v === 2) flame(p, 13, 11, 3, 4, 0, '#f08a24', '#ffd23a', '#fff6c8');
  return p;
}

/** A heap of round, smiling skulls on the floor (flat): 0 three in a pile, 1 two and some bones, 2 one big one
 * with a green ghost-light in its eyes. */
function skullPile(v: number): Px {
  const p = new Px(16, 16);
  if (v === 0) {
    tinySkull(p, 4, 11);
    tinySkull(p, 11, 11);
    tinySkull(p, 8, 6);
  } else if (v === 1) {
    smallBone(p, 2, 13, 7);
    smallBone(p, 7, 3, 6);
    tinySkull(p, 5, 8);
    tinySkull(p, 11, 10);
  } else {
    smallBone(p, 1, 14, 6);
    smallBone(p, 9, 14, 6);
    tinySkull(p, 8, 7, GLOW[3]!.mid, true);
  }
  p.outline(OUTLINE);
  if (v === 2) halo(p, 8, 8, 6, GLOW[3]!.light, 0.25);
  return p;
}

/** Ghost-lights (16×24 at oy -8), floating and bobbing: 0 one big, 1 two little ones, 2 one over an old stone bowl. */
function ghostLight(v: number, f: number): Px {
  const p = new Px(16, 24);
  const g = GLOW[3]!;
  const bob = f ? -1 : 1;
  if (v === 2) {
    p.rect(4, 19, 8, 2, GRAVE.b).rect(4, 19, 8, 1, GRAVE.l).rect(6, 21, 4, 2, GRAVE.d).rect(5, 23, 6, 1, GRAVE.d2);
    p.outline(OUTLINE);
  }
  const lights: [number, number, number, number][] = v === 0 ? [[8, 16 + bob, 6, 11]] : v === 1 ? [[5, 13 + bob, 4, 7], [11, 18 - bob, 4, 6]] : [[8, 17 + bob, 5, 9]];
  for (const [x, y, w, h] of lights) {
    halo(p, x, y - h / 2, h * 0.75, g.light, 0.28);
    flame(p, x, y, w, h, f ? 1.2 : -1.2, g.outer, g.mid, g.core);
    // two little dark eyes: the light is shy
    if (h > 6) p.px(x - 1, y - 3, '#145a3a').px(x + 1, y - 3, '#145a3a');
  }
  return p;
}

/** A dead tree (16×32 at oy -16), bare and twisted, its bark grey-green: 0 bare, 1 with a ghost-light lantern hanging
 * from a branch, 2 with a little black crow. */
function deadTree(v: number): Px {
  const p = new Px(16, 32);
  const B = pal('#1e2624', '#2e3a36', '#44524c', '#5e6e66', '#7e8e86');
  // roots and trunk, two pixels thick, leaning
  p.line(4, 31, 7, 28, B.d).line(12, 31, 9, 28, B.d);
  paint(p, 5, 12, 6, 20, (x, y) => {
    const cx = 8 + Math.round(Math.sin((y - 12) * 0.25) * 1.2);
    const half = 1.5 + (y - 12) * 0.06;
    const u = x + 0.5 - cx;
    if (Math.abs(u) > half) return null;
    return u < -0.5 ? B.l : u > 0.6 ? B.d : B.b;
  });
  const br = (x0: number, y0: number, x1: number, y1: number) => p.line(x0, y0, x1, y1, B.b).line(x0, y0 + 1, x1, y1 + 1, B.d);
  const twig = (x0: number, y0: number, x1: number, y1: number) => p.line(x0, y0, x1, y1, B.l);
  br(8, 15, 3, 9);
  br(8, 14, 12, 7);
  twig(8, 12, 8, 4);
  twig(3, 9, 1, 5);
  twig(4, 10, 0, 11);
  twig(12, 7, 15, 6);
  twig(12, 7, 11, 2);
  twig(8, 6, 6, 3);
  twig(8, 7, 10, 4);
  twig(1, 5, 2, 3);
  p.px(8, 22, B.d2).px(7, 23, B.d2);
  if (v === 2) p.tpl(11, 1, ['.##..', '####.', '.####', '..##.'], { '#': '#14121a' }).px(12, 2, '#ffffff').px(10, 2, '#e8a83a').px(12, 5, '#e8a83a');
  p.outline(OUTLINE);
  if (v === 1) {
    p.rect(2, 10, 1, 2, IRON.l).rect(1, 12, 3, 4, BONE.b).px(1, 12, BONE.l).rect(1, 16, 3, 1, BONE.d);
    p.px(2, 13, GLOW[3]!.core).px(2, 14, GLOW[3]!.mid);
    halo(p, 2, 14, 5, GLOW[3]!.light, 0.32);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Svartalfheim's things: mine carts, heaps of gold, dwarf statues, mine lamps
// ---------------------------------------------------------------------------

/** A mine cart on its rails (16×20 at oy -4): 0 full of rock with gold in it, 1 heaped with gold, 2 empty with a pick. */
function mineCart(v: number): Px {
  const p = new Px(16, 20);
  // the rails and their sleepers, running left to right
  p.rect(0, 16, 16, 1, IRON.l).rect(0, 19, 16, 1, IRON.b);
  for (const x of [1, 6, 11]) p.rect(x, 17, 3, 2, WOOD.d);
  // the load, then the box: iron, tapering to its foot, with riveted bands
  if (v === 0) {
    lump(p, 2, 3, 12, 6, DWARF, 0.4, 221, 0.4);
    p.px(5, 5, GOLD.l2).px(9, 4, GOLD.b).px(11, 6, GOLD.l);
  } else if (v === 1) {
    lump(p, 2, 2, 12, 7, GOLD, 0.25, 222, 0.4);
    p.rect(4, 4, 2, 1, GOLD.l2).px(10, 3, '#ffffff').rect(8, 5, 2, 2, '#e83a5a').px(8, 5, '#ffb0c0');
  } else {
    p.line(4, 1, 6, 8, WOOD.b).line(2, 2, 7, 0, IRON.b).px(2, 2, IRON.l2);
  }
  paint(p, 1, 7, 14, 8, (x, y) => {
    const inset = (y - 7) * 0.25;
    if (x + 0.5 < 1 + inset || x + 0.5 > 15 - inset) return null;
    if (y === 7) return IRON.l2;
    if (y === 8 && v === 2) return '#14161c';
    if (x === 4 || x === 11) return IRON.l;
    if (y === 10) return IRON.d;
    return x < 4 ? IRON.b : IRON.d;
  });
  for (const [x, y] of [[4, 9], [11, 9], [4, 12], [11, 12]] as const) p.px(x, y, IRON.l2);
  for (const wx of [3, 10]) p.rect(wx, 14, 3, 3, '#2a2c32').px(wx + 1, 15, IRON.l);
  return p.outline(OUTLINE);
}

/** A heap of gold (16×20 at oy -4) catching the light: 0 a heap of coins, 1 stacks of coins and a gem, 2 a heap with a
 * gold goblet on top. Frames: the three, then the three with the glints moved on. */
function goldPile(v: number, f: number): Px {
  const p = new Px(16, 20);
  if (v === 1) {
    for (const [x, h] of [[2, 6], [6, 9], [10, 5]] as const)
      for (let i = 0; i < h; i++) p.rect(x, 18 - i, 4, 1, i === h - 1 ? GOLD.l2 : i % 2 ? GOLD.b : GOLD.d).px(x, 18 - i, GOLD.l).px(x + 3, 18 - i, GOLD.d2);
    lump(p, 11, 14, 4, 4, ramp('#3a8ae8'), 0.05, 231, 0.6);
  } else {
    lump(p, 1, 9, 14, 10, GOLD, 0.35, 232, 0.25);
    for (const [x, y] of [[3, 15], [9, 12], [12, 16], [6, 11]] as const) p.rect(x, y, 2, 1, GOLD.l2).px(x + 1, y + 1, GOLD.d);
    if (v === 2) {
      p.rect(6, 2, 5, 4, GOLD.b).rect(6, 2, 5, 1, GOLD.l2).px(6, 3, GOLD.l).rect(8, 6, 1, 3, GOLD.d).rect(6, 9, 5, 1, GOLD.b);
      p.px(8, 4, '#e83a5a');
    } else p.rect(7, 8, 2, 2, '#3ac85a').px(7, 8, '#b8ffc8');
  }
  p.outline(OUTLINE);
  const glints: [number, number][] = f ? [[4, 10], [12, 13]] : [[10, 9], [5, 15]];
  for (const [x, y] of glints) twinkle(p, x, y);
  return halo(p, 8, 14, 9, '#ffe27a', f ? 0.18 : 0.12);
}

/** A dwarf carved in stone (16×32 at oy -16), on a plinth: a helmet, a great braided beard, and 0 an axe, 1 a hammer
 * held up, 2 a round shield. */
function dwarfStatue(v: number): Px {
  const p = new Px(16, 32);
  const S = pal('#3e3e46', '#5a5a64', '#7c7c86', '#a0a0aa', '#c4c4cc');
  p.rect(1, 25, 14, 7, S.b).rect(1, 25, 14, 1, S.l2).rect(1, 26, 1, 6, S.l).rect(14, 26, 1, 6, S.d).rect(1, 31, 14, 1, S.d2);
  rune(p, 6, 27, v + 2, S.d2);
  // a broad, short body, a belt with a gold buckle, boots
  p.rect(3, 14, 10, 10, S.b).rect(3, 14, 2, 10, S.l).rect(11, 14, 2, 10, S.d).rect(3, 21, 10, 1, S.d2).rect(7, 21, 2, 1, GOLD.b);
  p.rect(4, 23, 3, 2, S.d).rect(9, 23, 3, 2, S.d);
  // the head: a helmet with a spike and a rim, bushy brows, a big nose
  lump(p, 4, 3, 8, 7, S, 0.15, 241, 0.3);
  p.rect(3, 8, 10, 1, S.l2).rect(3, 9, 10, 1, S.d).px(8, 2, S.l).px(8, 1, S.b);
  p.rect(5, 10, 6, 3, S.b).rect(5, 10, 2, 1, S.l2).rect(9, 10, 2, 1, S.l2).px(6, 11, '#14121a').px(9, 11, '#14121a').rect(7, 11, 2, 2, S.l).px(8, 12, S.d);
  // the great beard down over the belly, in two braids, a gold ring at its tip
  paint(p, 3, 13, 10, 8, (x, y) => {
    const half = 4.6 - (y - 13) * 0.42;
    const u = (x + 0.5 - 8) / half;
    if (Math.abs(u) > 1) return null;
    if ((x === 6 || x === 9) && y > 13) return S.d;
    return u < -0.4 ? S.l2 : S.l;
  });
  p.rect(7, 20, 2, 1, GOLD.l).px(7, 20, GOLD.l2);
  if (v === 0) p.line(13, 24, 14, 11, WOOD.b).tpl(12, 9, ['.###', '####', '.##.'], { '#': S.l }).px(13, 9, S.l2);
  if (v === 1) p.line(13, 22, 13, 9, WOOD.b).rect(11, 6, 5, 4, S.l).rect(11, 6, 5, 1, S.l2).rect(15, 7, 1, 3, S.d);
  if (v === 2) {
    paint(p, 0, 14, 8, 9, (x, y) => {
      const r = Math.hypot(x + 0.5 - 3.5, y + 0.5 - 18.5);
      return r > 4 ? null : r < 1.2 ? GOLD.l : r > 3.2 ? S.d : S.l;
    });
  }
  p.outline(OUTLINE);
  return p;
}

/** A mine lamp (16×24 at oy -8), its flame flickering amber: 0 on a wooden post, 1 hung from a little gallows of
 * beams, 2 standing on a crate. */
function mineLamp(v: number, f: number): Px {
  const p = new Px(16, 24);
  const g = GLOW[4]!;
  let lx = 6;
  let ly = 6;
  if (v === 0) {
    p.rect(7, 10, 2, 14, WOOD.b).rect(7, 10, 1, 14, WOOD.l).rect(5, 22, 6, 2, WOOD.d);
    ly = 4;
  } else if (v === 1) {
    p.rect(2, 4, 2, 20, WOOD.b).rect(2, 4, 1, 20, WOOD.l).rect(2, 3, 12, 2, WOOD.b).rect(2, 3, 12, 1, WOOD.l).line(4, 8, 7, 5, WOOD.d);
    p.rect(11, 5, 1, 3, IRON.d);
    lx = 9;
    ly = 8;
  } else {
    p.rect(3, 15, 10, 8, WOOD.b).rect(3, 15, 10, 1, WOOD.l2).rect(3, 19, 10, 1, WOOD.d).line(3, 15, 12, 22, WOOD.d).rect(3, 22, 10, 1, WOOD.d2);
    ly = 7;
  }
  p.rect(lx + 1, ly - 1, 2, 1, IRON.b).rect(lx, ly, 4, 1, GOLD.b).rect(lx, ly + 1, 4, 5, '#ffcc5a').rect(lx, ly + 1, 1, 5, GOLD.d).rect(lx + 3, ly + 1, 1, 5, GOLD.d).rect(lx, ly + 6, 4, 1, GOLD.d2);
  p.px(lx + 1, ly + 2, '#fff2c0');
  p.outline(OUTLINE);
  p.px(lx + 2, ly + 3, f ? '#fff8d8' : '#ffe27a').px(lx + 1, ly + 4, f ? '#ffe27a' : '#fff8d8');
  return halo(p, lx + 2, ly + 3, 7, g.light, f ? 0.34 : 0.26);
}

// ---------------------------------------------------------------------------
// Havsormens tempel's things: coral, an old anchor, seaweed, pearls
// ---------------------------------------------------------------------------

const ORANGE_CORAL = pal('#8a3a14', '#c8601e', '#f08a3a', '#ffb878', '#ffe0c0');
const PURPLE_CORAL = pal('#4a1a5a', '#74308a', '#a050b8', '#c888d8', '#ecc8f4');

/** A coral (16×24 at oy -8) on a rock: 0 a branching pink one, 1 an orange fan, 2 purple tubes. */
function coral(v: number): Px {
  const p = new Px(16, 24);
  lump(p, 2, 18, 12, 6, SEA, 0.3, 251, 0.3);
  if (v === 0) {
    const br = (x0: number, y0: number, x1: number, y1: number) => p.line(x0, y0, x1, y1, CORAL.b).line(x0 + 1, y0, x1 + 1, y1, CORAL.d).px(x1, y1, CORAL.l2);
    br(7, 19, 7, 5);
    br(7, 14, 3, 9);
    br(3, 10, 2, 4);
    br(7, 11, 12, 6);
    br(12, 7, 13, 2);
    br(10, 8, 9, 3);
    br(4, 7, 6, 3);
  } else if (v === 1) {
    // a sea fan: a lace of orange spreading up from a short stem, its ribs running out like a hand's fingers
    paint(p, 0, 2, 16, 16, (x, y) => {
      const dx = x + 0.5 - 8;
      const dy = (y + 0.5 - 18) * 0.9;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (r > 8.2 + Math.sin(a * 7) * 0.8 || r < 2 || a > -0.35 || a < -Math.PI + 0.35) return null;
      const rib = Math.abs(((a * 9) / Math.PI) % 1) < 0.3;
      const ring = Math.abs((r % 2.4) - 1.2) < 0.4;
      if (rib) return dx < 0 ? ORANGE_CORAL.l : ORANGE_CORAL.b;
      if (ring) return ORANGE_CORAL.b;
      return (x + y) % 2 ? ORANGE_CORAL.d : null;
    });
    p.rect(7, 15, 2, 4, ORANGE_CORAL.d).px(7, 15, ORANGE_CORAL.b);
  } else {
    for (const [x, h] of [[3, 7], [6, 12], [9, 15], [12, 9]] as const) {
      p.rect(x, 19 - h, 3, h, PURPLE_CORAL.b).rect(x, 19 - h, 1, h, PURPLE_CORAL.l).rect(x + 2, 19 - h, 1, h, PURPLE_CORAL.d);
      p.rect(x, 18 - h, 3, 1, PURPLE_CORAL.l2).px(x + 1, 18 - h, '#2a0a34');
    }
  }
  p.outline(OUTLINE);
  p.px(4, 20, PEARL.l).px(11, 21, PEARL.l);
  return p;
}

/** An old anchor (16×24 at oy -8) stuck in the floor, green with age, barnacles on it: 0 bare, 1 with seaweed hung
 * over it, 2 with its chain coiled at its foot and a little crab. */
function anchor(v: number): Px {
  const p = new Px(16, 24);
  const A = VERDIGRIS;
  if (v === 2) {
    for (let i = 0; i < 3; i++) chain(p, 2, 21 - i, 14, 21 - i, 0, A);
  }
  // the ring, the shank, the stock across it, the arms curving up to their flukes
  paint(p, 5, 0, 6, 6, (x, y) => {
    const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 3);
    return r > 1.4 && r < 2.9 ? (x < 8 ? A.l : A.d) : null;
  });
  p.rect(7, 5, 2, 15, A.b).rect(7, 5, 1, 15, A.l);
  p.rect(3, 7, 10, 2, A.b).rect(3, 7, 10, 1, A.l2).px(2, 7, A.d).px(13, 8, A.d);
  paint(p, 1, 12, 14, 9, (x, y) => {
    const dx = x + 0.5 - 8;
    const dy = y + 0.5 - 12;
    const r = Math.hypot(dx, dy);
    return r > 6 && r < 7.8 && dy > 0 ? (dx < 0 ? A.l : A.d) : null;
  });
  p.tpl(0, 12, ['##.', '###', '.#.'], { '#': A.b }).tpl(13, 12, ['.##', '###', '.#.'], { '#': A.b }).px(0, 12, A.l2);
  for (const [x, y] of [[8, 9], [7, 15], [4, 18], [11, 17]] as const) p.px(x, y, PEARL.l).px(x, y + 1, PEARL.d);
  if (v === 1) {
    for (const sx of [5, 10]) for (let y = 6; y < 16; y++) p.px(sx + Math.round(Math.sin(y * 0.9 + sx) * 0.8), y, y % 3 ? '#3a8a4a' : '#5ab05a');
  }
  if (v === 2) {
    p.rect(10, 20, 4, 2, '#e8603a').px(10, 20, '#ffa080').px(9, 19, '#e8603a').px(14, 19, '#e8603a').px(11, 19, '#14121a').px(13, 19, '#14121a');
  }
  p.outline(OUTLINE);
  return p;
}

/** Seaweed on the floor (flat 16×16), swaying: 0 three tall strands, 1 a clump of round kelp leaves, 2 strands round
 * a shell. Frames: the three, then the three swayed the other way. */
function seaweed(v: number, f: number): Px {
  const p = new Px(16, 16);
  const G = pal('#16402a', '#24603a', '#3a8a4a', '#5ab05a', '#8ad87a');
  const sway = f ? 1 : -1;
  const strand = (x0: number, len: number, ph: number) => {
    for (let i = 0; i < len; i++) {
      const y = 15 - i;
      const x = x0 + Math.round(Math.sin(i * 0.7 + ph) * 1.2 + (sway * i * i) / 60);
      p.px(x, y, i % 4 === 1 ? G.l : G.b).px(x + 1, y, G.d);
    }
    p.px(x0 + Math.round(Math.sin((len - 1) * 0.7 + ph) * 1.2 + (sway * (len - 1) * (len - 1)) / 60), 16 - len, G.l2);
  };
  if (v === 0) {
    strand(3, 12, 0);
    strand(7, 15, 1.5);
    strand(11, 10, 3);
  } else if (v === 1) {
    for (const [x, y, w] of [[2, 6, 5], [8, 3, 6], [5, 9, 6], [9, 10, 5]] as const) lump(p, x + (f && y < 8 ? 1 : 0), y, w, 4, G, 0.1, x + y, 0.4);
    p.line(7, 15, 7, 6, G.d);
  } else {
    strand(2, 11, 0.5);
    strand(12, 13, 2);
    p.tpl(5, 11, ['.###.', '#####', '#.#.#'], { '#': PEARL.l }).px(6, 12, PEARL.b).px(8, 12, PEARL.b).px(7, 11, '#ffffff');
  }
  return p.outline('#0e2418');
}

/** A pearl glowing in the dark (16×20 at oy -4): 0 in an open clam, 1 on a stand of coral, 2 three in a shell. */
function pearl(v: number, f: number): Px {
  const p = new Px(16, 20);
  const g = GLOW[5]!;
  const clam = (y: number) => {
    // the lower shell, ribbed, and the upper one standing open behind
    paint(p, 1, y - 9, 14, 6, (x, py) => {
      const dx = (x + 0.5 - 8) / 7;
      const dy = (py + 0.5 - (y - 4)) / 5;
      if (dy > 0 || dx * dx + dy * dy > 1) return null;
      return dy < -0.75 ? '#a87aa0' : x % 3 === 0 ? '#4a2a5a' : dx < 0 ? '#6a4a7a' : '#5a3a6a';
    });
    paint(p, 1, y - 4, 14, 5, (x, py) => {
      const dx = (x + 0.5 - 8) / 7;
      const dy = (py + 0.5 - (y - 4)) / 4;
      if (dy < 0 || dx * dx + dy * dy > 1) return null;
      return x % 3 === 0 ? '#7a4a74' : py === y - 4 ? '#e8c8e0' : dx < 0 ? '#c890b8' : '#a87aa0';
    });
  };
  if (v === 0) {
    clam(17);
    lump(p, 5, 9, 6, 6, PEARL, 0.05, 261, 0.7);
  } else if (v === 1) {
    p.line(8, 19, 8, 9, CORAL.b).line(8, 13, 5, 10, CORAL.b).line(8, 13, 11, 10, CORAL.b).px(5, 10, CORAL.l2).px(11, 10, CORAL.l2).rect(5, 18, 7, 2, CORAL.d);
    lump(p, 5, 3, 6, 6, PEARL, 0.05, 262, 0.7);
  } else {
    clam(18);
    lump(p, 3, 11, 4, 4, PEARL, 0.05, 263, 0.7);
    lump(p, 9, 11, 4, 4, ramp('#f4c8e0'), 0.05, 264, 0.7);
    lump(p, 6, 9, 4, 4, PEARL, 0.05, 265, 0.7);
  }
  p.outline(OUTLINE);
  const [cx, cy] = v === 1 ? [8, 6] : [8, 12];
  glowOn(p, cx, cy, 4, '#ffffff', f ? 0.3 : 0.15);
  halo(p, cx, cy, 8, g.light, f ? 0.32 : 0.22);
  p.px(cx - 1, cy - 1, '#ffffff');
  return p;
}

// ---------------------------------------------------------------------------
// Alvernas lund's things: glowing mushrooms, fairy lights, cobwebs, elf statues
// ---------------------------------------------------------------------------

/** A mushroom cap of width w (half), its foot at (x, foot), cap colours c and cl, stem h tall. */
function mushroom(p: Px, x: number, foot: number, w: number, h: number, c: string, cl: string): Px {
  p.rect(x - 1, foot - h, 2, h, SHROOM.stem).px(x, foot - h + 1, SHROOM.stemD).px(x, foot - 1, SHROOM.stemD);
  const cy = foot - h;
  paint(p, x - w - 1, cy - w, w * 2 + 3, w + 1, (px, py) => {
    const dx = (px + 0.5 - x) / (w + 0.5);
    const dy = (py + 0.5 - cy - 0.5) / (w * 0.8);
    if (dy > 0 || dx * dx + dy * dy > 1) return null;
    return py === cy ? shade(c, 0.7) : dx < -0.2 && dy < -0.4 ? cl : c;
  });
  p.px(x - Math.ceil(w / 2), cy - Math.ceil(w * 0.5), '#ffffff').px(x + Math.ceil(w / 2), cy - 1, cl);
  return p;
}

/** Glowing mushrooms (16×24 at oy -8): 0 one big violet one, 1 three cyan ones, 2 pink and violet. Their glow breathes. */
function glowshroom(v: number, f: number): Px {
  const p = new Px(16, 24);
  p.ellipse(2, 20, 12, 4, ALV_LEAF.d).ellipse(3, 20, 10, 3, ALV_LEAF.b);
  let glow: string = SHROOM.violetL;
  if (v === 0) {
    mushroom(p, 8, 22, 6, 9, SHROOM.violet, SHROOM.violetL);
    mushroom(p, 13, 22, 2, 3, SHROOM.cyan, SHROOM.cyanL);
  } else if (v === 1) {
    mushroom(p, 5, 22, 3, 7, SHROOM.cyan, SHROOM.cyanL);
    mushroom(p, 11, 22, 4, 11, SHROOM.cyan, SHROOM.cyanL);
    mushroom(p, 8, 23, 2, 3, SHROOM.cyan, SHROOM.cyanL);
    glow = SHROOM.cyanL;
  } else {
    mushroom(p, 10, 22, 4, 12, SHROOM.pink, SHROOM.pinkL);
    mushroom(p, 4, 22, 3, 6, SHROOM.violet, SHROOM.violetL);
    glow = SHROOM.pinkL;
  }
  p.outline('#140c18');
  const [cx, cy] = v === 0 ? [8, 9] : v === 1 ? [10, 9] : [9, 8];
  halo(p, cx, cy, 9, glow, f ? 0.3 : 0.18);
  for (const [x, y] of (f ? [[3, 4], [13, 2]] : [[2, 7], [12, 4]]) as [number, number][]) p.px(x, y, glow);
  return p;
}

/** Fairy lights floating in the air (16×24 at oy -8): 0 one little fairy with wings, 1 three motes of light, 2 a ring
 * of lights over a cushion of moss. They bob. */
function fairyLight(v: number, f: number): Px {
  const p = new Px(16, 24);
  const bob = f ? -1 : 1;
  if (v === 2) {
    lump(p, 2, 19, 12, 5, MOSS, 0.2, 271, 0.3);
    mushroom(p, 4, 22, 1, 2, SHROOM.pink, SHROOM.pinkL);
    p.outline('#140c18');
  }
  const fairy = (x: number, y: number, c: string) => {
    halo(p, x, y, 5, c, 0.3);
    p.px(x - 1, y - 1, f ? '#ffffff' : '#e8f4ff').px(x + 1, y - 1, f ? '#ffffff' : '#e8f4ff').px(x - 2, y - 2, '#d8e8ff').px(x + 2, y - 2, '#d8e8ff');
    p.px(x, y, '#ffffff').px(x, y + 1, c);
  };
  if (v === 0) fairy(8, 11 + bob, SHROOM.pinkL);
  else if (v === 1) {
    fairy(4, 10 + bob, '#fff3b0');
    fairy(11, 7 - bob, SHROOM.cyanL);
    fairy(9, 15 + bob, SHROOM.violetL);
  } else
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + f * 0.6;
      const x = Math.round(8 + Math.cos(a) * 5);
      const y = Math.round(13 + Math.sin(a) * 3);
      halo(p, x, y, 3, [SHROOM.pinkL, '#fff3b0', SHROOM.cyanL][i % 3]!, 0.35);
      p.px(x, y, '#ffffff');
    }
  return p;
}

/** A cobweb on the floor (flat 16×16): 0 a whole web, 1 with a little smiling spider, 2 torn and glittering with dew. */
function cobweb(v: number): Px {
  const p = new Px(16, 16);
  const W = '#d8dce4';
  const Wd = '#a8acb8';
  const cx = 8;
  const cy = 8;
  for (let i = 0; i < 8; i++) {
    if (v === 2 && (i === 2 || i === 3)) continue;
    const a = (i / 8) * Math.PI * 2 + 0.2;
    p.line(cx, cy, Math.round(cx + Math.cos(a) * 7.5), Math.round(cy + Math.sin(a) * 7.5), i % 2 ? Wd : W);
  }
  for (const r of [2.5, 4.5, 6.5]) {
    for (let i = 0; i < 8; i++) {
      if (v === 2 && (i === 2 || i === 3) && r > 3) continue;
      const a0 = (i / 8) * Math.PI * 2 + 0.2;
      const a1 = ((i + 1) / 8) * Math.PI * 2 + 0.2;
      p.line(Math.round(cx + Math.cos(a0) * r), Math.round(cy + Math.sin(a0) * r), Math.round(cx + Math.cos(a1) * r), Math.round(cy + Math.sin(a1) * r), Wd);
    }
  }
  if (v === 1) {
    p.rect(9, 9, 3, 3, '#2a2030').px(9, 9, '#4a3a50').px(10, 10, '#ffffff').px(11, 10, '#ffffff');
    for (const [x, y] of [[8, 8], [12, 8], [8, 12], [12, 12]] as const) p.px(x, y, '#2a2030');
  }
  if (v === 2) for (const [x, y] of [[4, 5], [12, 10], [7, 13], [10, 3]] as const) p.px(x, y, '#ffffff').px(x + 1, y, '#bfe9ff');
  return p;
}

/** An elf carved in pale stone (16×32 at oy -16), slender, long-haired, wound with ivy: 0 with a bow, 1 holding up a
 * lantern that still glows, 2 with a little bird on its raised hand. */
function elfStatue(v: number): Px {
  const p = new Px(16, 32);
  const S = pal('#5a5468', '#7c768c', '#a49eb4', '#cac4d8', '#ece8f4');
  p.rect(3, 27, 10, 5, S.b).rect(3, 27, 10, 1, S.l2).rect(3, 28, 1, 4, S.l).rect(12, 28, 1, 4, S.d).rect(3, 31, 10, 1, S.d2);
  // a long robe, narrow at the waist
  paint(p, 3, 12, 10, 15, (x, y) => {
    const half = y < 17 ? 2.5 : 2.5 + (y - 17) * 0.28;
    const u = (x + 0.5 - 8) / half;
    if (Math.abs(u) > 1) return null;
    return (x + 1) % 3 === 0 && y > 17 ? S.d : u < -0.4 ? S.l : u > 0.5 ? S.d : S.b;
  });
  // the head: long hair, pointed ears
  lump(p, 5, 4, 6, 7, S, 0.1, 281, 0.35);
  p.rect(5, 6, 1, 7, S.d).rect(10, 6, 1, 7, S.d).px(4, 7, S.l).px(3, 6, S.l).px(11, 7, S.b).px(12, 6, S.b);
  p.px(6, 7, S.d2).px(9, 7, S.d2);
  if (v === 0) p.line(12, 8, 13, 13, WOOD.b).line(13, 13, 12, 20, WOOD.b).line(12, 8, 12, 20, '#e8e4f0').px(11, 14, S.l);
  if (v === 1) p.line(10, 13, 12, 8, S.b).rect(11, 4, 3, 4, '#d8a0ff').px(11, 4, '#ffffff').rect(11, 3, 3, 1, S.d).rect(11, 8, 3, 1, S.d);
  if (v === 2) p.line(5, 13, 3, 8, S.b).tpl(1, 5, ['.##.', '####', '.#..'], { '#': '#6a8ae8' }).px(2, 5, '#ffffff').px(4, 6, '#f0c040');
  // ivy winding up it
  for (const [x, y] of [[4, 26], [5, 24], [11, 25], [10, 22], [6, 20], [9, 18]] as const) p.px(x, y, ALV_LEAF.l).px(x + 1, y, MOSS.b);
  p.outline(OUTLINE);
  if (v === 1) halo(p, 12, 6, 6, GLOW[6]!.light, 0.32);
  return p;
}

// ---------------------------------------------------------------------------
// Fenrisklyftan's things: chains on the floor, fangs of ice, wolf statues, gnawed bones
// ---------------------------------------------------------------------------

/** Heavy chains on the floor (flat): 0 lying across, 1 coiled up, 2 broken off with an open shackle. */
function chainHeap(v: number): Px {
  const p = new Px(16, 16);
  if (v === 0) chain(p, 1, 3, 14, 12, 3);
  else if (v === 1) {
    for (let i = 0; i < 14; i++) {
      const a = i * 0.9;
      const r = 1.5 + i * 0.4;
      const x = Math.round(8 + Math.cos(a) * r);
      const y = Math.round(8 + Math.sin(a) * r * 0.8);
      if (i % 2) p.px(x, y, IRON.b).px(x, y - 1, IRON.l);
      else p.px(x - 1, y, IRON.l).px(x + 1, y, IRON.d).px(x, y - 1, IRON.l2).px(x, y + 1, IRON.d);
    }
  } else {
    chain(p, 1, 13, 9, 7, 1);
    paint(p, 8, 1, 7, 7, (x, y) => {
      const r = Math.hypot(x + 0.5 - 11.5, y + 0.5 - 4.5);
      return r > 1.6 && r < 3.2 && !(x > 12 && y > 4) ? (x < 11 ? IRON.l : IRON.d) : null;
    });
    p.px(13, 6, IRON.l2).px(14, 4, IRON.b);
  }
  return p.outline(OUTLINE);
}

/** Fangs of ice (16×24 at oy -8) rising from the floor: 0 one great curved fang, 1 two, 2 one on a rock with frost. */
function iceFang(v: number): Px {
  const p = new Px(16, 24);
  const F = pal('#5a7ea0', '#8ab0d0', '#c8e2f4', '#eef8ff', '#ffffff');
  const fang = (bx: number, by: number, w: number, h: number, bend: number) =>
    paint(p, bx - w - 4, by - h, w * 2 + 8, h + 1, (x, y) => {
      const t = (by - y) / h;
      if (t < 0 || t > 1) return null;
      const cx = bx + bend * t * t;
      const half = (w / 2) * (1 - t) + 0.3;
      const u = (x + 0.5 - cx) / half;
      if (Math.abs(u) > 1) return null;
      return u < -0.4 ? F.l2 : u < 0.3 ? F.l : u < 0.7 ? F.b : F.d;
    });
  if (v === 2) lump(p, 1, 15, 14, 9, ROCK, 0.3, 291, 0.3);
  if (v === 0) fang(7, 23, 8, 21, 4);
  else if (v === 1) {
    fang(5, 23, 6, 17, -3);
    fang(11, 23, 6, 20, 2);
  } else {
    fang(8, 17, 6, 15, 3);
    p.rect(2, 15, 3, 1, FROSTW).rect(11, 16, 3, 1, FROSTW);
  }
  p.outline('#1e3a5a');
  twinkle(p, v === 1 ? 4 : 6, v === 2 ? 9 : 10, '#ffffff');
  return p;
}

/** A wolf carved in grey stone (16×32 at oy -16), frost on its back: 0 sitting, 1 sitting and howling at the sky,
 * 2 lying down with its head on its paws. */
function wolfStatue(v: number): Px {
  const p = new Px(16, 32);
  const S = pal('#3a3e48', '#565c68', '#78808c', '#9ca4b0', '#c4ccd6');
  p.rect(1, 26, 14, 6, S.b).rect(1, 26, 14, 1, S.l2).rect(1, 27, 1, 5, S.l).rect(14, 27, 1, 5, S.d).rect(1, 31, 14, 1, S.d2);
  rune(p, 6, 27, 4, S.d2);
  if (v === 2) {
    // lying: a long body, its head resting on its paws, the tail round its side
    lump(p, 2, 18, 12, 8, S, 0.15, 301, 0.3);
    lump(p, 1, 17, 6, 6, S, 0.15, 302, 0.3);
    p.tpl(1, 14, ['#..#', '##.##'], { '#': S.b }).px(1, 14, S.l2);
    p.px(2, 19, '#14121a').rect(0, 21, 2, 1, S.d).rect(1, 23, 5, 2, S.l);
    p.line(13, 24, 15, 20, S.b);
    p.rect(4, 18, 8, 1, FROSTW);
  } else {
    // sitting: haunches, chest, front legs straight; the head up (howling) or looking ahead
    lump(p, 5, 15, 9, 11, S, 0.15, 303, 0.3);
    p.rect(4, 17, 4, 9, S.b).rect(4, 17, 1, 9, S.l).rect(7, 18, 1, 8, S.d);
    p.line(13, 25, 15, 18, S.b).px(15, 17, S.l);
    if (v === 0) {
      lump(p, 2, 8, 8, 8, S, 0.15, 304, 0.35);
      p.rect(0, 12, 4, 3, S.b).px(0, 12, '#14121a').rect(1, 14, 3, 1, S.d);
      p.tpl(3, 5, ['#...#', '##.##'], { '#': S.b }).px(3, 5, S.l2).px(7, 5, S.l);
      p.px(4, 11, '#14121a');
    } else {
      lump(p, 4, 7, 8, 8, S, 0.15, 305, 0.35);
      // the muzzle pointing up at the sky, mouth open in a howl; a short ear laid back
      p.tpl(1, 3, ['##...', '###..', '.###.', '.####', '..###'], { '#': S.b }).line(1, 3, 3, 5, S.l).px(1, 3, '#14121a').px(3, 6, '#14121a').px(4, 7, '#14121a');
      p.tpl(9, 5, ['.#', '##'], { '#': S.b }).px(10, 5, S.l2).px(7, 9, '#14121a');
    }
    p.rect(5, 15, 8, 1, FROSTW).rect(7, 7, 3, 1, FROSTW);
  }
  p.outline(OUTLINE);
  if (v === 1) {
    p.px(0, 1, '#bcd8ff').px(1, 0, '#e8f4ff');
  }
  return p;
}

/** Gnawed bones on the floor (flat): 0 two big ones crossed, 1 a heap, 2 a bone and tufts of grey fur. */
function bonePile(v: number): Px {
  const p = new Px(16, 16);
  const big = (x0: number, y0: number, x1: number, y1: number) => {
    p.line(x0, y0, x1, y1, BONE.b).line(x0 + 1, y0, x1 + 1, y1, BONE.l).line(x0, y0 + 1, x1, y1 + 1, BONE.d);
    for (const [x, y] of [[x0, y0], [x1, y1]] as const) p.rect(x - 1, y - 1, 3, 3, BONE.l).px(x - 1, y + 1, BONE.d).px(x + 1, y + 1, BONE.b).px(x - 1, y - 1, BONE.l2);
  };
  if (v === 0) {
    big(2, 3, 13, 12);
    big(13, 3, 3, 12);
  } else if (v === 1) {
    big(2, 12, 12, 9);
    big(4, 4, 13, 7);
    big(6, 13, 9, 3);
  } else {
    big(3, 11, 13, 5);
    for (const [x, y] of [[3, 3], [10, 12], [12, 1]] as const) p.tpl(x, y, ['.#.#', '####', '.##.'], { '#': '#8a8e98' }).px(x + 1, y + 1, '#c4c8d0');
  }
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// Bifrost's things: rainbow shards, Loke's mirrors, star lamps, rune pillars
// ---------------------------------------------------------------------------

/** Rainbow crystals (16×24 at oy -8), their colours turning: 0 a cluster, 1 one tall, 2 a flower of five. */
function rainbowShard(v: number, f: number): Px {
  const p = new Px(16, 24);
  lump(p, 2, 18, 12, 5, OBSIDIAN, 0.2, 311, 0.4);
  const hue = (k: number) => ramp(hsl((k * 60 + f * 150) % 360, 0.8, 0.64));
  if (v === 0) {
    shard(p, 5, 21, 4, 11, -2, hue(0));
    shard(p, 11, 21, 4, 9, 2, hue(2));
    shard(p, 8, 21, 5, 17, 0, hue(4));
  } else if (v === 1) {
    shard(p, 8, 21, 6, 21, 1, hue(1));
    shard(p, 4, 21, 3, 6, -2, hue(3));
  } else {
    [[3, 8, -3], [13, 8, 3], [6, 13, -1], [10, 13, 1], [8, 16, 0]].forEach(([x, h, lean], i) => shard(p, x!, 21, 3, h!, lean!, hue(i)));
  }
  p.outline(OUTLINE);
  glowOn(p, 8, 12, 9, '#ffffff', 0.12);
  halo(p, 8, 12, 10, hsl((f * 150 + 200) % 360, 0.9, 0.85), 0.2);
  twinkle(p, f ? 5 : 11, f ? 6 : 9, '#ffffff');
  return p;
}

/** One of Loke's mirrors (16×32 at oy -16), in a frame of black glass on little legs: 0 shining, 1 with Loke's green
 * grin floating in it, 2 cracked, rainbow glints in the cracks. */
function mirror(v: number): Px {
  const p = new Px(16, 32);
  p.rect(3, 27, 2, 5, OBSIDIAN.b).rect(11, 27, 2, 5, OBSIDIAN.b).rect(2, 31, 4, 1, OBSIDIAN.l).rect(10, 31, 4, 1, OBSIDIAN.l);
  paint(p, 1, 1, 14, 27, (x, y) => {
    const dx = (x + 0.5 - 8) / 7;
    const dy = (y + 0.5 - 14.5) / 13.5;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (r > 0.7) return r > 0.92 ? OBSIDIAN.l : dx < 0 ? OBSIDIAN.l2 : OBSIDIAN.b;
    // the glass: silver-blue, a band of light across it
    const k = x - y * 0.5;
    if (k > -6 && k < -3) return '#f4f8ff';
    return dy < -0.2 ? '#c4cce8' : dy < 0.3 ? '#a8b0d8' : '#8c94c4';
  });
  p.px(8, 0, '#a07aff').px(7, 1, OBSIDIAN.l2).px(9, 1, OBSIDIAN.l2);
  if (v === 1) {
    p.rect(5, 12, 2, 2, '#3ac85a').rect(10, 12, 2, 2, '#3ac85a').px(5, 12, '#c8ffb8').px(10, 12, '#c8ffb8');
    p.tpl(4, 17, ['#......#', '.#....#.', '..####..'], { '#': '#3ac85a' });
  }
  if (v === 2) {
    p.line(9, 6, 6, 13, '#4a4a6a').line(6, 13, 10, 18, '#4a4a6a').line(6, 13, 3, 16, '#4a4a6a');
    p.px(8, 8, RAINBOW[0]!).px(7, 11, RAINBOW[2]!).px(8, 16, RAINBOW[4]!).px(4, 15, RAINBOW[5]!);
  }
  p.outline(OUTLINE);
  twinkle(p, 5, 6, '#ffffff');
  return p;
}

/** A star lamp floating in the air (16×24 at oy -8): 0 one star, 1 a crescent moon and a star, 2 three little stars.
 * They bob and sparkle. */
function starLamp(v: number, f: number): Px {
  const p = new Px(16, 24);
  const bob = f ? -1 : 1;
  const star = (cx: number, cy: number, r: number, c: Pal) => {
    paint(p, cx - r - 1, cy - r - 1, r * 2 + 3, r * 2 + 3, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      // five points: how far out the edge lies depends on how near a point the angle is
      const t = (((Math.atan2(dy, dx) + Math.PI / 2) / ((2 * Math.PI) / 5)) % 1 + 1) % 1;
      const lim = r * (0.45 + 0.55 * Math.abs(t - 0.5) * 2);
      const d = Math.hypot(dx, dy);
      if (d > lim) return null;
      return dx + dy < -1 ? c.l2 : dx + dy < 1 ? c.l : c.b;
    });
  };
  const S = pal('#b88a10', '#e0b020', '#ffd84a', '#fff09a', '#fffbe0');
  if (v === 0) star(8, 12 + bob, 6, S);
  else if (v === 1) {
    paint(p, 1, 5 + bob, 9, 12, (x, y) => {
      const a = Math.hypot(x + 0.5 - 6, y + 0.5 - (11 + bob));
      const b = Math.hypot(x + 0.5 - 8.5, y + 0.5 - (10 + bob));
      return a < 5.5 && b > 4.6 ? (x < 4 ? '#fff6c8' : '#ffe27a') : null;
    });
    star(12, 8 - bob, 3, S);
  } else {
    star(4, 8 + bob, 4, S);
    star(12, 11 - bob, 4, ramp('#ffb0e0'));
    star(6, 17 + bob, 4, ramp('#a8e0ff'));
  }
  p.outline('#4a3a10');
  halo(p, 8, 12, 9, '#fff3b0', f ? 0.26 : 0.18);
  twinkle(p, f ? 2 : 14, f ? 4 : 18, '#ffffff');
  return p;
}

/** A pillar of black glass (16×32 at oy -16) with runes glowing up it in the rainbow's colours: 0 whole, 1 broken off,
 * 2 with a rainbow crystal growing out of its top. */
function runePillar(v: number): Px {
  const p = new Px(16, 32);
  const top = v === 1 ? 11 : v === 2 ? 9 : 3;
  p.rect(2, 27, 12, 5, OBSIDIAN.b).rect(2, 27, 12, 1, OBSIDIAN.l2).rect(2, 31, 12, 1, OBSIDIAN.d2);
  paint(p, 4, top, 8, 27 - top, (x, y) => {
    const k = x - 4;
    if ((x * 2 + y) % 13 === 0 && k > 0 && k < 6) return OBSIDIAN.l;
    return k === 0 ? OBSIDIAN.l2 : k === 1 ? OBSIDIAN.l : k === 7 ? OBSIDIAN.d2 : k > 4 ? OBSIDIAN.d : OBSIDIAN.b;
  });
  if (v !== 1) p.rect(3, top, 10, 2, OBSIDIAN.l).rect(3, top, 10, 1, OBSIDIAN.l2);
  else p.px(5, top, OBSIDIAN.l2).px(7, top - 1, OBSIDIAN.l).px(9, top, OBSIDIAN.b).px(10, top + 1, OBSIDIAN.l);
  for (let i = 0; i * 5 + top + 4 < 26; i++) rune(p, 6, top + 4 + i * 5, i + 1, RAINBOW[(i * 2 + 1) % 6]!);
  if (v === 2) {
    shard(p, 6, top, 3, 7, -1, ramp(RAINBOW[5]!));
    shard(p, 9, top, 4, 9, 1, ramp(RAINBOW[4]!));
  }
  p.outline(OUTLINE);
  glowOn(p, 8, 16, 8, '#f0d8ff', 0.1);
  halo(p, 8, 16, 9, '#e8d0ff', 0.12);
  return p;
}

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
// The second act's keepsakes for home (16×24 at oy -8, glowing in two frames) and their icons: Hel's lantern, the
// dwarves' little gold statue, the sea serpent's tooth, the elves' lantern, a link of Fenris's chain and a piece of
// Bifrost. Each is drawn once in a 16×16 box: the icon as it is, the keepsake stood on a little plinth.
// ---------------------------------------------------------------------------

interface Keepsake {
  /** The thing in a 16×16 box, its foot on the bottom row (before the outline). */
  body: (p: Px, f: number) => void;
  /** Its light (flames, glows, glints) after the outline, the box's top-left at (ox, oy). */
  shine: (p: Px, ox: number, oy: number, f: number) => void;
  plinth: Pal;
}

/** A lantern (the elves' and Hel's): a cap, glass between bars, a foot; the glass in `glass`, the frame in `c`. */
function lantern(p: Px, c: Pal, glass: string, glassL: string): Px {
  p.rect(7, 0, 2, 1, c.b).px(6, 1, c.b).px(9, 1, c.b);
  p.rect(4, 2, 8, 2, c.b).rect(5, 2, 6, 1, c.l2).px(4, 3, c.l).px(11, 3, c.d);
  paint(p, 4, 4, 8, 8, (x, y) => (x === 4 ? c.l : x === 11 ? c.d : x === 8 && y > 4 ? c.b : y < 6 && x < 7 ? glassL : glass));
  p.rect(3, 12, 10, 2, c.b).rect(3, 12, 10, 1, c.l).rect(5, 14, 6, 2, c.d).rect(5, 14, 6, 1, c.b);
  return p;
}

const KEEPSAKES: Record<string, Keepsake> = {
  hels_lykta: {
    // Hel's lantern: a frame of bone round teal glass, a ghost-light with two shy eyes inside, a little skull at its foot
    body: (p) => {
      lantern(p, BONE, '#123a36', '#1e5a52');
      p.rect(7, 14, 2, 1, '#14201e').px(6, 14, BONE.l).px(9, 14, BONE.l);
    },
    shine: (p, ox, oy, f) => {
      flame(p, ox + 7, oy + 11, 4, f ? 7 : 6, f ? 0.8 : -0.8, GLOW[3]!.outer, GLOW[3]!.mid, GLOW[3]!.core);
      p.px(ox + 6, oy + 9, '#145a3a').px(ox + 8, oy + 9, '#145a3a');
      halo(p, ox + 8, oy + 8, 8, GLOW[3]!.light, f ? 0.3 : 0.22);
    },
    plinth: HEL,
  },
  dvargstaty: {
    // a little dwarf of gold: a helmet, a braided beard, an axe on his shoulder
    body: (p) => {
      p.rect(3, 9, 10, 6, GOLD.b).rect(3, 9, 2, 6, GOLD.l).rect(11, 9, 2, 6, GOLD.d).rect(4, 15, 3, 1, GOLD.d).rect(9, 15, 3, 1, GOLD.d);
      lump(p, 4, 0, 8, 6, GOLD, 0.1, 321, 0.3);
      p.rect(3, 5, 10, 1, GOLD.l2).rect(5, 6, 6, 3, GOLD.l).rect(5, 6, 2, 1, GOLD.l2).rect(9, 6, 2, 1, GOLD.l2).px(6, 7, '#3a2a10').px(9, 7, '#3a2a10').px(8, 8, GOLD.d);
      paint(p, 4, 8, 8, 7, (x, y) => {
        const half = 4 - (y - 8) * 0.45;
        const u = (x + 0.5 - 8) / half;
        if (Math.abs(u) > 1) return null;
        if ((x === 6 || x === 9) && y > 8) return GOLD.b;
        return u < -0.3 ? GOLD.l2 : GOLD.l;
      });
      p.line(12, 14, 13, 4, WOOD.b).tpl(11, 2, ['.###', '####', '.##.'], { '#': STEEL_PAL.b }).px(12, 2, STEEL_PAL.l2);
    },
    shine: (p, ox, oy, f) => {
      halo(p, ox + 8, oy + 8, 8, '#ffe27a', 0.2);
      twinkle(p, ox + (f ? 4 : 11), oy + (f ? 3 : 10));
    },
    plinth: DWARF,
  },
  ormtand: {
    // the sea serpent's tooth: a great curved fang, ivory going to sea-green at the tip, in a mount of silver
    body: (p) => {
      paint(p, 2, 0, 13, 14, (x, y) => {
        const t = (13 - y) / 13;
        const cx = 6 + 5 * t * t;
        const half = 3.2 * (1 - t) + 0.4;
        const u = (x + 0.5 - cx) / half;
        if (Math.abs(u) > 1 || t < 0) return null;
        const c = t > 0.7 ? VERDIGRIS : pal('#a8987a', '#cfc0a0', '#ece2c8', '#f8f2e2', '#ffffff');
        return u < -0.3 ? c.l2 : u < 0.4 ? c.l : c.b;
      });
      p.rect(2, 12, 9, 4, STEEL_PAL.b).rect(2, 12, 9, 1, STEEL_PAL.l2).rect(2, 15, 9, 1, STEEL_PAL.d).px(6, 13, '#3ac8d8');
    },
    shine: (p, ox, oy, f) => {
      halo(p, ox + 9, oy + 4, 7, GLOW[5]!.light, f ? 0.32 : 0.22);
      twinkle(p, ox + 11, oy + (f ? 1 : 3), '#e8ffff');
    },
    plinth: SEA,
  },
  alvlykta: {
    // the elves' lantern: silver round violet glass, a fairy light inside, leaves curling up its sides
    body: (p) => {
      lantern(p, STEEL_PAL, '#6a3aa8', '#a070e0');
      p.px(3, 6, ALV_LEAF.l).px(2, 5, ALV_LEAF.b).px(12, 9, ALV_LEAF.l).px(13, 8, ALV_LEAF.b);
    },
    shine: (p, ox, oy, f) => {
      p.px(ox + 7, oy + 8, '#ffffff').px(ox + 6, oy + 7, f ? '#ffffff' : '#e8d8ff').px(ox + 8, oy + 7, f ? '#ffffff' : '#e8d8ff');
      halo(p, ox + 8, oy + 8, 8, GLOW[6]!.light, f ? 0.32 : 0.24);
      twinkle(p, ox + (f ? 2 : 13), oy + (f ? 3 : 1), SHROOM.pinkL);
    },
    plinth: BARK,
  },
  fenrislanka: {
    // a link of the chain that held Fenris, big as a hand, frost on it and a broken half-link below
    body: (p) => {
      paint(p, 2, 0, 12, 14, (x, y) => {
        const dx = (x + 0.5 - 8) / 5.6;
        const dy = (y + 0.5 - 6.5) / 6.6;
        const r = dx * dx + dy * dy;
        const ix = (x + 0.5 - 8) / 2.6;
        const iy = (y + 0.5 - 6.5) / 3.8;
        if (r > 1 || ix * ix + iy * iy < 1) return null;
        return tone(STEEL_PAL, light(dx, dy, 0.6) + 0.1 * grain(x, y, 331));
      });
      p.rect(5, 0, 3, 1, FROSTW).px(3, 3, FROSTW);
      p.rect(4, 14, 8, 2, IRON.b).rect(4, 14, 8, 1, IRON.l).clear(7, 14, 2, 2);
    },
    shine: (p, ox, oy, f) => {
      halo(p, ox + 8, oy + 7, 8, GLOW[7]!.light, f ? 0.3 : 0.2);
      twinkle(p, ox + (f ? 4 : 12), oy + (f ? 4 : 9), '#ffffff');
    },
    plinth: ROCK,
  },
  bifrostbit: {
    // a piece of the rainbow bridge: crystal in every colour
    body: (p) => {
      shard(p, 4, 15, 4, 9, -2, ramp(RAINBOW[0]!));
      shard(p, 12, 15, 4, 10, 2, ramp(RAINBOW[4]!));
      shard(p, 8, 15, 5, 15, 0, ramp(RAINBOW[2]!));
      shard(p, 6, 15, 3, 6, -1, ramp(RAINBOW[3]!));
      shard(p, 10, 15, 3, 6, 1, ramp(RAINBOW[5]!));
    },
    shine: (p, ox, oy, f) => {
      halo(p, ox + 8, oy + 8, 9, f ? '#ffd0f4' : '#c8ecff', 0.26);
      twinkle(p, ox + (f ? 9 : 5), oy + (f ? 2 : 6), '#ffffff');
    },
    plinth: OBSIDIAN,
  },
};

function keepsakeObject(id: string, f: number): Px {
  const k = KEEPSAKES[id]!;
  const p = new Px(16, 24);
  const c = k.plinth;
  p.rect(2, 18, 12, 5, c.b).rect(2, 18, 12, 1, c.l2).rect(2, 19, 1, 4, c.l).rect(13, 19, 1, 4, c.d).rect(2, 22, 12, 1, c.d2);
  const t = new Px(16, 16);
  k.body(t, f);
  p.blit(t, 0, 2);
  p.outline(OUTLINE);
  k.shine(p, 0, 2, f);
  return p;
}

function keepsakeIcon(id: string): Px {
  const k = KEEPSAKES[id]!;
  const p = new Px(16, 16);
  k.body(p, 0);
  p.outline(OUTLINE);
  k.shine(p, 0, 0, 0);
  return p;
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

/** A round flask with a cork: the healing drink red with a little heart, the strength drink orange with a bolt. */
function potionIcon(strength = false): Px {
  const p = new Px(16, 16);
  const drink = strength ? pal('#7a2a08', '#c8501a', '#ff8a2a', '#ffc070', '#ffe8c8') : pal('#7a1020', '#b8202e', '#e8404a', '#ff8a8a', '#ffd0d0');
  paint(p, 2, 4, 12, 12, (x, y) => {
    const dx = (x + 0.5 - 8) / 5.6;
    const dy = (y + 0.5 - 10) / 5.4;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (y < 8) return r > 0.75 ? '#c8e8f0' : '#e8f8ff';
    return tone(drink, light(dx, dy, Math.sqrt(1 - r) + 0.3));
  });
  p.rect(6, 1, 4, 4, '#e8f8ff').rect(6, 1, 4, 1, '#ffffff').rect(6, 0, 4, 2, '#b07c48').px(6, 0, '#d4a46c');
  if (strength) p.tpl(6, 8, ['..##', '.##.', '####', '.##.', '##..'], { '#': '#fff6c8' });
  else p.tpl(6, 9, ['##.##', '#####', '.###.', '..#..'], { '#': '#ffffff' });
  p.outline(OUTLINE);
  if (strength) halo(p, 8, 10, 8, '#ffb04a', 0.2);
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

/** The second act's weapons, each glowing in its own colour. */
function weaponIcon2(id: string): Px {
  const p = new Px(16, 16);
  const hilt = (x: number, y: number, guard: string, grip = WOOD.d) => {
    p.rect(x - 2, y - 2, 2, 2, grip).rect(x - 3, y, 3, 2, grip).px(x - 3, y + 1, guard);
    p.line(x - 1, y - 3, x + 2, y, guard).px(x - 1, y - 2, guard);
  };
  /** A handle running from (2, 14) up to (x, y). */
  const shaft = (x: number, y: number, c: Pal = WOOD) => p.line(2, 14, x, y, c.b).line(3, 14, x + 1, y, c.d).px(3, 12, c.l);
  switch (id) {
    case 'helsvard': {
      // Hel's sword: a pale blade going teal at the edge, a guard of bone, a green ghost-light in the steel
      blade(p, 4, 11, 13, 2, pal('#2a5a5a', '#5a8a86', '#b8d4c8', '#e4f4ea', '#ffffff'));
      hilt(4, 12, BONE.l, HEL.d);
      p.outline(OUTLINE);
      aura(p, 9, 7, 9, GLOW[3]!.light);
      p.px(8, 7, GLOW[3]!.mid).px(10, 5, GLOW[3]!.core);
      break;
    }
    case 'garmklo': {
      // Garm's claw: a short haft with three great dark claws for a head, their tips pale
      shaft(10, 6);
      for (const [x0, y0, x1, y1] of [[9, 6, 6, 1], [10, 5, 10, 0], [11, 6, 14, 2]] as const) {
        p.line(x0, y0, x1, y1, HEL.b).line(x0 + 1, y0, x1 + 1, y1, HEL.d).px(x1, y1, BONE.l2).px(x1 + 1, y1, BONE.l);
      }
      p.rect(8, 6, 5, 2, HEL.l).px(8, 6, HEL.l2);
      p.outline(OUTLINE);
      aura(p, 10, 4, 7, GLOW[3]!.light);
      break;
    }
    case 'gruvhacka': {
      // the dwarves' pick: a long iron head curving down at both ends, a gold band, a stout handle
      shaft(9, 5);
      p.line(3, 4, 6, 2, IRON.b).line(6, 2, 12, 2, IRON.b).line(12, 2, 15, 5, IRON.b).line(4, 5, 7, 3, IRON.d).line(12, 3, 14, 5, IRON.d);
      p.line(6, 1, 12, 1, IRON.l2).px(3, 4, IRON.l).px(15, 5, IRON.l);
      p.rect(8, 2, 3, 3, GOLD.b).px(8, 2, GOLD.l2);
      p.outline(OUTLINE);
      aura(p, 9, 4, 7, GLOW[4]!.light);
      break;
    }
    case 'fafnerstand': {
      // Fafner's tooth: a long golden-ivory fang for a blade, a gold hilt with a red gem
      paint(p, 4, 0, 12, 13, (x, y) => {
        const t = (x - 4) / 11;
        const cy = 11 - t * 10;
        const half = 1.9 * (1 - t) + 0.4;
        const u = (y + 0.5 - cy) / half;
        if (Math.abs(u) > 1 || t < 0) return null;
        return u < -0.3 ? '#fff6d8' : u < 0.4 ? '#f0dcaa' : '#c8a868';
      });
      hilt(4, 12, GOLD.b, '#6a2a1a');
      p.px(2, 13, '#e83a3a');
      p.outline(OUTLINE);
      aura(p, 9, 6, 9, '#ffd23f');
      twinkle(p, 13, 2);
      break;
    }
    case 'korallspjut': {
      // a trident standing upright: a sea-green shaft, a crossbar, three barbed prongs, coral bound round it
      p.rect(7, 6, 2, 10, VERDIGRIS.b).rect(7, 6, 1, 10, VERDIGRIS.l);
      p.rect(3, 5, 10, 2, VERDIGRIS.b).rect(3, 5, 10, 1, VERDIGRIS.l);
      for (const x of [3, 7, 11]) p.rect(x, x === 7 ? 0 : 1, 2, x === 7 ? 5 : 4, VERDIGRIS.l).px(x + 1, x === 7 ? 1 : 2, VERDIGRIS.d).px(x, x === 7 ? 0 : 1, '#ffffff');
      p.px(2, 2, VERDIGRIS.l).px(13, 2, VERDIGRIS.l);
      p.rect(6, 11, 4, 2, CORAL.b).px(6, 11, CORAL.l2).px(9, 12, CORAL.d);
      p.outline(OUTLINE);
      aura(p, 8, 4, 7, GLOW[5]!.light);
      break;
    }
    case 'stormbage': {
      // the storm bow: dark blue-grey limbs, a string that crackles with lightning
      p.line(4, 1, 10, 5, '#4a5a7a').line(10, 5, 11, 8, '#4a5a7a').line(11, 8, 10, 11, '#4a5a7a').line(10, 11, 4, 15, '#4a5a7a');
      p.line(5, 1, 10, 4, '#7a8aaa').px(11, 9, '#7a8aaa');
      for (let y = 2; y < 15; y++) p.px(4 + (y % 4 === 1 ? 1 : 0), y, '#bfe9ff');
      p.rect(9, 7, 2, 3, '#2a3450');
      p.outline(OUTLINE);
      aura(p, 7, 8, 8, '#9ad8ff');
      p.px(1, 5, '#ffffff').px(2, 6, '#9ad8ff').px(13, 2, '#ffffff').px(14, 12, '#9ad8ff');
      break;
    }
    case 'alvklinga': {
      // the elves' blade: slender and curved, silver with a violet sheen, a guard shaped like two leaves
      paint(p, 3, 0, 13, 13, (x, y) => {
        const t = (x - 4) / 11;
        const cy = 11 - t * 10 + Math.sin(t * Math.PI) * 1.5;
        const u = y + 0.5 - cy;
        if (t < 0 || t > 1 || Math.abs(u) > 1 - t * 0.4) return null;
        return u < 0 ? '#f4eaff' : '#b8a0d8';
      });
      hilt(4, 12, ALV_LEAF.l, BARK.b);
      p.px(5, 8, ALV_LEAF.l2).px(1, 12, ALV_LEAF.l);
      p.outline(OUTLINE);
      aura(p, 9, 6, 9, GLOW[6]!.light);
      twinkle(p, 14, 1, '#f0e0ff');
      break;
    }
    case 'manstav': {
      // the moon staff: pale wood, a silver crescent moon at the top holding a little star
      shaft(9, 5, pal('#5a4a5a', '#8a7a8a', '#c4b8c4', '#e4dce4', '#ffffff'));
      paint(p, 7, 0, 9, 8, (x, y) => {
        const a = Math.hypot(x + 0.5 - 11, y + 0.5 - 4);
        const b = Math.hypot(x + 0.5 - 13, y + 0.5 - 2.5);
        return a < 4.2 && b > 3.4 ? (x < 10 ? '#ffffff' : '#d8e0f4') : null;
      });
      p.outline(OUTLINE);
      aura(p, 11, 4, 6, '#e8e0ff');
      p.px(13, 4, '#fff3b0');
      break;
    }
    case 'fenristand': {
      // Fenris's tooth: a blade like a great white fang, a hilt wrapped in a bit of chain
      paint(p, 4, 0, 12, 13, (x, y) => {
        const t = (x - 4) / 11;
        const cy = 11 - t * 10 - Math.sin(t * Math.PI) * 0.8;
        const half = 2.2 * (1 - t) + 0.3;
        const u = (y + 0.5 - cy) / half;
        if (Math.abs(u) > 1 || t < 0) return null;
        return u < -0.3 ? '#ffffff' : u < 0.4 ? '#e4eef8' : '#a8bcd0';
      });
      hilt(4, 12, STEEL_PAL.b, '#3a3e48');
      p.px(2, 12, STEEL_PAL.l2).px(1, 14, STEEL_PAL.l2);
      p.outline('#1e3a5a');
      aura(p, 9, 6, 9, GLOW[7]!.light);
      twinkle(p, 13, 2, '#ffffff');
      break;
    }
    case 'tyrsyxa': {
      // Tyr's axe: a broad double-bitted head of steel edged with gold, a rune for Tyr (an arrow) on it
      shaft(8, 6);
      p.tpl(3, 0, ['##.......##', '###.....###', '####...####', '###########', '####...####', '###.....###', '##.......##'], { '#': STEEL_PAL.b });
      p.line(3, 0, 3, 6, GOLD.l).line(13, 0, 13, 6, GOLD.b).px(4, 1, STEEL_PAL.l2).px(12, 5, STEEL_PAL.d);
      p.rect(7, 1, 3, 5, IRON.b).tpl(7, 1, ['.#.', '###', '.#.', '.#.'], { '#': '#ff8a5a' });
      p.outline(OUTLINE);
      aura(p, 8, 3, 8, '#ffd0a0');
      break;
    }
    case 'lokesstav': {
      // Loke's staff: twisted green and gold, a serpent's head at the top with a green flame in its mouth
      for (let i = 0; i < 11; i++) p.px(2 + i * 0.8, 15 - i, i % 2 ? GOLD.b : '#2e9a5a').px(3 + i * 0.8, 15 - i, i % 2 ? '#1e6a3a' : GOLD.d);
      p.rect(10, 3, 4, 3, '#2e9a5a').rect(10, 3, 4, 1, '#5fd38d').px(13, 4, '#ffe27a').px(14, 5, '#e83a3a');
      p.outline(OUTLINE);
      flame(p, 12, 3, 3, 4, 1, '#2ab05a', '#8affa0', '#eaffe8');
      aura(p, 11, 3, 6, '#7aff9a');
      break;
    }
    case 'bifrostbage': {
      // the rainbow bow: its limbs in all the bridge's colours, a string of light
      const pts: [number, number][] = [[4, 1], [6, 2], [8, 3], [9, 4], [10, 5], [10, 6], [11, 7], [11, 8], [11, 9], [10, 10], [10, 11], [9, 12], [8, 13], [6, 14], [4, 15]];
      pts.forEach(([x, y], i) => p.px(x, y, RAINBOW[Math.floor(i / 2.5)]!).px(x - 1, y, shade(RAINBOW[Math.floor(i / 2.5)]!, 1.4)));
      p.line(4, 1, 4, 15, '#ffffff').rect(10, 7, 2, 3, OBSIDIAN.l);
      p.outline(OUTLINE);
      aura(p, 7, 8, 8, '#ffe8f8');
      twinkle(p, 13, 3, '#ffffff');
      break;
    }
    case 'heimdallshorn': {
      // Gjallarhorn: Heimdall's great curved horn, banded with gold, the rainbow shining round it
      paint(p, 1, 2, 15, 13, (x, y) => {
        const t = (x - 1) / 14;
        const cy = 12 - Math.sin(t * Math.PI * 0.85) * 7 + t * 2;
        const half = 0.8 + t * 2.6;
        const u = (y + 0.5 - cy) / half;
        if (Math.abs(u) > 1) return null;
        if (Math.round(x) % 4 === 1) return GOLD.b;
        return u < -0.3 ? '#fff6e0' : u < 0.4 ? '#e8d4a8' : '#b89a68';
      });
      p.rect(13, 7, 2, 5, '#3a2a1a').px(14, 9, GOLD.l2);
      p.outline(OUTLINE);
      for (let i = 0; i < 6; i++) halo(p, 8, 9, 9 - i * 1.2, RAINBOW[5 - i]!, 0.22);
      twinkle(p, 14, 3, '#ffffff');
      break;
    }
  }
  return p;
}

/** The things held in the other hand: shields, a book, a quiver, a lantern, a gauntlet, a grinning mask. */
function offhandIcon(id: string): Px {
  const p = new Px(16, 16);
  const roundShield = (rim: Pal, field: Pal, boss: string) =>
    paint(p, 1, 1, 14, 14, (x, y) => {
      const dx = (x + 0.5 - 8) / 6.6;
      const dy = (y + 0.5 - 8) / 6.6;
      const r = Math.hypot(dx, dy);
      if (r > 1) return null;
      if (r > 0.82) return tone(rim, light(dx, dy, 0.5));
      if (r < 0.22) return boss;
      return tone(field, light(dx, dy, Math.sqrt(Math.max(0, 1 - r * r)) + 0.1));
    });
  switch (id) {
    case 'offhand_helskold': {
      roundShield(BONE, HEL, BONE.l);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.px(Math.round(8 + Math.cos(a) * 5.8 - 0.5), Math.round(8 + Math.sin(a) * 5.8 - 0.5), BONE.d);
      }
      rune(p, 7, 3, 2, GLOW[3]!.mid);
      p.outline(OUTLINE);
      halo(p, 8, 8, 8, GLOW[3]!.light, 0.18);
      break;
    }
    case 'offhand_runbok': {
      // a thick old book: a leather cover with a glowing rune, a brass clasp, the pages' edge
      p.rect(3, 2, 10, 12, '#6a3a22').rect(3, 2, 10, 1, '#9a5a32').rect(3, 2, 1, 12, '#8a4a2a').rect(12, 3, 1, 11, '#4a2414');
      p.rect(4, 13, 9, 2, '#f4ecd8').rect(4, 14, 9, 1, '#c8bca0').rect(2, 2, 1, 13, '#4a2414');
      p.rect(5, 4, 6, 7, '#5a2e1a');
      p.tpl(6, 4, ['#..#', '##.#', '#.##', '#..#', '#..#', '.##.'], { '#': '#a8f8ff' });
      p.rect(12, 7, 2, 3, GOLD.b).px(12, 7, GOLD.l2);
      p.outline(OUTLINE);
      halo(p, 8, 7, 7, '#a8f8ff', 0.24);
      break;
    }
    case 'offhand_dvargskold': {
      roundShield(GOLD, IRON, GOLD.l2);
      p.line(8, 2, 8, 14, GOLD.d).line(2, 8, 14, 8, GOLD.d);
      p.rect(7, 7, 3, 3, GOLD.b).px(7, 7, GOLD.l2);
      for (const [x, y] of [[4, 4], [12, 4], [4, 12], [12, 12]] as const) p.px(x, y, GOLD.l);
      p.outline(OUTLINE);
      twinkle(p, 3, 3);
      break;
    }
    case 'offhand_koger': {
      // a quiver of leather on the slant, the arrows' feathers sticking out of it
      p.line(4, 15, 11, 4, '#7a4a2a').line(5, 15, 12, 4, '#7a4a2a').line(6, 15, 13, 4, '#5a3420').line(3, 14, 10, 3, '#9a6a3a');
      p.line(5, 13, 12, 6, '#5a3420').rect(9, 3, 5, 2, '#5a3420').rect(9, 3, 5, 1, '#9a6a3a');
      for (const [x, c] of [[10, '#e84a4a'], [12, '#f4f4f4'], [14, '#4a8ae8']] as const) p.rect(x - 1, 0, 2, 3, c).px(x - 1, 0, shade(c, 1.4));
      p.px(7, 10, GOLD.b).px(8, 9, GOLD.l);
      p.outline(OUTLINE);
      break;
    }
    case 'offhand_perlemorskold': {
      // a shield like a scallop shell, shining in mother-of-pearl's pinks and blues
      paint(p, 1, 1, 14, 14, (x, y) => {
        const dx = x + 0.5 - 8;
        const dy = y + 0.5 - 15;
        const a = Math.atan2(dx, -dy);
        const r = Math.hypot(dx / 7, dy / 13) * (1 + 0.06 * Math.abs(Math.sin(a * 9)));
        if (r > 1 || dy > 0 || Math.abs(a) > 1.25) return null;
        const rib = Math.floor((a + 2) / (Math.PI / 12)) % 2;
        const sheen = ['#ffe0f0', '#e8e0ff', '#d8f4ff', '#f4ffe8'][Math.floor((x + y) / 4) % 4]!;
        return r > 0.9 ? '#c8b8d8' : rib ? sheen : shade(sheen, 0.86);
      });
      p.rect(5, 13, 6, 2, '#a898b8').rect(5, 13, 6, 1, '#d8c8e8');
      p.outline(OUTLINE);
      p.px(7, 6, '#ffffff');
      halo(p, 8, 8, 8, '#f0e0ff', 0.2);
      break;
    }
    case 'offhand_alvlykta': {
      KEEPSAKES.alvlykta!.body(p, 0);
      p.outline(OUTLINE);
      KEEPSAKES.alvlykta!.shine(p, 0, 0, 1);
      break;
    }
    case 'offhand_tyrshandske': {
      // Tyr's gauntlet: a steel glove, fingers together, a cuff of gold
      p.rect(3, 9, 9, 6, '#d4a830').rect(3, 9, 9, 1, '#ffe27a').rect(3, 14, 9, 1, '#8a5a10');
      p.rect(4, 3, 8, 6, STEEL_PAL.b).rect(4, 3, 8, 1, STEEL_PAL.l2);
      for (const x of [4, 6, 8, 10]) p.rect(x, 0, 2, 4, STEEL_PAL.l).px(x, 0, STEEL_PAL.l2).px(x + 1, 3, STEEL_PAL.d);
      p.rect(12, 5, 3, 2, STEEL_PAL.l).px(14, 5, STEEL_PAL.l2).rect(4, 6, 8, 1, STEEL_PAL.d);
      p.tpl(6, 10, ['.#.', '###', '.#.', '.#.'], { '#': '#c83a2a' });
      p.outline(OUTLINE);
      aura(p, 8, 7, 7, '#ffd0a0');
      break;
    }
    case 'offhand_lokesmask': {
      // Loke's mask: green, grinning ear to ear, little horns and gold eyebrows raised
      paint(p, 1, 2, 14, 13, (x, y) => {
        const dx = (x + 0.5 - 8) / 6.5;
        const dy = (y + 0.5 - 8.5) / 6;
        const r = dx * dx + dy * dy;
        if (r > 1) return null;
        return tone(pal('#14502a', '#1e7a3a', '#2ea84e', '#6ad884', '#b8f4c4'), light(dx, dy, Math.sqrt(1 - r) + 0.2));
      });
      p.tpl(1, 0, ['#............#', '##..........##', '.##........##.'], { '#': GOLD.b }).px(1, 0, GOLD.l2);
      p.rect(4, 6, 3, 2, '#0e1a12').rect(9, 6, 3, 2, '#0e1a12').line(3, 5, 6, 4, GOLD.l).line(9, 4, 12, 5, GOLD.l);
      p.tpl(3, 10, ['#........#', '.#......#.', '..######..'], { '#': '#0e1a12' }).rect(5, 11, 6, 1, '#ffffff');
      p.outline(OUTLINE);
      aura(p, 8, 8, 8, '#7aff9a');
      break;
    }
  }
  return p;
}

/** Amulets on their cords or chains: the pendant hanging at the bottom of a loop. */
function amuletIcon(id: string): Px {
  const p = new Px(16, 16);
  const loop = (c: string, cl: string) => {
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (i / 12);
      const x = Math.round(8 - Math.cos(a) * 6);
      const y = Math.round(1 + Math.sin(a) * 6);
      p.px(x, y, i % 2 ? c : cl);
    }
  };
  switch (id) {
    case 'amulet_vegvisir': {
      // a silver disc with the rune compass: eight arms with their marks
      loop('#7a5a3a', '#a07a4a');
      paint(p, 3, 5, 11, 11, (x, y) => (Math.hypot(x + 0.5 - 8.5, y + 0.5 - 10.5) < 5.2 ? STEEL_PAL.b : null));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.line(8, 10, Math.round(8 + Math.cos(a) * 4), Math.round(10 + Math.sin(a) * 4), '#3a4a6a');
      }
      p.px(8, 10, '#a8e8ff').px(5, 7, STEEL_PAL.l2);
      p.outline(OUTLINE);
      halo(p, 8, 10, 7, '#a8e8ff', 0.2);
      break;
    }
    case 'amulet_helring': {
      // a ring of dark teal stone set with a green ghost-light gem, hung on a cord
      loop('#2a3a3a', '#4a5a5a');
      paint(p, 3, 5, 10, 10, (x, y) => {
        const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 10);
        return r > 2.3 && r < 4.6 ? (x + y < 17 ? HEL.l : HEL.b) : null;
      });
      p.rect(7, 5, 3, 3, GLOW[3]!.mid).px(7, 5, GLOW[3]!.core);
      p.outline(OUTLINE);
      halo(p, 8, 7, 6, GLOW[3]!.light, 0.3);
      break;
    }
    case 'amulet_andvaranaut': {
      // Andvaranaut, Fafner's ring: thick red gold with a red stone, glowing a little greedily
      loop(GOLD.d, GOLD.b);
      paint(p, 2, 5, 12, 11, (x, y) => {
        const dx = (x + 0.5 - 8) / 5;
        const dy = (y + 0.5 - 10.5) / 4.6;
        const r = dx * dx + dy * dy;
        const ir = ((x + 0.5 - 8) / 2.6) ** 2 + ((y + 0.5 - 10.5) / 2.4) ** 2;
        if (r > 1 || ir < 1) return null;
        return tone(GOLD, light(dx, dy, 0.6));
      });
      p.rect(7, 5, 3, 2, '#e83a3a').px(7, 5, '#ffb0b0');
      p.outline(OUTLINE);
      halo(p, 8, 10, 8, '#ffd23f', 0.24);
      twinkle(p, 13, 6);
      break;
    }
    case 'amulet_perla': {
      // a great pearl in a little silver cup on a fine chain
      loop(STEEL_PAL.d, STEEL_PAL.l);
      lump(p, 4, 6, 8, 8, PEARL, 0.05, 341, 0.7);
      p.rect(5, 13, 6, 2, STEEL_PAL.b).rect(5, 13, 6, 1, STEEL_PAL.l2);
      p.outline(OUTLINE);
      p.px(6, 8, '#ffffff');
      halo(p, 8, 10, 8, GLOW[5]!.light, 0.22);
      break;
    }
    case 'amulet_alvsten': {
      // a violet drop of a stone held in silver leaves
      loop(STEEL_PAL.d, STEEL_PAL.l);
      paint(p, 4, 5, 8, 11, (x, y) => {
        const t = (y - 5) / 10;
        const half = t < 0.4 ? t * 7 : 3.4 * Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.4) ** 2));
        const u = (x + 0.5 - 8) / Math.max(0.5, half);
        if (Math.abs(u) > 1) return null;
        return u < -0.3 && t < 0.7 ? '#e2acff' : u < 0.4 ? '#a050e0' : '#6a2aa8';
      });
      p.px(5, 7, ALV_LEAF.l2).px(4, 8, STEEL_PAL.l).px(11, 7, ALV_LEAF.l2).px(12, 8, STEEL_PAL.l);
      p.outline(OUTLINE);
      p.px(7, 10, '#ffffff');
      halo(p, 8, 10, 7, GLOW[6]!.light, 0.28);
      break;
    }
    case 'amulet_gleipnir': {
      // Gleipnir, the silky ribbon that held the wolf: soft as silk, knotted in a loop, shimmering
      const silk = ['#f4f8ff', '#dce8ff', '#e8dcff'];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const x = 8 + Math.sin(a) * 6;
        const y = 7 + Math.sin(a * 2) * 3.4;
        p.px(Math.round(x), Math.round(y), silk[i % 3]!).px(Math.round(x), Math.round(y) + 1, '#a8b8d8');
      }
      p.line(8, 8, 5, 15, '#e8f0ff').line(8, 8, 11, 15, '#dce8ff').px(5, 15, '#a8b8d8').px(11, 15, '#a8b8d8');
      p.rect(7, 7, 3, 2, '#ffffff');
      p.outline('#5a6a8a');
      halo(p, 8, 8, 8, GLOW[7]!.light, 0.2);
      twinkle(p, 3, 3, '#ffffff');
      break;
    }
    case 'amulet_brisingamen': {
      // Brisingamen, Freja's necklace: a curve of gold plates, amber stones hanging from them, the middle one biggest
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (i / 10);
        const x = Math.round(8 - Math.cos(a) * 6.5);
        const y = Math.round(2 + Math.sin(a) * 7);
        p.rect(x, y, 2, 2, GOLD.b).px(x, y, GOLD.l2);
        if (i % 2 === 0 && i > 0 && i < 10) p.rect(x, y + 2, 2, i === 4 || i === 6 ? 2 : 1, '#ff9a2a').px(x, y + 2, '#ffd27a');
      }
      p.rect(7, 10, 3, 4, '#e8601a').rect(7, 10, 3, 1, '#ffd27a').px(8, 14, '#e8601a');
      p.outline(OUTLINE);
      halo(p, 8, 9, 8, '#ffd23f', 0.3);
      twinkle(p, 13, 3);
      break;
    }
  }
  return p;
}

/** The things villagers ask for in the second act. */
function questIcon2(id: string): Px {
  const p = new Px(16, 16);
  switch (id) {
    case 'glimmersten': {
      // a grey stone glittering all over with flecks of gold
      lump(p, 2, 4, 12, 10, DWARF, 0.3, 351, 0.3);
      for (const [x, y] of [[5, 7], [9, 6], [11, 10], [6, 11], [8, 9]] as const) p.px(x, y, GOLD.l2).px(x + 1, y + 1, GOLD.b);
      p.outline(OUTLINE);
      twinkle(p, 12, 4);
      twinkle(p, 4, 9, '#ffffff');
      break;
    }
    case 'alvdagg': {
      // elf dew: one big shining drop on a leaf
      paint(p, 1, 9, 14, 6, (x, y) => {
        const dx = (x + 0.5 - 8) / 7;
        const dy = (y + 0.5 - 12) / 2.6;
        return dx * dx + dy * dy > 1 ? null : y === 12 ? '#2a6a3a' : dy < 0 ? '#5ab05a' : '#3a8a4a';
      });
      paint(p, 4, 1, 8, 11, (x, y) => {
        const t = (y - 1) / 10;
        const half = t < 0.45 ? t * 6 : 3.6 * Math.sqrt(Math.max(0, 1 - ((t - 0.65) / 0.36) ** 2));
        const u = (x + 0.5 - 8) / Math.max(0.5, half);
        if (Math.abs(u) > 1) return null;
        return u < -0.3 && t < 0.7 ? '#f0e8ff' : u < 0.5 ? '#b8d8ff' : '#8aa8e8';
      });
      p.outline(OUTLINE);
      p.px(7, 6, '#ffffff').px(6, 7, '#ffffff');
      halo(p, 8, 7, 7, '#d0c0ff', 0.25);
      break;
    }
    case 'krabbklo': {
      // a big red crab claw, its pincer open
      paint(p, 2, 2, 12, 12, (x, y) => {
        const dx = (x + 0.5 - 7) / 5;
        const dy = (y + 0.5 - 9) / 4.4;
        if (dx * dx + dy * dy > 1) return null;
        return tone(pal('#7a1a10', '#b8301e', '#e8603a', '#ff9a72', '#ffd0b8'), light(dx, dy, 0.6));
      });
      p.tpl(8, 1, ['..##', '.###', '###.', '##..'], { '#': '#e8603a' }).tpl(11, 6, ['###', '.##'], { '#': '#b8301e' }).clear(11, 5, 2, 1);
      p.line(2, 14, 4, 12, '#b8301e').px(9, 2, '#ffd0b8');
      p.outline(OUTLINE);
      break;
    }
    case 'ulvtand': {
      // a wolf's tooth on a leather cord
      p.line(2, 2, 7, 5, '#7a4a2a').line(14, 2, 9, 5, '#7a4a2a');
      paint(p, 5, 4, 7, 11, (x, y) => {
        const t = (y - 5) / 9;
        const cx = 8 + t * t * 1.5;
        const half = 2.5 * (1 - t) + 0.3;
        const u = (x + 0.5 - cx) / half;
        if (t < 0 || Math.abs(u) > 1) return null;
        return u < -0.3 ? '#ffffff' : u < 0.4 ? '#ece6d8' : '#b8ac98';
      });
      p.rect(6, 4, 5, 2, '#5a3420').px(6, 4, '#8a5a30');
      p.outline(OUTLINE);
      break;
    }
    case 'bifrostskarva': {
      // a sliver of Bifrost: a flat shard of glass with the rainbow running through it
      paint(p, 1, 1, 14, 14, (x, y) => {
        const inside = x + 0.5 > 2 + (13 - y) * 0.2 && x + 0.5 < 14 - y * 0.35 && y > 1 && y < 15 && x + y > 6 && x - y < 9;
        if (!inside) return null;
        const band = Math.floor((x + y) / 3) % 6;
        return shade(RAINBOW[band]!, 1.35);
      });
      p.outline('#5a4a7a');
      p.line(4, 12, 9, 3, '#ffffff');
      halo(p, 8, 8, 8, '#f0e0ff', 0.2);
      twinkle(p, 11, 3, '#ffffff');
      break;
    }
  }
  return p;
}

const SAGA2_WEAPONS = ['helsvard', 'garmklo', 'gruvhacka', 'fafnerstand', 'korallspjut', 'stormbage', 'alvklinga', 'manstav', 'fenristand', 'tyrsyxa', 'lokesstav', 'bifrostbage', 'heimdallshorn'];
const SAGA2_OFFHANDS = ['offhand_helskold', 'offhand_runbok', 'offhand_dvargskold', 'offhand_koger', 'offhand_perlemorskold', 'offhand_alvlykta', 'offhand_tyrshandske', 'offhand_lokesmask'];
const SAGA2_AMULETS = ['amulet_vegvisir', 'amulet_helring', 'amulet_andvaranaut', 'amulet_perla', 'amulet_alvsten', 'amulet_gleipnir', 'amulet_brisingamen'];

/** Icons for the dungeons' items, by item id (the clothes are drawn from the player sprite, the animals from theirs). */
export function sagaIcons(): Record<string, Px> {
  const out: Record<string, Px> = {};
  for (const id of ['runsvard', 'draugyxa', 'volvastav', 'frostbett', 'isyxa', 'ullrsbage', 'surtsvard', 'mjolner', 'gungner']) out[id] = weaponIcon(id);
  for (const id of ['draugjarn', 'frostros', 'glodkol']) out[id] = questIcon(id);
  out.healing_potion = potionIcon();
  out.solruna = solrunaIcon();
  out.yggdrasil = yggdrasilIcon();
  // the second act
  for (const id of SAGA2_WEAPONS) out[id] = weaponIcon2(id);
  for (const id of SAGA2_OFFHANDS) out[id] = offhandIcon(id);
  for (const id of SAGA2_AMULETS) out[id] = amuletIcon(id);
  for (const id of ['glimmersten', 'alvdagg', 'krabbklo', 'ulvtand', 'bifrostskarva']) out[id] = questIcon2(id);
  for (const id of Object.keys(KEEPSAKES)) out[id] = keepsakeIcon(id);
  out.styrkedryck = potionIcon(true);
  return out;
}

// ---------------------------------------------------------------------------

/** How many looks the dungeons' walls, gates, torches, ways out and arches come in (one per dungeon). */
export const SAGA_LOOKS = 9;
const LOOKS = SAGA_LOOKS;

export function drawSaga(set: SetArt): void {
  set('saga_wall', n(LOOKS, sagaWall), 0, -8);
  // per dungeon: on its face (a corridor running up and down), then on end (running sideways)
  set('saga_gate', n(LOOKS * 2, (i) => sagaGate(Math.floor(i / 2), i % 2 === 1)), 0, -8);
  set('saga_torch', n(LOOKS * 2, (i) => sagaTorch(i % LOOKS, Math.floor(i / LOOKS))), 0, -24);
  set('saga_exit', n(LOOKS, sagaExit));
  set('saga_rest', n(4, (i) => sagaRest(i % 2 === 1, Math.floor(i / 2))), 0, -12);
  set('saga_chest', n(3, sagaChest), -4, -4);
  set('saga_portal', n(LOOKS * 2, (i) => sagaPortal(i % LOOKS, Math.floor(i / LOOKS))), 0, -24);
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
  // the second act: the puzzle rooms' rune plates, then each new dungeon's things (three of each, picked at random)
  set('saga_plate', n(4, (i) => sagaPlate(i % 2 === 1, Math.floor(i / 2))));
  set('saga_gravestone', n(3, gravestone), 0, -4);
  set('saga_skullpile', n(3, skullPile));
  set('saga_ghostlight', n(6, (i) => ghostLight(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_deadtree', n(3, deadTree), 0, -16);
  set('saga_minecart', n(3, mineCart), 0, -4);
  set('saga_goldpile', n(6, (i) => goldPile(i % 3, Math.floor(i / 3))), 0, -4);
  set('saga_dwarfstatue', n(3, dwarfStatue), 0, -16);
  set('saga_minelamp', n(6, (i) => mineLamp(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_coral', n(3, coral), 0, -8);
  set('saga_anchor', n(3, anchor), 0, -8);
  set('saga_seaweed', n(6, (i) => seaweed(i % 3, Math.floor(i / 3))));
  set('saga_pearl', n(6, (i) => pearl(i % 3, Math.floor(i / 3))), 0, -4);
  set('saga_glowshroom', n(6, (i) => glowshroom(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_fairylight', n(6, (i) => fairyLight(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_cobweb', n(3, cobweb));
  set('saga_elfstatue', n(3, elfStatue), 0, -16);
  set('saga_chain', n(3, chainHeap));
  set('saga_icefang', n(3, iceFang), 0, -8);
  set('saga_wolfstatue', n(3, wolfStatue), 0, -16);
  set('saga_bonepile', n(3, bonePile));
  set('saga_rainbowshard', n(6, (i) => rainbowShard(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_mirror', n(3, mirror), 0, -16);
  set('saga_starlamp', n(6, (i) => starLamp(i % 3, Math.floor(i / 3))), 0, -8);
  set('saga_runepillar', n(3, runePillar), 0, -16);
  // the keepsakes for home, glowing in turn
  for (const id of Object.keys(KEEPSAKES)) set(id, n(2, (f) => keepsakeObject(id, f)), 0, -8, true);
}

/** Per kind, how many looks its frames hold before the same looks come again a step on (flames, glows). */
export const SAGA_STEPPED: Record<string, number> = { saga_torch: LOOKS, saga_rest: 2, saga_portal: LOOKS, saga_candles: 3, saga_icecrystal: 3, saga_brazier: 3, saga_lavacrack: 3,
  saga_plate: 2, saga_ghostlight: 3, saga_goldpile: 3, saga_minelamp: 3, saga_seaweed: 3, saga_pearl: 3, saga_glowshroom: 3, saga_fairylight: 3, saga_rainbowshard: 3, saga_starlamp: 3,
};
