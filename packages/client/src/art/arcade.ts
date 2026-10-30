// Minigames: Spelhallen (the arcade in every city) with a machine per game, the prize counter, the score board, the
// hall's walls, carpet and door mat; the prizes you can take home; the family's TV; and the game cartridges' icons.
// The machines come in ARCADE_GAMES order, each in its game's colour. Neon is a light tube with a soft halo on what
// is behind it; light comes from the top-left like everywhere else.
import { ARCADE, ARCADE_GAMES } from '@lilla-garden/shared';
import { Px, hash2, shade } from './px.js';
import { OUTLINE } from './world.js';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;

const n = <T>(count: number, f: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => f(i));

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
/** A material's tones around one colour. */
const ramp = (c: string): Pal => pal(shade(c, 0.42), shade(c, 0.68), c, shade(c, 1.35), shade(c, 1.72));

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

/** Colours every pixel of a box that `f` gives a colour. */
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

// Light from the top-left and a little from the front.
const light = (nx: number, ny: number, nz: number): number => (nx * -0.45 + ny * -0.55 + nz * 0.7) / (Math.hypot(nx, ny, nz) || 1);
const tone = (c: Pal, v: number): string => (v > 0.985 ? c.l2 : v > 0.86 ? c.l : v > 0.42 ? c.b : v > 0.05 ? c.d : c.d2);

/** A rounded lump (a plush body, a bell, a ball) shaded like a ball lit from the top-left. */
function lump(p: Px, x: number, y: number, w: number, h: number, c: Pal, flat = 0.25): Px {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return paint(p, x, y, w + 1, h + 1, (px, py) => {
    const dx = (px + 0.5 - cx) / (w / 2);
    const dy = (py + 0.5 - cy) / (h / 2);
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return null;
    return tone(c, light(dx, dy, Math.sqrt(1 - r2) + flat));
  });
}

/** A tiny four-pointed twinkle (drawn after the outline, so it has none). */
const twinkle = (p: Px, x: number, y: number, c = '#fff3b0', core = '#ffffff'): Px => p.px(x, y - 1, c).px(x - 1, y, c).px(x + 1, y, c).px(x, y + 1, c).px(x, y, core);

/** A neon tube's colours: the glass, its bright core, and the halo it casts (near, far). */
interface Neon {
  tube: string;
  core: string;
  halo: string;
  halo2: string;
}
const PINK: Neon = { tube: '#ff5ad6', core: '#ffd6f6', halo: '#a8237f', halo2: '#5a1650' };
const CYAN: Neon = { tube: '#3fe6ff', core: '#d8fcff', halo: '#1b7a9c', halo2: '#163c5c' };
const YELLOW: Neon = { tube: '#ffd23f', core: '#fff6c8', halo: '#9a6a14', halo2: '#4a3418' };

/**
 * A neon tube following the '#' of a template (other characters are left alone), with its halo on what is already
 * drawn there: a near ring, a fainter one further out (only where `far`), then the tube with a bright core on top.
 */
function neon(p: Px, x0: number, y0: number, rows: string[], c: Neon, far = true): Px {
  const on = (x: number, y: number) => rows[y]?.[x] === '#';
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  // ring 1: the eight pixels round the tube; ring 2: a diamond two pixels out (drawn first, so ring 1 covers it)
  const within = (dx: number, dy: number, ring: number) => (ring === 1 ? Math.max(Math.abs(dx), Math.abs(dy)) <= 1 : Math.abs(dx) + Math.abs(dy) <= 2);
  for (let ring = far ? 2 : 1; ring >= 1; ring--)
    for (let y = -ring; y < H + ring; y++)
      for (let x = -ring; x < W + ring; x++) {
        if (on(x, y)) continue;
        let near = false;
        for (let dy = -ring; dy <= ring && !near; dy++) for (let dx = -ring; dx <= ring && !near; dx++) near = on(x + dx, y + dy) && within(dx, dy, ring);
        if (near) p.px(x0 + x, y0 + y, ring === 1 ? c.halo : c.halo2);
      }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      // the core runs where the tube has tube on both sides along it: the middle of every stroke
      const inner = (on(x - 1, y) && on(x + 1, y)) || (on(x, y - 1) && on(x, y + 1));
      p.px(x0 + x, y0 + y, inner && (x + y) % 3 !== 0 ? c.core : c.tube);
    }
  return p;
}

/** Light falling on what is already drawn: pulls the pixels around (cx, cy) towards a colour. */
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

// A small pixel font: 3×5 capitals for signs, 5×7 for the big neon sign on Spelhallen's roof.
const FONT3: Record<string, string[]> = {
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
};
const FONT5: Record<string, string[]> = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
};
/** A word as one template, letters `gap` apart. */
function word(text: string, font: Record<string, string[]>, gap = 1): string[] {
  const h = Object.values(font)[0]!.length;
  return n(h, (y) => [...text].map((ch) => font[ch]?.[y] ?? '').join('.'.repeat(gap)));
}
const textWidth = (text: string, font: Record<string, string[]>, gap = 1): number => word(text, font, gap)[0]!.length;

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const WOOD = pal('#4e3219', '#6f4a26', '#9a6a3a', '#c58f55', '#e0b47a');
const GOLD = pal('#8a5a10', '#b8861a', '#e8b830', '#ffe27a', '#fff6c8');
const METAL = pal('#3a3e4a', '#5a606e', '#8a90a0', '#b8bec8', '#e4e8ee');
const CHROME = pal('#4a4e5c', '#7a8090', '#b4bac8', '#e2e6ee', '#ffffff');
/** The hall's dark purple: walls, the facade, the counter. */
const HALL = pal('#140a26', '#1e1238', '#2a1a4c', '#3a2866', '#54408c');
/** Arcade cabinets: a black with a little purple in it. */
const CAB = pal('#121020', '#1c1930', '#272340', '#363052', '#4c4570');
const GLASS = { b: '#a8dcf0', l: '#d4f0fa', d: '#7ab8d8' };

/** Each machine's colours, in ARCADE_GAMES order. */
const GAME = ARCADE_GAMES.map((g) => ramp(ARCADE[g].color));

// ---------------------------------------------------------------------------
// The machines (16×34 at oy -18): six variants, then the same six with their screens a step further
// ---------------------------------------------------------------------------

/** What each game shows on its screen (10×8 at x, y), frame 0 or 1. */
function screen(p: Px, i: number, x: number, y: number, f: number): void {
  const at = (rows: string[], pl: Record<string, string>, dx = 0, dy = 0) => p.tpl(x + dx, y + dy, rows, pl);
  switch (ARCADE_GAMES[i]) {
    case 'rally': {
      // seen from above: the road rushing down past kerbs and grass, our red car chasing a blue one
      paint(p, x, y, 10, 8, (px, py) => {
        const c = px - x;
        const r = py - y;
        if (c <= 1 || c >= 9) return (r + f) % 2 ? '#3a9a3a' : '#4cb04a';
        if (c === 2 || c === 8) return (r + f) % 2 ? '#ffffff' : '#e8412c';
        return '#55555f';
      });
      for (let r = f; r < 8; r += 3) p.px(x + 5, y + r, '#f4f4f4');
      p.tpl(x + 3, y + 4, ['LL', 'RR', 'KK'], { L: '#ff9a8a', R: '#e8412c', K: '#8a2014' });
      p.tpl(x + 6, y + 1 - f, ['LL', 'BB', 'KK'], { L: '#9ad0ff', B: '#3a7ae8', K: '#1a3a8a' });
      break;
    }
    case 'snow': {
      // a winter night: falling snow, a snowman, a snowball flying at him
      p.rect(x, y, 10, 6, '#2a4a8c').rect(x, y + 6, 10, 2, '#eef4ff').rect(x, y + 7, 10, 1, '#c4d8f0');
      for (const [sx, sy] of [[1, 0], [4, 2], [8, 1], [2, 4], [6, 4]] as const) p.px(x + sx, y + ((sy + f) % 6), '#ffffff');
      at(['.K.', '.W.', 'WWW', 'WWW'], { K: '#1a1a2a', W: '#ffffff' }, 6, 2);
      p.px(x + 7, y + 3, '#f08a2a');
      p.px(x + (f ? 4 : 2), y + (f ? 4 : 5), '#ffffff');
      break;
    }
    case 'golf': {
      // a striped green, the flag in its hole, the ball rolling towards it
      paint(p, x, y, 10, 8, (px, py) => ((py - y + (px - x > 6 ? 1 : 0)) % 2 ? '#3fbf5f' : '#36a852'));
      p.rect(x + 5, y + 4, 4, 2, '#7ae08a').rect(x + 6, y + 3, 2, 4, '#7ae08a');
      p.px(x + 7, y + 5, '#0a2a10').rect(x + 7, y, 1, 5, '#ffffff').rect(x + 8, y, 2, 2, '#ff4a3a').px(x + 8, y + 2, '#ff4a3a');
      p.px(x + (f ? 4 : 2), y + (f ? 6 : 7), '#ffffff').px(x + (f ? 3 : 1), y + (f ? 6 : 7), f ? '#9ae0aa' : '#3fbf5f');
      break;
    }
    case 'hen': {
      // the old green handheld screen: Hönan Hilda hops along a ledge towards an egg
      const L = { a: '#9bbc0f', b: '#8bac0f', c: '#306230', d: '#0f380f' };
      p.rect(x, y, 10, 8, L.a).rect(x, y + 7, 10, 1, L.c).rect(x, y + 6, 10, 1, L.b);
      p.px(x + 1, y + 1, L.b).px(x + 2, y + 1, L.b).px(x + 6, y + 2, L.b);
      const hy = y + 2 - f;
      at(['.dd.', 'dddd', 'dcdd', '.dd.'], { d: L.d, c: L.a }, 1 + f, hy - y);
      p.px(x + 5 + f, hy + 1, L.c).px(x + 2 + f, hy + 4, L.c).px(x + 3 + f, hy + 4, L.c);
      at(['.c.', 'cbc', '.c.'], { c: L.d, b: L.a }, 7, 3);
      break;
    }
    case 'dance': {
      // arrows rising to the line at the top, lighting up as they reach it
      p.rect(x, y, 10, 8, '#160a24');
      const up = ['..#..', '.###.', '#####', '..#..', '..#..'];
      const down = ['..#..', '..#..', '#####', '.###.', '..#..'];
      const left = ['..#..', '.##..', '#####', '.##..', '..#..'];
      const right = ['..#..', '..##.', '#####', '..##.', '..#..'];
      for (let k = 0; k < 10; k += 2) p.px(x + k, y, '#ffffff');
      if (f === 0) {
        at(left, { '#': '#ff4fd8' }, 0, 2);
        at(up, { '#': '#3fe6ff' }, 5, 3);
      } else {
        at(down, { '#': '#ffd23f' }, 0, 3);
        at(right, { '#': '#7aff6a' }, 5, 1);
        p.rect(x + 5, y, 5, 1, '#e8fff0');
      }
      break;
    }
    case 'star': {
      // deep space: the stars streaming past, a little rocket defending its base, a laser shot
      p.rect(x, y, 10, 8, '#0a0a20');
      for (const [sx, sy, c] of [[1, 1, '#ffffff'], [7, 0, '#8a8ab8'], [3, 3, '#8a8ab8'], [8, 4, '#ffffff'], [0, 5, '#6a6a98'], [5, 1, '#6a6a98']] as const) p.px(x + sx, y + ((sy + f) % 8), c);
      p.px(x + (f ? 6 : 2), y + (f ? 2 : 1), '#ffd23f').px(x + (f ? 6 : 2), y + (f ? 1 : 0), '#fff08a');
      at(['.R.', 'WWW', 'WbW', 'R.R'], { R: '#e8412c', W: '#ffffff', b: '#3fa8ff' }, 4, 3);
      p.px(x + 5, y + 7, f ? '#ffd23f' : '#ff8a2a');
      if (f) p.rect(x + 5, y + 1, 1, 2, '#7affff');
      break;
    }
  }
}

/** The marquee (12×5 at x, y): lit in the game's colour, with its little logo. */
function marquee(p: Px, i: number, x: number, y: number): void {
  const C = GAME[i]!;
  paint(p, x, y, 12, 5, (px, py) => (py === y ? C.l2 : py === y + 4 ? C.b : C.l));
  const W = '#ffffff';
  const logo: Record<string, [string[], Record<string, string>]> = {
    rally: [['#.#.....#.#.', '.#.#.WW..#.#', '#.#.WWWW#.#.', '.#..KWWK..#.'], { '#': '#1a1a1a', W, K: C.d2 }],
    snow: [['.....#.#....', '..#..###..#.', '.###.###.###', '..#..#.#..#.'], { '#': W }],
    golf: [['.....RRW....', '.....RRW....', '.......W..o.', '..WWWWWWWWW.'], { R: '#ff4a3a', W, o: W }],
    hen: [['.....r......', '....WWW..oo.', '..WWWWyy.oo.', '...WWW......'], { W, r: '#e8302a', y: '#ffd23f', o: '#fff6e0' }],
    dance: [['.#...#...#..', '##..###.###.', '.#...#...#..', '............'], { '#': W }],
    star: [['.....#......', '..#.###..#..', '....#.#.....', '.#.......#..'], { '#': W }],
  };
  const [rows, pl] = logo[ARCADE_GAMES[i]!]!;
  p.tpl(x, y + 1, rows, pl);
}

function machine(i: number, f: number): Px {
  const C = GAME[i]!;
  const p = new Px(16, 34);
  // the cabinet: side panels in the game's colour, a black front
  p.rect(1, 1, 14, 32, CAB.b);
  paint(p, 1, 1, 2, 32, (x) => (x === 1 ? C.l : C.b));
  paint(p, 13, 1, 2, 32, (x) => (x === 13 ? C.d : C.d2));
  // side art: a light stripe running down each side panel
  for (let y = 22; y < 31; y++) p.px(2, y, (y + 1) % 3 ? C.l2 : C.l).px(13, y, (y + 1) % 3 ? C.b : C.d);
  // the marquee, lit from inside
  p.rect(1, 1, 14, 7, CAB.d2);
  marquee(p, i, 2, 2);
  p.rect(1, 8, 14, 1, CAB.d2);
  // the screen in its bezel
  p.rect(3, 9, 10, 9, CAB.d2);
  screen(p, i, 3, 9, f);
  p.px(3, 9, '#ffffff');
  p.rect(3, 17, 10, 1, CAB.d);
  // the control panel juts out: a lit top and a front edge
  p.rect(1, 18, 14, 2, CAB.l).rect(1, 18, 14, 1, CAB.l2).rect(1, 20, 14, 2, CAB.b).rect(1, 21, 14, 1, CAB.d);
  p.rect(1, 20, 14, 1, C.b);
  if (ARCADE_GAMES[i] === 'rally') {
    // a steering wheel standing up from the panel
    p.rect(5, 17, 6, 1, '#3a3a44').rect(4, 18, 1, 2, '#3a3a44').rect(11, 18, 1, 2, '#3a3a44').rect(5, 20, 6, 1, '#3a3a44');
    p.rect(5, 17, 3, 1, '#7a7a88').rect(7, 18, 2, 2, '#4a4a54').px(4, 18, '#6a6a78');
  } else {
    // a joystick and two buttons
    p.rect(4, 18, 1, 2, '#8a8a98').rect(3, 17, 3, 1, '#e8302a').px(3, 17, '#ff9a8a');
    p.rect(8, 18, 2, 1, C.l2).rect(11, 18, 2, 1, '#ffd23f').px(8, 19, C.d).px(11, 19, '#b8861a');
  }
  // the lower cabinet: a coin door (a lit slot over the return cup, a lock), a stripe of the game's colour, a kick plate
  p.rect(3, 22, 10, 11, CAB.b).rect(3, 22, 10, 1, CAB.d2);
  p.rect(4, 24, 6, 5, CAB.d).rect(4, 24, 6, 1, CAB.l).rect(4, 28, 6, 1, CAB.d2);
  p.rect(5, 25, 4, 1, '#ff8a2a').px(6, 25, '#ffd27a').rect(6, 27, 2, 1, CAB.d2).px(9, 26, GOLD.l);
  p.rect(11, 24, 1, 5, C.d).px(11, 24, C.b);
  p.rect(3, 30, 10, 1, C.d);
  p.rect(3, 31, 10, 2, CAB.d2).rect(1, 32, 14, 1, CAB.d2);
  p.outline(OUTLINE);
  // the screen's glow spills over its frame a little
  glowOn(p, 8, 13, 7, C.l, 0.12);
  return p;
}

// ---------------------------------------------------------------------------
// The TV in the farmhouse (32×28 at oy -12): a wooden bench, a TV with rabbit ears, the console with a cartridge
// ---------------------------------------------------------------------------

function tv(f: number): Px {
  const p = new Px(32, 28);
  // the bench: a top, two doors with knobs, little feet
  p.rect(1, 17, 30, 9, WOOD.b).rect(1, 17, 30, 1, WOOD.l2).rect(1, 18, 30, 1, WOOD.l).rect(1, 19, 30, 1, WOOD.d);
  p.rect(2, 20, 13, 5, WOOD.l).rect(17, 20, 13, 5, WOOD.l).rect(2, 20, 13, 1, WOOD.d).rect(17, 20, 13, 1, WOOD.d);
  p.rect(3, 21, 11, 3, WOOD.b).rect(18, 21, 11, 3, WOOD.b);
  p.px(13, 22, GOLD.l).px(18, 22, GOLD.l);
  p.rect(1, 25, 30, 1, WOOD.d2).rect(2, 26, 2, 2, WOOD.d).rect(28, 26, 2, 2, WOOD.d);
  // rabbit-ear antenna
  p.line(10, 5, 7, 0, '#8a8e9a').line(14, 5, 17, 0, '#8a8e9a').px(7, 0, '#e2e6ee').px(17, 0, '#e2e6ee');
  // the set: a wooden box, a rounded screen, a speaker and two knobs
  p.rect(3, 4, 20, 13, WOOD.d).rect(3, 4, 20, 1, WOOD.b).rect(3, 5, 1, 12, WOOD.b).rect(4, 16, 18, 1, WOOD.d2);
  p.rect(9, 3, 6, 2, '#5a606e').rect(9, 3, 6, 1, '#8a90a0');
  p.rect(4, 5, 15, 11, '#2a2a30');
  // the picture: Hönan Hilda's world in bright colours
  const sx = 5;
  const sy = 6;
  p.rect(sx, sy, 13, 9, '#6ac0ff').rect(sx, sy + 6, 13, 3, '#4cb04a').rect(sx, sy + 6, 13, 1, '#8ae06a');
  p.rect(sx + 9, sy + 1, 3, 1, '#ffffff').rect(sx + 8, sy + 2, 5, 1, '#ffffff');
  p.rect(sx + 1, sy + 4, 3, 2, '#3a8a3a').rect(sx + 2, sy + 3, 1, 1, '#3a8a3a');
  const hx = sx + 4 + f * 2;
  const hy = sy + 3 - f;
  p.tpl(hx, hy, ['.r..', 'WWW.', 'WWWy', '.WW.', '.o.o'], { W: '#ffffff', r: '#e8302a', y: '#ffd23f', o: '#f5a623' }).px(hx + 2, hy + 1, '#1a1a1a');
  p.rect(sx + 10, sy + 4, 2, 2, '#fff6e0').px(sx + 10, sy + 4, '#ffffff');
  if (f) p.px(sx + 10, sy + 1, '#ffd23f').px(sx + 7, sy + 2, '#ffd23f');
  else p.px(sx + 7, sy + 1, '#ffd23f');
  // the screen's curved glass: dark corners and a glint
  p.px(sx, sy, '#2a2a30').px(sx + 12, sy, '#2a2a30').px(sx, sy + 8, '#2a2a30').px(sx + 12, sy + 8, '#2a2a30');
  p.px(sx + 1, sy + 1, '#ffffff');
  for (let y = 6; y < 15; y += 2) p.rect(19, y, 2, 1, WOOD.d2);
  p.rect(19, 5, 3, 1, WOOD.b).px(20, 11, '#d8d8e0').px(20, 13, '#d8d8e0');
  // the console beside it, a red cartridge in its slot, a pad lying in front
  p.rect(24, 13, 6, 4, '#c8ccd6').rect(24, 13, 6, 1, '#eef0f4').rect(25, 15, 2, 1, '#e8302a').px(28, 15, '#5a606e');
  p.rect(25, 10, 4, 3, '#e8412c').rect(25, 10, 4, 1, '#ff8a7a').px(26, 11, '#ffffff');
  p.outline(OUTLINE);
  glowOn(p, 11, 10, 9, '#9ad8ff', f ? 0.1 : 0.06);
  return p;
}

// ---------------------------------------------------------------------------
// Spelhallen (48×48 at oy -16): a dark purple house with a neon SPEL sign on its roof, bulbs chasing round it,
// windows full of machines and glass doors below the middle tile. Its only pale blue is the door glass and the
// screens in the windows, which the LittleJS view lights up at night (arcade_hall is one of its LIT_KINDS).
// ---------------------------------------------------------------------------

function arcadeHall(f: number): Px {
  const p = new Px(48, 48);
  const F = HALL;
  // the facade: dark panels, a parapet on the flat roof
  paint(p, 1, 15, 46, 33, (x, y) => {
    if (y === 15) return F.l2;
    if (y <= 17) return y === 16 ? F.l : F.b;
    if (x === 1) return F.l;
    if (x === 46) return F.d2;
    return (x - 2) % 7 === 6 ? F.d : F.b;
  });
  p.rect(1, 18, 46, 1, F.d2);
  // a neon strip under the parapet
  neon(p, 2, 20, ['#'.repeat(44)], PINK, false);
  // the sign on the roof: a dark board on legs, SPEL in pink neon between two yellow stars, bulbs all round
  p.rect(9, 12, 2, 4, METAL.d).rect(37, 12, 2, 4, METAL.d).px(9, 12, METAL.b).px(37, 12, METAL.b);
  p.rect(3, 1, 42, 12, '#120a22').rect(3, 0, 42, 1, '#2a2040').rect(3, 12, 42, 1, '#0a0614');
  const text = word('SPEL', FONT5, 2);
  const tw = textWidth('SPEL', FONT5, 2);
  neon(p, 24 - Math.floor(tw / 2) + 1, 3, text, PINK);
  const star = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
  neon(p, 6, 4, star, YELLOW, false);
  neon(p, 37, 4, star, YELLOW, false);
  const bulb = (x: number, y: number, k: number) => {
    const lit = (k + f) % 2 === 0;
    p.px(x, y, lit ? '#fff3a0' : '#7a5a2a');
  };
  let k = 0;
  for (let x = 4; x <= 43; x += 2) bulb(x, 0, k++);
  for (let x = 43; x >= 4; x -= 2) bulb(x, 12, k++);
  // windows: a dark room full of machines with glowing screens. The screens are the pale blue the LittleJS view
  // lights up at night like every lit window (so is the door glass); nothing else on the hall may be that colour.
  for (const [wx, games] of [[3, [0, 4]], [33, [2, 5]]] as const) {
    p.rect(wx - 1, 24, 14, 15, '#3a3e4a').rect(wx - 1, 24, 14, 1, '#5a606e');
    paint(p, wx, 25, 12, 13, (_, y) => (y > 34 ? '#3a1a52' : y > 31 ? '#2a1446' : '#1c1032'));
    games.forEach((gi, m) => {
      const g = GAME[gi]!;
      const mx = wx + 1 + m * 6;
      p.rect(mx, 27, 4, 11, '#0c0818').rect(mx, 27, 4, 2, g.b).px(mx, 27, g.l);
      p.rect(mx, 30, 4, 3, '#8fd0f0').rect(mx + 1, 30, 2, 1, '#bfeaff').px(mx + 3, 32, '#6ab4e0').rect(mx, 34, 4, 1, g.d);
      p.rect(mx + 4, 28, 1, 10, '#140c26');
    });
    // a pink glow on the floor in there, a shine on the glass
    p.rect(wx, 37, 12, 1, '#7a2a7a');
    p.px(wx + 11, 25, '#6a5a8a').px(wx + 10, 26, '#6a5a8a');
    p.rect(wx - 1, 38, 14, 1, '#2a2e38');
  }
  // a striped awning over the door (like the shop's next door, in Spelhallen's pinks), bulbs along its edge
  paint(p, 14, 24, 20, 4, (x, y) => {
    const stripe = Math.floor((x - 14) / 2) % 2 === 0;
    if (y === 27) return stripe ? '#8a1a5a' : '#c04a9a';
    return stripe ? (y === 24 ? '#e0409f' : '#c0287f') : y === 24 ? '#ffd0f0' : '#ff9ae0';
  });
  for (let x = 15, j = 0; x < 33; x += 2, j++) p.px(x, 28, (j + f) % 2 === 0 ? '#fff3a0' : '#8a6a2a');
  // glass doors below the middle tile
  p.rect(16, 30, 16, 18, '#3a3e4a').rect(16, 30, 16, 1, '#5a606e');
  paint(p, 17, 31, 14, 17, (x, y) => {
    if (x === 23 || x === 24) return '#5a606e';
    const s = (x - 17 + (47 - y)) % 9;
    return s === 0 || s === 1 ? GLASS.l : y > 44 ? GLASS.d : GLASS.b;
  });
  p.rect(22, 37, 1, 5, '#e4e8ee').rect(25, 37, 1, 5, '#e4e8ee');
  // the base along the street
  p.rect(1, 45, 15, 3, F.d2).rect(32, 45, 15, 3, F.d2).rect(1, 45, 15, 1, F.d).rect(32, 45, 15, 1, F.d);
  p.outline(OUTLINE);
  return p;
}

// ---------------------------------------------------------------------------
// The prize counter (48×26 at oy -10), the score board (32×36 at oy -20)
// ---------------------------------------------------------------------------

function prizeCounter(): Px {
  const p = new Px(48, 26);
  // a glass display counter on a dark base, toys inside
  p.rect(1, 6, 46, 19, HALL.b);
  p.rect(1, 6, 46, 2, '#e4e8ee').rect(1, 6, 46, 1, '#ffffff').rect(1, 8, 46, 1, '#8a90a0');
  paint(p, 2, 9, 44, 9, (x, y) => {
    const s = (x + (17 - y) * 2) % 23;
    return s === 0 || s === 1 ? '#e8f8ff' : y === 17 ? '#7ab0c8' : '#b8e4f4';
  });
  // the toys on show: a teddy, a ball, a rubber duck, a lollipop, a robot, a little car
  p.tpl(4, 11, ['b.b', 'bbb', 'bLb', 'bbb'], { b: '#a8743c', L: '#e0b47a' }).px(4, 12, '#1a1a1a').px(6, 12, '#1a1a1a');
  p.rect(9, 13, 4, 4, '#e8302a').rect(9, 15, 4, 1, '#ffffff').px(10, 13, '#ff9a8a');
  p.tpl(15, 12, ['.yy.', 'yyyo', 'yyy.', '.yyy'], { y: '#ffd23f', o: '#f58a1a' }).px(16, 12, '#1a1a1a');
  p.rect(21, 11, 3, 3, '#ff5ab8').px(21, 11, '#ffffff').px(23, 13, '#c02a7a').rect(22, 14, 1, 3, '#f4f0ec');
  p.tpl(26, 11, ['.c.', 'ccc', 'cbc', 'ccc', 'c.c'], { c: '#aab0c0', b: '#3fe6ff' });
  p.rect(31, 14, 5, 2, '#3f8ae8').rect(32, 13, 3, 1, '#7ab0ff').px(31, 16, '#1a1a1a').px(35, 16, '#1a1a1a');
  p.tpl(38, 12, ['.g.', 'ggg', 'ggg', '.g.'], { g: '#3fbf5f' }).px(39, 11, '#ffd23f').px(42, 14, '#ff5ab8').px(43, 12, '#3fe6ff');
  p.rect(2, 17, 44, 1, '#e4e8ee');
  // the base: dark panels, PRISER in lights between two tickets
  p.rect(1, 18, 46, 7, HALL.b).rect(1, 18, 46, 1, HALL.l).rect(1, 24, 46, 1, HALL.d2);
  const label = word('PRISER', FONT3);
  const lw = textWidth('PRISER', FONT3);
  p.tpl(24 - Math.floor(lw / 2), 19, label, { '#': '#fff6c8' });
  const ticket = (x: number) => p.tpl(x, 19, ['TTTTTTT', '.TT|TT.', '.TT|TT.', 'TTTTTTT'], { T: '#ff8a2a', '|': '#ffd27a' }).rect(x, 19, 7, 1, '#ffb05a');
  ticket(4);
  ticket(37);
  // a little bell on the counter
  lump(p, 38, 2, 6, 5, GOLD, 0.3);
  p.rect(37, 5, 8, 1, GOLD.d).rect(40, 0, 2, 2, '#c8ccd6').px(40, 0, '#ffffff');
  p.outline(OUTLINE);
  return twinkle(p, 3, 9, '#e8f8ff');
}

function scoreBoard(f: number): Px {
  const p = new Px(32, 36);
  // two legs, a gold frame round a dark board
  p.rect(5, 26, 2, 10, METAL.b).rect(25, 26, 2, 10, METAL.d).px(5, 26, METAL.l);
  p.rect(1, 6, 30, 22, GOLD.d).rect(1, 6, 30, 1, GOLD.l).rect(1, 7, 1, 21, GOLD.b).rect(30, 7, 1, 21, GOLD.d2).rect(1, 27, 30, 1, GOLD.d2);
  p.rect(3, 8, 26, 18, '#0e0c22');
  // the crown on top
  p.tpl(10, 0, ['..#..#..#..', '.###.##.###', '.##########', '..########.', '..#######..'], { '#': GOLD.b });
  p.tpl(10, 0, ['..#..#..#..', '.#...#...#.', '.#.........', '...........', '...........'], { '#': GOLD.l2 });
  p.rect(12, 5, 7, 1, GOLD.d).px(14, 3, '#e8302a').px(16, 3, '#3fa8ff').px(18, 3, '#3fbf5f');
  // REKORD across the top, then the family's best: medal, name, score
  const head = word('REKORD', FONT3);
  p.tpl(16 - Math.floor(textWidth('REKORD', FONT3) / 2), 9, head, { '#': '#ff6ad8' });
  const medals = ['#ffd23f', '#d8dde8', '#e0904a', '#8a7aa8'];
  const names = ['#ff6ad8', '#3fe6ff', '#7aff6a', '#ffd23f'];
  // digits two pixels high: only a hint of the number, but every row reads as a score
  const DIGIT: Record<string, string[]> = {
    '0': ['##', '##'],
    '1': ['.#', '.#'],
    '2': ['##', '#.'],
    '3': ['##', '.#'],
    '4': ['#.', '##'],
    '5': ['#.', '.#'],
    '6': ['#.', '##'],
    '7': ['##', '.#'],
    '8': ['##', '##'],
    '9': ['##', '.#'],
  };
  const scores = ['12500', '9840', '7300', '4250'];
  for (let r = 0; r < 4; r++) {
    const y = 15 + r * 3;
    p.rect(4, y, 2, 2, medals[r]!).px(4, y, '#ffffff');
    p.rect(7, y, 4, 1, names[r]!).rect(7, y + 1, 3, 1, shade(names[r]!, 0.7));
    const s = scores[r]!;
    const col = r === 0 && f ? '#fff6c8' : '#e8ecff';
    [...s].forEach((ch, d) => p.tpl(27 - (s.length - d) * 3 + 1, y, DIGIT[ch]!, { '#': col }));
  }
  p.outline(OUTLINE);
  if (f) twinkle(p, 25, 1);
  else twinkle(p, 8, 2, '#fff3b0');
  return p;
}

// ---------------------------------------------------------------------------
// The hall's walls (one seamless 16×24 tile at oy -8), the door mat, the carpet
// ---------------------------------------------------------------------------

/**
 * A wall piece that joins up with itself every way. Like the other walls it rises only 2 px above its tile (rows
 * 0..5 are empty), so whatever stands just above the bottom wall keeps its feet. With a piece below it, rows 6..21
 * show (the empty rows of the one below let its rows 16..21 through), and those rows are the same all the way down,
 * so the side walls run on unbroken. Rows 22..23, seen along the top and bottom walls and at the foot of the side
 * walls, are a cyan neon line and the skirting.
 */
function hallWall(): Px {
  const p = new Px(16, 24);
  paint(p, 0, 6, 16, 18, (x, y) => {
    if (y === 22) return x % 5 === 2 ? CYAN.core : CYAN.tube;
    if (y === 23) return '#0c0618';
    if (x === 0) return HALL.d2;
    if (x === 1) return HALL.l;
    if (x === 15) return HALL.d;
    if (x === 7) return '#62247a';
    if (x === 8) return '#e04cc4';
    if (x === 9) return '#4a1a5e';
    return HALL.b;
  });
  return p;
}

/** The way out: a mat in the gap of the bottom wall, a pink arrow pointing out, a yellow threshold. */
function hallExit(): Px {
  const p = new Px(16, 16).rect(0, 0, 16, 16, HALL.d2).rect(1, 1, 14, 14, '#c0287f').rect(2, 2, 12, 12, HALL.d).rect(2, 2, 12, 1, HALL.b);
  p.tpl(4, 3, ['..###..', '..###..', '#######', '.#####.', '..###..', '...#...'], { '#': PINK.tube });
  p.tpl(4, 3, ['..#....', '..#....', '##.....', '.#.....'], { '#': PINK.core });
  return p.rect(2, 12, 12, 2, '#ffd23f').rect(2, 13, 12, 1, '#c89a1a');
}

/** Spelhallen's carpet is one pattern this many tiles across and down, so it never shows a seam or repeats close by. */
export const CARPET_TILES = 8;

/** The carpet's tiles: tile (x, y) of the map is number (x % 8) + 8 * (y % 8). */
export function carpetTiles(): Px[] {
  const N = CARPET_TILES * 16;
  const big = new Px(N, N).rect(0, 0, N, N, '#191640');
  // the weave: a few darker and lighter flecks
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const h = hash2(x * 3 + 11, y * 5 + 7);
      if (h < 60) big.px(x, y, '#141134');
      else if (h > 962) big.px(x, y, '#221d50');
    }
  const put = (x: number, y: number, c: string) => big.px(((x % N) + N) % N, ((y % N) + N) % N, c);
  // little neon doodles: squiggles, zigzags, stars, sparkles, triangles, rings
  const shapes: [number, number][][] = [
    [[0, 1], [1, 0], [2, 1], [3, 2], [4, 1], [5, 0]],
    [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]],
    [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    [[2, 0], [1, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
    [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]],
    [[0, 2], [1, 1], [1, 0], [2, 0], [3, 1], [3, 2], [4, 3]],
  ];
  const cols = ['#f048b4', '#38c8e8', '#f0c83a', '#9a64f0'];
  // spread out evenly, never too close (distances wrap round the pattern's edges)
  const placed: [number, number][] = [];
  for (let tries = 0; placed.length < 46 && tries < 6000; tries++) {
    const x = hash2(tries * 13 + 5, tries * 7 + 3) % N;
    const y = hash2(tries * 31 + 1, tries * 17 + 9) % N;
    const ok = placed.every(([px, py]) => {
      const dx = Math.min(Math.abs(px - x), N - Math.abs(px - x));
      const dy = Math.min(Math.abs(py - y), N - Math.abs(py - y));
      return dx * dx + dy * dy > 190;
    });
    if (!ok) continue;
    const k = placed.push([x, y]);
    const shape = shapes[(k * 3 + hash2(x, y)) % shapes.length]!;
    const c = cols[(k + hash2(y, x)) % cols.length]!;
    for (const [dx, dy] of shape) put(x + dx, y + dy, c);
  }
  return n(CARPET_TILES * CARPET_TILES, (i) => {
    const t = new Px(16, 16);
    t.ctx.drawImage(big.canvas, (i % CARPET_TILES) * 16, Math.floor(i / CARPET_TILES) * 16, 16, 16, 0, 0, 16, 16);
    return t;
  });
}

// ---------------------------------------------------------------------------
// Prizes: plush cow, hen and dragon, the trophy, a lava lamp, a disco ball, neon signs
// ---------------------------------------------------------------------------

function plushCow(): Px {
  const p = new Px(16, 16);
  const W = pal('#a8a098', '#d0c8be', '#f4f0ea', '#fffcf6', '#ffffff');
  // body sitting, stubby legs in front, a round head with ears and little horns
  lump(p, 3, 8, 10, 7, W);
  p.ellipse(4, 9, 3, 2, '#3a3129').ellipse(10, 11, 3, 2, '#3a3129');
  p.rect(3, 13, 3, 3, W.b).rect(10, 13, 3, 3, W.b).rect(3, 15, 3, 1, '#3a3129').rect(10, 15, 3, 1, '#3a3129');
  p.rect(1, 3, 3, 2, W.d).rect(12, 3, 3, 2, W.d).px(2, 4, '#f0b8a8').px(13, 4, '#f0b8a8');
  lump(p, 3, 1, 10, 9, W, 0.35);
  p.px(5, 1, '#e0c8a0').px(10, 1, '#e0c8a0').px(5, 0, '#f0dcb8').px(10, 0, '#f0dcb8');
  p.ellipse(9, 2, 3, 3, '#3a3129');
  p.rect(5, 6, 6, 3, '#f0b8a8').rect(5, 6, 6, 1, '#ffd0c4').px(6, 7, '#b87a70').px(9, 7, '#b87a70');
  p.px(5, 4, '#1a1a1a').px(10, 4, '#1a1a1a').px(5, 3, '#ffffff');
  p.outline(OUTLINE);
  return p;
}

function plushHen(): Px {
  const p = new Px(16, 16);
  const W = pal('#b8a888', '#ddd0b4', '#f4ead8', '#fffaf0', '#ffffff');
  // a round soft hen: comb, beak, wattle, little wings and orange feet
  p.rect(5, 14, 2, 2, '#f5a623').rect(9, 14, 2, 2, '#f5a623');
  lump(p, 2, 3, 12, 12, W, 0.3);
  p.tpl(5, 0, ['.r.r.', 'rrrrr', '.rrr.'], { r: '#e8302a' }).px(6, 0, '#ff7a6a').px(8, 0, '#ff7a6a').px(9, 1, '#b82020');
  p.rect(7, 7, 2, 2, '#ffb43a').px(7, 7, '#ffd27a').px(8, 9, '#e8302a');
  p.px(5, 5, '#1a1a1a').px(10, 5, '#1a1a1a').px(5, 4, '#ffffff');
  p.rect(2, 9, 2, 3, W.d).rect(12, 9, 2, 3, W.d).px(2, 9, W.b);
  p.px(4, 7, '#ffb0c0').px(11, 7, '#ffb0c0');
  p.outline(OUTLINE);
  return p;
}

function plushDragon(): Px {
  const p = new Px(16, 16);
  const D = pal('#4a2470', '#6a3a9a', '#9a5ad8', '#bc8aec', '#e0c4ff');
  // the pet dragon as a soft toy: purple, a cream belly, pink felt wings, a spade tail curled to the side
  p.tpl(0, 5, ['PP....', 'PPP...', '.PP...', '..P...'], { P: '#e89ad8' });
  p.tpl(10, 5, ['....PP', '...PPP', '...PP.', '...P..'], { P: '#e89ad8' });
  p.line(12, 14, 14, 12, D.b).tpl(13, 9, ['.S.', 'SSS', '.S.'], { S: D.d });
  lump(p, 3, 7, 10, 8, D, 0.3);
  p.ellipse(5, 9, 6, 5, '#f5d890').rect(6, 11, 4, 1, '#d8b870');
  p.rect(3, 14, 3, 2, D.b).rect(10, 14, 3, 2, D.d);
  lump(p, 3, 1, 10, 8, D, 0.35);
  p.rect(4, 0, 1, 2, '#f4ead8').rect(11, 0, 1, 2, '#f4ead8').px(4, 0, '#ffffff');
  p.rect(6, 6, 4, 2, D.l).px(6, 7, D.d).px(9, 7, D.d);
  p.px(5, 4, '#1a1a1a').px(10, 4, '#1a1a1a').px(5, 3, '#ffffff').px(10, 3, '#ffffff');
  p.px(4, 6, '#ff9ad8').px(11, 6, '#ff9ad8');
  p.outline(OUTLINE);
  return p;
}

function trophy(): Px {
  const p = new Px(16, 16);
  // a dark wooden foot with a gold plate, the stem, the cup with its two handles and a star on it
  p.rect(3, 12, 10, 4, WOOD.d).rect(3, 12, 10, 1, WOOD.b).rect(6, 13, 4, 2, GOLD.b).px(6, 13, GOLD.l2);
  p.rect(5, 10, 6, 2, GOLD.d).rect(5, 10, 6, 1, GOLD.b).rect(7, 8, 2, 2, GOLD.b).px(7, 8, GOLD.l);
  p.rect(0, 2, 3, 1, GOLD.d).rect(0, 2, 1, 3, GOLD.d).rect(1, 5, 2, 1, GOLD.d).rect(13, 2, 3, 1, GOLD.d2).rect(15, 2, 1, 3, GOLD.d2).rect(13, 5, 2, 1, GOLD.d2);
  paint(p, 2, 1, 12, 8, (x, y) => {
    const v = (y - 0.5) / 8;
    const hw = 6 - v * v * 3.8;
    const u = (x + 0.5 - 8) / hw;
    if (Math.abs(u) > 1) return null;
    if (y === 1) return u < 0.3 ? GOLD.l2 : GOLD.l;
    return tone(GOLD, light(u * 0.95, v - 0.2, Math.sqrt(Math.max(0, 1 - u * u)) + 0.15));
  });
  p.tpl(6, 3, ['.#.', '###', '#.#'], { '#': '#fff6c8' });
  p.outline(OUTLINE);
  return twinkle(p, 13, 1);
}

function lavaLamp(f: number): Px {
  const p = new Px(16, 24);
  // a cone foot, a tapering bottle of warm glowing liquid with wax blobs, a cap
  paint(p, 3, 17, 10, 7, (x, y) => {
    const hw = 3 + (y - 17) * 0.45;
    const u = (x + 0.5 - 8) / hw;
    if (Math.abs(u) > 1) return null;
    return u < -0.4 ? CHROME.l : u < 0.35 ? CHROME.b : CHROME.d;
  });
  p.rect(4, 22, 8, 2, CHROME.d).rect(4, 22, 8, 1, CHROME.b);
  paint(p, 4, 3, 8, 15, (x, y) => {
    const t = (y - 3) / 14;
    const hw = 2.2 + Math.sin(t * Math.PI * 0.9) * 1.7;
    const u = (x + 0.5 - 8) / hw;
    if (Math.abs(u) > 1) return null;
    return u < -0.55 ? '#ff7aa8' : u > 0.6 ? '#c02a5a' : '#ff4a7a';
  });
  // the wax: a pool at the bottom and two blobs wobbling as they drift (squashed, then stretched)
  const blob = (cx: number, cy: number, w: number, h: number) => lump(p, cx - w / 2, cy - h / 2, w, h, pal('#d86a10', '#ff9a1a', '#ffc040', '#ffe27a', '#fff6c8'), 0.5);
  blob(8, 15.5, 5, 3);
  blob(8, 6.5, f ? 3 : 4, f ? 4 : 3);
  blob(8.5, 10.5, f ? 2 : 3, f ? 3 : 2);
  p.rect(5, 1, 6, 3, CHROME.b).rect(5, 1, 6, 1, CHROME.l).rect(6, 0, 4, 1, CHROME.d).px(10, 2, CHROME.d);
  p.px(6, 6, '#ffd0e0').px(6, 7, '#ffb0c8');
  p.outline(OUTLINE);
  return glowOn(p, 8, 10, 7, '#ff8ab0', 0.18);
}

function discoBall(f: number): Px {
  const p = new Px(16, 28);
  // a little chrome tripod, the ball on top of its pole (with the hook it would hang from in a disco)
  p.rect(7, 13, 2, 12, CHROME.b).px(7, 13, CHROME.l).rect(8, 13, 1, 12, CHROME.d);
  p.line(7, 24, 3, 27, CHROME.d).line(8, 24, 12, 27, CHROME.d).rect(7, 25, 2, 3, CHROME.d).px(8, 24, CHROME.b);
  p.rect(7, 0, 2, 1, CHROME.b).rect(8, 0, 1, 2, CHROME.d);
  // the ball: mirror tiles in rows, each catching the light differently; they slide by a tile as it turns
  paint(p, 2, 1, 12, 12, (x, y) => {
    const dx = (x + 0.5 - 8) / 6;
    const dy = (y + 0.5 - 7) / 6;
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return null;
    const v = light(dx, dy, Math.sqrt(1 - r2) + 0.1);
    const lat = Math.floor((y - 1) / 2);
    const lon = Math.floor((x - 2 + f + (lat % 2)) / 2);
    const seam = (y - 1) % 2 === 1 || (x - 2 + f + (lat % 2)) % 2 === 1;
    const glint = hash2(lon * 3 + lat * 7, lat) % 7;
    const base = v + (glint === 0 ? 0.35 : glint === 1 ? -0.25 : 0);
    if (seam) return base > 0.6 ? '#9aa4b8' : '#5a6070';
    return base > 1 ? '#ffffff' : base > 0.8 ? '#e2e8f4' : base > 0.45 ? '#b4bccc' : base > 0.15 ? '#7e8698' : '#4a5060';
  });
  // flecks of coloured light it throws
  const flecks = f ? [[4, 4, '#ff6ad8'], [11, 6, '#3fe6ff'], [6, 10, '#ffd23f']] : [[10, 3, '#ffd23f'], [4, 8, '#3fe6ff'], [9, 10, '#ff6ad8']];
  for (const [x, y, c] of flecks as [number, number, string][]) p.px(x, y, c);
  p.outline(OUTLINE);
  if (f) twinkle(p, 12, 2);
  else twinkle(p, 4, 3);
  return p;
}

function neonSign(v: number): Px {
  const p = new Px(16, 24);
  // a small dark backing board on a post with a round foot
  p.rect(7, 15, 2, 7, METAL.d).px(7, 15, METAL.b).rect(4, 21, 8, 3, METAL.d).rect(4, 21, 8, 1, METAL.b);
  p.rect(1, 1, 14, 14, '#120a22').rect(1, 1, 14, 1, '#2a2040').rect(1, 14, 14, 1, '#0a0614');
  if (v === 0) neon(p, 3, 4, ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], PINK).px(5, 4, PINK.core).px(4, 5, PINK.core);
  else neon(p, 3, 3, ['...#...', '...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'], CYAN);
  p.outline(OUTLINE);
  return p;
}

// ---------------------------------------------------------------------------
// Icons (16×16): the TV, a cartridge for every game, and the prizes (small versions of the tall ones)
// ---------------------------------------------------------------------------

function cartridge(i: number): Px {
  const C = GAME[i]!;
  const p = new Px(16, 16);
  // a chunky cartridge in the game's colour: notched top, a label with its picture, grip ridges
  p.rect(2, 1, 12, 14, C.b).rect(2, 1, 12, 1, C.l2).rect(2, 2, 1, 13, C.l).rect(13, 2, 1, 13, C.d).rect(2, 14, 12, 1, C.d2);
  p.clear(2, 1, 1, 1).clear(13, 1, 1, 1).rect(6, 1, 4, 1, C.d);
  p.rect(4, 3, 8, 7, '#f4f0e6').rect(4, 3, 8, 1, '#ffffff');
  emblem(p, i, 5, 4);
  for (let x = 4; x < 12; x += 2) p.rect(x, 11, 1, 3, C.d);
  p.outline(OUTLINE);
  return p;
}

/** A game's emblem in 6×5 for its cartridge label. */
function emblem(p: Px, i: number, x: number, y: number): void {
  switch (ARCADE_GAMES[i]) {
    case 'rally':
      // the chequered flag
      p.tpl(x, y, ['|#.#.#', '|.#.#.', '|#.#.#', '|.#.#.', '|.....'], { '|': '#8a5a2a', '#': '#1a1a1a' });
      break;
    case 'snow':
      p.tpl(x, y, ['..#...', '#.#.#.', '.###..', '#.#.#.', '..#...'], { '#': '#3a8ae8' }).px(x + 5, y + 4, '#3a8ae8');
      break;
    case 'golf':
      p.tpl(x, y, ['.|RR..', '.|R...', '.|....', 'G|GGo.', 'GGGGGG'], { '|': '#5a5a5a', R: '#e8302a', G: '#3fbf5f', o: '#c8ccd6' });
      break;
    case 'hen':
      p.tpl(x, y, ['.r....', 'WWW...', 'WWWy..', '.WW.o.', '.y.y..'], { W: '#d8d0bc', r: '#e8302a', y: '#f5a623', o: '#8bac0f' }).px(x + 2, y + 1, '#1a1a1a');
      break;
    case 'dance':
      p.tpl(x, y, ['.#....', '###.c.', '.#..c.', '.#.ccc', '....c.'], { '#': '#ff2fc8', c: '#1aa8d8' });
      break;
    case 'star':
      p.tpl(x, y, ['..#...', '.###..', '#####.', '.###..', '.#.#..'], { '#': '#ffb800' }).px(x + 5, y, '#3a3a8a').px(x + 4, y + 4, '#3a3a8a');
      break;
  }
}

function tvIcon(): Px {
  const p = new Px(16, 16);
  p.line(6, 3, 4, 0, '#8a8e9a').line(9, 3, 11, 0, '#8a8e9a');
  p.rect(1, 3, 14, 10, WOOD.d).rect(1, 3, 14, 1, WOOD.b).rect(1, 4, 1, 9, WOOD.b);
  p.rect(2, 4, 10, 8, '#6ac0ff').rect(2, 9, 10, 3, '#4cb04a').rect(2, 9, 10, 1, '#8ae06a');
  p.tpl(5, 6, ['.r.', 'WWW', 'WWy'], { W: '#ffffff', r: '#e8302a', y: '#ffd23f' }).px(9, 6, '#ffd23f');
  p.px(2, 4, '#2a2a30').px(11, 4, '#2a2a30').px(2, 11, '#2a2a30').px(11, 11, '#2a2a30').px(3, 5, '#ffffff');
  p.rect(13, 5, 1, 1, '#d8d8e0').rect(13, 7, 1, 1, '#d8d8e0').rect(13, 9, 1, 3, WOOD.d2);
  p.rect(2, 13, 2, 2, WOOD.d2).rect(12, 13, 2, 2, WOOD.d2);
  return p.outline(OUTLINE);
}

function lavaLampIcon(): Px {
  const p = new Px(16, 16);
  paint(p, 4, 11, 8, 5, (x, y) => {
    const hw = 2.4 + (y - 11) * 0.4;
    const u = (x + 0.5 - 8) / hw;
    return Math.abs(u) > 1 ? null : u < -0.4 ? CHROME.l : u < 0.35 ? CHROME.b : CHROME.d;
  });
  paint(p, 5, 2, 6, 9, (x, y) => {
    const t = (y - 2) / 8;
    const hw = 1.6 + Math.sin(t * Math.PI * 0.9) * 1.4;
    const u = (x + 0.5 - 8) / hw;
    return Math.abs(u) > 1 ? null : u < -0.5 ? '#ff7aa8' : u > 0.55 ? '#c02a5a' : '#ff4a7a';
  });
  p.rect(7, 4, 2, 2, '#ffc040').px(7, 4, '#ffe27a').rect(6, 9, 4, 1, '#ffc040').rect(8, 7, 1, 1, '#ff9a1a');
  p.rect(6, 0, 4, 2, CHROME.b).rect(6, 0, 4, 1, CHROME.l);
  p.outline(OUTLINE);
  return p;
}

function discoBallIcon(): Px {
  const p = new Px(16, 16);
  p.rect(7, 0, 2, 2, CHROME.d);
  paint(p, 2, 2, 12, 12, (x, y) => {
    const dx = (x + 0.5 - 8) / 6;
    const dy = (y + 0.5 - 8) / 6;
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return null;
    const v = light(dx, dy, Math.sqrt(1 - r2) + 0.1) + (hash2(Math.floor(x / 2), Math.floor(y / 2)) % 5 === 0 ? 0.3 : 0);
    if ((y % 2 === 1 || x % 2 === 1) && v < 0.9) return '#5a6070';
    return v > 1 ? '#ffffff' : v > 0.8 ? '#e2e8f4' : v > 0.45 ? '#b4bccc' : v > 0.15 ? '#7e8698' : '#4a5060';
  });
  p.px(5, 9, '#ff6ad8').px(10, 6, '#3fe6ff').px(9, 11, '#ffd23f');
  p.outline(OUTLINE);
  return twinkle(p, 12, 3);
}

function neonSignIcon(): Px {
  const p = new Px(16, 16);
  p.rect(1, 1, 14, 14, '#120a22');
  neon(p, 3, 4, ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], PINK);
  p.outline(OUTLINE);
  return p;
}

/** Icons for the arcade's items, by item id. */
export function arcadeIcons(): Record<string, Px> {
  const out: Record<string, Px> = {
    tv: tvIcon(),
    plush_cow: plushCow(),
    plush_hen: plushHen(),
    plush_dragon: plushDragon(),
    trophy: trophy(),
    lava_lamp: lavaLampIcon(),
    disco_ball: discoBallIcon(),
    neon_sign: neonSignIcon(),
  };
  ARCADE_GAMES.forEach((g, i) => (out[`cart_${g}`] = cartridge(i)));
  return out;
}

// ---------------------------------------------------------------------------

export function drawArcade(set: SetArt): void {
  set('tv', n(2, tv), 0, -12, true);
  set('arcade_hall', n(2, arcadeHall), 0, -16, true);
  // frames 0..5: the machines in ARCADE_GAMES order (pick by variant); 6..11: the same with their screens a step on
  set('arcade_machine', n(12, (i) => machine(i % 6, Math.floor(i / 6))), 0, -18);
  set('prize_counter', [prizeCounter()], 0, -10);
  set('score_board', n(2, scoreBoard), 0, -20, true);
  set('hall_wall', [hallWall()], 0, -8);
  set('hall_exit', [hallExit()]);
  set('plush_cow', [plushCow()]);
  set('plush_hen', [plushHen()]);
  set('plush_dragon', [plushDragon()]);
  set('trophy', [trophy()]);
  set('lava_lamp', n(2, lavaLamp), 0, -8, true);
  set('disco_ball', n(2, discoBall), 0, -12, true);
  set('neon_sign', n(2, neonSign), 0, -8);
}
