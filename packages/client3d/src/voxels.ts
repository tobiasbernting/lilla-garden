// The block world: a voxel grid built from the 2D map (terrain + block objects), Minecraft-style
// sky/block light, and chunk meshes with face culling and smooth ambient occlusion.
import * as THREE from 'three';
import { BASE, BATH_ROOM, CAVE_THEMES, EDGE_GAP, INTERIOR, MAP_H, MAP_W, VB, VH, VOXEL_BLOCKS, blockAt, blockTerrain, cellBlock, columnTop, isCliff, type Season, type Terrain, type WorldState } from '@lilla-garden/shared';
import { AIR, BLOCK, BLOCKS, TEX, atlas, blockTile, tileUV, type BlockDef } from './blocks.ts';
import { FACE_SHADE, FACES, GeoBuilder, type FaceDef, type V3 } from './builder.ts';
import { makeMaterial } from './material.ts';
import { CAVE_ROCK, hash, objectLight, rockOf, sceneryTree, stampObject, WALL_H, type StampCtx } from './structures.ts';

/** Tiles of scenery drawn around the 64×64 map. */
export const MARGIN = 20;
export const GW = MAP_W + MARGIN * 2;
export const GD = MAP_H + MARGIN * 2;
export const GH = VH;
/** Layer index of the first block above flat ground; flat ground is at world y = 0. */
export const GROUND = BASE;
const CHUNK = 16;
const CX = Math.ceil(GW / CHUNK);
const CZ = Math.ceil(GD / CHUNK);

export type AreaKind = 'outdoor' | 'dungeon' | 'bath';

const N = GW * GH * GD;
const idx = (x: number, y: number, z: number) => (y * GD + z) * GW + x;

const AO_CURVE = [0.45, 0.65, 0.82, 1];

/** Block properties as flat lookup tables (the light passes touch every cell). */
let PROPS: { opaque: Uint8Array; emits: Uint8Array; leafy: Uint8Array; liquid: Uint8Array } | null = null;
function props(): NonNullable<typeof PROPS> {
  if (PROPS) return PROPS;
  const n = 256;
  PROPS = { opaque: new Uint8Array(n), emits: new Uint8Array(n), leafy: new Uint8Array(n), liquid: new Uint8Array(n) };
  BLOCKS.forEach((b, i) => {
    PROPS!.opaque[i] = b.opaque ? 1 : 0;
    PROPS!.emits[i] = b.light ?? 0;
    PROPS!.leafy[i] = b.cutout && !b.cullSelf ? 1 : 0;
    PROPS!.liquid[i] = b.liquid ? 1 : 0;
  });
  return PROPS;
}

const SURFACE: Record<Terrain, string> = {
  grass: 'grass',
  soil: 'farmland',
  soil_wet: 'farmland_wet',
  water: 'water',
  sand: 'sand',
  path_stone: 'cobble',
  path_dirt: 'path',
  floor_wood: 'planks_oak',
  floor_stone: 'stone_bricks',
  snow: 'snow',
  gravel: 'gravel',
  ice: 'ice',
  pool: 'water',
  road: 'asphalt',
  sidewalk: 'sidewalk',
  crossing: 'crossing',
  rail: 'rail',
  dirt: 'dirt',
  stone: 'stone', // (the place's own rock, see rockOf)
  // the wider world
  rock: 'stone',
  sandstone: 'sandstone',
  basalt: 'basalt',
  lava: 'lava',
  ash: 'ash',
  mud: 'mud',
  bog: 'bog',
  moss: 'moss',
  redsand: 'redsand',
  candy: 'candy',
  choco: 'choco',
  moon: 'moon_dust',
  space: 'stone', // (never drawn: the sky around the moon is empty)
  // minigames: Spelhallen's floor (stand-in until the 3D client has a carpet block)
  carpet: 'planks_oak',
};

/** Liquid ground: drawn a little lowered, in the liquid pass, over a bed of `bed`. */
const LIQUID_BED: Partial<Record<Terrain, string>> = { water: 'sand', bog: 'mud', choco: 'candy_fill', lava: 'basalt' };

/** The few blocks under a ground take its look (red sand under red sand, ash under ash…). */
const UNDER_LOOK: Partial<Record<Terrain, string>> = { redsand: 'redsand', candy: 'candy_fill', ash: 'ash', mud: 'mud', moon: 'moon_rock' };

/** What the hills around a map are covered with. */
const SCENERY_GROUND: Record<string, string> = { is: 'snow', strand: 'sand', oken: 'sand', rymdbas: 'sand', vulkan: 'ash', svamp: 'moss', dino: 'redsand', godis: 'candy' };
/** Places too hot for snow on their hills, and Godislandet, whose hills stay sugar all the way up. */
const NO_SNOW = new Set(['rymdbas', 'vulkan', 'dino', 'djungel']);
const SUGAR = new Set(['godis']);

/** The shared block layer's blocks (3D game) as the client's blocks. */
const VOXEL_TO_CLIENT: Record<string, string> = {
  dirt: 'dirt',
  stone: 'stone',
  bedrock: 'bedrock',
  coal_ore: 'ore_coal',
  gold_ore: 'ore_gold',
  crystal_ore: 'ore_crystal',
  sand: 'sand',
  gravel: 'gravel',
  cobble: 'cobble',
  planks: 'planks_oak',
  snow: 'snow',
};

export class Voxels {
  blocks = new Uint8Array(N);
  /** Object id owning each block (-1 none): turns a looked-at block into the object to act on. */
  owner = new Int32Array(N);
  sky = new Uint8Array(N);
  blk = new Uint8Array(N);
  private queue = new Int32Array(N * 2);
  private base = new Uint8Array(N);
  private baseKey = '';
  private prevBlocks = new Uint8Array(N);
  private prevSky = new Uint8Array(N);
  private prevBlk = new Uint8Array(N);
  private first = true;
  /** Ground height (layer above the top terrain block) of every column, for placing things on it. */
  private colTop = new Int16Array(GW * GD).fill(GROUND);
  private world: WorldState | null = null;
  private season: Season = 'none';
  kind: AreaKind = 'outdoor';
  /** Chunks re-meshed by the last rebuild (their light may have changed). */
  lastDirty = new Set<number>();

  readonly group = new THREE.Group();
  private opaque = new Map<number, THREE.Mesh>();
  /** Liquid meshes of each chunk (one per kind of liquid in it). */
  private liquids = new Map<number, THREE.Mesh[]>();
  readonly solidMat: THREE.ShaderMaterial;
  /** Each liquid (water, swamp, chocolate, lava) has its own repeating texture, so it can flow. */
  private liquidMats = new Map<number, { mat: THREE.ShaderMaterial; flow: number }>();
  /** Distance of every map tile from the sky around the moon (0 off the moon): how deep the moon is there. */
  private planet: Uint8Array | null = null;

  constructor() {
    const { texture, canvas: src } = atlas();
    this.solidMat = makeMaterial(texture);
    BLOCKS.forEach((def, b) => {
      if (!def.liquid) return;
      const c = document.createElement('canvas');
      c.width = TEX;
      c.height = TEX;
      const [u0, , , v1] = tileUV(def.top);
      c.getContext('2d')!.drawImage(src, Math.round(u0 * src.width), Math.round((1 - v1) * src.height), TEX, TEX, 0, 0, TEX, TEX);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      const alpha = def.alpha ?? 0.72;
      const mat = makeMaterial(tex, { transparent: alpha < 1, alpha, cutout: false, side: THREE.DoubleSide, glow: def.glow });
      this.liquidMats.set(b, { mat, flow: def.flow ?? 0.2 });
    });
  }

  /** Moves the liquids' surfaces along (called every frame). */
  flowLiquids(dt: number): void {
    for (const { mat, flow } of this.liquidMats.values()) {
      const o = mat.uniforms.uUvOffset!.value as THREE.Vector2;
      o.y = (o.y - dt * flow) % 1;
    }
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || x >= GW || z >= GD || y < 0) return this.kind === 'outdoor' ? BLOCK.stone! : BLOCK.stone_dark!;
    if (y >= GH) return AIR;
    return this.blocks[idx(x, y, z)]!;
  }

  /** Block at a world position (tile x, world y, tile z). */
  blockAtWorld(wx: number, wy: number, wz: number): number {
    return this.get(Math.floor(wx) + MARGIN, Math.floor(wy) + GROUND, Math.floor(wz) + MARGIN);
  }

  ownerAtWorld(wx: number, wy: number, wz: number): number {
    const x = Math.floor(wx) + MARGIN;
    const y = Math.floor(wy) + GROUND;
    const z = Math.floor(wz) + MARGIN;
    if (x < 0 || z < 0 || y < 0 || x >= GW || z >= GD || y >= GH) return -1;
    return this.owner[idx(x, y, z)]!;
  }

  /** Sky and block light (0..1) at a world position. */
  lightAtWorld(wx: number, wy: number, wz: number): [number, number] {
    const x = Math.floor(wx) + MARGIN;
    const y = Math.floor(wy) + GROUND;
    const z = Math.floor(wz) + MARGIN;
    if (x < 0 || z < 0 || y < 0 || x >= GW || z >= GD) return [this.kind === 'outdoor' ? 1 : 0, 0];
    if (y >= GH) return [this.kind === 'outdoor' ? 1 : 0, 0];
    const i = idx(x, y, z);
    return [this.sky[i]! / 15, this.blk[i]! / 15];
  }

  /** Height (world y) of the walkable surface at a tile: ground, or the top of water. */
  surfaceAt(tx: number, tz: number): number {
    const x = tx + MARGIN;
    const z = tz + MARGIN;
    if (x < 0 || z < 0 || x >= GW || z >= GD) return 0;
    const top = this.world?.voxel && tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H ? columnTop(this.world, tx, tz) : this.colTop[z * GW + x]!;
    const d = BLOCKS[this.get(x, top - 1, z)];
    const y = top - GROUND;
    if (d?.liquid) return y - 0.35;
    return d?.topInset ? y - d.topInset / TEX : y;
  }

  // ------------------------------------------------------------------------ building the grid

  /**
   * Rebuilds the grid from the world and re-meshes the chunks that changed. The terrain and scenery
   * layer is cached; pass `terrain` when the ground itself changed.
   */
  rebuild(world: WorldState, kind: AreaKind, season: Season, terrain = true): void {
    const baseKey = `${kind}|${season}|${world.area ?? ''}|${world.biome ?? ''}`;
    let ownerId = -1;
    const put = (tx: number, h: number, tz: number, b: number) => {
      const x = tx + MARGIN;
      const z = tz + MARGIN;
      const y = GROUND + h;
      if (x < 0 || z < 0 || x >= GW || z >= GD || y < 0 || y >= GH) return;
      const i = idx(x, y, z);
      // trees don't overwrite buildings or walls
      if (this.blocks[i] !== AIR && BLOCKS[b]?.cutout && !BLOCKS[b]?.cullSelf) return;
      this.blocks[i] = b;
      this.owner[i] = ownerId;
    };
    this.kind = kind;
    this.world = world;
    this.season = season;
    if (terrain || this.baseKey !== baseKey) {
      this.planet = world.terrain.includes('space') ? this.planetDepths(world) : null;
      this.blocks.fill(AIR);
      this.stampTerrain(world, kind, season);
      this.stampRoofs(world, kind, put);
      if (kind === 'outdoor') this.stampScenery(world, season, put);
      this.base.set(this.blocks);
      this.baseKey = baseKey;
    } else this.blocks.set(this.base);
    this.owner.fill(-1);
    const emitters: { x: number; y: number; z: number; level: number }[] = [];
    const kindAt = (tx: number, ty: number): string | undefined => {
      const id = world.occupancy[`${tx},${ty}`];
      return id === undefined ? undefined : world.objects[id]?.kind;
    };
    let lift = 0;
    const ctx: StampCtx = {
      season,
      biome: world.biome,
      kindAt,
      rock: BLOCK[rockOf(world.biome)]!,
      // how much higher (blocks) the ground of a tile is than the ground the object stands on
      rise: (tx, tz) => this.groundAt(tx, tz) - lift,
    };
    const putLifted = (tx: number, h: number, tz: number, b: number) => put(tx, h + lift, tz, b);
    for (const o of Object.values(world.objects)) {
      ownerId = o.id;
      // things stand on their tile's ground (hills in the 3D game)
      lift = world.voxel ? columnTop(world, o.x, o.y) - BASE : 0;
      stampObject(putLifted, o, ctx);
      const l = objectLight(o);
      if (l && l.level > 0) emitters.push({ x: o.x + l.dx + MARGIN, y: GROUND + l.h + lift, z: o.y + l.dz + MARGIN, level: l.level });
    }
    this.computeLight(emitters);
    this.remesh();
  }

  /**
   * Re-stamps single map columns into the cached terrain (a block dug or placed, a tile hoed) and
   * rebuilds from there, instead of redoing the whole map.
   */
  patchColumns(world: WorldState, kind: AreaKind, season: Season, tiles: Iterable<[number, number]>): void {
    const keep = this.blocks;
    this.blocks = this.base;
    for (const [tx, tz] of tiles) if (tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H) this.stampMapColumn(world, kind, season, tx, tz);
    this.blocks = keep;
    this.rebuild(world, kind, season, false);
  }

  /** The block a tile's ground is drawn with. */
  private ground(world: WorldState, kind: AreaKind, season: Season, t: Terrain): number {
    let name = SURFACE[t] ?? 'grass';
    if (t === 'stone' || t === 'rock') name = rockOf(world.biome);
    if (kind === 'dungeon' && world.area === 'dungeon' && t === 'floor_stone') name = 'stone';
    if (season === 'jul' && kind === 'outdoor' && t === 'grass') name = 'snowy_grass';
    return BLOCK[name]!;
  }

  /** A block of the shared block layer as the client's block (stone is the place's own rock). */
  private voxelBlock(world: WorldState, raw: number, t: Terrain): number {
    const name = VOXEL_BLOCKS[raw]!;
    if (name === 'stone') return BLOCK[rockOf(world.biome)]!;
    if ((name === 'dirt' || name === 'sand' || name === 'gravel') && UNDER_LOOK[t]) return BLOCK[UNDER_LOOK[t]!]!;
    return BLOCK[VOXEL_TO_CLIENT[name] ?? 'stone']!;
  }

  /** Height (blocks above flat ground) of the ground drawn at a tile. */
  groundAt(tx: number, tz: number): number {
    const x = tx + MARGIN;
    const z = tz + MARGIN;
    if (x < 0 || z < 0 || x >= GW || z >= GD) return 0;
    return this.colTop[z * GW + x]! - GROUND;
  }

  /** How many tiles each map tile lies in from the sky around the moon (0 for the sky itself). */
  private planetDepths(world: WorldState): Uint8Array {
    const d = new Uint8Array(MAP_W * MAP_H);
    const queue: number[] = [];
    for (let i = 0; i < d.length; i++) {
      if (world.terrain[i] === 'space') queue.push(i);
      else d[i] = 255;
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const n = ny * MAP_W + nx;
        if (d[n]! <= d[i]! + 1) continue;
        d[n] = d[i]! + 1;
        queue.push(n);
      }
    }
    return d;
  }

  /** The lowest block of a map column: the moon is a ball, deep in the middle and thin at the rim. */
  private bottomAt(tx: number, tz: number): number {
    if (!this.planet || tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_H) return 0;
    const s = this.planet[tz * MAP_W + tx]!;
    const R = 25;
    const depth = Math.max(3, Math.round(0.64 * Math.sqrt(Math.max(0, 2 * R * s - s * s))));
    return Math.max(0, GROUND - depth);
  }

  /** How tall a cliff is drawn where the map has no block layer (a few blocks, more inside a rock mass). */
  private cliffHeight(world: WorldState, tx: number, tz: number): number {
    const T = world.terrain;
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ax = tx + dx;
      const az = tz + dz;
      if (ax < 0 || az < 0 || ax >= MAP_W || az >= MAP_H || isCliff(T[az * MAP_W + ax])) n++;
    }
    return Math.min(5, 3 + (n === 4 ? 1 : 0) + (hash(tx, tz, 31) < 0.45 ? 1 : 0));
  }

  /** One column of the map from the shared block layer (3D game) or flat ground. */
  private stampMapColumn(world: WorldState, kind: AreaKind, season: Season, tx: number, tz: number): void {
    const x = tx + MARGIN;
    const z = tz + MARGIN;
    for (let y = 0; y < GH; y++) this.blocks[idx(x, y, z)] = AIR;
    const t = world.terrain[tz * MAP_W + tx]!;
    // the sky around the moon: nothing at all, so the moon floats among the stars
    if (t === 'space') {
      this.colTop[z * GW + x] = 0;
      return;
    }
    if (!world.voxel) {
      const top = GROUND - 1;
      const floor = this.bottomAt(tx, tz);
      const liquid = t === 'pool' ? 'water' : LIQUID_BED[t] ? t : null;
      if (liquid) {
        const T = world.terrain;
        const like = t === 'pool' ? 'water' : t;
        const same = (ax: number, az: number) => T[Math.min(MAP_H - 1, Math.max(0, az)) * MAP_W + Math.min(MAP_W - 1, Math.max(0, ax))] === like;
        const deep = same(tx - 1, tz) && same(tx + 1, tz) && same(tx, tz - 1) && same(tx, tz + 1);
        const bottom = deep ? top - 2 : top - 1;
        const bed = t === 'pool' ? BLOCK.quartz! : t === 'water' && deep ? BLOCK.gravel! : BLOCK[LIQUID_BED[t]!]!;
        this.column(x, z, bottom, bed, t === 'lava' ? bed : BLOCK.dirt!, BLOCK.stone!, floor);
        for (let y = bottom + 1; y <= top; y++) this.blocks[idx(x, y, z)] = BLOCK[liquid]!;
        this.colTop[z * GW + x] = GROUND;
        return;
      }
      if (isCliff(t) && world.occupancy[`${tx},${tz}`] === undefined && kind === 'outdoor') {
        // a cliff stands up out of the ground (the rock under a cave mouth is the mouth's own business)
        const h = this.cliffHeight(world, tx, tz);
        const rock = this.ground(world, kind, season, t);
        this.column(x, z, top + h, rock, rock, rock, floor);
        this.colTop[z * GW + x] = GROUND + h;
        return;
      }
      const g = this.ground(world, kind, season, t);
      const moon = this.planet ? BLOCK.moon_rock! : undefined;
      this.column(x, z, top, g, moon ?? this.underOf(g), moon ?? BLOCK.stone!, floor);
      this.colTop[z * GW + x] = GROUND;
      return;
    }
    const top = columnTop(world, tx, tz) - 1;
    for (let h = 0; h <= top && h < GH; h++) {
      const raw = blockAt(world, tx, tz, h);
      if (raw === VB.air) continue;
      let b: number;
      if (h === top) {
        // the top block looks like its terrain (grass, farmland, path…); a dug-out ore keeps its look
        b = raw !== VB.surface && blockTerrain(raw) === t ? this.voxelBlock(world, raw, t) : this.ground(world, kind, season, t);
      } else if (raw === VB.surface) {
        // the old top, buried under something built on it: rock (a cliff, a mountain) or earth
        b = cellBlock(world, tx, tz, h) === 'stone' ? BLOCK[rockOf(world.biome)]! : UNDER_LOOK[t] ? BLOCK[UNDER_LOOK[t]!]! : BLOCK.dirt!;
      } else b = this.voxelBlock(world, raw, t);
      this.blocks[idx(x, h, z)] = b;
    }
    this.colTop[z * GW + x] = top + 1;
  }

  private underOf(b: number): number {
    if (b === BLOCK.sand || b === BLOCK.redsand || b === BLOCK.ash || b === BLOCK.mud) return b;
    if (b === BLOCK.candy) return BLOCK.candy_fill!;
    if (b === BLOCK.moon_dust) return BLOCK.moon_rock!;
    return b === BLOCK.stone || b === BLOCK.stone_bricks || b === BLOCK.cobble ? BLOCK.stone! : BLOCK.dirt!;
  }

  private column(x: number, z: number, top: number, surface: number, under: number, deep = BLOCK.stone!, bottom = 0): void {
    for (let y = bottom; y <= top; y++) {
      const b = y === top ? surface : y >= top - 3 ? under : deep;
      this.blocks[idx(x, y, z)] = b;
    }
  }

  private stampTerrain(world: WorldState, kind: AreaKind, season: Season): void {
    const T = world.terrain;
    const snowy = season === 'jul' && kind === 'outdoor';
    const biome = world.biome;
    const ground = (t: Terrain): number => this.ground(world, kind, season, t);
    const underOf = (b: number): number => this.underOf(b);
    const terrainAt = (tx: number, tz: number): Terrain => T[Math.min(MAP_H - 1, Math.max(0, tz)) * MAP_W + Math.min(MAP_W - 1, Math.max(0, tx))]!;
    const roofH = 4;
    // under ground: the farm's monster cave keeps its rock in 'water' tiles; a cave out in the world is
    // real 'rock' around real lakes (of water, swamp, lava or chocolate), in the colours of its theme
    const worldCave = kind === 'dungeon' && world.area !== 'dungeon';
    const rockTile: Terrain = worldCave ? 'rock' : 'water';
    const theme = worldCave ? Math.max(0, CAVE_THEMES.indexOf(world.cave?.theme ?? 'rot')) : -1;
    const [rockName, veinName] = theme >= 0 ? (CAVE_ROCK[theme] ?? ['stone_dark', 'ore_coal']) : ['stone_dark', 'ore_coal'];
    const caveRock = BLOCK[rockName]!;
    const caveVein = BLOCK[veinName]!;

    for (let z = 0; z < GD; z++)
      for (let x = 0; x < GW; x++) {
        const tx = x - MARGIN;
        const tz = z - MARGIN;
        const inside = tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H;
        const top = GROUND - 1;
        if (kind === 'dungeon') {
          const t: Terrain = inside ? T[tz * MAP_W + tx]! : rockTile;
          if (t === rockTile || (worldCave && isCliff(t))) {
            // solid rock up to the ceiling
            for (let y = 0; y <= GROUND + roofH; y++) this.blocks[idx(x, y, z)] = hash(x, z, y) < 0.08 ? caveVein : caveRock;
          } else if (worldCave && LIQUID_BED[t]) {
            // an underground lake: two blocks deep, on a bed of the cave's rock
            this.column(x, z, top - 2, caveRock, caveRock, caveRock);
            this.blocks[idx(x, top - 1, z)] = BLOCK[t]!;
            this.blocks[idx(x, top, z)] = BLOCK[t]!;
            this.blocks[idx(x, GROUND + roofH, z)] = caveRock;
          } else {
            this.column(x, z, top, ground(t), worldCave ? caveRock : BLOCK.stone!, worldCave ? caveRock : BLOCK.stone!);
            this.blocks[idx(x, GROUND + roofH, z)] = caveRock;
          }
          continue;
        }
        if (kind === 'bath') {
          const R = BATH_ROOM;
          const inRoom = tx >= R.x && tx < R.x + R.w && tz >= R.y && tz < R.y + R.h;
          if (!inRoom) {
            for (let y = 0; y <= GROUND + WALL_H; y++) this.blocks[idx(x, y, z)] = BLOCK.stone_bricks!;
            continue;
          }
          const t = T[tz * MAP_W + tx]!;
          if (t === 'pool') {
            this.column(x, z, top - 2, BLOCK.quartz!, BLOCK.quartz!);
            this.blocks[idx(x, top - 1, z)] = BLOCK.water!;
            this.blocks[idx(x, top, z)] = BLOCK.water!;
          } else this.column(x, z, top, BLOCK.quartz!, BLOCK.stone!);
          continue;
        }
        // outdoors
        if (inside) {
          this.stampMapColumn(world, kind, season, tx, tz);
          continue;
        }
        // nothing around the moon but stars
        if (this.planet) continue;
        // scenery around the map: continue the nearest edge, rising into hills away from the openings
        const et = terrainAt(tx, tz);
        const d = Math.max(tx < 0 ? -tx : tx >= MAP_W ? tx - MAP_W + 1 : 0, tz < 0 ? -tz : tz >= MAP_H ? tz - MAP_H + 1 : 0);
        // the openings in the middle of each edge lead on to the next area: keep them flat
        const outX = tx < 0 || tx >= MAP_W;
        const outZ = tz < 0 || tz >= MAP_H;
        const corridor = (outX && !outZ && Math.abs(tz - MAP_H / 2) < EDGE_GAP) || (outZ && !outX && Math.abs(tx - MAP_W / 2) < EDGE_GAP);
        if (et === 'water' && !corridor) {
          // the sea (beach areas) runs out to the horizon
          this.column(x, z, top - 2, BLOCK.sand!, BLOCK.sand!);
          this.blocks[idx(x, top - 1, z)] = BLOCK.water!;
          this.blocks[idx(x, top, z)] = BLOCK.water!;
          continue;
        }
        let surfaceName = SCENERY_GROUND[biome ?? ''] ?? 'grass';
        if (snowy && surfaceName === 'grass') surfaceName = 'snowy_grass';
        if (corridor && (et === 'path_dirt' || et === 'path_stone' || et === 'road' || et === 'sidewalk' || et === 'rail' || et === 'gravel' || et === 'floor_wood')) surfaceName = SURFACE[et];
        const surface = BLOCK[surfaceName]!;
        const noise = 0.55 + 0.45 * Math.sin(tx * 0.21 + Math.sin(tz * 0.17) * 2) * Math.cos(tz * 0.19 + Math.sin(tx * 0.13));
        const rise = corridor ? 0 : Math.max(0, Math.floor(Math.min(9, (d - 2) * 0.7) * noise + (hash(tx, tz) < 0.2 ? 1 : 0) * (d > 3 ? 1 : 0)));
        // the 3D game's mountains carry on past the edge
        const edge = world.voxel ? columnTop(world, Math.min(MAP_W - 1, Math.max(0, tx)), Math.min(MAP_H - 1, Math.max(0, tz))) - GROUND : 0;
        const ctop = Math.min(GH - 14, top + rise + edge);
        const up = ctop - GROUND;
        const rock = BLOCK[rockOf(biome)]!;
        const peak = SUGAR.has(biome ?? '') ? surface : up > 12 && !NO_SNOW.has(biome ?? '') ? BLOCK.snow! : up > 8 ? rock : surface;
        this.column(x, z, ctop, peak, up > 8 && !SUGAR.has(biome ?? '') ? rock : underOf(surface), rock);
        this.colTop[z * GW + x] = ctop + 1;
      }
  }

  /** Ceilings over rooms that live inside a map (the farmhouse inside, the bath house). */
  private stampRoofs(world: WorldState, kind: AreaKind, put: (tx: number, h: number, tz: number, b: number) => void): void {
    if (kind === 'outdoor' && !world.area) {
      const I = INTERIOR;
      for (let tz = I.y - 1; tz <= I.y + I.h; tz++)
        for (let tx = I.x - 1; tx <= I.x + I.w; tx++) {
          const skylight = tx > I.x && tx < I.x + I.w - 1 && tz > I.y && tz < I.y + I.h - 1 && (tx + tz) % 3 === 0;
          put(tx, WALL_H, tz, skylight ? BLOCK.glass! : BLOCK.planks_spruce!);
        }
    }
    if (kind === 'bath') {
      const R = BATH_ROOM;
      for (let tz = R.y; tz < R.y + R.h; tz++)
        for (let tx = R.x; tx < R.x + R.w; tx++) put(tx, WALL_H, tz, (tx - R.x) % 4 === 2 && (tz - R.y) % 4 === 2 ? BLOCK.glowstone! : BLOCK.quartz!);
    }
  }

  /** Trees (or giant mushrooms, jungle trees, candy trees…) on the hills around the map. */
  private stampScenery(world: WorldState, season: Season, put: (tx: number, h: number, tz: number, b: number) => void): void {
    const biome = world.biome;
    if (biome === 'strand' || biome === 'oken' || biome === 'rymdbas' || biome === 'mane' || this.planet) return;
    const grounds = new Set([BLOCK.grass, BLOCK.snowy_grass, BLOCK.snow, BLOCK.moss, BLOCK.redsand, BLOCK.candy, BLOCK.ash, BLOCK.mud]);
    for (let z = 0; z < GD; z++)
      for (let x = 0; x < GW; x++) {
        const tx = x - MARGIN;
        const tz = z - MARGIN;
        if (tx >= -2 && tz >= -2 && tx < MAP_W + 2 && tz < MAP_H + 2) continue;
        if (hash(tx, tz, 99) > (biome === 'djungel' ? 0.09 : biome === 'vulkan' || biome === 'dino' ? 0.025 : 0.055)) continue;
        // find the surface
        let y = GH - 1;
        while (y > 0 && this.blocks[idx(x, y, z)] === AIR) y--;
        if (!grounds.has(this.blocks[idx(x, y, z)])) continue;
        const h = y - GROUND + 1;
        const shifted = (px: number, ph: number, pz: number, pb: number) => put(px, ph + h, pz, pb);
        sceneryTree(shifted, biome, tx, tz, season);
      }
  }

  // ------------------------------------------------------------------------ light

  private computeLight(emitters: { x: number; y: number; z: number; level: number }[]): void {
    const B = this.blocks;
    const { opaque, emits, leafy, liquid } = props();
    const sky = this.sky;
    const blk = this.blk;
    sky.fill(0);
    blk.fill(0);
    const queue = this.queue;
    let tail = 0;
    const plane = GW * GD;
    if (this.kind === 'outdoor') {
      // direct sky: straight down until something opaque; leaves and water dim it and stop it
      for (let c = 0; c < plane; c++)
        for (let y = GH - 1; y >= 0; y--) {
          const i = y * plane + c;
          const b = B[i]!;
          if (opaque[b]) break;
          if (leafy[b] || liquid[b]) {
            sky[i] = leafy[b] ? 14 : 13;
            queue[tail++] = i;
            break;
          }
          sky[i] = 15;
        }
      // only lit cells next to a dark see-through neighbour need to spread
      for (let i = 0; i < N; i++) {
        if (sky[i] !== 15) continue;
        const x = i % GW;
        const z = Math.floor(i / GW) % GD;
        if (
          (x > 0 && sky[i - 1] === 0 && !opaque[B[i - 1]!]) ||
          (x < GW - 1 && sky[i + 1] === 0 && !opaque[B[i + 1]!]) ||
          (z > 0 && sky[i - GW] === 0 && !opaque[B[i - GW]!]) ||
          (z < GD - 1 && sky[i + GW] === 0 && !opaque[B[i + GW]!])
        )
          queue[tail++] = i;
      }
    }
    this.flood(sky, tail);
    tail = 0;
    for (const e of emitters) {
      if (e.x < 0 || e.z < 0 || e.x >= GW || e.z >= GD || e.y < 0 || e.y >= GH) continue;
      const i = idx(e.x, e.y, e.z);
      if (blk[i]! < e.level) {
        blk[i] = e.level;
        queue[tail++] = i;
      }
    }
    for (let i = 0; i < N; i++) {
      const l = emits[B[i]!]!;
      if (l && blk[i]! < l) {
        blk[i] = l;
        queue[tail++] = i;
      }
    }
    this.flood(blk, tail);
  }

  private flood(L: Uint8Array, tail: number): void {
    const B = this.blocks;
    const { opaque } = props();
    const queue = this.queue;
    const plane = GW * GD;
    let head = 0;
    while (head < tail) {
      const i = queue[head++]!;
      const l = L[i]! - 1;
      if (l <= 0) continue;
      const x = i % GW;
      const z = Math.floor(i / GW) % GD;
      const y = Math.floor(i / plane);
      // neighbours: -x, +x, -z, +z, -y, +y
      for (let k = 0; k < 6; k++) {
        let j: number;
        if (k === 0) {
          if (x === 0) continue;
          j = i - 1;
        } else if (k === 1) {
          if (x === GW - 1) continue;
          j = i + 1;
        } else if (k === 2) {
          if (z === 0) continue;
          j = i - GW;
        } else if (k === 3) {
          if (z === GD - 1) continue;
          j = i + GW;
        } else if (k === 4) {
          if (y === 0) continue;
          j = i - plane;
        } else {
          if (y === GH - 1) continue;
          j = i + plane;
        }
        if (L[j]! >= l || opaque[B[j]!]) continue;
        L[j] = l;
        queue[tail++] = j;
      }
    }
  }

  // ------------------------------------------------------------------------ meshing

  private remesh(): void {
    const dirty = new Set<number>();
    if (this.first) {
      for (let c = 0; c < CX * CZ; c++) dirty.add(c);
      this.first = false;
    } else {
      const B = this.blocks;
      const S = this.sky;
      const L = this.blk;
      const pb = this.prevBlocks;
      const ps = this.prevSky;
      const pl = this.prevBlk;
      for (let i = 0; i < N; i++) {
        if (B[i] === pb[i] && S[i] === ps[i] && L[i] === pl[i]) continue;
        const x = i % GW;
        const z = Math.floor(i / GW) % GD;
        // a change touches its own chunk and, at a border, the neighbour (AO and light sampling)
        for (const dx of [-1, 0, 1])
          for (const dz of [-1, 0, 1]) {
            const cx = Math.floor((x + dx) / CHUNK);
            const cz = Math.floor((z + dz) / CHUNK);
            if (cx >= 0 && cz >= 0 && cx < CX && cz < CZ) dirty.add(cz * CX + cx);
          }
      }
    }
    this.lastDirty = dirty;
    this.prevBlocks.set(this.blocks);
    this.prevSky.set(this.sky);
    this.prevBlk.set(this.blk);
    for (const c of dirty) this.meshChunk(c % CX, Math.floor(c / CX));
  }

  /** Forces every chunk to be rebuilt on the next `rebuild` (switching maps). */
  reset(): void {
    this.first = true;
    this.baseKey = '';
    for (const m of [...this.opaque.values(), ...[...this.liquids.values()].flat()]) {
      m.geometry.dispose();
      this.group.remove(m);
    }
    this.opaque.clear();
    this.liquids.clear();
  }

  private meshChunk(cx: number, cz: number): void {
    const solid = new GeoBuilder();
    const liquid = new Map<number, GeoBuilder>();
    const B = this.blocks;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(GW, x0 + CHUNK);
    const z1 = Math.min(GD, z0 + CHUNK);
    for (let y = 0; y < GH; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          const b = B[idx(x, y, z)]!;
          if (b === AIR) continue;
          const def = BLOCKS[b]!;
          let g = solid;
          if (def.liquid) {
            g = liquid.get(b) ?? new GeoBuilder();
            liquid.set(b, g);
          }
          for (const f of FACES) {
            const nb = this.get(x + f.n[0], y + f.n[1], z + f.n[2]);
            if (!this.faceVisible(def, b, nb, f)) continue;
            this.emitFace(g, def, x, y, z, f);
          }
        }
    const key = cz * CX + cx;
    const old = this.opaque.get(key);
    if (old) this.drop(old);
    this.opaque.delete(key);
    if (!solid.empty) this.opaque.set(key, this.add(solid, this.solidMat, 0));
    for (const m of this.liquids.get(key) ?? []) this.drop(m);
    this.liquids.delete(key);
    const meshes: THREE.Mesh[] = [];
    for (const [b, g] of liquid) {
      const lm = this.liquidMats.get(b);
      if (!g.empty && lm) meshes.push(this.add(g, lm.mat, 1));
    }
    if (meshes.length) this.liquids.set(key, meshes);
  }

  private drop(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    this.group.remove(mesh);
  }

  private add(b: GeoBuilder, mat: THREE.Material, order: number): THREE.Mesh {
    const mesh = new THREE.Mesh(b.build(), mat);
    mesh.position.set(-MARGIN, -GROUND, -MARGIN);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = order;
    mesh.userData.chunk = true;
    this.group.add(mesh);
    return mesh;
  }

  private faceVisible(def: BlockDef, b: number, nb: number, f: FaceDef): boolean {
    if (nb === AIR) return true;
    const n = BLOCKS[nb]!;
    if (def.liquid) return !n.liquid && !n.opaque && f.name !== 'bottom';
    if (n.opaque) {
      // next to a lowered top (farmland, paths) the sliver of our side above it shows
      return !!n.topInset && !def.topInset && f.name !== 'top' && f.name !== 'bottom';
    }
    if (def.cullSelf && nb === b) return false;
    return true;
  }

  private occludes(x: number, y: number, z: number): number {
    return BLOCKS[this.get(x, y, z)]!.opaque ? 1 : 0;
  }

  private lightAt(x: number, y: number, z: number): [number, number] | null {
    if (x < 0 || z < 0 || x >= GW || z >= GD || y < 0) return null;
    if (y >= GH) return [this.kind === 'outdoor' ? 15 : 0, 0];
    const i = idx(x, y, z);
    if (BLOCKS[this.blocks[i]!]!.opaque) return null;
    return [this.sky[i]!, this.blk[i]!];
  }

  private emitFace(g: GeoBuilder, def: BlockDef, x: number, y: number, z: number, f: FaceDef): void {
    // liquids use the whole of their own (flowing) texture; everything else its tile in the atlas
    let [U0, V0, U1, V1] = def.liquid ? [0, 0, 1, 1] : tileUV(blockTile(def, f.name));
    const fx = x + f.n[0];
    const fy = y + f.n[1];
    const fz = z + f.n[2];
    const shade = FACE_SHADE[f.name];
    // lowered tops: farmland/paths 15/16, water 14/16 unless more water sits above
    let topDrop = def.topInset ? def.topInset / TEX : 0;
    if (def.liquid && !BLOCKS[this.get(x, y + 1, z)]!.liquid) topDrop = 2 / TEX;
    if (topDrop && f.name !== 'top' && f.name !== 'bottom') {
      // crop the texture's top rows to match the shorter side
      V1 = V0 + (V1 - V0) * (1 - topDrop);
    }
    const pos: V3[] = [];
    const uv: [number, number][] = [];
    const col: [number, number, number][] = [];
    const light: [number, number][] = [];
    const ao: number[] = [];
    const base = this.lightAt(fx, fy, fz) ?? [this.sky[idx(x, y, z)] ?? 0, this.blk[idx(x, y, z)] ?? 0];
    for (let k = 0; k < 4; k++) {
      const c = f.corners[k]!;
      let py = y + c[1];
      if (c[1] === 1 && topDrop) py -= topDrop;
      pos.push([x + c[0], py, z + c[2]]);
      const t = f.uv[k]!;
      uv.push([U0 + (U1 - U0) * t[0], V0 + (V1 - V0) * t[1]]);
      // which way the corner leans along the face's two axes
      const s1 = c[0] * f.a1[0] + c[1] * f.a1[1] + c[2] * f.a1[2] ? 1 : -1;
      const s2 = c[0] * f.a2[0] + c[1] * f.a2[1] + c[2] * f.a2[2] ? 1 : -1;
      const ax = [f.a1[0] * s1, f.a1[1] * s1, f.a1[2] * s1];
      const bx = [f.a2[0] * s2, f.a2[1] * s2, f.a2[2] * s2];
      const side1 = this.occludes(fx + ax[0]!, fy + ax[1]!, fz + ax[2]!);
      const side2 = this.occludes(fx + bx[0]!, fy + bx[1]!, fz + bx[2]!);
      const corner = this.occludes(fx + ax[0]! + bx[0]!, fy + ax[1]! + bx[1]!, fz + ax[2]! + bx[2]!);
      const a = def.liquid ? 3 : side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
      ao.push(a);
      const v = AO_CURVE[a]! * shade;
      col.push([v, v, v]);
      // smooth light: average the see-through cells around the corner
      let sky = base[0];
      let blk = base[1];
      let n = 1;
      for (const s of [
        [ax[0]!, ax[1]!, ax[2]!],
        [bx[0]!, bx[1]!, bx[2]!],
        [ax[0]! + bx[0]!, ax[1]! + bx[1]!, ax[2]! + bx[2]!],
      ]) {
        const l = this.lightAt(fx + s[0]!, fy + s[1]!, fz + s[2]!);
        if (!l) continue;
        sky += l[0];
        blk += l[1];
        n++;
      }
      light.push([sky / n / 15, blk / n / 15]);
    }
    // flip the quad's diagonal so AO gradients don't crease
    const flip = ao[0]! + ao[2]! < ao[1]! + ao[3]!;
    g.quad(pos, uv, col, light, flip);
  }

  dispose(): void {
    this.reset();
  }
}

export { BLOCK };

/** Chunk index of a tile (shared by the block meshes and the model layer). */
export const chunkOf = (tx: number, tz: number): number => {
  const cx = Math.min(CX - 1, Math.max(0, Math.floor((tx + MARGIN) / CHUNK)));
  const cz = Math.min(CZ - 1, Math.max(0, Math.floor((tz + MARGIN) / CHUNK)));
  return cz * CX + cx;
};
