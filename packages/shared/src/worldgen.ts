// Tools the area painters share: noise, blobs, scattering, and keeping every way in and out walkable.
import { objectDef } from './data.ts';
import { addObject, inBounds, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import { randInt, valueNoise } from './rng.ts';
import { MAP_H, MAP_W, WALL_TERRAIN, isCliff, key, type MapSize, type Terrain, type WorldObject, type WorldState } from './types.ts';

/**
 * Openings are in the middle of each edge of every map, 2*EDGE_GAP wide, so maps of different sizes
 * (a 96 forest beside a 64 city) still line up: you always come out in the middle of the side you enter.
 */
export const EDGE_GAP = 3;
/** Tile where a traveller arrives in map `m` when entering from a side. */
export const arrivalTile = (m: MapSize, from: 'n' | 's' | 'e' | 'w'): { x: number; y: number } => {
  const W = mapW(m);
  const H = mapH(m);
  switch (from) {
    case 'n':
      return { x: W / 2, y: 1 };
    case 's':
      return { x: W / 2, y: H - 2 };
    case 'w':
      return { x: 1, y: H / 2 };
    case 'e':
      return { x: W - 2, y: H / 2 };
  }
};
/** Is this tile inside one of the four edge openings of map `m`? */
export const inEdgeGap = (m: MapSize, x: number, y: number): boolean => {
  const W = mapW(m);
  const H = mapH(m);
  return (Math.abs(x - W / 2) < EDGE_GAP && (y < 4 || y >= H - 4)) || (Math.abs(y - H / 2) < EDGE_GAP && (x < 4 || x >= W - 4));
};

/** Ground the painters lay down as the base of a biome (trails may be painted over these). */
const BASE_GROUND = new Set<Terrain>(['grass', 'sand', 'snow', 'gravel', 'mud', 'moss', 'redsand', 'candy', 'ash', 'moon']);

/** Is the tile open to walk on: inside the map, walkable ground, nothing solid on it? */
export function walkableTile(world: WorldState, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  if (WALL_TERRAIN.has(world.terrain[tileIndex(world, x, y)]!)) return false;
  const o = objectAt(world, x, y);
  return !o || !objectDef(o.kind).solid;
}

/** Every tile you can walk to from `start` (indices into the terrain array). */
export function reachableFrom(world: WorldState, start: { x: number; y: number }): Uint8Array {
  const W = mapW(world);
  const seen = new Uint8Array(W * mapH(world));
  if (!inBounds(world, start.x, start.y)) return seen;
  const queue = [tileIndex(world, start.x, start.y)];
  seen[queue[0]!] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(world, nx, ny)) continue;
      const n = tileIndex(world, nx, ny);
      if (seen[n] || !walkableTile(world, nx, ny)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Would a solid thing on (x,y) cut its neighbours off from each other? True when the walkable tiles
 * around it do not form one connected ring (the classic "simple point" test).
 */
export function wouldBlock(world: WorldState, x: number, y: number): boolean {
  const ring: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const open = ring.map(([dx, dy]) => walkableTile(world, x + dx, y + dy));
  // count runs of open tiles around the ring, joining across corners only through edge neighbours
  const edgeOpen = [open[1], open[3], open[5], open[7]];
  if (!edgeOpen.some(Boolean)) return false; // nothing walks past here anyway
  // components among the open edge neighbours, linked when the corner between them is open too
  const links = [
    [1, 2, 3], // up – (the corner between them) – right
    [3, 4, 5],
    [5, 6, 7],
    [7, 0, 1],
  ];
  const parent = [1, 3, 5, 7].map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a]!)));
  const slot = (ring: number) => (ring - 1) / 2;
  for (const [a, corner, b] of links) if (open[a!] && open[corner!] && open[b!]) parent[find(slot(a!))] = find(slot(b!));
  const roots = new Set<number>();
  for (const r of [1, 3, 5, 7]) if (open[r]) roots.add(find(slot(r)));
  return roots.size > 1;
}

/** Things that must stay reachable: the four openings and the front of everything you can walk into or open. */
export function landmarkFronts(world: WorldState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const o of Object.values(world.objects)) {
    const def = objectDef(o.kind);
    if (!def.interact || o.kind === 'signpost') continue;
    const fx = o.x + Math.floor((def.w - 1) / 2);
    const fy = o.y + def.h;
    if (inBounds(world, fx, fy)) out.push({ x: fx, y: fy });
  }
  return out;
}

export interface PathStyle {
  /** Ground trails are painted with (null: paths keep whatever ground they cross). */
  trail: Terrain | null;
  /** Trails one tile wide (boardwalks) instead of two. */
  narrow?: boolean;
  /** Lay trails from every opening to the middle for the look of it (else only where something is cut off). */
  trails: boolean;
  /** What a path becomes where it crosses water, bog, chocolate or lava. */
  bridge: (t: Terrain) => Terrain;
  /** What a path becomes where it cuts through a cliff. */
  pass: Terrain;
}

export class Painter {
  readonly T: Terrain[];
  /** Tiles kept free of scattered things (plazas in front of landmarks, paths). */
  readonly reserved = new Set<number>();
  /** The map's size, its middle, and how much bigger it is than a 64×64 map (by side and by area). */
  readonly W: number;
  readonly H: number;
  readonly midX: number;
  readonly midY: number;
  readonly span: number;
  readonly density: number;

  constructor(
    readonly world: WorldState,
    readonly rnd: () => number,
    readonly seed: number,
  ) {
    this.T = world.terrain;
    this.W = mapW(world);
    this.H = mapH(world);
    this.midX = this.W / 2;
    this.midY = this.H / 2;
    this.span = this.W / MAP_W;
    this.density = (this.W * this.H) / (MAP_W * MAP_H);
  }

  idx(x: number, y: number): number {
    return y * this.W + x;
  }
  at(x: number, y: number): Terrain | undefined {
    return inBounds(this.world, x, y) ? this.T[this.idx(x, y)] : undefined;
  }
  set(x: number, y: number, t: Terrain): void {
    if (inBounds(this.world, x, y)) this.T[this.idx(x, y)] = t;
  }
  /** A count meant for a 64×64 map, grown with the map's area so a big map is as full as a small one. */
  many(n: number): number {
    return this.density === 1 ? n : Math.round(n * this.density);
  }
  /**
   * How many more of something a bigger map gets, for a thing a 64×64 map has with chance `p` (a cave, a
   * pond, a stream): none on a 64 map (and no number drawn, so those stay exactly as they were).
   */
  extra(p: number, grow = this.density): number {
    if (grow <= 1) return 0;
    const want = p * (grow - 1);
    const whole = Math.floor(want);
    return whole + (this.chance(want - whole) ? 1 : 0);
  }
  /** Is (x, y) in one of this map's openings? */
  gap(x: number, y: number): boolean {
    return inEdgeGap(this.world, x, y);
  }
  fill(t: Terrain): void {
    this.T.fill(t);
  }
  /** Value noise 0..1 at a scale (tiles per cell); `salt` picks an independent field. */
  noise(x: number, y: number, scale: number, salt = 0): number {
    return valueNoise(x, y, scale, (this.seed + salt * 7919) | 0);
  }
  /** Big shapes with ragged edges. */
  fbm(x: number, y: number, scale: number, salt = 0): number {
    return 0.7 * this.noise(x, y, scale, salt) + 0.3 * this.noise(x, y, scale / 2.5, salt + 101);
  }
  chance(p: number): boolean {
    return this.rnd() < p;
  }
  /** Maps right around the farm show off their landmark (a pyramid, a temple, a cave…) every time. */
  showcase = false;
  /** Put the biome's landmarks (Upptäcktsboken) down; off when an old map is built again only to compare with it. */
  landmarks = true;
  /** A landmark's chance: always yes on a showcase map (it still draws a number, so the rest stays the same). */
  lucky(p: number): boolean {
    return this.chance(p) || this.showcase;
  }
  int(a: number, b: number): number {
    return randInt(this.rnd, a, b);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length)]!;
  }
  /** Distance to the nearest map edge. */
  edge(x: number, y: number): number {
    return Math.min(x, y, this.W - 1 - x, this.H - 1 - y);
  }
  each(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) fn(x, y);
  }
  reserve(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (inBounds(this.world, x + dx, y + dy)) this.reserved.add(this.idx(x + dx, y + dy));
  }
  walkable(x: number, y: number): boolean {
    return walkableTile(this.world, x, y);
  }
  /** Whether a w×h thing fits at (x,y): inside the map, away from the openings, on open ground with nothing on it. */
  fits(x: number, y: number, w = 1, h = 1, ground?: (t: Terrain) => boolean): boolean {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(this.world, tx, ty) || this.gap(tx, ty) || this.reserved.has(this.idx(tx, ty))) return false;
        const t = this.T[this.idx(tx, ty)]!;
        if (ground ? !ground(t) : WALL_TERRAIN.has(t)) return false;
        if (this.world.occupancy[key(tx, ty)] !== undefined) return false;
      }
    return true;
  }
  /** Puts a thing down if it fits. */
  put(kind: string, x: number, y: number, extra: Partial<WorldObject> = {}, ground?: (t: Terrain) => boolean): WorldObject | null {
    const def = objectDef(kind);
    if (!this.fits(x, y, def.w, def.h, ground)) return null;
    return addObject(this.world, kind, x, y, extra);
  }
  /** Paints an irregular blob around (cx, cy). */
  blob(cx: number, cy: number, rx: number, ry: number, paint: (x: number, y: number) => void, rough = 0.35, salt = 0): void {
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++)
      for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
        if (!inBounds(this.world, x, y)) continue;
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const wobble = 1 + rough * (this.noise(x, y, 3, 500 + salt) - 0.5) * 2;
        if (dx * dx + dy * dy <= wobble) paint(x, y);
      }
  }
  /**
   * Scatters up to `count` things where `where` allows; returns how many landed. The count is for a 64×64
   * map: a bigger map gets more, so it is just as full.
   */
  scatter(kind: string, count: number, where: (x: number, y: number) => boolean, extra?: () => Partial<WorldObject>): number {
    count = this.many(count);
    let placed = 0;
    for (let tries = count * 30; tries > 0 && placed < count; tries--) {
      const x = this.int(2, this.W - 3);
      const y = this.int(2, this.H - 3);
      if (!where(x, y)) continue;
      if (objectDef(kind).solid && wouldBlock(this.world, x, y)) continue;
      if (this.put(kind, x, y, extra?.())) placed++;
    }
    return placed;
  }
  /** Rock (or another cliff) in a rough hill, with a cave mouth at the bottom middle. Returns the mouth. */
  caveHill(cx: number, cy: number, cliff: Terrain, theme: number, size = 1): WorldObject | null {
    const rx = 3 + size + this.rnd() * 1.5;
    const ry = 2 + size * 0.7 + this.rnd();
    this.blob(cx, cy, rx, ry, (x, y) => {
      if (this.edge(x, y) < 3 || this.gap(x, y)) return;
      const o = objectAt(this.world, x, y);
      if (o && objectDef(o.kind).breakWith) removeObject(this.world, o.id);
      else if (o) return;
      this.set(x, y, cliff);
    });
    // the mouth sits in the bottom of the hill: rock around it, open ground in front
    const mx = Math.round(cx) - 1;
    let bottom = Math.round(cy);
    while (bottom < this.H - 4 && (isCliff(this.at(mx, bottom + 1)) || isCliff(this.at(mx + 1, bottom + 1)))) bottom++;
    const my = bottom - 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) this.clearTo(mx + dx, my + dy, cliff);
    for (let dx = -1; dx <= 2; dx++) this.clearTo(mx + dx, my + 2, null);
    for (let dx = 0; dx <= 1; dx++) this.clearTo(mx + dx, my + 3, null);
    this.reserve(mx - 1, my + 2, 4, 2);
    return addObject(this.world, 'cave_mouth', mx, my, { variant: theme });
  }
  /** Empties a tile: removes what stands there and sets cliff ground, or (null) open ground. */
  clearTo(x: number, y: number, t: Terrain | null): void {
    if (!inBounds(this.world, x, y)) return;
    const o = objectAt(this.world, x, y);
    if (o) removeObject(this.world, o.id);
    if (t) this.set(x, y, t);
    else if (WALL_TERRAIN.has(this.at(x, y)!)) this.set(x, y, this.ground);
  }
  /** The biome's open ground (what a cleared cliff or filled pond becomes). */
  ground: Terrain = 'grass';
}

/** Can a path go through this object (it is something wild that breaks), or must it go around? */
const removable = (o: WorldObject): boolean => {
  const def = objectDef(o.kind);
  return !!def.breakWith && !def.interact && !o.by;
};

/** Cheapest way from `from` to `to`, preferring open ground, then breakable things, then water or cliffs. */
function cheapestPath(g: Painter, from: { x: number; y: number }, to: { x: number; y: number }, wiggle: boolean): number[] | null {
  const W = g.W;
  const idx = (x: number, y: number): number => g.idx(x, y);
  const N = g.W * g.H;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const start = idx(from.x, from.y);
  const goal = idx(to.x, to.y);
  cost[start] = 0;
  // small binary heap of [cost, index]
  const heap: [number, number][] = [[0, start]];
  const push = (c: number, i: number) => {
    heap.push([c, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0] <= heap[k]![0]) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const stepCost = (x: number, y: number): number => {
    if (g.edge(x, y) <= 1 && !g.gap(x, y) && idx(x, y) !== goal) return Infinity;
    const t = g.T[idx(x, y)]!;
    let c = 1;
    if (t === 'space') return Infinity;
    if (WALL_TERRAIN.has(t)) c = isCliff(t) ? 14 : 10;
    const o = objectAt(g.world, x, y);
    if (o && objectDef(o.kind).solid) {
      if (!removable(o)) return idx(x, y) === goal ? c : Infinity;
      c += 5;
    }
    if (wiggle) c += 2.5 * g.noise(x, y, 5, 900);
    return c;
  };
  while (heap.length) {
    const [c, i] = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === goal) break;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(g.world, nx, ny)) continue;
      const n = idx(nx, ny);
      if (done[n]) continue;
      const sc = stepCost(nx, ny);
      if (sc === Infinity) continue;
      if (c + sc < cost[n]!) {
        cost[n] = c + sc;
        prev[n] = i;
        push(c + sc, n);
      }
    }
  }
  if (!done[goal]) return null;
  const path: number[] = [];
  for (let i = goal; i !== -1; i = prev[i]!) path.push(i);
  return path.reverse();
}

/** Opens a way along a path: breaks what is in the way, bridges water, cuts passes, and paints trails. */
function carve(g: Painter, path: number[], style: PathStyle, paint: boolean): void {
  const W = g.W;
  for (let k = 0; k < path.length; k++) {
    const i = path[k]!;
    const x = i % W;
    const y = (i - x) / W;
    const o = objectAt(g.world, x, y);
    if (o && removable(o) && (objectDef(o.kind).solid || (paint && style.trail))) removeObject(g.world, o.id);
    const t = g.T[i]!;
    if (WALL_TERRAIN.has(t)) g.T[i] = isCliff(t) ? style.pass : style.bridge(t);
    else if (paint && style.trail && BASE_GROUND.has(t)) {
      g.T[i] = style.trail;
      // two tiles wide: also the tile beside the path (to the right of the way it runs)
      const next = style.narrow ? undefined : (path[k + 1] ?? path[k - 1]);
      if (next !== undefined) {
        const nx = next % W;
        const ny = (next - nx) / W;
        const sx = x + (ny !== y ? 1 : 0);
        const sy = y + (nx !== x ? 1 : 0);
        if (inBounds(g.world, sx, sy) && BASE_GROUND.has(g.T[g.idx(sx, sy)]!) && !objectAt(g.world, sx, sy) && g.edge(sx, sy) > 1) g.T[g.idx(sx, sy)] = style.trail;
      }
    }
    g.reserved.add(i);
  }
}

/**
 * Clears the four openings, optionally lays trails to the middle, and makes sure every landmark can be
 * reached from the north opening (or from `from`, in a map without openings).
 */
export function connect(g: Painter, style: PathStyle, opts: { openings?: boolean; from?: { x: number; y: number } } = {}): void {
  const openings = opts.openings ?? true;
  if (openings)
    for (let y = 0; y < g.H; y++)
      for (let x = 0; x < g.W; x++) {
        if (!g.gap(x, y)) continue;
        const o = objectAt(g.world, x, y);
        if (o && removable(o)) removeObject(g.world, o.id);
        const t = g.at(x, y)!;
        if (WALL_TERRAIN.has(t)) g.set(x, y, isCliff(t) ? style.pass : style.bridge(t));
        g.reserved.add(g.idx(x, y));
      }
  const arrivals = openings ? (['n', 's', 'w', 'e'] as const).map((side) => arrivalTile(g.world, side)) : [opts.from ?? { x: g.midX, y: g.midY }];
  if (style.trails && openings) {
    // meet at the open tile nearest the middle
    let hub = { x: g.midX, y: g.midY };
    search: for (let r = 0; r <= 8; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if ((Math.abs(dx) === r || Math.abs(dy) === r) && g.walkable(g.midX + dx, g.midY + dy)) {
            hub = { x: g.midX + dx, y: g.midY + dy };
            break search;
          }
    for (const a of arrivals) {
      const path = cheapestPath(g, a, hub, true);
      if (path) carve(g, path, style, true);
    }
  }
  const wanted = [...arrivals, ...landmarkFronts(g.world)];
  for (const t of wanted) {
    if (!inBounds(g.world, t.x, t.y)) continue;
    // the tile itself must be open
    const o = objectAt(g.world, t.x, t.y);
    if (o && objectDef(o.kind).solid && removable(o)) removeObject(g.world, o.id);
    if (WALL_TERRAIN.has(g.at(t.x, t.y)!)) g.set(t.x, t.y, isCliff(g.at(t.x, t.y)) ? style.pass : style.bridge(g.at(t.x, t.y)!));
    const seen = reachableFrom(g.world, arrivals[0]!);
    if (seen[g.idx(t.x, t.y)]) continue;
    const path = cheapestPath(g, arrivals[0]!, t, false);
    if (path) carve(g, path, style, false);
  }
}

/** The usual bridge: planks over water, bog and chocolate; cooled lava over lava. */
export const plankBridge = (t: Terrain): Terrain => (t === 'lava' ? 'ash' : 'floor_wood');
