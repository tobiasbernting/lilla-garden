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
}

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
export const VOXEL_KINDS = new Set(['tree', 'tree_apple', 'tree_pine', 'palm', 'stump', 'bush', 'rock', 'ore', 'cactus', 'wild_pumpkin', 'pumpkin_lantern', 'beehive', 'snowman', 'snowman_wild', 'workbench', 'start_bench', 'stove', 'bookshelf', 'cave_wall', 'cave_rock', 'wall_wood', 'wall_stone', 'window', 'xmas_tree', 'house', 'house_small', 'apartment', 'shop', 'pizzeria', 'bathhouse', 'train_station', 'barn', 'stall', 'coop', 'sheepfold', 'pigsty', 'cave']);

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
    case 'cave_wall':
      for (let h = 0; h < 4; h++) put(x, h, z, o.variant === 1 && h === 1 ? B.ore_crystal! : hash(x, z, h) < 0.2 ? B.cobble! : B.stone_dark!);
      return true;
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
  }
  return null;
}
