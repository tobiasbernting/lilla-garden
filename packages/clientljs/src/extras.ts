// Pictures for the cozy extras, drawn in code like the rest of the art and packed into the atlas: trees through the
// year (autumn colours, snow on the branches, blossom), butterflies, sparrows, fish, lily pads, a chimney for the
// village houses, and soft shapes for sunbeams and puddles.
import { upscale } from '@v1/art/hd.ts';
import { Px } from '@v1/art/px.ts';
import { HD, R } from '@v1/art/style.ts';
import { getArt } from '@v1/art/textures.ts';
import { atlas, whole, type Picture, type Sprite } from './atlas.ts';

/** Trees whose leaves turn; pines only get snow. */
export const DECIDUOUS = new Set(['tree', 'tree_apple', 'bush']);
export const SNOWY = new Set(['tree', 'tree_apple', 'bush', 'tree_pine']);
/** Autumn colours: gold, orange, red, and the brown of late November. */
export const AUTUMN = [
  { hue: 48, sat: 1.1, light: 1.05, leaf: [0.98, 0.8, 0.22] },
  { hue: 30, sat: 1.15, light: 1, leaf: [0.94, 0.52, 0.16] },
  { hue: 10, sat: 1, light: 0.92, leaf: [0.82, 0.24, 0.14] },
  { hue: 28, sat: 0.55, light: 0.85, leaf: [0.6, 0.42, 0.24] },
] as const;

export interface TreeSet {
  /** Per autumn colour: the frames. */
  autumn: Sprite[][];
  winter: Sprite[];
  spring: Sprite[];
}

export interface Extras {
  trees: Record<string, TreeSet>;
  /** White, tinted when drawn. */
  leaf: Sprite;
  /** Per colour: wings open, wings up. */
  butterflies: Sprite[][];
  /** Stand, peck, wings up, wings down. */
  bird: Sprite[];
  fish: Sprite[];
  /** Pads, then pads with a flower. */
  lilies: Sprite[];
  chimney: Sprite;
  /** Soft vertical shaft of light, brightest at the top. */
  beam: Sprite;
  /** Soft round puddle, white (tinted with the sky when drawn). */
  puddle: Sprite;
}

// ---- colour helpers ----

const rgb2hsl = (r: number, g: number, b: number): [number, number, number] => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};

const hsl2rgb = (h: number, s: number, l: number): [number, number, number] => {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
  };
  return [f(hue + 1 / 3), f(hue), f(hue - 1 / 3)];
};

/** Leaves: green enough, neither the dark outline nor a highlight. */
const isLeaf = (h: number, s: number, l: number): boolean => h > 60 && h < 175 && s > 0.2 && l > 0.16 && l < 0.88;

const hash = (x: number, y: number): number => {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

/** A copy of a picture with every pixel run through `fn` (0..1 colours; null keeps it). */
function remap(src: HTMLCanvasElement, fn: (r: number, g: number, b: number, x: number, y: number, at: (x: number, y: number) => [number, number, number, number]) => [number, number, number] | null): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const d = data.data;
  const at = (x: number, y: number): [number, number, number, number] => {
    if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0];
    const i = (y * w + x) * 4;
    return [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255, d[i + 3]! / 255];
  };
  const out = new ImageData(w, h);
  const o = out.data;
  o.set(d);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]! < 8) continue;
      const res = fn(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255, x, y, at);
      if (!res) continue;
      o[i] = Math.round(Math.max(0, Math.min(1, res[0])) * 255);
      o[i + 1] = Math.round(Math.max(0, Math.min(1, res[1])) * 255);
      o[i + 2] = Math.round(Math.max(0, Math.min(1, res[2])) * 255);
    }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c;
}

/** Autumn: the greens turn towards one colour, darker leaves redder, keeping the shading. */
const autumnOf = (src: HTMLCanvasElement, p: (typeof AUTUMN)[number]) =>
  remap(src, (r, g, b) => {
    const [h, s, l] = rgb2hsl(r, g, b);
    if (!isLeaf(h, s, l)) return null;
    return hsl2rgb(p.hue - (0.5 - l) * 22, Math.min(1, s * p.sat + 0.08), Math.min(0.95, l * p.light));
  });

/** Winter: snow lies on every upward-facing edge of the foliage. */
const winterOf = (src: HTMLCanvasElement) =>
  remap(src, (r, g, b, x, y, at) => {
    const [h, s, l] = rgb2hsl(r, g, b);
    if (!isLeaf(h, s, l)) return null;
    // how far below an edge (art pixels) this pixel is
    for (let k = 1; k <= 2 * R; k++) {
      const [ar, ag, ab, aa] = at(x, y - k);
      const [ah, as, al] = rgb2hsl(ar, ag, ab);
      if (aa < 0.5 || !isLeaf(ah, as, al)) return k <= R ? [0.95, 0.97, 1] : [0.84, 0.89, 0.96];
    }
    // the rest of the tree a little frosted
    return [r * 0.85 + 0.08, g * 0.85 + 0.09, b * 0.85 + 0.13];
  });

/** Spring: fresh light green, and apple trees in blossom. */
const springOf = (src: HTMLCanvasElement, blossom: boolean) =>
  remap(src, (r, g, b, x, y) => {
    const [h, s, l] = rgb2hsl(r, g, b);
    if (!isLeaf(h, s, l)) return null;
    const ax = Math.floor(x / R);
    const ay = Math.floor(y / R);
    if (blossom && l > 0.3 && hash(ax, ay) < 0.11) return hash(ay, ax) < 0.5 ? [1, 0.97, 0.98] : [1, 0.76, 0.86];
    return hsl2rgb(h - 10, Math.min(1, s * 1.05), Math.min(0.9, l * 1.07));
  });

/** Draws small pixel art at R× (HD is upscaled like the 2D game's other small art). */
const sized = (p: Px): HTMLCanvasElement => (HD ? upscale(p).canvas : p.canvas);

function butterfly(body: string, wing: string, tip: string): Px[] {
  const open = new Px(7, 5);
  open.rect(0, 0, 3, 2, wing).rect(4, 0, 3, 2, wing).rect(1, 2, 2, 2, wing).rect(4, 2, 2, 2, wing).px(0, 0, tip).px(6, 0, tip).rect(3, 0, 1, 5, body);
  const up = new Px(7, 5);
  up.rect(2, 0, 1, 3, wing).rect(4, 0, 1, 3, wing).px(2, 0, tip).px(4, 0, tip).rect(3, 1, 1, 4, body);
  return [open, up];
}

function sparrow(): Px[] {
  const BODY = '#8a5a3a';
  const BELLY = '#e8d8b8';
  const CAP = '#5a3a22';
  const BEAK = '#e0a040';
  const base = (p: Px, headY: number) => {
    p.rect(1, 2, 4, 3, BODY).rect(2, 4, 3, 1, BELLY).rect(0, 2, 1, 1, CAP); // tail
    p.rect(4, headY, 2, 2, BODY).px(4, headY, CAP).px(5, headY, CAP).px(5, headY + 1, '#1a1a1a').px(6, headY + 1, BEAK);
    return p;
  };
  const stand = base(new Px(7, 6), 1).px(2, 5, BEAK).px(4, 5, BEAK);
  const peck = base(new Px(7, 6), 3).px(2, 5, BEAK).px(4, 5, BEAK);
  const fly1 = base(new Px(7, 6), 1).rect(1, 0, 3, 2, CAP);
  const fly2 = base(new Px(7, 6), 1).rect(1, 4, 3, 2, CAP);
  return [stand, peck, fly1, fly2];
}

function lily(flower: boolean, v: number): Px {
  const p = new Px(9, 6);
  p.ellipse(0, 0, 9, 6, '#2f7a3a').ellipse(1, 0, 7, 5, '#4f9a48').px(4, 2, '#2f7a3a').px(5, 2, '#2f7a3a');
  p.clear(4 + (v % 2), 0, 2, 2); // the notch
  if (flower) p.rect(3, 1, 3, 3, v % 2 ? '#fff4f8' : '#ff9ac8').px(4, 2, '#ffe066');
  return p;
}

/** Bounding boxes (art pixels) of the separate panes in a lit-window picture. */
export function panesOf(lit: HTMLCanvasElement): { x: number; y: number; w: number; h: number }[] {
  const w = lit.width;
  const h = lit.height;
  const d = lit.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const seen = new Uint8Array(w * h);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || d[i * 4 + 3]! < 128) continue;
    // flood the pane, allowing the window bars (a gap of up to two art pixels) inside it
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w;
      const y = (j - x) / w;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -2 * R; dy <= 2 * R; dy++)
        for (let dx = -2 * R; dx <= 2 * R; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (seen[k] || d[k * 4 + 3]! < 128) continue;
          seen[k] = 1;
          stack.push(k);
        }
    }
    out.push({ x: x0 / R, y: y0 / R, w: (x1 - x0 + 1) / R, h: (y1 - y0 + 1) / R });
  }
  return out;
}

let extras: Extras | null = null;

export function loadExtras(): Extras {
  if (extras) return extras;
  const art = getArt();
  const pics: Picture[] = [];
  const add = (c: HTMLCanvasElement) => pics.push(whole(c)) - 1;

  // trees through the year
  const treeAt: Record<string, { autumn: number[][]; winter: number[]; spring: number[] }> = {};
  for (const kind of SNOWY) {
    const o = art.objects[kind];
    if (!o) continue;
    const frames = o.frames.map((f) => f.canvas);
    treeAt[kind] = {
      autumn: DECIDUOUS.has(kind) ? AUTUMN.map((p) => frames.map((f) => add(autumnOf(f, p)))) : [],
      winter: frames.map((f) => add(winterOf(f))),
      spring: DECIDUOUS.has(kind) ? frames.map((f) => add(springOf(f, kind === 'tree_apple'))) : [],
    };
  }

  const leafPx = new Px(4, 3).rect(0, 1, 3, 1, '#ffffff').rect(1, 0, 2, 3, '#ffffff').px(3, 1, '#b8b8b8');
  const leaf = add(sized(leafPx));
  const flyColours: [string, string, string][] = [
    ['#3a3a3a', '#f8f8f0', '#9a9a9a'], // kålfjäril
    ['#3a3a3a', '#f4e04a', '#c8a020'], // citronfjäril
    ['#2a2018', '#e8822a', '#2a2018'], // nässelfjäril
    ['#2a2a3a', '#7ab0ff', '#3a5ab0'], // blåvinge
  ];
  const butterflies = flyColours.map(([b, w, t]) => butterfly(b, w, t).map((p) => add(sized(p))));
  const bird = sparrow().map((p) => add(sized(p)));
  const fish = [new Px(6, 3).rect(1, 0, 4, 3, '#f08a2a').px(0, 1, '#f08a2a').rect(5, 0, 1, 3, '#d06a1a').px(4, 1, '#1a1a1a'), new Px(6, 3).rect(1, 0, 4, 3, '#c8d4e0').px(0, 1, '#c8d4e0').rect(5, 0, 1, 3, '#a0b0c0').px(4, 1, '#1a1a1a')].map((p) => add(sized(p)));
  const lilies = [lily(false, 0), lily(false, 1), lily(true, 0), lily(true, 1)].map((p) => add(sized(p.outline('#1f4a24'))));
  const chimney = add(sized(new Px(5, 8).rect(0, 1, 5, 7, '#7a7a80').rect(0, 0, 5, 2, '#9a9aa0').rect(0, 7, 5, 1, '#5a5a60').outline('#2b2419')));
  // a soft shaft: bright in the middle across, fading downwards
  const bc = document.createElement('canvas');
  bc.width = 16 * R;
  bc.height = 64 * R;
  const bctx = bc.getContext('2d')!;
  for (let y = 0; y < bc.height; y++) {
    const fade = 1 - (y / bc.height) * 0.75;
    const g = bctx.createLinearGradient(0, 0, bc.width, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${fade})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    bctx.fillStyle = g;
    bctx.fillRect(0, y, bc.width, 1);
  }
  const beam = add(bc);
  const pc = document.createElement('canvas');
  pc.width = 24 * R;
  pc.height = 10 * R;
  const pctx = pc.getContext('2d')!;
  const pg = pctx.createRadialGradient(12 * R, 5 * R, 0, 12 * R, 5 * R, 12 * R);
  pg.addColorStop(0, 'rgba(255,255,255,0.95)');
  pg.addColorStop(0.75, 'rgba(255,255,255,0.85)');
  pg.addColorStop(1, 'rgba(255,255,255,0)');
  pctx.scale(1, 10 / 24);
  pctx.fillStyle = pg;
  pctx.fillRect(0, 0, 24 * R, 24 * R);
  const puddle = add(pc);

  const all = atlas.addMany(pics);
  const trees: Record<string, TreeSet> = {};
  for (const [kind, t] of Object.entries(treeAt))
    trees[kind] = { autumn: t.autumn.map((fs) => fs.map((i) => all[i]!)), winter: t.winter.map((i) => all[i]!), spring: t.spring.map((i) => all[i]!) };
  extras = {
    trees,
    leaf: all[leaf]!,
    butterflies: butterflies.map((fs) => fs.map((i) => all[i]!)),
    bird: bird.map((i) => all[i]!),
    fish: fish.map((i) => all[i]!),
    lilies: lilies.map((i) => all[i]!),
    chimney: all[chimney]!,
    beam: all[beam]!,
    puddle: all[puddle]!,
  };
  atlas.flush();
  return extras;
}
