// The farm: tilemap, sprites, prediction, interpolation, night, effects.
import Phaser from 'phaser';
import {
  WALL_KINDS,
  findRooms,
  ANIMALS,
  heldItem,
  ITEMS,
  CROPS,
  DAY_LENGTH_MS,
  DUNGEON_H,
  DUNGEON_W,
  INTERIOR,
  NPC_LINES,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  countItem,
  inEdgeGap,
  MAP_H,
  MAP_W,
  NPCS,
  REACH,
  T,
  TILE,
  facingTile,
  inInterior,
  isBaby,
  nightAmount,
  objectDef,
  stepPlayer,
  rideSpeedMul,
  isVehicle,
  BOOST_SPEED_MUL,
  BATH_ROOM,
  inPool,
  isBathKey,
  isUnderground,
  LOOT_REFILL_DAYS,
  MOON_KEY,
  tileOf,
  localWeather,
  type WeatherKind,
  type AnimalState,
  type Change,
  type DropState,
  type PlayerState,
  type Terrain,
  type WorldObject,
} from '@lilla-garden/shared';
import { animalKey, ANIMAL_SIZE, ANIMAL_VARIANTS } from '../art/animals.js';
import { CHAR_H, CHAR_W, dirOf, frameIndex, type Dir } from '../art/characters.js';
import { characterTexture, getArt, registerTextures } from '../art/textures.js';
import { EMOTE_GLYPH, PAINT_COLORS } from '../art/world.js';
import { HD, NEW_ART, R } from '../art/style.ts';
import { paintingTexture } from '../art/painting.ts';
import { net } from '../net.js';
import { WeatherView } from './weather.ts';
import { SFX } from '../sound.ts';
import { activeWorld, bus, client, myArea, myPlayer, serverNow } from '../state.js';

export const VIEW_W = 320;
export const VIEW_H = 180;
/** Sprite scale: textures are drawn at R× resolution, world units stay 16 px per tile. */
const S = 1 / R;

interface Actor {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  label: HTMLDivElement;
  bubble?: HTMLDivElement;
  texture: string;
  x: number;
  y: number;
  /** Shown while swimming in the bath house pool. */
  ripple?: Phaser.GameObjects.Image;
  /** The item in the player's hand. */
  held?: Phaser.GameObjects.Image;
  heldKey?: string;
  /** The whistle emote we already played a sound for. */
  whistled?: number;
}

export interface InputSource {
  /** -1..1 */
  dx: number;
  dy: number;
}

const shadeInt = (c: number, f: number): number => {
  const ch = (sh: number) => Math.min(255, Math.round(((c >> sh) & 0xff) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

const lerpColor = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(((a >> sh) & 0xff) * (1 - t) + ((b >> sh) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export class GameScene extends Phaser.Scene {
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private map!: Phaser.Tilemaps.Tilemap;
  private waterTiles: [number, number][] = [];
  private waterFrame = 0;
  private objects = new Map<number, Phaser.GameObjects.Image>();
  private objectShadows = new Map<number, Phaser.GameObjects.Image>();
  private doorIds = new Set<number>();
  private doorOpen = new Map<number, boolean>();
  /** Roofs over rooms closed by wall pieces, with the tiles each covers (it fades away while I stand there). */
  private roofs: { gfx: Phaser.GameObjects.Graphics; tiles: Set<number> }[] = [];
  private roofsDirty = true;
  private crops = new Map<string, Phaser.GameObjects.Image>();
  private drops = new Map<number, Phaser.GameObjects.Image>();
  private players = new Map<string, Actor>();
  /** The world this scene renders (farm or cave). */
  private world!: import('@lilla-garden/shared').WorldState;
  private area = 'farm';
  private travelSentAt = 0;
  private npcs = new Map<string, Actor>();
  private inside = false;
  private roomMask!: Phaser.GameObjects.Image;
  private bathMask!: Phaser.GameObjects.Image;
  /** Inside a bath house (its own small map, dark outside the room). */
  private bath = false;
  private animals = new Map<number, Actor>();
  private cursor!: Phaser.GameObjects.Image;
  private night!: Phaser.GameObjects.RenderTexture;
  private glow!: string;
  private snow: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private weather: WeatherView | null = null;
  /** Ground drawn white: Christmas, or after it has snowed a while. */
  private snowGround = false;
  private labels!: HTMLElement;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastMoveSent = 0;
  private wasMoving = false;
  private unsub: (() => void)[] = [];
  private hoverTile: { tx: number; ty: number } | null = null;
  private animTick = 0;

  /** Set by the UI layer. */
  joystick: InputSource = { dx: 0, dy: 0 };
  uiOpen = false;
  touch = false;
  /** Touch run button held. */
  runHeld = false;

  constructor() {
    super('game');
  }

  create(): void {
    // A restart keeps class fields: drop everything that belonged to the previous scene
    this.objects.clear();
    this.objectShadows.clear();
    this.doorIds.clear();
    this.doorOpen.clear();
    this.roofs = [];
    this.roofsDirty = true;
    this.crops.clear();
    this.drops.clear();
    this.players.clear();
    this.animals.clear();
    this.npcs.clear();
    this.talk.clear();
    this.snow = null;
    this.weather = null;
    this.snowGround = client.season === 'jul';
    this.hoverTile = null;
    this.area = myArea();
    this.world = activeWorld()!;
    const world = this.world;
    registerTextures(this.textures);
    this.labels = document.getElementById('labels')!;
    this.labels.innerHTML = '';
    const art = getArt();

    // --- terrain ---
    this.map = this.make.tilemap({ tileWidth: TILE * R, tileHeight: TILE * R, width: MAP_W, height: MAP_H });
    const tileset = this.map.addTilesetImage('terrain', 'terrain', TILE * R, TILE * R, 0, 0)!;
    this.layer = this.map.createBlankLayer('ground', tileset)!;
    this.layer.setDepth(0).setScale(1 / R);
    this.rebuildTerrain();

    // --- objects, crops, drops ---
    for (const o of Object.values(world.objects)) this.putObject(o);
    for (const [k, c] of Object.entries(world.crops)) this.putCrop(k, c.stage, c.crop);
    for (const d of Object.values(world.drops)) this.putDrop(d);
    for (const a of Object.values(world.animals)) this.putAnimal(a);
    for (const p of Object.values(world.players)) if (p.online && (p.area ?? 'farm') === this.area) this.putPlayer(p);
    for (const npc of Object.values(NPCS).filter((n) => (n.area ?? 'farm') === this.area)) {
      const texture = characterTexture(this.textures, npc.appearance, npc.outfit);
      this.ensureCharAnims(texture);
      const snap = client.snaps.npcs.get(npc.id);
      const x = snap?.x ?? npc.x * TILE + TILE / 2;
      const y = snap?.y ?? npc.y * TILE + TILE / 2;
      const shadow = this.add.image(x, y + 2, 'fx-shadow-0').setDepth(2).setAlpha(0.6).setScale(S);
      const sprite = this.add.sprite(x, y + 4, texture, frameIndex('down', 0)).setOrigin(0.5, 1).setDepth(y + 4).setScale(S);
      this.npcs.set(npc.id, { sprite, shadow, label: this.makeLabel(npc.name, 'npc'), texture, x, y });
    }

    // --- cursor, night, snow ---
    this.cursor = this.add.image(0, 0, 'fx-cursor-0').setOrigin(0).setDepth(9000).setAlpha(0.9).setScale(S);
    this.glow = this.makeGlowTexture();
    // scroll-factor-0 overlays are zoomed by the camera too: offset them so they cover the whole view
    const ovx = (VIEW_W * (R - 1)) / 2;
    const ovy = (VIEW_H * (R - 1)) / 2;
    this.night = this.add.renderTexture(ovx, ovy, VIEW_W, VIEW_H).setOrigin(0).setScrollFactor(0).setDepth(9500);
    if (!this.textures.exists('fx-white')) {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      c.getContext('2d')!.fillStyle = '#fff';
      c.getContext('2d')!.fillRect(0, 0, 2, 2);
      this.textures.addCanvas('fx-white', c);
    }
    this.roomMask = this.make.image({ key: 'fx-white', add: false }).setOrigin(0).setDisplaySize((INTERIOR.w + 2) * TILE, (INTERIOR.h + 2) * TILE);
    this.bathMask = this.make.image({ key: 'fx-white', add: false }).setOrigin(0).setDisplaySize(BATH_ROOM.w * TILE, (BATH_ROOM.h + 1) * TILE); // the room incl. the wall caps above it
    this.inside = false;
    this.bath = isBathKey(this.area);
    this.weather = new WeatherView(this, ovx, ovy, VIEW_W, VIEW_H);
    this.snowGround = this.wantSnowGround();
    this.applySeason();

    // --- camera ---
    if (isUnderground(this.area)) this.cameras.main.setBounds(0, 0, (this.world.cave?.w ?? DUNGEON_W) * TILE, (this.world.cave?.h ?? DUNGEON_H) * TILE);
    else if (this.bath) this.cameras.main.setBounds((BATH_ROOM.x - 2) * TILE, (BATH_ROOM.y - 3) * TILE, (BATH_ROOM.w + 4) * TILE, (BATH_ROOM.h + 5) * TILE);
    else this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.setRoundPixels(!HD);
    this.cameras.main.setZoom(R);
    void art;

    // --- input ---
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-E', () => this.actFacing());
    kb.on('keydown-SPACE', () => this.actFacing());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.uiOpen) return;
      const tx = tileOf(p.worldX);
      const ty = tileOf(p.worldY);
      this.actAt(tx, ty, true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.hoverTile = { tx: tileOf(p.worldX), ty: tileOf(p.worldY) };
    });

    // --- events ---
    this.unsub.push(bus.on('change', (c) => this.onChange(c)));
    this.unsub.push(bus.on('fx', (c) => {
      if ((c.area ?? 'farm') !== this.area) return;
      this.spawnFx(c.x, c.y, c.kind, c.from);
    }));
    this.unsub.push(bus.on('season', () => this.applySeason()));
    this.unsub.push(bus.on('state', () => this.onState()));
    this.events.once('shutdown', () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.labels.innerHTML = '';
      this.npcs.clear();
    });

    this.time.addEvent({ delay: 400, loop: true, callback: () => this.animateWorld() });
  }

  // ------------------------------------------------------------------ terrain

  /** Sides of (x,y) whose ground is of another kind: 1 up, 2 right, 4 down, 8 left. */
  private edgeMask(x: number, y: number, same: (t: Terrain | undefined) => boolean): number {
    const T = this.world.terrain;
    const at = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? undefined : T[ty * MAP_W + tx]);
    return (same(at(x, y - 1)) ? 0 : 1) | (same(at(x + 1, y)) ? 0 : 2) | (same(at(x, y + 1)) ? 0 : 4) | (same(at(x - 1, y)) ? 0 : 8);
  }

  private tileIndexFor(x: number, y: number, frame = 0): number {
    const art = getArt();
    const t = this.world.terrain[y * MAP_W + x]!;
    if (this.area === 'dungeon') return t === 'water' ? art.terrain.rock : art.terrain.index(t, x, y, false);
    if (t === 'rock' && isUnderground(this.area)) return art.terrain.rock;
    const snowy = this.snowGround || (t === 'rock' && this.world.biome === 'is');
    const same = art.terrain.edges ? art.terrain.edgeGroup(t) : null;
    return art.terrain.index(t, x, y, snowy, same ? this.edgeMask(x, y, same) : 0, frame);
  }

  private rebuildTerrain(): void {
    const world = this.world;
    this.waterTiles = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        this.layer.putTileAt(this.tileIndexFor(x, y, this.waterFrame), x, y);
        const tt = world.terrain[y * MAP_W + x];
        if (this.area !== 'dungeon' && (tt === 'water' || tt === 'pool' || tt === 'bog' || tt === 'lava' || tt === 'choco')) this.waterTiles.push([x, y]);
      }
  }

  private setTerrain(x: number, y: number): void {
    const world = this.world;
    const t = world.terrain[y * MAP_W + x]!;
    this.layer.putTileAt(this.tileIndexFor(x, y, this.waterFrame), x, y);
    this.waterTiles = this.waterTiles.filter(([wx, wy]) => wx !== x || wy !== y);
    if (t === 'water' || t === 'pool' || t === 'bog' || t === 'lava' || t === 'choco') this.waterTiles.push([x, y]);
    // neighbours' edges change too
    if (getArt().terrain.edges) for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) if (x + dx >= 0 && y + dy >= 0 && x + dx < MAP_W && y + dy < MAP_H) this.layer.putTileAt(this.tileIndexFor(x + dx, y + dy, this.waterFrame), x + dx, y + dy);
  }

  private animateWorld(): void {
    const art = getArt();
    this.waterFrame = 1 - this.waterFrame;
    for (const [x, y] of this.waterTiles) this.layer.putTileAt(this.tileIndexFor(x, y, this.waterFrame), x, y);
    this.animTick++;
    const world = this.world;
    for (const [id, img] of this.objects) {
      const o = world.objects[id];
      if (!o) continue;
      const a = art.objects[o.kind];
      if (a?.animated && a.frames.length > 1) img.setTexture(`obj-${o.kind}-${this.animTick % a.frames.length}`);
    }
  }

  // ------------------------------------------------------------------ roofs

  /**
   * Puts a gabled roof on every room the wall pieces close. It is drawn one tile up, like the walls'
   * height, so the front wall still shows below the eaves and whatever stands behind the house is hidden.
   */
  private rebuildRoofs(me: PlayerState): void {
    this.roofsDirty = false;
    for (const r of this.roofs) r.gfx.destroy();
    this.roofs = [];
    if (this.world.voxel || this.area === 'dungeon') return;
    const myTile = tileOf(me.y) * MAP_W + tileOf(me.x);
    for (const room of findRooms(this.world)) {
      const tiles = new Set([...room.tiles, ...room.walls]);
      const base = room.stone ? 0x646b74 : 0xb5413a;
      const lit = shadeInt(base, 1.12);
      const dark = shadeInt(base, 0.82);
      const line = shadeInt(base, 0.62);
      const has = (x: number, y: number) => tiles.has(y * MAP_W + x);
      // each column's ridge sits halfway between its top and bottom tile
      const span = new Map<number, [number, number]>();
      for (const i of tiles) {
        const x = i % MAP_W;
        const y = (i - x) / MAP_W;
        const s = span.get(x);
        span.set(x, s ? [Math.min(s[0], y), Math.max(s[1], y)] : [y, y]);
      }
      const g = this.add.graphics();
      let bottom = 0;
      for (const i of tiles) {
        const x = i % MAP_W;
        const y = (i - x) / MAP_W;
        bottom = Math.max(bottom, y);
        const [top, bot] = span.get(x)!;
        const ridge = ((top + bot + 1) / 2) * TILE;
        const px = x * TILE;
        for (let row = 0; row < 4; row++) {
          const ry = y * TILE + row * 4;
          g.fillStyle(ry + 4 <= ridge ? lit : dark).fillRect(px, ry - TILE, TILE, 4);
          g.fillStyle(line).fillRect(px, ry - TILE + 3, TILE, 1);
          const off = (row + y) % 2 ? 2 : 6;
          g.fillRect(px + off, ry - TILE, 1, 3).fillRect(px + off + 8, ry - TILE, 1, 3);
        }
        g.fillStyle(line);
        if (!has(x - 1, y)) g.fillRect(px, y * TILE - TILE, 1, TILE);
        if (!has(x + 1, y)) g.fillRect(px + TILE - 1, y * TILE - TILE, 1, TILE);
        if (!has(x, y - 1)) g.fillRect(px, y * TILE - TILE, TILE, 1);
        // eaves along the front
        if (!has(x, y + 1)) g.fillStyle(shadeInt(base, 0.7)).fillRect(px, y * TILE - 3, TILE, 2).fillStyle(line).fillRect(px, y * TILE - 1, TILE, 1);
      }
      // the ridge on top, once every tile is down
      g.fillStyle(shadeInt(base, 1.35));
      for (const [x, [top, bot]] of span) g.fillRect(x * TILE, ((top + bot + 1) / 2) * TILE - TILE - 1, TILE, 2);
      g.setDepth((bottom + 1) * TILE + 0.5).setAlpha(tiles.has(myTile) ? 0 : 1);
      this.roofs.push({ gfx: g, tiles });
    }
  }

  // ------------------------------------------------------------------ sprites

  /** Neighbour mask (1 up, 2 right, 4 down, 8 left) over tiles whose object passes `linked`. */
  private linkMask(x: number, y: number, linked: (kind: string) => boolean): number {
    const is = (tx: number, ty: number) => {
      const id = this.world.occupancy[`${tx},${ty}`];
      const k = id === undefined ? undefined : this.world.objects[id]?.kind;
      return k !== undefined && linked(k);
    };
    return (is(x, y - 1) ? 1 : 0) | (is(x + 1, y) ? 2 : 0) | (is(x, y + 1) ? 4 : 0) | (is(x - 1, y) ? 8 : 0);
  }

  private fenceMask(x: number, y: number): number {
    return this.linkMask(x, y, (k) => k === 'fence' || k === 'gate');
  }

  private wallMask(x: number, y: number): number {
    return this.linkMask(x, y, (k) => WALL_KINDS.has(k));
  }

  /** Redraws fences and wall pieces next to a tile so they connect up. */
  private refreshFenceNeighbours(x: number, y: number): void {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const id = this.world.occupancy[`${x + dx},${y + dy}`];
      const o = id === undefined ? undefined : this.world.objects[id];
      if (o && (o.kind === 'fence' || o.kind === 'gate' || WALL_KINDS.has(o.kind))) this.putObject(o, false);
    }
  }

  /** Doors swing open while a player or villager stands on or next to them. */
  private doorIsOpen(o: WorldObject): boolean {
    const cx = o.x * TILE + TILE / 2;
    const cy = o.y * TILE + TILE / 2;
    const near = (a: { x: number; y: number }) => Math.abs(a.x - cx) < TILE * 1.2 && Math.abs(a.y - cy) < TILE * 1.2;
    for (const a of this.players.values()) if (near(a)) return true;
    for (const a of this.npcs.values()) if (near(a)) return true;
    return false;
  }

  private updateDoors(): void {
    for (const id of this.doorIds) {
      const o = this.world.objects[id];
      if (!o) {
        this.doorIds.delete(id);
        continue;
      }
      const open = this.doorIsOpen(o);
      if (this.doorOpen.get(id) !== open) this.putObject(o, false);
    }
  }

  private putObject(o: WorldObject, refresh = true): void {
    const art = getArt().objects[o.kind];
    const def = objectDef(o.kind);
    this.objects.get(o.id)?.destroy();
    if (!art) return;
    let variant = (o.variant ?? 0) % art.frames.length;
    const isWall = WALL_KINDS.has(o.kind);
    if (o.kind === 'loot_chest') {
      // open (and empty) for you if you took this week's treasure
      const last = o.openedBy?.[client.me];
      variant = ((o.variant ?? 0) * 2 + (last !== undefined && client.day - last < LOOT_REFILL_DAYS ? 1 : 0)) % art.frames.length;
    } else if (o.kind === 'fence') variant = this.fenceMask(o.x, o.y);
    else if (o.kind === 'gate') {
      const m = this.fenceMask(o.x, o.y);
      variant = m & 5 && !(m & 10) ? 1 : 0;
    } else if (isWall) {
      // painted colour in o.variant; orientation from the neighbours
      const colour = (o.variant ?? 0) % PAINT_COLORS.length;
      const m = this.wallMask(o.x, o.y);
      const vertical = m & 5 && !(m & 10) ? 1 : 0;
      if (o.kind === 'window') variant = colour * 2 + vertical;
      else if (o.kind === 'door') {
        const open = this.doorIsOpen(o);
        this.doorIds.add(o.id);
        this.doorOpen.set(o.id, open);
        variant = colour * 4 + vertical * 2 + (open ? 1 : 0);
      } else variant = colour * 16 + m;
    } else if (o.kind === 'house') variant = (o.variant ?? 0) % art.frames.length;
    if (refresh && (o.kind === 'fence' || o.kind === 'gate' || isWall)) this.refreshFenceNeighbours(o.x, o.y);
    const img =
      o.kind === 'painting' && o.data !== undefined
        ? this.add.image(o.x * TILE - 2, o.y * TILE - 8, paintingTexture(this.textures, o.data)).setOrigin(0).setScale(S)
        : this.add.image(o.x * TILE + art.ox, o.y * TILE + art.oy, `obj-${o.kind}-${variant}`).setOrigin(0).setScale(S);
    img.setDepth(def.flat ? 1 : (o.y + def.h) * TILE);
    this.objects.set(o.id, img);
    if ((NEW_ART || HD) && (o.kind.startsWith('tree') || o.kind === 'palm' || o.kind === 'bush')) {
      this.objectShadows.get(o.id)?.destroy();
      const sh = this.add.image(o.x * TILE + TILE / 2, (o.y + 1) * TILE - 2, 'fx-shadowBig-0').setDepth(1.5).setAlpha(0.7).setScale(S);
      this.objectShadows.set(o.id, sh);
    }
  }

  private putCrop(k: string, stage: number, crop: string): void {
    const [xs, ys] = k.split(',');
    const x = Number(xs);
    const y = Number(ys);
    const n = CROPS[crop]?.stages.length ?? 0;
    const frame = Math.min(stage, n);
    let img = this.crops.get(k);
    if (!img) {
      img = this.add.image(x * TILE, y * TILE, `crop-${crop}-${frame}`).setOrigin(0).setDepth((y + 1) * TILE - 2).setScale(S);
      this.crops.set(k, img);
    } else img.setTexture(`crop-${crop}-${frame}`);
  }

  private putDrop(d: DropState): void {
    this.drops.get(d.id)?.destroy();
    const img = this.add.image(d.x, d.y, `icon-${d.item}`).setScale(0.75 * S).setDepth(d.y);
    this.tweens.add({ targets: img, y: d.y - 3, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.drops.set(d.id, img);
  }

  private makeLabel(text: string, cls: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    el.textContent = text;
    this.labels.appendChild(el);
    return el;
  }

  private putPlayer(p: PlayerState): void {
    const texture = characterTexture(this.textures, p.appearance, p.outfit);
    this.ensureCharAnims(texture);
    let actor = this.players.get(p.id);
    if (!actor) {
      const shadow = this.add.image(p.x, p.y + 2, 'fx-shadow-0').setDepth(2).setAlpha(0.6).setScale(S);
      const sprite = this.add.sprite(p.x, p.y + 4, texture, frameIndex('down', 0)).setOrigin(0.5, 1).setScale(S);
      actor = { sprite, shadow, label: this.makeLabel(p.name, p.id === client.me ? 'me' : 'other'), texture, x: p.x, y: p.y };
      this.players.set(p.id, actor);
    } else if (actor.texture !== texture) {
      actor.texture = texture;
      actor.sprite.setTexture(texture, frameIndex('down', 0));
    }
    actor.label.textContent = p.name;
  }

  private removePlayer(id: string): void {
    const a = this.players.get(id);
    if (!a) return;
    a.sprite.destroy();
    a.shadow.destroy();
    a.ripple?.destroy();
    a.held?.destroy();
    a.label.remove();
    a.bubble?.remove();
    this.players.delete(id);
  }

  private putAnimal(a: AnimalState): void {
    if (!ANIMAL_SIZE[a.species]) return; // a kind of animal this version has no picture for
    const texture = animalKey(a.species, isBaby(a), client.season === 'jul', (a.variant ?? 0) % (ANIMAL_VARIANTS[a.species] ?? 1));
    this.ensureAnimalAnims(texture);
    let actor = this.animals.get(a.id);
    if (!actor) {
      const size = ANIMAL_SIZE[a.species] ?? { w: 16, h: 16 };
      const shadow = this.add.image(a.x, a.y + 2, 'fx-shadow-0').setDepth(2).setAlpha(0.5).setScale((size.w / 12) * S, S);
      const sprite = this.add.sprite(a.x, a.y + 4, texture, 0).setOrigin(0.5, 1).setScale(S);
      actor = { sprite, shadow, label: this.makeLabel(a.name, 'animal'), texture, x: a.x, y: a.y };
      this.animals.set(a.id, actor);
    } else if (actor.texture !== texture) {
      actor.texture = texture;
      actor.sprite.setTexture(texture, 0);
    }
    const def = ANIMALS[a.species];
    const mob = def?.mob ?? (def?.predator && !a.owner ? { hp: def.predator.hp } : undefined);
    actor.label.textContent = mob ? `${a.name} ${'♥'.repeat(Math.max(0, a.hp ?? mob.hp))}` : `${a.name}${a.hasProduct ? ' ✨' : ''}${a.hearts > 0 ? ' ' + '♥'.repeat(a.hearts) : ''}`;
    actor.label.classList.toggle('mob', !!mob);
  }

  private removeAnimal(id: number): void {
    const a = this.animals.get(id);
    if (!a) return;
    a.sprite.destroy();
    a.shadow.destroy();
    a.label.remove();
    this.animals.delete(id);
  }

  private ensureCharAnims(texture: string): void {
    for (const dir of ['down', 'up', 'right'] as Dir[]) {
      const key = `${texture}-walk-${dir}`;
      if (this.anims.exists(key)) continue;
      const b = frameIndex(dir, 0);
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { frames: [b + 1, b, b + 2, b] }), frameRate: 7, repeat: -1 });
    }
  }

  private ensureAnimalAnims(texture: string): void {
    const key = `${texture}-walk`;
    if (this.anims.exists(key)) return;
    this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { frames: [0, 1] }), frameRate: 5, repeat: -1 });
  }

  // ------------------------------------------------------------------ change handling

  private onChange(c: Change): void {
    const world = this.world;
    if (c.t === 'areaData') return;
    const forArea = ('area' in c && c.area) || 'farm';
    if ((c.t === 'terrain' || c.t === 'crop' || c.t === 'object' || c.t === 'animal' || c.t === 'drop') && forArea !== this.area) return;
    switch (c.t) {
      case 'terrain':
        this.setTerrain(c.x, c.y);
        break;
      case 'crop':
        if (c.crop) this.putCrop(c.k, c.crop.stage, c.crop.crop);
        else {
          this.crops.get(c.k)?.destroy();
          this.crops.delete(c.k);
        }
        break;
      case 'object':
        this.roofsDirty = true;
        if (c.obj) this.putObject(c.obj);
        else {
          const gone = this.objects.get(c.id);
          gone?.destroy();
          this.objects.delete(c.id);
          this.objectShadows.get(c.id)?.destroy();
          this.objectShadows.delete(c.id);
          this.doorIds.delete(c.id);
          this.doorOpen.delete(c.id);
          if (gone) this.refreshFenceNeighbours(Math.round(gone.x / TILE), Math.round(gone.y / TILE));
        }
        break;
      case 'animal':
        if (c.animal) this.putAnimal(c.animal);
        else this.removeAnimal(c.id);
        break;
      case 'drop':
        if (c.drop) this.putDrop(c.drop);
        else {
          this.drops.get(c.id)?.destroy();
          this.drops.delete(c.id);
        }
        break;
      case 'player': {
        const p = c.player ?? world.players[c.id];
        if (!c.player || !p || !p.online || (p.area ?? 'farm') !== this.area) this.removePlayer(c.id);
        else this.putPlayer(world.players[c.id] ?? p);
        break;
      }
    }
  }

  private onState(): void {
    const world = client.world!;
    for (const [id, snap] of client.snaps.players) {
      const here = (snap.area ?? 'farm') === this.area;
      const p = world.players[id];
      if (p && here && !this.players.has(id)) this.putPlayer(p);
      if (!here && this.players.has(id)) this.removePlayer(id);
    }
    for (const id of [...this.players.keys()]) if (!client.snaps.players.has(id)) this.removePlayer(id);
    for (const [id, snap] of client.snaps.animals) {
      const here = (snap.area ?? 'farm') === this.area;
      if (!here && this.animals.has(id)) this.removeAnimal(id);
    }
  }

  /** The weather over this map (whether or not you are indoors); null in the cave and the bath house. */
  private mapWeather(): WeatherKind | null {
    const w = client.weather;
    if (!w || isUnderground(this.area) || this.area === MOON_KEY || this.bath) return null;
    return localWeather(w.kind, this.world.biome);
  }

  private wantSnowGround(): boolean {
    if (client.season === 'jul') return !isUnderground(this.area) && !['djungel', 'oken', 'strand', 'dino', 'vulkan', 'godis', 'rymdbas', 'mane'].includes(this.world.biome ?? '');
    return this.mapWeather() === 'snow' && serverNow() - (client.weather?.since ?? 0) > 25_000;
  }

  private updateWeather(dt: number): void {
    const kind = this.mapWeather();
    const w = client.weather;
    this.weather?.update(dt, this.inside ? null : kind, w?.prev, serverNow() - (w?.since ?? 0));
    const snowy = this.wantSnowGround();
    if (snowy !== this.snowGround) {
      this.snowGround = snowy;
      this.rebuildTerrain();
    }
  }

  private applySeason(): void {
    this.snowGround = this.wantSnowGround();
    this.rebuildTerrain();
    for (const a of Object.values(this.world.animals)) this.putAnimal(a);
    if (client.season === 'jul' && this.area === 'farm' && !this.snow) {
      this.snow = this.add.particles((VIEW_W * (R - 1)) / 2, (VIEW_H * (R - 1)) / 2, 'fx-snow-0', {
        x: { min: 0, max: VIEW_W },
        scale: S,
        y: -4,
        lifespan: 7000,
        speedY: { min: 12, max: 26 },
        speedX: { min: -6, max: 6 },
        alpha: { start: 0.9, end: 0.5 },
        quantity: 1,
        frequency: 120,
      });
      this.snow.setScrollFactor(0).setDepth(9400);
    } else if (client.season !== 'jul' && this.snow) {
      this.snow.destroy();
      this.snow = null;
    }
  }

  // ------------------------------------------------------------------ actions

  private actFacing(): void {
    if (this.uiOpen) return;
    const me = myPlayer();
    if (!me) return;
    const f = facingTile(me);
    this.actAt(f.tx, f.ty, false);
  }

  /** Public: the touch action button. */
  act(): void {
    this.actFacing();
  }

  private actAt(tx: number, ty: number, fromPointer: boolean): void {
    const me = myPlayer();
    if (!me) return;
    const ptx = tileOf(me.x);
    const pty = tileOf(me.y);
    if (Math.abs(tx - ptx) > REACH || Math.abs(ty - pty) > REACH) {
      if (fromPointer) {
        // Turn towards the tapped tile instead
        const dx = tx - ptx;
        const dy = ty - pty;
        me.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        this.sendMove(true);
      }
      return;
    }
    if (tx !== ptx || ty !== pty) {
      const dx = tx - ptx;
      const dy = ty - pty;
      me.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    net.send({ t: 'act', tx, ty });
    this.bump(me.id);
  }

  private bump(id: string): void {
    const a = this.players.get(id);
    if (!a) return;
    this.tweens.add({ targets: a.sprite, scaleX: 1.15 * S, scaleY: 0.9 * S, duration: 70, yoyo: true });
  }

  private spawnFx(x: number, y: number, kind: string, from?: { x: number; y: number }): void {
    if (kind === 'rocket' && from) {
      const ang = Math.atan2(y - from.y, x - from.x);
      const img = this.add.image(from.x, from.y - 6, 'fx-rocket-0').setRotation(ang).setDepth(8000).setScale(S);
      const dist = Math.hypot(x - from.x, y - from.y);
      const duration = Math.min(420, 60 + dist * 2.2);
      const trail = this.time.addEvent({
        delay: 40,
        repeat: Math.floor(duration / 40),
        callback: () => {
          const s = this.add.image(img.x, img.y, `fx-smoke-${Math.random() < 0.5 ? 0 : 1}`).setDepth(7999).setAlpha(0.8).setScale(S);
          this.tweens.add({ targets: s, alpha: 0, scale: 2 * S, y: s.y - 4, duration: 450, onComplete: () => s.destroy() });
        },
      });
      this.tweens.add({ targets: img, x, y: y - 6, duration, onComplete: () => { trail.remove(); img.destroy(); } });
      return;
    }
    if (kind === 'boom') {
      const img = this.add.image(x, y - 4, 'fx-boom-0').setDepth(8001).setScale(0.5 * S);
      this.tweens.add({ targets: img, scale: 1.2 * S, duration: 120, onComplete: () => img.setTexture('fx-boom-1') });
      this.time.delayedCall(180, () => img.setTexture('fx-boom-2'));
      this.tweens.add({ targets: img, alpha: 0, scale: 1.6 * S, delay: 200, duration: 260, onComplete: () => img.destroy() });
      for (let i = 0; i < 6; i++) {
        const s = this.add.image(x + (Math.random() - 0.5) * 20, y - 4 + (Math.random() - 0.5) * 20, `fx-smoke-${i % 2}`).setDepth(8000).setAlpha(0.9).setScale(1.5 * S);
        this.tweens.add({ targets: s, alpha: 0, scale: 3 * S, y: s.y - 12, duration: 600 + i * 60, onComplete: () => s.destroy() });
      }
      this.cameras.main.shake(220, 0.012);
      return;
    }
    if (kind === 'lasso' && from) {
      // a rope loop flies out and snaps back
      const img = this.add.image(from.x, from.y - 8, 'fx-lasso-0').setDepth(8000).setScale(S);
      const rope = this.add.graphics().setDepth(7999);
      const draw = () => {
        rope.clear();
        rope.lineStyle(1.2, 0xc58f55, 1);
        rope.lineBetween(from.x, from.y - 6, img.x, img.y);
      };
      this.tweens.add({
        targets: img,
        x,
        y: y - 4,
        angle: 360,
        duration: Math.min(220, 60 + Math.hypot(x - from.x, y - from.y) * 2),
        yoyo: true,
        hold: 160,
        onUpdate: draw,
        onComplete: () => {
          rope.destroy();
          img.destroy();
        },
      });
      return;
    }
    if (kind === 'arrow' && from) {
      const ang = Math.atan2(y - from.y, x - from.x);
      const img = this.add.image(from.x, from.y - 6, 'fx-arrow-0').setRotation(ang).setDepth(8000).setScale(S);
      this.tweens.add({ targets: img, x, y: y - 6, duration: Math.min(260, Math.hypot(x - from.x, y - from.y) * 2.5), onComplete: () => img.destroy() });
      return;
    }
    const frames = getArt().fx[kind]?.length ?? 1;
    const n = kind === 'water' ? 3 : kind === 'chop' ? 4 : kind === 'sparkle' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const ox = n > 1 ? (Math.random() - 0.5) * 12 : 0;
      const img = this.add.image(x + ox, y - 4, `fx-${kind}-${i % frames}`).setDepth(8000).setScale(S);
      if (kind === 'hit') {
        img.setScale(0.6 * S);
        this.tweens.add({ targets: img, scale: 1.6 * S, alpha: 0, duration: 220, onComplete: () => img.destroy() });
        this.cameras.main.shake(80, 0.004);
      } else if (kind === 'poof') {
        img.setAlpha(0.9);
        this.tweens.add({ targets: img, scale: 1.8 * S, alpha: 0, duration: 350, onComplete: () => img.destroy() });
      } else if (kind === 'splash') {
        img.setPosition(x + ox, y + 2).setScale(0.6 * S);
        this.tweens.add({ targets: img, scale: 1.3 * S, y: y - 8, alpha: 0, duration: 380, onComplete: () => img.destroy() });
      } else if (kind === 'water' || kind === 'chop') {
        this.tweens.add({ targets: img, y: y + 6, x: img.x + (Math.random() - 0.5) * 10, alpha: 0, duration: 350 + i * 60, onComplete: () => img.destroy() });
      } else {
        this.tweens.add({ targets: img, y: y - 18 - i * 3, alpha: 0, duration: 700 + i * 100, delay: i * 80, onComplete: () => img.destroy() });
      }
    }
  }

  // ------------------------------------------------------------------ update

  private sendMove(force = false): void {
    const me = myPlayer();
    if (!me) return;
    const now = performance.now();
    if (!force && now - this.lastMoveSent < 50) return;
    this.lastMoveSent = now;
    net.send({ t: 'move', x: me.x, y: me.y, facing: me.facing, moving: me.moving });
  }

  override update(_time: number, delta: number): void {
    const world = this.world;
    const me = myPlayer();
    if (!world || !me) return;
    if (myArea() !== this.area) return; // a restart is on its way
    const dt = Math.min(delta, 100);

    // --- own movement (predicted) ---
    let dx = 0;
    let dy = 0;
    if (!this.uiOpen && !me.sleeping) {
      const k = this.keys;
      if (k.A!.isDown || k.LEFT!.isDown) dx -= 1;
      if (k.D!.isDown || k.RIGHT!.isDown) dx += 1;
      if (k.W!.isDown || k.UP!.isDown) dy -= 1;
      if (k.S!.isDown || k.DOWN!.isDown) dy += 1;
      if (dx === 0 && dy === 0) {
        dx = this.joystick.dx;
        dy = this.joystick.dy;
      }
    }
    const running = !this.uiOpen && (this.keys.SHIFT!.isDown || this.runHeld);
    const boost = me.boostUntil !== undefined && me.boostUntil > serverNow() ? BOOST_SPEED_MUL : 1;
    stepPlayer(world, me, dx, dy, dt, (me.riding !== undefined ? rideSpeedMul(world, me) : running ? 1.7 : 1) * boost);
    if (me.moving || this.wasMoving) this.sendMove(!me.moving && this.wasMoving);
    this.wasMoving = me.moving;

    // --- walking off the edge of the map into the next area ---
    if (this.area !== 'dungeon' && performance.now() - this.travelSentAt > 1500 && inEdgeGap(tileOf(me.x), tileOf(me.y))) {
      let dir: 'n' | 's' | 'e' | 'w' | null = null;
      if (dy < 0 && me.y <= PLAYER_HALF_H + 1) dir = 'n';
      else if (dy > 0 && me.y >= MAP_H * TILE - PLAYER_HALF_H - 1) dir = 's';
      else if (dx < 0 && me.x <= PLAYER_HALF_W + 1) dir = 'w';
      else if (dx > 0 && me.x >= MAP_W * TILE - PLAYER_HALF_W - 1) dir = 'e';
      if (dir) {
        this.travelSentAt = performance.now();
        this.sendMove(true);
        net.send({ t: 'travel', dir });
      }
    }

    // reconcile with the server if we drifted a lot
    const mySnap = client.snaps.players.get(me.id);
    if (mySnap && Math.hypot(mySnap.x - me.x, mySnap.y - me.y) > 40) {
      me.x = mySnap.x;
      me.y = mySnap.y;
    }

    // --- actors ---
    const lerp = 1 - Math.pow(0.001, dt / 1000);
    for (const [id, actor] of this.players) {
      const p = world.players[id];
      if (!p) continue;
      if (id === me.id) {
        actor.x = me.x;
        actor.y = me.y;
      } else {
        const snap = client.snaps.players.get(id);
        if (snap) {
          if (Math.hypot(snap.x - actor.x, snap.y - actor.y) > 64) {
            actor.x = snap.x;
            actor.y = snap.y;
          } else {
            actor.x += (snap.x - actor.x) * lerp;
            actor.y += (snap.y - actor.y) * lerp;
          }
        }
      }
      const ride = this.rideInfo(p);
      this.placeActor(actor, p.facing, p.moving, true, ride.lift);
      const swimming = this.bath && inPool(world, actor);
      this.updateSwim(actor, swimming);
      if (!swimming && ride.cropLegs) actor.sprite.setCrop(0, 0, CHAR_W * R, 16 * R);
      this.updateHeld(actor, p, swimming);
      this.updateBubble(actor, p);
    }
    for (const [id, actor] of this.animals) {
      const a = world.animals[id];
      const snap = client.snaps.animals.get(id);
      if (!a) continue;
      const rider = a.species === 'horse' || isVehicle(a) ? Object.values(world.players).find((p) => p.riding === id) : undefined;
      const riderActor = rider ? this.players.get(rider.id) : undefined;
      if (riderActor) {
        // glued under its rider (predicted for me, interpolated for others)
        actor.x = riderActor.x;
        actor.y = riderActor.y + 1;
        this.placeActor(actor, rider!.facing, rider!.moving, false);
        continue;
      }
      if (snap) {
        if (Math.hypot(snap.x - actor.x, snap.y - actor.y) > 48) {
          actor.x = snap.x;
          actor.y = snap.y;
        } else {
          actor.x += (snap.x - actor.x) * lerp;
          actor.y += (snap.y - actor.y) * lerp;
        }
      }
      this.placeActor(actor, a.facing, a.moving, false);
    }

    // --- camera ---
    const cam = this.cameras.main;
    const insideNow = this.area === 'farm' && inInterior(tileOf(me.x), tileOf(me.y));
    if (insideNow !== this.inside) {
      this.inside = insideNow;
      if (insideNow) bus.emit('toast', T.enteredHouse);
    }
    if (insideNow) cam.centerOn((INTERIOR.x + INTERIOR.w / 2) * TILE, (INTERIOR.y + INTERIOR.h / 2) * TILE);
    else cam.centerOn(Math.round(me.x), Math.round(me.y));

    // --- roofs: the one over the room I'm in fades away ---
    if (this.roofsDirty) this.rebuildRoofs(me);
    const myTile = tileOf(me.y) * MAP_W + tileOf(me.x);
    for (const r of this.roofs) {
      const target = r.tiles.has(myTile) ? 0 : 1;
      if (r.gfx.alpha !== target) r.gfx.setAlpha(Phaser.Math.Clamp(r.gfx.alpha + Math.sign(target - r.gfx.alpha) * (dt / 200), 0, 1));
    }

    // --- villagers follow the server's routine (interpolated) ---
    for (const [id, actor] of this.npcs) {
      const snap = client.snaps.npcs.get(id);
      if (snap) {
        if (Math.hypot(snap.x - actor.x, snap.y - actor.y) > 64) {
          actor.x = snap.x;
          actor.y = snap.y;
        } else {
          actor.x += (snap.x - actor.x) * lerp;
          actor.y += (snap.y - actor.y) * lerp;
        }
        this.placeActor(actor, snap.facing, snap.moving, true);
      } else this.placeActor(actor, 'down', false, true);
      this.updateNpcTalk(id, actor, me);
    }

    // --- cursor ---
    const target = !this.touch && this.hoverTile ? this.hoverTile : facingTile(me);
    const inReach = Math.abs(target.tx - tileOf(me.x)) <= REACH && Math.abs(target.ty - tileOf(me.y)) <= REACH;
    this.cursor.setPosition(target.tx * TILE, target.ty * TILE).setVisible(inReach && !this.uiOpen);

    // --- labels (DOM) ---
    const zoom = this.scale.zoom * cam.zoom;
    const sx = cam.worldView.x;
    const sy = cam.worldView.y;
    for (const actor of this.players.values()) this.placeLabel(actor.label, (actor.x - sx) * zoom, (actor.y - 24 - sy) * zoom);
    for (const actor of this.npcs.values()) this.placeLabel(actor.label, (actor.x - sx) * zoom, (actor.y - 24 - sy) * zoom);
    for (const [id, actor] of this.animals) {
      const a = world.animals[id];
      const onOwner = a?.owner && Math.hypot(a.x - me.x, a.y - me.y) < 14; // pet sitting at its owner's feet
      const hostile = a && (ANIMALS[a.species]?.mob || (ANIMALS[a.species]?.predator && !a.owner));
      const near = a && !onOwner && Math.hypot(a.x - me.x, a.y - me.y) < (hostile ? 140 : 40);
      actor.label.style.display = near ? '' : 'none';
      if (near) this.placeLabel(actor.label, (actor.x - sx) * zoom, (actor.y - 18 - sy) * zoom);
    }

    this.updateDoors();

    // --- weather, then night on top ---
    this.updateWeather(dt);
    this.drawNight();
  }

  /** Swimming: only the upper body shows above the water, with a ripple ring around it. */
  /** Draws the selected item in the player's hand (tools, weapons, food… everything). */
  private updateHeld(actor: Actor, p: PlayerState, swimming: boolean): void {
    const stack = heldItem(p);
    const driving = p.riding !== undefined && !!this.world.animals[p.riding] && isVehicle(this.world.animals[p.riding]!);
    const key = stack && !swimming && !p.sleeping && !driving ? `icon-${stack.item}` : null;
    if (!key || !this.textures.exists(key)) {
      actor.held?.setVisible(false);
      return;
    }
    if (!actor.held) actor.held = this.add.image(0, 0, key).setScale(0.55 * S);
    if (actor.heldKey !== key) {
      actor.held.setTexture(key);
      actor.heldKey = key;
    }
    const lift = this.rideInfo(p).lift;
    const f = p.facing;
    const bob = p.moving ? Math.round(Math.sin(this.time.now / 90)) : 0;
    const tool = ITEMS[stack!.item]?.category === 'tool';
    if (f === 'right' || f === 'left') {
      const s = f === 'right' ? 1 : -1;
      actor.held.setPosition(actor.x + s * 6, actor.y - 5 - lift + bob).setFlipX(f === 'left').setAngle(tool ? s * -25 : 0).setDepth(actor.y + 5);
    } else if (f === 'down') {
      actor.held.setPosition(actor.x + 5, actor.y - 3 - lift + bob).setFlipX(false).setAngle(tool ? 15 : 0).setDepth(actor.y + 5);
    } else {
      actor.held.setPosition(actor.x - 5, actor.y - 5 - lift + bob).setFlipX(true).setAngle(tool ? -15 : 0).setDepth(actor.y + 3);
    }
    actor.held.setVisible(true);
  }

  private updateSwim(actor: Actor, swimming: boolean): void {
    if (swimming) {
      actor.sprite.setCrop(0, 0, CHAR_W * R, 15 * R);
      actor.sprite.y += 7;
      actor.shadow.setVisible(false);
      if (!actor.ripple) actor.ripple = this.add.image(actor.x, actor.y, 'fx-ripple-0').setScale(S).setAlpha(0.9);
      actor.ripple.setPosition(Math.round(actor.x), Math.round(actor.y) + 3).setDepth(actor.y + 3).setTexture(`fx-ripple-${this.waterFrame}`);
    } else {
      if (actor.sprite.isCropped) actor.sprite.setCrop();
      if (actor.ripple) {
        actor.ripple.destroy();
        actor.ripple = undefined;
      }
    }
  }

  /** How a rider sits: on a horse or moped high up, in a car lower with the legs hidden. */
  private rideInfo(p: PlayerState): { lift: number; cropLegs: boolean } {
    if (p.riding === undefined) return { lift: 0, cropLegs: false };
    const a = this.world.animals[p.riding];
    if (a?.species === 'car') return { lift: 4, cropLegs: true };
    return { lift: 7, cropLegs: false };
  }

  private placeActor(actor: Actor, facing: PlayerState['facing'], moving: boolean, isPlayer: boolean, lift = 0): void {
    const { dir, flip } = dirOf(facing);
    const riding = lift > 0; // sitting on a horse, moped or in a car
    actor.sprite.setPosition(Math.round(actor.x), Math.round(actor.y) + 4 - lift);
    actor.shadow.setPosition(Math.round(actor.x), Math.round(actor.y) + 3);
    actor.shadow.setVisible(!riding);
    actor.sprite.setDepth(actor.y + 4 + (riding ? 2 : 0));
    if (isPlayer) {
      actor.sprite.setFlipX(flip);
      const anim = `${actor.texture}-walk-${dir}`;
      if (moving) {
        if (actor.sprite.anims.currentAnim?.key !== anim) actor.sprite.play(anim);
      } else {
        actor.sprite.stop();
        actor.sprite.setFrame(frameIndex(dir, 0));
      }
    } else {
      actor.sprite.setFlipX(facing === 'left');
      const anim = `${actor.texture}-walk`;
      if (moving) {
        if (actor.sprite.anims.currentAnim?.key !== anim || !actor.sprite.anims.isPlaying) actor.sprite.play(anim);
      } else {
        actor.sprite.stop();
        actor.sprite.setFrame(0);
      }
    }
  }

  private placeLabel(el: HTMLElement, x: number, y: number): void {
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  private talk = new Map<string, { partner: string | null; until: number; text: string; cooldownUntil: number }>();

  /** Speech bubbles: greet a player who comes close, chat with another villager, or show a quest marker. */
  private updateNpcTalk(id: string, actor: Actor, me: PlayerState): void {
    const now = performance.now();
    let st = this.talk.get(id);
    if (!st) {
      st = { partner: null, until: 0, text: '', cooldownUntil: 0 };
      this.talk.set(id, st);
    }
    const world = client.world!;
    // Who is close: the local player, or another villager?
    const near = Math.hypot(me.x - actor.x, me.y - actor.y) < 2.5 * TILE ? me.id : null;
    let npcNear: string | null = null;
    if (!near) {
      for (const [oid, other] of this.npcs) {
        if (oid === id) continue;
        if (Math.hypot(other.x - actor.x, other.y - actor.y) < 2.2 * TILE) npcNear = oid;
      }
    }
    const partner = near ?? npcNear;
    if (partner && partner !== st.partner && now > st.cooldownUntil) {
      // A new encounter: pick a line
      const lines = NPC_LINES[id];
      const f = client.timeMs / DAY_LENGTH_MS;
      let pool: string[] = [];
      if (near) pool = (f < 0.25 ? lines?.morning : f > 0.65 ? lines?.evening : lines?.day) ?? [];
      else pool = lines?.meet ?? [];
      if (pool.length) {
        st.text = pool[Math.floor(Math.random() * pool.length)]!.replace('{name}', me.name);
        st.until = now + 3500 + (npcNear ? Math.random() * 2000 : 0);
      }
      st.partner = partner;
      st.cooldownUntil = now + 8000;
    }
    if (!partner) st.partner = null;

    const quests = world.quests.filter((q) => q.npc === id && !me.questsDone.includes(q.id));
    const canHandIn = quests.some((q) => countItem(me.inventory, q.want.item) >= q.want.count);
    let text = '';
    let cls = 'bubble';
    if (now < st.until) text = st.text;
    else if (canHandIn) {
      text = '❗';
      cls = 'bubble marker';
    } else if (quests.length) {
      text = '?';
      cls = 'bubble marker';
    }
    if (text) {
      if (!actor.bubble) actor.bubble = this.makeLabel(text, cls);
      actor.bubble.className = `label ${cls}`;
      actor.bubble.textContent = text;
      const cam = this.cameras.main;
      const zoom = this.scale.zoom * cam.zoom;
      this.placeLabel(actor.bubble, (actor.x - cam.worldView.x) * zoom, (actor.y - 34 - cam.worldView.y) * zoom);
    } else if (actor.bubble) {
      actor.bubble.remove();
      actor.bubble = undefined;
    }
  }

  private updateBubble(actor: Actor, p: PlayerState): void {
    const glyph = p.sleeping ? EMOTE_GLYPH.sova! : p.emote && p.emote.until > serverNow() ? (EMOTE_GLYPH[p.emote.id] ?? p.emote.id) : null;
    if (p.emote?.id === 'vissla' && actor.whistled !== p.emote.until) {
      actor.whistled = p.emote.until;
      const me = myPlayer();
      if (me && Math.hypot(me.x - actor.x, me.y - actor.y) < 12 * TILE) SFX.whistle();
    }
    // a fresh chat line wins over an emote
    const chat = client.chatBubbles.get(p.id);
    const said = chat && chat.until > performance.now() ? chat.text : null;
    const text = said ?? glyph;
    if (!text) {
      actor.bubble?.remove();
      actor.bubble = undefined;
      return;
    }
    if (!actor.bubble) actor.bubble = this.makeLabel(text, 'bubble');
    actor.bubble.className = `label bubble ${said ? 'chat' : 'emote'}`;
    if (actor.bubble.textContent !== text) actor.bubble.textContent = text;
    const cam = this.cameras.main;
    const zoom = this.scale.zoom * cam.zoom;
    this.placeLabel(actor.bubble, (actor.x - cam.worldView.x) * zoom, (actor.y - 34 - cam.worldView.y) * zoom);
  }


  private makeGlowTexture(): string {
    const key = 'fx-glow';
    if (this.textures.exists(key)) return key;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.textures.addCanvas(key, c);
    return key;
  }

  private drawNight(): void {
    const under = isUnderground(this.area);
    const amount = under ? 0.82 : this.area === MOON_KEY ? 0.45 : nightAmount(client.timeMs);
    this.night.clear();
    if (NEW_ART && !under && this.area !== MOON_KEY && !this.inside && !this.bath) {
      const f = client.timeMs / DAY_LENGTH_MS;
      // golden morning light and a warm sunset that fades into the blue night
      if (f < 0.12) this.night.fill(0xffc070, 0.16 * (1 - f / 0.12));
      else if (f > 0.5 && f < 0.7) this.night.fill(0xffa040, 0.22 * Math.sin(((f - 0.5) / 0.2) * Math.PI));
    }
    const me = myPlayer();
    if (me?.sleeping) {
      // eyes closed: everything fades to black except a little glow around the bed
      this.night.fill(0x05040a, 0.92);
      const cam = this.cameras.main;
      this.night.erase(this.glow, me.x - cam.worldView.x - 32, me.y - cam.worldView.y - 32);
      return;
    }
    if (this.inside) {
      const cam = this.cameras.main;
      this.night.fill(0x000000, 1);
      this.night.erase(this.roomMask, (INTERIOR.x - 1) * TILE - cam.worldView.x, (INTERIOR.y - 1) * TILE - cam.worldView.y);
      return;
    }
    if (this.bath) {
      const cam = this.cameras.main;
      this.night.fill(0x000000, 1);
      this.night.erase(this.bathMask, BATH_ROOM.x * TILE - cam.worldView.x, (BATH_ROOM.y - 1) * TILE - cam.worldView.y);
      return;
    }
    if (amount <= 0.01) return;
    let color = under ? 0x05060c : this.area === MOON_KEY ? 0x0a0c22 : client.season === 'halloween' ? 0x1c0a30 : 0x0b1030;
    if (NEW_ART && !under && this.area !== MOON_KEY) {
      // dusk: the dark comes in warm (purple-red) and cools to blue as the night deepens
      const k = Math.min(1, Math.max(0, (client.timeMs / DAY_LENGTH_MS - 0.65) / 0.2));
      color = lerpColor(0x8a2a50, color, k);
    }
    this.night.fill(color, amount);
    const cam = this.cameras.main;
    const world = this.world;
    // torches and lit windows push the dark away
    for (const o of Object.values(world.objects)) {
      let r = 0;
      const def = objectDef(o.kind);
      if (def.light || o.kind === 'torch') r = 1;
      else if (o.kind === 'cave_wall' && o.variant === 1) r = 1.2;
      else if (o.kind === 'treasure') r = 1;
      else if (o.kind === 'loot_chest') r = 0.8;
      else if (o.kind === 'house') r = 1.6;
      else if (o.kind === 'pumpkin_lantern' || o.kind === 'xmas_tree' || o.kind === 'lights') r = 0.8;
      if (!r) continue;
      const x = (o.x + def.w / 2) * TILE - cam.worldView.x;
      const y = (o.y + def.h / 2) * TILE - cam.worldView.y;
      if (x < -40 || y < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
      this.night.erase(this.glow, x - 32 * r, y - 32 * r);
      void r;
    }
    for (const actor of this.players.values()) this.night.erase(this.glow, actor.x - cam.worldView.x - 20, actor.y - cam.worldView.y - 24);
  }
}

export const animalsOf = ANIMALS;
