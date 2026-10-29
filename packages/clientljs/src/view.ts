// The world view: the 2D game's scene (GameScene) redrawn with LittleJS. Same rules, prediction and interpolation,
// but drawn at screen resolution so things can lean, squash and turn smoothly, and lit by LittleJS's light system:
// the sun's shadows turn through the day, and at night lamps, torches, windows and everyone's lantern push back the
// dark.
import { keyIsDown, keyWasPressed, mainCanvasSize, setCameraPos, setCameraScale, vec2, drawRect, rgb, setAdditiveBlendMode } from 'littlejsengine';
import {
  ANIMALS,
  BATH_ROOM,
  BOOST_SPEED_MUL,
  countItem,
  CROPS,
  DAY_LENGTH_MS,
  DUNGEON_H,
  DUNGEON_W,
  facingTile,
  heldItem,
  inEdgeGap,
  INTERIOR,
  inInterior,
  inPool,
  isBaby,
  isBathKey,
  isUnderground,
  isVehicle,
  LOOT_REFILL_DAYS,
  MOON_KEY,
  ITEMS,
  localWeather,
  MAP_H,
  MAP_W,
  NPC_LINES,
  NPCS,
  objectDef,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  REACH,
  rideSpeedMul,
  stepPlayer,
  T,
  TILE,
  tileOf,
  WALL_KINDS,
  type AnimalState,
  type Change,
  type DropState,
  type Facing,
  type PlayerState,
  type WeatherKind,
  type WorldObject,
  type WorldState,
} from '@lilla-garden/shared';
import { ANIMAL_SIZE, ANIMAL_VARIANTS } from '@v1/art/animals.ts';
import { dirOf, frameIndex } from '@v1/art/characters.ts';
import { HD, NEW_ART } from '@v1/art/style.ts';
import { EMOTE_GLYPH, PAINT_COLORS } from '@v1/art/world.ts';
import { net } from '@v1/net.ts';
import { SFX } from '@v1/sound.ts';
import { activeWorld, bus, client, myArea, myPlayer, serverNow } from '@v1/state.ts';
import type { HudTarget } from '@v1/ui/hud.ts';
import { animalSprites, characterSprites, loadSprites, paintingSprite, type ObjectSprites, type Sprites } from './art.ts';
import type { Sprite } from './atlas.ts';
import { Effects } from './fx.ts';
import { alpha, clamp01, DrawQueue, drawSheared, drawSprite, easeOutBack, easeOutElastic, lerp, rgba, smooth, WHITE } from './gfx.ts';
import { Lamp, lampFor, LightPainter, setAmbient } from './lighting.ts';
import { Critters } from './critters.ts';
import { loadExtras, SNOWY, type Extras } from './extras.ts';
import { on, yearSeason, type YearSeason } from './features.ts';
import { Homes } from './homes.ts';
import { Nature, treeLook, type LeafyTree } from './nature.ts';
import { CozySounds } from './sounds.ts';
import { buildRoofs, releaseRoofs, type Roof } from './roofs.ts';
import type { Scene } from './scene.ts';
import { skyLight, type SkyLight } from './sky.ts';
import { Ground } from './terrain.ts';
import { Water } from './water.ts';
import { WeatherView } from './weather.ts';

export const VIEW_W = 320;
export const VIEW_H = 180;
const DEG = Math.PI / 180;
/** Width factor while turning around: squeezes through the middle without vanishing. */
const turnScale = (flip: number): number => (flip < 0 ? -1 : 1) * Math.max(0.3, Math.abs(flip));

/** Swaying in the wind: how far (radians) each kind of plant leans. */
const SWAY: Record<string, number> = {
  tree: 0.03,
  tree_pine: 0.022,
  tree_apple: 0.03,
  palm: 0.04,
  bush: 0.045,
  grass_tuft: 0.13,
  flower: 0.11,
  wild_flower_mid: 0.11,
  plant: 0.05,
  iceberry: 0.06,
  maypole: 0.01,
  scarecrow: 0.02,
  blueberry_bush: 0.04,
  cloudberry: 0.06,
  reed: 0.12,
  jungle_tree: 0.025,
  banana_plant: 0.05,
  jungle_flower: 0.08,
  fern: 0.09,
  dead_tree: 0.008,
  giant_mushroom: 0.008,
  giant_glowshroom: 0.008,
  lollipop_tree: 0.012,
};
/** Small things that cast no sun shadow. */
const FLAT_LOOKING = new Set(['grass_tuft', 'flower', 'wild_flower_mid', 'rock_small', 'mushroom', 'shell', 'rug', 'painting', 'clock', 'stump', 'ore', 'egg_basket', 'wild_pumpkin', 'iceberry', 'cloudberry', 'moon_rock', 'moon_cheese', 'gold_vein', 'gem_vein', 'fossil_rock', 'obsidian_rock', 'dragon_egg', 'wisp', 'loot_chest']);
/** How high animals hop as they walk (pixels). */
const HOP: Record<string, number> = { rabbit: 3, hare: 3.5, hen: 1.6, dog: 1.2, cat: 1, sheep: 0.9, goat: 1.2, pig: 0.8, fox: 1.4, deer: 1.6, lizard: 0.4, crab: 0.3, penguin: 1, slime: 2.5, wolf: 1.2, lynx: 1.2, boar: 0.8, frog: 3.5, parrot: 1, monkey: 1.8, salamander: 0.3, hedgehog: 0.4, dino: 1.2, gummy: 2.8, alien: 1.4, dragon: 1.6 };

interface ObjView {
  o: WorldObject;
  art: ObjectSprites | null;
  sprite: Sprite;
  frame: number;
  /** Picture's top-left in world pixels. */
  x: number;
  y: number;
  depth: number;
  flat: boolean;
  /** Casts a sun shadow / has a soft shadow on the ground under it. */
  cast: boolean;
  blob: boolean;
  sway: number;
  phase: number;
  /** Rustle when walked through: strength and time since. */
  rustle: number;
  /** When it appeared (seconds), for the pop-in; -1 for things that were already there. */
  born: number;
  lamp?: Lamp;
  /** Autumn: the colour of its leaves (they fall and lie around it). */
  leaf: [number, number, number] | null;
  /** Top of its chimney, where smoke rises; `ownChimney` if it is drawn on (the village houses have none). */
  chimney?: { x: number; y: number };
  ownChimney?: boolean;
}

interface CropView {
  x: number;
  y: number;
  crop: string;
  stage: number;
  sprite: Sprite | undefined;
  grew: number;
  phase: number;
  rustle: number;
}

interface DropView {
  d: DropState;
  icon: Sprite | undefined;
  born: number;
  phase: number;
}

interface Actor {
  kind: 'player' | 'npc' | 'animal';
  frames: Sprite[];
  key: string;
  x: number;
  y: number;
  label: HTMLDivElement;
  bubble?: HTMLDivElement;
  /** Seconds spent walking (step frames and bounce). */
  walk: number;
  /** Mirror shown now, eased between -1 and 1, so turning around is a quick flip. */
  flip: number;
  /** Squash-and-stretch spring: positive is wider and lower. */
  squash: number;
  squashV: number;
  wasMoving: boolean;
  held?: { s: Sprite; key: string } | null;
  /** Seconds left of a tool swing. */
  swing: number;
  whistled?: number;
  /** A lantern carried at night. */
  lamp?: Lamp;
  /** Seconds to the next puff of dust while running. */
  dust: number;
  seed: number;
  species?: string;
}

export class View implements HudTarget {
  joystick = { dx: 0, dy: 0 };
  runHeld = false;
  uiOpen = false;
  touch = false;

  private art!: Sprites;
  private world: WorldState | null = null;
  private area = 'farm';
  private cave = false;
  /** On the moon: no weather, a dim starry light, and everyone walks with a bounce. */
  private moon = false;
  private bath = false;
  private inside = false;
  private ground: Ground | null = null;
  private objects = new Map<number, ObjView>();
  private crops = new Map<string, CropView>();
  private drops = new Map<number, DropView>();
  private players = new Map<string, Actor>();
  private npcs = new Map<string, Actor>();
  private animals = new Map<number, Actor>();
  private doorOpen = new Map<number, boolean>();
  private roofs: Roof[] = [];
  private roofsDirty = true;
  private queue = new DrawQueue();
  private fx!: Effects;
  private weather!: WeatherView;
  private flashLamps: { lamp: Lamp; fl: { t: number; dur: number } }[] = [];
  private sky: SkyLight = skyLight(0, null, 'none');
  private outdoor: SkyLight = this.sky;
  /** How much lamps shine now (0 daylight … 1 night or underground). */
  private lampsOn = 0;
  private snowGround = false;
  private talk = new Map<string, { partner: string | null; until: number; text: string; cooldownUntil: number }>();
  private hoverTile: { tx: number; ty: number } | null = null;
  private lastMoveSent = 0;
  private wasMoving = false;
  private travelSentAt = 0;
  /** Camera centre (world pixels) and zoom (screen pixels per world pixel). */
  private camX = 0;
  private camY = 0;
  private zoom = 4;
  private snapCamera = true;
  /** Seconds since the view started, for animations. */
  private t = 0;
  private loading = false;
  private fireflies: { x: number; y: number; vx: number; vy: number; phase: number }[] = [];
  private extras!: Extras;
  private nature = new Nature();
  private critters = new Critters();
  private water = new Water();
  private homes = new Homes();
  private sounds = new CozySounds();
  private year: YearSeason = 'summer';
  /** The zoom in use (closer inside the farmhouse), and a fade from black after moving between places. */
  private z = 4;
  private fade = 0;
  private scene: Scene | null = null;

  /** The view lives as long as the page: it listens for good. */
  constructor(
    private labels: HTMLElement,
    gameEl: HTMLElement,
  ) {
    bus.on('change', (c) => this.onChange(c));
    bus.on('fx', (c) => {
      if ((c.area ?? 'farm') !== this.area || !this.world) return;
      this.fx.spawn(c.x, c.y, c.kind, c.from);
      // an explosion lights up everything around it for a moment
      if (c.kind === 'boom') this.flash(c.x, c.y, 5, [1, 0.6, 0.25], 0.45);
    });
    bus.on('season', () => this.applySeason());
    bus.on('state', () => this.onState());

    // clicks and taps on the world (the HUD sits above and keeps its own)
    gameEl.addEventListener('pointerdown', (e) => {
      if (this.uiOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const t = this.screenToTile(e.clientX, e.clientY);
      this.actAt(t.tx, t.ty, true);
    });
    gameEl.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.hoverTile = this.screenToTile(e.clientX, e.clientY);
    });
    gameEl.addEventListener('pointerleave', () => (this.hoverTile = null));
    gameEl.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Called once the engine is up. */
  init(): void {
    this.art = loadSprites();
    this.extras = loadExtras();
    new LightPainter(() => this.paintLight());
    this.fx = new Effects(this.art);
    this.weather = new WeatherView(this.art);
  }

  setZoom(z: number): void {
    this.zoom = z;
  }

  /** 0 bright day … 1 night (or indoors at night, or the cave). */
  darkness(): number {
    return this.cave ? 1 : this.moon ? 0.6 : smooth((this.sky.dark - 0.2) / 0.6);
  }

  // ------------------------------------------------------------------ loading a map

  /** (Re)builds everything for the map the local player is on. */
  load(): void {
    this.clear();
    const world = activeWorld();
    if (!world) return;
    this.loading = true;
    this.world = world;
    this.area = myArea();
    this.cave = isUnderground(this.area);
    this.moon = this.area === MOON_KEY;
    this.bath = isBathKey(this.area);
    this.inside = false;
    this.snowGround = this.wantSnowGround();
    this.year = yearSeason(client.season);
    if (on('indoors')) this.fade = 1;
    this.ground = new Ground(world, this.area === 'dungeon' ? 'dungeon' : this.cave ? 'cave' : 'out', this.art.terrain);
    this.ground.snowy = this.snowGround;
    this.ground.rebuild();
    for (const o of Object.values(world.objects)) this.putObject(o, false);
    for (const [k, c] of Object.entries(world.crops)) this.putCrop(k, c.stage, c.crop);
    for (const d of Object.values(world.drops)) this.putDrop(d);
    for (const a of Object.values(world.animals)) this.putAnimal(a);
    for (const p of Object.values(world.players)) if (p.online && (p.area ?? 'farm') === this.area) this.putPlayer(p);
    for (const npc of Object.values(NPCS).filter((n) => (n.area ?? 'farm') === this.area)) {
      const snap = client.snaps.npcs.get(npc.id);
      const x = snap?.x ?? npc.x * TILE + TILE / 2;
      const y = snap?.y ?? npc.y * TILE + TILE / 2;
      const frames = characterSprites(npc.appearance, npc.outfit);
      this.npcs.set(npc.id, this.newActor('npc', frames, npc.id, x, y, this.makeLabel(npc.name, 'npc')));
    }
    this.roofsDirty = true;
    this.snapCamera = true;
    this.weather.julSnow = client.season === 'jul' && this.area === 'farm';
    this.loading = false;
  }

  private clear(): void {
    for (const ov of this.objects.values()) ov.lamp?.destroy();
    for (const a of [...this.players.values(), ...this.npcs.values(), ...this.animals.values()]) a.lamp?.destroy();
    for (const f of this.flashLamps) f.lamp.destroy();
    this.flashLamps = [];
    this.objects.clear();
    this.crops.clear();
    this.drops.clear();
    this.players.clear();
    this.npcs.clear();
    this.animals.clear();
    this.doorOpen.clear();
    releaseRoofs(this.roofs);
    this.roofs = [];
    this.talk.clear();
    this.labels.innerHTML = '';
    this.fx?.clear();
    this.weather?.reset();
    this.fireflies = [];
    this.nature.clear();
    this.critters.clear();
    this.water.clear();
    this.homes.clear();
    this.scene = null;
    this.world = null;
  }

  // ------------------------------------------------------------------ objects

  /** Neighbour mask (1 up, 2 right, 4 down, 8 left) over tiles whose object passes `linked`. */
  private linkMask(x: number, y: number, linked: (kind: string) => boolean): number {
    const w = this.world!;
    const is = (tx: number, ty: number) => {
      const id = w.occupancy[`${tx},${ty}`];
      const k = id === undefined ? undefined : w.objects[id]?.kind;
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
  private refreshNeighbours(x: number, y: number): void {
    const w = this.world!;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const id = w.occupancy[`${x + dx},${y + dy}`];
      const o = id === undefined ? undefined : w.objects[id];
      if (o && (o.kind === 'fence' || o.kind === 'gate' || WALL_KINDS.has(o.kind))) this.putObject(o, false, false);
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

  private putObject(o: WorldObject, animate = true, refresh = true): void {
    const old = this.objects.get(o.id);
    const art = this.art.objects[o.kind] ?? null;
    const def = objectDef(o.kind);
    if (!art) {
      old?.lamp?.destroy();
      this.objects.delete(o.id);
      return;
    }
    let variant = (o.variant ?? 0) % art.frames.length;
    const isWall = WALL_KINDS.has(o.kind);
    if (o.kind === 'loot_chest') {
      // open (and empty) for you if you took this week's treasure; closed and glinting otherwise
      const last = o.openedBy?.[client.me];
      const emptied = last !== undefined && client.day - last < LOOT_REFILL_DAYS;
      variant = (((o.variant ?? 0) * 2 + (emptied ? 1 : 0)) % art.frames.length);
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
        this.doorOpen.set(o.id, open);
        variant = colour * 4 + vertical * 2 + (open ? 1 : 0);
      } else variant = colour * 16 + m;
    }
    if (refresh && (o.kind === 'fence' || o.kind === 'gate' || isWall)) this.refreshNeighbours(o.x, o.y);
    const painting = o.kind === 'painting' && o.data !== undefined;
    // trees through the year: autumn colours, snow on the branches, blossom
    const look = painting ? null : treeLook(o.kind, o.x, o.y, this.year, this.snowGround, this.extras);
    const frames = look?.frames ?? art.frames;
    const sprite = painting ? paintingSprite(o.data!) : (frames[variant] ?? frames[0]!);
    const x = painting ? o.x * TILE - 2 : o.x * TILE + art.ox;
    const y = painting ? o.y * TILE - 8 : o.y * TILE + art.oy;
    const tall = sprite.h >= 14 && !def.flat && !FLAT_LOOKING.has(o.kind);
    // a lamp, a torch, a lit house: keep its light when only its picture changes
    let lamp = old?.lamp;
    const spec = lampFor(o.kind, o.kind === 'loot_chest' ? variant : o.variant);
    if (lamp && (!spec || old?.o.kind !== o.kind)) {
      lamp.destroy();
      lamp = undefined;
    }
    // lamps and torches shine from their flame, a little above the middle of their tile
    const lx = o.x * TILE + (def.w * TILE) / 2;
    const ly = o.y * TILE + (def.h * TILE) / 2 - (o.kind.includes('lamp') || o.kind.includes('torch') ? 6 : 0);
    if (spec && !lamp) lamp = new Lamp(lx, ly, spec);
    else lamp?.moveTo(lx, ly);
    const chimney = on('smoke') ? (o.kind === 'house' ? { x: x + 62, y: y + 2 } : o.kind === 'house_small' ? { x: x + 34.5, y: y + 4 } : undefined) : undefined;
    const view: ObjView = {
      o,
      art: painting ? null : art,
      sprite,
      frame: variant,
      x,
      y,
      depth: def.flat ? 1 : (o.y + def.h) * TILE,
      flat: !!def.flat,
      cast: tall,
      blob: o.kind.startsWith('tree') || o.kind === 'palm' || o.kind === 'bush',
      sway: SWAY[o.kind] ?? 0,
      phase: (o.x * 0.7 + o.y * 1.3) % (Math.PI * 2),
      rustle: old?.rustle ?? 0,
      born: animate && !this.loading && !old ? this.t : (old?.born ?? -1),
      lamp,
      leaf: look?.leaf ?? null,
      chimney,
      ownChimney: o.kind === 'house_small',
    };
    this.objects.set(o.id, view);
  }

  private removeObject(id: number): void {
    const ov = this.objects.get(id);
    if (!ov) return;
    ov.lamp?.destroy();
    this.objects.delete(id);
    this.doorOpen.delete(id);
    if (!ov.flat) this.fx.vanish(ov.sprite, ov.x + ov.sprite.w / 2, ov.y + ov.sprite.h / 2, 1, ov.depth);
    this.refreshNeighbours(ov.o.x, ov.o.y);
  }

  private updateDoors(): void {
    for (const [id, open] of this.doorOpen) {
      const o = this.world!.objects[id];
      if (!o) {
        this.doorOpen.delete(id);
        continue;
      }
      if (this.doorIsOpen(o) !== open) this.putObject(o, false, false);
    }
  }

  private putCrop(k: string, stage: number, crop: string): void {
    const [xs, ys] = k.split(',');
    const x = Number(xs);
    const y = Number(ys);
    const n = CROPS[crop]?.stages.length ?? 0;
    const frame = Math.min(stage, n);
    const old = this.crops.get(k);
    this.crops.set(k, {
      x,
      y,
      crop,
      stage: frame,
      sprite: this.art.crops[crop]?.[frame],
      // growing a stage (or being planted) makes it pop
      grew: !this.loading && (!old || old.stage !== frame) ? this.t : (old?.grew ?? -1),
      phase: (x * 1.1 + y * 0.7) % (Math.PI * 2),
      rustle: old?.rustle ?? 0,
    });
  }

  private putDrop(d: DropState): void {
    this.drops.set(d.id, { d, icon: this.art.icons[d.item], born: this.loading ? -1 : this.t, phase: Math.random() * 6 });
  }

  private removeDrop(id: number): void {
    const dv = this.drops.get(id);
    if (!dv) return;
    this.drops.delete(id);
    if (!dv.icon) return;
    // picked up: it jumps to whoever is nearest
    let best: Actor | null = null;
    let bestD = 30;
    for (const a of this.players.values()) {
      const dist = Math.hypot(a.x - dv.d.x, a.y - dv.d.y);
      if (dist < bestD) {
        bestD = dist;
        best = a;
      }
    }
    if (best) {
      const to = best;
      this.fx.pickup(dv.icon, dv.d.x, dv.d.y, () => to);
    } else this.fx.vanish(dv.icon, dv.d.x, dv.d.y, 0.75, dv.d.y);
  }

  // ------------------------------------------------------------------ actors

  private newActor(kind: Actor['kind'], frames: Sprite[], key: string, x: number, y: number, label: HTMLDivElement, species?: string): Actor {
    return { kind, frames, key, x, y, label, walk: 0, flip: 1, squash: 0, squashV: 0, wasMoving: false, swing: 0, dust: 0, seed: Math.random() * 10, species };
  }

  private makeLabel(text: string, cls: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    el.textContent = text;
    this.labels.appendChild(el);
    return el;
  }

  private putPlayer(p: PlayerState): void {
    const frames = characterSprites(p.appearance, p.outfit);
    const key = frames[0] ? `${frames[0].u0},${frames[0].v0}` : '';
    let actor = this.players.get(p.id);
    if (!actor) {
      actor = this.newActor('player', frames, key, p.x, p.y, this.makeLabel(p.name, p.id === client.me ? 'me' : 'other'));
      // everyone carries a lantern after dark
      actor.lamp = new Lamp(p.x, p.y - 6, { color: [1, 0.82, 0.58], radius: p.id === client.me ? 4.4 : 3.4, strength: 0.85, flicker: 0.25 });
      this.players.set(p.id, actor);
    } else if (actor.key !== key) {
      actor.frames = frames;
      actor.key = key;
    }
    actor.label.textContent = p.name;
  }

  private removePlayer(id: string): void {
    const a = this.players.get(id);
    if (!a) return;
    a.lamp?.destroy();
    a.label.remove();
    a.bubble?.remove();
    this.players.delete(id);
  }

  private putAnimal(a: AnimalState): void {
    const variant = (a.variant ?? 0) % (ANIMAL_VARIANTS[a.species] ?? 1);
    const frames = animalSprites(a.species, isBaby(a), client.season === 'jul', variant);
    const key = `${a.species}-${isBaby(a)}-${client.season === 'jul'}-${variant}`;
    let actor = this.animals.get(a.id);
    if (!actor) {
      actor = this.newActor('animal', frames, key, a.x, a.y, this.makeLabel(a.name, 'animal'), a.species);
      if (isVehicle(a)) actor.lamp = new Lamp(a.x, a.y, { color: [1, 0.95, 0.8], radius: 3, strength: 0.7 }); // headlights
      this.animals.set(a.id, actor);
    } else if (actor.key !== key) {
      actor.frames = frames;
      actor.key = key;
    }
    const def = ANIMALS[a.species];
    const mob = def?.mob ?? (def?.predator && !a.owner ? { hp: def.predator.hp } : undefined);
    actor.label.textContent = mob ? `${a.name} ${'♥'.repeat(Math.max(0, a.hp ?? mob.hp))}` : `${a.name}${a.hasProduct ? ' ✨' : ''}${a.hearts > 0 ? ' ' + '♥'.repeat(a.hearts) : ''}`;
    actor.label.classList.toggle('mob', !!mob);
  }

  private removeAnimal(id: number): void {
    const a = this.animals.get(id);
    if (!a) return;
    a.lamp?.destroy();
    a.label.remove();
    this.animals.delete(id);
  }

  // ------------------------------------------------------------------ changes from the server

  private onChange(c: Change): void {
    const world = this.world;
    if (!world || c.t === 'areaData') return;
    const forArea = ('area' in c && c.area) || 'farm';
    if ((c.t === 'terrain' || c.t === 'crop' || c.t === 'object' || c.t === 'animal' || c.t === 'drop') && forArea !== this.area) return;
    switch (c.t) {
      case 'terrain':
        this.ground?.set(c.x, c.y);
        break;
      case 'crop':
        if (c.crop) this.putCrop(c.k, c.crop.stage, c.crop.crop);
        else this.crops.delete(c.k);
        break;
      case 'object':
        this.roofsDirty = true;
        if (c.obj) this.putObject(c.obj);
        else this.removeObject(c.id);
        break;
      case 'animal':
        if (c.animal) this.putAnimal(c.animal);
        else this.removeAnimal(c.id);
        break;
      case 'drop':
        if (c.drop) this.putDrop(c.drop);
        else this.removeDrop(c.id);
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
    const world = client.world;
    if (!world || !this.world) return;
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
    if (!w || !this.world || this.cave || this.bath || this.moon) return null;
    return localWeather(w.kind, this.world.biome);
  }

  private wantSnowGround(): boolean {
    if (client.season === 'jul') return true;
    return this.mapWeather() === 'snow' && serverNow() - (client.weather?.since ?? 0) > 25_000;
  }

  private applySeason(): void {
    if (!this.world || !this.ground) return;
    this.snowGround = this.wantSnowGround();
    this.ground.snowy = this.snowGround;
    this.ground.rebuild();
    for (const a of Object.values(this.world.animals)) this.putAnimal(a);
    this.weather.julSnow = client.season === 'jul' && this.area === 'farm';
  }

  // ------------------------------------------------------------------ acting

  private screenToTile(clientX: number, clientY: number): { tx: number; ty: number } {
    const offX = (innerWidth - mainCanvasSize.x) / 2;
    const offY = (innerHeight - mainCanvasSize.y) / 2;
    const px = this.camX + (clientX - offX - mainCanvasSize.x / 2) / this.z;
    const py = this.camY + (clientY - offY - mainCanvasSize.y / 2) / this.z;
    return { tx: tileOf(px), ty: tileOf(py) };
  }

  /** The touch action button. */
  act(): void {
    this.actFacing();
  }

  private actFacing(): void {
    if (this.uiOpen) return;
    const me = myPlayer();
    if (!me) return;
    const f = facingTile(me);
    this.actAt(f.tx, f.ty, false);
  }

  private actAt(tx: number, ty: number, fromPointer: boolean): void {
    const me = myPlayer();
    if (!me || !this.world) return;
    const ptx = tileOf(me.x);
    const pty = tileOf(me.y);
    if (Math.abs(tx - ptx) > REACH || Math.abs(ty - pty) > REACH) {
      if (fromPointer) {
        // turn towards the tapped tile instead
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
    const a = this.players.get(me.id);
    if (a) {
      a.squashV += 2.4; // a little bounce
      a.swing = 0.26;
    }
  }

  private sendMove(force = false): void {
    const me = myPlayer();
    if (!me) return;
    const now = performance.now();
    if (!force && now - this.lastMoveSent < 50) return;
    this.lastMoveSent = now;
    net.send({ t: 'move', x: me.x, y: me.y, facing: me.facing, moving: me.moving });
  }

  // ------------------------------------------------------------------ update (60 times a second)

  update(dt: number): void {
    this.t += dt;
    const world = this.world;
    const me = myPlayer();
    if (!world || !me || !this.ground) return;
    if (myArea() !== this.area) return; // a reload is on its way
    const dtMs = dt * 1000;

    // --- own movement (predicted) ---
    let dx = 0;
    let dy = 0;
    if (!this.uiOpen && !me.sleeping) {
      if (keyIsDown('ArrowLeft') || keyIsDown('KeyA')) dx -= 1;
      if (keyIsDown('ArrowRight') || keyIsDown('KeyD')) dx += 1;
      if (keyIsDown('ArrowUp') || keyIsDown('KeyW')) dy -= 1;
      if (keyIsDown('ArrowDown') || keyIsDown('KeyS')) dy += 1;
      if (dx === 0 && dy === 0) {
        dx = this.joystick.dx;
        dy = this.joystick.dy;
      }
      if (keyWasPressed('KeyE') || keyWasPressed('Space')) this.actFacing();
    }
    const running = !this.uiOpen && (keyIsDown('ShiftLeft') || keyIsDown('ShiftRight') || this.runHeld);
    const boost = me.boostUntil !== undefined && me.boostUntil > serverNow() ? BOOST_SPEED_MUL : 1;
    stepPlayer(world, me, dx, dy, dtMs, (me.riding !== undefined ? rideSpeedMul(world, me) : running ? 1.7 : 1) * boost);
    if (me.moving || this.wasMoving) this.sendMove(!me.moving && this.wasMoving);
    this.wasMoving = me.moving;

    // --- walking off the edge of the map into the next area ---
    if (!this.cave && performance.now() - this.travelSentAt > 1500 && inEdgeGap(tileOf(me.x), tileOf(me.y))) {
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
    const k = 1 - Math.pow(0.001, dt);
    const follow = (a: Actor, x: number, y: number, jump: number) => {
      if (Math.hypot(x - a.x, y - a.y) > jump) {
        a.x = x;
        a.y = y;
      } else {
        a.x += (x - a.x) * k;
        a.y += (y - a.y) * k;
      }
    };
    for (const [id, actor] of this.players) {
      const p = world.players[id];
      if (!p) continue;
      if (id === me.id) {
        actor.x = me.x;
        actor.y = me.y;
      } else {
        const snap = client.snaps.players.get(id);
        if (snap) follow(actor, snap.x, snap.y, 64);
      }
      this.animateActor(actor, p.facing, p.moving, dt, id === me.id && (running || boost > 1) && p.riding === undefined);
      if (p.sleeping) actor.squash = 0;
    }
    for (const [id, actor] of this.animals) {
      const a = world.animals[id];
      if (!a) continue;
      const rider = a.species === 'horse' || isVehicle(a) ? Object.values(world.players).find((p) => p.riding === id) : undefined;
      const riderActor = rider ? this.players.get(rider.id) : undefined;
      if (riderActor && rider) {
        // glued under its rider (predicted for me, interpolated for others)
        actor.x = riderActor.x;
        actor.y = riderActor.y + 1;
        this.animateActor(actor, rider.facing, rider.moving, dt, false);
        continue;
      }
      const snap = client.snaps.animals.get(id);
      if (snap) follow(actor, snap.x, snap.y, 48);
      this.animateActor(actor, a.facing, a.moving, dt, false);
    }
    for (const [id, actor] of this.npcs) {
      const snap = client.snaps.npcs.get(id);
      if (snap) {
        follow(actor, snap.x, snap.y, 64);
        this.animateActor(actor, snap.facing, snap.moving, dt, false);
      } else this.animateActor(actor, 'down', false, dt, false);
      this.updateNpcTalk(id, actor, me);
    }

    // --- plants rustle as someone walks through them ---
    for (const a of [...this.players.values(), ...this.animals.values(), ...this.npcs.values()]) {
      if (!a.wasMoving) continue;
      const key = `${tileOf(a.x)},${tileOf(a.y)}`;
      const id = world.occupancy[key];
      const ov = id === undefined ? undefined : this.objects.get(id);
      if (ov && ov.sway) ov.rustle = 1;
      const cv = this.crops.get(key);
      if (cv) cv.rustle = 1;
    }
    for (const ov of this.objects.values()) if (ov.rustle > 0) ov.rustle = Math.max(0, ov.rustle - dt * 1.6);
    for (const cv of this.crops.values()) if (cv.rustle > 0) cv.rustle = Math.max(0, cv.rustle - dt * 1.6);

    // --- inside the farmhouse? ---
    const insideNow = this.area === 'farm' && inInterior(tileOf(me.x), tileOf(me.y));
    if (insideNow !== this.inside) {
      this.inside = insideNow;
      this.snapCamera = true;
      if (on('indoors')) this.fade = 1;
      if (insideNow) bus.emit('toast', T.enteredHouse);
    }

    // --- roofs: the one over the room I'm in fades away ---
    const myTile = tileOf(me.y) * MAP_W + tileOf(me.x);
    if (this.roofsDirty) {
      this.roofsDirty = false;
      releaseRoofs(this.roofs);
      this.roofs = world.voxel || this.cave ? [] : buildRoofs(world, myTile);
    }
    for (const r of this.roofs) {
      const target = r.tiles.has(myTile) ? 0 : 1;
      r.alpha = clamp01(r.alpha + Math.sign(target - r.alpha) * dt * 5);
    }

    this.updateDoors();
    this.updateCamera(me, dt);
    this.updateWeather(dt);
    this.updateLight(me, dt);
    this.fx.update(dt);

    const sc = this.makeScene(world, dt);
    this.scene = sc;
    this.nature.update(sc, this.leafyTrees(sc));
    this.critters.update(sc, Object.values(world.objects));
    this.water.update(sc, this.mapWeather());
    this.homes.update(sc, this.chimneys(sc));
    this.sounds.update(sc, this.nearFire(me));
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt / 0.45);
  }

  /** What the cozy extras need to know this frame. */
  private makeScene(world: WorldState, dt: number): Scene {
    const [vx, vy, vw, vh] = this.viewRect();
    const movers: { x: number; y: number }[] = [];
    for (const a of this.players.values()) movers.push(a);
    for (const a of this.animals.values()) movers.push(a);
    for (const a of this.npcs.values()) movers.push(a);
    return {
      world,
      art: this.art,
      extras: this.extras,
      t: this.t,
      dt,
      day: (((client.timeMs / DAY_LENGTH_MS) % 1) + 1) % 1,
      sky: this.sky,
      outdoor: this.outdoor,
      lampsOn: this.lampsOn,
      weather: this.mapWeather(),
      year: this.year,
      snowGround: this.snowGround,
      vx,
      vy,
      vw,
      vh,
      where: this.cave ? 'cave' : this.inside ? 'inside' : this.bath ? 'bath' : this.moon ? 'space' : 'out',
      movers,
      water: this.ground?.water ?? [],
      nearLava: this.nearLava(),
    };
  }

  /** 0..1: how close the local player stands to lava (for its bubbling). */
  private nearLava(): number {
    const lava = this.ground?.lava;
    const me = this.world?.players[client.me];
    if (!lava?.length || !me) return 0;
    let best = Infinity;
    for (const [x, y] of lava) best = Math.min(best, Math.hypot((x + 0.5) * TILE - me.x, (y + 0.5) * TILE - me.y));
    return clamp01(1 - best / (7 * TILE));
  }

  /** The turned trees in and around the view, whose leaves fall. */
  private leafyTrees(sc: Scene): LeafyTree[] {
    const out: LeafyTree[] = [];
    for (const ov of this.objects.values()) {
      if (!ov.leaf) continue;
      const s = ov.sprite;
      if (ov.x + s.w < sc.vx - 30 || ov.x > sc.vx + sc.vw + 30 || ov.y + s.h < sc.vy - 30 || ov.y > sc.vy + sc.vh + 30) continue;
      out.push({ x: ov.x, y: ov.y, w: s.w, h: s.h, leaf: ov.leaf, tx: ov.o.x, ty: ov.o.y });
    }
    return out;
  }

  /** 0..1: how close the player stands to a burning torch or stove (for its crackle). */
  private nearFire(me: PlayerState): number {
    let best = 0;
    for (const ov of this.objects.values()) {
      const k = ov.o.kind;
      if (k !== 'torch' && k !== 'cave_torch' && k !== 'stove') continue;
      const d = Math.hypot(ov.o.x * TILE + TILE / 2 - me.x, ov.o.y * TILE + TILE / 2 - me.y);
      if (d < 96) best = Math.max(best, 1 - d / 96);
    }
    return best * this.lampsOn;
  }

  /** Chimneys in and just below the view (their smoke drifts up into it). */
  private chimneys(sc: Scene): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const ov of this.objects.values())
      if (ov.chimney && ov.chimney.x > sc.vx - 40 && ov.chimney.x < sc.vx + sc.vw + 40 && ov.chimney.y > sc.vy - 10 && ov.chimney.y < sc.vy + sc.vh + 80) out.push(ov.chimney);
    return out;
  }

  /** Walk cycle, turning, squash-and-stretch and dust for one actor. */
  private animateActor(a: Actor, facing: Facing, moving: boolean, dt: number, running: boolean): void {
    if (moving) a.walk += dt * (running ? 1.5 : 1);
    else a.walk = 0;
    // starting and stopping give a little bounce
    if (moving !== a.wasMoving) a.squashV += moving ? -1.2 : 1.5;
    a.wasMoving = moving;
    // spring back to rest
    a.squashV += (-a.squash * 260 - a.squashV * 16) * dt;
    a.squash += a.squashV * dt;
    // turning around: squeeze through the middle instead of snapping
    const target = (a.kind === 'animal' ? facing === 'left' : dirOf(facing).flip) ? -1 : 1;
    if (a.flip !== target) a.flip = target > a.flip ? Math.min(target, a.flip + dt * 12) : Math.max(target, a.flip - dt * 12);
    if (a.swing > 0) a.swing = Math.max(0, a.swing - dt);
    if (running && moving) {
      a.dust -= dt;
      if (a.dust <= 0) {
        a.dust = 0.16;
        this.fx.dust(a.x, a.y + 4, 1);
      }
    }
  }

  private updateCamera(me: PlayerState, dt: number): void {
    // what the camera may show: the map, the cave, or the bath house and a little around it
    let bx = 0;
    let by = 0;
    let bw = MAP_W * TILE;
    let bh = MAP_H * TILE;
    if (this.cave) {
      bw = (this.world?.cave?.w ?? DUNGEON_W) * TILE;
      bh = (this.world?.cave?.h ?? DUNGEON_H) * TILE;
    } else if (this.bath) {
      bx = (BATH_ROOM.x - 2) * TILE;
      by = (BATH_ROOM.y - 3) * TILE;
      bw = (BATH_ROOM.w + 4) * TILE;
      bh = (BATH_ROOM.h + 5) * TILE;
    }
    let tx = me.x;
    let ty = me.y;
    if (this.inside) {
      tx = (INTERIOR.x + INTERIOR.w / 2) * TILE;
      ty = (INTERIOR.y + INTERIOR.h / 2) * TILE;
    } else if (me.moving) {
      // look a little ahead of where you are going
      tx += me.facing === 'left' ? -10 : me.facing === 'right' ? 10 : 0;
      ty += me.facing === 'up' ? -7 : me.facing === 'down' ? 7 : 0;
    }
    // inside the farmhouse the camera comes closer, so the little room fills the screen
    let z = this.zoom;
    if (this.inside && on('indoors')) {
      const fit = Math.min(mainCanvasSize.x / ((INTERIOR.w + 2) * TILE), mainCanvasSize.y / ((INTERIOR.h + 2.5) * TILE));
      z = Math.max(z, Math.min(HD ? Math.floor(fit * 4) / 4 : Math.floor(fit), this.zoom * 2));
    }
    this.z = z;
    const vw = mainCanvasSize.x / z;
    const vh = mainCanvasSize.y / z;
    const clampTo = (v: number, lo: number, size: number, view: number) => (view >= size ? lo + size / 2 : Math.min(lo + size - view / 2, Math.max(lo + view / 2, v)));
    tx = clampTo(tx, bx, bw, vw);
    ty = clampTo(ty, by, bh, vh);
    if (this.snapCamera) {
      this.camX = tx;
      this.camY = ty;
      this.snapCamera = false;
    } else {
      const k = 1 - Math.pow(0.0005, dt);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }
    // whole screen pixels, so the pixel art stays crisp
    const cx = Math.round(this.camX * z) / z;
    const cy = Math.round(this.camY * z) / z;
    setCameraScale(TILE * z);
    setCameraPos(vec2(cx / TILE, -cy / TILE));
  }

  private updateWeather(dt: number): void {
    const kind = this.mapWeather();
    const w = client.weather;
    this.weather.setKind(this.inside ? null : kind, w?.prev, serverNow() - (w?.since ?? 0), this.t);
    const [vx, vy, vw, vh] = this.viewRect();
    this.weather.update(dt, vx, vy, vw, vh, this.t);
    const snowy = this.wantSnowGround();
    if (snowy !== this.snowGround && this.ground) {
      this.snowGround = snowy;
      this.ground.snowy = snowy;
      this.ground.rebuild();
      if (on('seasons')) for (const ov of [...this.objects.values()]) if (SNOWY.has(ov.o.kind)) this.putObject(ov.o, false, false);
    }
  }

  /** Sky colour, sun shadows, and every lamp's brightness for this frame. */
  private updateLight(me: PlayerState, dt: number): void {
    const kind = this.mapWeather();
    let sky = skyLight(client.timeMs, kind, client.season);
    this.outdoor = sky;
    let on = smooth((sky.dark - 0.12) / 0.5);
    if (this.cave) {
      sky = { ...sky, ambient: [0.2, 0.19, 0.27], dark: 1, shadowAlpha: 0, wind: 0 };
      on = 1;
    } else if (this.moon) {
      // the sun shines on the moon from a black sky: pale cool light, long crisp shadows, the crystals aglow
      sky = { ...sky, ambient: [0.74, 0.77, 0.9], dark: 0.55, shadowX: 0.9, shadowY: 0.35, shadowLen: 1.6, shadowAlpha: 0.5, golden: 0, wind: 0 };
      on = 0.85;
    } else if (this.inside || this.bath) {
      // indoors: daylight through the windows, cosy lamp light at night
      const d = sky.dark;
      sky = { ...sky, ambient: [lerp(1, 0.4, d), lerp(0.97, 0.34, d), lerp(0.92, 0.36, d)], shadowAlpha: 0, wind: 0 };
      on = smooth(d * 1.4);
    }
    if (me.sleeping) {
      // eyes closed: everything fades to dark except a little glow around the bed
      sky = { ...sky, ambient: [0.05, 0.045, 0.08], shadowAlpha: 0 };
      on = 1;
    }
    this.sky = sky;
    this.lampsOn += (on - this.lampsOn) * Math.min(1, dt * 2);
    const flash = this.weather.flash;
    const [r, g, b] = sky.ambient;
    setAmbient(Math.min(1, r + flash * 0.9), Math.min(1, g + flash * 0.95), Math.min(1, b + flash));

    // lamps (a lantern only outdoors after dark, or in the cave; the one in bed glows softly). Indoors, the haze of
    // lamps outside the room would show over the dark around it.
    const lit = this.lampsOn;
    const room = this.inside ? { x: INTERIOR.x - 1, y: INTERIOR.y - 1, w: INTERIOR.w + 2, h: INTERIOR.h + 2 } : this.bath ? { ...BATH_ROOM, y: BATH_ROOM.y - 1, h: BATH_ROOM.h + 1 } : null;
    const inRoom = (l: Lamp) => !room || (l.x >= room.x * TILE && l.x < (room.x + room.w) * TILE && l.y >= room.y * TILE && l.y < (room.y + room.h) * TILE);
    for (const ov of this.objects.values()) ov.lamp?.update(lit, this.t, inRoom(ov.lamp));
    for (const [id, a] of this.players) {
      if (!a.lamp) continue;
      const p = this.world!.players[id];
      const carried = (this.cave || this.moon ? 1 : this.inside || this.bath ? 0 : 1) * (p?.sleeping ? 0.6 : 1);
      a.lamp.level += (carried - a.lamp.level) * Math.min(1, dt * 3);
      a.lamp.moveTo(a.x, a.y - 6);
      a.lamp.update(lit, this.t);
    }
    for (const [id, a] of this.animals) {
      if (!a.lamp) continue;
      const an = this.world!.animals[id];
      // headlights shine where the car is going
      const f = an?.facing ?? 'right';
      a.lamp.moveTo(a.x + (f === 'left' ? -18 : f === 'right' ? 18 : 0), a.y + (f === 'up' ? -14 : f === 'down' ? 14 : 0));
      a.lamp.update(lit, this.t);
    }
    for (const f of this.flashLamps) {
      f.fl.t -= dt;
      f.lamp.level = clamp01(f.fl.t / f.fl.dur);
      f.lamp.update(1, this.t);
    }
    const gone = this.flashLamps.filter((f) => f.fl.t <= 0);
    for (const f of gone) f.lamp.destroy();
    if (gone.length) this.flashLamps = this.flashLamps.filter((f) => f.fl.t > 0);

    // fireflies on warm nights, outdoors
    const month = new Date().getMonth();
    const warm = month >= 4 && month <= 8;
    const want = !this.cave && !this.inside && !this.bath && kind !== 'rain' && kind !== 'storm' && kind !== 'snow' && (warm || client.season === 'midsommar') ? Math.round(14 * smooth((sky.dark - 0.5) / 0.3)) : 0;
    const [vx, vy, vw, vh] = this.viewRect();
    while (this.fireflies.length < want) this.fireflies.push({ x: vx + Math.random() * vw, y: vy + Math.random() * vh, vx: 0, vy: 0, phase: Math.random() * 10 });
    if (this.fireflies.length > want) this.fireflies.length = want;
    for (const f of this.fireflies) {
      f.vx += (Math.random() - 0.5) * 60 * dt - f.vx * dt;
      f.vy += (Math.random() - 0.5) * 60 * dt - f.vy * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < vx - 20 || f.x > vx + vw + 20 || f.y < vy - 20 || f.y > vy + vh + 20) {
        f.x = vx + Math.random() * vw;
        f.y = vy + Math.random() * vh;
      }
    }
  }

  /** A light that fades out over `dur` seconds (explosions). */
  private flash(x: number, y: number, radius: number, color: [number, number, number], dur: number): void {
    const lamp = new Lamp(x, y, { color, radius, strength: 1, always: true, glow: 3 });
    this.flashLamps.push({ lamp, fl: { t: dur, dur } });
  }

  /** Straight into the light map: at night the lit windows throw soft patches of light onto the ground in front. */
  private paintLight(): void {
    if (!this.world) return;
    const [vx, vy, vw, vh] = this.viewRect();
    // lava lights up its surroundings, day and night
    const lava = this.ground?.lava ?? [];
    if (lava.length && !this.inside) {
      const glow = this.art.glow;
      for (const [x, y] of lava) {
        const px = x * TILE + TILE / 2;
        const py = y * TILE + TILE / 2;
        if (px < vx - 40 || px > vx + vw + 40 || py < vy - 40 || py > vy + vh + 40) continue;
        const fl = 0.85 + 0.15 * Math.sin(this.t * 2.1 + x * 1.7 + y * 2.3);
        drawSprite(glow, px, py, TILE * 3, TILE * 3, 0, rgba(1, 0.42, 0.12, 0.32 * fl));
      }
    }
    if (!on('windows') || this.inside || this.bath || this.cave) return;
    const lit = this.lampsOn;
    if (lit < 0.02) return;
    const beam = this.extras.beam;
    for (const ov of this.objects.values()) {
      const panes = ov.art?.panes[ov.frame];
      if (!panes?.length) continue;
      const s = ov.sprite;
      if (ov.x + s.w < vx - 40 || ov.x > vx + vw + 40 || ov.y + s.h < vy - 40 || ov.y > vy + vh + 60) continue;
      const fl = 0.92 + 0.08 * Math.sin(this.t * 1.3 + ov.phase * 3);
      for (const p of panes) {
        // from the foot of the wall under the pane, fading out over the ground
        const len = 20 + p.w * 1.4;
        drawSprite(beam, ov.x + p.x + p.w / 2, ov.y + s.h - 2 + len / 2, p.w * 1.5 + 6, len, 0, rgba(1, 0.72, 0.4, 0.5 * lit * fl));
      }
    }
  }

  /** The visible part of the world in world pixels: x, y, width, height. */
  private viewRect(): [number, number, number, number] {
    const vw = mainCanvasSize.x / this.z;
    const vh = mainCanvasSize.y / this.z;
    return [this.camX - vw / 2, this.camY - vh / 2, vw, vh];
  }

  // ------------------------------------------------------------------ villagers' chatter and bubbles

  private talkOf(id: string) {
    let st = this.talk.get(id);
    if (!st) {
      st = { partner: null, until: 0, text: '', cooldownUntil: 0 };
      this.talk.set(id, st);
    }
    return st;
  }

  /** Speech bubbles: greet a player who comes close, chat with another villager, or show a quest marker. */
  private updateNpcTalk(id: string, actor: Actor, me: PlayerState): void {
    const now = performance.now();
    const st = this.talkOf(id);
    const world = client.world!;
    const near = Math.hypot(me.x - actor.x, me.y - actor.y) < 2.5 * TILE ? me.id : null;
    let npcNear: string | null = null;
    if (!near)
      for (const [oid, other] of this.npcs) {
        if (oid === id) continue;
        if (Math.hypot(other.x - actor.x, other.y - actor.y) < 2.2 * TILE) npcNear = oid;
      }
    const partner = near ?? npcNear;
    if (partner && partner !== st.partner && now > st.cooldownUntil) {
      const lines = NPC_LINES[id];
      const f = client.timeMs / DAY_LENGTH_MS;
      const pool = (near ? (f < 0.25 ? lines?.morning : f > 0.65 ? lines?.evening : lines?.day) : lines?.meet) ?? [];
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
  }

  // ------------------------------------------------------------------ drawing

  /** How a rider sits: on a horse or moped high up, in a car lower with the legs hidden. */
  private rideInfo(p: PlayerState): { lift: number; cropLegs: boolean } {
    if (p.riding === undefined) return { lift: 0, cropLegs: false };
    const a = this.world!.animals[p.riding];
    if (a?.species === 'car') return { lift: 4, cropLegs: true };
    return { lift: 7, cropLegs: false };
  }

  /**
   * A sun shadow from the foot line (bx, by): long and leaning in the morning and evening, short and behind at noon.
   * `len` scales its length; `depth` (pixels) is how far back the thing reaches, so even with the sun straight to
   * the side its shadow has some breadth.
   */
  private castShadow(s: Sprite, bx: number, by: number, w: number, h: number, len: number, depth: number, mirror = 1): void {
    const sky = this.sky;
    if (sky.shadowAlpha <= 0.01) return;
    const L = sky.shadowLen * len;
    drawSheared(s, bx, by, w * mirror, h, sky.shadowX * L, sky.shadowY * L - depth / h, rgba(0, 0, 0.06, sky.shadowAlpha));
  }

  /** Before LittleJS draws its objects: ground, shadows, then everything y-sorted, then the weather. */
  render(): void {
    const world = this.world;
    const me = myPlayer();
    if (!world || !me || !this.ground) return;
    const art = this.art;
    const t = this.t;
    const [vx, vy, vw, vh] = this.viewRect();
    const inView = (x: number, y: number, w: number, h: number) => x + w > vx - 8 && x < vx + vw + 8 && y + h > vy - 8 && y < vy + vh + 8;
    const waterFrame = Math.floor(t / 0.4) % 2;
    const wind = this.sky.wind;

    // --- ground ---
    this.ground.draw(Math.floor(vx / TILE) - 1, Math.floor(vy / TILE) - 1, Math.ceil((vx + vw) / TILE), Math.ceil((vy + vh) / TILE), waterFrame);
    const sc = this.scene;
    if (sc) {
      // lily pads, wet earth and puddles, fallen leaves; dew in the morning sun
      this.water.drawGround(sc);
      this.nature.drawGround(sc, this.leafyTrees(sc));
      setAdditiveBlendMode(true);
      this.nature.drawDew(sc);
      setAdditiveBlendMode(false);
    }
    // sunlight glinting on water (warm at golden hour)
    if (this.sky.shadowAlpha > 0.05 && !this.cave) {
      const sp = art.fx.sparkle?.[1];
      if (sp) {
        setAdditiveBlendMode(true);
        for (const [x, y] of this.ground.water) {
          const px = x * TILE;
          const py = y * TILE;
          if (!inView(px, py, TILE, TILE)) continue;
          const tw = Math.sin(t * 2.2 + x * 1.7 + y * 2.9);
          if (tw < 0.82) continue;
          const g = this.sky.golden;
          const a = ((tw - 0.82) / 0.18) * this.sky.shadowAlpha * 2.4;
          drawSprite(sp, px + ((x * 7 + y * 3) % 11) + 3, py + ((x * 5 + y * 11) % 9) + 4, 5, 5, 0, rgba(1, 1 - g * 0.15, 1 - g * 0.45, a));
        }
        setAdditiveBlendMode(false);
      }
    }

    // flat things lie on the ground under everything
    for (const ov of this.objects.values()) if (ov.flat && inView(ov.x, ov.y, ov.sprite.w, ov.sprite.h)) drawSprite(ov.sprite, ov.x + ov.sprite.w / 2, ov.y + ov.sprite.h / 2);

    // --- shadows: soft ones under trees and feet, and the sun's ---
    const blob = art.fx.shadowBig?.[0];
    const small = art.fx.shadow?.[0];
    for (const ov of this.objects.values()) {
      if (ov.flat || !inView(ov.x - 40, ov.y - 40, ov.sprite.w + 80, ov.sprite.h + 80)) continue;
      if (ov.blob && blob && (NEW_ART || HD)) drawSprite(blob, ov.o.x * TILE + TILE / 2, (ov.o.y + 1) * TILE - 2, blob.w, blob.h, 0, alpha(0.7));
      if (ov.cast) {
        const s = ov.sprite;
        const tree = ov.o.kind.startsWith('tree') || ov.o.kind === 'palm';
        this.castShadow(s, ov.x + s.w / 2, ov.y + s.h, s.w, s.h, tree ? 1 : 0.8, Math.min(s.w, s.h) * 0.4);
      }
    }
    if (small) {
      for (const [id, a] of this.players) {
        const p = world.players[id];
        if (!p || !inView(a.x - 30, a.y - 40, 60, 60)) continue;
        const swimming = this.bath && inPool(world, a);
        if (p.riding !== undefined || swimming) continue;
        drawSprite(small, a.x, a.y + 3, small.w, small.h, 0, alpha(0.6));
        const s = this.characterFrame(a, p.facing, p.moving);
        if (s) this.castShadow(s, a.x, a.y + 4, s.w, s.h, 0.85, 3, a.flip < 0 ? -1 : 1);
      }
      for (const [id, a] of this.npcs) {
        if (!inView(a.x - 30, a.y - 40, 60, 60)) continue;
        drawSprite(small, a.x, a.y + 3, small.w, small.h, 0, alpha(0.6));
        const snap = client.snaps.npcs.get(id);
        const s = this.characterFrame(a, snap?.facing ?? 'down', snap?.moving ?? false);
        if (s) this.castShadow(s, a.x, a.y + 4, s.w, s.h, 0.85, 3, a.flip < 0 ? -1 : 1);
      }
      for (const [id, a] of this.animals) {
        const an = world.animals[id];
        if (!an || !inView(a.x - 40, a.y - 40, 80, 60)) continue;
        const size = ANIMAL_SIZE[an.species] ?? { w: 16, h: 16 };
        const hop = this.hopOf(a);
        const k = 1 - hop / 8;
        drawSprite(small, a.x, a.y + 2, (size.w / 12) * small.w * k, small.h * k, 0, alpha(0.5 * k));
        const s = a.frames[a.wasMoving ? Math.floor(a.walk * 5) % 2 : 0];
        if (s) this.castShadow(s, a.x, a.y + 4 - hop, s.w, s.h, 0.75, s.h * 0.3, a.flip < 0 ? -1 : 1);
      }
    }

    // --- everything else, back to front ---
    const q = this.queue;
    for (const ov of this.objects.values()) {
      if (ov.flat) continue;
      const s = ov.sprite;
      if (!inView(ov.x, ov.y, s.w, s.h)) continue;
      let sprite = s;
      if (ov.art?.animated && ov.art.frames.length > 1) sprite = ov.art.frames[Math.floor(t / 0.4) % ov.art.frames.length] ?? s;
      const footX = ov.x + s.w / 2;
      const footY = ov.y + s.h;
      let angle = 0;
      if (ov.sway) {
        angle = ov.sway * wind * (Math.sin(t * 1.6 + ov.phase) * 0.65 + Math.sin(t * 2.9 + ov.phase * 1.7) * 0.35);
        if (ov.rustle > 0) angle += Math.sin(ov.rustle * 22) * ov.rustle * ov.sway * 2.2;
      }
      let sx = 1;
      let sy = 1;
      if (ov.born >= 0 && t - ov.born < 0.45) {
        const k = easeOutBack((t - ov.born) / 0.45);
        sx = 0.4 + 0.6 * k;
        sy = 0.4 + 0.6 * k;
      }
      const w = s.w * sx;
      const h = s.h * sy;
      const cx = footX + Math.sin(angle) * (h / 2);
      const cy = footY - Math.cos(angle) * (h / 2);
      q.push(ov.depth, sprite, cx, cy, w, h, angle);
    }
    for (const cv of this.crops.values()) {
      const s = cv.sprite;
      if (!s || !inView(cv.x * TILE, cv.y * TILE, s.w, s.h)) continue;
      let angle = 0.07 * wind * Math.sin(t * 1.9 + cv.phase);
      if (cv.rustle > 0) angle += Math.sin(cv.rustle * 22) * cv.rustle * 0.18;
      let sc = 1;
      if (cv.grew >= 0 && t - cv.grew < 0.6) sc = 0.55 + 0.45 * easeOutElastic((t - cv.grew) / 0.6);
      const footX = cv.x * TILE + s.w / 2;
      const footY = cv.y * TILE + s.h;
      const h = s.h * sc;
      q.push((cv.y + 1) * TILE - 2, s, footX + Math.sin(angle) * (h / 2), footY - Math.cos(angle) * (h / 2), s.w * sc, h, angle);
    }
    for (const dv of this.drops.values()) {
      if (!dv.icon) continue;
      const d = dv.d;
      if (!inView(d.x - 8, d.y - 12, 16, 20)) continue;
      const bob = 1.5 - 1.5 * Math.cos((t + dv.phase) * Math.PI * 1.6);
      let sc = 0.75;
      let lift = bob;
      if (dv.born >= 0 && t - dv.born < 0.5) {
        const k = (t - dv.born) / 0.5;
        sc = 0.75 * easeOutBack(Math.min(1, k * 1.6));
        lift += Math.sin(k * Math.PI) * 10; // tossed out in a little arc
      }
      if (small) q.push(d.y - 1, small, d.x, d.y + 4, small.w * 0.6, small.h * 0.6, 0, alpha(0.35));
      q.push(d.y, dv.icon, d.x, d.y - lift, dv.icon.w * sc, dv.icon.h * sc);
    }
    for (const [id, a] of this.players) {
      const p = world.players[id];
      if (!p || !inView(a.x - 20, a.y - 40, 40, 50)) continue;
      this.queueCharacter(a, p);
      this.updateBubble(a, p);
    }
    for (const [id, a] of this.npcs) {
      if (!inView(a.x - 20, a.y - 40, 40, 50)) continue;
      const snap = client.snaps.npcs.get(id);
      this.queueCharacterAt(a, snap?.facing ?? 'down', snap?.moving ?? false, 0, false, false);
    }
    for (const [id, a] of this.animals) {
      const an = world.animals[id];
      if (!an || !inView(a.x - 30, a.y - 40, 60, 50)) continue;
      const rider = an.species === 'horse' || isVehicle(an) ? Object.values(world.players).some((p) => p.riding === id) : false;
      const s = a.frames[a.wasMoving ? Math.floor(a.walk * 5) % 2 : 0];
      if (!s) continue;
      const hop = rider ? 0 : this.hopOf(a);
      const w = s.w * (1 + a.squash * 0.6) * turnScale(a.flip);
      const h = s.h * (1 - a.squash * 0.6);
      q.push(a.y + 4, s, a.x, a.y + 4 - hop - h / 2, w, h);
    }
    for (const r of this.roofs) if (r.alpha > 0.01 && inView(r.x, r.y, r.sprite.w, r.sprite.h)) q.push(r.depth, r.sprite, r.x + r.sprite.w / 2, r.y + r.sprite.h / 2, r.sprite.w, r.sprite.h, 0, alpha(r.alpha));
    // the cursor on the tile you would use
    const target = !this.touch && this.hoverTile ? this.hoverTile : facingTile(me);
    const inReach = Math.abs(target.tx - tileOf(me.x)) <= REACH && Math.abs(target.ty - tileOf(me.y)) <= REACH;
    const cursor = art.fx.cursor?.[0];
    if (cursor && inReach && !this.uiOpen) {
      const pulse = 1 + Math.sin(t * 5) * 0.04;
      q.push(9000, cursor, target.tx * TILE + TILE / 2, target.ty * TILE + TILE / 2, cursor.w * pulse, cursor.h * pulse, 0, alpha(0.85));
    }
    // the village houses get a chimney to smoke from
    if (on('smoke'))
      for (const ov of this.objects.values())
        if (ov.ownChimney && ov.chimney && inView(ov.x, ov.y, ov.sprite.w, ov.sprite.h)) q.push(ov.depth + 0.01, this.extras.chimney, ov.chimney.x, ov.chimney.y + 4);
    if (sc) this.critters.queue(sc, q);
    this.fx.draw(q);
    q.flush();
    this.fx.drawRopes();
    if (sc) {
      this.water.drawOver(sc);
      this.homes.drawOver(sc);
      this.nature.drawOver(sc);
    }

    // --- weather over everything (lit like the rest) ---
    this.weather.draw(vx, vy, vw, vh);
  }

  private hopOf(a: Actor): number {
    if (!a.wasMoving) return 0;
    const amp = HOP[a.species ?? ''] ?? 0;
    return Math.abs(Math.sin(a.walk * Math.PI * 4)) * amp;
  }

  private characterFrame(a: Actor, facing: Facing, moving: boolean): Sprite | undefined {
    const { dir } = dirOf(facing);
    const b = frameIndex(dir, 0);
    const seq = [b + 1, b, b + 2, b];
    return a.frames[moving ? seq[Math.floor(a.walk * 7) % 4]! : b];
  }

  private queueCharacter(a: Actor, p: PlayerState): void {
    const ride = this.rideInfo(p);
    const swimming = this.bath && inPool(this.world!, a);
    // on the moon everyone walks in slow, floaty bounces
    const lift = ride.lift + (this.moon && p.moving && p.riding === undefined ? Math.abs(Math.sin(a.walk * Math.PI * 1.4)) * 7 : 0);
    this.queueCharacterAt(a, p.facing, p.moving, lift, ride.cropLegs, swimming);
    this.queueHeld(a, p, swimming, lift);
    if (swimming) {
      const rip = this.art.fx.ripple?.[Math.floor(this.t / 0.4) % 2];
      if (rip) this.queue.push(a.y + 3, rip, a.x, a.y + 3, rip.w, rip.h, 0, alpha(0.9));
    }
  }

  /** A person: walk frames, the body rising as the legs pass, squash on actions, a quick squeeze when turning. */
  private queueCharacterAt(a: Actor, facing: Facing, moving: boolean, lift: number, cropLegs: boolean, swimming: boolean): void {
    const s = this.characterFrame(a, facing, moving);
    if (!s) return;
    const passing = moving && Math.floor(a.walk * 7) % 2 === 1;
    const bob = passing ? -1 : 0;
    const sq = a.squash;
    const w = s.w * (1 + sq) * turnScale(a.flip);
    const h = s.h * (1 - sq);
    const footY = a.y + 4 - lift + bob + (swimming ? 7 : 0);
    const part = swimming ? 15 / 24 : cropLegs ? 16 / 24 : 1;
    this.queue.push(a.y + 4 + (lift > 0 ? 2 : 0), s, a.x, footY - h / 2, w, h, 0, WHITE, 0, part);
  }

  /** The item in someone's hand (tools, weapons, food… everything), swung when used. */
  private queueHeld(a: Actor, p: PlayerState, swimming: boolean, lift: number): void {
    const stack = heldItem(p);
    const driving = p.riding !== undefined && !!this.world!.animals[p.riding] && isVehicle(this.world!.animals[p.riding]!);
    const icon = stack && !swimming && !p.sleeping && !driving ? this.art.icons[stack.item] : undefined;
    if (!icon) return;
    const f = p.facing;
    const bob = p.moving ? Math.round(Math.sin(this.t * 11)) : 0;
    const tool = ITEMS[stack!.item]?.category === 'tool';
    const swing = a.swing > 0 ? Math.sin((1 - a.swing / 0.26) * Math.PI) : 0;
    const w = icon.w * 0.55;
    const h = icon.h * 0.55;
    if (f === 'right' || f === 'left') {
      const s = f === 'right' ? 1 : -1;
      const ang = (tool ? s * -25 * DEG : 0) + s * swing * 1.4;
      this.queue.push(a.y + 5, icon, a.x + s * (6 + swing * 3), a.y - 5 - lift + bob + swing * 2, w * s, h, ang);
    } else if (f === 'down') {
      this.queue.push(a.y + 5, icon, a.x + 5, a.y - 3 - lift + bob + swing * 3, w, h, (tool ? 15 * DEG : 0) + swing * 1.2);
    } else {
      this.queue.push(a.y + 3, icon, a.x - 5, a.y - 5 - lift + bob - swing * 2, -w, h, (tool ? -15 * DEG : 0) - swing * 1.2);
    }
  }

  /** After LittleJS's objects, before the light map: black out what can't be seen from indoors. */
  renderPost(): void {
    if (!this.world) return;
    const black = rgb(0, 0, 0, 1);
    const hole = (x: number, y: number, w: number, h: number) => {
      // four black slabs around the room
      const [vx, vy, vw, vh] = this.viewRect();
      const L = vx - 64;
      const T0 = vy - 64;
      const Rr = vx + vw + 64;
      const B = vy + vh + 64;
      const rect = (x0: number, y0: number, x1: number, y1: number) => {
        if (x1 <= x0 || y1 <= y0) return;
        drawRect(vec2((x0 + x1) / 2 / TILE, -(y0 + y1) / 2 / TILE), vec2((x1 - x0) / TILE, (y1 - y0) / TILE), black);
      };
      rect(L, T0, Rr, y);
      rect(L, y + h, Rr, B);
      rect(L, y, x, y + h);
      rect(x + w, y, Rr, y + h);
    };
    if (this.inside) hole((INTERIOR.x - 1) * TILE, (INTERIOR.y - 1) * TILE, (INTERIOR.w + 2) * TILE, (INTERIOR.h + 2) * TILE);
    else if (this.bath) hole(BATH_ROOM.x * TILE, (BATH_ROOM.y - 1) * TILE, BATH_ROOM.w * TILE, (BATH_ROOM.h + 1) * TILE);
  }

  /** Over the lit scene: what shines by itself (lit windows, fireflies, lightning). */
  renderBright(): void {
    if (!this.world) return;
    const me = myPlayer();
    const [vx, vy, vw, vh] = this.viewRect();
    const night = smooth((this.sky.dark - 0.35) / 0.4);
    const outdoors = !this.inside && !this.bath && !me?.sleeping;
    if (outdoors && night > 0.01) {
      // windows lit from inside
      setAdditiveBlendMode(false);
      for (const ov of this.objects.values()) {
        const win = ov.art?.windows[ov.frame];
        if (!win) continue;
        if (ov.x + win.w < vx || ov.x > vx + vw || ov.y + win.h < vy || ov.y > vy + vh) continue;
        // a gentle flicker, as if someone walks past the lamp now and then
        const fl = 0.9 + 0.1 * Math.sin(this.t * 1.3 + ov.phase * 3);
        drawSprite(win, ov.x + win.w / 2, ov.y + win.h / 2, win.w, win.h, 0, rgba(1, 1, 1, night * fl));
        // and a warm haze around each pane
        if (on('windows')) {
          setAdditiveBlendMode(true);
          for (const p of ov.art?.panes[ov.frame] ?? []) {
            const size = Math.max(p.w, p.h) * 3.2;
            drawSprite(this.art.glow, ov.x + p.x + p.w / 2, ov.y + p.y + p.h / 2, size, size, 0, rgba(1, 0.7, 0.35, 0.32 * night * fl));
          }
          setAdditiveBlendMode(false);
        }
      }
      // fireflies
      setAdditiveBlendMode(true);
      for (const f of this.fireflies) {
        const blink = Math.max(0, Math.sin(this.t * 2.3 + f.phase * 7));
        if (blink <= 0) continue;
        drawSprite(this.art.glow, f.x, f.y, 7, 7, 0, rgba(0.75, 1, 0.35, blink * 0.8));
        drawSprite(this.art.glow, f.x, f.y, 2, 2, 0, rgba(1, 1, 0.8, blink));
      }
      setAdditiveBlendMode(false);
    }
    if (outdoors) this.weather.drawBright(vx, vy);
    const sc = this.scene;
    if (sc && !me?.sleeping) {
      setAdditiveBlendMode(true);
      this.water.drawBright(sc);
      this.homes.drawBright(sc);
      setAdditiveBlendMode(false);
    }
    // a soft fade from black after going in or out
    if (this.fade > 0) drawRect(vec2((vx + vw / 2) / TILE, -(vy + vh / 2) / TILE), vec2(vw / TILE + 2, vh / TILE + 2), rgb(0, 0, 0, smooth(this.fade)));
  }

  // ------------------------------------------------------------------ labels (DOM)

  /** Names and bubbles follow their owners on screen. Called after the camera moved. */
  placeLabels(): void {
    const world = this.world;
    const me = myPlayer();
    if (!world || !me) return;
    const z = this.z;
    const offX = (innerWidth - mainCanvasSize.x) / 2 + mainCanvasSize.x / 2;
    const offY = (innerHeight - mainCanvasSize.y) / 2 + mainCanvasSize.y / 2;
    const cx = Math.round(this.camX * z) / z;
    const cy = Math.round(this.camY * z) / z;
    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.transform = `translate(${Math.round((x - cx) * z + offX)}px, ${Math.round((y - cy) * z + offY)}px) translate(-50%, -100%)`;
    };
    for (const a of this.players.values()) {
      place(a.label, a.x, a.y - 24);
      if (a.bubble) place(a.bubble, a.x, a.y - 34);
    }
    for (const a of this.npcs.values()) {
      place(a.label, a.x, a.y - 24);
      if (a.bubble) place(a.bubble, a.x, a.y - 34);
    }
    for (const [id, a] of this.animals) {
      const an = world.animals[id];
      const onOwner = an?.owner && Math.hypot(an.x - me.x, an.y - me.y) < 14; // pet sitting at its owner's feet
      const hostile = an && (ANIMALS[an.species]?.mob || (ANIMALS[an.species]?.predator && !an.owner));
      const near = an && !onOwner && Math.hypot(an.x - me.x, an.y - me.y) < (hostile ? 140 : 40);
      a.label.style.display = near ? '' : 'none';
      if (near) place(a.label, a.x, a.y - 18);
    }
  }
}
