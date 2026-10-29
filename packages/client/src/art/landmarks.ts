// Landmarks of the wider world (cave mouths, the temple, the pyramid, the volcano, the space base and the
// UFO), what is inside the caves (walls, crystals, ore, chests), and the souvenirs you can make.
// Light comes from the top-left; big rounded shapes are shaded pixel by pixel with a handful of tones.
import { Px, hash2, shade } from './px.js';
import { OUTLINE } from './world.js';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;

const n = (count: number, f: (i: number) => Px): Px[] => Array.from({ length: count }, (_, i) => f(i));

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

/** Five tones of one material, darkest to lightest. */
interface Pal {
  d2: string;
  d: string;
  b: string;
  l: string;
  l2: string;
}
const pal = (d2: string, d: string, b: string, l: string, l2: string): Pal => ({ d2, d, b, l, l2 });

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
function paint(p: Px, x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => string | null | undefined): Px {
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
function glowOn(p: Px, cx: number, cy: number, r: number, col: string, k: number): Px {
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

// Light from the top-left and a little from the front (x right, y down, z towards the viewer).
const LX = -0.45;
const LY = -0.55;
const LZ = 0.7;
const light = (nx: number, ny: number, nz: number): number => (nx * LX + ny * LY + nz * LZ) / (Math.hypot(nx, ny, nz) || 1);
/** The palette's tone for an amount of light. */
const tone = (c: Pal, v: number): string => (v > 0.985 ? c.l2 : v > 0.86 ? c.l : v > 0.42 ? c.b : v > 0.05 ? c.d : c.d2);
/** Fixed per-pixel noise, -0.5..0.5. */
const grain = (x: number, y: number, salt = 0): number => hash2(x * 7 + salt * 131 + 3, y * 13 + salt * 71 + 5) / 1000 - 0.5;

/** A rounded lump (a boulder, an egg, a dome, a puff of smoke) shaded like a ball lit from the top-left. */
function lump(p: Px, x: number, y: number, w: number, h: number, c: Pal | ((x: number, y: number) => Pal), rough = 0.3, salt = 0, flat = 0.25): Px {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return paint(p, x, y, w + 1, h + 1, (px, py) => {
    const dx = (px + 0.5 - cx) / (w / 2);
    const dy = (py + 0.5 - cy) / (h / 2);
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return null;
    const pc = typeof c === 'function' ? c(px, py) : c;
    return tone(pc, light(dx, dy, Math.sqrt(1 - r2) + flat) + rough * grain(px, py, salt));
  });
}

/** A tiny four-pointed twinkle (drawn after the outline, so it has none). */
const twinkle = (p: Px, x: number, y: number, c = '#fff3b0', core = '#ffffff'): Px => p.px(x, y - 1, c).px(x - 1, y, c).px(x + 1, y, c).px(x, y + 1, c).px(x, y, core);

/** A crystal shard standing on (bx, by) (bottom middle), w wide and h tall, its tip leaning `lean` px. */
function shard(p: Px, bx: number, by: number, w: number, h: number, lean: number, c: Pal): Px {
  const tip = Math.max(2, Math.round(w * 0.75));
  return paint(p, bx - w - Math.abs(lean) - 1, by - h, 2 * w + 2 * Math.abs(lean) + 3, h + 1, (x, y) => {
    const i = by - y; // 0 on the bottom row
    if (i < 0 || i >= h) return null;
    const cx = bx + (lean * i) / h;
    const half = i >= h - tip ? (w / 2) * ((h - i) / (tip + 1)) : w / 2;
    const u = (x + 0.5 - cx) / Math.max(0.5, half);
    if (Math.abs(u) > 1) return null;
    if (i >= h - tip) return u < 0 ? c.l2 : c.l; // the facets of the tip catch the light
    return u < -0.4 ? c.l : u < 0.35 ? c.b : c.d;
  });
}

/** Inside an arch (straight sides, round top), `hw` the half width, `top` its highest row. */
const inArch = (x: number, y: number, cx: number, top: number, hw: number): boolean => {
  const dx = x + 0.5 - cx;
  if (Math.abs(dx) > hw) return false;
  const yc = top + hw;
  return y + 0.5 >= yc || dx * dx + (y + 0.5 - yc) ** 2 <= hw * hw;
};

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** Rock of each cave theme, in CAVE_THEMES order: rot, is, kristall, sjorovare, pyramid, tempel, lava, svamp, fossil, godis, rymd. */
const ROCK: Pal[] = [
  pal('#3b2a1d', '#563e2b', '#73563c', '#937352', '#b0906a'),
  pal('#4f7598', '#7099bd', '#9cc0de', '#c8e0f2', '#eef8ff'),
  pal('#3a3646', '#544e62', '#6e6880', '#8c86a0', '#aaa4be'),
  pal('#1f262e', '#2e3842', '#414d59', '#596773', '#74838f'),
  pal('#8a6436', '#ad8550', '#cfa96c', '#e6c78e', '#f6e2b4'),
  pal('#3c4636', '#55614b', '#707e62', '#8e9c7e', '#adb99c'),
  pal('#100c10', '#1d171d', '#2c242c', '#3e343e', '#544852'),
  pal('#323a3a', '#485252', '#5f6b6a', '#7a8784', '#97a39f'),
  pal('#5e2814', '#833a20', '#a9522f', '#c86e44', '#e08e60'),
  pal('#a8406e', '#d0609a', '#ee88bb', '#f8b2d4', '#ffe0ef'),
  pal('#5c5c6a', '#7c7c8a', '#9e9eac', '#bebec8', '#dcdce4'),
];
const CANDY_WHITE = pal('#c8a8bc', '#e4d0dc', '#fbf4f8', '#ffffff', '#ffffff');
const SNOW = pal('#9cb4cc', '#c4d8ea', '#e6f0f8', '#f6fbff', '#ffffff');
const SAND = pal('#a8904e', '#c8b06a', '#e3d08f', '#f0e2b0', '#fbf3d8');
const BONE = pal('#8a7c60', '#b8aa88', '#e2d6b8', '#f4ecd8', '#fffaf0');
const WOODP = pal('#4e3219', '#6f4a26', '#9a6a3a', '#c58f55', '#e0b47a');
const GOLD = pal('#8a5a10', '#b8861a', '#e8b830', '#ffe27a', '#fff6c8');
const IRON = pal('#2e3036', '#4a4d56', '#6a6e7a', '#9094a0', '#c0c4cc');
const STEEL = pal('#596476', '#7c8798', '#b8c2d0', '#e2e8f0', '#ffffff');
const WHITE_METAL = pal('#7e8698', '#aeb4c4', '#e2e5ee', '#f6f7fb', '#ffffff');
const GREY_ROCK = pal('#3e3a3a', '#57524f', '#76716b', '#958f86', '#b4ada2');
const VOID = '#110d0b';
const LEAF = pal('#1e4a1c', '#2f6a2a', '#4f9a3a', '#7fc35a', '#b0e07a');
const MOSS = pal('#2a4a22', '#3f6a2a', '#5a8a35', '#78ad48', '#a0cc68');
/** Crystal colours: purple, ice blue, alien green, pink sugar. */
const CRYSTAL: Pal[] = [
  pal('#4a1a80', '#7a36c0', '#a860f0', '#d0a0ff', '#f6ecff'),
  pal('#1e5a8a', '#3a8ac0', '#70c8f0', '#b4ecff', '#ffffff'),
  pal('#14703a', '#28a050', '#56e07a', '#a4ffb8', '#f0fff4'),
  pal('#a03a70', '#d05a98', '#f08ac0', '#ffc4e2', '#fff4fa'),
];

// ---------------------------------------------------------------------------
// Cave walls (16×24 at oy -8): the top 16 rows wrap every 16 px both ways, so a mass of walls is seamless;
// the lowest 8 rows only show where a wall has the floor below it: the lip and face of the rock.
// ---------------------------------------------------------------------------

type Seed = readonly [number, number, number];
/** Stones of a wall (x, y, size), placed so the pattern wraps every 16 px. */
const COBBLES: Seed[] = [
  [3, 3, 4.6],
  [10.5, 2, 5],
  [7, 9, 5],
  [14, 9.5, 4.2],
  [2, 13, 4.6],
  [10, 14.5, 4.2],
];
const CHUNKS: Seed[] = [
  [4, 4, 6.5],
  [12.5, 7, 6.5],
  [5, 12.5, 6],
  [13, 15, 5],
];
const wrap16 = (v: number): number => ((((v + 8) % 16) + 16) % 16) - 8;

/** A seamless mass of rounded stones (cells around the seeds, wrapping every 16 px) with cracks between them. */
function stoneField(p: Px, c: Pal | ((x: number, y: number) => Pal), seeds: readonly Seed[], crack: string | ((x: number, y: number) => string), opts: { rough?: number; salt?: number; gap?: number; flat?: number } = {}): Px {
  const { rough = 0.3, salt = 0, gap = 0.14, flat = 0.3 } = opts;
  return paint(p, 0, 0, 16, 16, (x, y) => {
    let best = 9;
    let second = 9;
    let nx = 0;
    let ny = 0;
    for (const [sx, sy, r] of seeds) {
      const dx = wrap16(x + 0.5 - sx) / r;
      const dy = wrap16(y + 0.5 - sy) / r;
      const dd = Math.hypot(dx, dy);
      if (dd < best) {
        second = best;
        best = dd;
        nx = dx;
        ny = dy;
      } else if (dd < second) second = dd;
    }
    if (second - best < gap) return typeof crack === 'function' ? crack(x, y) : crack;
    const r2 = Math.min(0.9, nx * nx + ny * ny);
    const pc = typeof c === 'function' ? c(x, y) : c;
    return tone(pc, light(nx, ny, Math.sqrt(1 - r2) + flat) + rough * grain(x, y, salt));
  });
}

/** Seamless courses of blocks, `bh` tall and `bw` long, every other course shifted by half a block. */
function blockField(p: Px, c: Pal, bw: number, bh: number, mortar: string, salt: number, y0 = 0, y1 = 16): Px {
  return paint(p, 0, y0, 16, y1 - y0, (x, y) => {
    const course = Math.floor(y / bh);
    const yy = y - course * bh;
    const xx = (((x + (course % 2 ? bw / 2 : 0)) % bw) + bw) % bw;
    if (yy === bh - 1 || xx === bw - 1) return mortar;
    if (yy === 0 || xx === 0) return c.l;
    if (yy === bh - 2 || xx === bw - 2) return c.d;
    const g = grain(x, y, salt);
    return g > 0.38 ? c.l : g < -0.42 ? c.d : c.b;
  });
}

/** The foot of a wall (rows 16..23): a lit lip, then the rock face with a few cracks, darkest at the floor. */
function rockFace(p: Px, c: Pal, salt: number): Px {
  return paint(p, 0, 16, 16, 8, (x, y) => {
    const r = y - 16;
    const h = hash2(x * 5 + salt * 17, 91 + salt);
    if (r === 7) return c.d2;
    if (r === 0) return h % 5 === 0 ? c.b : c.l;
    if (h % 7 === 0 && r >= 2 && r <= 5) return c.d2;
    if (r === 6) return h % 3 === 0 ? c.d2 : c.d;
    if (r === 1) return h % 3 === 0 ? c.l : c.b;
    return (h >> 4) % 3 === 0 ? c.b : c.d;
  });
}

/** A torch in an iron bracket on the wall, with its warm light on the rock around it. */
function wallTorch(p: Px): Px {
  glowOn(p, 8, 9, 10, '#ffb45a', 0.42);
  p.rect(7, 15, 2, 4, '#2e2a28').rect(6, 18, 4, 1, '#2e2a28'); // bracket on the wall
  p.rect(7, 10, 2, 5, '#6f4a26').px(7, 10, '#9a6a3a').px(7, 11, '#9a6a3a'); // the handle
  p.rect(6, 12, 4, 2, '#4a4d56').rect(6, 12, 4, 1, '#8a8e9a'); // the cup
  p.rect(6, 6, 4, 4, '#f08a24').rect(7, 4, 2, 6, '#ffc23a').px(8, 3, '#ffd45a').rect(7, 7, 2, 2, '#fff2a0').px(6, 5, '#f5a623').px(9, 6, '#f5a623');
  return p;
}

/** cave_wall frames for the caves out in the world: theme 0..10 (see CAVE_THEMES), plain or with a torch. */
export function caveWallThemed(theme: number, lit: boolean): Px {
  const t = Math.min(10, Math.max(0, Math.floor(theme) || 0));
  const c = ROCK[t]!;
  const p = new Px(16, 24);
  switch (t) {
    case 0: {
      // earthy brown lumps with roots
      stoneField(p, c, COBBLES, c.d2, { salt: 1 });
      rockFace(p, c, 1);
      const root = '#3a2414';
      const rootL = '#7a5230';
      p.line(0, 6, 3, 8, root).line(3, 8, 6, 7, root).px(1, 6, rootL).px(4, 8, rootL);
      p.line(12, 12, 15, 11, root).px(13, 12, rootL).line(0, 11, 1, 10, root);
      p.rect(2, 16, 1, 3, root).px(3, 19, root).rect(3, 20, 1, 2, root).px(2, 16, rootL);
      p.rect(11, 16, 1, 2, root).px(12, 18, root).px(12, 19, root).px(11, 16, rootL);
      p.px(6, 3, c.l2).px(13, 6, c.l2).px(9, 13, c.l2);
      break;
    }
    case 1: {
      // icy blue-white chunks, frost and icicles
      stoneField(p, c, CHUNKS, c.d, { salt: 2, rough: 0.2, flat: 0.4 });
      rockFace(p, c, 2);
      for (const [x, y] of [[3, 2], [12, 6], [6, 11], [14, 13]] as const) p.px(x, y, '#ffffff');
      for (const [x, len] of [[1, 4], [4, 2], [7, 5], [10, 3], [13, 4]] as const) {
        p.rect(x, 17, 1, len, '#e8f6ff').px(x, 17, '#ffffff').px(x, 16 + len, '#bfe4ff');
        if (len > 3) p.px(x + 1, 17, '#cfeaff');
      }
      break;
    }
    case 2: {
      // grey-purple rock with crystal glints in its cracks
      stoneField(p, c, COBBLES, (x, y) => ((x + y) % 5 === 0 ? '#5a2a8a' : c.d2), { salt: 3 });
      rockFace(p, c, 3);
      const cr = CRYSTAL[0]!;
      p.rect(4, 6, 1, 2, cr.l).px(5, 7, cr.b).px(4, 5, cr.l2);
      p.rect(12, 13, 1, 2, cr.l).px(13, 14, cr.d).px(12, 12, cr.l2);
      p.px(9, 2, cr.l2).px(1, 11, cr.l);
      p.rect(9, 18, 2, 3, cr.b).rect(9, 18, 1, 3, cr.l).px(9, 17, cr.l2).px(11, 20, cr.d);
      break;
    }
    case 3: {
      // dark wet grey stones with barnacles, seaweed at the foot
      stoneField(p, c, COBBLES, c.d2, { salt: 4, rough: 0.25 });
      rockFace(p, c, 4);
      for (const [x, y] of [[4, 4], [12, 8], [7, 13], [1, 9]] as const) p.px(x, y, '#c9cec2').px(x + 1, y, '#9aa096').px(x, y + 1, '#8a9088');
      p.px(9, 4, '#9ab4c8').px(2, 13, '#9ab4c8').px(14, 2, '#9ab4c8');
      p.rect(3, 18, 1, 5, '#2f6a3a').px(4, 17, '#2f6a3a').px(2, 20, '#4f9a48').rect(12, 19, 1, 4, '#2f6a3a').px(13, 18, '#4f9a48');
      break;
    }
    case 4: {
      // sandstone bricks, a course of big blocks at the foot
      blockField(p, c, 8, 4, c.d2, 5, 0, 16);
      paint(p, 0, 16, 16, 8, (x, y) => {
        const r = y - 16;
        if (r === 0) return c.l2;
        if (r >= 6) return c.d2;
        if (x % 8 === 7) return c.d2;
        if (r === 5) return c.d;
        return x % 8 === 0 || r === 1 ? c.l : grain(x, y, 5) > 0.4 ? c.l : c.b;
      });
      p.rect(3, 18, 2, 2, c.d).px(3, 18, c.d2).rect(11, 18, 1, 3, c.d).px(10, 19, c.d).px(12, 19, c.d);
      break;
    }
    case 5: {
      // big carved blocks of grey-green stone with moss creeping over them
      blockField(p, c, 8, 8, c.d2, 6, 0, 24);
      p.rect(1, 0, 5, 1, MOSS.l).rect(0, 1, 4, 1, MOSS.b).px(4, 1, MOSS.l).px(1, 2, MOSS.d).px(3, 2, MOSS.b).px(2, 3, MOSS.d);
      p.rect(13, 8, 3, 1, MOSS.l).rect(14, 9, 2, 1, MOSS.b).px(15, 10, MOSS.d).px(0, 8, MOSS.b);
      // the foot: a carved band, moss and a hanging vine, in shadow at the floor
      p.rect(0, 16, 16, 1, c.l2).rect(0, 17, 16, 5, c.b).rect(0, 21, 16, 1, c.d).rect(0, 22, 16, 2, c.d2);
      for (let x = 1; x < 16; x += 5) p.rect(x, 18, 3, 2, c.d).px(x + 1, 18, c.l);
      p.rect(9, 16, 4, 1, MOSS.l).rect(10, 17, 2, 1, MOSS.b).rect(10, 18, 1, 3, LEAF.d).px(11, 20, LEAF.b).px(9, 19, LEAF.l);
      break;
    }
    case 6: {
      // black basalt with cracks, a few of them glowing hot
      const BASALT_CELLS: Seed[] = [
        [2, 3, 4.6],
        [10, 1, 4.6],
        [6, 8, 4.6],
        [14, 9, 4.6],
        [2, 13, 4.6],
        [10, 15, 4.6],
      ];
      // the glow runs along the cracks in long veins (waves that repeat every 16 px, so it still tiles)
      const q = Math.PI / 8;
      const vein = (x: number, y: number) => Math.sin((2 * x + 3 * y) * q) + Math.sin((x - 2 * y) * q);
      stoneField(p, c, BASALT_CELLS, (x, y) => {
        const g = vein(x, y);
        return g > 1.15 ? '#ffb04a' : g > 0.6 ? '#e8501a' : g > 0.25 ? '#7a2410' : '#0a080a';
      }, { salt: 7, rough: 0.15, gap: 0.1, flat: 0.9 });
      rockFace(p, c, 7);
      p.rect(5, 17, 1, 4, '#c8401a').px(5, 18, '#ffb04a').px(6, 21, '#c8401a').rect(12, 16, 1, 3, '#c8401a').px(12, 17, '#ffd060');
      break;
    }
    case 7: {
      // grey stones with patches of moss and glowing spores
      stoneField(p, c, COBBLES, c.d2, { salt: 8, rough: 0.2 });
      for (const [x, y, w] of [[1, 0, 5], [9, 7, 4], [12, 12, 3], [3, 10, 3]] as const) p.rect(x, y, w, 1, '#7aaa76').rect(x + 1, y + 1, w - 2, 1, '#5a8a62').px(x, y + 1, '#3e6a4e');
      rockFace(p, c, 8);
      for (const [x, y] of [[4, 4], [11, 5], [14, 13]] as const) p.px(x, y, '#9af8ec');
      p.px(7, 12, '#e8fffb').px(5, 19, '#9af8ec');
      break;
    }
    case 8: {
      // red sandstone in layers, with bits of bone
      paint(p, 0, 0, 16, 24, (x, y) => {
        const band = Math.floor((y + (x % 8 < 4 ? 0 : 1)) / 3) % 4;
        const v = band === 0 ? 0.95 : band === 1 ? 0.6 : band === 2 ? 0.75 : 0.35;
        return tone(c, v + 0.25 * grain(x, y % 16, 9));
      });
      rockFace(p, c, 9);
      p.rect(3, 4, 2, 1, BONE.b).px(2, 4, BONE.l).px(5, 4, BONE.d).px(2, 5, BONE.d);
      p.px(11, 12, BONE.b).px(12, 12, BONE.d).px(11, 11, BONE.l);
      p.px(8, 19, BONE.b).px(9, 19, BONE.d);
      break;
    }
    case 9: {
      // pink-and-white candy stripes
      const stripe = (x: number, y: number): Pal => (((x + y) & 7) < 3 ? CANDY_WHITE : c);
      stoneField(p, stripe, CHUNKS, c.d, { salt: 10, rough: 0.1, flat: 0.5 });
      paint(p, 0, 16, 16, 8, (x, y) => {
        const r = y - 16;
        const drip = r === 0 || (r === 1 && x % 4 !== 3) || (r === 2 && x % 8 === 1);
        if (drip) return r === 0 ? '#ffffff' : '#f4eef6';
        if (r === 7) return '#5a2e14';
        return r >= 5 ? '#7a4424' : ((x + y) & 7) < 3 ? CANDY_WHITE.b : c.d;
      });
      for (const [x, y, col] of [[4, 5, '#ffe14a'], [11, 10, '#4ad0ff'], [7, 14, '#7aff7a'], [13, 3, '#ff6a4a']] as const) p.px(x, y, col);
      break;
    }
    default: {
      // pale moon rock with little craters and a faint green glow
      stoneField(p, c, CHUNKS, c.d, { salt: 11, rough: 0.2, flat: 0.45 });
      rockFace(p, c, 11);
      for (const [x, y] of [[4, 4], [11, 11]] as const) p.rect(x, y, 3, 1, c.d).px(x - 1, y + 1, c.d).px(x + 3, y + 1, c.l).rect(x, y + 2, 3, 1, c.l2);
      for (const [x, y] of [[13, 2], [2, 10], [8, 14], [10, 19]] as const) p.px(x, y, '#8af0a0');
      p.px(6, 20, '#5ac87a');
      break;
    }
  }
  if (lit) wallTorch(p);
  return p;
}

// ---------------------------------------------------------------------------
// Cave mouths (32×40 at oy -8): a dark arched opening at the bottom middle, the rock around it per theme
// ---------------------------------------------------------------------------

interface MouthInside {
  /** The tunnel's sides just inside the opening (left and right). */
  inner: string;
  innerL: string;
  /** The floor running in (near, further in). */
  floor: string;
  floorD: string;
}
const INSIDE: MouthInside[] = [
  { inner: '#241a12', innerL: '#3a2a1c', floor: '#4a3a28', floorD: '#2a2016' },
  { inner: '#22324a', innerL: '#3a5672', floor: '#6a8eae', floorD: '#3a5068' },
  { inner: '#1e1a28', innerL: '#2e2a40', floor: '#4a4652', floorD: '#2a2830' },
  { inner: '#141a20', innerL: '#222c36', floor: '#6a6040', floorD: '#3a3424' },
  { inner: '#3a2a16', innerL: '#5a4222', floor: '#7a6a50', floorD: '#4a3e2c' },
  { inner: '#1c2218', innerL: '#2c3626', floor: '#4a4a44', floorD: '#2c2c28' },
  { inner: '#3a0e06', innerL: '#5a1a0a', floor: '#d8541a', floorD: '#8a2a0e' },
  { inner: '#16201e', innerL: '#22302e', floor: '#3a6a5a', floorD: '#244236' },
  { inner: '#2e140a', innerL: '#46200f', floor: '#7a4a2a', floorD: '#4a2c18' },
  { inner: '#4a1e34', innerL: '#6a2c4a', floor: '#6a3a1e', floorD: '#3e200e' },
  { inner: '#12301c', innerL: '#1e4a2a', floor: '#4ac070', floorD: '#22603a' },
];

/** The dark opening: tunnel sides just inside, the floor running in, then darkness. */
function mouthOpening(p: Px, cx: number, top: number, hw: number, bottom: number, s: MouthInside, square = false): Px {
  const inside = (x: number, y: number, t: number, w: number) => (square ? Math.abs(x + 0.5 - cx) <= w && y >= t : inArch(x, y, cx, t, w));
  return paint(p, cx - hw - 1, top - 1, hw * 2 + 3, bottom - top + 2, (x, y) => {
    if (y > bottom || !inside(x, y, top, hw)) return null;
    const fy = bottom - y;
    const deep = inside(x, y, top + 2, hw - 2);
    if (!deep) {
      if (fy <= 1) return s.floor;
      return x + 0.5 > cx ? s.innerL : s.inner;
    }
    const half = hw - 2 - (3 - Math.min(3, fy)) * 0.5;
    if (fy <= 3 && Math.abs(x + 0.5 - cx) <= half) return fy <= 1 ? s.floor : s.floorD;
    return VOID;
  });
}

/** A hump of boulders around the arch: rounded on top, wide at the foot. */
function boulderArch(p: Px, c: Pal | ((x: number, y: number) => Pal), salt: number, rough = 0.2): Px {
  lump(p, 1, 6, 30, 58, c, rough, salt, 0.35);
  lump(p, 3, 6, 13, 11, c, rough, salt + 2);
  lump(p, 17, 5, 12, 11, c, rough, salt + 1);
  lump(p, 10, 1, 12, 10, c, rough, salt + 3);
  lump(p, 1, 14, 10, 14, c, rough, salt + 4);
  lump(p, 21, 13, 10, 14, c, rough, salt + 5);
  lump(p, 1, 26, 11, 14, c, rough, salt + 6);
  lump(p, 20, 25, 11, 15, c, rough, salt + 7);
  return p;
}

const ARCH = { cx: 16, top: 15, hw: 7, bottom: 39 };

function caveMouth(t: number): Px {
  const c = ROCK[t]!;
  const s = INSIDE[t]!;
  const p = new Px(32, 40);
  const { cx, top, hw, bottom } = ARCH;
  switch (t) {
    case 4: {
      // a doorway of sandstone blocks under a little pyramid with a golden tip
      paint(p, 0, 0, 32, 40, (x, y) => {
        const u = x + 0.5 - 16;
        if (y < 11) {
          const half = 0.6 + (y - 1) * 1.45;
          if (y < 1 || Math.abs(u) > half) return null;
          if (y < 4) return u < 0 ? GOLD.l2 : GOLD.l;
          if (y % 3 === 1) return c.d;
          return u < -half + 2 ? c.l2 : u > half - 2 ? c.b : c.l;
        }
        const half = 14 + (y - 11) * 0.03;
        if (Math.abs(u) > half) return null;
        if (y === 11) return c.l2;
        if (y === 12) return c.d;
        const course = Math.floor((y - 13) / 4);
        const yy = (y - 13) % 4;
        const xx = (x + (course % 2) * 4) % 8;
        if (yy === 3) return c.d2;
        if (xx === 7) return c.d;
        const f = (u + half) / (2 * half);
        if (f > 0.9) return c.d;
        if (yy === 0 || f < 0.07) return c.l;
        return grain(x, y, 4) > 0.42 ? c.l : c.b;
      });
      // the lintel and jambs around the doorway
      p.rect(7, 15, 18, 4, c.l).rect(7, 15, 18, 1, c.l2).rect(7, 18, 18, 1, c.d).rect(24, 16, 1, 2, c.d);
      p.rect(8, 19, 3, 21, c.l).rect(8, 19, 1, 21, c.l2).rect(21, 19, 3, 21, c.b).rect(23, 19, 1, 21, c.d);
      mouthOpening(p, 16, 19, 5, bottom, s, true);
      // a winged sun on the lintel, hieroglyphs beside the door
      p.rect(15, 16, 2, 2, GOLD.b).px(15, 16, GOLD.l2).rect(10, 16, 4, 1, '#2a6ad0').rect(18, 16, 4, 1, '#2a6ad0').rect(11, 17, 3, 1, '#c83a3a').rect(18, 17, 3, 1, '#c83a3a');
      p.rect(4, 21, 2, 1, c.d2).px(3, 22, c.d2).px(6, 22, c.d2).rect(4, 23, 2, 1, c.d2).rect(3, 24, 4, 1, c.d2).rect(4, 25, 2, 3, c.d2);
      p.rect(26, 21, 2, 2, c.d2).rect(25, 23, 4, 2, c.d2).px(28, 22, c.d2).rect(26, 25, 1, 3, c.d2);
      p.rect(3, 31, 4, 1, c.d2).rect(25, 31, 4, 1, c.d2).px(4, 30, c.d2).px(27, 30, c.d2);
      break;
    }
    case 5: {
      // carved stone blocks under a crown of moss, a stepped arch into the dark
      paint(p, 0, 0, 32, 40, (x, y) => {
        const dx = (x + 0.5 - 16) / 15.4;
        const dy = (y + 0.5 - 36) / 31;
        if (dx * dx + dy * dy > 1) return null;
        const course = Math.floor(y / 6);
        const yy = y % 6;
        const xx = (x + (course % 2) * 5) % 10;
        const shaded = dx > 0.62;
        if (yy === 5 || xx === 9) return c.d2;
        if (yy === 0 || xx === 0) return shaded ? c.b : c.l;
        if (yy === 4 || xx === 8) return c.d;
        return shaded ? c.d : grain(x, y, 5) > 0.42 ? c.l : c.b;
      });
      // the corbel arch: each course steps in over the doorway
      p.rect(9, 19, 14, 1, c.l2).rect(11, 15, 10, 1, c.l2).rect(13, 11, 6, 1, c.l2);
      p.rect(13, 12, 6, 3, VOID).rect(13, 12, 1, 3, s.inner).rect(18, 12, 1, 3, s.innerL);
      p.rect(11, 16, 10, 3, VOID).rect(11, 16, 1, 3, s.inner).rect(20, 16, 1, 3, s.innerL);
      mouthOpening(p, 16, 20, 7, bottom, s, true);
      // a carved face over the door
      p.rect(12, 4, 8, 6, c.d).rect(12, 4, 8, 1, c.l).rect(13, 5, 2, 2, c.l2).rect(17, 5, 2, 2, c.l2).px(14, 6, c.d2).px(18, 6, c.d2).rect(14, 8, 4, 1, c.l);
      // moss on top, vines hanging down
      lump(p, 1, 3, 12, 6, MOSS, 0.2, 51, 0.5);
      lump(p, 9, 1, 14, 6, MOSS, 0.2, 52, 0.5);
      lump(p, 19, 3, 12, 6, MOSS, 0.2, 53, 0.5);
      lump(p, 1, 14, 6, 5, MOSS, 0.2, 54, 0.5);
      lump(p, 25, 12, 6, 5, MOSS, 0.2, 55, 0.5);
      const vine = (x: number, y: number, len: number) => {
        for (let i = 0; i < len; i++) p.px(x + (i % 5 === 4 ? 1 : 0), y + i, LEAF.d);
        for (let i = 2; i < len; i += 3) p.px(x + (i % 2 ? -1 : 1), y + i, i % 2 ? LEAF.b : LEAF.l);
      };
      vine(4, 8, 12);
      vine(27, 8, 16);
      vine(10, 9, 5);
      vine(21, 8, 8);
      vine(2, 18, 9);
      break;
    }
    case 8: {
      // red sandstone in layers, with bones sticking out
      paint(p, 0, 0, 32, 40, (x, y) => {
        const dx = (x + 0.5 - 16) / 15.4;
        const dy = (y + 0.5 - 28) / 26;
        if (dx * dx + dy * dy > 1) return null;
        const band = Math.floor((y + Math.round(Math.sin(x * 0.4) * 1.2)) / 3) % 4;
        const v = (band === 0 ? 0.95 : band === 1 ? 0.62 : band === 2 ? 0.78 : 0.4) - Math.max(0, dx) * 0.45 + Math.max(0, -dx) * 0.1;
        return tone(c, v + 0.25 * grain(x, y, 8));
      });
      mouthOpening(p, cx, top, hw, bottom, s);
      // a big bone poking out on the left, ribs on the right, a little ammonite
      p.line(3, 11, 10, 6, BONE.b).line(3, 12, 10, 7, BONE.l).line(4, 12, 11, 7, BONE.d);
      p.rect(1, 10, 3, 3, BONE.l).px(1, 12, BONE.b).px(3, 12, BONE.d).rect(10, 5, 3, 3, BONE.l).px(12, 7, BONE.d).px(10, 5, BONE.l2);
      for (let i = 0; i < 3; i++) p.line(23 + i * 2, 10 + i, 26 + i * 2, 14 + i, BONE.l).px(26 + i * 2, 15 + i, BONE.b);
      p.line(22, 9, 29, 12, BONE.b);
      p.circle(26, 30, 2.5, BONE.b).px(26, 30, BONE.d).px(25, 29, BONE.l).px(27, 31, BONE.d).px(25, 31, BONE.l);
      break;
    }
    default: {
      const colour = t === 9 ? (x: number, y: number): Pal => (((x + y) % 8) < 3 ? CANDY_WHITE : c) : c;
      boulderArch(p, colour, t * 11, t === 9 || t === 1 ? 0.1 : 0.2);
      mouthOpening(p, cx, top, hw, bottom, s);
    }
  }
  mouthDecor(p, t, c);
  p.outline(OUTLINE);
  if (t === 1) twinkle(p, 27, 9, '#dff4ff');
  return p;
}

/** What makes each theme's cave mouth its own. */
function mouthDecor(p: Px, t: number, c: Pal): void {
  const edge = (x: number) => {
    // the first open row of the arch at column x
    for (let y = ARCH.top; y < 40; y++) if (inArch(x, y, ARCH.cx, ARCH.top, ARCH.hw)) return y;
    return 40;
  };
  switch (t) {
    case 0: {
      // grass on top, roots hanging into the opening
      for (const [x, y] of [[5, 5], [12, 1], [19, 2], [25, 6], [2, 15]] as const) p.rect(x, y, 1, 2, LEAF.b).px(x + 1, y + 1, LEAF.b).px(x - 1, y + 1, LEAF.d).px(x, y, LEAF.l);
      const root = '#3a2414';
      const rootL = '#7a5230';
      p.line(12, edge(12) - 1, 11, edge(12) + 4, root).px(12, edge(12), rootL);
      p.line(15, edge(15) - 1, 16, edge(15) + 3, root).line(16, edge(15) + 3, 15, edge(15) + 6, root).px(15, edge(15), rootL);
      p.line(19, edge(19) - 1, 20, edge(19) + 3, root).px(19, edge(19), rootL);
      p.line(6, 10, 4, 14, root).line(4, 14, 5, 18, root).px(6, 10, rootL).px(5, 17, rootL);
      p.line(27, 14, 28, 19, root).px(27, 14, rootL);
      break;
    }
    case 1: {
      // snow on top, icicles round the arch
      lump(p, 2, 2, 13, 6, SNOW, 0.1, 31);
      lump(p, 9, 1, 14, 5, SNOW, 0.1, 32);
      lump(p, 17, 2, 13, 6, SNOW, 0.1, 33);
      lump(p, 1, 13, 8, 4, SNOW, 0.1, 34);
      lump(p, 23, 12, 8, 4, SNOW, 0.1, 35);
      for (const [x, len] of [[10, 3], [12, 5], [14, 2], [16, 4], [18, 3], [20, 5], [22, 2]] as const) {
        const y = edge(x);
        p.rect(x, y, 1, len, '#dff2ff').px(x, y, '#ffffff').px(x, y + len - 1, '#a8d4f0');
      }
      p.px(6, 22, '#ffffff').px(25, 24, '#ffffff').px(4, 31, '#ffffff');
      break;
    }
    case 2: {
      // purple crystals by the opening
      const cr = CRYSTAL[0]!;
      shard(p, 6, 39, 3, 8, -2, cr);
      shard(p, 8, 39, 3, 11, -1, cr);
      shard(p, 4, 39, 2, 5, -2, cr);
      shard(p, 24, 39, 3, 10, 1, cr);
      shard(p, 26, 39, 2, 6, 2, cr);
      shard(p, 22, 39, 2, 6, 1, cr);
      shard(p, 25, 9, 3, 6, 1, cr);
      shard(p, 27, 9, 2, 4, 2, cr);
      p.px(7, 28, '#ffffff').px(24, 29, '#ffffff');
      break;
    }
    case 3: {
      // seaweed, barnacles and a little pirate sign over the opening
      const sw = (x: number, y: number, len: number) => {
        for (let i = 0; i < len; i++) p.px(x + (Math.floor(i / 2) % 2), y + i, i % 3 === 0 ? '#4f9a48' : '#2f6a3a');
      };
      sw(10, edge(10), 5);
      sw(20, edge(20), 6);
      sw(22, edge(22), 3);
      sw(2, 31, 8);
      sw(28, 30, 9);
      sw(5, 33, 6);
      for (const [x, y] of [[4, 20], [27, 22], [7, 9], [24, 7], [2, 26]] as const) p.px(x, y, '#d8dccf').px(x + 1, y, '#9aa096').px(x, y + 1, '#9aa096');
      // the sign: a dark board in a wooden frame, a white skull and crossbones
      p.rect(11, 4, 10, 9, '#8a5a2a').rect(11, 4, 10, 1, '#b07a44').rect(12, 5, 8, 7, '#1e1a18');
      p.tpl(12, 5, ['W......W', '.W.WW.W.', '..WWWW..', '..W.W.W.', '...WWW..', '.W....W.', 'W......W'], { W: '#f4f0e6' });
      p.px(15, 8, '#1e1a18').px(17, 8, '#1e1a18');
      p.rect(15, 13, 1, 2, '#6f4a26').rect(16, 13, 1, 2, '#6f4a26');
      break;
    }
    case 6: {
      // glowing cracks in the basalt, embers inside
      const crack = (pts: [number, number][]) => {
        for (let i = 0; i + 1 < pts.length; i++) p.line(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], '#d8481a');
        for (const [x, y] of pts) p.px(x, y, '#ffb04a');
      };
      crack([[4, 9], [6, 13], [5, 17], [7, 21]]);
      crack([[26, 10], [24, 14], [26, 18], [25, 21]]);
      crack([[14, 2], [16, 5], [15, 8]]);
      crack([[2, 28], [4, 32], [3, 36]]);
      crack([[28, 29], [27, 33], [29, 37]]);
      p.px(16, 33, '#ffd060').px(13, 35, '#ff8a2a').px(19, 34, '#ff8a2a');
      glowOn(p, 16, 39, 11, '#ff7a2a', 0.35);
      break;
    }
    case 7: {
      // moss on the rocks and little glowing mushrooms
      const TEAL_MOSS = pal('#2e4a3a', '#3e6a4e', '#5a8a62', '#7aaa76', '#9cc88e');
      lump(p, 2, 3, 13, 5, TEAL_MOSS, 0.25, 41);
      lump(p, 10, 1, 13, 5, TEAL_MOSS, 0.25, 42);
      lump(p, 18, 3, 12, 5, TEAL_MOSS, 0.25, 43);
      lump(p, 1, 14, 7, 4, TEAL_MOSS, 0.25, 44);
      const shroom = (x: number, y: number, big: boolean) => {
        p.rect(x, y, 1, big ? 3 : 2, '#d8ece4');
        if (big) p.rect(x - 2, y - 2, 5, 2, '#2ab8a8').rect(x - 1, y - 3, 3, 1, '#5af0e0').px(x, y - 2, '#e8fffb').px(x + 1, y - 3, '#bffcf4');
        else p.rect(x - 1, y - 1, 3, 1, '#3ad0c0').px(x, y - 2, '#9af8ec');
      };
      shroom(4, 36, true);
      shroom(7, 37, false);
      shroom(26, 35, true);
      shroom(28, 37, false);
      shroom(24, 14, false);
      shroom(7, 16, false);
      for (const [x, y] of [[11, 26], [21, 30], [3, 27], [29, 24]] as const) p.px(x, y, '#9af8ec');
      break;
    }
    case 9: {
      // icing over the arch, sprinkles and gumdrops on top
      for (let x = 8; x <= 23; x++) {
        const y = edge(x);
        p.px(x, y - 1, '#ffffff').px(x, y - 2, '#ffffff');
        if (x % 3 === 0) p.px(x, y, '#ffffff').px(x, y + 1, '#f4eef6');
      }
      for (const [x, y, col] of [[5, 10, '#ffe14a'], [24, 20, '#4ad0ff'], [9, 24, '#7aff7a'], [27, 31, '#ffe14a'], [4, 30, '#4ad0ff'], [22, 6, '#ff6a4a']] as const) p.px(x, y, col);
      for (const [x, y, col] of [[7, 3, '#e8302a'], [14, 1, '#3ac04a'], [23, 3, '#f5c020']] as const) p.rect(x, y + 1, 4, 2, col).rect(x + 1, y, 2, 1, col).px(x + 1, y + 1, '#ffffff');
      break;
    }
    case 10: {
      // moon rock with craters, a green glow from inside
      for (const [x, y] of [[5, 8], [22, 5], [26, 24], [3, 28], [13, 3]] as const) p.rect(x, y, 3, 1, c.d).px(x - 1, y + 1, c.d).rect(x, y + 1, 3, 1, c.b).px(x + 3, y + 1, c.l).rect(x, y + 2, 3, 1, c.l2);
      glowOn(p, 16, 36, 13, '#5af08a', 0.3);
      shard(p, 10, 39, 2, 5, -1, CRYSTAL[2]!);
      shard(p, 22, 39, 2, 6, 1, CRYSTAL[2]!);
      p.px(15, 31, '#a4ffb8').px(17, 31, '#a4ffb8');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// The jungle temple (64×56 at oy -8): stepped tiers, a stair up to a little shrine, a door at the bottom
// ---------------------------------------------------------------------------

function temple(): Px {
  const c = ROCK[5]!;
  const p = new Px(64, 56);
  const tier = (x0: number, x1: number, yTop: number, yBottom: number, salt: number) =>
    paint(p, x0, yTop, x1 - x0 + 1, yBottom - yTop + 1, (x, y) => {
      const r = y - yTop;
      if (r <= 1) return r === 0 ? c.l2 : c.l; // the step's top
      if (y === yBottom) return c.d2;
      const course = Math.floor((r - 2) / 4);
      const yy = (r - 2) % 4;
      const xx = (x - x0 + (course % 2) * 4) % 8;
      if (yy === 3) return c.d;
      if (xx === 0) return c.d;
      const u = (x - x0) / (x1 - x0);
      if (u > 0.9) return yy === 0 ? c.b : c.d;
      if (u < 0.06) return c.l;
      return yy === 0 ? c.l : grain(x, y, salt) > 0.4 ? c.l : c.b;
    });
  tier(1, 62, 36, 55, 1);
  tier(6, 57, 25, 36, 2);
  tier(12, 51, 15, 25, 3);
  // the shrine on top: roof comb, roof, walls, a dark door
  paint(p, 22, 1, 20, 5, (x, y) => {
    if (y >= 2 && y <= 3 && (x - 22) % 4 === 2) return VOID;
    return y === 1 ? c.l2 : x - 22 > 16 ? c.d : c.b;
  });
  p.rect(18, 5, 28, 4, c.b).rect(18, 5, 28, 1, c.l2).rect(18, 8, 28, 1, c.d2).rect(18, 6, 1, 2, c.l).rect(45, 6, 1, 2, c.d);
  for (let x = 20; x < 44; x += 4) p.rect(x, 6, 2, 2, c.d);
  p.rect(20, 9, 24, 6, c.b).rect(20, 9, 1, 6, c.l).rect(43, 9, 1, 6, c.d).rect(29, 9, 6, 6, VOID).rect(29, 9, 6, 1, c.d2);
  // the stair up the middle, with ramps on either side
  paint(p, 25, 15, 14, 22, (x, y) => {
    if (x === 25 || x === 38) return x === 25 ? c.l : c.d;
    if (x === 26 || x === 37) return c.d2;
    return (y - 15) % 2 === 0 ? c.l : c.d;
  });
  // the door at the bottom: a corbel arch into the dark
  p.rect(22, 38, 20, 3, c.d).rect(22, 38, 20, 1, c.l);
  for (let i = 0; i < 6; i++) p.rect(24 + i * 3, 39, 2, 1, c.d2);
  const doorRows = [
    [29, 34],
    [27, 36],
    [25, 38],
  ] as const;
  doorRows.forEach(([a, b], i) => p.rect(a, 41 + i * 2, b - a + 1, 2, VOID));
  p.rect(25, 47, 14, 9, VOID);
  p.rect(25, 47, 2, 9, '#1c2218').rect(37, 47, 2, 9, '#2c3626').rect(27, 54, 10, 2, '#3a3a34').rect(27, 53, 10, 1, '#2c2c28');
  // carved glyph panels on the tiers
  const glyph = (x: number, y: number) => p.rect(x, y, 6, 5, c.d).rect(x + 1, y + 1, 4, 3, c.b).px(x + 2, y + 2, c.d2).px(x + 3, y + 2, c.l).px(x + 1, y + 1, c.l).rect(x + 4, y + 3, 1, 1, c.d2);
  glyph(6, 43);
  glyph(14, 43);
  glyph(44, 43);
  glyph(52, 43);
  glyph(12, 29);
  glyph(46, 29);
  glyph(17, 18);
  glyph(41, 18);
  // moss on the steps and vines hanging down
  for (const [x, y, w] of [[2, 36, 7], [16, 36, 5], [44, 36, 9], [8, 25, 6], [44, 25, 7], [13, 15, 5], [46, 15, 4], [24, 1, 5], [36, 1, 4], [55, 36, 5]] as const) {
    p.rect(x, y, w, 1, MOSS.l).rect(x + 1, y + 1, w - 2, 1, MOSS.b);
    p.px(x + 1 + (w % 3), y + 2, MOSS.d).px(x + w - 2, y + 2, MOSS.b);
  }
  const vine = (x: number, y: number, len: number) => {
    for (let i = 0; i < len; i++) p.px(x + (i % 4 === 3 ? 1 : 0), y + i, LEAF.d);
    for (let i = 2; i < len; i += 3) p.px(x + (i % 2 ? -1 : 1), y + i, i % 2 ? LEAF.b : LEAF.l);
  };
  vine(4, 37, 12);
  vine(19, 37, 7);
  vine(58, 37, 14);
  vine(48, 37, 6);
  vine(9, 26, 8);
  vine(53, 26, 9);
  vine(15, 16, 7);
  vine(47, 16, 6);
  vine(21, 5, 8);
  vine(43, 5, 6);
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// The pyramid (96×80 at oy -16): courses of sandstone blocks, a golden cap, a doorway at the bottom
// ---------------------------------------------------------------------------

function pyramid(): Px {
  const c = ROCK[4]!;
  const p = new Px(96, 80);
  const courses = 12;
  const ch = 6;
  for (let k = 0; k < courses; k++) {
    const yBottom = 79 - k * ch;
    const yTop = yBottom - ch + 1;
    const hw = Math.round(47 - k * 3.55);
    const x0 = 48 - hw;
    const x1 = 47 + hw;
    const gold = k === courses - 1;
    const cc = gold ? GOLD : c;
    paint(p, x0, yTop, x1 - x0 + 1, ch, (x, y) => {
      const r = y - yTop;
      const u = (x - x0) / (x1 - x0);
      if (r === 0) return u > 0.88 ? cc.l : cc.l2;
      if (r === ch - 1) return cc.d;
      const xx = (x - x0 + (k % 2) * 5) % 10;
      if (xx === 0 && !gold) return cc.d;
      if (u > 0.86) return r === 1 ? cc.b : cc.d;
      if (u < 0.08) return cc.l;
      const g = grain(x, y, 4);
      return r === 1 ? cc.l : g > 0.42 ? cc.l : g < -0.45 ? cc.d : cc.b;
    });
  }
  // the golden tip
  paint(p, 40, 2, 16, 6, (x, y) => {
    const half = (y - 1) * 1.1;
    const u = (x + 0.5 - 48) / Math.max(0.5, half);
    if (Math.abs(u) > 1) return null;
    return u < -0.2 ? GOLD.l2 : u < 0.45 ? GOLD.l : GOLD.b;
  });
  // the doorway: a lintel on two jambs, darkness behind
  p.rect(37, 55, 22, 5, c.l).rect(37, 55, 22, 1, c.l2).rect(37, 59, 22, 1, c.d).rect(58, 56, 1, 3, c.d);
  p.rect(38, 60, 4, 20, c.l).rect(38, 60, 1, 20, c.l2).rect(54, 60, 4, 20, c.b).rect(57, 60, 1, 20, c.d);
  mouthOpening(p, 48, 60, 6, 79, INSIDE[4]!, true);
  // two leaning stones over the lintel, and an eye
  p.line(40, 54, 47, 48, c.d2).line(41, 54, 48, 48, c.l).line(55, 54, 48, 48, c.d2).line(54, 54, 48, 49, c.b);
  p.rect(45, 51, 6, 1, c.d2).px(44, 52, c.d2).px(51, 52, c.d2).rect(45, 53, 6, 1, c.d2).rect(47, 52, 2, 1, '#2a6ad0');
  // hieroglyphs beside the door
  const ankh = (x: number, y: number) => p.rect(x + 1, y, 2, 1, c.d2).px(x, y + 1, c.d2).px(x + 3, y + 1, c.d2).rect(x + 1, y + 2, 2, 1, c.d2).rect(x, y + 3, 4, 1, c.d2).rect(x + 1, y + 4, 2, 3, c.d2);
  const bird = (x: number, y: number) => p.rect(x + 1, y, 2, 2, c.d2).rect(x, y + 2, 4, 2, c.d2).px(x + 3, y + 1, c.d2).rect(x + 1, y + 4, 1, 2, c.d2);
  ankh(30, 63);
  bird(31, 71);
  ankh(62, 63);
  bird(61, 71);
  p.outline(OUTLINE);
  // sand drifted against its foot (after the outline, so it runs into the ground)
  lump(p, -6, 71, 26, 18, SAND, 0.15, 51, 0.6);
  lump(p, 76, 72, 26, 18, SAND, 0.15, 52, 0.6);
  lump(p, 18, 76, 14, 10, SAND, 0.15, 53, 0.6);
  lump(p, 66, 77, 10, 8, SAND, 0.15, 54, 0.6);
  return p;
}

// ---------------------------------------------------------------------------
// The gingerbread house (48×56 at oy -8)
// ---------------------------------------------------------------------------

function gingerbreadHouse(): Px {
  const p = new Px(48, 56);
  const G = pal('#6e3c1c', '#94552a', '#b8703a', '#d08a50', '#e8a868');
  const ICING = '#ffffff';
  const ICING_D = '#e2daea';
  const RED = '#e8302a';
  const gumdrop = (x: number, y: number, col: string) =>
    p.rect(x, y + 1, 4, 2, col).rect(x + 1, y, 2, 1, col).rect(x, y + 2, 4, 1, shade(col, 0.72)).px(x + 1, y, '#ffffff').px(x, y + 1, shade(col, 1.35));
  const mint = (cx: number, cy: number) => {
    p.circle(cx, cy, 2.6, ICING);
    p.px(cx - 1, cy - 2, RED).px(cx + 1, cy - 1, RED).px(cx, cy + 1, RED).px(cx - 2, cy, RED).px(cx + 1, cy + 1, RED).px(cx - 1, cy + 1, ICING_D);
  };
  // a chimney rising behind the roof: candy-striped, iced on top
  paint(p, 33, 3, 6, 11, (x, y) => ((x + y) % 4 < 2 ? RED : x === 38 ? ICING_D : ICING));
  p.rect(32, 1, 8, 3, ICING).rect(32, 3, 8, 1, ICING_D).px(33, 4, ICING).px(37, 4, ICING).px(37, 5, ICING_D);
  // walls of gingerbread
  paint(p, 4, 27, 40, 29, (x, y) => {
    if (x === 4) return G.l;
    if (x === 43) return G.d;
    if (y === 55) return G.d2;
    const g = grain(x, y, 61);
    return g > 0.42 ? G.l : g < -0.44 ? G.d : G.b;
  });
  // the roof: rows of chocolate tiles
  paint(p, 0, 8, 48, 19, (x, y) => {
    const inset = 1 + Math.round(((26 - y) / 18) * 7);
    if (x < inset || x > 47 - inset) return null;
    const row = Math.floor((y - 8) / 4);
    const yy = (y - 8) % 4;
    const xx = (x + (row % 2) * 3) % 6;
    if (yy === 3 || xx === 5) return '#4a2410';
    if (yy === 0 && xx < 3) return '#a8683a';
    return xx < 2 ? '#8a4e26' : '#6e3a1c';
  });
  // thick icing along the ridge, dripping
  paint(p, 7, 5, 34, 8, (x, y) => {
    const bottom = 9 + ((x * 7) % 5 === 0 ? 2 : (x * 3) % 4 === 0 ? 1 : 0);
    if (y > bottom || (y === 5 && (x < 9 || x > 38))) return null;
    return y === bottom || (x > 36 && y > 6) ? ICING_D : ICING;
  });
  gumdrop(9, 2, RED);
  gumdrop(15, 2, '#3ac04a');
  gumdrop(21, 2, '#f5c020');
  gumdrop(27, 2, '#9a4ae0');
  mint(13, 16);
  mint(35, 18);
  mint(24, 13);
  for (const [x, y, col] of [[19, 19, '#4ad0ff'], [29, 21, '#7aff7a'], [8, 21, '#ffe14a'], [40, 22, '#4ad0ff']] as const) p.px(x, y, col);
  // icing along the eave, dripping over the wall
  p.rect(1, 24, 46, 3, ICING).rect(1, 26, 46, 1, ICING_D);
  for (let x = 2; x < 46; x += 4) p.rect(x, 27, 2, 2, ICING).px(x, 29, ICING_D);
  for (let x = 4; x < 45; x += 8) p.rect(x, 27, 1, 4, ICING).px(x, 31, ICING_D);
  // windows: warm light behind icing frames
  for (const wx of [7, 33]) {
    p.rect(wx, 34, 8, 8, '#f5a623').rect(wx + 1, 35, 6, 6, '#ffd45a').rect(wx + 1, 35, 2, 2, '#fff2a0');
    p.rect(wx + 3, 34, 2, 8, ICING).rect(wx, 37, 8, 2, ICING).box(wx - 1, 33, 10, 10, ICING);
    p.rect(wx - 1, 43, 10, 1, ICING_D);
    for (let i = 0; i < 10; i += 3) p.px(wx - 1 + i, 44, ICING);
  }
  // the door: a chocolate bar under an icing arch, a peppermint above it
  paint(p, 18, 38, 12, 18, (x, y) => {
    if (!inArch(x, y, 24, 38, 6)) return null;
    if (!inArch(x, y, 24, 39, 5)) return ICING;
    if ((x - 19) % 5 === 4 || (y - 40) % 5 === 4) return '#3a1c0c';
    return (x - 19) % 5 === 0 || (y - 40) % 5 === 0 ? '#7a4424' : '#5a3018';
  });
  p.rect(26, 47, 2, 2, RED).px(26, 47, '#ff9a9a');
  mint(24, 34);
  // candy canes either side of the door, their hooks bending over it
  for (const [x, dir] of [[16, 1], [30, -1]] as const) {
    for (let y = 38; y < 56; y++) p.px(x, y, y % 4 < 2 ? RED : ICING).px(x + 1, y, (y + 1) % 4 < 2 ? RED : ICING);
    const tip = dir > 0 ? x + 3 : x - 2;
    p.rect(Math.min(x, tip), 36, 4, 2, ICING).px(dir > 0 ? x + 1 : x, 36, RED).px(dir > 0 ? x + 2 : x - 1, 37, RED);
    p.rect(tip, 38, 1, 2, ICING).px(tip, 39, RED);
  }
  // icing piping along the foot of the wall and its corners, gumdrops in the yard
  for (let x = 5; x < 43; x += 2) p.px(x, 53, ICING).px(x + 1, 52, ICING);
  for (let y = 30; y < 52; y += 2) p.px(5, y, ICING).px(42, y + 1, ICING);
  gumdrop(6, 52, '#3ac04a');
  gumdrop(38, 52, '#9a4ae0');
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// The volcano (96×96 at oy -16)
// ---------------------------------------------------------------------------

function volcano(): Px {
  const B = pal('#141014', '#262026', '#3a3238', '#50464e', '#6a5e66'); // basalt
  const p = new Px(96, 96);
  const top = 24;
  const half = (y: number) => Math.min(46.6, 18 + 29 * Math.pow(Math.max(0, y - top) / (95 - top), 1.4) + grain(0, y, 9) * 1.6);
  const gullies = [-0.78, -0.5, -0.2, 0.12, 0.42, 0.7];
  paint(p, 0, top - 4, 96, 100 - top, (x, y) => {
    if (y < top) return null;
    const hw = half(y);
    const dx = (x + 0.5 - 48) / hw;
    if (Math.abs(dx) > 1) return null;
    let v = light(dx * 0.95, -0.4, Math.sqrt(1 - Math.min(0.96, dx * dx))) + 0.22 * grain(x, y, 2);
    for (let i = 0; i < gullies.length; i++) {
      const g = gullies[i]! + 0.03 * Math.sin(y * 0.25 + i * 2);
      const px = (dx - g) * hw;
      if (Math.abs(px) < 0.6 && y > top + 4 + i * 2) v -= 0.4;
      else if (px > -1.8 && px < -0.6 && y > top + 4 + i * 2) v += 0.18;
    }
    if (y > 88) v -= 0.12;
    return tone(B, v);
  });
  // the crater: the rim's top, the inner wall, the lava
  paint(p, 26, 17, 44, 14, (x, y) => {
    const ex = (x + 0.5 - 48) / 21;
    const ey = (y + 0.5 - 24) / 6;
    const r = ex * ex + ey * ey;
    if (r > 1) return null;
    const ix = (x + 0.5 - 48) / 16;
    const iy = (y + 0.5 - 24.5) / 4;
    const ri = ix * ix + iy * iy;
    if (ri <= 1) {
      if (y < 23 && ri > 0.35) return '#2a1414';
      const g = grain(x, y, 21);
      return ri < 0.25 || g > 0.36 ? '#ffd060' : g < -0.38 ? '#c8401a' : '#ff7a1a';
    }
    return y < 24 ? (ex < 0 ? B.l : B.b) : ex < -0.3 ? B.l2 : ex < 0.4 ? B.l : B.b;
  });
  // a lava stream down the front-left slope, into a little pool at the foot
  for (let y = 29; y < 92; y++) {
    const t = (y - 29) / 62;
    const cx = 41 - 19 * t + 2.2 * Math.sin(t * 9);
    const w = 1.2 + 2.6 * t;
    glowOn(p, cx, y, w + 4, '#7a2a1a', 0.18);
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
      const d = Math.abs(x + 0.5 - cx) / w;
      if (d > 1) continue;
      const g = grain(x, y, 22);
      p.px(x, y, d < 0.35 && g > -0.3 ? '#ffe080' : d < 0.75 ? (g > 0.4 ? '#ffb040' : '#ff7a1a') : g > 0.3 ? '#a8300f' : '#d8481a');
    }
  }
  paint(p, 10, 87, 28, 9, (x, y) => {
    const ex = (x + 0.5 - 22) / 11;
    const ey = (y + 0.5 - 92) / 3.5;
    const r = ex * ex + ey * ey;
    if (r > 1) return null;
    const g = grain(x, y, 23);
    return r < 0.3 ? '#ffe080' : r > 0.75 ? '#d8481a' : g > 0.35 ? '#ffb040' : '#ff7a1a';
  });
  // a few glowing cracks near the top
  p.line(58, 31, 61, 37, '#c8401a').px(60, 34, '#ffb04a').line(36, 32, 34, 36, '#c8401a').px(35, 34, '#ffb04a');
  // boulders at the foot
  lump(p, 72, 86, 10, 8, B, 0.3, 24);
  lump(p, 80, 89, 8, 6, B, 0.3, 25);
  lump(p, 4, 88, 7, 6, B, 0.3, 26);
  // a puff of smoke rising from the crater
  const SMOKE = pal('#5e5a64', '#827c88', '#a8a2ae', '#cbc6d0', '#ebe8ee');
  lump(p, 36, 10, 18, 12, SMOKE, 0.12, 27, 0.5);
  lump(p, 46, 4, 17, 13, SMOKE, 0.12, 28, 0.5);
  lump(p, 40, 1, 13, 10, SMOKE, 0.12, 29, 0.5);
  lump(p, 56, 1, 11, 9, SMOKE, 0.12, 30, 0.5);
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// The shipwreck (64×40 at oy -8)
// ---------------------------------------------------------------------------

function shipwreck(): Px {
  const p = new Px(64, 40);
  const W = pal('#2e1c0e', '#4a3018', '#6a4626', '#8a6036', '#a87a48');
  const gun = (x: number) => 18 - 8 * Math.pow((x - 4) / 54, 2);
  const bowX = (y: number) => 58 - 9 * Math.pow(Math.max(0, y - 10) / 22, 1.4);
  // the hull's side: curved planks, a jagged broken stern
  paint(p, 0, 6, 64, 30, (x, y) => {
    const gy = Math.round(gun(x));
    const stern = 4 + Math.abs(Math.round(grain(0, y, 31) * 6));
    if (x < stern || x > bowX(y) || y < gy - 4) return null;
    if (y < gy) {
      // the deck, seen over the near rail
      if (y === gy - 4) return W.d2;
      return (x + y * 3) % 9 === 0 ? W.b : y === gy - 1 ? W.b : W.l;
    }
    const r = y - gy;
    if (r < 2) return r < 1 ? W.l2 : W.l;
    if ((r - 2) % 3 === 2) return W.d2;
    const plank = Math.floor((r - 2) / 3);
    const g = grain(x, y, 32);
    if ((x + plank * 7) % 13 === 0) return W.d2;
    return g > 0.44 ? W.l : g < -0.46 ? W.d : plank % 2 ? W.b : shade(W.b, 0.88);
  });
  // a hole stove in the side
  paint(p, 18, 17, 18, 13, (x, y) => {
    const ex = (x + 0.5 - 27) / 7.5;
    const ey = (y + 0.5 - 23.5) / 5;
    const r = ex * ex + ey * ey + grain(x, y, 33) * 0.5;
    if (r > 1) return null;
    return r > 0.75 ? W.l2 : '#1a100a';
  });
  // portholes
  for (const [x, y] of [[44, 17], [51, 15]] as const) p.circle(x, y, 2, '#c9a32a').rect(x - 1, y - 1, 2, 2, '#2a3a48').px(x - 1, y - 1, '#6a8aa8');
  // the bowsprit
  p.line(56, 9, 62, 5, W.d).line(56, 10, 62, 6, W.b);
  // the broken mast, snapped off at the top, with its yard and a torn sail
  p.line(29, 14, 26, 3, W.l).line(30, 14, 27, 3, W.b).line(31, 14, 28, 3, W.d);
  p.px(26, 2, W.l2).px(27, 1, W.l2).px(28, 2, W.l).px(29, 2, W.b);
  p.line(17, 7, 39, 3, W.d2).line(17, 6, 39, 2, W.b);
  const tear = [0, 2, 1, 3, 1, 0, 2, 4, 1, 0, 2, 1, 3, 0, 1, 2, 0, 3, 1];
  paint(p, 19, 4, 19, 14, (x, y) => {
    const i = x - 19;
    const topY = Math.round(7 - (i * 4) / 20) + 1;
    const bottom = Math.round(16 - (i * 3) / 18) - tear[i]!;
    if (y < topY || y > bottom) return null;
    if ((i === 4 || i === 5) && (y === 10 || y === 11)) return null;
    if (i === 13 && (y === 8 || y === 9)) return null;
    const fold = i % 6;
    return fold === 0 ? '#d2c4a0' : fold === 5 ? '#e4d8bc' : i < 2 ? '#fffaf0' : y === bottom ? '#d2c4a0' : '#efe6cc';
  });
  // ropes from the mast to the bow and the stern
  p.line(29, 4, 56, 8, '#c8b48a').line(26, 4, 12, 11, '#c8b48a');
  // a tattered pirate flag at the stern
  p.rect(9, 3, 1, 13, W.d).px(9, 2, W.l);
  paint(p, 10, 3, 8, 6, (x, y) => (x - 10 < [8, 7, 8, 6, 7, 5][y - 3]! ? '#1e1a1e' : null));
  p.tpl(11, 4, ['.WWW.', 'W.W.W', '.WWW.', '.W.W.'], { W: '#f4f0e6' });
  // sand heaped against the hull, a plank in the sand
  lump(p, 1, 28, 28, 16, SAND, 0.2, 34, 0.6);
  lump(p, 20, 31, 28, 14, SAND, 0.2, 35, 0.6);
  lump(p, 41, 29, 21, 15, SAND, 0.2, 36, 0.6);
  p.rect(8, 35, 11, 2, W.b).rect(8, 35, 11, 1, W.l).px(19, 36, W.d);
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// The space base: rocket (32×64 at oy -16), satellite dish (32×40 at oy -8), Swedish flag (16×28 at oy -12)
// ---------------------------------------------------------------------------

function rocket(): Px {
  const p = new Px(32, 64);
  const W = WHITE_METAL;
  const R = pal('#6e1610', '#a3241c', '#d8392c', '#f0604c', '#ff9a86');
  const round = (c: Pal, u: number) => tone(c, light(u * 0.95, -0.15, Math.sqrt(1 - Math.min(0.96, u * u))));
  // fins (behind the body): swept down to the feet
  const fin = (x: number, y: number, side: number) => {
    const ax = side < 0 ? 10 : 21;
    const t = y - 37;
    if (t < 0 || y > 61) return false;
    const outer = ax + side * Math.min(9, 1 + t * 0.62);
    const lo = Math.min(ax, outer);
    const hi = Math.max(ax, outer);
    if (x + 0.5 < lo || x + 0.5 > hi + 1) return false;
    const lower = 52 + Math.abs(x + 0.5 - ax) * 1.05;
    return y <= lower;
  };
  paint(p, 0, 37, 32, 27, (x, y) => {
    if (fin(x, y, -1)) return fin(x - 1, y, -1) && fin(x, y - 1, -1) ? R.b : R.l;
    if (fin(x, y, 1)) return fin(x + 1, y, 1) && fin(x, y + 1, 1) ? R.d : R.d2;
    return null;
  });
  // the nose and body
  paint(p, 0, 0, 32, 54, (x, y) => {
    let hw: number;
    if (y < 16) hw = 7.5 * Math.pow(Math.max(0, y - 0.5) / 15.5, 0.62);
    else if (y < 46) hw = 7.5;
    else hw = 7.5 - (y - 46) * 0.25;
    const u = (x + 0.5 - 16) / hw;
    if (hw <= 0 || Math.abs(u) > 1) return null;
    if (y < 15) return round(R, u);
    if (y === 15) return R.d;
    if (y >= 32 && y <= 34) return round(R, u);
    if (y >= 47) return round(IRON, u);
    return round(W, u);
  });
  // the nozzle
  paint(p, 9, 53, 14, 6, (x, y) => {
    const hw = 3.5 + (y - 53) * 0.55;
    const u = (x + 0.5 - 16) / hw;
    if (Math.abs(u) > 1) return null;
    if (y === 58) return '#9aa0ac';
    return u < -0.4 ? '#6a6e7a' : '#3a3e48';
  });
  // the round window
  p.circle(16, 25, 5, W.d).circle(16, 25, 4, '#c8ccd6');
  paint(p, 12, 21, 9, 9, (x, y) => {
    const dx = (x + 0.5 - 16) / 3.2;
    const dy = (y + 0.5 - 25) / 3.2;
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return null;
    return dx + dy < -0.9 ? '#e8fbff' : dx + dy < 0 ? '#8ae4ff' : r2 > 0.6 ? '#2a8ac0' : '#4ab8e8';
  });
  // the hatch you climb in by, and its ladder
  p.box(12, 37, 8, 10, W.d).rect(12, 37, 8, 1, W.d).px(12, 37, W.b).px(19, 37, W.b);
  p.circle(16, 40, 1.4, '#4ab8e8').px(15, 39, '#e8fbff').px(18, 43, '#f5d94a');
  p.rect(13, 47, 1, 16, '#9aa0ac').rect(18, 47, 1, 16, '#6a6e7a');
  for (let y = 49; y < 63; y += 3) p.rect(14, y, 4, 1, '#c0c6d2');
  // feet, and blinking lights on the fins
  p.rect(1, 60, 3, 3, IRON.b).rect(1, 60, 3, 1, IRON.l).rect(28, 60, 3, 3, IRON.d).rect(28, 60, 3, 1, IRON.b);
  p.px(3, 57, '#ff5a4a').px(28, 57, '#5aff7a');
  return p.outline(OUTLINE);
}

function satelliteDish(): Px {
  const p = new Px(32, 40);
  const W = WHITE_METAL;
  // the stand: a concrete foot, a post, a motor box
  p.rect(7, 34, 18, 5, '#9a9aa2').rect(7, 34, 18, 1, '#c4c4cc').rect(7, 38, 18, 1, '#6e6e76');
  p.rect(14, 22, 4, 13, '#8a8e9a').rect(14, 22, 1, 13, '#b4b8c4').rect(17, 22, 1, 13, '#5e626c');
  p.rect(11, 26, 10, 6, '#c8ccd6').rect(11, 26, 10, 1, '#eef0f4').rect(20, 27, 1, 5, '#8a8e9a').rect(13, 28, 3, 2, '#5a6070');
  // the dish, tilted up to the sky
  const a = -0.5;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const local = (x: number, y: number, cx: number, cy: number) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return [(dx * ca + dy * sa) / 14, (-dx * sa + dy * ca) / 8] as const;
  };
  paint(p, 0, 0, 32, 30, (x, y) => {
    const [bu, bv] = local(x, y, 16.5, 16);
    if (bu * bu + bv * bv <= 1) {
      const [u, v] = local(x, y, 15, 14);
      const r = u * u + v * v;
      if (r > 1) return W.d2; // the back of the dish, showing below the rim
      if (r > 0.8) return u + v < 0 ? W.l2 : W.l; // the rim
      return u + v * 0.8 < -0.5 ? W.d : u + v * 0.8 < 0.2 ? W.b : W.l; // inside: shaded where it faces away from the light
    }
    return null;
  });
  // the receiver on its arms
  p.line(8, 10, 13, 6, '#5e626c').line(21, 13, 13, 6, '#5e626c').line(15, 17, 13, 7, '#8a8e9a');
  p.rect(11, 4, 4, 3, '#c8ccd6').rect(11, 4, 4, 1, '#ffffff').px(14, 6, '#8a8e9a');
  p.px(12, 3, '#ff5a4a');
  return p.outline(OUTLINE);
}

function flagSE(frame: number): Px {
  const p = new Px(16, 28);
  // the pole on a little stone foot, a gold knob on top
  p.rect(2, 3, 2, 23, '#e2e5ee').rect(3, 3, 1, 23, '#aeb4c4').rect(2, 1, 2, 2, '#f2d35a').px(2, 1, '#fff2a0');
  p.rect(1, 25, 4, 3, '#9a9aa2').rect(1, 25, 4, 1, '#c4c4cc');
  // the flag, waving: blue with a yellow cross (3:2:6 across, 3:2:3 down)
  for (let x = 0; x < 11; x++) {
    const wave = Math.round(Math.sin(x * 0.7 + frame * Math.PI) * 1.1 * Math.min(1, x / 3));
    const slope = Math.cos(x * 0.7 + frame * Math.PI);
    for (let y = 0; y < 8; y++) {
      const yellow = x === 3 || x === 4 || y === 3 || y === 4;
      const c = yellow ? (slope < -0.4 ? '#d8a80c' : slope > 0.6 ? '#ffe860' : '#f5cc1a') : slope < -0.4 ? '#1c4ea0' : slope > 0.6 ? '#3a7ee0' : '#2a64c8';
      p.px(4 + x, 3 + y + wave, c);
    }
  }
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// The UFO crashed on the moon (48×32, 2 frames: its lights blink)
// ---------------------------------------------------------------------------

function ufo(frame: number): Px {
  const p = new Px(48, 32);
  const DUST = pal('#7a7a86', '#9a9aa6', '#bdbdc6', '#d6d6de', '#ececf2');
  const a = -0.24;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cx = 25;
  const cy = 17;
  const loc = (x: number, y: number) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return [dx * ca + dy * sa, -dx * sa + dy * ca] as const;
  };
  // dust thrown up behind it
  lump(p, 1, 17, 20, 12, DUST, 0.2, 61, 0.6);
  paint(p, 0, 0, 48, 32, (x, y) => {
    const [u, v] = loc(x, y);
    // the glass dome
    const du = u / 8.5;
    const dv = (v + 3.5) / 8;
    if (v < -1 && du * du + dv * dv <= 1) {
      if (Math.abs(u - 2.5 + (v + 3.5) * 0.45) < 0.55 && v < -4 && v > -10) return '#ffffff';
      return du + dv < -0.75 ? '#e8fbff' : du < 0.3 ? '#9ae8f8' : '#5ab8d8';
    }
    // the saucer: a lit top, a dark rim band, a shaded underside
    const su = u / 21;
    const sv = v / 6.5;
    if (su * su + sv * sv <= 1) {
      if (v > 0.2 && v < 1.8) return '#58616f';
      if (v <= 0.2) {
        if (Math.abs(su * su + (sv + 0.25) * (sv + 0.25) - 0.55) < 0.07) return '#aab4c4';
        return su < -0.55 ? '#f4f7fb' : su < 0.45 ? '#dde3ec' : '#b4bdcb';
      }
      return su < -0.2 ? '#9aa4b4' : '#76808e';
    }
    // the belly
    const bu = u / 10;
    const bv = (v - 5) / 4;
    if (bv > 0 && bu * bu + bv * bv <= 1) return bu < 0 ? '#6a7484' : '#525c6a';
    return null;
  });
  // lights round the rim, blinking in turn
  for (let i = 0; i < 5; i++) {
    const u = -16 + i * 8;
    const x = Math.round(cx + u * ca - 1);
    const y = Math.round(cy + u * sa - 1);
    const on = (i + frame) % 2 === 0;
    p.rect(x, y, 2, 2, on ? (i === 2 ? '#ff7a6a' : '#fff27a') : '#4a5260').px(x, y, on ? '#ffffff' : '#6a7484');
  }
  // a crack in the glass
  p.line(Math.round(cx + 2), Math.round(cy - 9), Math.round(cx + 4), Math.round(cy - 6), '#3a8aa8').px(Math.round(cx + 5), Math.round(cy - 6), '#3a8aa8');
  // dust heaped in front where it dug in, a few bits knocked off it
  lump(p, 1, 22, 19, 10, DUST, 0.2, 62, 0.6);
  lump(p, 31, 26, 13, 6, DUST, 0.2, 63, 0.6);
  p.rect(22, 28, 3, 2, '#9aa4b4').px(22, 28, '#dde3ec').rect(27, 29, 2, 1, '#76808e');
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// In the caves: crystals, ore, stalagmites, chests, barrels, bones
// ---------------------------------------------------------------------------

function crystalCluster(c: Pal): Px {
  const p = new Px(16, 20);
  // a few stones at its foot, then the shards from the back to the front
  lump(p, 1, 15, 6, 5, GREY_ROCK, 0.12, 71);
  lump(p, 10, 16, 5, 4, GREY_ROCK, 0.12, 72);
  shard(p, 4, 17, 4, 10, -2, c);
  shard(p, 12, 17, 4, 9, 2, c);
  shard(p, 8, 18, 5, 17, 0, c);
  shard(p, 5, 19, 3, 6, -1, c);
  shard(p, 11, 19, 3, 5, 1, c);
  p.px(7, 4, '#ffffff').px(7, 9, c.l2).px(11, 10, '#ffffff');
  return p.outline(OUTLINE);
}

function veinRock(p: Px, salt: number): Px {
  lump(p, 1, 5, 14, 11, GREY_ROCK, 0.12, salt);
  lump(p, 2, 2, 9, 8, GREY_ROCK, 0.12, salt + 1);
  lump(p, 9, 4, 6, 6, GREY_ROCK, 0.12, salt + 2);
  return p;
}

function goldVein(): Px {
  const p = veinRock(new Px(16, 16), 73);
  p.line(3, 7, 6, 9, GOLD.d).line(6, 9, 10, 8, GOLD.d).line(10, 8, 13, 11, GOLD.d).line(6, 10, 5, 13, GOLD.d).line(9, 8, 9, 4, GOLD.d);
  for (const [x, y] of [[3, 6], [8, 7], [11, 10], [4, 11], [8, 3]] as const) p.rect(x, y, 3, 2, GOLD.b).rect(x, y, 2, 1, GOLD.l).px(x, y, GOLD.l2).px(x + 2, y + 1, GOLD.d);
  p.outline(OUTLINE);
  return twinkle(p, 13, 4);
}

function gemVein(): Px {
  const p = veinRock(new Px(16, 16), 74);
  p.tpl(4, 4, ['..1122..', '.112233.', '11122333', '.4445556', '..4556..', '...56...'], {
    '1': '#c8f8ff',
    '2': '#7ae4f8',
    '3': '#30c0e0',
    '4': '#50d0ec',
    '5': '#1a90b8',
    '6': '#0e6a8a',
  });
  p.px(6, 5, '#ffffff');
  p.rect(2, 12, 2, 2, '#30c0e0').px(2, 12, '#a0f0ff').rect(12, 11, 2, 2, '#1a90b8').px(12, 11, '#7ae4f8');
  p.outline(OUTLINE);
  return twinkle(p, 12, 3, '#c8f8ff');
}

function stalagmite(t: number): Px {
  const c = ROCK[t]!;
  const p = new Px(16, 24);
  const candy = (x: number, y: number): Pal => ((y + Math.round(x * 0.6)) % 6 < 2 ? CANDY_WHITE : c);
  const cone = (bx: number, base: number, top: number, hw: number, salt: number) =>
    paint(p, bx - hw - 1, top, hw * 2 + 3, base - top + 1, (x, y) => {
      const k = (y + 0.5 - top) / (base - top + 1);
      const half = hw * Math.pow(k, 0.85);
      const u = (x + 0.5 - bx) / Math.max(0.6, half);
      if (Math.abs(u) > 1) return null;
      const ring = (y + salt) % 5 === 0 ? -0.2 : (y + salt) % 5 === 1 ? 0.08 : 0;
      const pc = t === 9 ? candy(x, y) : c;
      return tone(pc, light(u, -0.3, Math.sqrt(1 - Math.min(0.95, u * u))) + (t === 9 ? 0 : ring) + 0.18 * grain(x, y, salt));
    });
  cone(11.5, 23, 11, 3.6, 3);
  cone(6.5, 23, 1, 5.6, 0);
  lump(p, 1, 20, 5, 4, c, 0.3, 75);
  lump(p, 10, 21, 5, 3, c, 0.3, 76);
  switch (t) {
    case 1:
      p.px(6, 2, '#ffffff').px(5, 6, '#ffffff').px(11, 12, '#ffffff');
      break;
    case 2:
      shard(p, 13, 23, 2, 6, 1, CRYSTAL[0]!);
      p.px(5, 8, CRYSTAL[0]!.l);
      break;
    case 3:
      p.px(4, 15, '#d8dccf').px(8, 18, '#d8dccf').px(12, 17, '#d8dccf');
      break;
    case 6:
      p.line(6, 9, 5, 14, '#c8401a').line(5, 14, 7, 19, '#c8401a').px(5, 13, '#ffb04a').px(6, 2, '#ff8a2a').px(12, 15, '#ffb04a');
      break;
    case 7:
      p.rect(13, 21, 1, 2, '#d8ece4').rect(12, 20, 3, 1, '#3ad0c0').px(13, 19, '#9af8ec').px(3, 12, '#9af8ec');
      break;
    case 8:
      p.line(3, 17, 6, 14, BONE.b).px(2, 17, BONE.l).px(3, 18, BONE.d).px(6, 13, BONE.l).px(7, 14, BONE.d);
      break;
    case 10:
      p.px(5, 7, '#8af0a0').px(7, 15, '#8af0a0').px(12, 18, '#5ac87a');
      break;
  }
  return p.outline(OUTLINE);
}

interface ChestLook {
  wood: Pal;
  band: Pal | null;
  clasp: Pal;
  inside: string;
  insideL: string;
}
const CHESTS: ChestLook[] = [
  { wood: WOODP, band: IRON, clasp: GOLD, inside: '#2a1a0e', insideL: '#4a3018' },
  { wood: GOLD, band: pal('#6a1a1a', '#9a2424', '#c83a3a', '#e86a5a', '#ffa090'), clasp: pal('#1a3a8a', '#2a5ac8', '#4a8af0', '#9ac0ff', '#ffffff'), inside: '#3a2408', insideL: '#6a4614' },
  { wood: pal('#24160c', '#3a2414', '#5a3a22', '#7a5434', '#9a7048'), band: IRON, clasp: GOLD, inside: '#160e08', insideL: '#2a1c10' },
  { wood: pal('#3e74a0', '#5e9cc8', '#9cd0ec', '#d0ecfa', '#f4fbff'), band: pal('#a8c8e0', '#c8e0f0', '#eef8ff', '#ffffff', '#ffffff'), clasp: pal('#5a7a98', '#8aa8c4', '#c0d8ec', '#e8f4ff', '#ffffff'), inside: '#1e3a52', insideL: '#2e5472' },
  { wood: STEEL, band: null, clasp: pal('#1a7a3a', '#2ab858', '#5aff8a', '#a8ffc0', '#ffffff'), inside: '#1a1e26', insideL: '#2a303a' },
  { wood: pal('#963468', '#c4508a', '#f07ab4', '#ffb4d8', '#ffe0f0'), band: pal('#c8b0c0', '#e0d0dc', '#ffffff', '#ffffff', '#ffffff'), clasp: pal('#a87810', '#d8a820', '#ffd84a', '#fff08a', '#ffffff'), inside: '#5a1e3e', insideL: '#7a2e56' },
];

/** The alien chest: a silver capsule with a green light; open, its lid hovers above the empty inside. */
function alienChest(L: ChestLook, open: boolean): Px {
  const w = L.wood;
  const p = new Px(16, 16);
  // the capsule fills rows 4..14 with rounded ends; `lift` raises the part drawn
  const pill = (lo: number, hi: number, lift: number) =>
    paint(p, 1, lo - lift, 14, hi - lo + 1, (x, y) => {
      const yy = y + lift;
      const dx = Math.max(0, Math.abs(x + 0.5 - 8) - 2.5) / 4.6;
      const dy = (yy + 0.5 - 9.5) / 5.5;
      if (dx * dx + dy * dy > 1) return null;
      return tone(w, light(dx * Math.sign(x + 0.5 - 8), dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.25));
    });
  if (open) {
    pill(4, 8, 3);
    pill(9, 14, 0);
    p.rect(3, 9, 10, 1, L.inside).rect(4, 10, 8, 1, L.insideL).px(2, 9, w.d).px(13, 9, w.d);
    p.rect(7, 12, 2, 1, '#2a5a3a');
  } else {
    pill(4, 14, 0);
    p.rect(1, 9, 14, 1, '#4a5466').rect(3, 9, 3, 1, '#5aff8a').rect(10, 9, 3, 1, '#5aff8a');
    p.rect(7, 8, 2, 3, '#5aff8a').px(7, 8, '#e8fff0').px(8, 10, '#2ab858');
    p.px(4, 6, '#ffffff');
  }
  p.outline(OUTLINE);
  if (!open) twinkle(p, 14, 2, '#c8ffd8');
  return p;
}

function lootChest(look: number, open: boolean): Px {
  const L = CHESTS[look]!;
  if (look === 4) return alienChest(L, open);
  const w = L.wood;
  const b = L.band;
  const k = L.clasp;
  const p = new Px(16, 16);
  if (open) {
    // the lid swung back: its inside shows above the box, and the box is empty
    p.rect(2, 1, 12, 1, w.l).rect(2, 2, 12, 3, w.b).rect(2, 2, 1, 3, w.l).rect(13, 2, 1, 3, w.d).rect(3, 3, 10, 1, w.d);
    if (b) p.rect(4, 1, 2, 4, b.d).rect(10, 1, 2, 4, b.d).px(4, 1, b.b).px(10, 1, b.b);
    p.rect(1, 5, 14, 1, w.d).rect(2, 6, 12, 1, L.inside).rect(2, 7, 12, 1, L.insideL).rect(1, 6, 1, 2, w.l).rect(14, 6, 1, 2, w.d);
    p.rect(1, 8, 14, 1, w.l2);
  } else {
    // a rounded lid over a full box, treasure glinting through the seam
    p.rect(3, 3, 10, 1, w.l).rect(2, 4, 12, 1, w.l).rect(1, 5, 14, 3, w.b).rect(1, 5, 1, 3, w.l).rect(14, 5, 1, 3, w.d).rect(3, 4, 6, 1, w.l2);
    p.rect(1, 7, 14, 1, w.d);
    p.rect(1, 8, 14, 1, w.d2).px(4, 8, '#ffd84a').px(5, 8, '#fff6c0').px(10, 8, '#ffe98a').px(11, 8, '#ffd84a');
  }
  // the box
  p.rect(1, 9, 14, 6, w.b).rect(1, 9, 14, 1, w.l).rect(1, 10, 1, 5, w.l).rect(14, 10, 1, 5, w.d).rect(2, 14, 13, 1, w.d).rect(2, 12, 12, 1, w.d);
  if (b) {
    for (const bx of [3, 11]) {
      if (!open) p.rect(bx, 3, 2, 5, b.b).px(bx, 4, b.l).px(bx + 1, 7, b.d);
      p.rect(bx, 9, 2, 6, b.b).px(bx, 9, b.l).px(bx + 1, 14, b.d);
    }
  }
  // the clasp: shut over the seam, or hanging loose
  const claspY = open ? 9 : look === 2 ? 8 : 6;
  if (open) p.rect(7, 9, 2, 3, k.b).px(7, 9, k.l).px(8, 11, k.d);
  else p.rect(7, claspY, 2, 10 - claspY, k.b).px(7, claspY, k.l2).px(8, 9, k.d).px(7, claspY + 2, k.d2);
  // a little something of each look
  if (look === 1) {
    p.px(2, 10, '#ffffff').px(12, 13, GOLD.l2);
    if (!open) p.px(5, 5, '#ffffff');
  } else if (look === 2) {
    // a skull on the lid
    if (!open) p.tpl(6, 3, ['.WWW.', 'WWWWW', 'W.W.W', '.WWW.'], { W: '#f4f0e6' }).px(7, 5, '#1e1a18').px(9, 5, '#1e1a18');
    else p.tpl(6, 2, ['.W.', 'W.W'], { W: '#c8c4b8' });
  } else if (look === 3) {
    if (!open) p.rect(2, 3, 12, 1, '#ffffff').rect(4, 2, 5, 1, '#ffffff').px(3, 8, '#ffffff').px(9, 9, '#e8f6ff').px(13, 9, '#ffffff');
    p.px(4, 15, '#e8f6ff').px(12, 15, '#e8f6ff');
  } else if (look === 5) {
    // a ribbon round the box and a bow on top
    p.rect(7, open ? 9 : 3, 2, open ? 6 : 12, '#ffe066').px(7, open ? 9 : 3, '#fff6c0');
    if (!open) p.rect(4, 1, 3, 2, '#ffe066').rect(9, 1, 3, 2, '#ffe066').px(4, 1, '#fff6c0').px(11, 2, '#d8a820');
    else p.rect(4, 2, 3, 1, '#d8a820').rect(9, 2, 3, 1, '#d8a820');
  }
  p.outline(OUTLINE);
  if (!open) twinkle(p, 14, 2);
  return p;
}

function barrel(): Px {
  const p = new Px(16, 18);
  paint(p, 2, 3, 12, 15, (x, y) => {
    const bulge = 6 - Math.abs(y + 0.5 - 10.5) * 0.08;
    const u = (x + 0.5 - 8) / bulge;
    if (Math.abs(u) > 1) return null;
    if (y === 6 || y === 13) return u < -0.3 ? '#9094a0' : '#5a5e68';
    if ((x - 2) % 3 === 0) return '#5a3a1c';
    return tone(WOODP, light(u, 0, Math.sqrt(1 - Math.min(0.95, u * u))));
  });
  p.ellipse(2, 1, 12, 5, '#6f4a26').ellipse(3, 1, 10, 4, '#c58f55').rect(5, 2, 6, 1, '#d8a868').rect(4, 3, 8, 1, '#a87a48');
  return p.outline(OUTLINE);
}

function bones(): Px {
  const p = new Px(16, 16);
  const bone = (x0: number, y0: number, x1: number, y1: number) => {
    p.line(x0, y0, x1, y1, BONE.b).line(x0, y0 - 1, x1, y1 - 1, BONE.l);
    for (const [x, y] of [[x0, y0], [x1, y1]] as const) p.rect(x - 1, y - 1, 2, 2, BONE.l).px(x - 1, y, BONE.b).px(x, y + 1, BONE.d);
  };
  bone(2, 13, 9, 12);
  bone(2, 7, 6, 10);
  bone(11, 13, 14, 11);
  // a small, round skull with big shiny eyes: friendly, not scary
  paint(p, 6, 2, 9, 9, (x, y) => {
    const dx = (x + 0.5 - 10.5) / 4;
    const dy = (y + 0.5 - 6) / 3.6;
    if (dx * dx + dy * dy > 1) return null;
    return tone(BONE, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
  });
  p.rect(8, 9, 5, 2, BONE.b).rect(8, 9, 5, 1, BONE.l).px(9, 10, BONE.d).px(11, 10, BONE.d);
  p.rect(8, 5, 2, 2, '#3a3026').rect(11, 5, 2, 2, '#3a3026').px(8, 5, '#ffffff').px(11, 5, '#ffffff').px(10, 8, '#8a7c60');
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// Souvenirs: crystal lamp, mushroom lamp, dinosaur skeleton, wisp in a jar, dragon egg
// ---------------------------------------------------------------------------

function crystalLamp(): Px {
  const p = new Px(16, 24);
  const c = CRYSTAL[0]!;
  // a carved stone foot
  p.rect(3, 17, 10, 6, '#8a8692').rect(3, 17, 10, 1, '#c4c0cc').rect(3, 17, 1, 6, '#aaa6b2').rect(12, 18, 1, 5, '#64606c').rect(2, 21, 12, 2, '#76727e').rect(2, 21, 12, 1, '#a8a4b0');
  p.rect(6, 19, 4, 1, '#64606c');
  shard(p, 5, 17, 3, 7, -2, c);
  shard(p, 11, 17, 3, 6, 2, c);
  shard(p, 8, 17, 5, 16, 0, c);
  p.px(7, 4, '#ffffff').px(7, 8, c.l2);
  p.outline(OUTLINE);
  twinkle(p, 13, 4, '#e8d4ff');
  return p.px(2, 9, '#d0a0ff');
}

function mushroomLamp(): Px {
  const p = new Px(16, 24);
  const T = pal('#0e6a64', '#1a9a90', '#2ad0c0', '#7af8e8', '#e8fffb');
  p.ellipse(3, 20, 10, 4, '#6f4a26').ellipse(3, 19, 10, 4, '#9a6a3a').rect(5, 20, 6, 1, '#c58f55');
  p.rect(6, 11, 4, 9, '#dceee6').rect(6, 11, 1, 9, '#ffffff').rect(9, 11, 1, 9, '#a8c4b8');
  paint(p, 1, 2, 14, 11, (x, y) => {
    const dx = (x + 0.5 - 8) / 7;
    const dy = (y + 0.5 - 10) / 8;
    if (dy > 0.25 || dx * dx + dy * dy > 1) return null;
    if (dy > 0.1) return T.d;
    return tone(T, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.4));
  });
  for (const [x, y] of [[4, 6], [9, 4], [11, 8], [6, 9]] as const) p.rect(x, y, 2, 1, T.l2).px(x, y + 1, T.l);
  p.rect(2, 11, 12, 1, '#0a4a46');
  p.outline(OUTLINE);
  return p.px(1, 4, '#9af8ec').px(14, 3, '#9af8ec');
}

function dinoSkeleton(): Px {
  const p = new Px(48, 40);
  // the display stand
  p.rect(3, 32, 42, 2, '#c58f55').rect(3, 32, 42, 1, '#e0b47a').rect(3, 34, 42, 5, '#9a6a3a').rect(3, 38, 42, 1, '#6f4a26').rect(44, 33, 1, 6, '#6f4a26');
  p.rect(20, 35, 8, 3, '#f2d35a').rect(20, 35, 8, 1, '#fff2a0').rect(21, 36, 6, 1, '#b8861a');
  // iron rods holding it up
  p.rect(16, 18, 1, 14, '#5a5c64').rect(32, 20, 1, 12, '#5a5c64');
  // chunky bones (they also have to survive being shrunk to a 16 px inventory icon)
  const B = BONE;
  const bone = (x: number, y: number, w: number, h: number, c: Pal = B) => p.rect(x, y, w, h, c.b).rect(x, y, w, 1, c.l).px(x, y + h - 1, c.b).px(x + w - 1, y + h - 1, c.d);
  const BACK = pal('#6a5e48', '#8a7c60', '#b8aa88', '#d4c8a8', '#e8dcc0');
  // the far leg, in shadow
  bone(34, 20, 3, 3, BACK);
  bone(35, 23, 2, 3, BACK);
  bone(35, 26, 2, 3, BACK);
  bone(34, 29, 2, 2, BACK);
  p.rect(33, 31, 5, 1, BACK.b);
  // tail, spine and neck: vertebrae in a curve
  for (const [x, y, s] of [[34, 17, 3], [37, 18, 3], [40, 19, 3], [43, 21, 2], [45, 22, 2]] as const) bone(x, y, s - (s > 2 ? 1 : 0), s);
  for (let x = 16; x < 34; x += 3) bone(x, 14, 3, 3);
  for (let x = 17; x < 32; x += 3) p.px(x, 13, B.l);
  bone(13, 10, 3, 3);
  bone(14, 12, 2, 2);
  // ribs
  for (let i = 0; i < 5; i++) p.line(18 + i * 3, 17, 17 + i * 3, 23 - Math.abs(i - 2), B.b).px(18 + i * 3, 17, B.l);
  // hips and the near leg
  bone(29, 16, 6, 4);
  bone(29, 20, 3, 3);
  bone(28, 23, 2, 3);
  bone(28, 26, 2, 3);
  bone(29, 29, 2, 2);
  p.rect(27, 31, 5, 1, B.b).px(27, 31, B.l);
  // little arms
  p.line(18, 21, 20, 24, B.b).px(21, 24, B.l);
  // a big round skull with a friendly grin
  paint(p, 2, 3, 14, 11, (x, y) => {
    const dx = (x + 0.5 - 9) / 7;
    const dy = (y + 0.5 - 8) / 5;
    if (dx * dx + dy * dy > 1) return null;
    return tone(B, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.3));
  });
  p.rect(3, 10, 11, 3, B.b).rect(3, 10, 11, 1, B.l).rect(4, 12, 9, 1, B.d);
  p.rect(10, 5, 3, 3, '#3a3026').px(10, 5, '#5a4a38').rect(4, 6, 2, 1, '#3a3026');
  for (let x = 4; x < 13; x += 2) p.px(x, 10, '#ffffff');
  p.line(3, 9, 12, 9, '#6a5a46');
  return p.outline(OUTLINE);
}

function wispJar(): Px {
  const p = new Px(16, 20);
  // the glass, glowing from inside
  paint(p, 2, 6, 12, 14, (x, y) => {
    const u = (x + 0.5 - 8) / 6;
    const v = (y + 0.5 - 13) / 7;
    if (Math.abs(u) > 1 || Math.abs(v) > 1) return null;
    if (Math.abs(u) > 0.84 && Math.abs(v) > 0.82) return null;
    const r = Math.hypot(u * 1.1, v * 0.95);
    if (Math.abs(u) > 0.84 || Math.abs(v) > 0.86) return '#7ad8e8';
    return r < 0.32 ? '#ffffff' : r < 0.55 ? '#c8fbff' : r < 0.8 ? '#7ae8f8' : '#3ab8d8';
  });
  // the wisp's little face
  p.px(7, 12, '#1e5a6a').px(9, 12, '#1e5a6a').px(8, 9, '#ffffff').px(9, 8, '#e8ffff');
  // glass shine
  p.rect(3, 8, 1, 7, '#ffffff').px(4, 16, '#e8fbff').px(12, 8, '#e8fbff');
  // neck, cork and string
  p.rect(4, 4, 8, 2, '#a8e8f4').rect(4, 4, 8, 1, '#e8fbff');
  p.rect(5, 1, 6, 3, '#c8a070').rect(5, 1, 6, 1, '#e0c090').rect(10, 1, 1, 3, '#9a7448');
  p.rect(4, 5, 8, 1, '#c8b48a');
  p.outline(OUTLINE);
  return p.px(1, 10, '#a0f0ff').px(14, 13, '#c8fbff');
}

function dragonEgg(): Px {
  const p = new Px(16, 16);
  const E = pal('#3e1060', '#5a2080', '#8a3ac0', '#b070e8', '#e0c0ff');
  const STRAW = pal('#7a5a20', '#a8822e', '#d0aa48', '#ecd070', '#fff0a8');
  // the back of the nest
  paint(p, 1, 9, 14, 3, (x, y) => (Math.abs(x + 0.5 - 8) < 7 - (11 - y) * 1.5 ? ((x + y) % 3 === 0 ? STRAW.b : STRAW.d) : null));
  // the egg: pointed on top, round below
  paint(p, 2, 1, 12, 14, (x, y) => {
    const v = (y + 0.5 - 9) / (y < 9 ? 8.2 : 6);
    if (Math.abs(v) >= 1) return null;
    const hw = 5.3 * Math.sqrt(1 - v * v);
    const u = (x + 0.5 - 8) / hw;
    if (Math.abs(u) > 1) return null;
    return tone(E, light(u * 0.9, v, Math.sqrt(Math.max(0, 1 - u * u * 0.8 - v * v * 0.6)) + 0.15));
  });
  for (const [x, y, big] of [[5, 5, 1], [9, 8, 1], [6, 10, 1], [9, 3, 0], [4, 8, 0], [11, 6, 0], [11, 11, 0], [7, 2, 0]] as const) {
    if (big) p.rect(x, y, 2, 2, GOLD.b).px(x, y, GOLD.l2).px(x + 1, y + 1, GOLD.d);
    else p.px(x, y, GOLD.l);
  }
  p.px(6, 3, E.l2).px(5, 4, E.l2);
  // the front of the nest, straw sticking out
  paint(p, 1, 11, 14, 5, (x, y) => {
    const dx = (x + 0.5 - 8) / 7.2;
    const dy = (y + 0.5 - 12.5) / 3.5;
    if (dx * dx + dy * dy > 1 || y < 11) return null;
    const s = (x * 2 + y) % 5;
    return y === 11 ? (s < 2 ? STRAW.l2 : STRAW.l) : s === 0 ? STRAW.l : s === 2 ? STRAW.d : y === 15 ? STRAW.d : STRAW.b;
  });
  p.px(1, 11, STRAW.l).px(14, 12, STRAW.b).px(2, 10, STRAW.b).px(13, 10, STRAW.l);
  p.outline(OUTLINE);
  return twinkle(p, 13, 2, '#f0d8ff');
}

// ---------------------------------------------------------------------------

export function drawLandmarks(set: SetArt): void {
  set('cave_mouth', n(11, caveMouth), 0, -8);
  set('temple', [temple()], 0, -8);
  set('pyramid', [pyramid()], 0, -16);
  set('gingerbread_house', [gingerbreadHouse()], 0, -8);
  set('volcano', [volcano()], 0, -16);
  set('shipwreck', [shipwreck()], 0, -8);
  set('rocket', [rocket()], 0, -16);
  set('satellite_dish', [satelliteDish()], 0, -8);
  set('ufo', n(2, ufo), 0, 0, true);
  set('flag_se', n(2, flagSE), 0, -12, true);
  set('crystal', n(4, (i) => crystalCluster(CRYSTAL[i]!)), 0, -4);
  set('gold_vein', [goldVein()]);
  set('gem_vein', [gemVein()]);
  set('stalagmite', n(11, stalagmite), 0, -8);
  set('loot_chest', n(12, (i) => lootChest(Math.floor(i / 2), i % 2 === 1)));
  set('barrel', [barrel()], 0, -2);
  set('bones', [bones()]);
  set('crystal_lamp', [crystalLamp()], 0, -8);
  set('mushroom_lamp', [mushroomLamp()], 0, -8);
  set('dino_skeleton', [dinoSkeleton()], 0, -8);
  set('wisp_jar', [wispJar()], 0, -4);
  set('dragon_egg', [dragonEgg()]);
}
