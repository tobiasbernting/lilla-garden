// The farm: tilemap, sprites, prediction, interpolation, night, effects.
import Phaser from 'phaser';
import {
  ANIMALS,
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
  RIDE_SPEED_MUL,
  tileOf,
  type AnimalState,
  type Change,
  type DropState,
  type PlayerState,
  type Terrain,
  type WorldObject,
} from '@lilla-garden/shared';
import { animalKey, ANIMAL_SIZE } from '../art/animals.js';
import { dirOf, frameIndex, type Dir } from '../art/characters.js';
import { characterTexture, getArt, registerTextures } from '../art/textures.js';
import { EMOTE_GLYPH } from '../art/world.js';
import { NEW_ART } from '../art/style.ts';
import { net } from '../net.js';
import { activeWorld, bus, client, myArea, myPlayer, serverNow } from '../state.js';

export const VIEW_W = 320;
export const VIEW_H = 180;

interface Actor {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  label: HTMLDivElement;
  bubble?: HTMLDivElement;
  texture: string;
  x: number;
  y: number;
}

export interface InputSource {
  /** -1..1 */
  dx: number;
  dy: number;
}

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
  private animals = new Map<number, Actor>();
  private cursor!: Phaser.GameObjects.Image;
  private night!: Phaser.GameObjects.RenderTexture;
  private glow!: string;
  private snow: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
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
    this.crops.clear();
    this.drops.clear();
    this.players.clear();
    this.animals.clear();
    this.npcs.clear();
    this.talk.clear();
    this.snow = null;
    this.hoverTile = null;
    this.area = myArea();
    this.world = activeWorld()!;
    const world = this.world;
    registerTextures(this.textures);
    this.labels = document.getElementById('labels')!;
    this.labels.innerHTML = '';
    const art = getArt();

    // --- terrain ---
    this.map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H });
    const tileset = this.map.addTilesetImage('terrain', 'terrain', TILE, TILE, 0, 0)!;
    this.layer = this.map.createBlankLayer('ground', tileset)!;
    this.layer.setDepth(0);
    this.rebuildTerrain();

    // --- objects, crops, drops ---
    for (const o of Object.values(world.objects)) this.putObject(o);
    for (const [k, c] of Object.entries(world.crops)) this.putCrop(k, c.stage, c.crop);
    for (const d of Object.values(world.drops)) this.putDrop(d);
    for (const a of Object.values(world.animals)) this.putAnimal(a);
    for (const p of Object.values(world.players)) if (p.online && (p.area ?? 'farm') === this.area) this.putPlayer(p);
    for (const npc of Object.values(NPCS).filter((n) => (n.area ?? 'farm') === this.area)) {
      const texture = characterTexture(this.textures, npc.appearance, npc.outfit);
      const snap = client.snaps.npcs.get(npc.id);
      const x = snap?.x ?? npc.x * TILE + TILE / 2;
      const y = snap?.y ?? npc.y * TILE + TILE / 2;
      const shadow = this.add.image(x, y + 2, 'fx-shadow-0').setDepth(2).setAlpha(0.6);
      const sprite = this.add.sprite(x, y + 4, texture, frameIndex('down', 0)).setOrigin(0.5, 1).setDepth(y + 4);
      this.npcs.set(npc.id, { sprite, shadow, label: this.makeLabel(npc.name, 'npc'), texture, x, y });
    }

    // --- cursor, night, snow ---
    this.cursor = this.add.image(0, 0, 'fx-cursor-0').setOrigin(0).setDepth(9000).setAlpha(0.9);
    this.glow = this.makeGlowTexture();
    this.night = this.add.renderTexture(0, 0, VIEW_W, VIEW_H).setOrigin(0).setScrollFactor(0).setDepth(9500);
    if (!this.textures.exists('fx-white')) {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      c.getContext('2d')!.fillStyle = '#fff';
      c.getContext('2d')!.fillRect(0, 0, 2, 2);
      this.textures.addCanvas('fx-white', c);
    }
    this.roomMask = this.make.image({ key: 'fx-white', add: false }).setOrigin(0).setDisplaySize((INTERIOR.w + 2) * TILE, (INTERIOR.h + 2) * TILE);
    this.inside = false;
    this.applySeason();

    // --- camera ---
    if (this.area === 'dungeon') this.cameras.main.setBounds(0, 0, DUNGEON_W * TILE, DUNGEON_H * TILE);
    else this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.setRoundPixels(true);
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
    const snowy = client.season === 'jul';
    if (!art.terrain.edges) return art.terrain.index(t, x, y, snowy, 0, t === 'water' ? frame : 0);
    if (t === 'water') return art.terrain.index(t, x, y, snowy, this.edgeMask(x, y, (n) => n === 'water' || n === undefined), frame);
    if (t === 'soil' || t === 'soil_wet') return art.terrain.index(t, x, y, snowy, this.edgeMask(x, y, (n) => n === 'soil' || n === 'soil_wet' || n === undefined));
    return art.terrain.index(t, x, y, snowy);
  }

  private rebuildTerrain(): void {
    const world = this.world;
    this.waterTiles = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        this.layer.putTileAt(this.tileIndexFor(x, y, this.waterFrame), x, y);
        if (this.area !== 'dungeon' && world.terrain[y * MAP_W + x] === 'water') this.waterTiles.push([x, y]);
      }
  }

  private setTerrain(x: number, y: number): void {
    const world = this.world;
    const t = world.terrain[y * MAP_W + x]!;
    this.layer.putTileAt(this.tileIndexFor(x, y, this.waterFrame), x, y);
    this.waterTiles = this.waterTiles.filter(([wx, wy]) => wx !== x || wy !== y);
    if (t === 'water') this.waterTiles.push([x, y]);
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

  // ------------------------------------------------------------------ sprites

  /** Neighbour mask for fences: 1 up, 2 right, 4 down, 8 left. */
  private fenceMask(x: number, y: number): number {
    const isFence = (tx: number, ty: number) => {
      const id = this.world.occupancy[`${tx},${ty}`];
      const k = id === undefined ? undefined : this.world.objects[id]?.kind;
      return k === 'fence' || k === 'gate';
    };
    return (isFence(x, y - 1) ? 1 : 0) | (isFence(x + 1, y) ? 2 : 0) | (isFence(x, y + 1) ? 4 : 0) | (isFence(x - 1, y) ? 8 : 0);
  }

  private refreshFenceNeighbours(x: number, y: number): void {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const id = this.world.occupancy[`${x + dx},${y + dy}`];
      const o = id === undefined ? undefined : this.world.objects[id];
      if (o && (o.kind === 'fence' || o.kind === 'gate')) this.putObject(o, false);
    }
  }

  private putObject(o: WorldObject, refresh = true): void {
    const art = getArt().objects[o.kind];
    const def = objectDef(o.kind);
    this.objects.get(o.id)?.destroy();
    if (!art) return;
    let variant = (o.variant ?? 0) % art.frames.length;
    if (o.kind === 'fence') variant = this.fenceMask(o.x, o.y);
    else if (o.kind === 'gate') {
      const m = this.fenceMask(o.x, o.y);
      variant = m & 5 && !(m & 10) ? 1 : 0;
    }
    if (refresh && (o.kind === 'fence' || o.kind === 'gate')) this.refreshFenceNeighbours(o.x, o.y);
    const img = this.add.image(o.x * TILE + art.ox, o.y * TILE + art.oy, `obj-${o.kind}-${variant}`).setOrigin(0);
    img.setDepth(def.flat ? 1 : (o.y + def.h) * TILE);
    this.objects.set(o.id, img);
    if (NEW_ART && (o.kind.startsWith('tree') || o.kind === 'palm' || o.kind === 'bush')) {
      this.objectShadows.get(o.id)?.destroy();
      const sh = this.add.image(o.x * TILE + TILE / 2, (o.y + 1) * TILE - 2, 'fx-shadowBig-0').setDepth(1.5).setAlpha(0.7);
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
      img = this.add.image(x * TILE, y * TILE, `crop-${crop}-${frame}`).setOrigin(0).setDepth((y + 1) * TILE - 2);
      this.crops.set(k, img);
    } else img.setTexture(`crop-${crop}-${frame}`);
  }

  private putDrop(d: DropState): void {
    this.drops.get(d.id)?.destroy();
    const img = this.add.image(d.x, d.y, `icon-${d.item}`).setScale(0.75).setDepth(d.y);
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
      const shadow = this.add.image(p.x, p.y + 2, 'fx-shadow-0').setDepth(2).setAlpha(0.6);
      const sprite = this.add.sprite(p.x, p.y + 4, texture, frameIndex('down', 0)).setOrigin(0.5, 1);
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
    a.label.remove();
    a.bubble?.remove();
    this.players.delete(id);
  }

  private putAnimal(a: AnimalState): void {
    const texture = animalKey(a.species, isBaby(a), client.season === 'jul');
    this.ensureAnimalAnims(texture);
    let actor = this.animals.get(a.id);
    if (!actor) {
      const size = ANIMAL_SIZE[a.species] ?? { w: 16, h: 16 };
      const shadow = this.add.image(a.x, a.y + 2, 'fx-shadow-0').setDepth(2).setAlpha(0.5).setScale(size.w / 12, 1);
      const sprite = this.add.sprite(a.x, a.y + 4, texture, 0).setOrigin(0.5, 1);
      actor = { sprite, shadow, label: this.makeLabel(a.name, 'animal'), texture, x: a.x, y: a.y };
      this.animals.set(a.id, actor);
    } else if (actor.texture !== texture) {
      actor.texture = texture;
      actor.sprite.setTexture(texture, 0);
    }
    const mob = ANIMALS[a.species]?.mob;
    actor.label.textContent = mob ? `${a.name} ${'♥'.repeat(Math.max(0, a.hp ?? mob.hp))}` : `${a.name}${a.hasProduct ? ' ✨' : ''}${a.hearts > 0 ? ' ' + '♥'.repeat(a.hearts) : ''}`;
    if (mob) actor.label.classList.add('mob');
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
        if (c.obj) this.putObject(c.obj);
        else {
          const gone = this.objects.get(c.id);
          gone?.destroy();
          this.objects.delete(c.id);
          this.objectShadows.get(c.id)?.destroy();
          this.objectShadows.delete(c.id);
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

  private applySeason(): void {
    this.rebuildTerrain();
    for (const a of Object.values(this.world.animals)) this.putAnimal(a);
    if (client.season === 'jul' && this.area === 'farm' && !this.snow) {
      this.snow = this.add.particles(0, 0, 'fx-snow-0', {
        x: { min: 0, max: VIEW_W },
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
    this.tweens.add({ targets: a.sprite, scaleX: 1.15, scaleY: 0.9, duration: 70, yoyo: true });
  }

  private spawnFx(x: number, y: number, kind: string, from?: { x: number; y: number }): void {
    if (kind === 'arrow' && from) {
      const ang = Math.atan2(y - from.y, x - from.x);
      const img = this.add.image(from.x, from.y - 6, 'fx-arrow-0').setRotation(ang).setDepth(8000);
      this.tweens.add({ targets: img, x, y: y - 6, duration: Math.min(260, Math.hypot(x - from.x, y - from.y) * 2.5), onComplete: () => img.destroy() });
      return;
    }
    const frames = getArt().fx[kind]?.length ?? 1;
    const n = kind === 'water' ? 3 : kind === 'chop' ? 4 : kind === 'sparkle' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const ox = n > 1 ? (Math.random() - 0.5) * 12 : 0;
      const img = this.add.image(x + ox, y - 4, `fx-${kind}-${i % frames}`).setDepth(8000);
      if (kind === 'hit') {
        img.setScale(0.6);
        this.tweens.add({ targets: img, scale: 1.6, alpha: 0, duration: 220, onComplete: () => img.destroy() });
        this.cameras.main.shake(80, 0.004);
      } else if (kind === 'poof') {
        img.setAlpha(0.9);
        this.tweens.add({ targets: img, scale: 1.8, alpha: 0, duration: 350, onComplete: () => img.destroy() });
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
    if (!this.uiOpen) {
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
    stepPlayer(world, me, dx, dy, dt, me.riding !== undefined ? RIDE_SPEED_MUL : running ? 1.7 : 1);
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
      this.placeActor(actor, p.facing, p.moving, true, p.riding !== undefined);
      this.updateBubble(actor, p);
    }
    for (const [id, actor] of this.animals) {
      const a = world.animals[id];
      const snap = client.snaps.animals.get(id);
      if (!a) continue;
      const rider = a.species === 'horse' ? Object.values(world.players).find((p) => p.riding === id) : undefined;
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
    const zoom = this.scale.zoom;
    const sx = cam.scrollX;
    const sy = cam.scrollY;
    for (const actor of this.players.values()) this.placeLabel(actor.label, (actor.x - sx) * zoom, (actor.y - 24 - sy) * zoom);
    for (const actor of this.npcs.values()) this.placeLabel(actor.label, (actor.x - sx) * zoom, (actor.y - 24 - sy) * zoom);
    for (const [id, actor] of this.animals) {
      const a = world.animals[id];
      const onOwner = a?.owner && Math.hypot(a.x - me.x, a.y - me.y) < 14; // pet sitting at its owner's feet
      const near = a && !onOwner && Math.hypot(a.x - me.x, a.y - me.y) < (ANIMALS[a.species]?.mob ? 140 : 40);
      actor.label.style.display = near ? '' : 'none';
      if (near) this.placeLabel(actor.label, (actor.x - sx) * zoom, (actor.y - 18 - sy) * zoom);
    }

    // --- night ---
    this.drawNight();
  }

  private placeActor(actor: Actor, facing: PlayerState['facing'], moving: boolean, isPlayer: boolean, riding = false): void {
    const { dir, flip } = dirOf(facing);
    const lift = riding ? 7 : 0; // sitting on the horse's back
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
      const zoom = this.scale.zoom;
      this.placeLabel(actor.bubble, (actor.x - cam.scrollX) * zoom, (actor.y - 34 - cam.scrollY) * zoom);
    } else if (actor.bubble) {
      actor.bubble.remove();
      actor.bubble = undefined;
    }
  }

  private updateBubble(actor: Actor, p: PlayerState): void {
    const active = p.emote && p.emote.until > serverNow();
    if (active && !actor.bubble) {
      actor.bubble = this.makeLabel(EMOTE_GLYPH[p.emote!.id] ?? p.emote!.id, 'bubble emote');
    } else if (!active && actor.bubble) {
      actor.bubble.remove();
      actor.bubble = undefined;
    }
    if (actor.bubble) {
      const cam = this.cameras.main;
      const zoom = this.scale.zoom;
      actor.bubble.textContent = EMOTE_GLYPH[p.emote!.id] ?? p.emote!.id;
      this.placeLabel(actor.bubble, (actor.x - cam.scrollX) * zoom, (actor.y - 34 - cam.scrollY) * zoom);
    }
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
    const amount = this.area === 'dungeon' ? 0.82 : nightAmount(client.timeMs);
    this.night.clear();
    if (NEW_ART && this.area !== 'dungeon' && !this.inside) {
      const f = client.timeMs / DAY_LENGTH_MS;
      // golden morning light and a warm sunset that fades into the blue night
      if (f < 0.12) this.night.fill(0xffc070, 0.16 * (1 - f / 0.12));
      else if (f > 0.5 && f < 0.7) this.night.fill(0xffa040, 0.22 * Math.sin(((f - 0.5) / 0.2) * Math.PI));
    }
    if (this.inside) {
      const cam = this.cameras.main;
      this.night.fill(0x000000, 1);
      this.night.erase(this.roomMask, (INTERIOR.x - 1) * TILE - cam.scrollX, (INTERIOR.y - 1) * TILE - cam.scrollY);
      return;
    }
    if (amount <= 0.01) return;
    let color = this.area === 'dungeon' ? 0x05060c : client.season === 'halloween' ? 0x1c0a30 : 0x0b1030;
    if (NEW_ART && this.area !== 'dungeon') {
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
      else if (o.kind === 'house') r = 1.6;
      else if (o.kind === 'pumpkin_lantern' || o.kind === 'xmas_tree' || o.kind === 'lights') r = 0.8;
      if (!r) continue;
      const x = (o.x + def.w / 2) * TILE - cam.scrollX;
      const y = (o.y + def.h / 2) * TILE - cam.scrollY;
      if (x < -40 || y < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
      this.night.erase(this.glow, x - 32 * r, y - 32 * r);
      void r;
    }
    for (const actor of this.players.values()) this.night.erase(this.glow, actor.x - cam.scrollX - 20, actor.y - cam.scrollY - 24);
  }
}

export const animalsOf = ANIMALS;
