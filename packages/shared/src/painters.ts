// One painter per biome: the ground, water and cliffs first, then landmarks, plants and things to find,
// and last the paths that keep every opening and entrance reachable.
import { CAVE_THEMES } from './caves.ts';
import { addObject, objectAt } from './map.ts';
import { BASE_ROCKET, buildLaunchSite } from './space.ts';
import { Painter, connect, inEdgeGap, plankBridge } from './worldgen.ts';
import { MAP_H, MAP_W, WALL_TERRAIN, isCliff, type CaveTheme, type Terrain } from './types.ts';

export type PaintFn = (g: Painter) => void;

const theme = (t: CaveTheme): number => CAVE_THEMES.indexOf(t);
const MID = MAP_W / 2;

/** A ring of `kinds` around the map (thick at the very edge), leaving the openings free. */
function belt(g: Painter, kind: () => string, inner: number, ground?: (t: Terrain) => boolean): void {
  g.each((x, y) => {
    const e = g.edge(x, y);
    if (e <= 1 ? g.chance(0.95) : e <= 3 && g.chance(inner)) g.put(kind(), x, y, {}, ground);
  });
}

/** Cliffs around the map instead of trees (mountains, Dinodalen, the volcano). */
function cliffBelt(g: Painter, cliff: Terrain, salt: number): void {
  g.each((x, y) => {
    if (inEdgeGap(x, y)) return;
    const e = g.edge(x, y);
    const n = g.noise(x, y, 4, salt);
    if (e <= 1 || (e === 2 && n > 0.3) || (e === 3 && n > 0.65)) g.set(x, y, cliff);
  });
}

/** A winding stream (or river of lava, or chocolate) across the map, away from the middle openings. */
function stream(g: Painter, t: Terrain, width: number, salt: number): void {
  const vertical = g.chance(0.5);
  let pos = g.chance(0.5) ? g.int(12, 22) : g.int(42, 52);
  for (let s = 0; s < MAP_W; s++) {
    pos += (g.noise(s, 0, 6, salt) - 0.5) * 1.8;
    pos = Math.max(6, Math.min(MAP_W - 7 - width, pos));
    if (Math.abs(pos + width / 2 - MID) < 6) pos += pos < MID ? -1 : 1;
    const p = Math.round(pos);
    for (let w = 0; w < width; w++) {
      const x = vertical ? p + w : s;
      const y = vertical ? s : p + w;
      if (!inEdgeGap(x, y)) g.set(x, y, t);
    }
  }
}

/** Ponds (or bog pools, lava lakes…) wherever a noise field is high. */
function pools(g: Painter, t: Terrain, scale: number, above: number, salt: number, keepEdge = 4): void {
  g.each((x, y) => {
    if (g.edge(x, y) < keepEdge || inEdgeGap(x, y)) return;
    if (g.fbm(x, y, scale, salt) > above) g.set(x, y, t);
  });
}

/** A spot for a landmark: open ground, away from the edges and the openings' paths. */
function spot(g: Painter, w: number, h: number, ok: (t: Terrain) => boolean = (t) => !WALL_TERRAIN.has(t)): { x: number; y: number } | null {
  for (let tries = 0; tries < 200; tries++) {
    const x = g.int(8, MAP_W - 9 - w);
    const y = g.int(8, MAP_H - 10 - h);
    if (Math.abs(x + w / 2 - MID) < 4 + w / 2 || Math.abs(y + h / 2 - MID) < 3 + h / 2) continue; // keep the crossroads open
    let good = true;
    for (let dy = -1; dy <= h + 2 && good; dy++) for (let dx = -1; dx <= w && good; dx++) if (!ok(g.at(x + dx, y + dy)!)) good = false;
    if (good) return { x, y };
  }
  return null;
}

/** A cave hill somewhere open. */
function caveSomewhere(g: Painter, cliff: Terrain, t: CaveTheme, size = 1): void {
  const s = spot(g, 8, 6);
  if (s) g.caveHill(s.x + 4, s.y + 2, cliff, theme(t), size);
}

/** A cave mouth cut into the foot of an existing cliff, if there is a good face; else a hill of its own. */
function caveInCliff(g: Painter, cliff: Terrain, t: CaveTheme): void {
  for (let tries = 0; tries < 400; tries++) {
    const x = g.int(6, MAP_W - 8);
    const y = g.int(6, MAP_H - 9);
    if (inEdgeGap(x, y + 2) || inEdgeGap(x + 1, y + 2)) continue;
    let face = true;
    for (let dy = -1; dy <= 1 && face; dy++) for (let dx = 0; dx <= 1 && face; dx++) if (!isCliff(g.at(x + dx, y + dy))) face = false;
    for (let dx = 0; dx <= 1 && face; dx++) if (WALL_TERRAIN.has(g.at(x + dx, y + 2)!) || objectAt(g.world, x + dx, y + 2) || WALL_TERRAIN.has(g.at(x + dx, y + 3)!)) face = false;
    if (!face) continue;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) g.clearTo(x + dx, y + dy, cliff);
    g.reserve(x - 1, y + 2, 4, 2);
    addObject(g.world, 'cave_mouth', x, y, { variant: theme(t) });
    return;
  }
  caveSomewhere(g, cliff, t);
}

const flowerVariant = (g: Painter) => ({ variant: g.int(0, 3) });
const tuftVariant = (g: Painter) => ({ variant: g.int(0, 2) });
const open = (g: Painter, x: number, y: number, ...ground: Terrain[]) => g.edge(x, y) > 3 && ground.includes(g.at(x, y)!) && !objectAt(g.world, x, y);

// ---------------------------------------------------------------------------- Skogen

const skog: PaintFn = (g) => {
  g.ground = 'grass';
  g.fill('grass');
  if (g.chance(0.5)) stream(g, 'water', g.int(1, 2), 11);
  if (g.chance(0.55)) caveSomewhere(g, 'rock', 'rot');
  const tree = () => g.pick(['tree', 'tree', 'tree', 'tree_pine', 'tree_pine', 'tree_apple']);
  belt(g, tree, 0.85);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y) || g.at(x, y) !== 'grass') return;
    const d = g.fbm(x, y, 9, 1);
    if (d > 0.5 && g.chance((d - 0.5) * 1.7)) g.put(tree(), x, y);
    else if (d < 0.38) {
      if (g.chance(0.07)) g.put('flower', x, y, flowerVariant(g));
      else if (g.chance(0.06)) g.put('grass_tuft', x, y, tuftVariant(g));
    } else if (g.chance(0.025)) g.put('bush', x, y);
  });
  g.scatter('blueberry_bush', g.int(5, 9), (x, y) => open(g, x, y, 'grass') && g.fbm(x, y, 9, 1) > 0.4);
  g.scatter('mushroom', g.int(4, 8), (x, y) => open(g, x, y, 'grass'));
  g.scatter('rock_small', g.int(2, 5), (x, y) => open(g, x, y, 'grass'));
  g.scatter('stump', g.int(1, 3), (x, y) => open(g, x, y, 'grass'));
  connect(g, { trail: 'path_dirt', trails: true, bridge: plankBridge, pass: 'grass' });
};

// ---------------------------------------------------------------------------- Ängen

const ang: PaintFn = (g) => {
  g.ground = 'grass';
  g.fill('grass');
  const ponds = g.int(1, 2);
  for (let i = 0; i < ponds; i++) {
    const s = spot(g, 10, 7);
    if (!s) continue;
    const sandy = g.chance(0.5);
    const cx = s.x + 5;
    const cy = s.y + 3;
    const rx = g.int(3, 5);
    const ry = g.int(2, 3);
    if (sandy) g.blob(cx, cy, rx + 1.2, ry + 1.2, (x, y) => g.set(x, y, 'sand'), 0.3, i);
    g.blob(cx, cy, rx, ry, (x, y) => g.set(x, y, 'water'), 0.3, i);
  }
  if (g.chance(0.3)) caveSomewhere(g, 'rock', 'rot', 0);
  belt(g, () => g.pick(['tree', 'tree', 'tree_apple', 'tree_pine']), 0.55);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y) || g.at(x, y) !== 'grass') return;
    if (g.fbm(x, y, 8, 2) > 0.7 && g.chance(0.45)) g.put(g.pick(['tree', 'tree_apple']), x, y);
    else if (g.chance(0.12)) g.put('flower', x, y, flowerVariant(g));
    else if (g.chance(0.09)) g.put('grass_tuft', x, y, tuftVariant(g));
    else if (g.chance(0.01)) g.put('bush', x, y);
  });
  g.scatter('beehive', g.int(1, 3), (x, y) => open(g, x, y, 'grass') && g.fbm(x, y, 8, 2) > 0.55);
  g.scatter('rock_small', g.int(2, 4), (x, y) => open(g, x, y, 'grass'));
  connect(g, { trail: g.chance(0.5) ? 'path_dirt' : null, trails: true, bridge: plankBridge, pass: 'grass' });
};

// ---------------------------------------------------------------------------- Isvidderna

const is: PaintFn = (g) => {
  g.ground = 'snow';
  g.fill('snow');
  pools(g, 'ice', 12, 0.66, 3);
  g.each((x, y) => {
    if (g.edge(x, y) < 4 || inEdgeGap(x, y) || g.at(x, y) === 'ice') return;
    if (g.fbm(x, y, 9, 4) > 0.68) g.set(x, y, 'rock');
  });
  if (g.chance(0.7)) caveInCliff(g, 'rock', 'is');
  belt(g, () => g.pick(['tree_pine', 'tree_pine', 'rock']), 0.65);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y) || g.at(x, y) !== 'snow') return;
    const d = g.fbm(x, y, 8, 5);
    if (d > 0.6 && g.chance(0.35)) g.put('tree_pine', x, y);
    else if (g.chance(0.012)) g.put(g.pick(['rock', 'rock_small']), x, y);
  });
  g.scatter('iceberry', g.int(6, 10), (x, y) => open(g, x, y, 'snow'));
  if (g.chance(0.4)) g.scatter('snowman_wild', 1, (x, y) => open(g, x, y, 'snow'));
  connect(g, { trail: null, trails: false, bridge: plankBridge, pass: 'snow' });
};

// ---------------------------------------------------------------------------- Bergen

const berg: PaintFn = (g) => {
  g.ground = 'gravel';
  g.fill('gravel');
  g.each((x, y) => {
    if (g.fbm(x, y, 10, 6) < 0.36) g.set(x, y, 'grass');
  });
  cliffBelt(g, 'rock', 7);
  g.each((x, y) => {
    if (g.edge(x, y) < 3 || inEdgeGap(x, y)) return;
    if (Math.hypot(x - MID, y - MID) < 7) return; // a valley in the middle
    if (g.fbm(x, y, 11, 8) > 0.58) g.set(x, y, 'rock');
  });
  if (g.chance(0.5)) {
    const s = spot(g, 8, 6, (t) => t === 'gravel' || t === 'grass');
    if (s) g.blob(s.x + 4, s.y + 3, g.int(2, 4), g.int(2, 3), (x, y) => g.set(x, y, 'water'), 0.3, 9);
  }
  caveInCliff(g, 'rock', 'kristall');
  if (g.chance(0.45)) caveInCliff(g, 'rock', 'kristall');
  g.each((x, y) => {
    if (g.edge(x, y) <= 2 || objectAt(g.world, x, y)) return;
    const t = g.at(x, y);
    if (t !== 'gravel' && t !== 'grass') return;
    if (g.fbm(x, y, 7, 10) > 0.6 && g.chance(0.25)) g.put('tree_pine', x, y);
    else if (g.chance(0.035)) g.put(g.pick(['rock', 'rock', 'rock_small']), x, y);
    else if (t === 'grass' && g.chance(0.05)) g.put('grass_tuft', x, y, tuftVariant(g));
    else if (t === 'grass' && g.chance(0.02)) g.put('flower', x, y, flowerVariant(g));
  });
  g.scatter('ore', g.int(6, 10), (x, y) => open(g, x, y, 'gravel'));
  connect(g, { trail: null, trails: true, bridge: plankBridge, pass: 'gravel' });
};

// ---------------------------------------------------------------------------- Stranden

const strand: PaintFn = (g) => {
  g.ground = 'sand';
  g.fill('sand');
  // the sea to the west, with a wavy shore
  const shoreAt: number[] = [];
  for (let y = 0; y < MAP_H; y++) {
    const shore = 11 + Math.round(Math.sin(y / 6) * 2.5 + (g.noise(0, y, 5, 12) - 0.5) * 4);
    shoreAt.push(shore);
    for (let x = 0; x < shore; x++) if (!inEdgeGap(x, y)) g.set(x, y, 'water');
  }
  g.each((x, y) => {
    if (x > shoreAt[y]! + 10 && g.fbm(x, y, 9, 13) > 0.58) g.set(x, y, 'grass');
  });
  // a sea cave in the cliffs by the shore, and a wreck on the beach
  if (g.chance(0.55)) {
    const y = g.int(10, 22) + (g.chance(0.5) ? 28 : 0);
    g.caveHill(shoreAt[y]! + 5, y, 'rock', theme('sjorovare'), 1);
  }
  if (g.chance(0.5)) {
    for (let tries = 0; tries < 60; tries++) {
      const y = g.int(8, MAP_H - 12);
      if (Math.abs(y - MID) < 5) continue;
      const x = shoreAt[y]! + 1;
      const wreck = g.put('shipwreck', x, y);
      if (!wreck) continue;
      g.put('loot_chest', x + 4, y + 1, { variant: 2, loot: 'shipwreck' }) ?? g.put('loot_chest', x + 1, y + 2, { variant: 2, loot: 'shipwreck' });
      break;
    }
  }
  belt(g, () => g.pick(['palm', 'palm', 'rock_small']), 0.35);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y)) return;
    const t = g.at(x, y);
    if (t === 'grass' && g.chance(0.12)) g.put('grass_tuft', x, y, tuftVariant(g));
    else if (t === 'sand' && x > shoreAt[y]! + 6 && g.chance(0.025)) g.put('palm', x, y);
  });
  g.scatter('shell', g.int(8, 12), (x, y) => open(g, x, y, 'sand') && x < shoreAt[y]! + 6);
  g.scatter('rock_small', g.int(2, 4), (x, y) => open(g, x, y, 'sand'));
  g.scatter('dig_spot', g.int(2, 3), (x, y) => open(g, x, y, 'sand') && x > shoreAt[y]! + 2);
  connect(g, { trail: null, trails: false, bridge: plankBridge, pass: 'sand' });
};

// ---------------------------------------------------------------------------- Öknen

const oken: PaintFn = (g) => {
  g.ground = 'sand';
  g.fill('sand');
  g.each((x, y) => {
    if (g.edge(x, y) < 4 || inEdgeGap(x, y)) return;
    if (g.fbm(x, y, 12, 14) > 0.7) g.set(x, y, 'sandstone');
  });
  if (g.chance(0.5)) {
    const s = spot(g, 10, 8, (t) => t === 'sand');
    if (s) {
      const cx = s.x + 5;
      const cy = s.y + 4;
      g.blob(cx, cy, 5, 4, (x, y) => g.set(x, y, 'grass'), 0.3, 15);
      g.blob(cx, cy, 3, 2, (x, y) => g.set(x, y, 'water'), 0.3, 16);
      for (let k = 0; k < 6; k++) g.put('palm', cx + g.int(-5, 5), cy + g.int(-4, 4));
    }
  }
  if (g.chance(0.5)) {
    const s = spot(g, 6, 4, (t) => t === 'sand');
    if (s) {
      g.put('pyramid', s.x, s.y);
      g.reserve(s.x - 1, s.y + 4, 8, 2);
    }
  } else if (g.chance(0.4)) caveInCliff(g, 'sandstone', 'pyramid');
  belt(g, () => g.pick(['cactus', 'rock', 'rock_small', 'palm']), 0.2);
  g.scatter('cactus', g.int(8, 14), (x, y) => open(g, x, y, 'sand'));
  g.scatter('rock', g.int(2, 4), (x, y) => open(g, x, y, 'sand'));
  g.scatter('dig_spot', g.int(2, 3), (x, y) => open(g, x, y, 'sand'));
  connect(g, { trail: null, trails: false, bridge: plankBridge, pass: 'sand' });
};

// ---------------------------------------------------------------------------- Träsket

const trask: PaintFn = (g) => {
  g.ground = 'mud';
  g.fill('mud');
  g.each((x, y) => {
    if (g.fbm(x, y, 7, 17) < 0.4) g.set(x, y, 'grass');
  });
  pools(g, 'bog', 6, 0.6, 18, 3);
  if (g.chance(0.3)) caveSomewhere(g, 'rock', 'rot', 0);
  belt(g, () => g.pick(['dead_tree', 'tree_pine', 'dead_tree', 'bush']), 0.6);
  const byBog = (x: number, y: number) => [g.at(x + 1, y), g.at(x - 1, y), g.at(x, y + 1), g.at(x, y - 1)].includes('bog');
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y)) return;
    const t = g.at(x, y);
    if (t !== 'mud' && t !== 'grass') return;
    if (byBog(x, y) && g.chance(0.3)) g.put('reed', x, y);
    else if (g.chance(0.035)) g.put('dead_tree', x, y);
    else if (t === 'grass' && g.chance(0.03)) g.put('tree_pine', x, y);
    else if (t === 'grass' && g.chance(0.06)) g.put('grass_tuft', x, y, tuftVariant(g));
  });
  g.scatter('cloudberry', g.int(6, 10), (x, y) => open(g, x, y, 'mud', 'grass'));
  g.scatter('wisp', g.int(4, 7), (x, y) => open(g, x, y, 'mud', 'grass') && byBog(x, y));
  g.scatter('mushroom', g.int(3, 5), (x, y) => open(g, x, y, 'grass', 'mud'));
  connect(g, { trail: 'floor_wood', narrow: true, trails: true, bridge: plankBridge, pass: 'mud' });
};

// ---------------------------------------------------------------------------- Djungeln

const djungel: PaintFn = (g) => {
  g.ground = 'grass';
  g.fill('grass');
  if (g.chance(0.6)) stream(g, 'water', 2, 19);
  if (g.chance(0.65)) {
    const s = spot(g, 8, 7, (t) => t === 'grass');
    if (s) {
      // a stone plaza with the temple at the back and pillars around it
      for (let y = s.y - 1; y < s.y + 7; y++) for (let x = s.x - 2; x < s.x + 6; x++) g.set(x, y, 'path_stone');
      g.put('temple', s.x, s.y, {}, () => true);
      for (const [dx, dy] of [
        [-2, 0],
        [5, 0],
        [-2, 4],
        [5, 4],
      ] as const)
        g.put('ruin_pillar', s.x + dx, s.y + dy, {}, () => true);
      g.reserve(s.x - 2, s.y - 1, 8, 8);
    }
  }
  belt(g, () => g.pick(['jungle_tree', 'jungle_tree', 'palm', 'tree']), 0.9);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y) || g.at(x, y) !== 'grass') return;
    const d = g.fbm(x, y, 6, 20);
    if (d > 0.44 && g.chance(0.6)) g.put(g.pick(['jungle_tree', 'jungle_tree', 'palm', 'tree']), x, y);
    else if (g.chance(0.06)) g.put('fern', x, y);
    else if (g.chance(0.05)) g.put('jungle_flower', x, y, { variant: g.int(0, 2) });
    else if (g.chance(0.03)) g.put('bush', x, y);
  });
  g.scatter('banana_plant', g.int(5, 8), (x, y) => open(g, x, y, 'grass'));
  g.scatter('ruin_pillar', g.int(0, 3), (x, y) => open(g, x, y, 'grass'));
  connect(g, { trail: 'path_dirt', trails: true, bridge: plankBridge, pass: 'grass' });
};

// ---------------------------------------------------------------------------- Vulkanen

const vulkan: PaintFn = (g) => {
  g.ground = 'ash';
  g.fill('ash');
  cliffBelt(g, 'basalt', 21);
  g.each((x, y) => {
    if (g.edge(x, y) < 4 || inEdgeGap(x, y)) return;
    if (g.fbm(x, y, 9, 22) > 0.66) g.set(x, y, 'basalt');
  });
  if (g.chance(0.7)) stream(g, 'lava', 2, 23);
  if (g.chance(0.85)) {
    const s = spot(g, 6, 5, (t) => t === 'ash');
    if (s) {
      g.blob(s.x + 3, s.y + 2.5, 5.5, 4.5, (x, y) => g.set(x, y, 'ash'), 0.2, 24);
      g.put('volcano', s.x, s.y);
      g.reserve(s.x - 1, s.y + 5, 8, 2);
      // its glowing lava lake on one side
      g.blob(s.x + (g.chance(0.5) ? -3 : 9), s.y + 2, 2.2, 1.8, (x, y) => {
        if (!objectAt(g.world, x, y) && g.edge(x, y) > 3) g.set(x, y, 'lava');
      }, 0.3, 25);
    }
  }
  caveInCliff(g, 'basalt', 'lava');
  pools(g, 'lava', 7, 0.76, 26, 5);
  belt(g, () => g.pick(['dead_tree', 'obsidian_rock']), 0.15, (t) => t === 'ash');
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y) || g.at(x, y) !== 'ash') return;
    if (g.chance(0.02)) g.put('dead_tree', x, y);
    else if (g.chance(0.01)) g.put('rock_small', x, y);
  });
  g.scatter('obsidian_rock', g.int(6, 10), (x, y) => open(g, x, y, 'ash'));
  g.scatter('fire_crystal', g.int(3, 5), (x, y) => open(g, x, y, 'ash'));
  g.scatter('steam_vent', g.int(4, 6), (x, y) => open(g, x, y, 'ash'));
  connect(g, { trail: null, trails: true, bridge: plankBridge, pass: 'ash' });
};

// ---------------------------------------------------------------------------- Svampskogen

const svamp: PaintFn = (g) => {
  g.ground = 'moss';
  g.fill('moss');
  g.each((x, y) => {
    if (g.fbm(x, y, 8, 27) < 0.33) g.set(x, y, 'grass');
  });
  if (g.chance(0.5)) caveSomewhere(g, 'rock', 'svamp');
  const big = () => g.pick(['giant_mushroom', 'giant_mushroom', 'giant_glowshroom', 'tree', 'tree_pine']);
  belt(g, big, 0.8);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y)) return;
    const t = g.at(x, y);
    if (t !== 'moss' && t !== 'grass') return;
    const d = g.fbm(x, y, 7, 28);
    if (d > 0.5 && g.chance(0.45)) g.put(big(), x, y, { variant: g.int(0, 1) });
    else if (g.chance(0.04)) g.put('fern', x, y);
    else if (t === 'grass' && g.chance(0.05)) g.put('flower', x, y, flowerVariant(g));
  });
  g.scatter('glowshroom', g.int(8, 12), (x, y) => open(g, x, y, 'moss', 'grass'));
  g.scatter('mushroom', g.int(5, 8), (x, y) => open(g, x, y, 'moss', 'grass'));
  g.scatter('fairy_ring', g.int(1, 2), (x, y) => open(g, x, y, 'moss', 'grass') && open(g, x + 1, y + 1, 'moss', 'grass'));
  connect(g, { trail: 'path_dirt', trails: true, bridge: plankBridge, pass: 'moss' });
};

// ---------------------------------------------------------------------------- Dinodalen

const dino: PaintFn = (g) => {
  g.ground = 'redsand';
  g.fill('redsand');
  cliffBelt(g, 'sandstone', 29);
  g.each((x, y) => {
    if (g.edge(x, y) < 4 || inEdgeGap(x, y)) return;
    if (g.fbm(x, y, 10, 30) > 0.65) g.set(x, y, 'sandstone');
    else if (g.fbm(x, y, 8, 31) < 0.3) g.set(x, y, 'grass');
  });
  if (g.chance(0.6)) caveInCliff(g, 'sandstone', 'fossil');
  const bones = g.int(1, 2);
  for (let i = 0; i < bones; i++) {
    const s = spot(g, 3, 2, (t) => t === 'redsand');
    if (s) g.put('dino_bones', s.x, s.y);
  }
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y)) return;
    const t = g.at(x, y);
    if (t === 'grass' && g.chance(0.12)) g.put('fern', x, y);
    else if (t === 'grass' && g.chance(0.04)) g.put('palm', x, y);
    else if (t === 'redsand' && g.chance(0.015)) g.put(g.pick(['fern', 'bush', 'rock_small']), x, y);
  });
  g.scatter('fossil_rock', g.int(6, 10), (x, y) => open(g, x, y, 'redsand'));
  g.scatter('dig_spot', g.int(2, 3), (x, y) => open(g, x, y, 'redsand'));
  connect(g, { trail: null, trails: true, bridge: plankBridge, pass: 'redsand' });
};

// ---------------------------------------------------------------------------- Godislandet

const godis: PaintFn = (g) => {
  g.ground = 'candy';
  g.fill('candy');
  if (g.chance(0.8)) stream(g, 'choco', g.int(2, 3), 32);
  pools(g, 'choco', 8, 0.74, 33, 5);
  if (g.chance(0.85)) {
    const s = spot(g, 3, 3, (t) => t === 'candy');
    if (s) {
      g.put('gingerbread_house', s.x, s.y);
      g.reserve(s.x - 1, s.y + 3, 5, 2);
    }
  }
  const sweet = () => g.pick(['lollipop_tree', 'lollipop_tree', 'candy_cane']);
  belt(g, sweet, 0.75);
  g.each((x, y) => {
    if (g.edge(x, y) <= 3 || objectAt(g.world, x, y) || g.at(x, y) !== 'candy') return;
    if (g.fbm(x, y, 7, 34) > 0.55 && g.chance(0.3)) g.put('lollipop_tree', x, y, { variant: g.int(0, 2) });
    else if (g.chance(0.035)) g.put('candy_cane', x, y);
  });
  connect(g, { trail: null, trails: true, bridge: plankBridge, pass: 'candy' });
};

// ---------------------------------------------------------------------------- Rymdbasen

const rymdbas: PaintFn = (g) => {
  g.ground = 'sand';
  g.fill('sand');
  g.each((x, y) => {
    if (g.edge(x, y) < 4 || inEdgeGap(x, y)) return;
    if (Math.hypot(x - BASE_ROCKET.x, y - BASE_ROCKET.y) < 12) return;
    if (g.fbm(x, y, 12, 35) > 0.72) g.set(x, y, 'sandstone');
  });
  buildLaunchSite(g.world);
  g.reserve(BASE_ROCKET.x - 5, BASE_ROCKET.y - 3, 12, 15);
  belt(g, () => g.pick(['cactus', 'rock_small', 'palm']), 0.15);
  g.scatter('cactus', g.int(6, 10), (x, y) => open(g, x, y, 'sand'));
  g.scatter('dig_spot', g.int(1, 2), (x, y) => open(g, x, y, 'sand'));
  connect(g, { trail: 'path_stone', trails: true, bridge: plankBridge, pass: 'sand' });
};

export const PAINTERS: Record<string, PaintFn> = { skog, ang, is, berg, strand, oken, trask, djungel, vulkan, svamp, dino, godis, rymdbas };
