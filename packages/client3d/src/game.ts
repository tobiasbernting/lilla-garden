// The 3D view: renders the shared world as blocks, runs the local player's movement (same prediction as the
// 2D client), interpolates everyone else, and turns looking/clicking into the same 'act' messages.
import * as THREE from 'three';
import {
  ANIMALS,
  BOOST_SPEED_MUL,
  countItem,
  DAY_LENGTH_MS,
  facingTile,
  heldItem,
  inEdgeGap,
  inInterior,
  inPool,
  isBaby,
  isBathKey,
  isVehicle,
  MAP_H,
  MAP_W,
  NPC_LINES,
  NPCS,
  objectDef,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  REACH,
  BODY_R,
  EYE_HEIGHT,
  DIG_REACH,
  ITEMS,
  PLAYER_SPEED,
  applyPortal,
  blockedByTiles,
  columnTop,
  standHeight,
  stepBody,
  rideSpeedMul,
  stepPlayer,
  type Fall,
  fmt,
  itemName,
  T,
  TILE,
  tileOf,
  type AnimalState,
  type Change,
  type DropState,
  type Facing,
  type PlayerState,
  type WorldObject,
  type WorldState,
} from '@lilla-garden/shared';
import { EMOTE_GLYPH } from '@v1/art/world.ts';
import { paintingPx } from '@v1/art/painting.ts';
import type { HudTarget } from '@v1/ui/hud.ts';
import { net } from '@v1/net.ts';
import { activeWorld, bus, client, myArea, myPlayer, serverNow } from '@v1/state.ts';
import { usefulness, type Use } from './assist.ts';
import { BLOCKS, atlas } from './blocks.ts';
import { GeoBuilder } from './builder.ts';
import { Fx } from './fx.ts';
import { itemMaterial, itemMesh } from './items.ts';
import { cloneMaterial, makeMaterial, setActorLight, shared } from './material.ts';
import { animalRig, animateRig, humanoid, lookKey, lookOf, type Rig } from './mobs.ts';
import { ModelLayer } from './modellayer.ts';
import { linkMask, type ModelCtx } from './models.ts';
import { Sky } from './sky.ts';
import { pixelTexture } from './sprites.ts';
import { WALL_H } from './structures.ts';
import { chunkOf, GROUND, Voxels, type AreaKind } from './voxels.ts';

const EYE = 1.62;
const GRAVITY = 28;
const LOOK_SPEED = 0.0025;
const TOUCH_LOOK = 0.006;

interface ActorView {
  rig: Rig;
  /** 2D position in pixels (interpolated). */
  x: number;
  y: number;
  yaw: number;
  walk: number;
  phase: number;
  label: HTMLDivElement;
  bubble?: HTMLDivElement;
  key: string;
  held?: { item: string; mesh: THREE.Object3D } | null;
  flash: number;
  /** Block worlds: interpolated feet height (world y) of other players. */
  z?: number;
}

interface Target {
  tx: number;
  ty: number;
  /** Highlight bounds (world). */
  box: THREE.Box3;
  /** What using the held item there would do (aim assist). */
  use?: Use;
  /** Picked by aim assist rather than under the crosshair: how far to the side (radians). */
  side?: number;
  /** Block worlds: a terrain block under the crosshair (cell x, y = tile row, h = layer) and the empty cell in front of the face. */
  cell?: { x: number; y: number; h: number };
  front?: { x: number; y: number; h: number };
  /** Block worlds: what using the held item does to that block. */
  block?: 'dig' | 'place';
}

/** Blocks bare hands (and tools other than the pickaxe) can dig. */
const SOFT = new Set(['grass', 'snowy_grass', 'dirt', 'farmland', 'farmland_wet', 'path', 'sand', 'gravel', 'snow']);

/** How far (radians) aim assist looks around the crosshair, and around a tapped point. */
const ASSIST_VIEW = 0.95;
const ASSIST_TAP = 0.5;
/** Holding the button repeats safe actions (breaking, hoeing, planting…): on the same tile this often, */
const REPEAT_MS = 320;
/** and as soon as a new tile comes into reach (walking along a row), at most this often. */
const REPEAT_NEW_MS = 110;
/** While held, assist only keeps going on things about this far (radians) to the side of straight ahead. */
const REPEAT_SIDE = 0.45;
const LS_INVERT = 'lilla-garden-3d.invertY';

const yawOf = (f: Facing): number => (f === 'down' ? 0 : f === 'up' ? Math.PI : f === 'right' ? Math.PI / 2 : -Math.PI / 2);
const angleLerp = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Minecraft's black block outline, with edges thick enough to see on any screen (WebGL lines are 1 px). */
class Outline {
  readonly group = new THREE.Group();
  private edges: THREE.Mesh[] = [];
  private last = '';

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 5;
      this.edges.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  show(box: THREE.Box3 | null): void {
    if (!box) {
      this.group.visible = false;
      this.last = '';
      return;
    }
    this.group.visible = true;
    const k = `${box.min.toArray()}|${box.max.toArray()}`;
    if (k === this.last) return;
    this.last = k;
    const t = 0.03;
    const lo = box.min.clone().subScalar(0.005);
    const hi = box.max.clone().addScalar(0.005);
    hi.y = Math.max(hi.y, lo.y + 0.02);
    const size = hi.clone().sub(lo);
    let i = 0;
    const edge = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = this.edges[i++]!;
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
    };
    for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) edge((lo.x + hi.x) / 2, y, z, size.x + t, t, t);
    for (const y of [lo.y, hi.y]) for (const x of [lo.x, hi.x]) edge(x, y, (lo.z + hi.z) / 2, t, t, size.z + t);
    for (const x of [lo.x, hi.x]) for (const z of [lo.z, hi.z]) edge(x, (lo.y + hi.y) / 2, z, t, size.y + t, t);
  }
}

export class World3D implements HudTarget {
  joystick = { dx: 0, dy: 0 };
  runHeld = false;
  uiOpen = false;
  touch = false;
  /** Mouse wheel / hotbar scrolling (wired by main). */
  onWheel: (dir: number) => void = () => {};
  /** Camera: 0 first person, 1 behind, 2 in front (F5 like Minecraft). */
  camMode = 0;
  /** Up/down look inverted (mouse and touch), remembered per device. */
  invertY = (() => {
    try {
      return localStorage.getItem(LS_INVERT) === '1';
    } catch {
      return false;
    }
  })();
  /** The use button (mouse, touch or controller) is held down. */
  private holding = false;
  private padActive = false;
  private nextUse = 0;
  private lastUse = { key: '', at: 0 };

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
  private vox = new Voxels();
  private models = new ModelLayer();
  private sky = new Sky();
  private fx = new Fx();
  private actorsGroup = new THREE.Group();
  private dynGroup = new THREE.Group();
  private highlight: Outline;
  private viewModel = new THREE.Group();
  private viewArm: THREE.Object3D | null = null;
  private viewItem: { item: string; mesh: THREE.Object3D } | null = null;
  private viewKey = '';
  private viewSwing = 0;

  private world!: WorldState;
  private area = 'farm';
  private kind: AreaKind = 'outdoor';
  private players = new Map<string, ActorView>();
  private animals = new Map<number, ActorView>();
  private npcs = new Map<string, ActorView>();
  private drops = new Map<number, THREE.Object3D>();
  private doors = new Map<number, { pivot: THREE.Group; root: THREE.Group; angle: number; mat: THREE.ShaderMaterial }>();
  private paintings = new Map<number, THREE.Mesh>();
  private labels: HTMLElement;
  private talk = new Map<string, { partner: string | null; until: number; text: string; cooldownUntil: number }>();

  yaw = 0;
  pitch = -0.2;
  /** Free camera position for debugging from the console (lillaGarden.view().debugEye = …). */
  debugEye: THREE.Vector3 | null = null;
  private jumpY = 0;
  /** Block worlds (3D game): real falling and jumping. */
  private fall: Fall = { vz: 0, onGround: true };
  private jumpQueued = false;
  private lastZSent: number | undefined;
  /** When we started disagreeing with the server about where we stand (0 = we agree). */
  private driftSince = 0;
  private jumpV = 0;
  private keys = new Set<string>();
  private lastMoveSent = 0;
  private lastFacingSent: Facing | null = null;
  private wasMoving = false;
  private travelSentAt = 0;
  private inside = false;
  private target: Target | null = null;
  private dirtyVox = false;
  private dirtyTerrain = false;
  /** Map columns whose ground changed (hoed, dug, built on): patched without rebuilding the whole map. */
  private dirtyColumns = new Map<string, [number, number]>();
  private dirtyModels = new Set<number>();
  private lastVoxBuild = 0;
  private time = 0;
  private unsub: (() => void)[] = [];
  private raycaster = new THREE.Raycaster();
  private sleepOverlay: HTMLDivElement;
  private lockHint: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private seasonKey = '';

  constructor(
    private container: HTMLElement,
    ui: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    THREE.ColorManagement.enabled = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(this.renderer.domElement);
    this.scene.add(this.vox.group, this.models.group, this.actorsGroup, this.dynGroup, this.fx.group, this.sky.group, this.camera);
    this.camera.rotation.order = 'YXZ';
    // Minecraft's black block outline
    this.highlight = new Outline();
    this.scene.add(this.highlight.group);
    this.camera.add(this.viewModel);
    this.labels = document.getElementById('labels')!;

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    ui.append(this.crosshair);
    this.sleepOverlay = document.createElement('div');
    this.sleepOverlay.className = 'sleep-overlay';
    container.append(this.sleepOverlay);
    this.lockHint = document.createElement('div');
    this.lockHint.className = 'lock-hint';
    this.lockHint.textContent = 'Klicka för att spela';
    container.append(this.lockHint);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setupInput();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ setup

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private get locked(): boolean {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private setupInput(): void {
    const el = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        this.jump();
      }
      if (e.code === 'F5' || e.code === 'KeyV') {
        e.preventDefault();
        this.cycleCamera();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.stopUse();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      if (this.uiOpen) return;
      e.preventDefault();
      this.onWheel(e.deltaY > 0 ? 1 : -1);
    });
    document.addEventListener('pointerlockchange', () => this.updateLockHint());
    // mouse: click to capture, then click to act
    el.addEventListener('mousedown', (e) => {
      if (this.touch || this.uiOpen) return;
      if (!this.locked) {
        void el.requestPointerLock?.();
        return;
      }
      if (e.button === 0 || e.button === 2) this.startUse();
      else if (e.button === 1) {
        e.preventDefault();
        this.pickBlock();
      }
    });
    document.addEventListener('mouseup', () => this.stopUse());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look(-e.movementX * LOOK_SPEED, -e.movementY * LOOK_SPEED);
    });
    // touch: drag to look, tap to act on what was tapped
    const touches = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean }>();
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      t.x = e.clientX;
      t.y = e.clientY;
      if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 10) t.moved = true;
      if (t.moved && !this.uiOpen) this.look(-dx * TOUCH_LOOK, -dy * TOUCH_LOOK);
    });
    const end = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      if (!t.moved && performance.now() - t.t < 350 && !this.uiOpen) {
        const r = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        const tgt = this.chooseTarget(this.raycaster.ray.clone(), ASSIST_TAP);
        if (tgt) {
          this.viewSwing = 1;
          this.actAt(tgt.tx, tgt.ty);
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private updateLockHint(): void {
    this.lockHint.style.display = !this.touch && !this.padActive && !this.locked && !this.uiOpen && this.world ? 'flex' : 'none';
  }

  /** Playing with a controller: no need to capture the mouse. */
  setPadActive(on: boolean): void {
    if (this.padActive === on) return;
    this.padActive = on;
    this.updateLockHint();
  }

  setUiOpen(open: boolean): void {
    this.uiOpen = open;
    if (open && this.locked) document.exitPointerLock();
    this.updateLockHint();
  }

  setInvertY(on: boolean): void {
    this.invertY = on;
    try {
      localStorage.setItem(LS_INVERT, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  look(dYaw: number, dPitch: number): void {
    if (this.invertY) dPitch = -dPitch;
    this.yaw += dYaw;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch + dPitch));
  }

  cycleCamera(): void {
    this.camMode = (this.camMode + 1) % 3;
  }

  jump(): void {
    if (this.uiOpen) return;
    if (this.world?.voxel) this.jumpQueued = true;
    else if (this.jumpY === 0) this.jumpV = 8.4;
  }

  /** HUD action button (pressed): what the crosshair points at, else the tile in front. */
  act(): void {
    this.startUse(true);
  }

  /** Press: use the held item now, and keep using it while held if that's safe (like Minecraft). */
  startUse(fallbackFacing = false): void {
    if (this.uiOpen) return;
    this.holding = true;
    this.actOnTarget(fallbackFacing);
    this.nextUse = performance.now() + REPEAT_MS + 120;
  }

  stopUse(): void {
    this.holding = false;
  }

  // ------------------------------------------------------------------ world (re)loading

  /** (Re)builds everything for the map the local player is on. */
  load(): void {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    for (const a of [...this.players.values(), ...this.animals.values(), ...this.npcs.values()]) this.disposeActor(a);
    this.players.clear();
    this.animals.clear();
    this.npcs.clear();
    for (const d of this.drops.values()) this.dynGroup.remove(d);
    this.drops.clear();
    for (const d of this.doors.values()) this.dynGroup.remove(d.root);
    this.doors.clear();
    for (const p of this.paintings.values()) this.dynGroup.remove(p);
    this.paintings.clear();
    this.talk.clear();
    this.fx.clear();
    this.labels.innerHTML = '';
    this.area = myArea();
    this.world = activeWorld()!;
    this.kind = this.area === 'dungeon' ? 'dungeon' : isBathKey(this.area) ? 'bath' : 'outdoor';
    this.vox.reset();
    this.models.clear();
    this.rebuildBlocks(true);
    const w = this.world;
    for (const o of Object.values(w.objects)) this.putDynamic(o);
    for (const d of Object.values(w.drops)) this.putDrop(d);
    for (const a of Object.values(w.animals)) this.putAnimal(a);
    for (const p of Object.values(w.players)) if (p.online && (p.area ?? 'farm') === this.area) this.putPlayer(p);
    for (const npc of Object.values(NPCS).filter((n) => (n.area ?? 'farm') === this.area)) {
      const rig = humanoid(npc.appearance, npc.outfit);
      const snap = client.snaps.npcs.get(npc.id);
      const v = this.makeActor(rig, snap?.x ?? npc.x * TILE + TILE / 2, snap?.y ?? npc.y * TILE + TILE / 2, npc.name, 'npc', `npc:${npc.id}`);
      this.npcs.set(npc.id, v);
    }
    const me = myPlayer();
    if (me) this.yaw = yawOf(me.facing) + Math.PI;
    this.sky.setSnow(client.season === 'jul' && this.kind === 'outdoor');
    this.seasonKey = client.season;
    this.unsub.push(bus.on('change', (c) => this.onChange(c)));
    this.unsub.push(bus.on('fx', (c) => {
      if ((c.area ?? 'farm') === this.area) this.spawnFx(c.x, c.y, c.kind, c.from);
    }));
    this.unsub.push(bus.on('state', () => this.onState()));
    this.unsub.push(bus.on('season', () => this.onSeason()));
    this.updateLockHint();
  }

  private modelCtx(): ModelCtx {
    const w = this.world;
    return {
      kindAt: (tx, ty) => {
        const id = w.occupancy[`${tx},${ty}`];
        return id === undefined ? undefined : w.objects[id]?.kind;
      },
      season: client.season,
    };
  }

  private rebuildBlocks(all = false): void {
    if (this.dirtyColumns.size && !all) {
      this.vox.patchColumns(this.world, this.kind, client.season, this.dirtyColumns.values());
      this.dirtyColumns.clear();
    } else this.vox.rebuild(this.world, this.kind, client.season, all || this.dirtyTerrain);
    this.dirtyColumns.clear();
    this.dirtyTerrain = false;
    const chunks = all ? null : new Set([...this.vox.lastDirty, ...this.dirtyModels]);
    this.models.rebuild(this.world, this.vox, this.modelCtx(), chunks);
    this.dirtyModels.clear();
    this.dirtyVox = false;
    this.lastVoxBuild = performance.now();
    // light changed: dynamic things pick it up
    for (const d of this.doors.values()) this.lightDynamic(d.mat, d.root.position);
  }

  private onSeason(): void {
    if (this.seasonKey === client.season) return;
    this.seasonKey = client.season;
    this.sky.setSnow(client.season === 'jul' && this.kind === 'outdoor');
    this.rebuildBlocks(true);
    for (const a of Object.values(this.world.animals)) this.putAnimal(a);
  }

  private markTile(x: number, y: number, neighbours = false): void {
    for (let dy = neighbours ? -1 : 0; dy <= (neighbours ? 1 : 0); dy++) for (let dx = neighbours ? -1 : 0; dx <= (neighbours ? 1 : 0); dx++) this.dirtyModels.add(chunkOf(x + dx, y + dy));
  }

  private onChange(c: Change): void {
    if (c.t === 'areaData') return;
    const forArea = ('area' in c && c.area) || 'farm';
    if ((c.t === 'terrain' || c.t === 'block' || c.t === 'crop' || c.t === 'object' || c.t === 'animal' || c.t === 'drop') && forArea !== this.area) return;
    switch (c.t) {
      case 'terrain':
      case 'block':
        this.dirtyColumns.set(`${c.x},${c.y}`, [c.x, c.y]);
        this.markTile(c.x, c.y, true);
        break;
      case 'crop': {
        const [xs, ys] = c.k.split(',');
        this.markTile(Number(xs), Number(ys));
        break;
      }
      case 'object': {
        const old = this.doors.get(c.id) ?? this.paintings.get(c.id);
        if (old) this.removeDynamic(c.id);
        if (c.obj) {
          this.putDynamic(c.obj);
          const d = objectDef(c.obj.kind);
          for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) this.markTile(c.obj.x + x, c.obj.y + y, true);
        }
        // removed objects: their chunk (we no longer know where it was, so the voxel diff finds it)
        this.dirtyVox = true;
        if (!c.obj) this.dirtyModels = new Set([...this.dirtyModels, ...this.allChunksWithModels()]);
        break;
      }
      case 'animal':
        if (c.animal) this.putAnimal(c.animal);
        else this.removeAnimal(c.id);
        break;
      case 'drop':
        if (c.drop) this.putDrop(c.drop);
        else {
          const m = this.drops.get(c.id);
          if (m) this.dynGroup.remove(m);
          this.drops.delete(c.id);
        }
        break;
      case 'player': {
        const p = c.player ?? this.world.players[c.id];
        if (!c.player || !p || !p.online || (p.area ?? 'farm') !== this.area) this.removePlayer(c.id);
        else this.putPlayer(this.world.players[c.id] ?? p);
        break;
      }
    }
  }

  /** A removed model could be in any chunk: rebuild them all (cheap enough, and rare). */
  private allChunksWithModels(): number[] {
    const out = new Set<number>();
    for (const o of Object.values(this.world.objects)) out.add(chunkOf(o.x, o.y));
    for (const k of Object.keys(this.world.crops)) {
      const [x, y] = k.split(',');
      out.add(chunkOf(Number(x), Number(y)));
    }
    // plus chunks that may now be empty
    for (let i = 0; i < 64; i++) out.add(i);
    return [...out];
  }

  private onState(): void {
    for (const [id, snap] of client.snaps.players) {
      const here = (snap.area ?? 'farm') === this.area;
      const p = client.world!.players[id];
      if (p && here && !this.players.has(id)) this.putPlayer(p);
      if (!here && this.players.has(id)) this.removePlayer(id);
    }
    for (const id of [...this.players.keys()]) if (!client.snaps.players.has(id)) this.removePlayer(id);
    for (const [id, snap] of client.snaps.animals) {
      const here = (snap.area ?? 'farm') === this.area;
      if (!here && this.animals.has(id)) this.removeAnimal(id);
    }
  }

  // ------------------------------------------------------------------ actors

  private makeLabel(text: string, cls: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    el.textContent = text;
    this.labels.appendChild(el);
    return el;
  }

  private makeActor(rig: Rig, x: number, y: number, name: string, cls: string, key: string): ActorView {
    this.actorsGroup.add(rig.root);
    rig.root.userData.actorKey = key;
    return { rig, x, y, yaw: 0, walk: 0, phase: Math.random() * 10, label: this.makeLabel(name, cls), key, flash: 0 };
  }

  private disposeActor(a: ActorView): void {
    this.actorsGroup.remove(a.rig.root);
    a.label.remove();
    a.bubble?.remove();
    for (const m of a.rig.materials) m.dispose();
  }

  private putPlayer(p: PlayerState): void {
    const look = lookKey(lookOf(p.appearance, p.outfit));
    let a = this.players.get(p.id);
    if (a && a.key !== look) {
      this.disposeActor(a);
      this.players.delete(p.id);
      a = undefined;
    }
    if (!a) {
      a = this.makeActor(humanoid(p.appearance, p.outfit), p.x, p.y, p.name, p.id === client.me ? 'me' : 'other', look);
      a.yaw = yawOf(p.facing);
      this.players.set(p.id, a);
      if (p.id === client.me) this.viewKey = '';
    }
    a.label.textContent = p.name;
  }

  private removePlayer(id: string): void {
    const a = this.players.get(id);
    if (!a) return;
    this.disposeActor(a);
    this.players.delete(id);
  }

  private animalKey(a: AnimalState): string {
    return `${a.species}:${a.variant ?? 0}:${isBaby(a) ? 1 : 0}:${client.season === 'jul' ? 1 : 0}`;
  }

  private putAnimal(a: AnimalState): void {
    const key = this.animalKey(a);
    let v = this.animals.get(a.id);
    if (v && v.key !== key) {
      this.disposeActor(v);
      this.animals.delete(a.id);
      v = undefined;
    }
    if (!v) {
      const rig = animalRig(a.species, a.variant ?? 0, isBaby(a), client.season === 'jul');
      if (a.species === 'bat') rig.root.userData.flying = true;
      v = this.makeActor(rig, a.x, a.y, a.name, 'animal', key);
      v.yaw = yawOf(a.facing);
      this.animals.set(a.id, v);
    }
    const def = ANIMALS[a.species];
    const mob = def?.mob ?? (def?.predator && !a.owner ? { hp: def.predator.hp } : undefined);
    v.label.textContent = mob ? `${a.name} ${'♥'.repeat(Math.max(0, a.hp ?? mob.hp))}` : `${a.name}${a.hasProduct ? ' ✨' : ''}${a.hearts > 0 ? ' ' + '♥'.repeat(a.hearts) : ''}`;
    v.label.classList.toggle('mob', !!mob);
  }

  private removeAnimal(id: number): void {
    const v = this.animals.get(id);
    if (!v) return;
    this.disposeActor(v);
    this.animals.delete(id);
  }

  // ------------------------------------------------------------------ dynamic objects

  private lightDynamic(m: THREE.ShaderMaterial, pos: THREE.Vector3): void {
    const [s, b] = this.vox.lightAtWorld(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
    setActorLight(m, s, b);
  }

  private putDynamic(o: WorldObject): void {
    if (o.kind === 'door' || o.kind === 'door_out') {
      const g = new GeoBuilder();
      g.box(0, 0, 6.5, 16, 16, 9.5, { all: 'planks_oak', south: 'door_oak_bottom', north: 'door_oak_bottom' });
      g.box(0, 16, 6.5, 16, 32, 9.5, { all: 'planks_oak', south: 'door_oak_top', north: 'door_oak_top' });
      g.box(12, 13, 9.5, 14, 15, 10.5, 'white', [0.2, 0.2, 0.2]);
      const mat = makeMaterial(atlas().texture, { actor: true });
      const pivot = new THREE.Group();
      pivot.add(new THREE.Mesh(g.build(), mat));
      const root = new THREE.Group();
      root.add(pivot);
      const ctx = this.modelCtx();
      const m = linkMask(ctx, o.x, o.y, (k) => k.startsWith('wall') || k === 'window' || k === 'door');
      const alongZ = !!(m & 5) && !(m & 10);
      root.position.set(o.x, this.vox.surfaceAt(o.x, o.y), o.y);
      if (alongZ) {
        // spans north-south: rotate about the tile centre
        pivot.position.set(0, 0, 0);
        root.rotation.y = Math.PI / 2;
        root.position.z += 1;
      }
      this.dynGroup.add(root);
      this.lightDynamic(mat, root.position);
      this.doors.set(o.id, { pivot, root, angle: 0, mat });
      return;
    }
    if (o.kind === 'painting' && o.data !== undefined) {
      const tex = pixelTexture(paintingPx(o.data).canvas);
      const mat = makeMaterial(tex, { actor: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.position.set(o.x + 0.5, this.vox.surfaceAt(o.x, o.y) + 1.5, o.y + 0.04);
      this.dynGroup.add(mesh);
      this.lightDynamic(mat, new THREE.Vector3(o.x, this.vox.surfaceAt(o.x, o.y), o.y));
      this.paintings.set(o.id, mesh);
    }
  }

  private removeDynamic(id: number): void {
    const d = this.doors.get(id);
    if (d) {
      this.dynGroup.remove(d.root);
      this.doors.delete(id);
    }
    const p = this.paintings.get(id);
    if (p) {
      this.dynGroup.remove(p);
      this.paintings.delete(id);
    }
  }

  private putDrop(d: DropState): void {
    const old = this.drops.get(d.id);
    if (old) this.dynGroup.remove(old);
    const mat = itemMaterial();
    const mesh = itemMesh(d.item, 0.4, mat);
    const g = new THREE.Group();
    if (mesh) g.add(mesh);
    g.position.set(d.x / TILE, this.vox.surfaceAt(tileOf(d.x), tileOf(d.y)) + 0.15, d.y / TILE);
    g.userData.mat = mat;
    g.userData.phase = Math.random() * 6;
    this.dynGroup.add(g);
    this.drops.set(d.id, g);
  }

  // ------------------------------------------------------------------ acting

  /** Where the player looks from: their eyes, also in third person (Minecraft casts from the eyes, not the camera). */
  private viewRay(): THREE.Ray {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const me = myPlayer();
    const v = me ? this.players.get(me.id) : undefined;
    const origin = v && this.camMode !== 0 ? v.rig.root.position.clone().add(new THREE.Vector3(0, EYE, 0)) : this.camera.position.clone();
    return new THREE.Ray(origin, dir);
  }

  /** Raycasts along a ray to the thing it hits within a few blocks. */
  private pick(ray: THREE.Ray): Target | null {
    const me = myPlayer();
    if (!me) return null;
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = 6;
    const dropSet = new Set(this.drops.values());
    const objs: THREE.Object3D[] = [...this.vox.group.children, ...this.models.group.children, ...this.dynGroup.children.filter((c) => !dropSet.has(c))];
    for (const a of [...this.animals.values(), ...this.npcs.values()]) objs.push(a.rig.root);
    for (const [id, a] of this.players) if (id !== client.me) objs.push(a.rig.root);
    const hits = this.raycaster.intersectObjects(objs, true);
    const hit = hits[0];
    if (!hit) return null;
    // an actor?
    let o: THREE.Object3D | null = hit.object;
    while (o && o.userData.actorKey === undefined) o = o.parent;
    if (o) {
      const pos = o.position;
      const tx = Math.floor(pos.x);
      const ty = Math.floor(pos.z);
      const box = new THREE.Box3().setFromObject(o);
      return { tx, ty, box };
    }
    const dir = this.raycaster.ray.direction;
    const p = hit.point.clone().addScaledVector(dir, 0.02);
    let tx = Math.floor(p.x);
    let ty = Math.floor(p.z);
    const owner = this.vox.ownerAtWorld(p.x, p.y, p.z);
    const obj = owner >= 0 ? this.world.objects[owner] : undefined;
    if (obj) {
      const def = objectDef(obj.kind);
      tx = Math.min(obj.x + def.w - 1, Math.max(obj.x, tx));
      ty = Math.min(obj.y + def.h - 1, Math.max(obj.y, ty));
    }
    const target: Target = { tx, ty, box: this.boundsOf(tx, ty) };
    // block worlds: a terrain block (not part of a tree or a house) can be dug or built against
    if (this.world.voxel && !obj && hit.object.userData.chunk && hit.face && tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
      const n = hit.face.normal;
      const h = Math.floor(p.y) + GROUND;
      target.cell = { x: tx, y: ty, h };
      const f = hit.point.clone().addScaledVector(n, 0.5);
      target.front = { x: Math.floor(f.x), y: Math.floor(f.z), h: Math.floor(f.y) + GROUND };
    }
    return target;
  }

  /** Outline around whatever stands on a tile. */
  private boundsOf(tx: number, ty: number): THREE.Box3 {
    const id = this.world.occupancy[`${tx},${ty}`];
    const o = id === undefined ? undefined : this.world.objects[id];
    const ground = this.vox.surfaceAt(tx, ty);
    if (o) {
      const def = objectDef(o.kind);
      // height: the object's own blocks in this column, else a block
      let h = 1;
      for (let y = 0; y < 16; y++) if (this.vox.ownerAtWorld(tx + 0.5, y + 0.5, ty + 0.5) === o.id) h = y + 1;
      if (o.kind.startsWith('wall') || o.kind === 'window' || o.kind === 'door' || o.kind === 'door_out') h = WALL_H;
      if (def.flat) h = 0.1;
      return new THREE.Box3(new THREE.Vector3(o.x, ground, o.y), new THREE.Vector3(o.x + def.w, ground + h, o.y + def.h));
    }
    const crop = this.world.crops[`${tx},${ty}`];
    return new THREE.Box3(new THREE.Vector3(tx, ground, ty), new THREE.Vector3(tx + 1, ground + (crop ? 0.6 : 0.01), ty + 1));
  }

  private inReach(tx: number, ty: number): boolean {
    const me = myPlayer();
    if (!me) return false;
    return Math.abs(tx - tileOf(me.x)) <= REACH && Math.abs(ty - tileOf(me.y)) <= REACH;
  }

  /** What stands on a tile right now (animals and villagers move, so use their drawn positions). */
  private whoAt(tx: number, ty: number): { animal?: boolean; hostile?: boolean; npc?: boolean; view?: ActorView } {
    for (const [id, v] of this.animals) {
      if (tileOf(v.x) !== tx || tileOf(v.y) !== ty) continue;
      const a = this.world.animals[id];
      if (!a || a.route !== undefined) continue;
      const def = ANIMALS[a.species];
      return { animal: true, hostile: !!(def?.mob || (def?.predator && !a.owner)), view: v };
    }
    for (const v of this.npcs.values()) if (tileOf(v.x) === tx && tileOf(v.y) === ty) return { npc: true, view: v };
    return {};
  }

  /**
   * Forgiving targeting: the exact thing under the ray if using the held item there does something;
   * otherwise the most useful tile within reach closest to where the player is looking.
   */
  private chooseTarget(ray: THREE.Ray, assist: number): Target | null {
    const me = myPlayer();
    if (!me) return null;
    const ptx = tileOf(me.x);
    const pty = tileOf(me.y);
    const hit = this.pick(ray);
    const blockTarget = hit?.cell ? this.blockUse(me, hit) : null;
    const direct = hit && this.inReach(hit.tx, hit.ty) ? hit : null;
    // the side of a cliff, a tunnel wall: blocks only (the tile's ground is somewhere else)
    const surface = !hit?.cell || hit.cell.h === columnTop(this.world, hit.cell.x, hit.cell.y) - 1;
    if (direct && surface) {
      direct.use = usefulness(this.world, me, direct.tx, direct.ty, this.whoAt(direct.tx, direct.ty), direct.tx === ptx && direct.ty === pty);
      if (this.world.voxel && me.z !== undefined && Math.abs(columnTop(this.world, direct.tx, direct.ty) - me.z) > 2.5) direct.use = { score: 0, repeat: false };
      if (direct.use.score > 0) return direct;
    }
    // the pickaxe and building blocks go for the block you point at; anything else tries aim assist first
    const held = heldItem(me);
    const blockFirst = !!held && (ITEMS[held.item]?.tool === 'pick' || !!ITEMS[held.item]?.block);
    if (blockTarget && blockFirst) return blockTarget;
    let best: Target | null = null;
    let bestScore = Infinity;
    const to = new THREE.Vector3();
    // compass direction of the ray, same convention as this.yaw (0 = north, -z)
    const viewYaw = Math.atan2(-ray.direction.x, -ray.direction.z);
    for (let dy = -REACH; dy <= REACH; dy++)
      for (let dx = -REACH; dx <= REACH; dx++) {
        const tx = ptx + dx;
        const ty = pty + dy;
        const who = this.whoAt(tx, ty);
        const use = usefulness(this.world, me, tx, ty, who, dx === 0 && dy === 0);
        if (use.score <= 0) continue;
        // block worlds: ground far above or below you (a cliff, from a tunnel) is out of reach
        if (this.world.voxel && me.z !== undefined && Math.abs(columnTop(this.world, tx, ty) - me.z) > 2.5) continue;
        const box = who.view ? new THREE.Box3().setFromObject(who.view.rig.root) : this.boundsOf(tx, ty);
        box.getCenter(to).sub(ray.origin);
        const angle = to.angleTo(ray.direction);
        if (angle > assist) continue;
        // Closest to the crosshair wins, but sideways counts more than up/down: walking forward looking
        // down means "the tile in front of me", not the one diagonally ahead that happens to be nearer
        // the crosshair. Your own tile has no direction, so it only wins when nothing else fits.
        const tileYaw = Math.atan2(-(tx + 0.5 - me.x / TILE), -(ty + 0.5 - me.y / TILE));
        const turn = tileYaw - viewYaw;
        const side = dx === 0 && dy === 0 ? 0.6 : Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
        // clearer intent (an animal, a tree for the axe) gets a little pull
        const score = angle * 0.5 + side - use.score * 0.06;
        if (score < bestScore) {
          bestScore = score;
          best = { tx, ty, box, use, side };
        }
      }
    return best ?? blockTarget ?? direct;
  }

  /** Block worlds: dig the pointed-at block (pickaxe: anything; otherwise soft ground) or build against it. */
  private blockUse(me: PlayerState, t: Target): Target | null {
    const c = t.cell!;
    const eye = new THREE.Vector3(me.x / TILE, (me.z ?? GROUND) - GROUND + EYE_HEIGHT, me.y / TILE);
    if (eye.distanceTo(new THREE.Vector3(c.x + 0.5, c.h - GROUND + 0.5, c.y + 0.5)) > DIG_REACH) return null;
    const held = heldItem(me);
    const def = held ? ITEMS[held.item] : undefined;
    const box = new THREE.Box3(new THREE.Vector3(c.x, c.h - GROUND, c.y), new THREE.Vector3(c.x + 1, c.h - GROUND + 1, c.y + 1));
    if (def?.block) {
      const f = t.front!;
      if (f.x < 0 || f.y < 0 || f.x >= MAP_W || f.y >= MAP_H) return null;
      // not into your own body, except under your feet while jumping (building yourself up a pillar)
      const r = BODY_R + 0.02;
      const z = me.z ?? GROUND;
      const inBody = f.x + 1 > me.x / TILE - r && f.x < me.x / TILE + r && f.y + 1 > me.y / TILE - r && f.y < me.y / TILE + r && f.h + 1 > z && f.h < z + 1.8;
      if (inBody && !(this.fall.vz > 0 && f.h + 1 <= z + 0.9)) return null;
      return { tx: f.x, ty: f.y, box, cell: c, front: f, block: 'place', use: { score: 2, repeat: true } };
    }
    const name = BLOCKS[this.vox.blockAtWorld(c.x + 0.5, c.h - GROUND + 0.5, c.y + 0.5)]?.name ?? '';
    if (name === 'bedrock' || name === 'water') return null;
    // the ground under a tree, a fence, a crop… stays (flat things like tufts just go with it)
    if (c.h === columnTop(this.world, c.x, c.y) - 1) {
      const id = this.world.occupancy[`${c.x},${c.y}`];
      const o = id === undefined ? undefined : this.world.objects[id];
      if ((o && (!objectDef(o.kind).flat || objectDef(o.kind).interact)) || this.world.crops[`${c.x},${c.y}`]) return null;
    }
    if (def?.tool === 'pick' || SOFT.has(name)) return { tx: c.x, ty: c.y, box, cell: c, block: 'dig', use: { score: 2, repeat: true } };
    return null;
  }

  private actOnTarget(fallbackFacing: boolean): void {
    if (this.uiOpen) return;
    const me = myPlayer();
    if (!me) return;
    let t: { tx: number; ty: number } | null = this.target;
    if (!t && fallbackFacing) t = facingTile(me);
    this.viewSwing = 1;
    if (this.target?.block) this.useBlock(this.target);
    else if (t) this.actAt(t.tx, t.ty);
  }

  /**
   * Minecraft's "pick block" (middle click): the item you build the pointed-at block with goes into
   * the selected hotbar slot, swapped in from the backpack.
   */
  pickBlock(): void {
    const me = myPlayer();
    const c = this.target?.cell;
    if (!me || !c) return;
    const name = BLOCKS[this.vox.blockAtWorld(c.x + 0.5, c.h - GROUND + 0.5, c.y + 0.5)]?.name ?? '';
    const itemId = /sand/.test(name) ? 'sand' : /gravel/.test(name) ? 'gravel' : /planks/.test(name) ? 'wood' : /stone|cobble|ore|brick/.test(name) ? 'stone' : 'dirt';
    if (me.inventory[me.selected]?.item === itemId) return;
    const slot = me.inventory.findIndex((s) => s?.item === itemId);
    if (slot < 0) {
      bus.emit('toast', fmt(T.noBlocks, { item: itemName(itemId).toLowerCase() }));
      return;
    }
    if (slot < 8) {
      net.send({ t: 'select', slot });
      return;
    }
    net.send({ t: 'swap', a: { slot: me.selected }, b: { slot } });
  }

  private useBlock(t: Target): void {
    const c = t.block === 'place' ? t.front! : t.cell!;
    net.send({ t: t.block === 'place' ? 'place' : 'dig', x: c.x, y: c.y, h: c.h });
    // digging into a wall at body height takes both blocks, so a tunnel is always walk-in tall
    const me = myPlayer();
    if (t.block === 'dig' && me?.z !== undefined) {
      const feet = Math.round(me.z);
      const beside = (c.x !== tileOf(me.x) || c.y !== tileOf(me.y)) && (c.h === feet || c.h === feet + 1);
      const other = c.h === feet ? feet + 1 : feet;
      const b = this.vox.blockAtWorld(c.x + 0.5, other - GROUND + 0.5, c.y + 0.5);
      if (beside && b !== 0 && BLOCKS[b]?.name !== 'bedrock') {
        net.send({ t: 'dig', x: c.x, y: c.y, h: other });
      }
    }
    this.lastUse = { key: `b:${c.x},${c.y},${c.h}`, at: performance.now() };
    this.viewSwing = 1;
    const a = me ? this.players.get(me.id) : undefined;
    if (a) a.rig.parts.get('rArm')!.userData.swingT = 0.3;
  }

  private actAt(tx: number, ty: number): void {
    const me = myPlayer();
    if (!me || !this.inReach(tx, ty)) return;
    const ptx = tileOf(me.x);
    const pty = tileOf(me.y);
    if (tx !== ptx || ty !== pty) {
      const dx = tx - ptx;
      const dy = ty - pty;
      me.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.sendMove(true);
    }
    net.send({ t: 'act', tx, ty });
    this.lastUse = { key: `${tx},${ty}`, at: performance.now() };
    this.viewSwing = 1;
    const a = this.players.get(me.id);
    if (a) a.rig.parts.get('rArm')!.userData.swingT = 0.3;
  }

  // ------------------------------------------------------------------ effects

  private world3(x: number, y: number, lift = 0.5): THREE.Vector3 {
    return new THREE.Vector3(x / TILE, this.vox.surfaceAt(tileOf(x), tileOf(y)) + lift, y / TILE);
  }

  private spawnFx(x: number, y: number, kind: string, from?: { x: number; y: number }): void {
    const p = this.world3(x, y, 0.6);
    switch (kind) {
      case 'heart':
        this.fx.icon(p.add(new THREE.Vector3(0, 0.6, 0)), 'heart', { n: 3, size: 0.35 });
        return;
      case 'sparkle':
        this.fx.icon(p, 'sparkle', { n: 3, size: 0.3, rise: 0.8 });
        this.fx.burst(p, ['#fff1a0', '#ffffff'], 6, { speed: 1.5, gravity: 1 });
        return;
      case 'coin':
        this.fx.icon(p.add(new THREE.Vector3(0, 0.5, 0)), 'coin', { size: 0.35, rise: 1.2 });
        return;
      case 'water':
        this.fx.burst(p.add(new THREE.Vector3(0, -0.3, 0)), ['#6fb6ff', '#3f76e4', '#d0ecff'], 14, { speed: 1.2, up: 1, gravity: 10, size: 0.08 });
        return;
      case 'splash':
        this.fx.burst(p.add(new THREE.Vector3(0, -0.4, 0)), ['#dff6ff', '#8fe0f8', '#3f76e4'], 20, { speed: 2, up: 3, gravity: 12, size: 0.1 });
        return;
      case 'chop': {
        // block-break crumbs in the colours of what was hit
        const tx = tileOf(x);
        const ty = tileOf(y);
        const colours = this.coloursAt(tx, ty);
        this.fx.burst(p, colours, 16, { speed: 2.5, up: 2, gravity: 14, size: 0.1, life: 0.7 });
        return;
      }
      case 'poof':
        this.fx.burst(p, ['#ffffff', '#e8e8e8', '#cfcfcf'], 14, { speed: 1, up: 0.8, gravity: -0.5, size: 0.22, life: 0.8 });
        return;
      case 'hit': {
        this.fx.burst(p, ['#ff5a3a', '#ffb0a0', '#c42a1a'], 10, { speed: 2, up: 1.5, gravity: 8, size: 0.09 });
        // flash whoever stands there red
        for (const a of [...this.animals.values(), ...this.players.values()]) if (Math.hypot(a.x - x, a.y - y) < 12) a.flash = 0.25;
        this.fx.shake = Math.max(this.fx.shake, 0.15);
        return;
      }
      case 'boom':
        this.fx.burst(p, ['#ff6a2a', '#ffd24a', '#5a5a5a', '#8a8a8a', '#3a3a3a'], 40, { speed: 6, up: 3, gravity: 6, size: 0.25, life: 1 });
        this.fx.puff(p, 'boom', 0, 1.2, 3, 0.4);
        this.fx.shake = 0.6;
        return;
      case 'arrow':
      case 'rocket':
      case 'lasso': {
        if (!from) return;
        const a = this.world3(from.x, from.y, 1.3);
        const b = this.world3(x, y, 0.5);
        const g = new GeoBuilder();
        if (kind === 'arrow') g.box(-0.5, -0.5, -7, 0.5, 0.5, 7, 'planks_oak').box(-1, -1, 5, 1, 1, 8, 'white', [0.8, 0.8, 0.85]).box(-1.5, -0.2, -8, 1.5, 0.2, -5, 'white', [0.9, 0.2, 0.2]);
        else if (kind === 'rocket') g.box(-1.5, -1.5, -6, 1.5, 1.5, 6, 'white', [0.85, 0.85, 0.85]).box(-1.5, -1.5, 6, 1.5, 1.5, 9, 'white', [0.9, 0.3, 0.2]);
        else g.box(-3, -0.5, -3, 3, 0.5, 3, 'white', [0.77, 0.56, 0.33]);
        const mesh = new THREE.Mesh(g.build(), makeMaterial(atlas().texture));
        const dist = a.distanceTo(b);
        const secs = kind === 'lasso' ? Math.min(0.22, 0.06 + dist * 0.03) : Math.min(0.4, 0.05 + dist * 0.035);
        const trail = kind === 'rocket' ? () => this.fx.burst(mesh.position.clone(), ['#d0d0d0', '#b0b0b0'], 1, { speed: 0.2, up: 0.2, gravity: -0.5, size: 0.2, life: 0.5 }) : undefined;
        this.fx.projectile(mesh, a, b, secs, kind === 'lasso' ? () => this.fx.projectile(mesh.clone(), b, a, secs) : undefined, trail);
        return;
      }
      case 'honk':
        this.fx.icon(p.add(new THREE.Vector3(0, 1, 0)), 'honk', { size: 0.5, rise: 0.5, life: 0.8 });
        return;
    }
    this.fx.icon(p, kind, { size: 0.35 });
  }

  /** A few colours that represent what is on a tile (for crumbs). */
  private coloursAt(tx: number, ty: number): string[] {
    const id = this.world.occupancy[`${tx},${ty}`];
    const o = id === undefined ? undefined : this.world.objects[id];
    if (o?.kind.startsWith('tree') || o?.kind === 'stump' || o?.kind === 'palm') return ['#6b5131', '#4a8f2e', '#78603b', '#3f7f27'];
    if (o?.kind.includes('rock') || o?.kind === 'ore' || o?.kind === 'cave_wall') return ['#7d7d7d', '#5e5e5e', '#a2a2a2'];
    if (o) return ['#a2834f', '#8d6f40', '#c09a62'];
    const b = this.vox.blockAtWorld(tx + 0.5, -0.5, ty + 0.5);
    const name = BLOCKS[b]?.name ?? '';
    if (name.includes('grass')) return ['#5f9e3a', '#866043', '#73b34a'];
    if (name.includes('farm') || name === 'dirt' || name === 'path') return ['#866043', '#6b4a32', '#a07a58'];
    return ['#9a9a9a', '#7a7a7a'];
  }

  // ------------------------------------------------------------------ per frame

  private sendMove(force = false): void {
    const me = myPlayer();
    if (!me) return;
    const now = performance.now();
    if (!force && now - this.lastMoveSent < 50) return;
    this.lastMoveSent = now;
    this.lastFacingSent = me.facing;
    this.lastZSent = me.z;
    net.send({ t: 'move', x: me.x, y: me.y, z: me.z, facing: me.facing, moving: me.moving });
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.time || now)) / 1000);
    this.time = now;
    const me = myPlayer();
    if (!this.world || !me) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (myArea() !== this.area) return; // a reload is on its way
    if (this.dirtyColumns.size && !this.dirtyVox) {
      // dug, built or hoed: patch just those columns (fast enough to dig continuously)
      this.vox.patchColumns(this.world, this.kind, client.season, this.dirtyColumns.values());
      this.dirtyColumns.clear();
      this.models.rebuild(this.world, this.vox, this.modelCtx(), new Set([...this.vox.lastDirty, ...this.dirtyModels]));
      this.dirtyModels.clear();
      this.lastVoxBuild = now;
    } else if ((this.dirtyVox && now - this.lastVoxBuild > 120) || (this.dirtyModels.size && now - this.lastVoxBuild > 60)) {
      if (this.dirtyVox) this.rebuildBlocks();
      else {
        this.models.rebuild(this.world, this.vox, this.modelCtx(), this.dirtyModels);
        this.dirtyModels.clear();
        this.lastVoxBuild = now;
      }
    }
    this.updateMe(me, dt);
    this.updateActors(me, dt);
    this.updateDoors(dt);
    this.updateDrops(dt);
    this.updateCamera(me);
    this.updateTarget(me);
    this.updateViewModel(me, dt);
    this.updateEnvironment(me, dt);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(me);
  }

  private updateMe(me: PlayerState, dt: number): void {
    // forward/strafe from the keys or the joystick, turned by where we look
    let f = 0;
    let s = 0;
    if (!this.uiOpen && !me.sleeping) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
      if (f === 0 && s === 0) {
        f = -this.joystick.dy;
        s = this.joystick.dx;
      }
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const dx = f * fx + s * rx;
    const dy = f * fz + s * rz;
    const running = !this.uiOpen && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('ControlLeft') || this.runHeld);
    const boost = me.boostUntil !== undefined && me.boostUntil > serverNow() ? BOOST_SPEED_MUL : 1;
    const before = { x: me.x, y: me.y };
    const speedMul = (me.riding !== undefined ? rideSpeedMul(this.world, me) : running ? 1.7 : 1) * boost;
    if (this.world.voxel && me.riding === undefined && !me.sleeping) {
      // the 3D game: walk on the blocks, step up single blocks, fall, jump
      const len = Math.hypot(dx, dy);
      const v = len > 0.01 ? (PLAYER_SPEED * speedMul) / len : 0;
      const jump = this.jumpQueued || (this.keys.has('Space') && !this.uiOpen);
      this.jumpQueued = false;
      stepBody(this.world, me, this.fall, dx * v, dy * v, dt * 1000, jump, (x, y, z) => blockedByTiles(this.world, x, y, z));
      if (applyPortal(me, this.world)) me.z = standHeight(this.world, me.x, me.y);
    } else {
      stepPlayer(this.world, me, dx, dy, dt * 1000, speedMul);
      if (this.world.voxel) me.z = standHeight(this.world, me.x, me.y);
    }
    // face where we look (the 2D facing is one of four directions)
    if (Math.hypot(me.x - before.x, me.y - before.y) < 20) me.facing = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 'right' : 'left') : fz > 0 ? 'down' : 'up';
    if (me.moving || this.wasMoving || me.facing !== this.lastFacingSent || (me.z !== undefined && Math.abs(me.z - (this.lastZSent ?? me.z)) > 0.05)) this.sendMove(!me.moving && this.wasMoving);
    this.wasMoving = me.moving;

    // jumping in the flat world (just for fun: it has no height)
    if (!this.world.voxel) {
      if (this.jumpV !== 0 || this.jumpY > 0) {
        this.jumpV -= GRAVITY * dt;
        this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
        if (this.jumpY === 0) this.jumpV = 0;
      }
      if (this.keys.has('Space') && this.jumpY === 0) this.jump();
    }

    // walking off the edge of the map into the next area
    if (this.area !== 'dungeon' && performance.now() - this.travelSentAt > 1500 && inEdgeGap(tileOf(me.x), tileOf(me.y))) {
      let dir: 'n' | 's' | 'e' | 'w' | null = null;
      // how close to the edge a body can get (the block world's body is a little wider)
      const hw = (this.world.voxel ? Math.max(PLAYER_HALF_W, BODY_R * TILE) : PLAYER_HALF_W) + 1;
      const hh = (this.world.voxel ? Math.max(PLAYER_HALF_H, BODY_R * TILE) : PLAYER_HALF_H) + 1;
      if (dy < 0 && me.y <= hh) dir = 'n';
      else if (dy > 0 && me.y >= MAP_H * TILE - hh) dir = 's';
      else if (dx < 0 && me.x <= hw) dir = 'w';
      else if (dx > 0 && me.x >= MAP_W * TILE - hw) dir = 'e';
      if (dir) {
        this.travelSentAt = performance.now();
        this.sendMove(true);
        net.send({ t: 'travel', dir });
      }
    }
    // reconcile with the server if we drifted a lot
    const snap = client.snaps.players.get(me.id);
    if (snap) {
      const off = Math.hypot(snap.x - me.x, snap.y - me.y);
      const offZ = snap.z !== undefined && me.z !== undefined ? Math.abs(snap.z - me.z) : 0;
      // standing still yet the server sees us elsewhere: it refused a move, so go where it says
      const settled = !me.moving && this.fall.onGround && (off > 3 || offZ > 0.5);
      this.driftSince = settled ? (this.driftSince || performance.now()) : 0;
      if (off > 40 || offZ > 4 || (this.driftSince && performance.now() - this.driftSince > 700)) {
        me.x = snap.x;
        me.y = snap.y;
        me.z = snap.z;
        this.fall.vz = 0;
        this.driftSince = 0;
      }
    }
    const insideNow = this.area === 'farm' && inInterior(tileOf(me.x), tileOf(me.y));
    if (insideNow !== this.inside) {
      this.inside = insideNow;
      if (insideNow) bus.emit('toast', T.enteredHouse);
    }
  }

  /** How high a rider sits (blocks). */
  private seatOf(p: PlayerState): number {
    if (p.riding === undefined) return 0;
    const a = this.animals.get(p.riding);
    return a?.rig.seat ?? 0.6;
  }

  private placeRig(v: ActorView, facingYaw: number, moving: boolean, dt: number, lift = 0, feet?: number): void {
    const x = v.x / TILE;
    const z = v.y / TILE;
    const ground = feet ?? this.vox.surfaceAt(tileOf(v.x), tileOf(v.y));
    v.rig.root.position.set(x, ground + lift, z);
    v.yaw = angleLerp(v.yaw, facingYaw, 1 - Math.pow(0.0001, dt));
    v.rig.root.rotation.y = v.yaw;
    v.walk += ((moving ? 1 : 0) - v.walk) * Math.min(1, dt * 10);
    animateRig(v.rig, this.time / 1000, v.walk, v.phase);
    const [s, b] = this.vox.lightAtWorld(x, ground + 0.5, z);
    v.flash = Math.max(0, v.flash - dt);
    for (const m of v.rig.materials) {
      setActorLight(m, s, b);
      const fl = v.flash > 0 ? 0.6 : 0;
      if (m.uniforms.uFlash!.value !== fl) {
        m.uniforms.uFlash!.value = fl;
        m.uniformsNeedUpdate = true;
      }
    }
  }

  private updateActors(me: PlayerState, dt: number): void {
    const world = this.world;
    const lerp = 1 - Math.pow(0.001, dt);
    const follow = (v: ActorView, sx: number, sy: number, snapDist: number) => {
      if (Math.hypot(sx - v.x, sy - v.y) > snapDist) {
        v.x = sx;
        v.y = sy;
      } else {
        v.x += (sx - v.x) * lerp;
        v.y += (sy - v.y) * lerp;
      }
    };
    for (const [id, v] of this.players) {
      const p = world.players[id];
      if (!p) continue;
      const mine = id === me.id;
      let feet: number | undefined;
      if (mine) {
        v.x = me.x;
        v.y = me.y;
        if (world.voxel && me.z !== undefined) feet = me.z - GROUND;
      } else {
        const snap = client.snaps.players.get(id);
        if (snap) follow(v, snap.x, snap.y, 64);
        if (world.voxel && snap?.z !== undefined) {
          const target = snap.z - GROUND;
          v.z = v.z === undefined || Math.abs(target - v.z) > 4 ? target : v.z + (target - v.z) * lerp;
          feet = v.z;
        }
      }
      const swimming = this.kind === 'bath' && inPool(world, v);
      const seat = this.seatOf(p);
      const yaw = mine ? this.yaw + Math.PI : yawOf(p.facing);
      this.placeRig(v, yaw, p.moving && seat === 0, dt, seat + (mine ? this.jumpY : 0) - (swimming ? 0.9 : 0), feet);
      // sitting, sleeping
      const sitting = seat > 0;
      v.rig.parts.get('rLeg')!.rotation.x = sitting ? -1.4 : v.rig.parts.get('rLeg')!.rotation.x;
      v.rig.parts.get('lLeg')!.rotation.x = sitting ? -1.4 : v.rig.parts.get('lLeg')!.rotation.x;
      v.rig.body.rotation.x = p.sleeping ? -Math.PI / 2 : 0;
      v.rig.body.position.y = p.sleeping ? 0.5 : 0;
      // hand swing when acting
      const arm = v.rig.parts.get('rArm')!;
      const st = (arm.userData.swingT as number | undefined) ?? 0;
      if (st > 0) {
        arm.userData.swingT = st - dt;
        arm.userData.busy = true;
        arm.rotation.x = -Math.sin((1 - st / 0.3) * Math.PI) * 1.6;
      } else arm.userData.busy = false;
      // head follows our pitch
      if (mine) {
        const head = v.rig.parts.get('head')!;
        head.userData.look = true;
        head.rotation.x = -this.pitch * 0.8;
      }
      this.updateHeld(v, p, swimming);
      this.updateBubble(v, p);
      v.rig.root.visible = !(mine && this.camMode === 0);
    }
    for (const [id, v] of this.animals) {
      const a = world.animals[id];
      if (!a) continue;
      const rider = a.species === 'horse' || isVehicle(a) ? Object.values(world.players).find((p) => p.riding === id) : undefined;
      const rv = rider ? this.players.get(rider.id) : undefined;
      if (rv && rider) {
        v.x = rv.x;
        v.y = rv.y;
        this.placeRig(v, rider.id === me.id ? this.yaw + Math.PI : yawOf(rider.facing), rider.moving, dt);
        continue;
      }
      const snap = client.snaps.animals.get(id);
      if (snap) follow(v, snap.x, snap.y, 48);
      let lift = 0;
      if (v.rig.root.userData.flying) lift = 1.2 + Math.sin(this.time / 300 + v.phase) * 0.2;
      if (a.species === 'slime' && a.moving) lift = Math.abs(Math.sin(this.time / 160 + v.phase)) * 0.4;
      this.placeRig(v, yawOf(a.facing), a.moving, dt, lift);
    }
    for (const [id, v] of this.npcs) {
      const snap = client.snaps.npcs.get(id);
      if (snap) follow(v, snap.x, snap.y, 64);
      this.placeRig(v, yawOf(snap?.facing ?? 'down'), snap?.moving ?? false, dt);
      this.updateNpcTalk(id, v, me);
    }
  }

  /** The selected item in a player's right hand. */
  private updateHeld(v: ActorView, p: PlayerState, swimming: boolean): void {
    const stack = heldItem(p);
    const driving = p.riding !== undefined && !!this.world.animals[p.riding] && isVehicle(this.world.animals[p.riding]!);
    const item = stack && !swimming && !p.sleeping && !driving ? stack.item : null;
    if ((v.held?.item ?? null) === item) return;
    if (v.held) v.rig.hand?.remove(v.held.mesh);
    v.held = null;
    if (!item || !v.rig.hand) return;
    const mat = itemMaterial();
    v.rig.materials.push(mat);
    const mesh = itemMesh(item, 0.55, mat);
    if (!mesh) return;
    const g = new THREE.Group();
    g.add(mesh);
    // pointing forward, turned a little outwards so its face shows from behind too
    g.rotation.set(-Math.PI / 2 + 0.3, Math.PI / 2 - 0.6, 0);
    g.position.set(0, -0.05, 0.05);
    v.rig.hand.add(g);
    v.held = { item, mesh: g };
  }

  private placeLabel(el: HTMLElement, pos: THREE.Vector3, maxDist = 24): void {
    const d = pos.distanceTo(this.camera.position);
    const v = pos.clone().project(this.camera);
    if (v.z > 1 || d > maxDist || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      el.style.display = 'none';
      return;
    }
    // names don't show through walls
    const from = this.camera.position;
    const steps = Math.floor(d / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const b = this.vox.blockAtWorld(from.x + (pos.x - from.x) * t, from.y + (pos.y - from.y) * t, from.z + (pos.z - from.z) * t);
      if (BLOCKS[b]?.opaque) {
        el.style.display = 'none';
        return;
      }
    }
    el.style.display = '';
    const stage = this.labels.getBoundingClientRect();
    const x = ((v.x + 1) / 2) * window.innerWidth - stage.left;
    const y = ((1 - v.y) / 2) * window.innerHeight - stage.top;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  private headPos(v: ActorView, extra = 0.25): THREE.Vector3 {
    return v.rig.root.position.clone().add(new THREE.Vector3(0, v.rig.height + extra, 0));
  }

  private updateLabels(me: PlayerState): void {
    for (const [id, v] of this.players) {
      if (id === me.id && this.camMode === 0) v.label.style.display = 'none';
      else this.placeLabel(v.label, this.headPos(v));
      if (v.bubble) this.placeLabel(v.bubble, this.headPos(v, 0.75), 30);
    }
    for (const v of this.npcs.values()) {
      this.placeLabel(v.label, this.headPos(v));
      if (v.bubble) this.placeLabel(v.bubble, this.headPos(v, 0.75), 30);
    }
    for (const [id, v] of this.animals) {
      const a = this.world.animals[id];
      const onOwner = a?.owner && Math.hypot(a.x - me.x, a.y - me.y) < 14;
      const hostile = a && (ANIMALS[a.species]?.mob || (ANIMALS[a.species]?.predator && !a.owner));
      const near = a && !onOwner && Math.hypot(a.x - me.x, a.y - me.y) < (hostile ? 140 : 40);
      if (!near) v.label.style.display = 'none';
      else this.placeLabel(v.label, this.headPos(v, 0.15));
    }
  }

  private updateBubble(v: ActorView, p: PlayerState): void {
    const glyph = p.sleeping ? EMOTE_GLYPH.sova! : p.emote && p.emote.until > serverNow() ? (EMOTE_GLYPH[p.emote.id] ?? p.emote.id) : null;
    if (glyph && !v.bubble) v.bubble = this.makeLabel(glyph, 'bubble emote');
    else if (!glyph && v.bubble) {
      v.bubble.remove();
      v.bubble = undefined;
    }
    if (v.bubble && glyph) v.bubble.textContent = glyph;
  }

  /** Speech bubbles: greet a player who comes close, chat with another villager, or show a quest marker. */
  private updateNpcTalk(id: string, v: ActorView, me: PlayerState): void {
    const now = performance.now();
    let st = this.talk.get(id);
    if (!st) {
      st = { partner: null, until: 0, text: '', cooldownUntil: 0 };
      this.talk.set(id, st);
    }
    const near = Math.hypot(me.x - v.x, me.y - v.y) < 2.5 * TILE ? me.id : null;
    let npcNear: string | null = null;
    if (!near) for (const [oid, other] of this.npcs) if (oid !== id && Math.hypot(other.x - v.x, other.y - v.y) < 2.2 * TILE) npcNear = oid;
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
    const quests = client.world!.quests.filter((q) => q.npc === id && !me.questsDone.includes(q.id));
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
      if (!v.bubble) v.bubble = this.makeLabel(text, cls);
      v.bubble.className = `label ${cls}`;
      v.bubble.textContent = text;
    } else if (v.bubble) {
      v.bubble.remove();
      v.bubble = undefined;
    }
  }

  /** Doors swing open while a player or villager stands on or next to them. */
  private updateDoors(dt: number): void {
    for (const [id, d] of this.doors) {
      const o = this.world.objects[id];
      if (!o) continue;
      const cx = o.x * TILE + TILE / 2;
      const cy = o.y * TILE + TILE / 2;
      const near = (a: { x: number; y: number }) => Math.abs(a.x - cx) < TILE * 1.2 && Math.abs(a.y - cy) < TILE * 1.2;
      let open = false;
      for (const a of this.players.values()) if (near(a)) open = true;
      for (const a of this.npcs.values()) if (near(a)) open = true;
      d.angle += ((open ? 1 : 0) - d.angle) * Math.min(1, dt * 8);
      d.pivot.rotation.y = -d.angle * (Math.PI / 2);
    }
  }

  private updateDrops(dt: number): void {
    for (const [id, g] of this.drops) {
      const d = this.world.drops[id];
      if (!d) continue;
      g.rotation.y += dt * 1.5;
      g.position.y = this.vox.surfaceAt(tileOf(d.x), tileOf(d.y)) + 0.15 + Math.sin(this.time / 400 + (g.userData.phase as number)) * 0.08;
      const [s, b] = this.vox.lightAtWorld(g.position.x, g.position.y + 0.3, g.position.z);
      setActorLight(g.userData.mat as THREE.ShaderMaterial, s, b);
    }
  }

  private updateCamera(me: PlayerState): void {
    const v = this.players.get(me.id);
    const base = v ? v.rig.root.position.clone() : new THREE.Vector3(me.x / TILE, 0, me.y / TILE);
    if (!v) base.y = this.vox.surfaceAt(tileOf(me.x), tileOf(me.y));
    const swimming = this.kind === 'bath' && inPool(this.world, me);
    let eye = base.clone().add(new THREE.Vector3(0, me.sleeping ? 0.6 : EYE - (swimming ? 0 : 0), 0));
    if (v) eye.y = v.rig.root.position.y + (me.sleeping ? 0.6 : EYE);
    // view bobbing while walking
    const walk = v?.walk ?? 0;
    const t = this.time / 1000;
    if (this.camMode === 0 && walk > 0.05) {
      eye.y += Math.abs(Math.sin(t * 9)) * 0.06 * walk;
      eye.x += Math.cos(this.yaw) * Math.sin(t * 9) * 0.03 * walk;
      eye.z -= Math.sin(this.yaw) * Math.sin(t * 9) * 0.03 * walk;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.camMode !== 0) {
      const back = new THREE.Vector3(0, 0, 1).applyEuler(this.camera.rotation);
      if (this.camMode === 2) {
        back.multiplyScalar(-1);
        this.camera.rotation.set(-this.pitch, this.yaw + Math.PI, 0);
      }
      // pull in so the camera never ends up inside blocks
      let d = 0;
      while (d < 4) {
        const p = eye.clone().addScaledVector(back, d + 0.2);
        if (BLOCKS[this.vox.blockAtWorld(p.x, p.y, p.z)]?.opaque) break;
        d += 0.1;
      }
      eye = eye.addScaledVector(back, d);
    }
    if (this.fx.shake > 0) eye.add(new THREE.Vector3((Math.random() - 0.5) * this.fx.shake * 0.3, (Math.random() - 0.5) * this.fx.shake * 0.3, 0));
    this.camera.position.copy(this.debugEye ?? eye);
  }

  private updateTarget(me: PlayerState): void {
    let t: Target | null = null;
    if (!this.uiOpen) {
      t = this.chooseTarget(this.viewRay(), ASSIST_VIEW);
      if (!t && this.touch) {
        const f = facingTile(me);
        t = { ...f, box: this.boundsOf(f.tx, f.ty) };
      }
    }
    this.target = t;
    // held button: keep chopping, hoeing, planting… as long as it is safe to repeat
    const now = performance.now();
    if (this.holding && t?.use?.repeat && (t.side ?? 0) <= REPEAT_SIDE && me.riding === undefined) {
      const fresh = !t.block && `${t.tx},${t.ty}` !== this.lastUse.key;
      if (now >= this.nextUse || (fresh && now - this.lastUse.at >= REPEAT_NEW_MS)) {
        this.nextUse = now + REPEAT_MS;
        this.viewSwing = 1;
        if (t.block) this.useBlock(t);
        else this.actAt(t.tx, t.ty);
      }
    }
    this.highlight.show(t ? t.box : null);
    this.crosshair.style.display = this.camMode === 0 && !this.uiOpen ? '' : 'none';
  }

  /** First person: your own arm and the held item at the bottom right, swinging when you act. */
  private updateViewModel(me: PlayerState, dt: number): void {
    const v = this.players.get(me.id);
    this.viewModel.visible = this.camMode === 0 && !!v && !me.sleeping;
    if (!v) return;
    if (this.viewKey !== v.key) {
      this.viewKey = v.key;
      if (this.viewArm) this.viewModel.remove(this.viewArm);
      const arm = v.rig.parts.get('rArm')!.children[0] as THREE.Mesh;
      const mat = cloneMaterial(arm.material as THREE.ShaderMaterial);
      mat.depthTest = false;
      const m = new THREE.Mesh(arm.geometry, mat);
      m.renderOrder = 1000;
      m.scale.setScalar(0.9);
      const g = new THREE.Group();
      g.add(m);
      this.viewArm = g;
      this.viewModel.add(g);
      this.viewItem = null;
    }
    const stack = heldItem(me);
    const item = stack?.item ?? null;
    if ((this.viewItem?.item ?? null) !== item) {
      if (this.viewItem) this.viewModel.remove(this.viewItem.mesh);
      this.viewItem = null;
      if (item) {
        const mat = itemMaterial();
        mat.depthTest = false;
        const mesh = itemMesh(item, 0.22, mat);
        if (mesh) {
          mesh.renderOrder = 1001;
          const g = new THREE.Group();
          g.add(mesh);
          this.viewModel.add(g);
          this.viewItem = { item, mesh: g };
        }
      }
    }
    this.viewSwing = Math.max(0, this.viewSwing - dt * 4);
    const sw = Math.sin(this.viewSwing * Math.PI);
    const walk = v.walk;
    const bob = Math.sin(this.time / 1000 * 9) * 0.03 * walk;
    const arm = this.viewArm!;
    arm.position.set(0.42 + bob, -0.55 - Math.abs(bob) + sw * 0.15, -0.55 - sw * 0.2);
    arm.rotation.set(1.25 - sw * 0.9, 0.3, 0.2);
    arm.visible = !this.viewItem;
    if (this.viewItem) {
      const g = this.viewItem.mesh;
      g.position.set(0.3 + bob, -0.33 - Math.abs(bob) + sw * 0.1, -0.5 - sw * 0.2);
      g.rotation.set(-sw * 1.2, -0.9, 0.2);
    }
    const [s, b] = this.vox.lightAtWorld(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    for (const o of this.viewModel.children)
      o.traverse((m) => {
        if (m instanceof THREE.Mesh) setActorLight(m.material as THREE.ShaderMaterial, s, b);
      });
  }

  private updateEnvironment(me: PlayerState, dt: number): void {
    const outdoor = this.kind === 'outdoor';
    const day = this.sky.update(client.timeMs, this.camera, dt, outdoor, client.season);
    shared.uDaylight.value = outdoor ? day : 0.2;
    shared.uTime.value = this.time / 1000;
    const pv = this.players.get(me.id);
    if (pv) shared.uLanternPos.value.copy(pv.rig.root.position).add(new THREE.Vector3(0, 1, 0));
    // a soft light around you at night, in the cave, and down in your own tunnels
    const [skyHere] = this.vox.lightAtWorld(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    shared.uLantern.value = this.kind === 'dungeon' ? 0.55 : outdoor ? Math.max((0.75 - day) * 0.9, skyHere < 0.6 ? 0.6 : 0, 0) : 0.2;
    if (outdoor) {
      this.scene.background = this.sky.color;
      shared.uFogColor.value.copy(this.sky.fog);
      shared.uFogNear.value = 34;
      shared.uFogFar.value = 62;
      shared.uMinLight.value = 0.1;
    } else {
      this.scene.background = new THREE.Color(this.kind === 'dungeon' ? 0x050608 : 0x1a1a22);
      shared.uFogColor.value.setHex(this.kind === 'dungeon' ? 0x050608 : 0x1a1a22);
      shared.uFogNear.value = this.kind === 'dungeon' ? 8 : 24;
      shared.uFogFar.value = this.kind === 'dungeon' ? 26 : 50;
      shared.uMinLight.value = this.kind === 'dungeon' ? 0.13 : 0.25;
    }
    // flowing water
    this.vox.waterTex.offset.y = (this.vox.waterTex.offset.y - dt * 0.25) % 1;
    // sleeping: everything fades out
    this.sleepOverlay.style.opacity = me.sleeping ? '0.9' : '0';
  }
}
