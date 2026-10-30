// Objects that are smaller than a block (fences, torches, chests, furniture…) as Minecraft-style box models,
// crops as "#"-shaped sprite planes, and everything else as crossed sprites of the 2D art.
import { CROPS, objectDef, WALL_KINDS, type CropState, type WorldObject } from '@lilla-garden/shared';
import { getArt } from '@v1/art/textures.ts';
import { tileUV } from './blocks.ts';
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

/** A block tile lying flat on the ground over a rectangle (pixel units): an X in the sand, a crater floor. */
function flatTile(g: GeoBuilder, tile: string, x0: number, z0: number, x1: number, z1: number, y = 0.2): void {
  const [U0, V0, U1, V1] = tileUV(tile);
  const S = 1 / 16;
  const L = g.boxLight;
  const c: RGB = [1, 1, 1];
  g.quad(
    [
      [x0 * S, y * S, z1 * S],
      [x1 * S, y * S, z1 * S],
      [x1 * S, y * S, z0 * S],
      [x0 * S, y * S, z0 * S],
    ],
    [
      [U0, V0],
      [U1, V0],
      [U1, V1],
      [U0, V1],
    ],
    [c, c, c, c],
    [L, L, L, L],
  );
}

const shade = (c: RGB, f: number): RGB => [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];

/** A cluster of crystal shards (each a wide foot and a narrow tip). */
function shards(g: GeoBuilder, c: RGB, scale = 1): void {
  const s = (x0: number, z0: number, w: number, h: number, f: number) => {
    const y = h * scale;
    g.box(x0, 0, z0, x0 + w, y, z0 + w, 'white', shade(c, f));
    g.box(x0 + w / 4, y, z0 + w / 4, x0 + (3 * w) / 4, y + w * 0.7 * scale, z0 + (3 * w) / 4, 'white', shade(c, f * 1.2));
  };
  s(6, 6, 4, 10, 1);
  s(2.5, 8, 3, 6, 0.85);
  s(10.5, 3.5, 3, 7, 0.9);
  s(9, 10.5, 2.5, 4, 0.8);
}

/** A mushroom with a stem and a cap (pixel units, centred on cx, cz). */
function mushroomModel(g: GeoBuilder, cx: number, cz: number, h: number, r: number, cap: string): void {
  g.box(cx - r / 3, 0, cz - r / 3, cx + r / 3, h, cz + r / 3, 'mushroom_stem');
  g.box(cx - r, h, cz - r, cx + r, h + r * 0.6, cz + r, cap);
  g.box(cx - r * 0.6, h + r * 0.6, cz - r * 0.6, cx + r * 0.6, h + r, cz + r * 0.6, cap);
}

const BONE: RGB = rgb('#efe6cf');
/** A bone lying along x or z (pixel units), knobbly at both ends. */
function bone(g: GeoBuilder, x0: number, z0: number, len: number, alongX: boolean, y = 0): void {
  if (alongX) {
    g.box(x0, y, z0, x0 + len, y + 1.5, z0 + 1.5, 'white', BONE);
    for (const x of [x0 - 1, x0 + len - 1]) g.box(x, y, z0 - 1, x + 2, y + 2, z0 + 2.5, 'white', BONE);
  } else {
    g.box(x0, y, z0, x0 + 1.5, y + 1.5, z0 + len, 'white', BONE);
    for (const z of [z0 - 1, z0 + len - 1]) g.box(x0 - 1, y, z, x0 + 2.5, y + 2, z + 2, 'white', BONE);
  }
}

/** A dinosaur skeleton lying (or standing, as a souvenir) over 3×2 tiles. */
function skeleton(g: GeoBuilder, standing: boolean): void {
  const y = standing ? 12 : 1;
  if (standing) for (const [x, z] of [[14, 12], [14, 20], [30, 12], [30, 20]] as const) g.box(x, 0, z, x + 2, y, z + 2, 'white', BONE);
  g.box(6, y + 4, 15, 42, y + 7, 17, 'white', BONE); // spine
  for (let i = 0; i < 6; i++) {
    const x = 14 + i * 4;
    const h = 9 - Math.abs(i - 2.5) * 1.2;
    g.box(x, y, 10, x + 1.5, y + h, 11.5, 'white', BONE).box(x, y, 20.5, x + 1.5, y + h, 22, 'white', BONE);
    g.box(x, y + h - 1.5, 11.5, x + 1.5, y + h, 20.5, 'white', BONE);
  }
  g.box(40, y + 2, 12, 48, y + 10, 20, 'white', BONE); // skull
  g.box(41, y + 3, 12.5, 43, y + 5, 19.5, 'white', rgb('#3a3226')); // eye holes
  g.box(44, y, 13, 48, y + 2, 19, 'white', BONE); // jaw
  g.box(0, y + 3, 15.25, 6, y + 5, 16.75, 'white', BONE); // tail
}

const CHEST_LOOK = ['planks_oak', 'gold_block', 'planks_dark', 'packed_ice', 'metal', 'candy'];
const CRYSTAL_COLOURS = ['#b06af0', '#7ad0f0', '#6af08a', '#f08ac8'].map(rgb);
/** Stalagmites take the colour of their cave (the variant is the cave's theme). */
const STALAGMITE_LOOK: Record<number, string> = { 1: 'packed_ice', 2: 'amethyst', 4: 'sand_smooth', 6: 'basalt', 7: 'moss_stone', 8: 'sandstone', 9: 'candy_fill', 10: 'moon_rock' };

/** The wider world's small things. Returns false when the kind is not one of them. */
function widerWorldModel(o: WorldObject, g: GeoBuilder): boolean {
  const v = o.variant ?? 0;
  switch (o.kind) {
    case 'earth':
      return true; // it hangs in the moon's sky instead (sky.ts)
    case 'rocket': {
      // the pointed nose over the block-built body (two blocks wide, ten high)
      const y = 160;
      g.box(2, y, 18, 30, y + 8, 46, 'rocket_red').box(6, y + 8, 22, 26, y + 16, 42, 'rocket_red').box(10, y + 16, 26, 22, y + 24, 38, 'rocket_red');
      g.box(14, y + 24, 30, 18, y + 32, 34, 'rocket_white');
      return true;
    }
    case 'crystal':
      shards(g, CRYSTAL_COLOURS[v % CRYSTAL_COLOURS.length]!);
      return true;
    case 'fire_crystal':
      shards(g, rgb('#ff8a2a'), 1.1);
      return true;
    case 'star_crystal':
      shards(g, rgb('#fff0a0'), 0.9);
      return true;
    case 'crystal_lamp':
      g.box(4, 0, 4, 12, 3, 12, 'stone_bricks');
      g.off = [g.off[0], g.off[1] + 3 / 16, g.off[2]];
      shards(g, CRYSTAL_COLOURS[0]!, 0.8);
      g.off = [g.off[0], g.off[1] - 3 / 16, g.off[2]];
      return true;
    case 'moon_cheese':
      g.box(3, 0, 4, 13, 7, 12, 'white', rgb('#f2d24e'));
      g.box(3, 7, 4, 8, 9, 12, 'white', rgb('#f6dc68'));
      for (const [x, y] of [[5, 2], [9, 4], [11, 1.5]] as const) g.box(x, y, 11.9, x + 2, y + 2, 12.1, 'white', rgb('#c8a434'));
      return true;
    case 'stalagmite': {
      const tex = STALAGMITE_LOOK[v] ?? 'stone';
      g.box(3, 0, 3, 13, 5, 13, tex).box(4, 5, 4, 12, 10, 12, tex).box(5, 10, 5, 11, 15, 11, tex).box(6, 15, 6, 10, 19, 10, tex).box(7, 19, 7, 9, 23, 9, tex);
      return true;
    }
    case 'loot_chest': {
      const tex = CHEST_LOOK[v % CHEST_LOOK.length]!;
      chest(g, tex);
      // gold bands: it is treasure
      g.box(3, 0, 0.9, 4, 14, 15.1, 'gold_block').box(12, 0, 0.9, 13, 14, 15.1, 'gold_block');
      return true;
    }
    case 'barrel':
      g.box(3, 0, 3, 13, 14, 13, { all: 'planks_spruce', top: 'log_oak_top', bottom: 'log_oak_top' });
      for (const y of [2, 11]) g.box(2.8, y, 2.8, 13.2, y + 1, 13.2, 'white', rgb('#3a3a40'));
      return true;
    case 'bones':
      bone(g, 3, 7, 10, true);
      bone(g, 8, 3, 9, false, 1.5);
      return true;
    case 'dino_bones':
      skeleton(g, false);
      return true;
    case 'dino_skeleton':
      skeleton(g, true);
      return true;
    case 'glowshroom':
      mushroomModel(g, 7, 7, 5, 3.5, 'glow_cap');
      mushroomModel(g, 12, 11, 3, 2, 'glow_cap');
      return true;
    case 'mushroom_lamp':
      g.box(4, 0, 4, 12, 2, 12, 'planks_oak');
      mushroomModel(g, 8, 8, 10, 5, 'glow_cap');
      return true;
    case 'cloudberry':
      g.box(3, 0, 5, 8, 1, 10, 'leaves_oak').box(8, 0, 4, 13, 1, 9, 'leaves_oak').box(5, 0, 9, 10, 1, 13, 'leaves_oak');
      g.box(7.5, 0, 7.5, 8.5, 4, 8.5, 'white', rgb('#4a7a2a'));
      g.box(6.5, 4, 6.5, 9.5, 7, 9.5, 'white', rgb('#f0a030')).box(7, 6.5, 7, 8, 7.5, 8, 'white', rgb('#ffd070'));
      return true;
    case 'banana_plant': {
      const leaf = 'leaves_jungle';
      g.box(7, 0, 7, 9, 18, 9, 'white', rgb('#5a8a2a'));
      g.box(-3, 15, 6, 7, 16, 10, leaf).box(9, 14, 6, 19, 15, 10, leaf).box(6, 16, -3, 10, 17, 7, leaf).box(6, 13, 9, 10, 14, 19, leaf);
      g.box(9, 8, 6, 12, 13, 9, 'white', rgb('#f0d040')).box(4, 9, 8, 7, 13, 11, 'white', rgb('#e8c838'));
      return true;
    }
    case 'fern':
      g.cross('fern', 16, 14, 8, 8, 0);
      return true;
    case 'reed':
      g.cross('reeds', 16, 16, 8, 8, 0).cross('reeds', 12, 13, 4, 12, 0);
      return true;
    case 'jungle_flower':
      g.cross('jungle_flower', 14, 14, 8, 8, 0);
      return true;
    case 'candy_cane':
      g.box(7, 0, 7, 10, 21, 10, 'candy_stripes');
      g.box(7, 18, 10, 10, 21, 15, 'candy_stripes').box(7, 13, 12, 10, 18, 15, 'candy_stripes');
      return true;
    case 'lollipop_tree': {
      const swirl = `lollipop_${v % 3}`;
      g.box(7, 0, 7.5, 9, 18, 8.5, 'white', rgb('#f4f2ec'));
      g.box(1, 16, 7, 15, 30, 9, { all: swirl, top: 'candy_side', bottom: 'candy_side', east: 'candy_side', west: 'candy_side' });
      return true;
    }
    case 'dig_spot':
      g.box(3, 0, 3, 13, 1, 13, 'sand');
      flatTile(g, 'dig_x', 2, 2, 14, 14, 1.1);
      return true;
    case 'crater':
      for (const [x0, z0, x1, z1] of [[2, 2, 30, 5], [2, 27, 30, 30], [2, 5, 5, 27], [27, 5, 30, 27]] as const) g.box(x0, 0, z0, x1, 2, z1, 'moon_dust');
      flatTile(g, 'crater', 5, 5, 27, 27, 0.1);
      return true;
    case 'fairy_ring':
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const cx = 16 + Math.cos(a) * 11;
        const cz = 16 + Math.sin(a) * 11;
        g.box(cx - 0.8, 0, cz - 0.8, cx + 0.8, 3, cz + 0.8, 'mushroom_stem');
        g.box(cx - 2.2, 3, cz - 2.2, cx + 2.2, 5, cz + 2.2, k % 3 ? 'mushroom_red' : 'glow_cap');
      }
      return true;
    case 'steam_vent':
      for (const [x0, z0, x1, z1] of [[3, 3, 13, 5], [3, 11, 13, 13], [3, 5, 5, 11], [11, 5, 13, 11]] as const) g.box(x0, 0, z0, x1, 2, z1, 'basalt');
      flatTile(g, 'dark_opening', 5, 5, 11, 11, 0.3);
      return true;
    case 'wisp':
      g.box(6, 8, 6, 10, 12, 10, 'glow_cap').box(7, 12, 7, 9, 13, 9, 'glow_cap');
      return true;
    case 'wisp_jar':
      g.box(4, 0, 4, 12, 12, 12, 'glass');
      g.box(6, 3, 6, 10, 8, 10, 'glow_cap');
      g.box(5, 12, 5, 11, 14, 11, 'planks_oak');
      return true;
    case 'dragon_egg':
      g.box(5, 0, 5, 11, 2, 11, 'dragon_egg').box(4, 2, 4, 12, 9, 12, 'dragon_egg').box(5, 9, 5, 11, 12, 11, 'dragon_egg').box(6, 12, 6, 10, 13, 10, 'dragon_egg');
      return true;
    case 'flag_se': {
      const yellow = rgb('#f5d020');
      g.box(7.5, 0, 7.5, 8.5, 30, 8.5, 'white', rgb('#e8e8e8'));
      g.box(8.5, 20, 7.75, 22.5, 29, 8.25, 'white', rgb('#2a6ad0'));
      g.box(8.5, 23.5, 7.7, 22.5, 25.5, 8.3, 'white', yellow).box(12.5, 20, 7.7, 14.5, 29, 8.3, 'white', yellow);
      return true;
    }
    case 'satellite_dish':
      g.box(10, 0, 10, 22, 4, 22, 'metal').box(14, 4, 14, 18, 14, 18, 'metal');
      g.box(4, 14, 4, 28, 16, 28, 'quartz');
      for (const [x0, z0, x1, z1] of [[4, 4, 28, 6], [4, 26, 28, 28], [4, 6, 6, 26], [26, 6, 28, 26]] as const) g.box(x0, 16, z0, x1, 18, z1, 'quartz');
      g.box(15.5, 16, 15.5, 16.5, 26, 16.5, 'metal').box(14, 26, 14, 18, 29, 18, 'metal');
      return true;
    case 'ufo':
      g.box(10, 0, 8, 38, 3, 24, 'metal');
      g.box(2, 3, 4, 46, 7, 28, 'metal');
      g.box(8, 7, 7, 40, 9, 25, 'metal');
      g.box(16, 9, 10, 32, 17, 22, 'ice');
      for (const [x, z] of [[1, 14], [45, 14], [22, 3], [22, 27], [9, 6], [37, 6], [9, 24], [37, 24]] as const) g.box(x, 4, z, x + 2, 6, z + 2, 'ufo_light');
      return true;
  }
  return false;
}

/**
 * Adds the model of `o` to `g` (block textures) and/or `sg` (2D sprites). Both builders must already be
 * offset to the object's tile and lit. Returns false for objects drawn as blocks or dynamically.
 */
export function buildModel(o: WorldObject, ctx: ModelCtx, g: GeoBuilder, sg: GeoBuilder): void {
  const def = objectDef(o.kind);
  const art = getArt().objects[o.kind];
  const frame = art ? (o.variant ?? 0) % art.frames.length : 0;
  if (widerWorldModel(o, g)) return;
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
    case 'mailbox':
      g.box(7, 0, 7, 9, 12, 9, 'log_oak');
      g.box(4, 12, 2, 12, 20, 14, 'blue_wool');
      g.box(12, 16, 9, 13, 24, 10, 'red_wool').box(12, 21, 10, 13, 24, 13, 'red_wool');
      return;
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
