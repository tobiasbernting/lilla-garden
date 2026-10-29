// Caves out in the world. Every cave mouth (and the temple, the pyramid and the gingerbread house) leads
// into its own small cave: generated the first time someone walks in, then kept like any other map.
// Each biome has its own look and treasure; the loot chest at the far end gives every player something
// once a week, and the crystals and ore grow back.
import { objectDef } from './data.ts';
import { addObject, emptyWorld, inBounds, objectAt } from './map.ts';
import { hashString, mulberry32, randInt } from './rng.ts';
import { reachableFrom, walkableTile, wouldBlock } from './worldgen.ts';
import { MAP_H, MAP_W, type CaveTheme, type Terrain, type WorldObject, type WorldState } from './types.ts';

/** Order matters: a cave mouth's variant is its theme's index here (it picks the rock's colour). */
export const CAVE_THEMES: CaveTheme[] = ['rot', 'is', 'kristall', 'sjorovare', 'pyramid', 'tempel', 'lava', 'svamp', 'fossil', 'godis', 'rymd'];
export const caveThemeIndex = (t: CaveTheme): number => CAVE_THEMES.indexOf(t);

export const caveKey = (parent: string, mouthId: number): string => `g:${parent}#${mouthId}`;
export const isCaveKey = (k: string | undefined): boolean => !!k && k.startsWith('g:');
export const parseCaveKey = (k: string): { parent: string; mouth: number } | null => {
  const m = /^g:(.+)#(\d+)$/.exec(k);
  return m ? { parent: m[1]!, mouth: Number(m[2]) } : null;
};
/** Under ground: the farm's monster cave or a cave out in the world (dark, no weather, no riding). */
export const isUnderground = (area: string | undefined): boolean => area === 'dungeon' || isCaveKey(area);

/** The kind of cave an entrance leads into, or null if it is not an entrance. */
export function themeOfEntrance(o: WorldObject): CaveTheme | null {
  if (o.kind === 'temple') return 'tempel';
  if (o.kind === 'pyramid') return 'pyramid';
  if (o.kind === 'gingerbread_house') return 'godis';
  if (o.kind === 'cave_mouth') return CAVE_THEMES[o.variant ?? 0] ?? 'rot';
  return null;
}

/** Where you come out of an entrance: the middle of the row in front of it. */
export function entranceFront(o: WorldObject): { x: number; y: number } {
  const def = objectDef(o.kind);
  return { x: o.x + Math.floor((def.w - 1) / 2), y: o.y + def.h };
}

/** cave_wall frames: the farm cave uses 0/1 (plain/torch); world caves use 2 + 2·theme (+1 with a torch). */
export const caveWallVariant = (theme: CaveTheme, lit = false): number => 2 + 2 * caveThemeIndex(theme) + (lit ? 1 : 0);

interface ThemeStyle {
  floor: Terrain;
  /** An underground lake, lava pool or chocolate pond. */
  pool?: Terrain;
  /** Torches on the walls (the built places: the pyramid and the temple). */
  torches: boolean;
  /** What grows by the walls (weighted). */
  veins: { kind: string; weight: number; variant?: number }[];
  /** Things standing about (kind, how many). */
  decor: { kind: string; n: [number, number]; variant?: number }[];
  /** The loot chest's look. */
  chest: number;
  /** Size of the cave (it is carved out of a box this big). */
  size: [number, number];
}

const THEMES: Record<CaveTheme, ThemeStyle> = {
  rot: {
    floor: 'path_dirt',
    pool: 'water',
    torches: false,
    veins: [
      { kind: 'gold_vein', weight: 3 },
      { kind: 'glowshroom', weight: 4 },
      { kind: 'mushroom', weight: 2 },
      { kind: 'crystal', weight: 1, variant: 0 },
    ],
    decor: [{ kind: 'stalagmite', n: [3, 6] }],
    chest: 0,
    size: [40, 30],
  },
  is: {
    floor: 'ice',
    pool: 'water',
    torches: false,
    veins: [
      { kind: 'crystal', weight: 5, variant: 1 },
      { kind: 'gold_vein', weight: 2 },
      { kind: 'gem_vein', weight: 1 },
    ],
    decor: [{ kind: 'stalagmite', n: [4, 7], variant: 1 }],
    chest: 3,
    size: [40, 30],
  },
  kristall: {
    floor: 'gravel',
    pool: 'water',
    torches: false,
    veins: [
      { kind: 'crystal', weight: 6, variant: 0 },
      { kind: 'gold_vein', weight: 3 },
      { kind: 'gem_vein', weight: 2 },
    ],
    decor: [{ kind: 'stalagmite', n: [3, 6] }],
    chest: 0,
    size: [46, 34],
  },
  sjorovare: {
    floor: 'sand',
    pool: 'water',
    torches: true,
    veins: [
      { kind: 'gold_vein', weight: 3 },
      { kind: 'crystal', weight: 1, variant: 1 },
    ],
    decor: [
      { kind: 'barrel', n: [4, 7] },
      { kind: 'shell', n: [3, 6] },
    ],
    chest: 2,
    size: [42, 30],
  },
  pyramid: {
    floor: 'floor_stone',
    torches: true,
    veins: [{ kind: 'gold_vein', weight: 3 }],
    decor: [
      { kind: 'bones', n: [3, 5] },
      { kind: 'ruin_pillar', n: [3, 6] },
    ],
    chest: 1,
    size: [40, 30],
  },
  tempel: {
    floor: 'path_stone',
    pool: 'water',
    torches: true,
    veins: [
      { kind: 'gold_vein', weight: 3 },
      { kind: 'gem_vein', weight: 1 },
    ],
    decor: [
      { kind: 'ruin_pillar', n: [4, 7] },
      { kind: 'fern', n: [4, 8] },
    ],
    chest: 1,
    size: [42, 32],
  },
  lava: {
    floor: 'ash',
    pool: 'lava',
    torches: false,
    veins: [
      { kind: 'fire_crystal', weight: 4 },
      { kind: 'obsidian_rock', weight: 3 },
      { kind: 'gold_vein', weight: 1 },
    ],
    decor: [{ kind: 'stalagmite', n: [3, 5], variant: 6 }],
    chest: 0,
    size: [42, 32],
  },
  svamp: {
    floor: 'moss',
    pool: 'bog',
    torches: false,
    veins: [
      { kind: 'glowshroom', weight: 5 },
      { kind: 'giant_glowshroom', weight: 2 },
      { kind: 'crystal', weight: 1, variant: 0 },
    ],
    decor: [{ kind: 'mushroom', n: [4, 8] }],
    chest: 0,
    size: [40, 30],
  },
  fossil: {
    floor: 'redsand',
    torches: false,
    veins: [
      { kind: 'fossil_rock', weight: 5 },
      { kind: 'gold_vein', weight: 2 },
    ],
    decor: [
      { kind: 'bones', n: [4, 7] },
      { kind: 'stalagmite', n: [2, 4], variant: 8 },
    ],
    chest: 0,
    size: [40, 30],
  },
  godis: {
    floor: 'candy',
    pool: 'choco',
    torches: false,
    veins: [
      { kind: 'crystal', weight: 4, variant: 3 },
      { kind: 'candy_cane', weight: 3 },
      { kind: 'lollipop_tree', weight: 1 },
    ],
    decor: [],
    chest: 5,
    size: [40, 30],
  },
  rymd: {
    floor: 'moon',
    torches: false,
    veins: [
      { kind: 'star_crystal', weight: 3 },
      { kind: 'crystal', weight: 3, variant: 2 },
      { kind: 'moon_rock', weight: 3 },
    ],
    decor: [{ kind: 'stalagmite', n: [2, 4], variant: 10 }],
    chest: 4,
    size: [40, 30],
  },
};

/** The floor of a cave theme (regrowth puts crystals back on it). */
export const caveFloor = (t: CaveTheme): Terrain => THEMES[t].floor;

const idx = (x: number, y: number): number => y * MAP_W + x;
const N8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Builds the cave behind an entrance. Deterministic for the key. */
export function generateCave(key: string, theme: CaveTheme, parent: string, out: { x: number; y: number }): WorldState {
  const seed = hashString(key);
  for (let attempt = 0; attempt < 12; attempt++) {
    const w = carveCave(key, theme, parent, out, (seed + attempt * 977) >>> 0);
    if (w) return w;
  }
  return carveCave(key, theme, parent, out, seed, true)!;
}

function carveCave(key: string, theme: CaveTheme, parent: string, out: { x: number; y: number }, seed: number, plain = false): WorldState | null {
  const st = THEMES[theme];
  const rnd = mulberry32(seed);
  const [W, H] = st.size;
  // 1. cellular-automaton rock: random fill, smoothed into rounded caverns
  let open = new Uint8Array(MAP_W * MAP_H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) open[idx(x, y)] = plain || rnd() < 0.56 ? 1 : 0;
  const rockAround = (g: Uint8Array, x: number, y: number) => {
    let n = 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || !g[idx(nx, ny)]) n++;
    }
    return n;
  };
  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(MAP_W * MAP_H);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const r = rockAround(open, x, y);
        next[idx(x, y)] = r >= 5 ? 0 : r <= 3 ? 1 : open[idx(x, y)]!;
      }
    open = next;
  }
  // 2. keep the biggest cavern
  let best: number[] = [];
  const seen = new Uint8Array(MAP_W * MAP_H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const s = idx(x, y);
      if (!open[s] || seen[s]) continue;
      const comp: number[] = [];
      const q = [s];
      seen[s] = 1;
      while (q.length) {
        const i = q.pop()!;
        comp.push(i);
        const cx = i % MAP_W;
        const cy = (i - cx) / MAP_W;
        for (const [dx, dy] of N4) {
          const n = idx(cx + dx, cy + dy);
          if (open[n] && !seen[n]) {
            seen[n] = 1;
            q.push(n);
          }
        }
      }
      if (comp.length > best.length) best = comp;
    }
  if (best.length < W * H * 0.3) return null;
  open = new Uint8Array(MAP_W * MAP_H);
  for (const i of best) open[i] = 1;

  const world = emptyWorld();
  world.area = key;
  world.biome = `g_${theme}`;
  const T = world.terrain;
  T.fill('rock');
  for (const i of best) T[i] = st.floor;

  // 3. the way out: the lowest open tile nearest the middle
  let exit = best[0]!;
  let exitScore = -Infinity;
  for (const i of best) {
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    if (!open[idx(x, y - 1)]) continue; // room above it for the start tile
    const score = y * 3 - Math.abs(x - W / 2);
    if (score > exitScore) {
      exitScore = score;
      exit = i;
    }
  }
  const ex = exit % MAP_W;
  const ey = (exit - ex) / MAP_W;
  addObject(world, 'cave_exit', ex, ey);
  const start = { x: ex, y: ey - 1 };

  // 4. distances from the start; the chest goes far away in an open spot
  const dist = new Int32Array(MAP_W * MAP_H).fill(-1);
  dist[idx(start.x, start.y)] = 0;
  const q = [idx(start.x, start.y)];
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    for (const [dx, dy] of N4) {
      const n = idx(x + dx, y + dy);
      if (open[n] && dist[n] === -1) {
        dist[n] = dist[i]! + 1;
        q.push(n);
      }
    }
  }
  const openAround = (x: number, y: number) => N8.filter(([dx, dy]) => open[idx(x + dx, y + dy)]).length;
  let chestAt = -1;
  for (const i of best) {
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    if (openAround(x, y) < 7) continue;
    if (chestAt === -1 || dist[i]! > dist[chestAt]!) chestAt = i;
  }
  if (chestAt === -1) return null;
  const chestX = chestAt % MAP_W;
  const chestY = (chestAt - chestX) / MAP_W;
  addObject(world, 'loot_chest', chestX, chestY, { variant: st.chest, loot: `cave_${theme}` });

  // 5. a secret room behind rubble (break it with the pickaxe), sometimes
  if (!plain && rnd() < 0.6) secretRoom(world, open, W, H, start, rnd, st, theme);

  // 6. pools, if they leave everything reachable
  const keep = () => {
    const r = reachableFrom(world, start);
    return !!r[idx(chestX, chestY + 1)] || !!r[idx(chestX, chestY - 1)] || !!r[idx(chestX + 1, chestY)] || !!r[idx(chestX - 1, chestY)];
  };
  if (st.pool && !plain) {
    const pools = randInt(rnd, 1, 2);
    for (let k = 0; k < pools; k++) {
      const c = best[Math.floor(rnd() * best.length)]!;
      const cx = c % MAP_W;
      const cy = (c - cx) / MAP_W;
      if (Math.abs(cx - start.x) + Math.abs(cy - start.y) < 6 || Math.abs(cx - chestX) + Math.abs(cy - chestY) < 4) continue;
      const r = 1.3 + rnd() * 1.6;
      const painted: number[] = [];
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (!inBounds(x, y) || !open[idx(x, y)] || objectAt(world, x, y)) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          painted.push(idx(x, y));
          T[idx(x, y)] = st.pool;
        }
      if (!keep()) for (const i of painted) T[i] = st.floor;
    }
  }

  // 7. walls: rock next to open ground gets a cave_wall (with torches in the built places)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (T[idx(x, y)] !== 'rock') continue;
      if (!N8.some(([dx, dy]) => inBounds(x + dx, y + dy) && T[idx(x + dx, y + dy)] !== 'rock')) continue;
      addObject(world, 'cave_wall', x, y, { variant: caveWallVariant(theme) });
    }
  if (st.torches) {
    let lit = 0;
    for (let tries = 0; tries < 400 && lit < 8; tries++) {
      const x = randInt(rnd, 1, W - 2);
      const y = randInt(rnd, 1, H - 3);
      const wall = objectAt(world, x, y);
      if (!wall || wall.kind !== 'cave_wall' || T[idx(x, y + 1)] !== st.floor || objectAt(world, x, y + 1)) continue;
      if (Math.abs(x - start.x) + Math.abs(y + 1 - start.y) < 3) continue;
      wall.variant = caveWallVariant(theme, true);
      addObject(world, 'cave_torch', x, y + 1);
      lit++;
    }
  }

  // 8. what grows by the walls, and things standing about
  const nearWall = (x: number, y: number) => N4.some(([dx, dy]) => T[idx(x + dx, y + dy)] === 'rock');
  const freeFloor = (x: number, y: number) =>
    T[idx(x, y)] === st.floor && !objectAt(world, x, y) && Math.abs(x - start.x) + Math.abs(y - start.y) > 3 && Math.abs(x - chestX) + Math.abs(y - chestY) > 1;
  const total = st.veins.reduce((n, v) => n + v.weight, 0);
  const veins = plain ? 4 : randInt(rnd, 10, 16);
  for (let placed = 0, tries = 0; placed < veins && tries < 800; tries++) {
    const i = best[Math.floor(rnd() * best.length)]!;
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    if (!freeFloor(x, y) || !nearWall(x, y)) continue;
    let r = rnd() * total;
    let v = st.veins[0]!;
    for (const c of st.veins) {
      r -= c.weight;
      if (r <= 0) {
        v = c;
        break;
      }
    }
    if (objectDef(v.kind).solid && wouldBlock(world, x, y)) continue;
    addObject(world, v.kind, x, y, v.variant !== undefined ? { variant: v.variant } : {});
    placed++;
  }
  for (const d of st.decor) {
    const n = plain ? 0 : randInt(rnd, d.n[0], d.n[1]);
    for (let placed = 0, tries = 0; placed < n && tries < 400; tries++) {
      const i = best[Math.floor(rnd() * best.length)]!;
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      if (!freeFloor(x, y)) continue;
      if (objectDef(d.kind).solid && wouldBlock(world, x, y)) continue;
      addObject(world, d.kind, x, y, d.variant !== undefined ? { variant: d.variant } : {});
      placed++;
    }
  }
  if (!keep()) return null;
  world.cave = { theme, w: W, h: H, start, parent, out };
  world.renew = countRenewables(world);
  return world;
}

/** Carves a small room into the rock next to the cave, sealed off by rubble, with a chest of its own. */
function secretRoom(world: WorldState, open: Uint8Array, W: number, H: number, start: { x: number; y: number }, rnd: () => number, st: ThemeStyle, theme: CaveTheme): void {
  const T = world.terrain;
  for (let tries = 0; tries < 300; tries++) {
    const rw = randInt(rnd, 4, 6);
    const rh = randInt(rnd, 3, 4);
    const rx = randInt(rnd, 2, W - rw - 2);
    const ry = randInt(rnd, 2, H - rh - 2);
    // the room and a rim of one tile around it must be solid rock
    let solid = true;
    for (let y = ry - 1; y <= ry + rh && solid; y++) for (let x = rx - 1; x <= rx + rw && solid; x++) if (open[idx(x, y)]) solid = false;
    if (!solid) continue;
    // a straight tunnel of 2–3 rubble tiles from a side of the room to the cave
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const;
    const [dx, dy] = dirs[Math.floor(rnd() * 4)]!;
    const sx = dx === 0 ? rx + Math.floor(rw / 2) : dx > 0 ? rx + rw : rx - 1;
    const sy = dy === 0 ? ry + Math.floor(rh / 2) : dy > 0 ? ry + rh : ry - 1;
    let len = 0;
    let found = false;
    for (let k = 0; k < 4; k++) {
      const tx = sx + dx * k;
      const ty = sy + dy * k;
      if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) break;
      if (open[idx(tx, ty)]) {
        found = len >= 1;
        break;
      }
      len++;
    }
    if (!found) continue;
    const doorX = sx + dx * len;
    const doorY = sy + dy * len;
    if (Math.abs(doorX - start.x) + Math.abs(doorY - start.y) < 6) continue;
    for (let y = ry; y < ry + rh; y++)
      for (let x = rx; x < rx + rw; x++) {
        T[idx(x, y)] = st.floor;
        open[idx(x, y)] = 1;
      }
    for (let k = 0; k < len; k++) {
      const tx = sx + dx * k;
      const ty = sy + dy * k;
      T[idx(tx, ty)] = st.floor;
      open[idx(tx, ty)] = 1;
      addObject(world, 'cave_rock', tx, ty);
    }
    addObject(world, 'loot_chest', rx + Math.floor(rw / 2), ry + Math.floor(rh / 2) - (dy > 0 ? 1 : 0), { variant: st.chest, loot: 'secret' });
    void theme;
    return;
  }
}

// ---------------------------------------------------------------------------
// Regrowth: things worth finding come back over the days, never beyond what the fresh map had
// ---------------------------------------------------------------------------

/** What grows back and where (any open ground if `on` is missing; `wall`: only next to a cave wall). */
export const RENEWABLE: Record<string, { on?: Terrain[]; wall?: boolean }> = {
  mushroom: { on: ['grass', 'moss', 'mud', 'path_dirt'] },
  beehive: { on: ['grass'] },
  iceberry: { on: ['snow'] },
  shell: { on: ['sand'] },
  cactus: { on: ['sand', 'redsand'] },
  ore: { on: ['gravel'] },
  blueberry_bush: { on: ['grass'] },
  cloudberry: { on: ['mud', 'grass'] },
  wisp: { on: ['mud', 'grass'] },
  banana_plant: { on: ['grass'] },
  glowshroom: { on: ['moss', 'grass', 'path_dirt'] },
  fire_crystal: { on: ['ash'] },
  obsidian_rock: { on: ['ash'] },
  fossil_rock: { on: ['redsand'] },
  lollipop_tree: { on: ['candy'] },
  candy_cane: { on: ['candy'] },
  moon_rock: { on: ['moon'] },
  star_crystal: { on: ['moon'] },
  moon_cheese: { on: ['moon'] },
  dig_spot: { on: ['sand', 'redsand', 'moon'] },
  crystal: { wall: true },
  gold_vein: { wall: true },
  gem_vein: { wall: true },
};

/** How many of each renewable thing a map has (its regrowth baseline). */
export function countRenewables(world: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of Object.values(world.objects)) if (RENEWABLE[o.kind]) out[o.kind] = (out[o.kind] ?? 0) + 1;
  return out;
}

/**
 * Grows back a share of what was picked, mined or dug up in a map (a quarter of the baseline a day),
 * keeping clear of the openings, the fronts of doors and caves, people and narrow passages.
 * Returns the new objects.
 */
export function regrow(world: WorldState, rnd: () => number, blocked: (x: number, y: number) => boolean): WorldObject[] {
  const added: WorldObject[] = [];
  if (!world.renew) return added;
  const T = world.terrain;
  const have: Record<string, number> = {};
  const variants: Record<string, number[]> = {};
  for (const o of Object.values(world.objects)) {
    have[o.kind] = (have[o.kind] ?? 0) + 1;
    if (o.variant !== undefined) (variants[o.kind] ??= []).push(o.variant);
  }
  const box = world.cave ? { w: world.cave.w, h: world.cave.h } : { w: MAP_W, h: MAP_H };
  const caveFloorT = world.cave ? THEMES[world.cave.theme].floor : null;
  for (const [kind, base] of Object.entries(world.renew)) {
    const rule = RENEWABLE[kind];
    if (!rule) continue;
    const missing = base - (have[kind] ?? 0);
    if (missing <= 0) continue;
    let n = Math.min(missing, Math.max(1, Math.ceil(base / 4)));
    const def = objectDef(kind);
    for (let tries = n * 60; tries > 0 && n > 0; tries--) {
      const x = randInt(rnd, 1, box.w - 2);
      const y = randInt(rnd, 1, box.h - 2);
      const t = T[idx(x, y)]!;
      if (caveFloorT ? t !== caveFloorT : rule.on ? !rule.on.includes(t) : !walkableTile(world, x, y)) continue;
      if (objectAt(world, x, y) || blocked(x, y)) continue;
      if (rule.wall && !N4.some(([dx, dy]) => T[idx(x + dx, y + dy)] === 'rock')) continue;
      if (def.solid && wouldBlock(world, x, y)) continue;
      const vs = variants[kind];
      const o = addObject(world, kind, x, y, vs?.length ? { variant: vs[Math.floor(rnd() * vs.length)]! } : {});
      if (!o) continue;
      added.push(o);
      n--;
    }
  }
  return added;
}
