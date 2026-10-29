// World objects that are made of whole blocks: trees, rocks, walls, buildings… stamped into the voxel grid.
import type { Season, WorldObject } from '@lilla-garden/shared';
import { BLOCK } from './blocks.ts';

/** Places a block at tile (tx, tz), `h` layers above the ground surface (0 = standing on the ground). */
export type Put = (tx: number, h: number, tz: number, block: number) => void;

export const hash = (x: number, y: number, salt = 0): number => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Paint colours (PAINT_COLORS index 1..6) as blocks. */
export const PAINT_BLOCKS = ['', 'paint_1', 'paint_2', 'paint_3', 'paint_4', 'paint_5', 'paint_6'];

/** Height in blocks of player-built and room walls. */
export const WALL_H = 3;

export interface StampCtx {
  season: Season;
  biome?: string;
  /** Wall neighbours etc. */
  kindAt: (tx: number, ty: number) => string | undefined;
  /** The place's own rock (its cliffs and mountains), as a block. */
  rock: number;
  /** How much higher (blocks) the ground of a tile stands than the ground the object is on. */
  rise: (tx: number, tz: number) => number;
}

/** The rock of a place: what its cliffs, its mountains and the stone you dig there look like. */
export function rockOf(biome: string | undefined): string {
  switch (biome) {
    case 'vulkan':
      return 'basalt';
    case 'oken':
    case 'dino':
    case 'rymdbas':
      return 'sandstone';
    case 'mane':
      return 'moon_rock';
  }
  return 'stone';
}

/** The caves out in the world (in CAVE_THEMES order): their rock, and a second block mixed into it. */
export const CAVE_ROCK: [string, string][] = [
  ['rooted_dirt', 'stone'], // rot
  ['packed_ice', 'snow'], // is
  ['amethyst', 'stone_dark'], // kristall
  ['stone', 'mossy_cobble'], // sjorovare
  ['sand_bricks', 'chiseled_sand'], // pyramid
  ['mossy_bricks', 'stone_bricks'], // tempel
  ['basalt', 'magma'], // lava
  ['moss_stone', 'stone_dark'], // svamp
  ['sandstone', 'fossil_stone'], // fossil
  ['candy_fill', 'candy_stripes'], // godis
  ['moon_rock', 'moon_dust'], // rymd
];

export function oakTree(put: Put, x: number, z: number, leaves: number, seed: number, trunkBlock = BLOCK.log_oak!): void {
  const th = 4 + Math.floor(hash(x, z, seed) * 2); // trunk 4..5
  for (let h = 0; h < th; h++) put(x, h, z, trunkBlock);
  for (let h = th - 2; h <= th + 1; h++) {
    const r = h < th ? 2 : 1;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dz === 0 && h < th) continue;
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (h === th + 1 || hash(x + dx, z + dz, h + seed) < 0.5)) continue;
        put(x + dx, h, z + dz, leaves);
      }
  }
}

export function spruceTree(put: Put, x: number, z: number, leaves: number, seed: number): void {
  const th = 6 + Math.floor(hash(x, z, seed) * 2);
  for (let h = 0; h < th; h++) put(x, h, z, BLOCK.log_spruce!);
  const radii = [2, 1, 2, 1, 1, 0];
  for (let i = 0; i < radii.length; i++) {
    const h = th - radii.length + 1 + i;
    const r = radii[i]!;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue;
        if (dx === 0 && dz === 0 && h < th) continue;
        put(x + dx, h, z + dz, leaves);
      }
  }
  put(x, th, z, leaves);
}

/** A round canopy: discs of `radii` (from `from` up), corners trimmed, around a trunk of `trunk` blocks. */
function roundTree(put: Put, x: number, z: number, log: number, leaves: number, trunk: number, from: number, radii: number[], seed: number): void {
  for (let h = 0; h < trunk; h++) put(x, h, z, log);
  radii.forEach((r, i) => {
    const h = from + i;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dz === 0 && h < trunk) continue;
        const d = Math.hypot(dx, dz);
        if (d > r + 0.45) continue;
        if (d > r - 0.4 && hash(x + dx, z + dz, h + seed) < 0.35) continue; // ragged edge
        put(x + dx, h, z + dz, leaves);
      }
  });
}

/** v2 forests mix kinds: 'tree' variants are oak, birch, dark oak and cherry; 'tree_pine' spruce or redwood. */
function variedTree(put: Put, kind: string, variant: number, x: number, z: number, snowy: boolean, seed: number): void {
  const B = BLOCK;
  const tall = Math.floor(hash(x, z, seed) * 3);
  if (kind === 'tree_pine') {
    if (variant === 1) {
      // redwood: a tall red trunk with a narrow crown at the top
      const th = 10 + tall;
      for (let h = 0; h < th; h++) put(x, h, z, B.log_redwood!);
      for (let h = 5; h <= th; h++) {
        const r = h >= th - 1 ? 1 : (h - 5) % 3 === 0 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if ((dx || dz) && Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0)) put(x + dx, h, z + dz, snowy ? B.leaves_snowy! : B.leaves_spruce!);
      }
      put(x, th, z, snowy ? B.leaves_snowy! : B.leaves_spruce!);
      put(x, th + 1, z, snowy ? B.leaves_snowy! : B.leaves_spruce!);
      return;
    }
    spruceTree(put, x, z, snowy ? B.leaves_snowy! : B.leaves_spruce!, seed);
    return;
  }
  switch (variant % 4) {
    case 1: // birch: white and slender
      roundTree(put, x, z, B.log_birch!, B.leaves_birch!, 5 + tall, 3 + tall, [2, 2, 1, 1], seed);
      return;
    case 2: // dark oak: short and wide
      roundTree(put, x, z, B.log_dark!, B.leaves_dark!, 4, 3, [3, 3, 2], seed);
      return;
    case 3: // cherry: a pink cloud
      roundTree(put, x, z, B.log_cherry!, B.leaves_cherry!, 4 + (tall > 1 ? 1 : 0), 3, [2, 3, 3, 2], seed);
      return;
  }
  oakTree(put, x, z, B.leaves_oak!, seed);
}

/** A jungle giant: a tall trunk under a wide, flat crown with vines hanging off its edge. */
function jungleTree(put: Put, x: number, z: number, seed: number): void {
  const B = BLOCK;
  const th = 7 + Math.floor(hash(x, z, seed) * 3);
  for (let h = 0; h < th; h++) put(x, h, z, B.log_jungle!);
  for (let h = th - 1; h <= th + 1; h++) {
    const r = h === th + 1 ? 1 : h === th ? 2 : 3;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dz === 0 && h < th) continue;
        if (Math.hypot(dx, dz) > r + 0.4) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        put(x + dx, h, z + dz, B.leaves_jungle!);
      }
  }
  for (const [dx, dz] of [
    [3, 0],
    [-3, 0],
    [0, 3],
    [0, -3],
    [2, 2],
    [-2, -2],
  ] as const) {
    const n = Math.floor(hash(x + dx, z + dz, seed + 1) * 3);
    for (let k = 1; k <= n; k++) put(x + dx, th - 1 - k, z + dz, B.leaves_jungle!);
  }
}

/** A bare, grey tree (the swamp, the volcano). */
function deadTree(put: Put, x: number, z: number): void {
  const B = BLOCK;
  const th = 4 + Math.floor(hash(x, z, 9) * 2);
  for (let h = 0; h < th; h++) put(x, h, z, B.log_dead!);
  const [dx, dz] = hash(x, z, 10) < 0.5 ? [1, 0] : [0, 1];
  put(x + dx, th - 2, z + dz, B.log_dead!);
  put(x + dx * 2, th - 1, z + dz * 2, B.log_dead!);
  put(x - dz, th - 1, z - dx, B.log_dead!);
  if (hash(x, z, 11) < 0.5) put(x - dx, th - 3, z - dz, B.log_dead!);
}

/** A mushroom as tall as a tree: a red dome with white spots, a flat brown hat, or a glowing one. */
function giantMushroom(put: Put, x: number, z: number, cap: number, flat: boolean, seed: number): void {
  const th = 4 + Math.floor(hash(x, z, seed) * 2);
  for (let h = 0; h < th; h++) put(x, h, z, BLOCK.mushroom_stem!);
  const r = flat ? 3 : 2;
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
      put(x + dx, th, z + dz, cap);
      // a dome hangs down at its rim and rises in the middle
      if (!flat && (Math.abs(dx) === r || Math.abs(dz) === r)) put(x + dx, th - 1, z + dz, cap);
    }
  if (!flat) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(x + dx, th + 1, z + dz, cap);
}

/** The trees on the hills around a map, in the place's own kind. */
export function sceneryTree(put: Put, biome: string | undefined, x: number, z: number, season: Season): void {
  const B = BLOCK;
  switch (biome) {
    case 'svamp':
      giantMushroom(put, x, z, hash(x, z, 4) < 0.5 ? B.mushroom_red! : B.mushroom_brown!, hash(x, z, 6) < 0.5, 3);
      return;
    case 'djungel':
      jungleTree(put, x, z, 3);
      return;
    case 'dino':
      if (hash(x, z, 7) < 0.6) palmTree(put, x, z);
      else jungleTree(put, x, z, 4);
      return;
    case 'vulkan':
      deadTree(put, x, z);
      return;
    case 'trask':
      if (hash(x, z, 8) < 0.35) deadTree(put, x, z);
      else spruceTree(put, x, z, season === 'jul' ? B.leaves_snowy! : B.leaves_spruce!, 3);
      return;
    case 'godis':
      // candyfloss on a candy-cane trunk
      roundTree(put, x, z, B.candy_stripes!, B.leaves_cherry!, 4, 3, [2, 3, 2], 3);
      return;
  }
  const pine = biome === 'is' || biome === 'berg' || hash(x, z, 5) < 0.35;
  if (pine) spruceTree(put, x, z, season === 'jul' || biome === 'is' ? B.leaves_snowy! : B.leaves_spruce!, 3);
  else oakTree(put, x, z, B.leaves_oak!, 3);
}

function palmTree(put: Put, x: number, z: number): void {
  const th = 5;
  for (let h = 0; h < th; h++) put(x, h, z, BLOCK.log_palm!);
  put(x, th, z, BLOCK.leaves_palm!);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    put(x + dx, th, z + dz, BLOCK.leaves_palm!);
    put(x + dx * 2, th, z + dz * 2, BLOCK.leaves_palm!);
    put(x + dx * 3, th - 1, z + dz * 3, BLOCK.leaves_palm!);
  }
  for (const [dx, dz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const)
    put(x + dx, th - 1, z + dz, BLOCK.leaves_palm!);
}

interface BuildingStyle {
  wall: number;
  corner: number;
  roof: number;
  /** Roof shape: gable (sloped, ridge east-west) or flat. */
  shape: 'gable' | 'flat';
  height: number;
  window: number;
  /** Extra decoration after the shell is built. */
  extra?: (put: Put, x: number, z: number, w: number, d: number) => void;
  door?: boolean;
}

/** A building over a w×d footprint with the entrance in the middle of the south (front) side. */
function building(put: Put, x: number, z: number, w: number, d: number, s: BuildingStyle): void {
  const H = s.height;
  const doorX = x + Math.floor(w / 2);
  const front = z + d - 1;
  for (let tz = z; tz < z + d; tz++)
    for (let tx = x; tx < x + w; tx++) {
      const edgeX = tx === x || tx === x + w - 1;
      const edgeZ = tz === z || tz === front;
      for (let h = 0; h < H; h++) {
        let b = s.wall;
        if (edgeX && edgeZ) b = s.corner;
        else if (!edgeX && !edgeZ) {
          // inside: hollow is pointless (you can't go in), fill to keep faces few
          b = s.wall;
        }
        // windows on the second layer of each floor, never on corners
        const isWindowRow = h % 3 === 1;
        if (isWindowRow && !(edgeX && edgeZ) && (edgeX || edgeZ) && ((tz === front && tx !== doorX && (tx - x) % 2 === 1) || (edgeX && d > 2 && (tz - z) % 2 === 1))) b = s.window;
        if (s.door !== false && tz === front && tx === doorX && h < 2) continue; // the door opening
        put(tx, h, tz, b);
      }
    }
  if (s.shape === 'flat') {
    for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) put(tx, H, tz, s.roof);
    // parapet
    for (let tx = x; tx < x + w; tx++) {
      put(tx, H + 1, z, s.corner);
      put(tx, H + 1, front, s.corner);
    }
    for (let tz = z; tz < z + d; tz++) {
      put(x, H + 1, tz, s.corner);
      put(x + w - 1, H + 1, tz, s.corner);
    }
  } else {
    // stepped gable roof with a one block overhang, ridge running east-west
    const steps = Math.ceil((d + 2) / 2);
    for (let i = 0; i < steps; i++) {
      const z0 = z - 1 + i;
      const z1 = front + 1 - i;
      if (z0 > z1) break;
      for (let tx = x - 1; tx <= x + w; tx++) {
        put(tx, H + i, z0, s.roof);
        put(tx, H + i, z1, s.roof);
      }
      // gable ends
      for (let tz = z0 + 1; tz < z1; tz++) {
        put(x, H + i, tz, s.wall);
        put(x + w - 1, H + i, tz, s.wall);
        for (let tx = x + 1; tx < x + w - 1; tx++) put(tx, H + i, tz, s.wall);
      }
    }
  }
  s.extra?.(put, x, z, w, d);
}

/** Kinds drawn as blocks (everything else is a model or sprite). Doors are both. */
export const VOXEL_KINDS = new Set([
  'tree',
  'tree_apple',
  'tree_pine',
  'palm',
  'stump',
  'bush',
  'rock',
  'ore',
  'cactus',
  'wild_pumpkin',
  'pumpkin_lantern',
  'beehive',
  'snowman',
  'snowman_wild',
  'workbench',
  'start_bench',
  'stove',
  'bookshelf',
  'cave_wall',
  'cave_rock',
  'wall_wood',
  'wall_stone',
  'window',
  'xmas_tree',
  'house',
  'house_small',
  'apartment',
  'shop',
  'pizzeria',
  'bathhouse',
  'train_station',
  'barn',
  'stall',
  'coop',
  'sheepfold',
  'pigsty',
  'cave',
  // the wider world
  'blueberry_bush',
  'dead_tree',
  'jungle_tree',
  'ruin_pillar',
  'obsidian_rock',
  'giant_mushroom',
  'giant_glowshroom',
  'fossil_rock',
  'moon_rock',
  'gold_vein',
  'gem_vein',
  'cave_mouth',
  'temple',
  'pyramid',
  'gingerbread_house',
  'volcano',
  'shipwreck',
  'rocket',
]);

/** Block-built things that also get a small model on top (the rocket's pointed nose). */
export const MODEL_TOO = new Set(['rocket']);
/** Where such a model takes its light from (offset in blocks from its tile): outside its own blocks. */
export const MODEL_LIGHT_AT: Record<string, [number, number, number]> = { rocket: [1, 10.5, 2] };

/** Stamps the blocks of an object. Returns false when the object is not made of blocks. */
export function stampObject(put: Put, o: WorldObject, ctx: StampCtx): boolean {
  const { x, y: z } = o;
  const B = BLOCK;
  const snowy = ctx.season === 'jul' || ctx.biome === 'is';
  const paint = (fallback: number) => (o.variant ? (BLOCK[PAINT_BLOCKS[o.variant % PAINT_BLOCKS.length]!] ?? fallback) : fallback);
  switch (o.kind) {
    case 'tree':
      variedTree(put, 'tree', o.variant ?? 0, x, z, snowy, o.id);
      return true;
    case 'tree_apple':
      oakTree(put, x, z, B.leaves_apple!, o.id);
      return true;
    case 'tree_pine':
      variedTree(put, 'tree_pine', o.variant ?? 0, x, z, snowy, o.id);
      return true;
    case 'palm':
      palmTree(put, x, z);
      return true;
    case 'stump':
      put(x, 0, z, B.log_oak!);
      return true;
    case 'bush':
      put(x, 0, z, B.leaves_oak!);
      return true;
    case 'rock':
      put(x, 0, z, hash(x, z) < 0.3 ? B.mossy_cobble! : B.cobble!);
      return true;
    case 'ore':
      put(x, 0, z, (o.variant ?? 0) % 3 === 1 ? B.ore_gold! : (o.variant ?? 0) % 3 === 2 ? B.ore_crystal! : B.ore_coal!);
      return true;
    case 'cactus': {
      const hgt = 2 + Math.floor(hash(x, z) * 2);
      for (let h = 0; h < hgt; h++) put(x, h, z, B.cactus!);
      return true;
    }
    case 'wild_pumpkin':
      put(x, 0, z, B.pumpkin!);
      return true;
    case 'pumpkin_lantern':
      put(x, 0, z, B.jack_o_lantern!);
      return true;
    case 'beehive':
      put(x, 0, z, B.beehive!);
      return true;
    case 'snowman':
    case 'snowman_wild':
      put(x, 0, z, B.snow!);
      put(x, 1, z, B.snow!);
      put(x, 2, z, B.pumpkin!);
      return true;
    case 'workbench':
    case 'start_bench':
      put(x, 0, z, B.crafting!);
      return true;
    case 'stove':
      put(x, 0, z, B.furnace!);
      return true;
    case 'bookshelf':
      put(x, 0, z, B.bookshelf!);
      put(x, 1, z, B.bookshelf!);
      return true;
    case 'cave_wall': {
      const v = o.variant ?? 0;
      if (v >= 2) {
        // a cave out in the world: the rock of its theme (2 + 2·theme, +1 with a torch)
        const [rock, vein] = CAVE_ROCK[Math.floor((v - 2) / 2)] ?? ['stone_dark', 'cobble'];
        for (let h = 0; h < 4; h++) put(x, h, z, hash(x, z, h) < 0.15 ? BLOCK[vein]! : BLOCK[rock]!);
        return true;
      }
      for (let h = 0; h < 4; h++) put(x, h, z, o.variant === 1 && h === 1 ? B.ore_crystal! : hash(x, z, h) < 0.2 ? B.cobble! : B.stone_dark!);
      return true;
    }
    // ---- the wider world: plants and finds
    case 'blueberry_bush':
      put(x, 0, z, B.leaves_blueberry!);
      return true;
    case 'dead_tree':
      deadTree(put, x, z);
      return true;
    case 'jungle_tree':
      jungleTree(put, x, z, o.id);
      return true;
    case 'giant_mushroom':
      giantMushroom(put, x, z, o.variant === 1 ? B.mushroom_brown! : B.mushroom_red!, o.variant === 1, o.id);
      return true;
    case 'giant_glowshroom':
      giantMushroom(put, x, z, B.glow_cap!, false, o.id);
      return true;
    case 'ruin_pillar': {
      const hgt = 2 + Math.floor(hash(x, z, 12) * 2);
      for (let h = 0; h < hgt; h++) put(x, h, z, h === 0 ? B.stone_bricks! : hash(x, z, h + 13) < 0.5 ? B.mossy_bricks! : B.stone_bricks!);
      return true;
    }
    case 'obsidian_rock':
      put(x, 0, z, B.obsidian!);
      return true;
    case 'fossil_rock':
      put(x, 0, z, B.fossil_stone!);
      return true;
    case 'moon_rock':
      put(x, 0, z, B.moon_rock!);
      return true;
    case 'gold_vein':
      put(x, 0, z, B.ore_gold!);
      return true;
    case 'gem_vein':
      put(x, 0, z, B.ore_crystal!);
      return true;
    // ---- landmarks
    case 'cave_mouth': {
      // dug into the foot of a cliff: a dark way in, two wide and two high, under the cliff's own rock
      let top = 3;
      for (const [tx, tz] of [
        [x - 1, z],
        [x + 2, z],
        [x - 1, z + 1],
        [x + 2, z + 1],
        [x, z - 1],
        [x + 1, z - 1],
      ] as const)
        top = Math.max(top, Math.round(ctx.rise(tx, tz)));
      top = Math.min(top, 8);
      const frame = BLOCK[(CAVE_ROCK[o.variant ?? 0] ?? ['stone'])[0]]!;
      for (let dx = 0; dx < 2; dx++) {
        put(x + dx, 0, z, B.dark_opening!);
        put(x + dx, 1, z, B.dark_opening!);
        // the lintel shows what is inside (ice, crystal, candy…); above it the cliff carries on
        put(x + dx, 2, z + 1, frame);
        for (let h = 2; h < top; h++) put(x + dx, h, z, ctx.rock);
        for (let h = 3; h < top; h++) put(x + dx, h, z + 1, ctx.rock);
      }
      return true;
    }
    case 'temple': {
      // a jungle temple: mossy steps with a dark doorway in the middle of the front, a gold idol on top
      const brick = (tx: number, h: number, tz: number) => (hash(tx, tz, h + 40) < 0.4 ? B.mossy_bricks! : B.stone_bricks!);
      for (let dz = 0; dz < 3; dz++)
        for (let dx = 0; dx < 4; dx++) {
          const door = dz === 2 && (dx === 1 || dx === 2);
          for (let h = 0; h < 3; h++) if (!(door && h < 2)) put(x + dx, h, z + dz, brick(x + dx, h, z + dz));
          if (dz < 2) put(x + dx, 3, z + dz, brick(x + dx, 3, z + dz));
        }
      for (let dx = 1; dx <= 2; dx++) {
        put(x + dx, 0, z + 1, B.dark_opening!);
        put(x + dx, 1, z + 1, B.dark_opening!);
        put(x + dx, 2, z + 2, B.chiseled_stone!);
        put(x + dx, 4, z, B.mossy_bricks!);
        put(x + dx, 4, z + 1, B.stone_bricks!);
      }
      put(x + 1, 5, z, B.gold_block!);
      put(x + 2, 5, z, B.gold_block!);
      // vines hanging off the upper step at the front corners
      for (const dx of [0, 3]) {
        put(x + dx, 3, z + 2, B.leaves_jungle!);
        if (hash(x + dx, z, 50) < 0.6) put(x + dx, 4, z + 1, B.leaves_jungle!);
      }
      return true;
    }
    case 'pyramid': {
      // stepped sandstone, the way in at the bottom of the front, a golden cap
      const layers: [number, number, number, number][] = [
        [0, 5, 0, 3],
        [0, 5, 0, 3],
        [1, 4, 0, 3],
        [1, 4, 1, 2],
        [2, 3, 1, 2],
      ];
      layers.forEach(([x0, x1, z0, z1], h) => {
        for (let dz = z0; dz <= z1; dz++)
          for (let dx = x0; dx <= x1; dx++) {
            if (dz === 3 && (dx === 2 || dx === 3) && h < 2) continue; // the doorway
            const edge = dx === x0 || dx === x1 || dz === z0 || dz === z1;
            put(x + dx, h, z + dz, dz === 3 && (dx === 2 || dx === 3) ? B.chiseled_sand! : edge ? B.sand_smooth! : B.sand_bricks!);
          }
      });
      for (let dx = 2; dx <= 3; dx++) {
        put(x + dx, 0, z + 2, B.dark_opening!);
        put(x + dx, 1, z + 2, B.dark_opening!);
        put(x + dx, 5, z + 1, B.gold_block!);
        put(x + dx, 5, z + 2, B.gold_block!);
      }
      return true;
    }
    case 'gingerbread_house':
      building(put, x, z, 3, 3, {
        wall: B.gingerbread!,
        corner: B.gingerbread!,
        roof: B.roof_candy!,
        shape: 'gable',
        height: 3,
        window: B.lit_window!,
        extra: (p) => {
          // icing along the top of the walls, a chocolate door, gumdrops along the ridge, a candy chimney
          for (let tz = z; tz < z + 3; tz++) for (let tx = x; tx < x + 3; tx++) if (tx === x || tx === x + 2 || tz === z || tz === z + 2) p(tx, 2, tz, B.icing!);
          p(x + 1, 0, z + 1, B.door_choco!);
          p(x + 1, 1, z + 1, B.door_choco!);
          const drops = [B.red_wool!, B.green_wool!, B.yellow_wool!, B.pink_wool!];
          for (let tx = x - 1; tx <= x + 3; tx++) if ((tx - x) % 2 === 0) p(tx, 6, z + 1, drops[(tx - x + 4) % drops.length]!);
          p(x + 2, 6, z, B.candy_stripes!);
          p(x + 2, 7, z, B.icing!);
        },
      });
      return true;
    case 'volcano': {
      // a cone of basalt with glowing cracks, and a crater of lava on top
      for (let h = 0; h < 6; h++) {
        const r = 3.3 - h * 0.42;
        for (let dz = 0; dz < 5; dz++)
          for (let dx = 0; dx < 6; dx++) {
            const d = Math.hypot(dx + 0.5 - 3, (dz + 0.5 - 2.5) / 0.85);
            if (h < 4 ? d > r : d > 1.65) continue;
            if (h >= 4 && d < 0.6) {
              if (h === 4) put(x + dx, h, z + dz, B.lava!);
              continue;
            }
            // a stream of lava rock running down the front
            const stream = dx === 3 && dz >= 3 - Math.floor(h / 2);
            put(x + dx, h, z + dz, stream || hash(x + dx, z + dz, h + 60) < 0.12 ? B.magma! : B.basalt!);
          }
      }
      return true;
    }
    case 'shipwreck': {
      // a wrecked hull in the sand: dark planks, a broken mast, a torn sail
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 4; dx++) put(x + dx, 0, z + dz, B.planks_dark!);
      for (let dx = 0; dx < 4; dx++) if (hash(x + dx, z, 70) < 0.75) put(x + dx, 1, z, B.planks_dark!);
      put(x + 3, 1, z + 1, B.planks_dark!);
      put(x + 3, 2, z, B.planks_dark!);
      put(x + 3, 2, z + 1, B.log_dark!);
      for (let h = 1; h < 5; h++) put(x + 1, h, z + 1, B.log_dark!);
      put(x + 2, 3, z + 1, B.white_wool!);
      put(x + 2, 2, z + 1, B.white_wool!);
      return true;
    }
    case 'rocket': {
      // two blocks wide on the front of its pad, red bands and portholes, fins behind (the nose is a model)
      for (let dz = 1; dz <= 2; dz++)
        for (let dx = 0; dx < 2; dx++)
          for (let h = 0; h < 10; h++) {
            let b = h === 0 || h === 3 || h === 8 || h === 9 ? B.rocket_red! : B.rocket_white!;
            if (h === 5 && dz === 2) b = B.rocket_window!;
            put(x + dx, h, z + dz, b);
          }
      for (let dx = 0; dx < 2; dx++) for (let h = 0; h < 3; h++) put(x + dx, h, z, h === 2 ? B.rocket_white! : B.rocket_red!);
      return true;
    }
    case 'cave_rock':
      put(x, 0, z, B.mossy_cobble!);
      return true;
    case 'wall_wood':
      for (let h = 0; h < WALL_H; h++) put(x, h, z, paint(B.planks_oak!));
      return true;
    case 'wall_stone':
      for (let h = 0; h < WALL_H; h++) put(x, h, z, paint(B.stone_bricks!));
      return true;
    case 'window':
      put(x, 0, z, paint(B.planks_oak!));
      put(x, 1, z, B.glass!);
      put(x, 2, z, paint(B.planks_oak!));
      return true;
    case 'door':
    case 'door_out':
      // the door itself is a model; the block above it closes the wall
      put(x, 2, z, o.kind === 'door' ? paint(B.planks_oak!) : B.planks_oak!);
      return true;
    case 'xmas_tree': {
      const tz = z + 1;
      spruceTree(put, x, tz, B.leaves_spruce!, 7);
      // baubles
      const cols = [B.red_wool!, B.yellow_wool!, B.blue_wool!];
      let i = 0;
      for (const [dx, h, dz] of [
        [2, 3, 0],
        [-2, 3, 0],
        [0, 3, 2],
        [1, 5, 1],
        [-1, 4, -1],
        [0, 6, -1],
      ] as const)
        put(x + dx, h, tz + dz, cols[i++ % cols.length]!);
      put(x, 8, tz, B.glowstone!);
      return true;
    }
    case 'house': {
      const wall = paint(B.planks_oak!);
      building(put, x, z, 5, 4, {
        wall,
        corner: B.log_oak!,
        roof: B.roof_red!,
        shape: 'gable',
        height: 3,
        window: B.glass!,
        extra: (p) => {
          for (let h = 3; h < 7; h++) p(x + 3, h, z + 1, B.bricks!); // chimney
        },
      });
      return true;
    }
    case 'house_small':
      building(put, x, z, 3, 3, { wall: paint(B.planks_spruce!), corner: B.log_spruce!, roof: B.roof_blue!, shape: 'gable', height: 3, window: B.glass! });
      return true;
    case 'apartment':
      building(put, x, z, 3, 3, { wall: B.bricks!, corner: B.stone_bricks!, roof: B.smooth_stone!, shape: 'flat', height: 9, window: B.glass! });
      return true;
    case 'shop':
      building(put, x, z, 3, 2, {
        wall: B.quartz!,
        corner: B.smooth_stone!,
        roof: B.smooth_stone!,
        shape: 'flat',
        height: 3,
        window: B.shop_window!,
        extra: (p) => {
          for (let tx = x - 0; tx < x + 3; tx++) p(tx, 2, z + 2, tx % 2 ? B.red_wool! : B.white_wool!); // awning
        },
      });
      return true;
    case 'pizzeria':
      building(put, x, z, 3, 2, {
        wall: B.bricks!,
        corner: B.terracotta!,
        roof: B.roof_red!,
        shape: 'gable',
        height: 3,
        window: B.lit_window!,
        extra: (p) => {
          for (let tx = x; tx < x + 3; tx++) p(tx, 2, z + 2, tx % 2 ? B.green_wool! : B.white_wool!);
          p(x + 1, 2, z + 2, B.red_wool!);
        },
      });
      return true;
    case 'bathhouse':
      building(put, x, z, 3, 2, { wall: B.quartz!, corner: B.smooth_stone!, roof: B.roof_blue!, shape: 'gable', height: 3, window: B.glass! });
      return true;
    case 'train_station':
      building(put, x, z, 3, 2, { wall: B.stone_bricks!, corner: B.bricks!, roof: B.roof_blue!, shape: 'gable', height: 3, window: B.lit_window! });
      return true;
    case 'barn':
    case 'stall':
      building(put, x, z, 3, 2, {
        wall: o.kind === 'barn' ? B.red_wool! : B.planks_spruce!,
        corner: o.kind === 'barn' ? B.white_wool! : B.log_spruce!,
        roof: o.kind === 'barn' ? B.planks_dark! : B.hay!,
        shape: 'gable',
        height: 3,
        window: o.kind === 'barn' ? B.white_wool! : B.planks_spruce!,
      });
      return true;
    case 'coop':
      building(put, x, z, 2, 2, { wall: B.planks_birch!, corner: B.log_birch!, roof: B.hay!, shape: 'gable', height: 2, window: B.planks_birch!, door: false });
      return true;
    case 'sheepfold':
      building(put, x, z, 2, 2, { wall: B.planks_spruce!, corner: B.log_spruce!, roof: B.roof_red!, shape: 'gable', height: 2, window: B.planks_spruce!, door: false });
      return true;
    case 'pigsty':
      building(put, x, z, 2, 2, { wall: B.planks_dark!, corner: B.log_oak!, roof: B.planks_oak!, shape: 'gable', height: 2, window: B.planks_dark!, door: false });
      return true;
    case 'cave': {
      // a mossy hill with a dark mouth facing south
      for (let dz = -1; dz <= 2; dz++)
        for (let dx = -1; dx <= 2; dx++)
          for (let h = 0; h < 4; h++) {
            const inner = dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1;
            const reach = inner ? 3 : 1 + Math.floor(hash(x + dx, z + dz, h) * 2);
            if (h > reach) continue;
            if (h > 0 && dz === 2) continue;
            put(x + dx, h, z + dz, h === reach ? B.mossy_cobble! : B.stone!);
          }
      put(x, 0, z + 1, B.dark_opening!);
      put(x + 1, 0, z + 1, B.dark_opening!);
      put(x, 1, z + 1, B.dark_opening!);
      put(x + 1, 1, z + 1, B.dark_opening!);
      return true;
    }
  }
  return false;
}

/** Light emitted by objects that are models (torches, lamps…): level at (dx, h, dz) from the origin tile. */
export function objectLight(o: WorldObject): { dx: number; h: number; dz: number; level: number } | null {
  switch (o.kind) {
    case 'torch':
    case 'cave_torch':
      return { dx: 0, h: 0, dz: 0, level: 14 };
    case 'lantern':
    case 'lamp':
      return { dx: 0, h: 1, dz: 0, level: 15 };
    case 'street_lamp':
      return { dx: 0, h: 2, dz: 0, level: 15 };
    case 'treasure':
      return { dx: 0, h: 0, dz: 0, level: 10 };
    case 'lights':
      return { dx: 0, h: 1, dz: 0, level: 12 };
    case 'house':
      return { dx: 2, h: 0, dz: 4, level: 12 }; // the porch light
    case 'shop':
    case 'pizzeria':
    case 'train_station':
      return { dx: 1, h: 1, dz: 2, level: 13 };
    case 'cave_wall':
      return o.variant === 1 ? { dx: 0, h: 1, dz: 0, level: 0 } : null; // crystals glow by themselves
    // the wider world (lava, magma, glowing caps and lit windows shine as blocks)
    case 'crystal':
    case 'star_crystal':
    case 'wisp':
      return { dx: 0, h: 0, dz: 0, level: 11 };
    case 'fire_crystal':
      return { dx: 0, h: 0, dz: 0, level: 13 };
    case 'glowshroom':
    case 'wisp_jar':
      return { dx: 0, h: 0, dz: 0, level: 10 };
    case 'crystal_lamp':
    case 'mushroom_lamp':
      return { dx: 0, h: 0, dz: 0, level: 14 };
    case 'gingerbread_house':
      return { dx: 1, h: 1, dz: 3, level: 12 }; // by the door
    case 'rocket':
      return { dx: 0, h: 1, dz: 3, level: 12 }; // floodlight on the pad in front of it
    case 'ufo':
      return { dx: 1, h: 1, dz: 1, level: 13 };
  }
  return null;
}
