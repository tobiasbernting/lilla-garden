// Objects that are smaller than a block (fences, torches, chests, furniture…) as Minecraft-style box models,
// crops as "#"-shaped sprite planes, and everything else as crossed sprites of the 2D art.
import { CROPS, objectDef, WALL_KINDS, type CropState, type WorldObject } from '@lilla-garden/shared';
import { getArt } from '@v1/art/textures.ts';
import { GeoBuilder, rgb, type RGB } from './builder.ts';
import { sprite } from './sprites.ts';
import { vehicleModel } from './mobs.ts';

export interface ModelCtx {
  /** Kind of the object on a tile, if any. */
  kindAt: (tx: number, ty: number) => string | undefined;
  season: string;
}

/** Objects that get their own animated mesh (doors swing, paintings have their own texture). */
export const DYNAMIC = new Set(['door', 'door_out', 'painting']);

const DARK: RGB = rgb('#2b2b30');

/** Neighbour mask (1 north, 2 east, 4 south, 8 west) over tiles whose kind passes `linked`. */
export function linkMask(ctx: ModelCtx, x: number, y: number, linked: (k: string) => boolean): number {
  const is = (tx: number, ty: number) => {
    const k = ctx.kindAt(tx, ty);
    return k !== undefined && linked(k);
  };
  return (is(x, y - 1) ? 1 : 0) | (is(x + 1, y) ? 2 : 0) | (is(x, y + 1) ? 4 : 0) | (is(x - 1, y) ? 8 : 0);
}

const fenceLinked = (k: string) => k === 'fence' || k === 'gate' || WALL_KINDS.has(k) || k === 'house' || k.endsWith('fold') || k === 'coop' || k === 'barn';

function fence(g: GeoBuilder, mask: number, tex = 'planks_oak'): void {
  g.box(6, 0, 6, 10, 16, 10, tex);
  for (const [y0, y1] of [
    [6, 9],
    [12, 15],
  ] as const) {
    if (mask & 1) g.box(7, y0, 0, 9, y1, 6, tex);
    if (mask & 4) g.box(7, y0, 10, 9, y1, 16, tex);
    if (mask & 2) g.box(10, y0, 7, 16, y1, 9, tex);
    if (mask & 8) g.box(0, y0, 7, 6, y1, 9, tex);
  }
}

function gate(g: GeoBuilder, alongZ: boolean): void {
  if (alongZ) {
    g.box(7, 5, 0, 9, 16, 2, 'planks_oak').box(7, 5, 14, 9, 16, 16, 'planks_oak');
    g.box(7, 6, 2, 9, 9, 14, 'planks_oak').box(7, 12, 2, 9, 15, 14, 'planks_oak').box(7, 9, 6, 9, 12, 7, 'planks_oak').box(7, 9, 9, 9, 12, 10, 'planks_oak');
  } else {
    g.box(0, 5, 7, 2, 16, 9, 'planks_oak').box(14, 5, 7, 16, 16, 9, 'planks_oak');
    g.box(2, 6, 7, 14, 9, 9, 'planks_oak').box(2, 12, 7, 14, 15, 9, 'planks_oak').box(6, 9, 7, 7, 12, 9, 'planks_oak').box(9, 9, 7, 10, 12, 9, 'planks_oak');
  }
}

function chest(g: GeoBuilder, tex: string): void {
  g.box(1, 0, 1, 15, 10, 15, tex);
  g.box(1, 10, 1, 15, 14, 15, tex);
  g.box(1, 9, 1, 15, 10, 15, 'white', rgb('#4a3520'));
  g.box(7, 7, 15, 9, 11, 16, 'white', rgb('#c8c8c8'));
}

/** A sprite standing in the world: crossed planes for small things, a single plane for wide ones. */
function spriteStandee(sg: GeoBuilder, key: string, wTiles: number, hTiles: number, ox: number): boolean {
  const s = sprite(key);
  if (!s) return false;
  const cx = (wTiles * 16) / 2;
  const cz = (hTiles * 16) / 2;
  if (wTiles === 1 && s.w <= 24) {
    sg.cross(s, s.w, s.h, cx, cz, 0);
  } else {
    // a wide sprite stands upright across the middle of its footprint
    sg.panel(s, ox, 0, ox + s.w, s.h, cz);
  }
  return true;
}

/** Lying flat on the ground (rugs drawn top-down, shells, exits). */
function decal(sg: GeoBuilder, key: string, w: number, h: number, y = 0.2): boolean {
  const s = sprite(key);
  if (!s) return false;
  const L = sg.boxLight;
  const c: RGB = [1, 1, 1];
  const S = 1 / 16;
  sg.quad(
    [
      [0, y * S, h * S],
      [w * S, y * S, h * S],
      [w * S, y * S, 0],
      [0, y * S, 0],
    ],
    [
      [s.u0, s.v0],
      [s.u1, s.v0],
      [s.u1, s.v1],
      [s.u0, s.v1],
    ],
    [c, c, c, c],
    [L, L, L, L],
  );
  return true;
}

/**
 * Adds the model of `o` to `g` (block textures) and/or `sg` (2D sprites). Both builders must already be
 * offset to the object's tile and lit. Returns false for objects drawn as blocks or dynamically.
 */
export function buildModel(o: WorldObject, ctx: ModelCtx, g: GeoBuilder, sg: GeoBuilder): void {
  const def = objectDef(o.kind);
  const art = getArt().objects[o.kind];
  const frame = art ? (o.variant ?? 0) % art.frames.length : 0;
  switch (o.kind) {
    case 'fence':
      fence(g, linkMask(ctx, o.x, o.y, fenceLinked));
      return;
    case 'gate': {
      const m = linkMask(ctx, o.x, o.y, fenceLinked);
      gate(g, !!(m & 5) && !(m & 10));
      return;
    }
    case 'torch':
    case 'cave_torch':
      g.box(7, 0, 7, 9, 10, 9, 'planks_oak', rgb('#8a6a3a'));
      g.box(7, 10, 7, 9, 12, 9, 'glowstone');
      return;
    case 'lantern':
      g.box(7, 0, 7, 9, 18, 9, 'log_spruce');
      g.box(5, 18, 5, 11, 25, 11, 'glowstone');
      g.box(4, 25, 4, 12, 27, 12, 'white', DARK);
      return;
    case 'street_lamp':
      g.box(7, 0, 7, 9, 40, 9, 'white', DARK);
      g.box(7, 38, 7, 9, 40, 14, 'white', DARK);
      g.box(5, 34, 11, 11, 38, 15, 'glowstone');
      return;
    case 'lamp':
      g.box(5, 0, 5, 11, 2, 11, 'white', DARK);
      g.box(7, 2, 7, 9, 18, 9, 'white', DARK);
      g.box(3, 18, 3, 13, 26, 13, 'yellow_wool');
      return;
    case 'chest':
    case 'start_chest':
      chest(g, 'planks_oak');
      return;
    case 'treasure':
      chest(g, 'gold_block');
      return;
    case 'trough':
      g.box(1, 0, 3, 15, 8, 13, 'planks_spruce');
      g.box(2, 7, 4, 14, 8.2, 12, 'hay_top');
      return;
    case 'sellbox':
      g.box(1, 0, 1, 15, 12, 15, 'planks_birch');
      g.box(0, 12, 0, 16, 14, 16, 'planks_spruce');
      g.box(6, 5, 15, 10, 9, 16, 'gold_block');
      return;
    case 'mailbox': {
      // Farm shop stall ("Gårdsbutik"): corner posts, counter with crates, striped awning, price sign. 2 blocks tall at most.
      for (const [x, z] of [
        [0, 1],
        [14, 1],
        [0, 13],
        [14, 13],
      ] as const)
        g.box(x, 0, z, x + 2, 26, z + 2, 'log_oak');
      g.box(0, 0, 8, 16, 12, 15, 'planks_oak'); // counter
      g.box(-1, 12, 7, 17, 14, 16, 'planks_spruce'); // counter top
      g.box(1, 14, 9, 7, 18, 14, 'planks_birch'); // crate
      g.box(2, 18, 10, 6, 19, 13, 'leaves_oak'); // greens in the crate
      g.box(9, 14, 10, 13, 17, 14, 'red_wool'); // tomatoes
      g.box(10, 17, 11, 12, 18, 13, 'yellow_wool');
      g.box(4, 3, 15.2, 12, 9, 16, 'white', rgb('#4a3520')); // price sign
      g.box(7, 4.5, 16, 9, 7.5, 16.3, 'gold_block');
      for (let i = 0; i < 8; i++) g.box(-2 + i * 2.5, 26, -1, -2 + (i + 1) * 2.5, 28, 17, i % 2 ? 'white_wool' : 'red_wool'); // awning
      return;
    }
    case 'wardrobe':
      g.box(1, 0, 3, 15, 30, 14, 'planks_dark');
      g.box(7.5, 2, 14, 8.5, 28, 14.5, 'white', rgb('#2a1a10'));
      g.box(6, 14, 14, 7, 18, 15, 'gold_block').box(9, 14, 14, 10, 18, 15, 'gold_block');
      return;
    case 'bed':
      g.box(0, 0, 0, 16, 3, 32, 'planks_oak');
      g.box(0, 3, 0, 16, 9, 32, 'bed_red');
      g.box(2, 9, 1, 14, 11, 8, 'white_wool');
      g.box(0, 3, 0, 16, 12, 2, 'planks_oak');
      return;
    case 'table':
      g.box(0, 13, 0, 16, 16, 16, 'planks_oak');
      for (const [x, z] of [
        [1, 1],
        [13, 1],
        [1, 13],
        [13, 13],
      ] as const)
        g.box(x, 0, z, x + 2, 13, z + 2, 'planks_oak');
      return;
    case 'chair':
      g.box(3, 7, 3, 13, 9, 13, 'planks_oak');
      g.box(3, 9, 3, 13, 20, 5, 'planks_oak');
      for (const [x, z] of [
        [3, 3],
        [11, 3],
        [3, 11],
        [11, 11],
      ] as const)
        g.box(x, 0, z, x + 2, 7, z + 2, 'planks_oak');
      return;
    case 'bench':
      g.box(0, 6, 4, 16, 8, 12, 'planks_spruce');
      g.box(1, 0, 5, 3, 6, 11, 'planks_spruce').box(13, 0, 5, 15, 6, 11, 'planks_spruce');
      g.box(0, 8, 4, 16, 14, 5, 'planks_spruce');
      return;
    case 'sofa':
      g.box(0, 0, 2, 32, 8, 15, 'red_wool');
      g.box(0, 8, 2, 32, 18, 6, 'red_wool');
      g.box(0, 8, 2, 3, 13, 15, 'red_wool').box(29, 8, 2, 32, 13, 15, 'red_wool');
      return;
    case 'plant':
      g.box(4, 0, 4, 12, 6, 12, 'terracotta');
      g.box(5, 5, 5, 11, 6, 11, 'dirt');
      g.cross('leaves_oak', 12, 14, 8, 8, 6);
      return;
    case 'flowerbox': {
      g.box(0, 0, 3, 16, 6, 13, 'planks_spruce');
      g.box(1, 5, 4, 15, 6, 12, 'dirt');
      const f = sprite('obj:flower:0');
      if (f) for (const x of [4, 12]) sg.cross(f, 10, 10, x, 8, 6);
      return;
    }
    case 'rug':
      g.box(0, 0, 0, 32, 1, 32, 'rug');
      return;
    case 'clock':
      g.box(3, 18, 0, 13, 28, 2, 'planks_dark');
      g.box(4, 19, 2, 12, 27, 2.3, 'quartz');
      g.box(7.5, 23, 2.3, 8.5, 26, 2.5, 'white', DARK).box(7.5, 22.5, 2.3, 10, 23.5, 2.5, 'white', DARK);
      return;
    case 'well':
    case 'town_well':
      g.box(0, 0, 0, 16, 8, 2, 'cobble').box(0, 0, 14, 16, 8, 16, 'cobble').box(0, 0, 2, 2, 8, 14, 'cobble').box(14, 0, 2, 16, 8, 14, 'cobble');
      g.box(2, 0, 2, 14, 6, 14, 'water');
      g.box(1, 8, 7, 3, 24, 9, 'log_oak').box(13, 8, 7, 15, 24, 9, 'log_oak');
      g.box(3, 20, 7.5, 13, 21, 8.5, 'planks_oak');
      g.box(-1, 24, 0, 17, 26, 16, 'roof_red').box(2, 26, 2, 14, 28, 14, 'roof_red');
      return;
    case 'scarecrow':
      g.box(7, 0, 7, 9, 22, 9, 'log_oak');
      g.box(0, 17, 7, 16, 19, 9, 'planks_oak');
      g.box(4, 10, 6, 12, 20, 10, 'blue_wool');
      g.box(4, 20, 4, 12, 28, 12, 'pumpkin_side', [1, 1, 1]);
      g.box(3, 28, 3, 13, 29, 13, 'hay_top').box(5, 29, 5, 11, 32, 11, 'hay_side');
      return;
    case 'signpost':
      g.box(7, 0, 7, 9, 16, 9, 'log_oak');
      g.box(1, 12, 7, 15, 22, 9, 'sign');
      return;
    case 'traffic_light':
      g.box(7, 0, 7, 9, 30, 9, 'white', DARK);
      g.box(5, 30, 6, 11, 46, 10, 'white', DARK);
      g.box(6, 41, 10, 10, 45, 11, 'red_wool').box(6, 36, 10, 10, 40, 11, 'yellow_wool').box(6, 31, 10, 10, 35, 11, 'green_wool');
      return;
    case 'bus_stop':
      g.box(7, 0, 7, 9, 34, 9, 'white', rgb('#8a8a8a'));
      g.box(3, 26, 8, 13, 36, 10, 'blue_wool');
      g.box(5, 28, 10, 11, 34, 10.3, 'white_wool');
      return;
    case 'hutch':
      g.box(1, 0, 1, 15, 12, 15, 'planks_birch');
      g.box(4, 2, 15, 12, 9, 15.3, 'white', DARK);
      g.box(0, 12, 0, 16, 14, 16, 'roof_red');
      return;
    case 'market':
    case 'sellstall': {
      const stripe = o.kind === 'market' ? 'red_wool' : 'blue_wool';
      g.box(0, 0, 12, 32, 14, 28, 'planks_oak');
      g.box(-1, 14, 11, 33, 16, 29, 'planks_spruce');
      for (const [x, z] of [
        [0, 0],
        [30, 0],
        [0, 30],
        [30, 30],
      ] as const)
        g.box(x, 0, z, x + 2, 36, z + 2, 'log_oak');
      for (let i = 0; i < 8; i++) g.box(-2 + i * 4.5, 36, -2, -2 + (i + 1) * 4.5, 38, 34, i % 2 ? 'white_wool' : stripe);
      return;
    }
    case 'parked_car':
      vehicleModel(g, 'car', o.variant ?? 0, true);
      return;
    case 'maypole':
      g.box(7, 0, 23, 9, 64, 25, 'log_birch');
      g.box(0, 46, 16, 16, 50, 32, 'leaves_oak');
      g.box(4, 52, 20, 12, 56, 28, 'leaves_oak');
      for (const [c, dx] of [
        ['red_wool', -6],
        ['yellow_wool', 6],
        ['blue_wool', 0],
      ] as const)
        g.box(8 + dx, 20, 23.5, 9 + dx, 46, 24.5, c);
      return;
    case 'ghost_flag':
      g.box(7, 0, 7, 9, 30, 9, 'log_spruce');
      g.box(9, 18, 7.5, 20, 29, 8.5, 'white_wool');
      return;
    case 'rock_small':
      g.box(3, 0, 4, 13, 6, 12, 'cobble').box(5, 6, 6, 10, 8, 10, 'cobble');
      return;
    case 'grass_tuft':
      g.cross('tall_grass', 14, 12, 8, 8, 0);
      return;
  }
  if (def.flat) {
    if (o.kind === 'shell' || o.kind === 'flower_wreath_decor' || o.kind === 'bath_exit' || o.kind === 'cave_exit') {
      decal(sg, `obj:${o.kind}:${frame}`, 16 * def.w, 16 * def.h);
      return;
    }
  }
  if (art) spriteStandee(sg, `obj:${o.kind}:${frame}`, def.w, def.h, art.ox);
}

/** A growing crop: four planes in a "#" like Minecraft wheat, using the 2D crop art. */
export function buildCrop(c: CropState, sg: GeoBuilder): void {
  const n = CROPS[c.crop]?.stages.length ?? 0;
  const s = sprite(`crop:${c.crop}:${Math.min(c.stage, n)}`);
  if (!s) return;
  const y = -1;
  for (const p of [4, 12]) {
    sg.panel(s, 0, y, 16, y + 16, p); // planes along x
    // planes along z: rotate the panel by swapping axes
    const L = sg.boxLight;
    const S = 1 / 16;
    const col: RGB = [0.85, 0.85, 0.85];
    const pts: [number, number, number][] = [
      [p * S, y * S, 16 * S],
      [p * S, y * S, 0],
      [p * S, (y + 16) * S, 0],
      [p * S, (y + 16) * S, 16 * S],
    ];
    const uv: [number, number][] = [
      [s.u0, s.v0],
      [s.u1, s.v0],
      [s.u1, s.v1],
      [s.u0, s.v1],
    ];
    sg.quad(pts, uv, [col, col, col, col], [L, L, L, L]);
    sg.quad([pts[1]!, pts[0]!, pts[3]!, pts[2]!], [uv[1]!, uv[0]!, uv[3]!, uv[2]!], [col, col, col, col], [L, L, L, L]);
  }
}
