// Landmarks of the wild maps (Upptäcktsboken): two per wild biome, one on the space base and one on the moon. Each
// stands on a 3×3 footprint (48 px wide; the flower maze, the frost giant's bones and the whale 4×3, 64 px) and rises
// up to 64 px, its foot on the footprint's bottom edge, so it can be picked out from across the map. Light comes from
// the top-left like everywhere else; the ground they stand in is painted after the outline so it runs into the map.
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';
import { type Pal, pal, ramp, glowOn, halo, light, tone, grain, lump, twinkle, flame } from './saga.ts';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

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

/** Colours every pixel of a box that `f` gives a colour; `under` leaves what is already drawn alone (ground, water). */
function fill(p: Px, x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => string | null | undefined, under = false): Px {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(p.w, Math.ceil(x0 + w));
  const yb = Math.min(p.h, Math.ceil(y0 + h));
  if (xb <= xa || yb <= ya) return p;
  const img = p.ctx.getImageData(xa, ya, xb - xa, yb - ya);
  const d = img.data;
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const i = ((y - ya) * (xb - xa) + x - xa) * 4;
      if (under && d[i + 3]) continue;
      const c = f(x, y);
      if (!c) continue;
      const [r, g, b] = rgb(c);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  p.ctx.putImageData(img, xa, ya);
  return p;
}

/** Makes every pixel of a box that `f` picks transparent again. */
function cut(p: Px, x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => boolean): Px {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(p.w, Math.ceil(x0 + w));
  const yb = Math.min(p.h, Math.ceil(y0 + h));
  if (xb <= xa || yb <= ya) return p;
  const img = p.ctx.getImageData(xa, ya, xb - xa, yb - ya);
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) if (f(x, y)) img.data[((y - ya) * (xb - xa) + x - xa) * 4 + 3] = 0;
  p.ctx.putImageData(img, xa, ya);
  return p;
}

/** Draws a part on its own layer and rims it with a contour line, so parts of one colour stay apart. */
function part(p: Px, contour: string, draw: (q: Px) => void): Px {
  const q = new Px(p.w, p.h);
  draw(q);
  q.outline(contour);
  return p.blit(q, 0, 0);
}

/** A flat patch of ground (an oval with a frayed rim), lit a little from the top-left. */
function patch(p: Px, x: number, y: number, w: number, h: number, c: Pal, salt: number, under = false, fray = 0.4): Px {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return fill(
    p,
    x,
    y,
    w + 1,
    h + 1,
    (px, py) => {
      const dx = (px + 0.5 - cx) / (w / 2);
      const dy = (py + 0.5 - cy) / (h / 2);
      const r = dx * dx + dy * dy + grain(px, py, salt) * fray;
      if (r > 1) return null;
      return tone(c, light(dx * 0.6, dy * 0.6, 1.2) + 0.12 + 0.3 * grain(px, py, salt + 1));
    },
    under,
  );
}

/** A box seen from the front and a little above: `top` rows of lit top face, then the front with a dark right edge. */
function block(p: Px, x: number, y: number, w: number, h: number, top: number, c: Pal, salt = 0): Px {
  return fill(p, x, y, w, h, (px, py) => {
    const r = py - y;
    const u = (px - x) / Math.max(1, w - 1);
    if (r < top) return r === 0 ? c.l2 : u > 0.92 ? c.b : c.l;
    if (py === y + h - 1) return c.d2;
    if (u > 0.9) return c.d;
    if (px === x) return c.l;
    const g = grain(px, py, salt);
    return g > 0.42 ? c.l : g < -0.44 ? c.d : c.b;
  });
}

/** A standing stone on (cx, by), w wide and h tall, its rounded top leaning `lean` px. */
function menhir(p: Px, cx: number, by: number, w: number, h: number, c: Pal, salt: number, lean = 0): Px {
  return fill(p, cx - w - 2 - Math.abs(lean), by - h - 1, w * 2 + 4 + Math.abs(lean) * 2, h + 2, (x, y) => {
    const t = (by - y - 0.5) / h;
    if (t < 0 || t > 1) return null;
    const mid = cx + lean * t;
    const cap = t > 0.72 ? Math.sqrt(Math.max(0, 1 - ((t - 0.72) / 0.28) ** 2)) : 1;
    const half = (w / 2) * (1 - t * 0.15) * cap;
    const u = (x + 0.5 - mid) / Math.max(0.5, half);
    if (Math.abs(u) > 1) return null;
    const top = t > 0.72 ? (t - 0.72) / 0.28 : 0;
    return tone(c, light(u, -top * 1.2, Math.sqrt(Math.max(0.1, 1 - u * u))) + 0.12 + 0.35 * grain(x, y, salt) - (t < 0.1 ? 0.25 : 0));
  });
}

/** A rough crag: each row runs from l(y) to r(y); faceted, lit on the left, with ledges across every few rows. */
function crag(p: Px, y0: number, y1: number, l: (y: number) => number, r: (y: number) => number, c: Pal, salt: number, band = 7): Px {
  return fill(p, 0, y0, p.w, y1 - y0 + 1, (x, y) => {
    const a = l(y);
    const b = r(y);
    if (x + 0.5 < a || x + 0.5 > b) return null;
    const u = (x + 0.5 - a) / Math.max(1, b - a);
    const bi = Math.floor((y + Math.round(grain(Math.floor(x / 5), 3, salt) * 4)) / band);
    const ny = y + Math.round(grain(Math.floor(x / 5), 3, salt) * 4) - bi * band;
    const fx = Math.floor((x + bi * 3 + Math.round(grain(bi, 0, salt) * 6)) / 6);
    const facet = grain(fx, bi, salt + 1);
    let v = 0.86 - u * 0.75 + facet * 0.55 + grain(x, y, salt + 3) * 0.22;
    if (ny === 0) v += 0.35;
    if (ny === band - 1) v -= 0.4;
    if (x + 0.5 - a < 1.5) v += 0.25;
    if (b - (x + 0.5) < 1.5) v -= 0.3;
    return tone(c, v);
  });
}

/** A small iron lantern (5×7, top-left at x, y) with a lit pane; its halo comes after the outline. */
function lantern(p: Px, x: number, y: number, glass = '#ffd45a'): Px {
  return p
    .px(x + 2, y, IRON.l)
    .rect(x + 1, y + 1, 3, 1, IRON.b)
    .rect(x, y + 2, 5, 4, IRON.d)
    .rect(x + 1, y + 2, 3, 4, glass)
    .px(x + 2, y + 3, '#fffbe0')
    .px(x + 2, y + 4, '#fff1a0')
    .px(x + 1, y + 2, shade(glass, 1.4))
    .rect(x, y + 6, 5, 1, IRON.b)
    .px(x, y + 6, IRON.l);
}

/** Inside an arch (straight sides, round top), `hw` the half width, `top` its highest row. */
const inArch = (x: number, y: number, cx: number, top: number, hw: number): boolean => {
  const dx = x + 0.5 - cx;
  if (Math.abs(dx) > hw) return false;
  const yc = top + hw;
  return y + 0.5 >= yc || dx * dx + (y + 0.5 - yc) ** 2 <= hw * hw;
};

/** A few blades of grass and a flower or two (after the outline, on the ground). */
function tufts(p: Px, spots: readonly (readonly [number, number])[], g: Pal = MOSS, flowers: readonly string[] = []): Px {
  spots.forEach(([x, y], i) => {
    p.px(x, y, g.d).px(x + 1, y, g.b).px(x + 1, y - 1, g.l).px(x - 1, y - 1, g.b).px(x + 2, y - 2, g.l);
    const f = flowers[i % Math.max(1, flowers.length)];
    if (f && i % 2 === 0) p.px(x + 2, y - 3, f).px(x + 3, y - 2, shade(f, 0.75));
  });
  return p;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const STONE = pal('#33363a', '#4f535a', '#6f747a', '#92979b', '#b6babc');
const MOSS = pal('#24401f', '#365e28', '#4f8231', '#6ea443', '#98c862');
const LEAF = pal('#173a18', '#265a24', '#3a8030', '#5fa842', '#98d468');
const OAK = pal('#24170e', '#3e2a18', '#5a3e24', '#7a5834', '#9c784a');
const WOOD = pal('#3e2614', '#5e3c20', '#86582f', '#b07c48', '#d4a46c');
const GOLD = pal('#8a5a10', '#b8861a', '#e8b830', '#ffe27a', '#fff6c8');
const IRON = pal('#24262c', '#3e4048', '#5e626c', '#8a8e9a', '#bcc0ca');
const SNOW = pal('#9cb4cc', '#c4d8ea', '#e6f0f8', '#f6fbff', '#ffffff');
const ICE = pal('#2c5a86', '#4c82b2', '#84bae0', '#bfe1f5', '#eef9ff');
const SAND = pal('#a8904e', '#c8b06a', '#e3d08f', '#f0e2b0', '#fbf3d8');
const RED_SAND = pal('#8a5a2e', '#b07a42', '#d29a5a', '#e6b87a', '#f4d4a0');
const SANDSTONE = pal('#6a3e22', '#8e5a34', '#b47c4a', '#d29e66', '#eabe88');
const BONE = pal('#8a7c60', '#b8aa88', '#e2d6b8', '#f4ecd8', '#fffaf0');
const WATER = pal('#173a66', '#22568e', '#3478b8', '#6aaedc', '#c4e8fa');
const BOGW = pal('#121c16', '#1c2a20', '#2a3c2c', '#40563e', '#5e7656');
const EARTH = pal('#3a2e1e', '#544430', '#6e5a3e', '#8a7452', '#a8906a');
const BASALT = pal('#121014', '#1f1d23', '#302d35', '#45414c', '#5c5866');
const ASHROCK = pal('#2a2628', '#443e40', '#625a5a', '#857c7a', '#a89e9a');
const JSTONE = pal('#26302a', '#3c4a3e', '#566454', '#74846c', '#98a68a');
const MOON = pal('#4e4e5c', '#6e6e7c', '#92929e', '#b8b8c2', '#dcdce6');
const DUST = pal('#6a6a76', '#8a8a96', '#aaaab4', '#c8c8d0', '#e2e2e8');
const FIRE = { outer: '#e04a14', mid: '#ff9a2a', core: '#fff0a0' };
const WARM = '#ffd45a';
const VOID = '#0c0a0e';

// ---------------------------------------------------------------------------
// skog: Stencirkeln (48×56, oy -8), Jätteeken (48×64, oy -16)
// ---------------------------------------------------------------------------

function stencirkel(): Px {
  const p = new Px(48, 56);
  const c = STONE;
  const cx = 24;
  const cy = 39;
  const stones = ([
    [180, 19, 7, 0],
    [222, 23, 7, 1],
    [262, 30, 9, 0],
    [302, 24, 7, -1],
    [0, 19, 7, 0],
    [140, 16, 7, -1],
    [40, 15, 7, 1],
  ] as const).map(([a, h, w, lean], i) => ({ x: cx + 19 * Math.cos((a * Math.PI) / 180), y: Math.round(cy + 8 * Math.sin((a * Math.PI) / 180)), h, w, lean, i }));
  const stone = (s: (typeof stones)[0]) => {
    menhir(p, s.x, s.y, s.w, s.h, c, 40 + s.i, s.lean);
    const x = Math.round(s.x - s.w / 2);
    // moss creeping up its foot, a lichen spot or two
    p.rect(x, s.y - 2, s.w, 2, MOSS.b).px(x + 1, s.y - 3, MOSS.l).px(x + s.w - 2, s.y - 3, MOSS.d).px(x, s.y - 1, MOSS.l);
    p.px(x + 2, s.y - s.h + 7, '#a8b46a').px(x + 3, s.y - s.h + 7, '#c8cc8a').px(x + s.w - 3, s.y - 9, '#a8b46a');
  };
  for (const s of stones) if (s.y <= 40) stone(s);
  // runes cut into the tallest stone
  const t = stones[2]!;
  const tx = Math.round(t.x) - 1;
  p.tpl(tx - 1, t.y - 24, ['#.#', '##.', '#..', '...', '.#.', '###', '.#.', '...', '#..', '##.', '#.#'], { '#': c.d2 });
  // the altar: a flat slab on its block, a ring of flowers laid on it
  block(p, 15, 32, 18, 9, 3, pal('#3c3e40', '#585c60', '#7a7e82', '#9ea2a4', '#c4c6c6'), 45);
  p.rect(16, 31, 16, 1, '#c4c6c6');
  p.tpl(18, 32, ['.r.y.w.r.y.w.'], { r: '#e8404a', y: '#ffe45a', w: '#ffffff' });
  p.rect(20, 36, 8, 3, '#55595e').rect(21, 37, 6, 1, '#7a7e82').px(23, 36, '#3c3e40').px(24, 38, '#3c3e40');
  for (const s of stones) if (s.y > 40) stone(s);
  p.outline(OUTLINE);
  // the trodden ring of earth inside, and grass round the stones
  patch(p, 2, 28, 44, 22, EARTH, 47, true);
  patch(p, 10, 32, 28, 14, pal('#544430', '#6e5a3e', '#82704e', '#968460', '#a8986e'), 48, true, 0.6);
  tufts(p, [[3, 44], [42, 46], [12, 50], [34, 51], [24, 52]], MOSS, ['#ffffff', '#ffe45a']);
  return p;
}

function jatteek(): Px {
  const p = new Px(48, 64);
  // the crown, behind the trunk
  const crown: [number, number, number, number][] = [
    [3, 4, 18, 16],
    [13, 0, 22, 17],
    [27, 3, 19, 16],
    [0, 12, 16, 15],
    [32, 11, 16, 15],
    [10, 9, 28, 16],
  ];
  crown.forEach(([x, y, w, h], i) => lump(p, x, y, w, h, LEAF, 0.55, 300 + i, 0.3));
  // the trunk: furrowed bark, roots flaring at its foot
  const half = (y: number) => Math.min(22, 8.5 + (y - 18) * 0.09 + Math.max(0, y - 49) ** 2 * 0.07);
  fill(p, 0, 18, 48, 46, (x, y) => {
    const hw = half(y);
    const dx = x + 0.5 - 24;
    const u = dx / hw;
    if (Math.abs(u) > 1) return null;
    // the roots: lobes along the bottom
    if (y > 56 && Math.abs(Math.sin(dx * 0.34 + 0.4)) < (y - 56) / 8) return null;
    const furrow = (x + Math.round(Math.sin(y * 0.45 + x * 0.7) * 1.3)) % 4 === 0;
    const v = light(u, 0, Math.sqrt(Math.max(0, 1 - u * u))) + 0.1 + 0.28 * grain(x, y, 310) - (furrow ? 0.35 : 0);
    return tone(OAK, v);
  });
  // boughs out into the crown
  p.line(16, 25, 7, 20, OAK.b).line(16, 26, 7, 21, OAK.d).line(32, 24, 41, 19, OAK.d).line(32, 25, 41, 20, OAK.d2).line(17, 24, 9, 19, OAK.l);
  // the hollow: dark inside, a lantern glowing in it
  fill(p, 14, 34, 20, 30, (x, y) => {
    if (y > 59) return null;
    if (!inArch(x, y, 24, 36, 6.5)) return inArch(x, y, 24, 35, 7.6) ? (x < 24 ? OAK.l : OAK.d2) : null;
    return y > 56 ? '#2a1a0e' : '#140c06';
  });
  p.line(22, 38, 22, 43, '#6a5a3a');
  lantern(p, 20, 44);
  glowOn(p, 22.5, 47, 7, '#ffb040', 0.35);
  // the crown in front, either side of the trunk
  lump(p, 0, 17, 15, 12, LEAF, 0.55, 320, 0.3);
  lump(p, 33, 16, 15, 12, LEAF, 0.55, 321, 0.3);
  // lanterns hung from the boughs on cords
  p.line(8, 22, 8, 29, '#3a2a1a');
  lantern(p, 6, 29);
  p.line(40, 21, 40, 27, '#3a2a1a');
  lantern(p, 38, 27);
  // moss on the roots, acorns on the ground
  p.rect(9, 59, 5, 1, MOSS.l).rect(33, 58, 5, 1, MOSS.l).rect(10, 60, 3, 1, MOSS.b).rect(34, 59, 4, 1, MOSS.b);
  p.outline(OUTLINE);
  halo(p, 8.5, 33, 7, '#ffd45a', 0.35);
  halo(p, 40.5, 31, 7, '#ffd45a', 0.35);
  for (const [x, y] of [[5, 62], [42, 61]] as const) p.px(x, y, '#8a5a2a').px(x, y - 1, '#5a3a1a');
  tufts(p, [[2, 62], [45, 63], [16, 63]], MOSS, ['#ffffff']);
  return p;
}

// ---------------------------------------------------------------------------
// ang: Vårdkasen (48×64, oy -16, 2 frames: the fire), Blomsterlabyrinten (64×48, oy 0)
// ---------------------------------------------------------------------------

function vardkase(f: number): Px {
  const p = new Px(48, 64);
  const c = pal('#3a3a3e', '#56565c', '#76767a', '#98989a', '#bcbcba');
  // the cairn: rows of rounded stones, the top rows first (the lower ones stand in front)
  const rows: [number, number, number][] = [
    [27, 7, 2],
    [33, 9, 3],
    [40, 12, 3],
    [47, 15, 4],
    [54, 18, 4],
    [61, 21, 5],
  ];
  rows.forEach(([by, hw, count], r) => {
    const w = (hw * 2) / count;
    for (let i = 0; i < count; i++) {
      const x = 24 - hw + i * w + (r % 2 ? -1 : 1);
      lump(p, x - 1, by - 9, w + 2, 10, c, 0.35, 400 + r * 7 + i, 0.3);
    }
  });
  // lichen and moss
  for (const [x, y] of [[13, 52], [30, 45], [21, 38], [36, 57], [17, 59]] as const) p.px(x, y, '#c8c27a').px(x + 1, y, '#a8a860');
  p.rect(5, 59, 4, 1, MOSS.b).rect(38, 60, 5, 1, MOSS.b).rect(15, 46, 3, 1, MOSS.l);
  // the iron fire bowl on three legs
  p.line(17, 26, 15, 30, IRON.d).line(31, 26, 33, 30, IRON.d).rect(23, 25, 2, 5, IRON.b);
  fill(p, 13, 14, 22, 13, (x, y) => {
    const dx = (x + 0.5 - 24) / 11;
    const dy = (y + 0.5 - 18) / 8;
    if (y < 18 || dx * dx + dy * dy > 1) return null;
    if (y === 18) return IRON.l;
    return tone(IRON, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))) + 0.1);
  });
  // glowing coals in the bowl
  p.rect(14, 16, 20, 2, '#7a2210').rect(15, 15, 18, 1, '#d8481a').px(18, 16, '#ffa040').px(25, 16, '#ffa040').px(29, 16, '#ffd060');
  // the fire
  const lean = f ? 2 : -2;
  flame(p, 24, 16, 14, f ? 15 : 13, lean, FIRE.outer, FIRE.mid, FIRE.core);
  flame(p, 18, 16, 7, f ? 7 : 9, lean - 1, FIRE.outer, FIRE.mid, FIRE.core);
  flame(p, 30, 16, 7, f ? 9 : 7, lean + 1, FIRE.outer, FIRE.mid, FIRE.core);
  p.outline(OUTLINE);
  // sparks
  for (const [x, y] of (f ? [[20, 4], [29, 1], [33, 6]] : [[17, 2], [27, 3], [31, 8]]) as [number, number][]) p.px(x, y, '#ffd060');
  halo(p, 24, 10, 12, '#ff9a2a', 0.18);
  tufts(p, [[4, 62], [42, 63], [10, 63], [36, 62], [23, 63]], MOSS, ['#ff6aa0', '#ffe45a', '#ffffff', '#b07aff']);
  return p;
}

function blomsterlabyrint(): Px {
  const p = new Px(64, 48);
  const COLS = 8;
  const ROWS = 5;
  const SX = 7;
  const SY = 8;
  const X0 = 2;
  const Y0 = 1;
  const T = 3;
  const H = Array.from({ length: ROWS + 1 }, () => Array<boolean>(COLS).fill(true));
  const V = Array.from({ length: ROWS }, () => Array<boolean>(COLS + 1).fill(true));
  // carve a maze from the middle out, with fixed random numbers
  let s = 11;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const seen = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const stack: [number, number][] = [[3, 2]];
  seen[2]![3] = true;
  while (stack.length) {
    const [c, r] = stack[stack.length - 1]!;
    const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dc, dr]) => c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS && !seen[r + dr]![c + dc]);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [dc, dr] = opts[Math.floor(rnd() * opts.length) % opts.length]!;
    if (dc === 1) V[r]![c + 1] = false;
    if (dc === -1) V[r]![c] = false;
    if (dr === 1) H[r + 1]![c] = false;
    if (dr === -1) H[r]![c] = false;
    seen[r + dr]![c + dc] = true;
    stack.push([c + dc, r + dr]);
  }
  // the little square in the middle, and the way in at the bottom
  V[2]![4] = false;
  H[ROWS]![3] = false;
  H[ROWS]![4] = true;
  // gravel paths
  fill(p, X0, Y0, COLS * SX + T, ROWS * SY + T + 2, (x, y) => (grain(x, y, 500) > 0.3 ? '#ece0c0' : grain(x, y, 501) > 0.35 ? '#c8b890' : '#dccca6'));
  const FLOWERS = ['#ff6aa0', '#ffe45a', '#ffffff', '#e8404a', '#b07aff'];
  const hedgeTop = (x: number, y: number, x0: number, y0: number) => {
    const h = grain(x, y, 502);
    if (Math.abs(h) > 0.43) return FLOWERS[Math.floor((h + 0.5) * 97) % FLOWERS.length]!;
    if (y === y0) return h > 0 ? LEAF.l2 : LEAF.l;
    return h > 0.15 ? LEAF.l : x === x0 ? LEAF.l : LEAF.b;
  };
  const front = (x: number, y: number, y0: number) => (grain(x, y, 503) > 0.44 ? FLOWERS[(x + y) % FLOWERS.length]! : y === y0 ? LEAF.d : LEAF.d2);
  const walls: [number, number, number, number][] = []; // x, y, w, h of each hedge's top
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c < COLS; c++) if (H[r]![c]) walls.push([X0 + c * SX, Y0 + r * SY, SX + T, T]);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS; c++) if (V[r]![c]) walls.push([X0 + c * SX, Y0 + r * SY, T, SY + T]);
  // fronts first, then the tops (a hedge running down covers the front of the one it meets)
  for (const [x, y, w, h] of walls) fill(p, x, y + h, w, 2, (px, py) => front(px, py, y + h));
  for (const [x, y, w, h] of walls) fill(p, x, y, w, h, (px, py) => hedgeTop(px, py, x, y));
  // a bird bath in the little square
  const bx = X0 + 4 * SX + 1;
  const by = Y0 + 2 * SY + 7;
  p.rect(bx - 1, by - 5, 3, 5, '#c8c8cc').px(bx - 1, by - 5, '#e8e8ec').rect(bx - 4, by - 7, 9, 2, '#e8e8ec').rect(bx - 3, by - 7, 7, 1, '#7ac0e8').rect(bx - 4, by - 5, 9, 1, '#9a9aa0');
  p.rect(bx + 2, by - 9, 2, 2, '#7a5a3a').px(bx + 4, by - 9, '#ffb030').px(bx + 2, by - 9, '#3a2a1a');
  // a rose arch over the way in
  const ax = X0 + 3 * SX;
  const ay = Y0 + ROWS * SY;
  p.rect(ax, ay - 8, 1, 13, WOOD.b).rect(ax + SX + 2, ay - 8, 1, 13, WOOD.d);
  fill(p, ax - 1, ay - 14, SX + 5, 8, (x, y) => {
    const dx = (x + 0.5 - (ax + (SX + 3) / 2)) / ((SX + 4) / 2);
    const dy = (y + 0.5 - (ay - 7)) / 6.5;
    const r = dx * dx + dy * dy;
    if (y > ay - 7 || r > 1 || r < 0.45) return null;
    const g = grain(x, y, 504);
    return g > 0.25 ? '#ff6aa0' : g > 0.05 ? '#ffc0d8' : g < -0.3 ? LEAF.d : LEAF.b;
  });
  p.rect(ax - 1, ay - 7, 3, 2, LEAF.b).rect(ax + SX, ay - 7, 3, 2, LEAF.b).px(ax, ay - 5, '#ff6aa0').px(ax + SX + 2, ay - 4, '#ff6aa0');
  return p.outline(OUTLINE);
}

// ---------------------------------------------------------------------------
// is: Frusna skeppet (48×64, oy -16), Jätteskelettet (64×56, oy -8)
// ---------------------------------------------------------------------------

function frusetskepp(): Px {
  const p = new Px(48, 64);
  const W = pal('#24160c', '#3c2614', '#5a3a1e', '#7a522c', '#9a6c3c');
  const FROST = '#d8ecf8';
  const gun = (x: number) => 32 - 0.2 * (x - 4) - 11 * ((x - 22) / 18) ** 4;
  const water = (x: number) => 46 - 0.22 * (x - 4);
  // the mast and the frozen, furled sail behind the hull
  p.rect(21, 6, 2, 24, W.b).rect(21, 6, 1, 24, W.l).rect(21, 4, 2, 2, FROST);
  p.line(10, 10, 34, 8, W.d).line(10, 9, 34, 7, W.b);
  fill(p, 10, 9, 25, 4, (x, y) => {
    const top = Math.round(10 - ((x - 10) * 2) / 24);
    if (y < top || y > top + 2) return null;
    if (y === top) return '#f4f8fc';
    return Math.floor((x - 10) / 3) % 2 ? '#c8303a' : '#f0e8e0';
  });
  for (const x of [12, 16, 19, 25, 29, 33]) p.line(x, Math.round(12 - ((x - 10) * 2) / 24) + 1, x, Math.round(12 - ((x - 10) * 2) / 24) + 2 + (x % 3), '#bfe1f5');
  p.line(22, 6, 40, 14, '#a8b8c4').line(21, 6, 5, 20, '#a8b8c4');
  // the hull: overlapping strakes, lit along their top edges, rime here and there
  fill(p, 2, 10, 42, 40, (x, y) => {
    const g = gun(x);
    if (x < 3 || x > 41 || y < Math.round(g) || y > water(x)) return null;
    const r = y - Math.round(g);
    if (r === 0) return grain(x, y, 600) > -0.2 ? FROST : W.l2;
    if (r === 1) return W.l;
    const k = (r - 2) % 4;
    if (k === 3) return W.d2;
    if (k === 0) return grain(x, y, 601) > 0.42 ? FROST : x > 36 ? W.b : W.l;
    return x > 36 ? W.d : k === 2 ? W.d : W.b;
  });
  // the stern curling up at the back
  p.line(3, 24, 2, 17, W.b).line(4, 24, 3, 17, W.d).px(3, 16, W.b).px(4, 15, W.b).px(5, 15, W.l).px(6, 16, W.b).px(5, 17, W.d).px(2, 16, FROST);
  // the neck rising from the bow, and the dragon's head looking up
  for (let i = 0; i < 12; i++) {
    const x = 39 + Math.round(Math.sin(i * 0.22) * 2);
    p.rect(x, 19 - i, 3, 1, W.b).px(x, 19 - i, W.l).px(x + 2, 19 - i, W.d);
  }
  p.tpl(37, 0, ['#........', '##.####..', '.#######.', '.##o#####', '.########', '.###...##', '.####.##.', '..###....'], { '#': W.b, o: '#ffd23f' });
  p.rect(39, 1, 4, 1, FROST).px(38, 0, FROST).px(43, 4, W.l).px(45, 3, W.l);
  p.px(42, 7, '#bfe1f5').px(42, 8, '#bfe1f5').px(45, 6, '#bfe1f5');
  // round shields along the rail, rimed over
  const SH = ['#c8303a', '#e8b830', '#3a6ab8', '#c8303a', '#e8b830'];
  [9, 15, 21, 27, 33].forEach((x, i) => {
    const y = Math.round(gun(x)) + 3;
    p.circle(x, y, 2.6, SH[i]!).px(x - 1, y - 1, '#f4f8fc').px(x, y, '#d8d8e0').px(x - 2, y - 1, FROST);
  });
  // icicles under the shields
  for (const x of [7, 12, 18, 24, 30, 36]) p.line(x, Math.round(gun(x)) + 6, x, Math.round(gun(x)) + 7 + (x % 3), '#bfe1f5');
  p.outline('#1e2a3a');
  // the ice it is frozen into: a sheet with cracks, a ridge heaped against the hull
  patch(p, 0, 40, 48, 24, ICE, 602, true, 0.25);
  for (const [x0, y0, x1, y1] of [[6, 53, 14, 57], [14, 57, 13, 61], [30, 59, 38, 56], [38, 56, 44, 58]] as const) p.line(x0, y0, x1, y1, '#4c82b2');
  fill(p, 0, 30, 48, 20, (x, y) => {
    const w = water(x);
    if (x < 1 || x > 44) return null;
    const d = y - w;
    const top = -1 - Math.round((grain(x, 0, 603) + 0.5) * 2.5);
    if (d < top || d > 2) return null;
    return d === top ? '#ffffff' : d < 0 ? '#eef9ff' : '#bfe1f5';
  });
  lump(p, 30, 42, 14, 8, SNOW, 0.2, 604, 0.5);
  lump(p, 2, 45, 14, 8, SNOW, 0.2, 605, 0.5);
  return p;
}

function jatteskelett(): Px {
  const p = new Px(64, 56);
  const hoop = (cx: number, top: number, hw: number, bottom: number, th: number, salt: number) =>
    fill(p, cx - hw - 2, top, hw * 2 + 4, bottom - top + 1, (x, y) => {
      const dx = x + 0.5 - cx;
      const yc = top + hw;
      let d: number;
      let nx: number;
      let ny: number;
      if (y + 0.5 < yc) {
        d = Math.hypot(dx, y + 0.5 - yc);
        nx = dx / d;
        ny = (y + 0.5 - yc) / d;
      } else {
        d = Math.abs(dx);
        nx = Math.sign(dx);
        ny = 0;
      }
      if (d > hw || d < hw - th) return null;
      const s = (d - (hw - th / 2)) / (th / 2);
      return tone(BONE, light(nx * s, ny * s, Math.sqrt(Math.max(0, 1 - s * s))) + 0.15 + 0.2 * grain(x, y, salt));
    });
  // the ribs, smallest (furthest along) first
  hoop(58, 26, 6, 50, 3, 700);
  hoop(51, 19, 8, 50, 3, 701);
  hoop(42, 13, 10, 50, 4, 702);
  hoop(31, 9, 11, 50, 4, 703);
  // snow on top of them
  for (const [x, y, w] of [[54, 25, 6], [46, 18, 8], [35, 12, 10], [24, 8, 11]] as const) p.rect(x, y, w, 2, SNOW.l).rect(x + 1, y - 1, w - 2, 1, '#ffffff');
  // the skull, turned a little towards the ribs
  lump(p, 2, 16, 25, 24, BONE, 0.25, 704, 0.35);
  lump(p, 5, 30, 19, 14, BONE, 0.25, 705, 0.35);
  // brow, sockets with a cold glint, the nose, the teeth
  fill(p, 5, 26, 20, 8, (x, y) => {
    for (const ex of [9.5, 19.5]) {
      const dx = (x + 0.5 - ex) / 3;
      const dy = (y + 0.5 - 30) / 3.3;
      if (dx * dx + dy * dy <= 1) return dy < -0.4 ? '#3a3430' : '#1a1614';
    }
    return null;
  });
  p.px(9, 31, '#8ad8ff').px(19, 31, '#8ad8ff').rect(7, 26, 5, 1, BONE.l2).rect(17, 26, 5, 1, BONE.l2);
  p.tpl(13, 34, ['..#..', '.###.', '##.##'], { '#': '#2a2622' });
  p.rect(7, 39, 16, 1, BONE.d);
  for (let x = 8; x < 22; x += 3) p.rect(x, 40, 2, 3, BONE.l2).px(x + 1, 42, BONE.b);
  p.rect(7, 43, 16, 1, BONE.d);
  // a crack, snow on the crown, icicles from the brow
  p.line(16, 17, 18, 21, BONE.d).line(18, 21, 17, 24, BONE.d);
  lump(p, 8, 14, 13, 6, SNOW, 0.15, 706, 0.6);
  for (const [x, len] of [[30, 4], [44, 3], [53, 2]] as const) p.line(x, x < 26 ? 32 : 46 - (x % 5), x, (x < 26 ? 32 : 46 - (x % 5)) + len, '#bfe1f5');
  p.outline('#2a2e3a');
  // the snow it lies half buried in
  patch(p, -6, 42, 76, 20, SNOW, 707, false, 0.25);
  lump(p, 26, 43, 14, 8, SNOW, 0.15, 708, 0.6);
  lump(p, 44, 45, 12, 7, SNOW, 0.15, 709, 0.6);
  lump(p, 0, 40, 12, 9, SNOW, 0.15, 710, 0.6);
  twinkle(p, 50, 47, '#e8faff');
  return p;
}

// ---------------------------------------------------------------------------
// berg: Dvärgporten (48×64, oy -16), Örnnästet (48×64, oy -16)
// ---------------------------------------------------------------------------

function dvargport(): Px {
  const p = new Px(48, 64);
  const rock = pal('#26262c', '#3a3a42', '#55555e', '#74747e', '#9898a2');
  const dressed = pal('#3a3a44', '#5a5a66', '#7a7a88', '#9c9caa', '#c0c0cc');
  // the mountain's face
  crag(p, 0, 62, (y) => Math.max(0, 12 - y * 0.5) + Math.abs(grain(0, y >> 2, 801)) * 3, (y) => Math.min(48, 36 + y * 0.6) - Math.abs(grain(1, y >> 2, 802)) * 3, rock, 803);
  cut(p, 0, 0, 48, 16, (x, y) => y < 3 + Math.abs(Math.sin(x * 0.35)) * 4 + (x < 10 ? 10 - x : 0) + (x > 38 ? (x - 38) * 1.2 : 0));
  // the door's frame of dressed blocks, its top a gable
  const inDoor = (x: number, y: number, grow: number) => x + 0.5 >= 16 - grow && x + 0.5 <= 32 + grow && y + 0.5 >= 27 - grow - Math.max(0, 8 - Math.abs(x + 0.5 - 24) * 0.9);
  fill(p, 8, 12, 32, 46, (x, y) => {
    if (y > 56 || !inDoor(x, y, 4)) return null;
    if (inDoor(x, y, 0)) {
      // the sealed door: two stone leaves, iron bands
      if (Math.abs(x + 0.5 - 24) < 0.6) return VOID;
      if (y === 36 || y === 48) return x === 16 || x === 24 ? IRON.l : IRON.b;
      if (y === 37 || y === 49) return IRON.d2;
      const u = (x + 0.5 - 24) / 8;
      return tone(pal('#1a1a20', '#2a2a32', '#3a3a44', '#4c4c58', '#62626e'), 0.6 - u * 0.2 * Math.sign(u) - (x < 24 ? -0.1 : 0.2) + grain(x, y, 804) * 0.25);
    }
    const yy = y - 12;
    const row = Math.floor(yy / 4);
    if (yy % 4 === 3) return dressed.d;
    if ((x + row * 3) % 7 === 0) return dressed.d;
    return x < 14 ? dressed.l : x > 34 ? dressed.b : grain(x, y, 805) > 0.35 ? dressed.l : dressed.b;
  });
  // golden runes round the gable and on the leaves, a hammer over the door
  for (let i = 0; i < 8; i++) {
    const x = 14 + i * 2.6;
    const y = 22 - Math.max(0, 8 - Math.abs(x - 24) * 0.9) + 1;
    p.px(Math.round(x), Math.round(y), GOLD.l).px(Math.round(x), Math.round(y) + 1, GOLD.b);
  }
  p.tpl(20, 23, ['#####', '#####', '..#..', '..#..', '..#..'], { '#': GOLD.b });
  p.rect(20, 23, 5, 1, GOLD.l2);
  p.tpl(18, 39, ['#.#', '##.', '#.#', '...', '.#.', '###', '#.#'], { '#': GOLD.b });
  p.tpl(27, 39, ['##.', '#.#', '##.', '...', '#..', '###', '..#'], { '#': GOLD.b });
  p.px(18, 39, GOLD.l2).px(27, 39, GOLD.l2);
  // the steps
  block(p, 10, 55, 28, 4, 2, dressed, 806);
  block(p, 7, 58, 34, 5, 2, dressed, 807);
  // lanterns on iron arms either side
  p.line(6, 30, 10, 30, IRON.b).px(10, 31, IRON.b).rect(5, 29, 2, 3, IRON.d);
  p.line(41, 30, 37, 30, IRON.b).px(37, 31, IRON.b).rect(41, 29, 2, 3, IRON.d);
  lantern(p, 8, 32);
  lantern(p, 35, 32);
  // snow on the ledges up top, a few tufts
  for (const [x, y, w] of [[12, 6, 7], [26, 4, 8], [36, 12, 6], [3, 18, 5]] as const) p.rect(x, y, w, 1, '#f6fbff').rect(x + 1, y + 1, w - 2, 1, '#c4d8ea');
  p.outline(OUTLINE);
  halo(p, 10.5, 35, 8, '#ffd45a', 0.35);
  halo(p, 37.5, 35, 8, '#ffd45a', 0.35);
  for (const [x, y] of [[2, 63], [45, 62], [12, 47], [40, 50]] as const) p.px(x, y, '#76767c').px(x + 1, y, '#55555c');
  return p;
}

function ornnaste(): Px {
  const p = new Px(48, 64);
  const rock = pal('#2a2826', '#43403c', '#625e58', '#86817a', '#aaa49c');
  // the crag, narrowing up to a flat top
  crag(p, 16, 63, (y) => 13 - (y - 16) * 0.24 + Math.abs(grain(2, y >> 2, 811)) * 3, (y) => 35 + (y - 16) * 0.26 - Math.abs(grain(3, y >> 2, 812)) * 3, rock, 813, 6);
  // whitewash down the rock under the nest, grass in its cracks
  for (const [x, len] of [[20, 4], [29, 6], [16, 2]] as const) p.line(x, 22, x, 22 + len, '#e8e4dc').px(x + 1, 22 + len, '#c8c4bc').px(x, 23 + len, '#c8c4bc');
  p.rect(10, 40, 3, 1, MOSS.b).rect(35, 50, 4, 1, MOSS.b).rect(7, 55, 3, 1, MOSS.l);
  // the nest: a bowl of sticks, the dark hollow on top, an egg
  fill(p, 5, 8, 38, 16, (x, y) => {
    const dx = (x + 0.5 - 24) / 18;
    const dy = (y + 0.5 - 16) / 7;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    const ix = (x + 0.5 - 24) / 13;
    const iy = (y + 0.5 - 13.5) / 3.5;
    if (ix * ix + iy * iy <= 1) return iy < 0 ? '#3a2614' : '#2a1a0c';
    const stick = (x * 2 + y * 3 + Math.round(grain(x >> 2, y, 814) * 4)) % 5;
    return stick === 0 ? '#3a2614' : stick === 1 ? '#c8a060' : dy < 0 ? '#9a7040' : '#6e4e2a';
  });
  for (const [x0, y0, x1, y1] of [[4, 14, 9, 16], [38, 12, 44, 10], [6, 19, 2, 21], [40, 19, 45, 21], [14, 22, 11, 25], [33, 22, 36, 25]] as const) p.line(x0, y0, x1, y1, '#8a6436');
  lump(p, 13, 9, 6, 7, pal('#a8a090', '#d0c8b8', '#ece6da', '#f8f4ec', '#ffffff'), 0.1, 815, 0.3);
  p.px(15, 12, '#a89070').px(17, 13, '#a89070');
  // the eagle on the rim, looking out to the left
  p.tpl(25, 0, [
    '....hhh.....',
    '...hHhhh....',
    '..Yehhhhh...',
    '.YYYhhhhb...',
    '.Y..hhbbbb..',
    '....bbwwwbb.',
    '...bbwwWwwbb',
    '...bbwwwWwwb',
    '...bbwWwwWwb',
    '....bbwwwwWb',
    '....bbbwwwwk',
    '.....bbbwwkk',
    '......t.t.kk',
    '.....TT.TT.k',
  ], { h: '#c8963a', H: '#ecc472', e: '#1a1208', Y: '#f0c030', b: '#3e2614', w: '#6a4424', W: '#9a6c3c', k: '#2a180c', t: '#e0b040', T: '#f0c838' });
  p.outline(OUTLINE);
  // a loose feather drifting down, rocks at the foot
  p.line(6, 30, 8, 28, '#6a4424').px(5, 31, '#9a6c3c');
  patch(p, 0, 54, 48, 10, pal('#43403c', '#625e58', '#7a766e', '#8e8a82', '#a49e96'), 816, true, 0.5);
  tufts(p, [[3, 62], [44, 61]], MOSS);
  return p;
}

// ---------------------------------------------------------------------------
// strand: Klocktornet (48×56, oy -8), Valskelettet (64×56, oy -8)
// ---------------------------------------------------------------------------

function klocktorn(): Px {
  const p = new Px(48, 64);
  const c = pal('#5a5248', '#7a7064', '#9c9284', '#bcb2a2', '#dcd4c4');
  const BRONZE = pal('#163430', '#24544a', '#3a7a68', '#62a88c', '#9cd4b8');
  // the belfry: courses of weathered stone, a narrow side in shadow
  fill(p, 12, 28, 26, 32, (x, y) => {
    const side = x >= 34;
    const yy = y - 28;
    const row = Math.floor(yy / 4);
    if (yy % 4 === 3) return side ? c.d2 : c.d;
    if ((x + row * 4) % 8 === 0 && !side) return c.d;
    if (side) return grain(x, y, 900) > 0.3 ? c.b : c.d;
    return x === 12 ? c.l : grain(x, y, 901) > 0.38 ? c.l : grain(x, y, 902) < -0.42 ? c.d : c.b;
  });
  // the arch, dark inside, the green bell hanging in it
  fill(p, 14, 30, 18, 26, (x, y) => {
    if (y > 54) return null;
    if (inArch(x, y, 23, 32, 7)) return y < 36 ? '#0e1218' : '#1a2028';
    return inArch(x, y, 23, 31, 8) ? (x < 23 ? c.l2 : c.d) : null;
  });
  p.rect(16, 37, 14, 1, WOOD.d).rect(22, 37, 2, 2, IRON.b);
  fill(p, 16, 38, 14, 13, (x, y) => {
    const t = (y - 39) / 10;
    if (t < 0 || t > 1) return null;
    const half = 2.5 + t * t * 3.6;
    const u = (x + 0.5 - 23) / half;
    if (Math.abs(u) > 1) return null;
    if (y === 49) return BRONZE.d;
    if (y === 48) return u < -0.3 ? BRONZE.l : BRONZE.b;
    return tone(BRONZE, light(u, -0.3, Math.sqrt(Math.max(0, 1 - u * u))) + 0.15);
  });
  p.rect(22, 50, 2, 2, BRONZE.d2).px(21, 40, BRONZE.l2).px(20, 42, BRONZE.l2);
  // a cornice, then the tall spire of slates, a fish turning in the wind on top
  block(p, 9, 25, 30, 4, 2, c, 906);
  fill(p, 8, 3, 32, 23, (x, y) => {
    const t = (y - 5) / 20;
    if (t < 0 || t > 1) return null;
    const half = 1.5 + t * 13.5;
    const dx = x + 0.5 - 24;
    if (Math.abs(dx) > half) return null;
    if (y === 25) return '#1a2a30';
    if ((y - 5) % 3 === 2) return '#20343c';
    const u = dx / half;
    return u < -0.5 ? '#5a8a90' : u < 0.35 ? '#3e6870' : '#2c4c54';
  });
  p.rect(23, 1, 2, 5, IRON.b).tpl(19, 0, ['.###.#', '######', '.###.#'], { '#': '#c8783a' });
  p.px(20, 1, '#1a1208');
  // barnacles, a starfish, seaweed creeping up out of the sand
  for (const [x, y] of [[13, 52], [15, 49], [34, 53], [35, 47], [28, 56], [13, 44]] as const) p.px(x, y, '#f4ecd8').px(x + 1, y, '#c8bca0');
  p.tpl(30, 41, ['..#..', '#####', '.###.', '#...#'], { '#': '#f08a3a' });
  for (const [x, len] of [[14, 7], [19, 5], [36, 8]] as const) for (let i = 0; i < len; i++) p.px(x + (i % 3 === 1 ? 1 : 0), 58 - i, i % 2 ? '#3a7a3a' : '#2a5a2a');
  p.outline(OUTLINE);
  // the dune it has sunk into
  patch(p, -4, 50, 56, 16, SAND, 903, false, 0.3);
  lump(p, 2, 48, 16, 10, SAND, 0.15, 904, 0.6);
  lump(p, 32, 50, 14, 8, SAND, 0.15, 905, 0.6);
  for (const [x, y] of [[9, 60], [38, 61]] as const) p.px(x, y, '#ffb8c0').px(x + 1, y, '#ffd8dc').px(x, y - 1, '#ffd8dc');
  return p;
}

function valskelett(): Px {
  const p = new Px(64, 56);
  const spineY = (x: number) => 20 + ((x - 38) / 24) ** 2 * 10;
  // the far side's ribs, darker, then the near ones
  const rib = (x0: number, dx: number, c: string, cl: string) => {
    const y0 = Math.round(spineY(x0)) + 3;
    let px = x0;
    let py = y0;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const nx = Math.round(x0 + dx + 5 * Math.sin(t * Math.PI * 0.7));
      const ny = Math.round(y0 + (45 - y0) * t);
      p.line(px, py, nx, ny, c).line(px - 1, py, nx - 1, ny, cl);
      px = nx;
      py = ny;
    }
  };
  for (let x = 28; x <= 50; x += 4) rib(x, -3, BONE.d, BONE.b);
  // the spine: knobbly vertebrae, smaller towards the tail
  for (let x = 24; x < 63; ) {
    const s = x < 46 ? 4 : x < 56 ? 3 : 2;
    const y = Math.round(spineY(x));
    p.rect(x, y - s, s, s + 1, BONE.b).rect(x, y - s, s, 1, BONE.l2).px(x, y, BONE.d).rect(x + s - 1, y - s + 1, 1, s, BONE.d);
    p.rect(x + (s >> 1), y - s - (s > 2 ? 3 : 1), 1, s > 2 ? 3 : 1, BONE.l);
    x += s + 1;
  }
  for (let x = 28; x <= 50; x += 4) rib(x, 0, BONE.b, BONE.l);
  // the skull: a broad head, the long jaws reaching out to the left
  lump(p, 14, 14, 18, 20, BONE, 0.25, 910, 0.35);
  fill(p, 0, 18, 22, 22, (x, y) => {
    const t = x / 20;
    const top = 33 - t * 12;
    const bottom = 37 - t * 3;
    if (y < top || y > bottom) return null;
    const v = (y - top) / Math.max(1, bottom - top);
    return v < 0.25 ? BONE.l2 : v < 0.55 ? BONE.l : v < 0.85 ? BONE.b : BONE.d;
  });
  fill(p, 0, 37, 28, 6, (x, y) => {
    const c = 40 - Math.sin((x / 26) * Math.PI) * 2;
    if (Math.abs(y + 0.5 - c) > 1.3 || x > 26) return null;
    return y + 0.5 < c ? BONE.l : BONE.d;
  });
  p.rect(20, 23, 4, 3, '#2a2420').px(20, 23, '#4a4038').line(3, 35, 18, 30, BONE.d);
  // the flipper's bones by the chest
  for (const [x, y] of [[29, 38], [27, 41], [25, 44], [32, 41], [31, 44]] as const) p.rect(x, y, 2, 2, BONE.l).px(x + 1, y + 1, BONE.d);
  p.outline(OUTLINE);
  // sand drifted over its lower half
  patch(p, -6, 40, 76, 18, SAND, 911, false, 0.3);
  lump(p, 2, 37, 14, 8, SAND, 0.15, 912, 0.6);
  lump(p, 38, 41, 18, 7, SAND, 0.15, 913, 0.6);
  p.tpl(55, 47, ['.#.', '###', '.#.'], { '#': '#f08a3a' });
  p.px(12, 50, '#ffb8c0').px(13, 50, '#ffd8dc');
  return p;
}

// ---------------------------------------------------------------------------
// oken: Oasen (48×64, oy -16), Sandjätten (48×64, oy -16)
// ---------------------------------------------------------------------------

/** A palm: a ringed trunk from (bx, by) bending to (tx, ty), fronds drooping from the top, coconuts. */
function palm(p: Px, bx: number, by: number, tx: number, ty: number, salt: number): void {
  const steps = by - ty;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(bx + (tx - bx) * (t * t));
    const y = by - i;
    const ring = i % 3 === 0;
    p.rect(x - 1, y, 3, 1, ring ? '#6e4a26' : '#a8783e').px(x - 1, y, ring ? '#8a6030' : '#c8945a').px(x + 1, y, '#6e4a26');
  }
  const fronds: [number, number, number][] = [
    [-2.9, 13, 6],
    [-2.3, 12, 3],
    [-0.4, 13, 6],
    [-0.9, 11, 3],
    [-1.6, 9, 1],
    [3.3, 10, 5],
  ];
  fronds.forEach(([a, len, droop], i) => {
    let px = tx;
    let py = ty;
    for (let s = 1; s <= len; s++) {
      const t = s / len;
      const x = Math.round(tx + Math.cos(a) * len * t);
      const y = Math.round(ty + Math.sin(a) * len * t * 0.6 + droop * t * t);
      p.line(px, py, x, y, LEAF.b).line(px, py - 1, x, y - 1, LEAF.l);
      if (s % 2 === 0 && s < len) p.px(x, y + 1, LEAF.d).px(x + (Math.cos(a) > 0 ? -1 : 1), y + 2, LEAF.d);
      px = x;
      py = y;
    }
    void i;
    void salt;
  });
  p.rect(tx - 2, ty + 1, 2, 2, '#5a3a1a').rect(tx + 1, ty + 1, 2, 2, '#6a4422').px(tx - 2, ty + 1, '#8a6030');
}

function oas(): Px {
  const p = new Px(48, 64);
  // the far palm, the tent in front of it, the near palm
  palm(p, 13, 44, 8, 8, 1);
  // a striped tent: its front a triangle, the side in shade, a dark way in
  fill(p, 0, 30, 26, 26, (x, y) => {
    const apexX = 11;
    const t = (y - 32) / 22;
    if (t < 0 || t > 1) return null;
    const half = t * 10;
    const dx = x + 0.5 - apexX;
    if (dx >= -half && dx <= half) {
      const door = Math.abs(dx) < t * 4 && t > 0.45;
      if (door) return t > 0.95 ? '#2a1a10' : '#1a100a';
      if (y === 54) return '#8a2a2a';
      return Math.floor((dx + 12) / 3) % 2 ? '#f4ead8' : '#c8303a';
    }
    if (dx > half && dx < half + 10 - t * 2 && y > 32 + (dx - half) * 0.2) return Math.floor((dx + 12) / 3) % 2 ? '#c8bca8' : '#962428';
    return null;
  });
  p.line(11, 30, 11, 32, WOOD.d).px(11, 29, '#e8b830');
  p.line(1, 54, 0, 57, '#8a6436').line(22, 54, 24, 56, '#8a6436');
  palm(p, 38, 46, 43, 4, 2);
  // the pool: a rim of wet sand and stones, clear water with the sky in it
  fill(p, 14, 42, 34, 22, (x, y) => {
    const dx = (x + 0.5 - 31) / 16;
    const dy = (y + 0.5 - 53) / 9;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (r > 0.72) return dy < 0 ? '#c8a868' : '#a8884c';
    if (r > 0.6 && dy < 0) return WATER.d2;
    const ripple = Math.abs(Math.sin(Math.hypot(dx * 16, dy * 9 * 1.6) * 0.9)) < 0.18;
    if (ripple && r < 0.45) return WATER.l;
    return dx < -0.2 && dy < -0.1 ? WATER.d : r < 0.2 ? WATER.l : WATER.b;
  });
  p.rect(25, 49, 4, 1, WATER.l2).rect(33, 55, 3, 1, WATER.l2);
  for (const [x, y] of [[15, 51], [45, 52], [21, 60], [40, 60]] as const) lump(p, x - 2, y - 2, 4, 3, pal('#5a4a3a', '#7a6650', '#9e8a6a', '#c4ae86', '#e2cea6'), 0.2, x, 0.3);
  // reeds at the water's edge
  for (const [x, h] of [[18, 7], [20, 9], [44, 8], [46, 6]] as const) p.line(x, 50, x, 50 - h, LEAF.b).px(x, 50 - h, '#6a4a2a').px(x, 51 - h, '#6a4a2a');
  p.outline(OUTLINE);
  patch(p, 0, 50, 48, 14, RED_SAND, 920, true, 0.5);
  return p;
}

function sandjatte(): Px {
  const p = new Px(48, 64);
  const c = SANDSTONE;
  // the head: a tall worn dome, the chin lost in the sand
  fill(p, 4, 4, 40, 56, (x, y) => {
    const dx = (x + 0.5 - 24) / 17;
    const top = 6;
    const ty = (y + 0.5 - top) / 14;
    if (y + 0.5 < top + 14 && dx * dx + (1 - ty) ** 2 > 1) return null;
    if (Math.abs(dx) > 1 - Math.max(0, (y - 44) / 40)) return null;
    const ny = y < top + 14 ? -(1 - ty) : 0;
    const stria = (y + Math.round(grain(x >> 3, 0, 930) * 3)) % 5 === 0;
    return tone(c, light(dx, ny, Math.sqrt(Math.max(0.05, 1 - dx * dx - ny * ny))) + 0.18 + 0.22 * grain(x, y, 931) - (stria ? 0.2 : 0));
  });
  // ears, worn round
  lump(p, 3, 24, 6, 13, c, 0.25, 932, 0.3);
  lump(p, 39, 24, 6, 13, c, 0.25, 933, 0.2);
  // a heavy brow, the eyes shut in their hollows
  p.rect(9, 21, 30, 2, c.l).rect(9, 23, 30, 1, c.d);
  for (const ex of [16, 31]) {
    fill(p, ex - 5, 24, 11, 5, (x, y) => {
      const dx = (x + 0.5 - ex) / 5;
      const dy = (y + 0.5 - 26) / 2.4;
      return dx * dx + dy * dy <= 1 ? (dy < 0 ? c.d2 : c.d) : null;
    });
    p.line(ex - 3, 26, ex + 3, 26, c.l).px(ex - 3, 27, c.b);
  }
  // the long nose (the tip worn off), lit on the left with its shadow falling right
  fill(p, 19, 23, 12, 16, (x, y) => {
    const t = (y - 23) / 14;
    if (t < 0 || t > 1) return null;
    const half = 2 + t * 3;
    const dx = x + 0.5 - 24;
    if (dx < -half || dx > half + 2) return null;
    if (dx > half) return c.d2;
    if (y >= 36) return dx < 0 ? c.d : c.d2;
    return dx < -half + 1.5 ? c.l2 : dx < 0 ? c.l : c.b;
  });
  p.px(22, 37, VOID).px(26, 37, VOID);
  // the mouth, closed and stern
  p.rect(15, 42, 18, 1, c.d2).rect(16, 43, 16, 1, c.l).rect(18, 44, 12, 1, c.b).px(15, 41, c.d).px(32, 41, c.d);
  // cracks, and a chip out of the crown
  p.line(28, 8, 26, 13, c.d2).line(26, 13, 28, 17, c.d2).line(12, 33, 10, 38, c.d2);
  p.clear(32, 7, 4, 2).clear(34, 9, 2, 1);
  p.outline(OUTLINE);
  // the dune swallowing its chin, ripples blown into it
  patch(p, -6, 44, 60, 20, RED_SAND, 934, false, 0.25);
  lump(p, -2, 42, 16, 10, RED_SAND, 0.15, 935, 0.6);
  lump(p, 34, 43, 16, 9, RED_SAND, 0.15, 936, 0.6);
  for (const [x, y, w] of [[6, 55, 6], [30, 58, 8], [18, 60, 5]] as const) p.rect(x, y, w, 1, RED_SAND.d).rect(x + 1, y - 1, w - 1, 1, RED_SAND.l);
  return p;
}

// ---------------------------------------------------------------------------
// trask: Mossaltaret (48×56, oy -8, 2 frames: the wisps), Gamla bron (48×52, oy -4)
// ---------------------------------------------------------------------------

function mossaltare(f: number): Px {
  const p = new Px(48, 56);
  const wet = pal('#1c201e', '#2e3430', '#444c46', '#5e665e', '#7c847a');
  // the mound
  lump(p, 4, 36, 40, 18, MOSS, 0.5, 940, 0.4);
  // a dead branch leaning over, grey moss hanging from it
  p.line(40, 50, 42, 30, '#3a3028').line(41, 50, 43, 30, '#2a2018').line(42, 30, 38, 14, '#3a3028').line(43, 30, 39, 14, '#2a2018').line(40, 22, 46, 16, '#3a3028');
  for (const [x, y, len] of [[39, 17, 6], [44, 18, 5], [41, 26, 4]] as const) p.line(x, y, x, y + len, '#8a9a7a').px(x, y + len + 1, '#6a7a5a');
  // the altar: two stones and a slab, wet and dark, a spiral cut into it
  menhir(p, 15, 46, 7, 12, wet, 941);
  menhir(p, 33, 46, 7, 12, wet, 942);
  block(p, 9, 29, 30, 9, 3, wet, 943);
  fill(p, 19, 32, 10, 6, (x, y) => {
    const dx = x + 0.5 - 24;
    const dy = (y + 0.5 - 34.5) * 1.6;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    return Math.abs(((r - a * 0.7 + 20) % 2.2) - 1.1) < 0.4 && r < 4.2 ? '#7cf0d8' : null;
  });
  // moss over the slab's edge, dripping
  p.rect(9, 29, 30, 1, MOSS.l).rect(10, 30, 8, 1, MOSS.b).rect(28, 30, 9, 1, MOSS.b).px(12, 31, MOSS.b).px(30, 31, MOSS.d).px(35, 32, MOSS.d);
  // cattails
  for (const [x, h] of [[5, 14], [7, 10], [44, 11]] as const) p.line(x, 50, x, 50 - h, '#4a6a2a').rect(x, 50 - h + 1, 1, 3, '#6a4020').px(x, 50 - h, '#8a5a30');
  p.outline(OUTLINE);
  // the bog round it
  patch(p, 0, 44, 18, 10, BOGW, 944, true, 0.4);
  patch(p, 30, 46, 18, 9, BOGW, 945, true, 0.4);
  for (const [x, y] of [[6, 49], [37, 50]] as const) p.rect(x, y, 3, 1, '#5a9a3a').px(x + 1, y - 1, '#7aba4a');
  // the three wisps, bobbing
  const wisps: [number, number][] = f ? [[11, 13], [24, 7], [36, 20]] : [[10, 16], [25, 5], [35, 17]];
  for (const [x, y] of wisps) {
    halo(p, x + 0.5, y + 0.5, 6, '#8af0e0', 0.45);
    p.rect(x - 1, y, 3, 1, '#8af0e0').rect(x, y - 1, 1, 3, '#8af0e0').px(x, y, '#ffffff');
    p.px(x + (f ? -1 : 1), y + 2, '#8af0e0').px(x, y + 3, '#5ac8b8');
  }
  return p;
}

function gamlabron(): Px {
  const p = new Px(48, 52);
  const W = pal('#20160e', '#33241a', '#4a3626', '#634c36', '#7e6648');
  const X0 = 15;
  const X1 = 32;
  /** The broken stretch in the middle: no planks there but one hanging askew. */
  const gap = (y: number) => y >= 21 && y <= 28;
  // the side beams and piles under them, down into the bog
  for (const x of [X0 - 1, X1 + 1]) for (let y = 2; y < 50; y++) if (!gap(y) || (x > 24 && y < 24)) p.px(x, y, x < 24 ? W.b : W.d);
  // the walkway of planks running away from you, a few missing
  fill(p, X0, 2, X1 - X0 + 1, 48, (x, y) => {
    if (gap(y)) return null;
    if ((y === 17 || y === 18) && x > 25) return null;
    if ((y === 31 || y === 32) && x < 21) return null;
    const k = (y - 2) % 3;
    if (k === 2) return W.d2;
    const plank = Math.floor((y - 2) / 3);
    const u = (x - X0) / (X1 - X0);
    if (k === 0) return u > 0.85 ? W.b : W.l;
    const g = grain(x >> 2, plank, 952);
    return u > 0.85 ? W.d : g > 0.25 ? W.l : g < -0.3 ? W.d : W.b;
  });
  // broken ends, and one plank hanging down into the water
  for (let x = X0; x <= X1; x += 2) p.px(x, 20, W.l2).px(x + 1, 29, W.d);
  p.line(X0 + 1, 21, X1 - 4, 27, W.l).line(X0 + 1, 22, X1 - 4, 28, W.b).line(X0 + 1, 23, X1 - 4, 29, W.d2);
  // the rail: posts either side, ropes sagging between them, one snapped at the break
  const posts = [4, 13, 33, 44];
  for (const y of posts) for (const x of [X0 - 3, X1 + 2]) p.rect(x, y - 7, 2, 9, x < 24 ? W.l : W.b).px(x, y - 7, W.l2).px(x + 1, y + 1, W.d2);
  const rope = (x: number, y0: number, y1: number, sag: number) => {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / (y1 - y0);
      p.px(Math.round(x + sag * 4 * t * (1 - t)), y - 5, '#c8b080');
    }
  };
  rope(X0 - 3, 4, 13, -1.5);
  rope(X1 + 3, 4, 13, 1.5);
  rope(X0 - 3, 33, 44, -1.5);
  rope(X1 + 3, 33, 44, 1.5);
  p.line(X0 - 3, 8, X0 - 4, 21, '#c8b080').line(X1 + 3, 8, X1 + 4, 15, '#c8b080').line(X1 + 3, 28, X1 + 5, 22, '#c8b080');
  // reeds
  for (const [x, h, y] of [[6, 9, 30], [40, 8, 26], [10, 7, 44], [44, 9, 46]] as const) p.line(x, y, x, y - h, '#4a6a2a').px(x - 1, y - h + 2, '#6a8a3a').rect(x, y - h, 1, 2, '#6a4020');
  p.outline(OUTLINE);
  // the bog water round it, rings where the piles go in, lily pads
  patch(p, -10, 8, 68, 40, BOGW, 950, true, 0.2);
  for (const y of [24, 40]) p.rect(X0 - 4, y, 2, 1, BOGW.l).rect(X1 + 3, y, 2, 1, BOGW.l);
  p.rect(X0 + 3, 30, 6, 1, BOGW.l).rect(X0 + 2, 25, 1, 1, BOGW.l);
  for (const [x, y] of [[5, 18], [38, 34], [9, 38]] as const) p.rect(x, y, 4, 2, '#5a9a3a').px(x + 1, y, '#7aba4a').px(x + 2, y + 1, '#3a6a2a');
  p.px(40, 35, '#f0a0c8');
  return p;
}

// ---------------------------------------------------------------------------
// djungel: Apkungens tron (48×64, oy -16), Vattenfallet (48×64, oy -16, 2 frames)
// ---------------------------------------------------------------------------

function apkungenstron(): Px {
  const p = new Px(48, 64);
  const c = JSTONE;
  // the throne's tall back with its stepped crest and a carved sun
  block(p, 10, 8, 28, 36, 2, c, 960);
  for (const [x, w, y] of [[13, 22, 4], [17, 14, 0]] as const) block(p, x, y, w, 5, 2, c, 961);
  fill(p, 16, 13, 16, 16, (x, y) => {
    const r = Math.hypot(x + 0.5 - 24, y + 0.5 - 21);
    if (r < 4) return r < 2.5 ? c.l : c.b;
    if (r < 5) return c.d2;
    const a = Math.atan2(y + 0.5 - 21, x + 0.5 - 24) / (Math.PI / 6);
    return r < 7.5 && Math.abs(a - Math.round(a)) < 0.22 ? c.d : null;
  });
  // the armrests and the seat
  block(p, 5, 30, 9, 18, 2, c, 962);
  block(p, 34, 30, 9, 18, 2, c, 963);
  p.rect(6, 33, 7, 4, c.d).rect(7, 34, 5, 2, c.l).px(8, 34, VOID).px(10, 34, VOID);
  p.rect(35, 33, 7, 4, c.d).rect(36, 34, 5, 2, c.l).px(37, 34, VOID).px(39, 34, VOID);
  block(p, 12, 38, 24, 10, 3, c, 964);
  // steps up to it
  block(p, 6, 48, 36, 6, 2, c, 965);
  block(p, 2, 54, 44, 8, 2, c, 966);
  // the monkey king: sitting tall, a crown on his head, a banana in his hand
  const FUR = pal('#3a2414', '#5a3a20', '#7a5230', '#9a6c40', '#b88a58');
  const FACE = '#e8c8a0';
  p.line(18, 40, 15, 44, FUR.b).line(15, 44, 16, 47, FUR.b).px(17, 47, FUR.b);
  lump(p, 18, 29, 12, 11, FUR, 0.2, 967, 0.3);
  lump(p, 21, 32, 6, 6, pal('#a8845a', '#c8a478', FACE, '#f4dcc0', '#fff0e0'), 0.1, 968, 0.3);
  lump(p, 18, 17, 12, 11, FUR, 0.2, 969, 0.3);
  p.circle(18, 22, 2, FUR.b).circle(30, 22, 2, FUR.d).px(18, 22, FACE).px(30, 22, '#c8a478');
  p.rect(20, 21, 8, 6, FACE).rect(21, 20, 6, 1, FACE).px(20, 21, FUR.b).px(27, 21, FUR.b);
  p.px(22, 22, VOID).px(25, 22, VOID).px(22, 21, '#ffffff').rect(23, 24, 2, 1, '#a87a5a').rect(22, 26, 4, 1, '#8a5a3a');
  p.tpl(19, 13, ['#..#..#', '#.###.#', '#######', '#r##b##'], { '#': GOLD.b, r: '#e8303a', b: '#3a8ae8' });
  p.rect(19, 13, 1, 1, GOLD.l2).rect(22, 13, 1, 1, GOLD.l2).rect(25, 13, 1, 1, GOLD.l2).rect(19, 15, 7, 1, GOLD.l);
  p.line(29, 32, 32, 28, FUR.b).line(30, 33, 33, 29, FUR.d);
  p.tpl(31, 22, ['...#', '..##', '.##.', '##..', '#...'], { '#': '#ffe04a' });
  p.px(34, 22, '#6a4a1a').px(32, 24, '#fff6a0');
  p.rect(19, 39, 4, 2, FACE).rect(25, 39, 4, 2, FACE);
  // vines hanging over it, leaves on them
  const vine = (x: number, y: number, len: number) => {
    for (let i = 0; i < len; i++) p.px(x + (i % 5 === 4 ? 1 : 0), y + i, LEAF.d);
    for (let i = 2; i < len; i += 3) p.rect(x + (i % 2 ? -2 : 1), y + i, 2, 1, i % 2 ? LEAF.b : LEAF.l);
  };
  vine(11, 9, 22);
  vine(36, 9, 14);
  vine(14, 4, 9);
  vine(33, 4, 18);
  vine(6, 31, 12);
  vine(41, 31, 16);
  for (const [x, y, w] of [[10, 8, 5], [31, 8, 6], [17, 0, 4], [6, 48, 6], [34, 48, 7], [2, 54, 5]] as const) p.rect(x, y, w, 1, MOSS.l).rect(x + 1, y + 1, w - 2, 1, MOSS.b);
  p.outline(OUTLINE);
  tufts(p, [[1, 63], [46, 63]], LEAF, ['#ff4a6a']);
  return p;
}

function vattenfall(f: number): Px {
  const p = new Px(48, 64);
  const c = JSTONE;
  // the cliff, mossy along the top, a notch the water spills through
  crag(p, 3, 50, (y) => 1 + Math.max(0, 8 - y) * 0.5 + Math.abs(grain(4, y >> 2, 970)) * 2, (y) => 47 - Math.max(0, 8 - y) * 0.5 - Math.abs(grain(5, y >> 2, 971)) * 2, c, 972, 8);
  for (let x = 1; x < 47; x++) {
    const y = 3 + Math.round(Math.abs(Math.sin(x * 0.4)) * 2) + (x < 6 || x > 41 ? 2 : 0);
    if (x > 17 && x < 30) continue;
    p.rect(x, y - 1, 1, 2, x % 3 ? MOSS.l : MOSS.b).px(x, y + 1, MOSS.d);
  }
  // the falling water: streaks running down
  fill(p, 17, 2, 14, 48, (x, y) => {
    if (x < 18 || x > 29 || y < 3) return null;
    const edge = x === 18 || x === 29;
    if (edge) return '#3a8ac8';
    const s = (y - f * 4 + (x * 5) % 8 + 16) % 8;
    return s < 1 ? '#ffffff' : s < 3 ? '#c8ecff' : x < 22 ? '#8ad0f4' : '#5aaee4';
  });
  p.rect(18, 2, 12, 2, '#c8ecff').rect(19, 1, 10, 1, '#8ad0f4');
  // the pool and its ring of stones
  fill(p, 2, 42, 44, 22, (x, y) => {
    const dx = (x + 0.5 - 24) / 21;
    const dy = (y + 0.5 - 53) / 9.5;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (dy < 0 && r < 1 && y < 46) return null;
    const ring = Math.abs(Math.sin(Math.hypot(dx * 21, dy * 9.5 * 1.8) * 0.7 - f * 1.5)) < 0.15;
    if (ring && r < 0.8) return WATER.l;
    return r > 0.82 ? WATER.d : dx < -0.3 ? WATER.b : r < 0.3 ? '#4a90cc' : WATER.b;
  });
  for (const [x, y, w, h] of [[2, 52, 7, 6], [7, 58, 8, 5], [36, 56, 8, 6], [41, 50, 6, 6], [16, 60, 6, 4], [28, 61, 7, 3]] as const) lump(p, x, y, w, h, c, 0.3, x * 3 + y, 0.3);
  // foam where it lands
  const foam: [number, number, number][] = f
    ? [[17, 45, 5], [22, 44, 6], [28, 46, 4], [20, 48, 3]]
    : [[16, 46, 4], [21, 45, 5], [27, 44, 5], [25, 48, 3]];
  for (const [x, y, w] of foam) lump(p, x, y, w, 3, pal('#8ac0e0', '#c8e4f4', '#eef8ff', '#ffffff', '#ffffff'), 0.1, x, 0.6);
  // big leaves either side
  for (const [x, y, d] of [[3, 40, -1], [44, 38, 1], [6, 44, -1], [42, 44, 1]] as const) {
    fill(p, x - 6, y - 4, 12, 8, (px, py) => {
      const u = (px + 0.5 - x) * d;
      const v = py + 0.5 - y + u * 0.35;
      if (u < -1 || u > 6 || Math.abs(v) > 2.4 * Math.sin(((u + 1) / 7) * Math.PI)) return null;
      return Math.abs(v) < 0.5 ? LEAF.l2 : v < 0 ? LEAF.l : LEAF.b;
    });
  }
  p.px(9, 41, '#ff4a6a').px(10, 41, '#ff4a6a').px(9, 40, '#ff8aa0').px(39, 37, '#ffb030').px(40, 37, '#ff8a20');
  p.outline(OUTLINE);
  p.px(20, 50 + f, '#ffffff').px(27, 49 - f, '#ffffff');
  return p;
}

// ---------------------------------------------------------------------------
// vulkan: Eldbrunnen (48×64, oy -16, 2 frames: it puffs), Den förstenade jätten (48×64, oy -16)
// ---------------------------------------------------------------------------

function eldbrunn(f: number): Px {
  const p = new Px(48, 64);
  // the crater: a squat cone of basalt, glowing cracks down its sides
  fill(p, 0, 36, 48, 28, (x, y) => {
    const t = (y - 40) / 22;
    if (t < -0.2 || t > 1) return null;
    const half = 12 + Math.max(0, t) * 11;
    const dx = x + 0.5 - 24;
    if (Math.abs(dx) > half) return null;
    if (t < 0) return null;
    const u = dx / half;
    const crack = Math.abs(((x + Math.round(Math.sin(y * 0.6) * 1.5) + 4) % 11) - 5.5) < 0.6 && grain(x, y, 980) > -0.3;
    if (crack && t > 0.15) return t < 0.5 ? '#ff9a2a' : '#d8481a';
    return tone(BASALT, light(u, -0.3, Math.sqrt(Math.max(0, 1 - u * u))) + 0.2 + 0.3 * grain(x, y, 981));
  });
  // the rim and the fire inside it
  fill(p, 10, 35, 28, 10, (x, y) => {
    const dx = (x + 0.5 - 24) / 13;
    const dy = (y + 0.5 - 40) / 4.2;
    const r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (r > 0.62) return dy < 0 ? BASALT.l : BASALT.l2;
    return r < 0.2 ? '#fff0a0' : r < 0.42 ? '#ffb040' : '#e04a14';
  });
  if (f) {
    // the puff: a column of fire rising high, sparks flying
    flame(p, 24, 41, 18, 38, 1, FIRE.outer, FIRE.mid, FIRE.core);
    flame(p, 17, 40, 8, 14, -2, FIRE.outer, FIRE.mid, FIRE.core);
    flame(p, 31, 40, 8, 16, 2, FIRE.outer, FIRE.mid, FIRE.core);
  } else {
    // between puffs: low flames and a curl of smoke
    flame(p, 21, 40, 8, 9, -1, FIRE.outer, FIRE.mid, FIRE.core);
    flame(p, 28, 40, 7, 7, 1, FIRE.outer, FIRE.mid, FIRE.core);
  }
  // rocks round its foot
  for (const [x, y, w, h] of [[2, 56, 8, 6], [38, 55, 8, 7], [12, 59, 6, 4]] as const) lump(p, x, y, w, h, BASALT, 0.3, x + 990, 0.3);
  p.outline(OUTLINE);
  if (f) for (const [x, y] of [[12, 8], [36, 4], [30, 14], [15, 20], [40, 22]] as [number, number][]) p.px(x, y, '#ffd060').px(x, y + 1, '#ff8a2a');
  else {
    // a curl of smoke rising between puffs (no outline: it is only smoke)
    for (const [x, y, w] of [[19, 26, 8], [22, 18, 7], [19, 11, 6], [22, 5, 4]] as const) lump(p, x, y, w, w - 1, pal('#5a5456', '#6e686a', '#86808a', '#9e98a0', '#b4aeb6'), 0.15, x + y, 0.5);
    for (const [x, y] of [[16, 30], [33, 28]] as const) p.px(x, y, '#ffb040');
  }
  halo(p, 24, f ? 24 : 36, f ? 16 : 10, '#ff8a2a', f ? 0.3 : 0.22);
  patch(p, 0, 54, 48, 10, ASHROCK, 991, true, 0.5);
  return p;
}

function forstenadjatte(): Px {
  const p = new Px(48, 64);
  const c = ASHROCK;
  const C = c.d2;
  const L = (x: number, y: number, w: number, h: number, salt: number) => part(p, C, (q) => lump(q, x, y, w, h, c, 0.22, salt, 0.3));
  // the knee down on the ground, the body, the raised knee and its shin
  L(28, 49, 17, 13, 1000);
  L(11, 15, 26, 28, 1001);
  part(p, C, (q) => {
    lump(q, 4, 47, 10, 15, c, 0.22, 1003, 0.3);
    lump(q, 2, 58, 13, 5, c, 0.22, 1013, 0.3);
  });
  L(5, 38, 17, 12, 1002);
  // shoulders and arms reaching down to the hilt
  L(5, 13, 13, 12, 1004);
  L(30, 13, 13, 12, 1005);
  L(4, 21, 9, 14, 1014);
  L(35, 21, 9, 14, 1015);
  L(9, 30, 13, 8, 1006);
  L(26, 30, 13, 8, 1007);
  // the sword planted in front of him
  part(p, C, (q) => {
    q.rect(23, 37, 3, 25, '#8a8a90').rect(23, 37, 1, 25, '#b0b0b6').rect(25, 37, 1, 25, '#5a5a62').px(24, 62, '#5a5a62');
    q.rect(16, 35, 17, 2, '#a0a0a6').rect(16, 36, 17, 1, '#5a5a62').px(16, 35, '#c0c0c6');
  });
  // hands folded on the pommel
  L(17, 28, 8, 8, 1008);
  L(23, 28, 8, 8, 1009);
  // the head, bowed, the beard flowing down over the hands
  part(p, C, (q) => {
    lump(q, 17, 4, 14, 14, c, 0.2, 1010, 0.3);
    fill(q, 16, 14, 16, 16, (x, y) => {
      const t = (y - 14) / 14;
      if (t < 0 || t > 1) return null;
      const half = 7 * (1 - t * 0.75);
      const dx = x + 0.5 - 24;
      if (Math.abs(dx) > half) return null;
      return (x + Math.round(t * 2)) % 3 === 0 ? c.d : dx < 0 ? c.l : c.b;
    });
    q.rect(19, 10, 10, 1, c.d2).rect(20, 12, 3, 1, c.d).rect(25, 12, 3, 1, c.d).rect(23, 11, 2, 4, c.l).px(24, 14, c.d);
    q.rect(20, 14, 2, 1, c.d).rect(26, 14, 2, 1, c.d);
  });
  // cracks, and embers glowing deep in a few of them
  for (const [x0, y0, x1, y1] of [[13, 20, 16, 27], [16, 27, 14, 33], [35, 20, 33, 26], [31, 52, 37, 58], [7, 49, 10, 56], [21, 5, 23, 8]] as const) p.line(x0, y0, x1, y1, c.d2);
  p.px(15, 25, '#ff6a2a').px(34, 23, '#ff6a2a').px(34, 55, '#d8481a');
  // ash settled on his shoulders and head
  p.rect(8, 13, 7, 1, c.l2).rect(33, 13, 6, 1, c.l2).rect(20, 4, 7, 1, c.l2);
  p.outline(OUTLINE);
  for (const [x, y, w, h] of [[0, 58, 6, 5], [42, 59, 6, 4], [16, 60, 5, 3]] as const) lump(p, x, y, w, h, BASALT, 0.3, x + 1011, 0.3);
  patch(p, 0, 55, 48, 9, ASHROCK, 1012, true, 0.5);
  return p;
}

// ---------------------------------------------------------------------------
// svamp: Svampringen (48×56, oy -8, 2 frames: the glow), Lyktträdet (48×64, oy -16)
// ---------------------------------------------------------------------------

/** A giant mushroom on (bx, by): a pale stem h tall and a spotted cap capW wide, its gills glowing. */
function shroom(p: Px, bx: number, by: number, h: number, capW: number, col: string, salt: number): void {
  const c = ramp(col);
  const sw = Math.max(3, Math.round(capW / 3));
  const sx = Math.round(bx - sw / 2);
  p.rect(sx, by - h, sw, h, '#e6dcf0').rect(sx, by - h, 1, h, '#ffffff').rect(sx + sw - 1, by - h, 1, h, '#b0a0c4');
  const capH = Math.round(capW * 0.6);
  const top = by - h - capH + 2;
  fill(p, bx - capW / 2 - 1, top, capW + 2, capH + 1, (x, y) => {
    const dx = (x + 0.5 - bx) / (capW / 2);
    const dy = (y + 0.5 - (top + capH)) / capH;
    if (dy > 0 || dx * dx + dy * dy > 1) return null;
    if (dy > -0.22) return y === top + capH - 1 ? shade(col, 1.6) : c.d;
    const spot = grain(Math.floor((x - bx) / 2), Math.floor(y / 2), salt) > 0.32;
    if (spot) return '#ffffff';
    return tone(c, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))) + 0.15);
  });
}

function svampring(f: number): Px {
  const p = new Px(48, 56);
  const cols = ['#b45ae8', '#3ad0e4', '#f06ab4'];
  const ring = ([
    [190, 10, 13],
    [235, 13, 16],
    [282, 16, 18],
    [325, 12, 15],
    [0, 9, 13],
    [140, 7, 11],
    [45, 7, 11],
  ] as const).map(([a, h, w], i) => ({ x: 24 + 19 * Math.cos((a * Math.PI) / 180), y: Math.round(40 + 9 * Math.sin((a * Math.PI) / 180)), h, w, i }));
  ring.sort((a, b) => a.y - b.y);
  for (const s of ring) shroom(p, s.x, s.y, s.h, s.w, cols[s.i % 3]!, 1020 + s.i);
  p.outline(OUTLINE);
  // the ring of glowing moss on the ground, little spores rising from it
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = Math.round(24 + 15 * Math.cos(a));
    const y = Math.round(41 + 6.5 * Math.sin(a));
    const on = (i + f) % 2 === 0;
    fill(p, x, y, 1, 1, () => (on ? '#b4f6ff' : '#5ad0d8'), true);
  }
  halo(p, 24, 41, 18, f ? '#7ae8f0' : '#b88aff', f ? 0.2 : 0.14);
  const spores: [number, number][] = f ? [[20, 30], [27, 26], [24, 35], [31, 33], [16, 34]] : [[21, 34], [28, 30], [23, 27], [17, 31], [30, 36]];
  for (const [x, y] of spores) p.px(x, y, '#e8fcff').px(x, y + 1, '#7ae8f0');
  twinkle(p, f ? 25 : 22, f ? 20 : 22, '#b4f6ff');
  return p;
}

function lykttrad(): Px {
  const p = new Px(48, 64);
  const B = pal('#1a1020', '#2e1e30', '#46304a', '#644a66', '#86688a');
  const L = pal('#1a2a3a', '#2a4a5a', '#3a7080', '#5aa0a8', '#8ad0d0');
  // leaves behind the branches
  for (const [x, y, w, h] of [[0, 8, 14, 10], [12, 0, 14, 10], [26, 2, 14, 10], [36, 12, 12, 10], [18, 6, 12, 8]] as const) lump(p, x, y, w, h, L, 0.55, 1030 + x, 0.3);
  // the twisted trunk and its branches
  fill(p, 10, 22, 28, 42, (x, y) => {
    const t = (y - 22) / 40;
    const cx = 24 + Math.sin(t * 5) * 2;
    const hw = 3.5 + t * t * 6 + Math.max(0, y - 58) * 1.2;
    const u = (x + 0.5 - cx) / hw;
    if (Math.abs(u) > 1) return null;
    if (y > 59 && Math.abs(Math.sin((x - 24) * 0.5)) < (y - 59) / 5) return null;
    const twist = (x + Math.round(y * 0.5)) % 5 === 0;
    return tone(B, light(u, 0, Math.sqrt(Math.max(0, 1 - u * u))) + 0.1 + 0.25 * grain(x, y, 1035) - (twist ? 0.3 : 0));
  });
  const bough = (pts: [number, number][], w: number) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      for (let k = 0; k < w; k++) p.line(x0, y0 + k, x1, y1 + k, k === 0 ? B.l : k === w - 1 ? B.d2 : B.b);
    }
  };
  bough([[23, 26], [16, 20], [8, 19], [3, 14]], 3);
  bough([[25, 24], [32, 17], [40, 16], [45, 20]], 3);
  bough([[24, 22], [22, 12], [17, 6]], 2);
  bough([[25, 22], [28, 10], [33, 5]], 2);
  bough([[16, 20], [12, 26]], 2);
  bough([[40, 16], [38, 24]], 2);
  // round paper lanterns hung on strings
  const lamps: [number, number, number, string][] = [
    [4, 15, 6, '#ffd45a'],
    [12, 26, 4, '#ffb0d0'],
    [17, 7, 5, '#ffd45a'],
    [33, 6, 7, '#b4f6ff'],
    [39, 24, 4, '#ffd45a'],
    [45, 21, 6, '#ffb0d0'],
  ];
  for (const [x, y, len, col] of lamps) {
    p.line(x, y, x, y + len, '#2a1a20');
    const ly = y + len + 1;
    lump(p, x - 2, ly, 5, 6, pal(shade(col, 0.5), shade(col, 0.75), col, shade(col, 1.4), '#ffffff'), 0.1, x, 0.4);
    p.px(x, ly, '#3a2a30').px(x, ly + 6, '#3a2a30').px(x - 1, ly + 3, shade(col, 0.8)).px(x + 1, ly + 3, shade(col, 0.8));
  }
  p.outline(OUTLINE);
  for (const [x, y, , col] of lamps) halo(p, x + 0.5, y + 10, 6, col, 0.4);
  tufts(p, [[6, 63], [41, 62]], pal('#2a1a3a', '#3a2a5a', '#5a4a8a', '#7a6aaa', '#9a8aca'), ['#3ad0e4']);
  return p;
}

// ---------------------------------------------------------------------------
// dino: Dinoboet (48×52, oy -4), Tjärgropen (48×48, oy 0)
// ---------------------------------------------------------------------------

function dinobo(): Px {
  const p = new Px(48, 52);
  const twig = (x: number, y: number, salt: number) => {
    const s = (x * 2 + y * 3 + Math.round(grain(x >> 2, y, salt) * 4)) % 5;
    return s === 0 ? '#3a2614' : s === 1 ? '#c8a060' : s === 2 ? '#6a8a3a' : y % 2 ? '#8a6436' : '#6e4e2a';
  };
  const ring = (back: boolean) =>
    fill(p, 0, 26, 48, 26, (x, y) => {
      const dx = (x + 0.5 - 24) / 23;
      const dy = (y + 0.5 - 38) / 11;
      const r = dx * dx + dy * dy;
      if (r > 1) return null;
      const ix = (x + 0.5 - 24) / 17;
      const iy = (y + 0.5 - 36) / 6.5;
      const inner = ix * ix + iy * iy <= 1;
      if (inner) return back ? (iy < 0 ? '#3a2614' : '#4a3018') : null;
      if (back !== y + 0.5 < 36) return null;
      return twig(x, y, 1040);
    });
  ring(true);
  // three big speckled eggs and a cracked one, a little one peeking out of it
  const EGG = pal('#b8ae88', '#d8d0b0', '#eee8d2', '#faf6ea', '#ffffff');
  const egg = (x: number, y: number, w: number, h: number, salt: number) =>
    part(p, '#6e6450', (q) => {
      lump(q, x, y, w, h, EGG, 0.04, salt, 0.35);
      for (let i = 0; i < 4; i++) {
        const sx = x + 2 + Math.floor((grain(i, 0, salt) + 0.5) * (w - 5));
        const sy = y + 3 + Math.floor((grain(i, 1, salt) + 0.5) * (h - 8));
        q.rect(sx, sy, 2, 1, i % 2 ? '#7a9a5a' : '#a8885a').px(sx, sy + 1, i % 2 ? '#5a7a4a' : '#8a6a3a');
      }
    });
  egg(4, 18, 13, 17, 1041);
  egg(31, 17, 13, 17, 1042);
  part(p, '#6e6450', (q) => {
    lump(q, 17, 14, 14, 20, EGG, 0.04, 1047, 0.35);
    q.rect(19, 27, 2, 1, '#a8885a').rect(27, 25, 2, 1, '#7a9a5a').rect(22, 31, 2, 1, '#7a9a5a');
    // the top broken off along a jagged crack
    cut(q, 17, 12, 15, 10, (x, y) => y < 20 + Math.round(Math.abs(((x - 17) % 4) - 2) * 0.9));
    q.rect(19, 18, 10, 4, '#4aa04a').rect(20, 17, 7, 1, '#6ac05a').px(22, 19, VOID).px(22, 18, '#ffffff').px(26, 20, '#2a6a2a').px(27, 20, '#2a6a2a');
    for (let x = 18; x < 31; x++) q.px(x, 20 + Math.round(Math.abs(((x - 17) % 4) - 2) * 0.9), '#c8c0a0');
    q.line(22, 24, 24, 27, '#8a8270').line(24, 27, 23, 30, '#8a8270');
  });
  egg(10, 25, 12, 14, 1043);
  ring(false);
  // ferns sticking out of the rim
  for (const [x, y, d] of [[3, 36, -1], [44, 34, 1], [10, 46, -1], [38, 46, 1]] as const) for (let i = 0; i < 6; i++) p.px(x + d * i, y - Math.round(i * 0.6), LEAF.b).px(x + d * i, y - Math.round(i * 0.6) - 1, i % 2 ? LEAF.l : LEAF.d);
  p.outline(OUTLINE);
  // a bit of shell on the ground
  p.rect(40, 49, 3, 2, '#eee8d2').px(40, 49, '#ffffff');
  return p;
}

function tjargrop(): Px {
  const p = new Px(48, 48);
  // horsetails behind
  for (const [x, h] of [[6, 14], [9, 18], [40, 16], [44, 12], [26, 9]] as const) for (let i = 0; i < h; i++) p.px(x, 18 - i, i % 3 === 0 ? '#2a4a1a' : '#5a8a2a').px(x + (i % 2 ? 1 : -1), 18 - i, i % 3 === 0 ? '#6a9a3a' : '#4a7a2a');
  // the muddy rim and the tar: black, a purple sheen, bubbles
  fill(p, 0, 10, 48, 38, (x, y) => {
    const dx = (x + 0.5 - 24) / 23;
    const dy = (y + 0.5 - 30) / 16;
    const r = dx * dx + dy * dy + grain(x >> 1, y >> 1, 1050) * 0.12;
    if (r > 1) return null;
    if (r > 0.74) return tone(pal('#2a2016', '#3e3020', '#56442e', '#6e5a3e', '#8a7454'), light(dx, dy, 0.5) + 0.2 + grain(x, y, 1051) * 0.3);
    const sheen = Math.sin(x * 0.35 + y * 0.9) > 0.85 && dx < 0.3;
    if (sheen) return dy < 0 ? '#5a4a76' : '#3a3050';
    return r > 0.62 && dy < 0 ? '#08060a' : '#141018';
  });
  for (const [x, y, r] of [[30, 38, 2], [14, 34, 1.5], [38, 30, 1.5], [21, 40, 1]] as const) p.circle(x, y, r, '#221c2c').px(Math.round(x - r / 2), Math.round(y - r / 2), '#8a7aa8');
  // ribs curving up out of it on the left
  for (const [x0, h, s] of [[6, 20, 0], [11, 23, 1], [16, 19, 2]] as const)
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const x = Math.round(x0 + Math.sin(t * 2.2) * 6);
      const y = 37 - s - i;
      p.rect(x, y, 2, 1, BONE.l).px(x + 2, y, BONE.d).px(x - 1, y, BONE.d2);
    }
  // a big toothy skull half sunk on the right, its snout dipping into the tar
  part(p, '#3a3226', (q) => {
    fill(q, 22, 14, 26, 20, (x, y) => {
      const u = (x + 0.5 - 22) / 24;
      if (u < 0 || u > 1) return null;
      const top = 25 - Math.sin(u * Math.PI * 0.9) * 9 + u * 2;
      const bottom = 30 + u * 1;
      if (y + 0.5 < top || y + 0.5 > bottom) return null;
      const v = (y + 0.5 - top) / (bottom - top);
      return v < 0.2 ? BONE.l2 : v < 0.55 ? BONE.l : v < 0.85 ? BONE.b : BONE.d;
    });
    q.circle(36, 21, 2.2, '#2a2420').ellipse(26, 22, 5, 3, '#2a2420').px(35, 20, '#5a4a40');
    for (let x = 23; x < 44; x += 2) q.rect(x, 30, 1, 2, '#fffaf0').px(x, 32, '#c8bca0');
  });
  tarOverJaw(p);
  p.outline(OUTLINE);
  for (const [x, y] of [[4, 44], [42, 44]] as const) p.px(x, y, LEAF.b).px(x + 1, y - 1, LEAF.l).px(x - 1, y - 1, LEAF.d);
  return p;
}

/** Tar lapping over the skull's jaw (so it sits in the pit, not on it). */
function tarOverJaw(p: Px): void {
  fill(p, 20, 31, 28, 4, (x, y) => (x < 22 || x > 45 ? null : y === 31 && grain(x, 0, 1052) > 0.1 ? '#3a3050' : y > 31 ? '#141018' : null));
}

// ---------------------------------------------------------------------------
// godis: Glasstornet (48×64, oy -16), Chokladfontänen (48×64, oy -16, 2 frames)
// ---------------------------------------------------------------------------

const CONE = pal('#6e3e14', '#a0621e', '#cc8c3e', '#e8b068', '#f8d498');
const PINK = pal('#a83a6a', '#d8608e', '#f490b8', '#ffc0d8', '#ffe4ee');
const VANILLA = pal('#c8b088', '#e4d0a8', '#f8ecd0', '#fff8e8', '#ffffff');
const CHOC = pal('#2a140a', '#4a2414', '#6a3a1e', '#8e5430', '#b47448');
const SPRINKLES = ['#ff4a6a', '#4ac8ff', '#ffe04a', '#7ae070', '#ffffff', '#b07aff'];

function glasstorn(): Px {
  const p = new Px(48, 64);
  // the cone: a waffle tower, narrowing to its foot
  fill(p, 8, 26, 32, 36, (x, y) => {
    const t = (y - 27) / 34;
    if (t < 0 || t > 1) return null;
    const half = 14 - t * 6;
    const dx = x + 0.5 - 24;
    if (Math.abs(dx) > half) return null;
    const u = dx / half;
    if ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) return u > 0.4 ? CONE.d2 : CONE.d;
    return u < -0.6 ? CONE.l : u < 0.35 ? CONE.b : CONE.d;
  });
  p.rect(9, 26, 30, 3, CONE.l).rect(9, 26, 30, 1, CONE.l2).rect(9, 28, 30, 1, CONE.d);
  // a round window and a little door
  p.circle(24, 38, 3, '#5a2a10').circle(24, 38, 2, '#ffb0d0').px(23, 37, '#ffffff');
  fill(p, 19, 48, 10, 14, (x, y) => (y > 60 ? null : inArch(x, y, 24, 50, 4) ? (x === 27 ? CHOC.d2 : CHOC.b) : inArch(x, y, 24, 49, 5) ? PINK.l : null));
  p.px(26, 56, GOLD.l);
  // two scoops, dripping over the rim, sprinkles, a cherry on top
  lump(p, 7, 14, 34, 16, PINK, 0.15, 1060, 0.35);
  for (const [x, len] of [[10, 4], [16, 6], [23, 3], [30, 7], [36, 4]] as const) p.rect(x, 27, 2, len, PINK.b).px(x, 27 + len, PINK.d).px(x, 27, PINK.l);
  lump(p, 11, 4, 26, 15, VANILLA, 0.15, 1061, 0.35);
  for (const [x, len] of [[14, 3], [21, 4], [31, 3]] as const) p.rect(x, 17, 2, len, VANILLA.b).px(x, 17 + len, VANILLA.d);
  for (let i = 0; i < 18; i++) {
    const x = 10 + Math.floor((grain(i, 2, 1062) + 0.5) * 28);
    const y = i < 9 ? 17 + Math.floor((grain(i, 3, 1062) + 0.5) * 8) : 6 + Math.floor((grain(i, 3, 1062) + 0.5) * 9);
    p.px(x, y, SPRINKLES[i % SPRINKLES.length]!).px(x + 1, y, SPRINKLES[i % SPRINKLES.length]!);
  }
  p.line(25, 2, 28, 0, '#3a6a2a');
  lump(p, 20, 0, 7, 6, pal('#6a0a14', '#a01428', '#d82a3a', '#ff6a6a', '#ffd0d0'), 0.1, 1063, 0.3);
  p.outline(OUTLINE);
  // a mound of pink frosting at its foot
  patch(p, 2, 54, 44, 10, PINK, 1064, true, 0.3);
  for (const [x, y] of [[8, 58], [38, 59], [16, 61], [32, 62]] as const) p.px(x, y, SPRINKLES[(x + y) % 6]!).px(x + 1, y, SPRINKLES[(x + y) % 6]!);
  return p;
}

function chokladfontan(f: number): Px {
  const p = new Px(48, 64);
  /** A sheet of chocolate falling from y0 to y1 between x0 and x1, streaks running down. */
  const curtain = (x0: number, x1: number, y0: number, y1: number, salt: number) =>
    fill(p, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (x, y) => {
      const u = (x + 0.5 - x0) / (x1 - x0 + 1);
      const bottom = y1 - Math.round(Math.abs(Math.sin(x * 1.3 + salt)) * 2);
      if (y > bottom) return null;
      const s = (y - f * 3 + ((x * 7) % 6) + 12) % 6;
      if (s === 0 && u > 0.1 && u < 0.85) return CHOC.l;
      return u < 0.15 ? CHOC.l : u > 0.85 ? CHOC.d : CHOC.b;
    });
  // the basin: a candy-pink bowl brimming with chocolate
  fill(p, 2, 44, 44, 19, (x, y) => {
    const dx = (x + 0.5 - 24) / 22;
    const dy = (y + 0.5 - 49) / 5;
    const r = dx * dx + dy * dy;
    if (y + 0.5 < 49) return r <= 1 ? (r > 0.7 ? (dy < 0 ? PINK.l2 : PINK.l) : r < 0.3 ? CHOC.l : CHOC.b) : null;
    const bottom = 61 - Math.abs(dx) * 3;
    if (Math.abs(dx) > 1 - (y - 49) / 40 || y > bottom) return null;
    if (y === 49 || y === 50) return PINK.l;
    return (x + 1) % 6 === 0 ? PINK.d : tone(PINK, light(dx, 0.2, Math.sqrt(Math.max(0, 1 - dx * dx))) + 0.1);
  });
  // the stem and the two tiers above
  p.rect(22, 18, 5, 30, PINK.b).rect(22, 18, 1, 30, PINK.l).rect(26, 18, 1, 30, PINK.d);
  const tier = (cx: number, y: number, hw: number) =>
    fill(p, cx - hw - 1, y - 3, hw * 2 + 2, 8, (x, py) => {
      const dx = (x + 0.5 - cx) / hw;
      const dy = (py + 0.5 - y) / 2.5;
      if (py + 0.5 < y) return dx * dx + dy * dy <= 1 ? (dx * dx + dy * dy > 0.55 ? PINK.l2 : CHOC.b) : null;
      if (Math.abs(dx) > 1 - (py - y) * 0.12 || py > y + 3) return null;
      return py === y + 3 ? PINK.d : dx < -0.4 ? PINK.l : PINK.b;
    });
  curtain(10, 37, 34, 47, 1);
  tier(24, 31, 14);
  curtain(16, 31, 20, 30, 2);
  tier(24, 18, 8);
  // chocolate bubbling over at the top
  lump(p, 19, 7, 10, 9, CHOC, 0.15, 1070 + f, 0.4);
  p.rect(21, 15, 2, 2 + f, CHOC.b).rect(26, 15, 2, 3 - f, CHOC.b);
  // strawberries and marshmallows on the basin's rim
  for (const [x, y] of [[6, 45], [38, 44]] as const) lump(p, x, y, 5, 5, pal('#6a0a14', '#a01428', '#e83a4a', '#ff7a7a', '#ffd0d0'), 0.1, x, 0.3).rect(x + 1, y - 1, 3, 1, '#3a8a2a');
  for (const [x, y] of [[13, 44], [32, 45]] as const) p.rect(x, y, 4, 4, '#fff4f8').rect(x, y, 4, 1, '#ffffff').rect(x + 3, y + 1, 1, 3, '#e4c8d4');
  p.outline(OUTLINE);
  p.px(23, 9 + f, CHOC.l2).px(24, 9 + f, CHOC.l2);
  patch(p, 4, 56, 40, 8, PINK, 1072, true, 0.3);
  return p;
}

// ---------------------------------------------------------------------------
// rymdbas: Satelliten (48×52, oy -4, 2 frames: its light blinks); mane: Månporten (48×64, oy -16)
// ---------------------------------------------------------------------------

function satellit(f: number): Px {
  const p = new Px(48, 52);
  const a = -0.38;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  /** Into the satellite's own frame (u along it, v across), centred on its body. */
  const loc = (x: number, y: number, cx: number, cy: number, ang = a): [number, number] => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [dx * c + dy * s, -dx * s + dy * c];
  };
  // the crater's back rim
  lump(p, 2, 30, 44, 16, DUST, 0.2, 1080, 0.6);
  // the bent wing dug into the ground on the right
  fill(p, 26, 18, 22, 30, (x, y) => {
    const [u, v] = loc(x, y, 37, 34, 1.15);
    if (u < -9 || u > 8 || Math.abs(v) > 4.5) return null;
    if (u > 6 && v > 1) return null;
    if (Math.abs(v) > 3.6 || u < -8) return '#8a8e9a';
    return Math.abs((u + 20) % 4) < 0.7 || Math.abs(v) < 0.5 ? '#6a9ae0' : '#1e3a7a';
  });
  // the wing still up on the left
  fill(p, 0, 4, 24, 26, (x, y) => {
    const [u, v] = loc(x, y, 11, 17, a - 0.5);
    if (u < -11 || u > 11 || Math.abs(v) > 5) return null;
    if (Math.abs(v) > 4 || Math.abs(u) > 10) return '#aab0bc';
    return Math.abs((u + 20) % 4) < 0.7 || Math.abs(v) < 0.5 ? '#7aaaf0' : (u + v) < -6 ? '#3a64b0' : '#22468e';
  });
  p.line(19, 21, 23, 24, '#8a8e9a');
  // the body: a box wrapped in crinkled gold foil, its top lit
  fill(p, 12, 12, 26, 28, (x, y) => {
    const [u, v] = loc(x, y, 26, 27);
    if (Math.abs(u) > 9 || Math.abs(v) > 8) return null;
    if (v < -5) return v < -7 ? '#fff6c8' : '#ffe27a';
    if (Math.abs(u) > 8) return u > 0 ? '#8a5a10' : '#ffe27a';
    const g = grain(x, y, 1081);
    return g > 0.35 ? GOLD.l : g < -0.35 ? GOLD.d : (x + y) % 5 === 0 ? GOLD.d : GOLD.b;
  });
  // the dish on top, the aerial with its light
  fill(p, 22, 6, 12, 8, (x, y) => {
    const [u, v] = loc(x, y, 28, 11, a - 0.4);
    const r = (u / 5) ** 2 + (v / 2.2) ** 2;
    if (r > 1) return null;
    return v < -0.3 ? '#f4f7fb' : '#b4bdcb';
  });
  p.line(28, 13, 27, 16, '#76808e');
  p.line(33, 19, 40, 8, '#aab0bc').line(34, 19, 41, 8, '#76808e');
  p.rect(40, 6, 3, 3, f ? '#ff3a3a' : '#6a1a1a').px(40, 6, f ? '#ffffff' : '#8a2a2a');
  // dents and a scorch mark
  p.rect(20, 30, 3, 2, '#5a3a10').px(29, 34, GOLD.d2).px(30, 34, '#3a2a0a');
  p.outline(OUTLINE);
  if (f) halo(p, 41.5, 7.5, 7, '#ff4a3a', 0.5);
  // dust thrown up in front, a few bits of debris
  lump(p, 6, 40, 36, 10, DUST, 0.2, 1082, 0.6);
  p.rect(5, 45, 3, 2, '#aab0bc').px(5, 45, '#e2e8f0').rect(40, 47, 2, 1, '#8a5a10').rect(34, 49, 3, 1, '#22468e');
  return p;
}

function manporten(): Px {
  const p = new Px(48, 64);
  const yc = 23;
  // the arch of moon rock, lit as a thick round band
  fill(p, 2, 2, 44, 56, (x, y) => {
    if (y > 57 || !inArch(x, y, 24, 2, 21) || inArch(x, y, 24, 14, 10)) return null;
    let nx: number;
    let ny: number;
    let nr: number;
    if (y + 0.5 >= yc) {
      const pc = x < 24 ? 8.5 : 39.5;
      nr = (x + 0.5 - pc) / 5.5;
      nx = Math.sign(nr) || 1;
      ny = 0;
    } else {
      const dx = x + 0.5 - 24;
      const dy = y + 0.5 - yc;
      const d = Math.hypot(dx, dy) || 1;
      nr = (d - 15.5) / 5.5;
      nx = dx / d;
      ny = dy / d;
    }
    const s = Math.max(-1, Math.min(1, nr));
    const crater = grain(x >> 2, y >> 2, 1090) > 0.38 && grain(x, y, 1091) > -0.2;
    return tone(MOON, light(nx * s, ny * s, Math.sqrt(Math.max(0, 1 - s * s)) + 0.2) + 0.12 + 0.25 * grain(x, y, 1092) - (crater ? 0.3 : 0));
  });
  // the starlight inside it
  fill(p, 14, 14, 21, 44, (x, y) => {
    if (y > 57 || !inArch(x, y, 24, 14, 10)) return null;
    const dx = Math.abs(x + 0.5 - 24) / 10;
    const edge = Math.max(dx, y < 24 ? 1 - Math.hypot(x + 0.5 - 24, y + 0.5 - 24) / 10 < 0.15 ? 1 : 0 : 0);
    if (grain(x, y, 1093) > 0.46) return '#ffffff';
    if (grain(x, y, 1094) > 0.45) return '#c8d0ff';
    return edge > 0.85 ? '#4a4a9a' : edge > 0.6 ? '#2e2e6e' : '#1a1a48';
  });
  // the keystone and the star marks carved round the arch, glowing faintly
  block(p, 20, 0, 9, 7, 2, pal('#5e5e6c', '#7e7e8c', '#a2a2ae', '#c6c6d0', '#e8e8f0'), 1095);
  const star = (x: number, y: number) => p.px(x, y - 1, '#a8c8ff').px(x - 1, y, '#a8c8ff').px(x + 1, y, '#a8c8ff').px(x, y + 1, '#a8c8ff').px(x, y, '#ffffff');
  star(24, 3);
  for (const [x, y] of [[8, 46], [40, 46], [8, 34], [40, 34], [11, 16], [37, 16]] as const) star(x, y);
  // the plinth it stands on
  block(p, 0, 56, 48, 7, 2, pal('#4e4e5c', '#6e6e7c', '#92929e', '#b8b8c2', '#dcdce6'), 1096);
  p.outline(OUTLINE);
  for (const [x, y] of [[8, 46], [40, 46], [8, 34], [40, 34], [11, 16], [37, 16], [24, 3]] as const) halo(p, x + 0.5, y + 0.5, 4, '#a8c8ff', 0.4);
  // moon dust at its foot, a pebble floating by it
  patch(p, -4, 58, 56, 8, DUST, 1097, true, 0.4);
  lump(p, 43, 24, 4, 3, MOON, 0.2, 1098, 0.3);
  lump(p, 1, 40, 3, 3, MOON, 0.2, 1099, 0.3);
  return p;
}

// ---------------------------------------------------------------------------

const n = (count: number, f: (i: number) => Px): Px[] => Array.from({ length: count }, (_, i) => f(i));

/** The wild maps' landmarks, `lm_<id>`: 3×3 footprints (4×3 for the maze, the giant's bones and the whale). */
export function drawSagaPlaces(set: SetArt): void {
  set('lm_stencirkel', [stencirkel()], 0, -8);
  set('lm_jatteek', [jatteek()], 0, -16);
  set('lm_vardkase', n(2, vardkase), 0, -16, true);
  set('lm_blomsterlabyrint', [blomsterlabyrint()], 0, 0);
  set('lm_frusetskepp', [frusetskepp()], 0, -16);
  set('lm_jatteskelett', [jatteskelett()], 0, -8);
  set('lm_dvargport', [dvargport()], 0, -16);
  set('lm_ornnaste', [ornnaste()], 0, -16);
  set('lm_klocktorn', [klocktorn()], 0, -16);
  set('lm_valskelett', [valskelett()], 0, -8);
  set('lm_oas', [oas()], 0, -16);
  set('lm_sandjatte', [sandjatte()], 0, -16);
  set('lm_mossaltare', n(2, mossaltare), 0, -8, true);
  set('lm_gamlabron', [gamlabron()], 0, -4);
  set('lm_apkungenstron', [apkungenstron()], 0, -16);
  set('lm_vattenfall', n(2, vattenfall), 0, -16, true);
  set('lm_eldbrunn', n(2, eldbrunn), 0, -16, true);
  set('lm_forstenadjatte', [forstenadjatte()], 0, -16);
  set('lm_svampring', n(2, svampring), 0, -8, true);
  set('lm_lykttrad', [lykttrad()], 0, -16);
  set('lm_dinobo', [dinobo()], 0, -4);
  set('lm_tjargrop', [tjargrop()], 0, 0);
  set('lm_glasstorn', [glasstorn()], 0, -16);
  set('lm_chokladfontan', n(2, chokladfontan), 0, -16, true);
  set('lm_satellit', n(2, satellit), 0, -4, true);
  set('lm_manporten', [manporten()], 0, -16);
}
