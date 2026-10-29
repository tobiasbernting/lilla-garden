// Plants and finds of the wider world's biomes and of the moon (landmarks, caves and souvenirs are in landmarks.ts).
// Drawn like world.ts: chunky shapes lit from the top-left, a darker base, a few highlights and a dark outline.
import { Px, hash2, hexToRgb } from './px.js';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;
type XY = readonly [number, number];

/** The outline of world.ts (not imported from there: world.ts imports this file). */
const OUTLINE = '#2b2419';
/** Trees get a dark green outline, like the trees in world.ts. */
const TREE_OUTLINE = '#1f2a18';

const frames = (count: number, f: (i: number) => Px): Px[] => Array.from({ length: count }, (_, i) => f(i));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const inPoly = (pts: readonly XY[], x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Fills a polygon (corner coordinates: every pixel whose centre is inside). */
const poly = (p: Px, pts: readonly XY[], c: string): Px => {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y++)
    for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) if (inPoly(pts, x + 0.5, y + 0.5)) p.px(x, y, c);
  return p;
};

const bez = (a: XY, b: XY, c: XY, t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
};

/** A bough, twig, stalk or stroke: a curve from pixel a (bent towards b) to pixel c, w0 thick at a and w1 at c. */
const curve = (p: Px, a: XY, b: XY, c: XY, w0: number, w1: number, col: string): Px => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
  const steps = Math.max(2, Math.ceil(len * 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = bez(a, b, c, t);
    const s = Math.max(1, Math.round(w0 + (w1 - w0) * t));
    const o = Math.floor((s - 1) / 2);
    p.rect(Math.round(x) - o, Math.round(y) - o, s, s, col);
  }
  return p;
};

/** Outline of a pointed leaf from its base to its tip, w wide, its middle bent sideways by `bend`. */
const leafPts = (bx: number, by: number, tx: number, ty: number, w: number, bend = 0): XY[] => {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const left: XY[] = [];
  const right: XY[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const half = (w / 2) * Math.sin(Math.PI * Math.pow(t, 0.75));
    const mx = bx + dx * t + nx * bend * Math.sin(Math.PI * t);
    const my = by + dy * t + ny * bend * Math.sin(Math.PI * t);
    left.push([mx + nx * half, my + ny * half]);
    right.push([mx - nx * half, my - ny * half]);
  }
  return [...left, ...right.reverse()];
};

/** Lights the top-left edge pixels of colour `of` and darkens its bottom-right edge pixels (call before the outline). */
const rim = (p: Px, of: string, light: string | null, dark: string | null): Px => {
  const { w, h } = p;
  const d = p.ctx.getImageData(0, 0, w, h).data;
  const [r, g, b] = hexToRgb(of);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3]! > 0;
  const lit: XY[] = [];
  const shaded: XY[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3] || d[i] !== r || d[i + 1] !== g || d[i + 2] !== b) continue;
      if (light && (!solid(x - 1, y) || !solid(x, y - 1))) lit.push([x, y]);
      else if (dark && (!solid(x + 1, y) || !solid(x, y + 1))) shaded.push([x, y]);
    }
  for (const [x, y] of lit) p.px(x, y, light!);
  for (const [x, y] of shaded) p.px(x, y, dark!);
  return p;
};

/** Clears a line of pixels (a tear in a leaf). Whole-pixel coordinates, like Px.line. */
const cut = (p: Px, x0: number, y0: number, x1: number, y1: number): Px => {
  p.ctx.globalCompositeOperation = 'destination-out';
  p.line(x0, y0, x1, y1, '#000000');
  p.ctx.globalCompositeOperation = 'source-over';
  return p;
};

/** Draws only onto pixels that are already there (shading inside a shape). */
const atop = (p: Px, draw: (p: Px) => void): Px => {
  p.ctx.globalCompositeOperation = 'source-atop';
  draw(p);
  p.ctx.globalCompositeOperation = 'source-over';
  return p;
};

interface Gem {
  /** shaded face, front face, lit face, glowing core, lit face of the tip */
  d: string;
  m: string;
  l: string;
  c: string;
  t: string;
}

/** One crystal: a six-sided prism from its base (corner coordinates) to its pointed tip, lit on the left. */
const crystal = (p: Px, b: XY, t: XY, w: number, g: Gem): Px => {
  const [bx, by] = b;
  const [tx, ty] = t;
  const len = Math.hypot(tx - bx, ty - by);
  const ux = (tx - bx) / len;
  const uy = (ty - by) / len;
  let nx = -uy;
  let ny = ux;
  if (nx > 0 || (nx === 0 && ny > 0)) [nx, ny] = [-nx, -ny]; // n points to the lit side
  const h = w / 2;
  const tip = Math.min(len * 0.45, w * 0.95);
  for (let y = Math.floor(Math.min(by, ty) - w); y <= Math.max(by, ty) + w; y++)
    for (let x = Math.floor(Math.min(bx, tx) - w); x <= Math.max(bx, tx) + w; x++) {
      const px = x + 0.5 - bx;
      const py = y + 0.5 - by;
      const s = px * ux + py * uy;
      const q = px * nx + py * ny;
      if (s < 0 || s > len) continue;
      const hw = s < len - tip ? h : (h * (len - s)) / tip;
      if (Math.abs(q) > hw) continue;
      const k = q / Math.max(hw, 0.01);
      let c: string;
      // the pointed tip catches more light than the body, so its shoulder shows
      if (s >= len - tip) c = k > 0.34 ? g.t : k < -0.34 ? g.m : g.l;
      else {
        c = k > 0.34 ? g.l : k < -0.34 ? g.d : g.m;
        if (k > -0.25 && k < 0.45 && s > len * 0.2 && s < len - tip - 1) c = g.c;
      }
      p.px(x, y, c);
    }
  return p;
};

/** A cluster of crystals, back to front, each with its own outline so they stand apart. */
const crystals = (p: Px, list: readonly (readonly [XY, XY, number])[], g: Gem): Px => {
  for (const [b, t, w] of list) p.blit(crystal(new Px(p.w, p.h), b, t, w, g).outline(OUTLINE), 0, 0);
  return p;
};

/** A four-pointed twinkle (not outlined). */
const sparkle = (p: Px, x: number, y: number, c: string, big = false): Px => {
  p.px(x, y, '#ffffff').px(x - 1, y, c).px(x + 1, y, c).px(x, y - 1, c).px(x, y + 1, c);
  if (big) p.px(x - 2, y, c + '99').px(x + 2, y, c + '99').px(x, y - 2, c + '99').px(x, y + 2, c + '99');
  return p;
};

// ---------------------------------------------------------------------------
// Skogen and Träsket
// ---------------------------------------------------------------------------

const blueberryBush = (): Px => {
  const p = new Px(16, 16);
  const D = '#2b6430';
  const M = '#3f8a38';
  const L = '#62ae48';
  // a low, lumpy shrub of small leaves
  for (const [x, y, w, h] of [[0, 8, 9, 8], [7, 8, 9, 8], [2, 4, 7, 7], [6, 2, 7, 7], [10, 4, 6, 7]] as const) p.ellipse(x, y, w, h, D);
  for (const [x, y, w, h] of [[1, 8, 7, 6], [8, 8, 7, 6], [3, 4, 5, 5], [7, 2, 5, 5], [11, 5, 4, 5]] as const) p.ellipse(x, y, w, h, M);
  for (const [x, y, w, h] of [[3, 5, 3, 2], [8, 3, 3, 2], [12, 6, 2, 2], [2, 9, 3, 2], [9, 9, 3, 2]] as const) p.ellipse(x, y, w, h, L);
  for (const [x, y] of [[4, 5], [9, 3], [3, 9], [10, 9], [12, 6]] as const) p.px(x, y, '#9cd86c');
  for (const [x, y] of [[6, 8], [9, 12], [13, 11], [3, 13], [7, 14], [11, 14]] as const) p.px(x, y, D);
  // little bunches of blueberries
  const berry = (x: number, y: number) => p.rect(x, y, 2, 2, '#3446b8').px(x, y, '#a8b8ff').px(x + 1, y + 1, '#1e2470');
  for (const [x, y] of [[1, 10], [6, 5], [10, 9], [5, 11]] as const) {
    berry(x, y);
    berry(x + 2, y + 1);
    berry(x, y + 2);
  }
  berry(12, 5);
  berry(3, 6);
  return p.outline(OUTLINE);
};

const BERRY = { a: '#f8b444', b: '#ea8a20', w: '#fff2c0', d: '#b85e14' };
const cloudberry = (): Px => {
  const p = new Px(16, 16);
  const D = '#2f6a2c';
  const M = '#4a9a3c';
  const L = '#78c25a';
  // round, crinkly leaves lying on the ground, five shallow lobes each
  const leaf = (cx: number, cy: number, r: number) => {
    const l = new Px(16, 16).circle(cx, cy, r, M);
    atop(l, (q) => q.circle(cx - r * 0.35, cy - r * 0.35, r * 0.6, L));
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + 0.6 + (i * Math.PI * 2) / 5;
      l.line(Math.floor(cx), Math.floor(cy), Math.floor(cx + Math.cos(a) * (r - 0.8)), Math.floor(cy + Math.sin(a) * (r - 0.8)), D);
      l.clear(Math.floor(cx + Math.cos(a) * (r - 0.2)), Math.floor(cy + Math.sin(a) * (r - 0.2)), 1, 1);
    }
    p.blit(l, 0, 0);
  };
  leaf(8, 8.5, 3);
  leaf(4, 12, 3.6);
  leaf(12, 12, 3.6);
  // the berries stand up on short stalks with a little green star under them
  p.line(7, 11, 6, 6, D).line(9, 11, 12, 8, D);
  p.px(3, 6, M).px(8, 6, M).px(4, 7, M).px(7, 7, M).px(5, 7, D);
  p.tpl(3, 1, ['.aba.', 'awaba', 'babab', 'ababd', '.bdd.'], BERRY);
  p.px(10, 8, M).px(14, 8, M);
  p.tpl(11, 5, ['.ab.', 'awba', 'babd', '.dd.'], BERRY);
  return p.outline(OUTLINE);
};

const reed = (): Px => {
  const p = new Px(16, 22);
  const S = '#5f8f3a';
  const SD = '#3e6a2a';
  const B = '#6fa548';
  // long blades arching out from the foot
  curve(p, [2, 21], [1, 15], [0, 9], 2, 1, SD);
  curve(p, [13, 21], [15, 15], [15, 8], 2, 1, SD);
  curve(p, [6, 21], [6, 15], [2, 10], 1, 1, B);
  curve(p, [10, 21], [10, 16], [13, 12], 1, 1, B);
  // cattails: a stalk, a brown head and a thin spike on top
  const cattail = (x: number, top: number) => {
    p.rect(x, top + 7, 1, 21 - top - 7, S).px(x, top + 7, '#8cbf5a');
    p.rect(x - 1, top + 1, 3, 6, '#7a4524').rect(x - 1, top + 2, 1, 4, '#a8683a').rect(x + 1, top + 2, 1, 5, '#4f2a14');
    p.px(x - 1, top + 1, '#5c3218').px(x + 1, top + 1, '#5c3218');
    p.rect(x, top - 1, 1, 2, SD);
  };
  cattail(4, 4);
  cattail(8, 1);
  cattail(12, 6);
  p.rect(7, 19, 3, 2, SD).rect(3, 20, 2, 1, S);
  return p.outline(OUTLINE);
};

const deadTree = (): Px => {
  const p = new Px(24, 36);
  const B = '#8a7a68';
  // a crooked bough to the left with two twigs
  curve(p, [11, 21], [5, 16], [4, 9], 3, 2, B);
  curve(p, [4, 10], [2, 6], [3, 2], 2, 1, B);
  curve(p, [5, 13], [2, 13], [0, 11], 1, 1, B);
  curve(p, [4, 7], [7, 5], [8, 2], 1, 1, B);
  // a long bough reaching right, a broken twig hanging from it
  curve(p, [13, 20], [17, 17], [19, 12], 3, 2, B);
  curve(p, [19, 13], [23, 10], [22, 3], 2, 1, B);
  curve(p, [18, 14], [16, 9], [17, 6], 1, 1, B);
  curve(p, [21, 9], [23, 12], [23, 15], 1, 1, B);
  // a short middle branch
  curve(p, [12, 19], [11, 13], [13, 7], 2, 1, B);
  curve(p, [12, 12], [10, 9], [9, 7], 1, 1, B);
  // the trunk leans a little; roots spread out at the foot
  poly(p, [[6, 36], [9, 33], [9, 28], [10, 24], [10, 20], [12, 18], [14, 19], [15, 23], [14, 28], [15, 32], [19, 36]], B);
  curve(p, [9, 27], [8, 26], [7, 25], 2, 1, B); // a broken-off stub
  rim(p, B, '#b2a290', '#5c4e42');
  p.ellipse(11, 25, 3, 3, '#3e332b').px(12, 26, '#1e1814');
  p.line(13, 31, 13, 29, '#5c4e42').line(12, 22, 13, 20, '#5c4e42').px(11, 33, '#5c4e42').px(16, 34, '#5c4e42');
  return p.outline(OUTLINE);
};

const wisp = (f: number): Px => {
  const p = new Px(16, 16);
  // it hops up and drifts down again; the faint halo always fits inside the frame
  const cx = 8;
  const cy = 8 + ([0, -2, -1][f] ?? 0);
  p.circle(cx, cy, 6.2, '#8ff0ff1a').circle(cx, cy, 5, '#9ff2ff33').circle(cx, cy, 3.9, '#b8f6ff66');
  p.circle(cx, cy, 3, '#7ee6f6').circle(cx - 0.5, cy - 0.5, 2.2, '#c8faff').rect(cx - 2, cy - 2, 2, 2, '#ffffff');
  const fx = cx + ([0, 1, -1][f] ?? 0);
  p.rect(fx - 1, cy - 4, 2, 1, '#bff8ff').px(fx - 1 + (f === 1 ? 1 : 0), cy - 5, '#e8ffff');
  for (const [x, y] of [[[3, 3], [13, 9]], [[12, 2], [2, 10]], [[13, 5], [4, 12]]][f] ?? []) p.px(x!, y!, '#e8ffffcc');
  return p;
};

// ---------------------------------------------------------------------------
// Djungeln
// ---------------------------------------------------------------------------

const jungleTree = (): Px => {
  const p = new Px(32, 40);
  const DD = '#143f28';
  const D = '#1d5a32';
  const M = '#2b7a3c';
  const L = '#45a048';
  const H = '#7ccc5c';
  const T = '#7d5a3a';
  // a straight trunk standing on three buttress roots
  poly(p, [[13, 20], [18, 20], [18, 31], [13, 31]], T);
  poly(p, [[13, 29], [15, 32], [11, 40], [6, 40]], T);
  poly(p, [[14.5, 33], [16.5, 33], [17, 40], [14, 40]], T);
  poly(p, [[18, 29], [16, 32], [20, 40], [26, 40]], T);
  rim(p, T, '#a7825a', '#523a24');
  p.line(16, 22, 16, 30, '#5e4430').px(14, 25, '#5e4430');
  // the crown: leafy clumps, lit on top and dark underneath, the back row first
  const clump = (x: number, y: number, w: number, h: number) => {
    const c = new Px(w, h).ellipse(0, 0, w, h, D);
    atop(c, (q) => q.ellipse(-3, h * 0.55, w + 6, h, DD).ellipse(1, 0, w - 3, h * 0.62, M).ellipse(2, 1, w * 0.5, h * 0.32, L));
    p.blit(c, x, y);
  };
  // big pointed leaves poking out of the crown (drawn behind it), and hanging under it (in front)
  const bigLeaf = (bx: number, by: number, tx: number, ty: number, w: number, col: string, rib: string) => {
    poly(p, leafPts(bx, by, tx, ty, w), col);
    p.line(Math.round(bx), Math.round(by), Math.round(tx - (tx - bx) * 0.3), Math.round(ty - (ty - by) * 0.3), rib);
  };
  bigLeaf(7, 6, 3, 0, 4, M, L);
  bigLeaf(13, 5, 12, 0, 4, M, L);
  bigLeaf(19, 5, 21, 0, 4, M, L);
  bigLeaf(25, 6, 29, 1, 4, M, L);
  bigLeaf(4, 12, 0, 19, 4.5, M, L);
  bigLeaf(28, 12, 32, 19, 4.5, M, L);
  clump(4, 2, 12, 10);
  clump(15, 2, 13, 10);
  clump(0, 8, 13, 12);
  clump(19, 8, 13, 12);
  clump(9, 9, 14, 12);
  for (const [x, y] of [[7, 4], [18, 4], [3, 10], [13, 11], [22, 10]] as const) p.rect(x, y, 2, 1, H);
  for (const x of [3, 8, 22, 27]) bigLeaf(x, 17, x + (x < 16 ? -1 : 1), 25, 3.6, D, M);
  // lianas with little leaves, one in flower
  for (const [x, y0, y1] of [[5, 19, 29], [26, 19, 27], [11, 20, 26]] as const) {
    p.rect(x, y0, 1, y1 - y0, '#3f8a2e');
    for (let y = y0 + 1; y < y1; y += 2) p.px(x + ((y >> 1) % 2 ? 1 : -1), y, '#6cbf4e');
  }
  p.rect(4, 29, 3, 2, '#f0609a').px(5, 29, '#ffb0d0').px(5, 31, '#c03a72');
  return p.outline(TREE_OUTLINE);
};

const bananaPlant = (): Px => {
  const p = new Px(16, 26);
  const D = '#2a6e2c';
  const M = '#3f9a3a';
  const L = '#5cb84a';
  // the soft stem, wider at the foot, with a dry brown sheath at the bottom
  const stem = new Px(16, 26);
  poly(stem, [[6, 12], [10, 12], [11, 26], [5, 26]], '#8aa64e');
  stem.rect(9, 13, 1, 10, '#62803a').rect(6, 13, 1, 10, '#b0c870').line(7, 16, 7, 22, '#a0b860');
  stem.rect(5, 23, 6, 3, '#9a7a44').px(6, 23, '#b89458').rect(9, 23, 2, 3, '#7a5a30');
  p.blit(stem.outline(OUTLINE), 0, 0);
  // broad leaves, back to front, each outlined: a light edge, a pale midrib and a couple of tears
  const leaf = (bx: number, by: number, tx: number, ty: number, w: number, bend: number, col: string, light: string, dark: string, tears: number[]) => {
    const l = new Px(16, 26);
    poly(l, leafPts(bx, by, tx, ty, w, bend), col);
    rim(l, col, light, dark);
    const dx = tx - bx;
    const dy = ty - by;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const mid = (t: number): [number, number] => [bx + dx * t + nx * bend * Math.sin(Math.PI * t), by + dy * t + ny * bend * Math.sin(Math.PI * t)];
    for (let t = 0; t <= 0.85; t += 0.02) {
      const [x, y] = mid(t);
      l.px(Math.floor(x), Math.floor(y), '#a6d878');
    }
    for (const t of tears) {
      const [x, y] = mid(t);
      const side = t > 0.6 ? -1 : 1;
      cut(l, Math.floor(x + nx * side * 1.5), Math.floor(y + ny * side * 1.5), Math.floor(x + nx * side * w), Math.floor(y + ny * side * w));
    }
    p.blit(l.outline(OUTLINE), 0, 0);
  };
  leaf(7, 11, 0, 1, 6, 1.5, M, L, D, [0.45, 0.7]);
  leaf(9, 11, 16, 0, 6, -1.5, M, L, D, [0.55]);
  leaf(7, 12, 0, 18, 5, 3, M, L, D, [0.5]);
  leaf(9, 12, 16, 17, 5, -3, M, L, D, [0.6]);
  // a bunch of bananas with the purple flower bud below
  const bunch = new Px(16, 26).line(10, 12, 11, 14, '#5c7a30');
  bunch.tpl(9, 14, ['.yYyY.', 'yYyYyd', '.yYyd.', 'yYyYyd', '.yYyd.', '...p..', '..pP..', '..pp..'], {
    y: '#f2cf34',
    Y: '#fff07a',
    d: '#c89a1c',
    p: '#8a2a5e',
    P: '#c0487e',
  });
  return p.blit(bunch.outline(OUTLINE), 0, 0);
};

const FLOWERS = [
  { a: '#f2589a', l: '#ff9cc6', d: '#c23272', c: '#8a1a4a' },
  { a: '#ff8a2a', l: '#ffc070', d: '#d85a14', c: '#a0300a' },
  { a: '#a45ae0', l: '#d4a6f8', d: '#6a32a8', c: '#3a1a6a' },
];
/** A five-petalled tropical bloom. */
const bloom = (p: Px, cx: number, cy: number, r: number, pal: (typeof FLOWERS)[number], rot = 0): Px => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const lobe = Math.cos(5 * (Math.atan2(dy, dx) - rot));
      if (d > r * (0.78 + 0.22 * lobe)) continue;
      let c = pal.a;
      if (d < r * 0.3) c = pal.c;
      else if (lobe < -0.8 && d > r * 0.35) c = pal.d;
      else if (dx + dy < -r * 0.45) c = pal.l;
      else if (dx + dy > r * 0.65) c = pal.d;
      p.px(x, y, c);
    }
  return p;
};
const jungleFlower = (v: number): Px => {
  const p = new Px(16, 16);
  const pal = FLOWERS[v % FLOWERS.length]!;
  for (const [bx, by, tx, ty, w] of [
    [8, 11, 0, 13, 5],
    [8, 11, 16, 12, 5],
    [8, 11, 13, 3, 4],
    [8, 11, 2, 4, 4],
  ] as const) {
    poly(p, leafPts(bx, by, tx, ty, w), '#2f8a3a');
    p.line(bx, by, Math.round(tx - (tx - bx) * 0.2), Math.round(ty - (ty - by) * 0.2), '#5cbf4a');
  }
  bloom(p, 7.5, 7.5, 5.5, pal, -Math.PI / 2);
  p.line(8, 7, 10, 5, '#fff2a0').px(10, 4, '#ffd84a').px(11, 5, '#ffd84a');
  return p.outline(OUTLINE);
};

const ruinPillar = (): Px => {
  const p = new Px(16, 28);
  const S = '#aaa28a';
  const SD = '#7f7865';
  const SL = '#d2cab0';
  const MO = '#5a9a3c';
  const ML = '#88c45c';
  // plinth, chipped and cracked
  p.rect(1, 20, 14, 2, SL).rect(1, 22, 14, 5, S).rect(1, 22, 1, 5, SL).rect(13, 22, 2, 5, SD).rect(1, 26, 14, 1, SD);
  p.clear(13, 20, 2, 1).px(13, 21, S).line(9, 22, 10, 24, '#5e5848').px(10, 25, '#5e5848');
  // fluted shaft with a broken top
  p.rect(4, 6, 8, 15, S).rect(4, 6, 1, 15, SL).rect(10, 6, 2, 15, SD);
  for (const x of [6, 8]) p.rect(x, 8, 1, 12, SD);
  poly(p, [[4, 7], [4, 3], [6, 2], [7, 4], [9, 3], [10, 5], [12, 5], [12, 8], [4, 8]], S);
  poly(p, [[4, 4], [6, 3], [7, 5], [9, 4], [10, 6], [12, 6], [12, 7], [4, 7]], SL);
  p.line(9, 9, 8, 12, '#5e5848').line(8, 12, 9, 15, '#5e5848');
  // moss
  p.rect(4, 3, 3, 2, MO).px(4, 3, ML).rect(10, 6, 2, 1, MO).rect(4, 5, 1, 3, MO);
  p.rect(1, 20, 5, 1, MO).rect(2, 19, 2, 1, MO).px(2, 19, ML).rect(11, 20, 4, 1, MO).px(12, 21, MO).px(1, 21, MO);
  // a vine winding up the shaft
  curve(p, [3, 20], [13, 14], [5, 9], 1, 1, '#2f7a2c');
  for (const [x, y] of [[4, 18], [9, 15], [11, 13], [7, 11], [5, 9]] as const) p.rect(x, y, 2, 1, ML);
  return p.outline(OUTLINE);
};

// ---------------------------------------------------------------------------
// Vulkanen
// ---------------------------------------------------------------------------

const obsidianRock = (): Px => {
  const p = new Px(16, 16);
  // a small shard behind on the right
  poly(p, [[9, 15], [10, 9], [13, 4], [16, 10], [16, 15]], '#271c3c');
  poly(p, [[10, 9], [13, 4], [12.5, 15], [9, 15]], '#3e2d5e');
  // the big glassy shard: a lit face, a shaded face and a low front face
  poly(p, [[1, 15], [2, 10], [5, 5], [8, 0.5], [10, 6], [11.5, 11], [11, 15]], '#150f20');
  poly(p, [[2, 10], [5, 5], [8, 0.5], [7, 15], [1, 15]], '#5a4588');
  poly(p, [[1.5, 12.5], [7.2, 11], [7, 15], [1, 15]], '#3e2d5e');
  // glints along the ridge and on the lit face
  p.line(8, 1, 7, 10, '#9a86e0').line(4, 7, 5, 6, '#e0d8ff').px(3, 9, '#ffffff').px(6, 4, '#ffffff');
  p.px(13, 5, '#c8b8f8').line(12, 6, 11, 9, '#7a66b8').px(9, 12, '#7a4aa0');
  return p.outline(OUTLINE);
};

const FIRE: Gem = { d: '#a8221a', m: '#e84a1c', l: '#ff8c3a', c: '#ffcf5a', t: '#ffe6a0' };
const fireCrystal = (): Px => {
  const p = new Px(16, 20);
  p.blit(new Px(16, 20).ellipse(1, 15, 14, 4, '#3a3438').ellipse(2, 15, 9, 2, '#5a525a').outline(OUTLINE), 0, 0);
  crystals(p, [[[5, 18], [2.5, 6], 4], [[11, 18], [13.5, 4], 4], [[8, 19], [8, 1], 5], [[4.5, 19], [3, 13.5], 3], [[11.5, 19], [13, 12.5], 3]], FIRE);
  return p.px(1, 2, '#ffb040').px(15, 1, '#ffd060').px(15, 9, '#ff8c3a');
};

const steamVent = (f: number): Px => {
  const p = new Px(16, 16);
  // cracks running out from the hole
  for (const [x0, y0, x1, y1] of [[4, 12, 0, 14], [12, 11, 15, 9], [8, 14, 9, 15], [5, 10, 3, 7], [11, 13, 14, 15]] as const) p.line(x0, y0, x1, y1, '#2a2226');
  // a crust of pale rock and yellow sulphur round the hole, hot deep inside
  const crust = new Px(16, 16).ellipse(2, 9, 12, 6, '#6e646c');
  atop(crust, (q) => q.ellipse(2, 8, 9, 4, '#8a8088'));
  p.blit(crust, 0, 0);
  poly(p, [[4.5, 12], [6, 10], [9, 10], [11.5, 11], [11, 13], [8, 14], [5.5, 13.5]], '#141014');
  p.rect(7, 11, 3, 2, '#7a2412').px(8, 12, '#ff6a20').px(7, 12, '#c84418');
  p.px(3, 10, '#e8d850').px(12, 13, '#e8d850').px(11, 9, '#d8c040').px(4, 13, '#c8b030');
  // fluffy puffs of steam rising, two at a time
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  for (const t of [f / 3, (f / 3 + 0.5) % 1]) {
    const y = 10 - t * 8.5;
    const x = 8 + Math.sin(t * Math.PI * 2 + 0.6) * 1.4;
    const r = 1.5 + t * 1.9;
    const a = 1 - t * 0.6;
    p.circle(x, y, r, '#f4f4f4' + hex(a * 0.8)).circle(x - r * 0.55, y + r * 0.25, r * 0.7, '#f4f4f4' + hex(a * 0.7)).circle(x + r * 0.5, y + r * 0.3, r * 0.6, '#f4f4f4' + hex(a * 0.7));
    p.circle(x - r * 0.25, y - r * 0.3, r * 0.5, '#ffffff' + hex(a));
  }
  return p;
};

// ---------------------------------------------------------------------------
// Svampskogen
// ---------------------------------------------------------------------------

const giantMushroom = (v: number): Px => {
  const p = new Px(24, 32);
  const red = v % 2 === 0;
  const ST = red ? '#efe4c8' : '#eadcb8';
  // a thick stem with a bulb at the foot (the brown one is fatter, with a fine net on it)
  if (red) p.ellipse(5, 26, 14, 6, ST).rect(7, 14, 10, 15, ST);
  else p.ellipse(4, 23, 16, 9, ST).rect(6, 14, 12, 14, ST);
  rim(p, ST, '#fffaf0', '#cbbb98');
  if (red) p.rect(6, 18, 12, 2, '#f8f0dc').rect(6, 20, 12, 1, '#d8c8a4');
  else for (let y = 18; y < 29; y += 2) for (let x = 8 + (y % 4 === 0 ? 1 : 0); x < 16; x += 2) p.px(x, y, '#f8f0dc');
  // gills under the cap
  p.ellipse(3, 11, 18, 6, red ? '#e6d2ae' : '#f0dca0');
  for (let x = 5; x < 20; x += 2) p.px(x, 15, red ? '#c8b08a' : '#d8bc78');
  // the cap: a dome, darker along its rim, with a shine (and white dots on the red one)
  const C = red ? '#d8363a' : '#c4742e';
  const CD = red ? '#a0222a' : '#8a4a1c';
  const CL = red ? '#f06a5a' : '#e49a50';
  const CH = red ? '#ff9c8c' : '#f6c47c';
  const cap = new Px(24, 14).ellipse(0, 0, 24, 28, C);
  atop(cap, (c) => {
    c.ellipse(-4, 10, 32, 8, CD).ellipse(2, 1, 14, 9, CL).ellipse(4, 2, 6, 3, CH);
    if (red)
      for (const [x, y, r] of [[5, 6, 1.6], [11, 3, 2], [18, 6, 1.8], [8, 10, 1.2], [15, 10, 1.4], [21, 10, 1], [2, 10, 1]] as const)
        c.circle(x, y, r, '#ffffff');
    else c.px(5, 4, '#fff0d0').px(6, 3, '#fff0d0');
  });
  p.blit(cap, 0, 0);
  return p.outline(OUTLINE);
};

const giantGlowshroom = (): Px => {
  const p = new Px(24, 32);
  const ST = '#d2eaf2';
  // a slender, slightly bent stem
  curve(p, [12, 31], [10, 24], [12, 16], 5, 4, ST);
  p.ellipse(7, 27, 10, 5, ST);
  rim(p, ST, '#f4fcff', '#90b0c8');
  // glowing gills under the bell
  p.ellipse(5, 12, 14, 6, '#8af2ff').rect(8, 16, 8, 1, '#c8fcff');
  // a tall pointed bell of a cap with a wavy rim, brightest at the top
  const C = '#2aa4e0';
  const cap = new Px(24, 20);
  poly(cap, [[2, 15], [3, 10], [5, 6], [8, 2], [12, 0], [16, 2], [19, 6], [21, 10], [22, 15], [19.5, 14.5], [16, 16.5], [12, 15.5], [8, 16.5], [4.5, 14.5]], C);
  rim(cap, C, '#62d4f8', '#1a64a4');
  atop(cap, (c) => {
    c.ellipse(-8, 9, 40, 16, '#2494d2').ellipse(-6, 12, 36, 12, '#1f80c4').ellipse(5, 1, 9, 9, '#5ccdf6').ellipse(7, 2, 4, 3, '#a8ecff');
    for (const [x, y, s] of [[8, 6, 2], [13, 3, 2], [16, 8, 2], [10, 10, 2], [15, 12, 2], [5, 11, 1], [19, 11, 1], [12, 7, 1]] as const)
      c.rect(x, y, s, s, '#c8f8ff').px(x, y, '#ffffff');
  });
  p.blit(cap, 0, 0);
  p.outline(OUTLINE);
  // drifting spores
  return p.px(1, 21, '#c8f8ff').px(22, 20, '#c8f8ff').px(3, 26, '#8af2ffaa').px(20, 25, '#8af2ffaa');
};

const glowshroom = (): Px => {
  const p = new Px(16, 16);
  const C = '#30c8b4';
  const CD = '#178a82';
  const CL = '#86f4e0';
  const ST = '#d4f2ea';
  const shroom = (x: number, y: number, w: number, h: number, stem: number) => {
    const sx = x + Math.floor(w / 2) - 1;
    p.rect(sx, y + h, 2, stem, ST).px(sx + 1, y + h + stem - 1, '#94c8bc').px(sx, y + h, '#94c8bc');
    // a dome cap (the lower half of the ellipse falls off its little canvas), glowing underneath
    const cap = new Px(w, h).ellipse(0, 0, w, h * 2, C);
    atop(cap, (c) => c.rect(0, h - 1, w, 1, CD).ellipse(1, 0, Math.max(2, w - 3), Math.max(1, h - 1), CL).px(2, 1, '#ffffff').px(3, 1, '#e6fff8'));
    p.blit(cap, x, y).rect(x + 1, y + h, w - 2, 1, '#a0ffe8');
  };
  shroom(3, 2, 8, 4, 7);
  shroom(10, 7, 6, 3, 5);
  shroom(0, 9, 5, 3, 4);
  return p.outline(OUTLINE);
};

const fairyRing = (): Px => {
  const ring = new Px(32, 32);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const j = (hash2(i, 7) % 100) / 100 - 0.5;
    const x = Math.round(16 + Math.cos(a) * (12 + j));
    const y = Math.round(15.5 + Math.sin(a) * (10.5 + j));
    const pink = i % 3 === 1;
    const cap = pink ? '#f8a0c8' : '#fbf6ee';
    const shade = pink ? '#d8709c' : '#d8cfc0';
    if (i % 2 === 0) ring.rect(x - 1, y - 1, 3, 1, cap).rect(x - 2, y, 5, 1, cap).px(x - 1, y - 1, '#ffffff').px(x + 2, y, shade).rect(x, y + 1, 1, 2, '#efe4cc');
    else ring.rect(x - 1, y - 1, 3, 2, cap).px(x - 1, y - 1, '#ffffff').px(x + 1, y, shade).px(x, y + 1, '#efe4cc');
  }
  // fairy sparkles inside (drawn after the outline: they shine, they have no edge)
  ring.outline(OUTLINE);
  sparkle(ring, 12, 12, '#fff4a0', true);
  sparkle(ring, 20, 18, '#ffc8f0');
  sparkle(ring, 17, 11, '#ffffff');
  return ring.px(14, 19, '#fff4a0').px(21, 13, '#ffffff').px(10, 17, '#ffc8f0');
};

// ---------------------------------------------------------------------------
// Dinodalen
// ---------------------------------------------------------------------------

/** A fern frond: a curved stalk from a (bent towards b) to c, with pairs of leaflets slanting to the tip, shorter further out. */
const frond = (p: Px, a: XY, b: XY, c: XY, rib: string, leaf: string, tip: string): void => {
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = bez(a, b, c, t);
    const [x2, y2] = bez(a, b, c, Math.min(1, t + 0.04));
    const l = Math.hypot(x2 - x, y2 - y) || 1;
    const dx = (x2 - x) / l;
    const dy = (y2 - y) / l;
    p.px(Math.round(x), Math.round(y), rib);
    if (i % 3 === 0 && t > 0.08 && t < 0.97) {
      const len = 1 + (1 - t) * 2;
      for (const side of [-1, 1]) {
        const ex = x + (-dy * side * 0.9 + dx * 0.6) * len;
        const ey = y + (dx * side * 0.9 + dy * 0.6) * len;
        p.line(Math.round(x), Math.round(y), Math.round(ex), Math.round(ey), t > 0.65 ? tip : leaf);
      }
    }
  }
};
// Feathery fronds have no outline (like the grass tufts); a dark green shadow under them keeps them readable.
const fern = (): Px => {
  const fronds = (shadow?: string) => {
    const p = new Px(16, 18);
    const k = (c: string) => shadow ?? c;
    frond(p, [7, 17], [4, 5], [1, 4], k('#2f7a2e'), k('#3f9a3a'), k('#5cb24a'));
    frond(p, [8, 17], [11, 4], [14, 3], k('#2f7a2e'), k('#3f9a3a'), k('#5cb24a'));
    frond(p, [7, 17], [1, 12], [0, 15], k('#3a8e36'), k('#52b046'), k('#7ad05a'));
    frond(p, [8, 17], [14, 12], [15, 15], k('#3a8e36'), k('#52b046'), k('#7ad05a'));
    return p;
  };
  return new Px(16, 18).blit(fronds('#1c3e1c'), 0, 1).blit(fronds(), 0, 0);
};

const BONE = '#f2e8cc';
const BONE_L = '#fffaf0';
const BONE_D = '#d2c29c';
const BONE_X = '#a8946e';
const dinoBones = (): Px => {
  const p = new Px(48, 36);
  const SAND = '#c27a4c';
  const SAND_L = '#dc9a68';
  const SAND_D = '#a4623a';
  // sand heaped up behind the bones
  p.ellipse(13, 21, 28, 9, SAND).ellipse(16, 21, 18, 3, SAND_L);
  // ribs hanging from the arched spine down into the sand
  const s0: XY = [16, 15];
  const s1: XY = [27, 3];
  const s2: XY = [39, 12];
  for (const t of [0.14, 0.32, 0.5, 0.68, 0.85]) {
    const [x, y] = bez(s0, s1, s2, t);
    curve(p, [Math.round(x), Math.round(y)], [x - 5, (y + 27) / 2], [Math.round(x - 2), 27], 2, 2, BONE);
  }
  curve(p, s0, s1, s2, 3, 3, BONE);
  // the tail curls down into the sand
  curve(p, [39, 12], [45, 13], [46, 25], 3, 2, BONE);
  // knobbly vertebrae
  for (let t = 0.06; t < 1; t += 0.11) {
    const [x, y] = bez(s0, s1, s2, t);
    p.px(Math.round(x), Math.round(y) - 2, BONE).px(Math.round(x) + 1, Math.round(y) + 1, BONE_X);
  }
  for (const [x, y] of [[43, 13], [45, 17], [46, 21]] as const) p.px(x, y, BONE_X);
  // sand in front covers the ends of the ribs and the tail
  p.ellipse(12, 25, 30, 7, SAND).ellipse(14, 25, 22, 2, SAND_L).ellipse(16, 29, 22, 3, SAND_D);
  p.ellipse(39, 23, 9, 6, SAND).ellipse(40, 23, 5, 2, SAND_L);
  // the skull: a big round eye and a smile
  p.ellipse(5, 9, 13, 12, BONE).ellipse(0, 13, 13, 10, BONE);
  p.ellipse(2, 19, 11, 5, BONE_D);
  p.ellipse(9, 11, 6, 6, '#4a3828').rect(10, 12, 3, 3, '#2b2419').px(10, 12, '#ffffff');
  p.rect(2, 15, 2, 1, BONE_X);
  p.line(2, 19, 10, 19, BONE_X).line(10, 19, 13, 17, BONE_X);
  for (const x of [4, 7]) p.px(x, 20, BONE_L);
  p.ellipse(0, 23, 17, 6, SAND).ellipse(2, 23, 10, 2, SAND_L).ellipse(3, 27, 12, 2, SAND_D);
  // a loose bone in front, the cute kind
  p.rect(20, 31, 9, 2, BONE).circle(19.5, 31, 1.5, BONE).circle(19.5, 33, 1.5, BONE).circle(29.5, 31, 1.5, BONE).circle(29.5, 33, 1.5, BONE);
  rim(p, BONE, BONE_L, BONE_D);
  return p.outline(OUTLINE);
};

const fossilRock = (): Px => {
  const p = new Px(16, 16);
  p.ellipse(0, 4, 16, 12, '#a8703e').ellipse(1, 3, 14, 11, '#dca46a').ellipse(2, 3, 8, 5, '#f2c890');
  p.rect(2, 7, 12, 1, '#c48a52').rect(3, 13, 10, 1, '#c48a52');
  // an ammonite pressed into a split face of the stone: two turns of a spiral
  p.ellipse(3, 5, 11, 10, '#ecc28c');
  for (let a = 0; a <= Math.PI * 4; a += 0.03) {
    const r = 0.5 + 0.33 * a;
    p.px(Math.round(8 + Math.cos(a) * r - 0.5), Math.round(9.5 + Math.sin(a) * r - 0.5), '#8a5a32');
  }
  return p.outline(OUTLINE);
};

// ---------------------------------------------------------------------------
// Godislandet
// ---------------------------------------------------------------------------

const LOLLIES = [
  ['#f0468a', '#ff8ab8', '#b8286a'],
  ['#36a6f0', '#8ad2ff', '#1a6ab4'],
  ['#f5c518', '#ffe676', '#c08a0c'],
] as const;
const lollipopTree = (v: number): Px => {
  const p = new Px(24, 36);
  const [C, CL, CD] = LOLLIES[v % LOLLIES.length]!;
  p.rect(11, 18, 2, 18, '#fbf7f2').rect(12, 18, 1, 18, '#d9d0cc');
  const cx = 12;
  const cy = 10.5;
  const R = 10.6;
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 24; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r > R) continue;
      const s = Math.atan2(dy, dx) / (Math.PI * 2) + r / 9;
      const band = (((s * 2) % 1) + 1) % 1 < 0.5;
      let c = band ? C : '#fffaf4';
      if (dx + dy > R * 0.75 || r > R - 1) c = band ? CD : '#e6dce2';
      else if (dx + dy < -R * 0.5) c = band ? CL : '#ffffff';
      p.px(x, y, c);
    }
  p.rect(5, 6, 1, 3, '#ffffff').rect(6, 4, 2, 1, '#ffffff');
  return p.outline(OUTLINE);
};

const candyCane = (): Px => {
  const p = new Px(16, 24);
  const path: [number, number][] = [];
  for (let y = 22.5; y >= 8; y -= 0.25) path.push([9.5, y]);
  for (let a = 0; a <= Math.PI; a += 0.04) path.push([6.5 + 3 * Math.cos(a), 8 - 3 * Math.sin(a)]);
  for (let y = 8; y <= 11; y += 0.25) path.push([3.5, y]);
  const along: number[] = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]));
  // stuck in a little heap of sugar with sprinkles
  p.ellipse(4, 21, 10, 3, '#fde4ee');
  for (const [x, y, c] of [[5, 22, '#5ac8f0'], [12, 22, '#f0d040'], [7, 23, '#7ad86a'], [11, 21, '#f05a8a']] as const) p.px(x, y, c);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 16; x++) {
      let best = Infinity;
      let bi = 0;
      for (let i = 0; i < path.length; i++) {
        const d = Math.hypot(x + 0.5 - path[i]![0], y + 0.5 - path[i]![1]);
        if (d < best) [best, bi] = [d, i];
      }
      if (best > 2.1) continue;
      const [qx, qy] = path[bi]!;
      const [nx2, ny2] = path[Math.min(bi + 1, path.length - 1)]!;
      const tl = Math.hypot(nx2 - qx, ny2 - qy) || 1;
      const side = ((nx2 - qx) * (y + 0.5 - qy) - (ny2 - qy) * (x + 0.5 - qx)) / tl;
      const stripe = Math.floor((along[bi]! + side * 0.9) / 2.4) % 2 === 0;
      const light = best < 0.01 ? 0 : (-(x + 0.5 - qx) - (y + 0.5 - qy)) / best;
      let c = stripe ? '#e0343a' : '#fbf6f0';
      if (best > 1.1 && light < -0.3) c = stripe ? '#a82228' : '#d6ccc8';
      else if (best > 0.5 && light > 0.4) c = stripe ? '#ff6a6a' : '#ffffff';
      p.px(x, y, c);
    }
  return p.outline(OUTLINE);
};

// ---------------------------------------------------------------------------
// Buried treasure, and the moon
// ---------------------------------------------------------------------------

const digSpot = (): Px => {
  const p = new Px(16, 16);
  const R = '#d4302a';
  // two painted brush strokes, a soft dark edge and scuffed sand around them
  curve(p, [3, 3], [7, 7], [12, 12], 3, 2, R);
  curve(p, [12, 3], [8, 7], [3, 12], 3, 2, R);
  rim(p, R, '#f2604a', '#961c18');
  p.outline('#2b2419b0');
  for (const [x, y] of [[1, 7], [14, 8], [7, 0], [8, 15], [1, 14], [14, 1], [15, 13], [0, 2]] as const) p.px(x, y, '#2b241940');
  return p;
};

const crater = (): Px => {
  const p = new Px(32, 32);
  const cx = 16;
  const cy = 16.5;
  // see-through shading, so it sits on whatever the moon's dust looks like
  const e = (x: number, y: number, ox: number, oy: number, rx: number, ry: number) => ((x - ox) / rx) ** 2 + ((y - oy) / ry) ** 2;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = e(px, py, cx, cy, 14, 12);
      if (d > 1) continue;
      const facing = -((px - cx) / 14 + (py - cy) / 12) / Math.max(Math.sqrt(d), 0.01) / Math.SQRT2; // 1 = towards the light
      let c: string;
      if (e(px, py, cx, cy, 11, 9.2) > 1) c = facing > 0.3 ? '#ffffffa8' : facing > -0.25 ? '#ffffff40' : '#1c1c304c'; // the raised rim
      else if (e(px, py, cx + 2.6, cy + 2.2, 11, 9.2) > 1) c = '#1c1c3090'; // the inner wall in shadow
      else if (e(px, py, cx - 1.8, cy - 1.6, 10.6, 8.9) > 1) c = '#ffffff70'; // the inner wall in the light
      else c = '#1c1c3034'; // the floor
      p.px(x, y, c);
    }
  // pebbles thrown out by the impact
  for (const [x, y] of [[2, 9], [29, 12], [4, 26], [27, 28], [15, 1], [24, 3], [9, 30]] as const) p.px(x, y, '#ffffffb0').px(x + 1, y + 1, '#1c1c3070');
  return p;
};

const moonRock = (): Px => {
  const p = new Px(16, 16);
  const D = '#5d5d70';
  const M = '#8a8a9e';
  const L = '#b0b0c4';
  p.ellipse(1, 5, 14, 10, D).ellipse(9, 4, 6, 7, D);
  p.ellipse(2, 4, 12, 9, M).ellipse(9, 4, 5, 6, M);
  p.ellipse(3, 5, 5, 3, L).px(4, 5, '#d4d4e2').px(10, 5, L);
  // little craters: shadow at the top-left, a lit lip at the bottom-right
  for (const [x, y] of [[6, 9], [10, 7], [9, 11], [3, 9]] as const) p.px(x, y, D).px(x + 1, y, D).px(x, y + 1, D).px(x + 1, y + 1, '#7a7a8e').px(x + 2, y + 1, L).px(x + 1, y + 2, L);
  return p.outline(OUTLINE);
};

const STAR: Gem = { d: '#c8a850', m: '#ecd890', l: '#fff6cc', c: '#ffffff', t: '#ffffff' };
const starCrystal = (): Px => {
  const p = new Px(16, 20);
  p.blit(new Px(16, 20).ellipse(1, 14, 14, 5, '#6e6e80').ellipse(2, 14, 9, 3, '#9a9aae').outline(OUTLINE), 0, 0);
  crystals(p, [[[5, 18], [2.5, 8], 3.6], [[11, 18], [13.5, 7], 3.6], [[8, 19], [8, 2], 4.6], [[10.5, 19], [12, 14.5], 2.6]], STAR);
  sparkle(p, 2, 3, '#fff4b0', true);
  sparkle(p, 13, 2, '#fff4b0');
  return p.px(14, 12, '#fff4b0').px(1, 12, '#ffffff');
};

const moonCheese = (): Px => {
  const p = new Px(16, 16);
  // a chunky wedge, pointing left: the sloping top, the front and the rind at the thick end
  poly(p, [[1, 10], [12, 3], [15, 7]], '#ffe680');
  poly(p, [[1, 10], [15, 7], [15, 14], [1, 13]], '#f8c63a');
  p.rect(14, 7, 1, 7, '#e0a020').rect(1, 13, 14, 1, '#e0a020');
  // round holes, shadowed at the top-left inside
  for (const [x, y, w, h] of [[4, 10, 3, 2], [9, 9, 3, 3], [12, 11, 2, 2], [8, 6, 2, 1], [11, 4, 2, 1]] as const) {
    p.ellipse(x, y, w, h, '#d49a1c').px(x + (w > 2 ? 1 : 0), y, '#a87010');
  }
  p.rect(2, 10, 3, 1, '#fff0b0').px(6, 8, '#fff6d0');
  return p.outline(OUTLINE);
};

// The Earth seen from the moon: Europe and Africa facing us, the night side to the lower right.
const DEG = Math.PI / 180;
interface Land {
  /** lon, lat, lon, lat, … (a flat array: thousands of points get tested at boot) */
  pts: Float64Array;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const land = (flat: number[]): Land => {
  const xs = flat.filter((_, i) => i % 2 === 0);
  const ys = flat.filter((_, i) => i % 2 === 1);
  return { pts: Float64Array.from(flat), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
// rough coastlines, [lon, lat, lon, lat, …]
const LANDS = [
  // Africa
  [-5.9, 35.8, -2, 35.1, 3, 36.8, 10.2, 37.2, 11, 35, 10.2, 33.8, 12.5, 32.8, 15.2, 32.3, 19, 30.3, 20, 31.9, 23, 32.6, 25.2, 31.6, 29, 30.9, 31, 31.5, 32.3, 31.2, 32.6, 29.9, 33.6, 27.5, 35.2, 24, 37.2, 21, 38.6, 18, 40, 15.5, 41.7, 13.5, 43.3, 12, 44.5, 10.4, 47, 11.1, 51.2, 11.8, 51, 10.4, 49.5, 7.5, 48, 4.5, 44, 1, 41.6, -1.7, 39.3, -5, 39.5, -8, 40.4, -10.5, 40.6, -15, 37, -17.5, 35.3, -22, 35.5, -24, 32.9, -26, 32.4, -29, 30, -31.5, 27, -33.8, 22, -34.2, 20, -34.8, 18.4, -34.2, 17.8, -32, 15, -27, 14.4, -23, 13, -20, 11.8, -17, 12.5, -13, 13.3, -9, 12.2, -6, 11.8, -3.5, 9.3, -1, 9.6, 2.5, 9.6, 4, 8.5, 4.6, 6, 4.3, 4.5, 6.2, 1.5, 6.1, -2, 4.8, -4, 5.2, -7.5, 4.4, -9.5, 5.5, -11.5, 7, -13.2, 8.5, -15, 11, -16.7, 12.5, -17.5, 14.7, -16.5, 16.5, -16.3, 19.5, -17, 21, -15, 24, -13.2, 27.5, -11, 28.5, -9.8, 30.5, -9.2, 32.5, -6.8, 34],
  // Madagascar
  [49.3, -12, 50.4, -15.5, 49.7, -17.5, 48, -22, 47.1, -24.9, 45.2, -25.6, 43.7, -23.5, 43.4, -21.5, 44.4, -19, 44, -16.5, 46.4, -15.7, 48, -13.5],
  // Eurasia
  [-5.6, 36, -6.4, 36.8, -7.4, 37.2, -8.9, 37, -8.8, 38.7, -9.5, 39.4, -8.7, 41.2, -8.9, 42.8, -9.3, 43, -7.7, 43.7, -4, 43.5, -1.8, 43.4, -1.2, 44.6, -1.2, 46.2, -2.2, 47.2, -4.5, 47.9, -4.7, 48.5, -3, 48.8, -1.6, 48.7, -1.8, 49.7, 0.2, 49.5, 1.6, 50.2, 1.8, 51, 3.2, 51.3, 4.4, 51.9, 4.7, 52.9, 5.6, 53.4, 7, 53.5, 8.6, 53.9, 8.6, 55, 8.1, 55.6, 8.2, 56.8, 8.6, 57.1, 10, 57.6, 10.6, 57.7, 10.5, 57.2, 10.3, 56.3, 10.9, 56.3, 10.2, 55.7, 12, 55.6, 12.6, 55.7, 12.2, 55, 11, 54.5, 10.8, 54, 12.3, 54.2, 14.2, 53.95, 16, 54.3, 18.6, 54.5, 19.9, 54.8, 21.1, 55.4, 21.1, 56.5, 21.6, 57.4, 22.6, 57.7, 24.1, 57, 24.4, 58.4, 23.5, 58.9, 24.8, 59.45, 28, 59.5, 30.2, 59.9, 29, 60.2, 27, 60.5, 25, 60.2, 22.9, 59.9, 22.3, 60.4, 21.4, 60.9, 21.5, 61.7, 21.1, 62.5, 22, 63.2, 23.3, 63.9, 24.8, 64.8, 25.4, 65, 25.3, 65.5, 24.2, 65.8, 22.3, 65.8, 21.5, 65.3, 21.2, 64.6, 20.3, 63.8, 19, 63.3, 18, 62.6, 17.3, 61.7, 17.2, 60.7, 18.5, 60.2, 18.9, 59.7, 18.2, 59.3, 17, 58.7, 16.6, 57.9, 16.5, 57, 16.4, 56.3, 15.6, 56.2, 14.6, 56, 14.2, 55.4, 13.4, 55.35, 12.9, 55.4, 12.8, 56, 12.5, 56.3, 12.9, 56.6, 12, 57.4, 11.9, 57.7, 11.6, 58.2, 11.2, 58.9, 10.8, 59.2, 10.6, 59.9, 10.2, 59.1, 9.3, 58.8, 8, 58.1, 6.6, 58.1, 5.6, 58.7, 5.5, 59.3, 5.2, 60.4, 4.9, 61, 5, 62, 6.2, 62.6, 7.5, 63, 8.6, 63.5, 10, 64, 11.2, 64.9, 12.3, 65.8, 13, 66.6, 14.4, 67.3, 15.5, 68.2, 16, 68.9, 17.6, 69.4, 19, 69.8, 21, 70.2, 23, 70.6, 25.8, 71.1, 27.8, 71, 29, 70.6, 30.9, 70.3, 31, 69.8, 33.1, 69.3, 36, 69.1, 39.8, 68, 41.2, 67.2, 40.5, 66.3, 38, 66.1, 34.5, 66.5, 34, 65.3, 35, 64.4, 37, 63.9, 38, 64.6, 40.5, 64.6, 42, 66.4, 44, 66.2, 44.2, 67.9, 46, 67.8, 49, 68, 53, 68.6, 57.5, 68.6, 60.5, 69.6, 66, 69.4, 68, 68.2, 69, 69, 67, 70.5, 68.5, 72.5, 72, 73, 80, 73.5, 87, 75, 100, 77, 104, 77.6, 113, 73.6, 128, 73, 140, 72.5, 150, 71.5, 160, 70, 170, 69.8, 180, 68.8, 180, 64, 170, 60, 160, 60, 150, 59.5, 140, 54, 141, 48, 135, 43, 130, 42.5, 129.5, 35.5, 126.5, 34.5, 126, 37.5, 124.5, 40, 121.5, 39, 121.5, 40.5, 118, 39, 119, 37, 122.5, 37.4, 120.3, 36, 119.2, 35, 120.9, 32, 121.9, 30.9, 121.5, 28.5, 119.6, 25.5, 117, 23.5, 114, 22.3, 110.5, 21, 108, 21.6, 106.5, 20, 105.7, 18.8, 106.5, 17.4, 108.5, 15.5, 109.2, 12, 107, 10.4, 105, 8.7, 104.8, 10.5, 103, 11, 101, 12.7, 100, 13.4, 99.2, 10.2, 100.4, 7.4, 101.2, 6.8, 102.5, 6, 103.4, 4.3, 103.5, 2.6, 104.2, 1.4, 103.4, 1.3, 101.3, 2.8, 100.4, 4.5, 100.2, 6, 98.4, 8, 98.6, 10, 98.5, 12.5, 97.6, 16.5, 96.2, 16.8, 94.6, 16, 94.3, 18.6, 93.5, 19.9, 92.3, 20.9, 91.8, 22.3, 90.5, 22, 89, 21.8, 87, 21.5, 86.8, 20.5, 85, 19.4, 83.3, 17.6, 82.3, 16.6, 80.3, 15.8, 80.2, 13, 79.8, 10.3, 78.2, 8.9, 77.5, 8.1, 76.3, 9.9, 75, 12.5, 73.8, 15.4, 72.8, 19, 72.7, 21, 70.4, 21, 69, 22.3, 70.3, 22.9, 68.6, 23.6, 67, 24.8, 66.6, 25.4, 64.5, 25.2, 61.6, 25.2, 58.8, 25.6, 57.3, 25.8, 56.4, 27.1, 54.8, 26.5, 53.5, 26.8, 51.4, 27.9, 50.2, 29.9, 49, 30.4, 48, 30, 48.4, 28.5, 49.7, 27, 50.2, 26.2, 51.6, 25.9, 51.6, 24.6, 52.5, 24.2, 54.4, 24.3, 55.4, 25.3, 56, 26.1, 56.4, 26.3, 56.3, 24.9, 57.3, 23.9, 58.6, 23.6, 59.8, 22.4, 58.8, 21, 57.8, 19.5, 56.7, 18, 55.3, 17.3, 52.5, 16.2, 49.5, 14.7, 48.5, 14, 45.5, 13, 43.5, 12.7, 42.8, 15, 42.6, 16.5, 41.3, 19, 39.2, 21.5, 38.5, 23.6, 37.4, 24.8, 36.5, 26, 35.2, 28, 34.9, 29.5, 34.4, 28, 33.6, 28.3, 32.6, 29.9, 32.3, 31.2, 34.2, 31.3, 34.9, 32.8, 35.5, 34, 35.8, 35.6, 36.1, 36.6, 35, 36.8, 34, 36.3, 32.5, 36.1, 30.6, 36.8, 29.6, 36.2, 28.2, 36.7, 27.3, 37, 26.5, 38.4, 26.2, 40, 26.6, 40.6, 26, 40.8, 24.5, 40.9, 23.8, 40.2, 22.6, 40, 22.9, 39.2, 23.2, 38.2, 24, 38, 23, 36.5, 22.4, 36.4, 21.7, 36.8, 21.1, 37.8, 21.6, 38.4, 20.7, 39, 20, 39.7, 19.4, 40.3, 19.4, 41.8, 18.5, 42.5, 17, 43.3, 15.2, 44.3, 14, 45, 13.7, 45.6, 12.3, 45.4, 12.5, 44.5, 13.6, 43.5, 14.5, 42.1, 16, 41.4, 18, 40.6, 18.5, 40.1, 17.2, 40.4, 16.5, 39.6, 17.1, 39, 16.6, 38.4, 16, 37.9, 15.6, 38.3, 15.8, 39.6, 14.8, 40.3, 14.2, 40.8, 13, 41.3, 11.8, 42.1, 10.5, 42.9, 10, 44, 8.8, 44.4, 7.5, 43.8, 6.2, 43.1, 4.6, 43.4, 3.2, 43, 3.2, 41.9, 2.2, 41.4, 0.9, 41, -0.3, 39.5, 0.2, 38.8, -0.5, 38.3, -0.8, 37.6, -2.1, 36.7, -4.4, 36.7],
  // Great Britain, Ireland, Iceland
  [-5.7, 50, 1.4, 51.2, 1.7, 52.6, 0.2, 53.5, -1.3, 54.8, -2, 55.8, -3, 56, -1.8, 57.6, -3, 58.6, -5, 58.6, -5.8, 57.5, -5.6, 56.3, -4.8, 55, -3.2, 54.6, -3, 53.4, -4.6, 53.3, -4.2, 52.4, -5.3, 51.8, -3, 51.4, -4.2, 51.1],
  [-6, 52.2, -6.1, 53.8, -5.5, 54.6, -7, 55.3, -8.3, 55.2, -10, 54.2, -9.8, 53, -10.4, 52.1, -9.5, 51.5, -8, 51.8],
  [-22, 64, -24, 65.5, -22, 66.4, -16, 66.5, -13.6, 65.2, -15, 64.3, -18.5, 63.4],
  // South America
  [-80, 9, -77, 8.7, -75.5, 10.5, -72, 12, -71, 10.8, -68, 10.5, -63, 10.7, -61, 10.2, -60, 8.5, -57.5, 6, -54, 5.8, -51.5, 4.5, -50, 1.8, -48.5, -1.3, -44, -2.5, -41, -2.9, -38.5, -3.7, -35.2, -5.5, -34.8, -7.5, -35, -9.4, -38.5, -13, -39, -17.7, -40.5, -20.3, -42, -22.9, -44.5, -23.3, -48.5, -26, -48.6, -28.5, -51, -31, -53.4, -33.7, -56, -34.9, -57.3, -36.2, -57.6, -38.1, -62.3, -38.9, -65, -41, -65, -45, -67.5, -46.5, -69, -51.5, -68.4, -52.4, -70, -53.5, -74.5, -52, -75.5, -46.6, -73.5, -41.5, -73.6, -37, -71.6, -33, -71.4, -28.5, -70.2, -18.5, -75, -15.5, -77.2, -12, -80, -7.5, -81.2, -4.5, -80.3, -0.5, -78.7, 1.5, -77.3, 4, -77.4, 7.8],
  // North America and Baffin Island
  [-80, 25.2, -80.5, 28, -81.5, 31, -76, 35, -76, 37, -74, 40.5, -70, 41.5, -70.5, 43.5, -66.5, 45, -64, 45.5, -61, 45.5, -60, 47, -56, 52, -58, 54.5, -61.5, 56.5, -64.5, 60.3, -70, 59, -77, 62.5, -80, 65, -90, 68, -110, 68, -125, 70, -140, 70, -160, 71, -165, 65, -150, 60, -135, 57, -125, 49, -117, 32, -105, 20, -92, 15, -86, 12, -83, 8.5, -77.5, 8.3, -79.5, 9.5, -83.5, 11, -83.5, 15, -87.5, 16, -88, 21.5, -90.5, 21.2, -91, 19, -94.5, 18.3, -97.5, 22, -97.2, 28, -94, 29.5, -89.5, 29.5, -84, 30, -82.6, 28],
  [-62, 66.5, -65, 62.5, -72, 62.5, -78, 64.5, -84, 68, -90, 71, -82, 73.5, -72, 72, -66, 68.5],
].map(land);
const GREENLAND = land([-73, 78, -60, 82, -30, 83.5, -20, 81.5, -18, 77, -21, 72, -22, 70.5, -26, 68.5, -32, 68, -38, 65.5, -43, 60, -48, 61, -51, 64, -53.5, 67, -54, 70, -58, 75, -66, 76]);
const SEAS = [
  // Black Sea, Caspian Sea, Hudson Bay
  [28, 41.2, 28.6, 43.4, 29.7, 45.2, 30.8, 46.5, 32, 46.4, 33.6, 46.1, 32.5, 45.4, 33.5, 44.4, 35.4, 45, 36.6, 45.4, 38.3, 47.1, 39.3, 47.2, 38.2, 46.3, 37.4, 45.3, 38.4, 44.4, 39.8, 43.5, 41.6, 41.6, 40.2, 41, 38, 40.9, 36, 41.7, 34, 42, 32, 41.8, 30, 41.2],
  [47, 44.5, 47.5, 45.6, 49, 46.4, 51, 47, 53, 46.8, 53.2, 45.3, 51.3, 44.5, 51.3, 43.2, 52.7, 41.8, 53, 40, 53.9, 39, 54, 37.3, 51, 36.7, 49, 37.6, 49, 38.9, 49.4, 40.3, 50.3, 40.4, 49.5, 41, 48.5, 41.8, 47.5, 43],
  [-95, 59, -93, 61.5, -87.5, 64.3, -82, 63.5, -78, 60.5, -77.5, 56, -79.5, 51.5, -82.5, 52.5, -85, 55.3, -90, 57],
].map(land);
const inLand = (l: Land, lon: number, lat: number): boolean => {
  if (lon < l.x0 || lon > l.x1 || lat < l.y0 || lat > l.y1) return false;
  const a = l.pts;
  let inside = false;
  for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
    const yi = a[i + 1]!;
    const yj = a[j + 1]!;
    if (yi > lat !== yj > lat && lon < ((a[j]! - a[i]!) * (lat - yi)) / (yj - yi) + a[i]!) inside = !inside;
  }
  return inside;
};

const EARTH: Record<string, string[]> = {
  ocean: ['#0a1634', '#173a7a', '#1f56ac', '#286cca', '#3584e0'],
  green: ['#0e1c12', '#29502c', '#3c8a3a', '#4ca244', '#62b852'],
  forest: ['#0b170f', '#1e3e24', '#2a6a30', '#33803a', '#43963f'],
  savanna: ['#17180e', '#4a5228', '#8a9a3e', '#a2ae4a', '#b8c25c'],
  desert: ['#1c1810', '#5e4c2c', '#b88e4c', '#d2a85e', '#e6c478'],
  steppe: ['#18160f', '#4e4630', '#9a8a5a', '#b0a06a', '#c4b67e'],
  tundra: ['#16181a', '#4e5450', '#8e9a88', '#a8b4a0', '#c2ccb8'],
  ice: ['#1c2232', '#6a7488', '#c8d2de', '#e4eaf2', '#ffffff'],
  cloud: ['#1e2638', '#788498', '#d2dae6', '#eef2f8', '#ffffff'],
};
const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(r1 + (r2 - r1) * t) + h(g1 + (g2 - g1) * t) + h(b1 + (b2 - b1) * t);
};
const noise2 = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (a: number, b: number) => hash2(a + 1000, b + 1000) / 1000;
  const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx;
  const bot = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
};
const box = (lat: number, lon: number, la0: number, la1: number, lo0: number, lo1: number) => lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1;
const landKind = (lat: number, lon: number): string => {
  if (Math.abs(lat) > 68) return 'tundra';
  if (box(lat, lon, 15, 31, -17, 33) || box(lat, lon, 12, 31, 34, 60) || box(lat, lon, 25, 38, 45, 68) || box(lat, lon, 38, 46, 85, 115)) return 'desert';
  if (box(lat, lon, 36, 50, 48, 85) || box(lat, lon, -30, -17, 11, 26) || box(lat, lon, 29, 40, 75, 100)) return 'steppe';
  if (box(lat, lon, 10, 15, -17, 40) || box(lat, lon, -17, -8, 12, 38)) return 'savanna';
  if (box(lat, lon, 56, 68, -180, 180) || box(lat, lon, -8, 5, -78, -40) || box(lat, lon, -5, 5, 8, 30)) return 'forest';
  return 'green';
};

/** Where the cloud noise starts: this one leaves Europe and Africa clear. */
const CLOUD_SEED = 3;
const earth = (): Px => {
  const p = new Px(64, 64);
  const R = 30.5;
  const lat0 = 22 * DEG;
  const lon0 = 12 * DEG;
  const ll = Math.hypot(-0.65, 0.35, 0.45);
  const [Lx, Ly, Lz] = [-0.65 / ll, 0.35 / ll, 0.45 / ll];
  const hl = Math.hypot(Lx, Ly, Lz + 1);
  const [Hx, Hy, Hz] = [Lx / hl, Ly / hl, (Lz + 1) / hl];
  // 4000 pixels: written straight into the image rather than one fillRect each
  const img = p.ctx.createImageData(64, 64);
  const put = (px: number, py: number, hex: string) => {
    const [r, g, b] = hexToRgb(hex.slice(0, 7));
    const i = (py * 64 + px) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) : 255;
  };
  for (let py = 0; py < 64; py++)
    for (let px = 0; px < 64; px++) {
      const x = (px + 0.5 - 32) / R;
      const y = -(py + 0.5 - 32) / R;
      const rr = x * x + y * y;
      if (rr > 1) {
        // a thin glow of air around the lit side
        if (rr < (1 + 1.6 / R) ** 2 && x * Lx + y * Ly > -0.25) put(px, py, '#7cc8ff66');
        continue;
      }
      const z = Math.sqrt(1 - rr);
      const wy = y * Math.cos(lat0) + z * Math.sin(lat0);
      const wz = -y * Math.sin(lat0) + z * Math.cos(lat0);
      const lat = Math.asin(wy) / DEG;
      let lon = (lon0 + Math.atan2(x, wz)) / DEG;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      const dot = x * Lx + y * Ly + z * Lz;
      const level = dot < -0.04 ? 0 : dot < 0.1 ? 1 : dot < 0.4 ? 2 : dot < 0.72 ? 3 : 4;
      // what is there
      const jl = lat + (noise2(lon / 6, lat / 6) - 0.5) * 6;
      let kind = 'ocean';
      if (inLand(GREENLAND, lon, lat)) kind = 'ice';
      else if (LANDS.some((l) => inLand(l, lon, lat)) && !SEAS.some((l) => inLand(l, lon, lat))) kind = landKind(jl, lon);
      if (lat > 77 || lat < -66) kind = 'ice';
      // streaky clouds: a band along the equator, few over the deserts
      const n = noise2(lon / 30 + CLOUD_SEED, lat / 8) * 0.6 + noise2(lon / 12, lat / 4 + CLOUD_SEED) * 0.3 + noise2(lon / 5, lat / 2.5) * 0.1;
      const band = Math.abs(lat - 5) < 6 ? 0.07 : Math.abs(lat) > 14 && Math.abs(lat) < 32 ? -0.12 : 0;
      const cloud = n + band;
      const sweden = lat > 54 && lat < 71 && lon > 3 && lon < 32; // clear skies over home
      if (!sweden && (cloud > 0.66 || (cloud > 0.61 && (px + py) % 2 === 0))) kind = 'cloud';
      let c = EARTH[kind]![level]!;
      if (level === 0 && kind !== 'ocean' && kind !== 'cloud' && kind !== 'ice' && hash2(px * 3, py * 7) % 100 < 14) c = hash2(px, py) % 3 ? '#ffd45a' : '#ffb040';
      if (kind === 'ocean' && level >= 3) {
        const spec = x * Hx + y * Hy + z * Hz;
        if (spec > 0.995) c = '#d8eeff';
        else if (spec > 0.982) c = '#9cd0ff';
      }
      if (rr > 0.86 && level >= 2) c = mix(c, '#9ad8ff', 0.3);
      put(px, py, c);
    }
  p.ctx.putImageData(img, 0, 0);
  return p;
};

export function drawBiomeObjects(set: SetArt): void {
  set('blueberry_bush', [blueberryBush()]);
  set('cloudberry', [cloudberry()]);
  set('reed', [reed()], 0, -6);
  set('dead_tree', [deadTree()], -4, -20);
  set('wisp', frames(3, wisp), 0, -4, true);
  set('jungle_tree', [jungleTree()], -8, -24);
  set('banana_plant', [bananaPlant()], 0, -10);
  set('jungle_flower', frames(3, jungleFlower));
  set('ruin_pillar', [ruinPillar()], 0, -12);
  set('obsidian_rock', [obsidianRock()]);
  set('fire_crystal', [fireCrystal()], 0, -4);
  set('steam_vent', frames(3, steamVent), 0, 0, true);
  set('giant_mushroom', frames(2, giantMushroom), -4, -16);
  set('giant_glowshroom', [giantGlowshroom()], -4, -16);
  set('glowshroom', [glowshroom()]);
  set('fairy_ring', [fairyRing()]);
  set('fern', [fern()], 0, -2);
  set('dino_bones', [dinoBones()], 0, -4);
  set('fossil_rock', [fossilRock()]);
  set('lollipop_tree', frames(3, lollipopTree), -4, -20);
  set('candy_cane', [candyCane()], 0, -8);
  set('dig_spot', [digSpot()]);
  set('earth', [earth()]);
  set('crater', [crater()]);
  set('moon_rock', [moonRock()]);
  set('star_crystal', [starCrystal()], 0, -4);
  set('moon_cheese', [moonCheese()]);
}
