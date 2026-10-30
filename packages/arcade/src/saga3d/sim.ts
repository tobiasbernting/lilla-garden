// The local rules of the 3D dungeon proof of concept: one player, the monster packs, the two bosses and their
// telegraphed attacks, spells, cooldowns, death and rest stones. No Three.js and no DOM in here, so the renderer
// only draws what this module says and the rules can be tested on their own (sim.test.ts).
//
// The numbers come from saga.ts (CLASSES, SPELLS, SAGA_MOBS, SAGA_BOSSES, the scale helpers for a lone player), so the
// feel matches the 2D game. Rules are simplified for one player: the whole party is "the player".
//
// Units: a tile is one unit; tile (tx, ty) is at x = tx + 0.5, z = ty + 0.5. Speeds are units per second, time is in
// sim seconds (`Sim.time`). `facing` is an angle in radians in the XZ plane, atan2(dz, dx).
// The sim steps at a fixed 60 Hz inside update(dt), whatever dt is.
//
// Things to know when drawing it:
//  - Mobs are never removed from `sim.mobs`. A dead one has `dead = true` and `diedAt` (let it fall over and fade).
//    Adds that a boss calls appear in `sim.mobs` later (new ids above every existing one): diff the map or listen for
//    the 'spawn' event. When a boss goes home or dies its adds are marked dead.
//  - `SimMob.atkAt` is the sim time of the monster's last attack (for the swing animation); `SimPlayer.attackAt` is the
//    last cast. Melee attacks of monsters have no event: the 'damage' event on the player is the hit.
//  - `SimPlayer.hp` is fractional while it regenerates: round it for display.
//  - A zone is `SimZone`: a circle or a cone on the floor. `at` is when it lands (fill the telegraph from `born` to
//    `at`). Zones that do not linger vanish when they land. Lingering ones (pools) have `until` and hurt once a second
//    after they landed. For a cone `dir` is radians, `arc` is its full width in DEGREES (like saga.ts), `r` its length.
//    `dmg` is the unscaled number from saga.ts (the player takes it times mobDmgScale(1) = 0.4).
//  - When the mid-boss falls the sim sets `world.saga.gateOpen = true` (the sim and walkableFromWorld read it); the
//    gate meshes are the renderer's to remove when it sees the 'gateOpen' event.
//
// Events (drain() them every frame; times are sim seconds, positions {x, z}):
//  cast       the player cast a spell: spell id, its kind, from (player) and to (target / ground point, null for a
//             self spell), target mob id or null, facing after turning. Always emitted before the effects it causes.
//  bolt       something is flying: spell id (or 'mob_<species>' for a monster's shot), from, to, target (mob id or
//             'player') and `arrive`, the sim time it lands. The damage event follows at that time, not before.
//             Player bolts (kind bolt and lance) travel 12 units/s, monster shots 9.
//  damage     a number to show: target (mob id or 'player'), integer amount, `at` where it happened, and `spell`:
//             the player's spell id, 'mob_<species>' for a monster's shot, 'boss_<move>' for a boss's ground attack
//             (cleave, slam, rain, pools, nova, charge), nothing for a plain melee blow.
//  heal       the player was healed (spells, potion, healing ring once a second, rage leech): integer amount, `at`.
//  mobDied    a monster fell (or an add was sent away): its id.
//  playerDown the player fell. The monsters that were fighting walk home at once.
//  playerUp   the player got up at the checkpoint with full health, 3 s later.
//  yell       a boss speaks (pull, new phase, kill, death): `by` the boss id and the text.
//  gateOpen   the mid-boss fell. cleared: the last boss fell (the dungeon is done, show "Dungeon klarad!").
//  bossMove   a boss starts a big attack (its zones are in sim.zones now): `by`, move, Swedish name. Emitted again
//             with `interrupted: true` if the player cancels it (then also an 'interrupt' event).
//  interrupt  a boss cast was stopped by a bash, a charge or a lance: `by` the boss id.
//  rest       the player came to a rest stone (once per visit): x, z of the stone. It is also the new checkpoint.
//  fail       a key press did nothing: noTarget, range, cooldown (also the global cooldown) or down.
//  blink      the player jumped: from, to.   charge: the player (or a boss) dashed: `who` ('player' or mob id), from, to.
//  spawn      (extra, not in the first contract) a monster joined: its id (already in sim.mobs).
import {
  CALM_MS,
  CLASSES,
  GCD_MS,
  LEASH_TILES,
  MAP_H,
  MAP_W,
  REST_RADIUS,
  SAGA_BOSSES,
  SAGA_MOBS,
  SPELLS,
  WALL_TERRAIN,
  addCount,
  bossHpScale,
  mobDmgScale,
  mobHpScale,
  objectDef,
  type BossAbility,
  type BossMove,
  type ClassId,
  type DungeonId,
  type SagaBossDef,
  type SagaMobDef,
  type SpellDef,
  type SpellKind,
  type WorldState,
} from '@lilla-garden/shared';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface P2 {
  x: number;
  z: number;
}

export interface SimOptions {
  dungeon: DungeonId;
  cls: ClassId;
  /** Can an actor's centre stand here? (the sim checks the four corners of a 0.3 radius itself). */
  walkable(x: number, z: number): boolean;
}

export interface SimPlayer {
  x: number;
  z: number;
  facing: number;
  hp: number;
  max: number;
  down: boolean;
  downAt: number;
  moving: boolean;
  /** Units per second right now (slow and rage included). */
  speed: number;
  /** Per slot 0..3: the sim time the spell is ready again. */
  cds: number[];
  gcdUntil: number;
  potionReadyAt: number;
  target: number | null;
  wallUntil: number;
  rageUntil: number;
  slowUntil: number;
  hotUntil: number;
  attackAt: number;
  checkpoint: P2;
}

export interface SimMob {
  id: number;
  species: string;
  kind: 'mob' | 'mini' | 'boss' | 'add';
  x: number;
  z: number;
  facing: number;
  hp: number;
  max: number;
  state: 'idle' | 'fight' | 'home' | 'dead';
  dead: boolean;
  diedAt: number;
  stunUntil: number;
  slowUntil: number;
  home: P2;
  pack: number;
  threat: number;
  atkAt: number;
  moving: boolean;
  phase: number;
  cast: { move: BossMove; name: string; at: number; started: number; zones: string[] } | null;
  /** 1 normal, 1.6 mid-boss, 2.2 boss, 0.8 small (rat, imp). */
  size: number;
}

export interface SimZone {
  id: string;
  shape: 'circle' | 'cone';
  x: number;
  z: number;
  r: number;
  /** Cone: where it points (radians). */
  dir?: number;
  /** Cone: full width in degrees. */
  arc?: number;
  /** Sim time it lands. */
  at: number;
  /** Lingering ground: until this time. */
  until?: number;
  dmg: number;
  /** The boss that made it. */
  by: number;
  born: number;
}

export type SimEvent =
  | { type: 'cast'; spell: string; kind: SpellKind; from: P2; to: P2 | null; target: number | null; facing: number }
  | { type: 'bolt'; spell: string; from: P2; to: P2; target: number | 'player'; arrive: number }
  | { type: 'damage'; target: number | 'player'; amount: number; at: P2; spell?: string }
  | { type: 'heal'; target: 'player'; amount: number; at: P2 }
  | { type: 'mobDied'; id: number }
  | { type: 'playerDown' }
  | { type: 'playerUp' }
  | { type: 'yell'; by: number; text: string }
  | { type: 'gateOpen' }
  | { type: 'cleared' }
  | { type: 'bossMove'; by: number; move: BossMove; name: string; interrupted?: boolean }
  | { type: 'interrupt'; by: number }
  | { type: 'rest'; x: number; z: number }
  | { type: 'fail'; reason: 'noTarget' | 'range' | 'cooldown' | 'down' }
  | { type: 'blink'; from: P2; to: P2 }
  | { type: 'charge'; who: 'player' | number; from: P2; to: P2 }
  | { type: 'spawn'; id: number };

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const RADIUS = 0.3;
const PLAYER_SPEED = 4;
const SLOW_MUL = 0.6;
const RAGE_SPEED = 1.3;
const BOLT_SPEED = 12;
const MOB_BOLT_SPEED = 9;
const POTION_HEAL = 0.4;
const POTION_CD = 15;
const REGEN = 0.02;
const REST_REGEN = 0.15;
const DOWN_S = 3;
const FRONT_ARC = Math.PI / 3;
const WALL_MUL = 0.4;
const WALL_HEAL = 0.1;
const RAGE_MUL = 1.5;
const RAGE_LEECH = 0.1;
const HOME_SPEED = 1.6;
const BOSS_HALL = 11;
const SHOT_SLOW_S = 2.5;
const TARGET_RANGE = 12;
const GCD = GCD_MS / 1000;
const CALM = CALM_MS / 1000;
const EPS = 1e-6;

/** Which species are small (the figures are round and tiny). */
const SMALL = new Set(['gravrotta', 'eldimp']);

// ---------------------------------------------------------------------------
// Collision from the generated map
// ---------------------------------------------------------------------------

/**
 * Walkable ground from a generated dungeon: the terrain that is not rock and every tile that no solid object
 * (wall, decor, rest stone, chest) stands on. The gate blocks until `world.saga.gateOpen` is set. Reused by the
 * renderer as a fallback for its own collision.
 */
export function walkableFromWorld(world: WorldState): (x: number, z: number) => boolean {
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const gate = new Set<number>();
  for (let i = 0; i < blocked.length; i++) if (WALL_TERRAIN.has(world.terrain[i]!)) blocked[i] = 1;
  for (const obj of Object.values(world.objects)) {
    let solid = true;
    let w = 1;
    let h = 1;
    try {
      const d = objectDef(obj.kind);
      solid = d.solid;
      w = d.w;
      h = d.h;
    } catch {
      /* an object the data does not know blocks, to be safe */
    }
    if (!solid) continue;
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const tx = obj.x + dx;
        const ty = obj.y + dy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (obj.kind === 'saga_gate') gate.add(ty * MAP_W + tx);
        else blocked[ty * MAP_W + tx] = 1;
      }
  }
  return (x, z) => {
    const tx = Math.floor(x);
    const ty = Math.floor(z);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const k = ty * MAP_W + tx;
    if (blocked[k]) return false;
    return !gate.has(k) || !!world.saga?.gateOpen;
  };
}

// ---------------------------------------------------------------------------
// The sim
// ---------------------------------------------------------------------------

/** What a monster needs beyond the public fields. */
interface MobRT extends SimMob {
  /** The time its next attack is ready. */
  nextAtk: number;
  /** Bosses: when each move is ready. */
  next: number[];
  castIdx: number;
  stuck: number;
}

interface ZoneRT extends SimZone {
  landed: boolean;
  tickAt: number;
}

interface Pending {
  /** 'player' for a player's bolt or lance, 'mob' for a monster's shot. */
  from: 'player' | 'mob';
  arrive: number;
  spell: string;
  /** A mob id for player shots; the shooter's id for monster shots. */
  mob: number;
  amount: number;
  slows: boolean;
  lance: SpellDef | null;
}

const dist = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.z - b.z);
const vary = (): number => 0.9 + Math.random() * 0.2;
const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

export class Sim {
  readonly player: SimPlayer;
  readonly mobs = new Map<number, SimMob>();
  readonly zones: SimZone[] = [];
  readonly packs: { members: number[]; dead: boolean }[];
  time = 0;
  gateOpen = false;
  cleared = false;
  readonly bossId: number;
  readonly miniId: number;
  readonly rests: P2[];
  readonly start: P2;
  readonly dungeon: DungeonId;
  readonly cls: ClassId;

  private readonly world: WorldState;
  private readonly walk: (x: number, z: number) => boolean;
  private events: SimEvent[] = [];
  private acc = 0;
  private inX = 0;
  private inZ = 0;
  private nextId: number;
  private zoneSeq = 1;
  private fighting = false;
  private lastFight = -Infinity;
  private restIn = -1;
  private hotPer = 0;
  private hotTimer = 0;
  private pending: Pending[] = [];
  private fields = new Map<number, Int16Array>();

  constructor(world: WorldState, opts: SimOptions) {
    const inst = world.saga;
    if (!inst) throw new Error('Sim needs a world made by generateSaga()');
    this.world = world;
    this.walk = opts.walkable;
    this.dungeon = opts.dungeon;
    this.cls = opts.cls;
    this.start = { x: inst.start.x + 0.5, z: inst.start.y + 0.5 };
    this.rests = inst.rests.map((r) => ({ x: r.x + 0.5, z: r.y + 0.5 }));
    this.gateOpen = inst.gateOpen;
    this.bossId = inst.boss;
    this.miniId = inst.mini;
    let maxId = 0;
    for (const sm of Object.values(inst.mobs)) {
      if (sm.kind === 'ice') continue;
      const boss = SAGA_BOSSES[sm.species];
      const def = boss ?? SAGA_MOBS[sm.species];
      if (!def) continue;
      const big = sm.kind === 'boss' || sm.kind === 'mini';
      const max = Math.round(def.hp * (big ? bossHpScale(1) : mobHpScale(1)));
      const home = { x: sm.home.x / 16, z: sm.home.y / 16 };
      const m: MobRT = {
        id: sm.id,
        species: sm.species,
        kind: sm.kind,
        x: home.x,
        z: home.z,
        facing: Math.PI / 2,
        hp: max,
        max,
        state: 'idle',
        dead: false,
        diedAt: 0,
        stunUntil: 0,
        slowUntil: 0,
        home,
        pack: sm.pack,
        threat: 0,
        atkAt: -99,
        moving: false,
        phase: 0,
        cast: null,
        size: sm.kind === 'mini' ? 1.6 : sm.kind === 'boss' ? 2.2 : SMALL.has(sm.species) ? 0.8 : 1,
        nextAtk: 0,
        next: [],
        castIdx: -1,
        stuck: 0,
      };
      this.mobs.set(m.id, m);
      maxId = Math.max(maxId, m.id);
    }
    this.nextId = Math.max(maxId, world.nextId - 1) + 1;
    this.packs = inst.packs.map((p) => ({ members: [...p.members], dead: false }));
    const hp = CLASSES[opts.cls].hp;
    this.player = {
      x: this.start.x,
      z: this.start.z,
      facing: 0,
      hp,
      max: hp,
      down: false,
      downAt: 0,
      moving: false,
      speed: PLAYER_SPEED,
      cds: [0, 0, 0, 0],
      gcdUntil: 0,
      potionReadyAt: 0,
      target: null,
      wallUntil: 0,
      rageUntil: 0,
      slowUntil: 0,
      hotUntil: 0,
      attackAt: -99,
      checkpoint: { ...this.start },
    };
    // look at the nearest monster to begin with
    let best = Infinity;
    for (const m of this.mobs.values()) {
      const d = dist(m, this.player);
      if (d < best) {
        best = d;
        this.player.facing = Math.atan2(m.z - this.player.z, m.x - this.player.x);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /** The walking direction wanted from now on, in world units (camera-relative already), length at most 1. */
  move(dx: number, dz: number): void {
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    this.inX = dx;
    this.inZ = dz;
  }

  setTarget(id: number | null): void {
    const m = id === null ? undefined : this.mobs.get(id);
    this.player.target = m && !m.dead ? m.id : null;
  }

  /** Tab: the nearest living monster within 12 units that is not the current one, else the nearest of all. */
  cycleTarget(): void {
    const p = this.player;
    let near: SimMob | null = null;
    let nearD = Infinity;
    let any: SimMob | null = null;
    let anyD = Infinity;
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const d = dist(m, p);
      if (d < anyD) {
        anyD = d;
        any = m;
      }
      if (m.id !== p.target && d <= TARGET_RANGE && d < nearD) {
        nearD = d;
        near = m;
      }
    }
    const pick = near ?? any;
    p.target = pick ? pick.id : null;
  }

  mobDef(id: number): SagaMobDef | SagaBossDef | undefined {
    const m = this.mobs.get(id);
    return m ? (SAGA_BOSSES[m.species] ?? SAGA_MOBS[m.species]) : undefined;
  }

  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // -------------------------------------------------------------------------
  // The player's actions
  // -------------------------------------------------------------------------

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  private fail(reason: 'noTarget' | 'range' | 'cooldown' | 'down'): false {
    this.emit({ type: 'fail', reason });
    return false;
  }

  potion(): boolean {
    const p = this.player;
    if (p.down) return this.fail('down');
    if (this.time + EPS < p.potionReadyAt) return this.fail('cooldown');
    p.potionReadyAt = this.time + POTION_CD;
    this.healPlayer(p.max * POTION_HEAL);
    return true;
  }

  cast(slot: 0 | 1 | 2 | 3): boolean {
    const p = this.player;
    if (p.down) return this.fail('down');
    const id = CLASSES[this.cls].spells[slot];
    const sp = id ? SPELLS[id] : undefined;
    if (!sp) return false;
    if (this.time + EPS < p.gcdUntil || this.time + EPS < (p.cds[slot] ?? 0)) return this.fail('cooldown');
    switch (sp.kind) {
      case 'melee':
      case 'bash':
      case 'bolt':
      case 'lance': {
        const t = this.pickMob(sp.range);
        if ('fail' in t) return this.fail(t.fail);
        const m = t.mob;
        this.begin(slot, sp, m, m);
        if (sp.kind === 'bolt' || sp.kind === 'lance') {
          const from = { x: p.x, z: p.z };
          const to = { x: m.x, z: m.z };
          const arrive = this.time + dist(from, to) / BOLT_SPEED;
          this.emit({ type: 'bolt', spell: sp.id, from, to, target: m.id, arrive });
          this.pending.push({ from: 'player', arrive, spell: sp.id, mob: m.id, amount: this.power(sp.power), slows: false, lance: sp.kind === 'lance' ? sp : null });
        } else {
          this.strike(m, sp);
          if (sp.kind === 'bash') this.stun(m, sp.ms ?? 1500);
        }
        return true;
      }
      case 'charge': {
        const t = this.pickMob(sp.range);
        if ('fail' in t) return this.fail(t.fail);
        const m = t.mob;
        this.begin(slot, sp, m, m);
        this.dash(m);
        this.strike(m, sp);
        this.stun(m, sp.ms ?? 1000);
        return true;
      }
      case 'storm': {
        const t = this.pickMob(sp.range);
        if ('fail' in t) return this.fail(t.fail);
        const at = { x: t.mob.x, z: t.mob.z };
        this.begin(slot, sp, at, t.mob);
        for (const o of this.mobsNear(at, sp.radius ?? 2)) this.strike(o, sp);
        return true;
      }
      case 'whirl': {
        this.begin(slot, sp, null, null);
        for (const o of this.mobsNear(p, sp.radius ?? 2)) this.strike(o, sp);
        return true;
      }
      case 'taunt': {
        this.begin(slot, sp, null, null);
        for (const o of this.mobsNear(p, sp.radius ?? 5)) {
          if (o.state === 'idle') this.pull(o);
          o.threat = o.threat * 1.2 + 20;
        }
        return true;
      }
      case 'heal':
        this.begin(slot, sp, null, null);
        this.healPlayer(sp.power * vary());
        return true;
      case 'hot': {
        this.begin(slot, sp, null, null);
        const s = (sp.ms ?? 6000) / 1000;
        p.hotUntil = this.time + s;
        this.hotPer = sp.power / s;
        this.hotTimer = 0;
        return true;
      }
      case 'wall':
        this.begin(slot, sp, null, null);
        p.wallUntil = this.time + (sp.ms ?? 6000) / 1000;
        this.healPlayer(p.max * WALL_HEAL);
        return true;
      case 'rage':
        this.begin(slot, sp, null, null);
        p.rageUntil = this.time + (sp.ms ?? 8000) / 1000;
        return true;
      case 'revive':
        // nobody to wake when alone: it heals the caster instead
        this.begin(slot, sp, null, null);
        this.healPlayer((p.max * sp.power) / 100);
        return true;
      case 'blink': {
        const from = { x: p.x, z: p.z };
        const to = this.walkLine(from, p.facing, sp.range);
        if (dist(from, to) < 0.5) return this.fail('range');
        this.begin(slot, sp, to, null);
        p.x = to.x;
        p.z = to.z;
        this.emit({ type: 'blink', from, to });
        return true;
      }
    }
  }

  /** Spends the cooldowns, turns to the target and tells the renderer about the cast. */
  private begin(slot: number, sp: SpellDef, to: P2 | null, target: SimMob | null): void {
    const p = this.player;
    if (to && sp.kind !== 'blink') p.facing = Math.atan2(to.z - p.z, to.x - p.x);
    p.gcdUntil = this.time + GCD;
    p.cds[slot] = this.time + sp.cd / 1000;
    p.attackAt = this.time;
    if (target) p.target = target.id;
    this.emit({ type: 'cast', spell: sp.id, kind: sp.kind, from: { x: p.x, z: p.z }, to: to ? { x: to.x, z: to.z } : null, target: target ? target.id : null, facing: p.facing });
  }

  /** The monster a spell goes for: the target if it is within `range`, else the nearest one in front. */
  private pickMob(range: number): { mob: SimMob } | { fail: 'noTarget' | 'range' } {
    const p = this.player;
    const reach = (m: SimMob): number => range + RADIUS * m.size;
    const t = p.target !== null ? this.mobs.get(p.target) : undefined;
    if (t && !t.dead && t.state !== 'home' && dist(t, p) <= reach(t)) return { mob: t };
    let best: SimMob | null = null;
    let bestD = Infinity;
    for (const m of this.mobs.values()) {
      if (m.dead || m.state === 'home') continue;
      const d = dist(m, p);
      if (d > reach(m) || d >= bestD) continue;
      if (d > 0.5 && angleDiff(Math.atan2(m.z - p.z, m.x - p.x), p.facing) > FRONT_ARC) continue;
      best = m;
      bestD = d;
    }
    if (best) return { mob: best };
    return { fail: t && !t.dead ? 'range' : 'noTarget' };
  }

  private mobsNear(at: P2, r: number): SimMob[] {
    const out: SimMob[] = [];
    for (const m of this.mobs.values()) if (!m.dead && m.state !== 'home' && dist(m, at) <= r + RADIUS * m.size) out.push(m);
    return out;
  }

  /** Damage with the rage bonus and a little variance, as an integer. */
  private power(base: number): number {
    const raging = this.time < this.player.rageUntil;
    return Math.max(1, Math.round(base * vary() * (raging ? RAGE_MUL : 1)));
  }

  private strike(m: SimMob, sp: SpellDef): void {
    this.hitMob(m, this.power(sp.power), sp.id, sp.threat ?? 1);
  }

  /** Walks from `from` along `dir` for up to `len` units and returns the last place an actor can stand. */
  private walkLine(from: P2, dir: number, len: number): P2 {
    let last = { x: from.x, z: from.z };
    for (let s = 0.25; s <= len + EPS; s += 0.25) {
      const x = from.x + Math.cos(dir) * s;
      const z = from.z + Math.sin(dir) * s;
      if (!this.canStand(x, z)) break;
      last = { x, z };
    }
    return last;
  }

  /** Stormsteg: run to just in front of the monster. */
  private dash(m: SimMob): void {
    const p = this.player;
    const from = { x: p.x, z: p.z };
    const d = dist(from, m);
    const dir = Math.atan2(m.z - p.z, m.x - p.x);
    const len = Math.max(0, d - (1.1 + RADIUS * (m.size - 1)));
    const to = this.walkLine(from, dir, len);
    if (dist(from, to) > 0.2) {
      p.x = to.x;
      p.z = to.z;
      this.emit({ type: 'charge', who: 'player', from, to });
    }
    p.facing = dir;
  }

  private healPlayer(amount: number): void {
    const p = this.player;
    if (p.down) return;
    const gained = Math.min(p.max - p.hp, Math.round(amount));
    if (gained <= 0) return;
    p.hp += gained;
    this.emit({ type: 'heal', target: 'player', amount: gained, at: { x: p.x, z: p.z } });
  }

  // -------------------------------------------------------------------------
  // Damage, death
  // -------------------------------------------------------------------------

  private hitMob(m: SimMob, amount: number, spell: string, threatMul: number): void {
    if (m.dead || m.state === 'home') return;
    if (m.state === 'idle') this.pull(m);
    const n = Math.max(1, Math.round(amount));
    m.hp -= n;
    m.threat += n * threatMul;
    this.lastFight = this.time;
    this.emit({ type: 'damage', target: m.id, amount: n, at: { x: m.x, z: m.z }, spell });
    // a raging berserker heals a little from every blow
    if (this.time < this.player.rageUntil) this.healPlayer(Math.max(1, n * RAGE_LEECH));
    if (m.hp <= 0) {
      this.kill(m);
      return;
    }
    const boss = SAGA_BOSSES[m.species];
    if (boss && (m.kind === 'boss' || m.kind === 'mini')) {
      while (m.phase < boss.phases.length && m.hp / m.max <= boss.phases[m.phase]!) {
        const line = boss.yells.phase[m.phase] ?? boss.yells.phase[0] ?? '';
        m.phase++;
        if (line) this.emit({ type: 'yell', by: m.id, text: line });
        if (boss.phaseAdds) {
          const n2 = addCount(boss.phaseAdds.count, 1);
          for (let i = 0; i < n2; i++) {
            const ang = (i / n2) * Math.PI * 2 + Math.random();
            this.spawnAdd(boss.phaseAdds.species, m, ang, 3);
          }
        }
      }
    }
  }

  private spawnAdd(species: string, boss: SimMob, ang: number, r: number): void {
    const def = SAGA_MOBS[species];
    if (!def) return;
    let x = boss.x + Math.cos(ang) * r;
    let z = boss.z + Math.sin(ang) * r;
    if (!this.canStand(x, z)) {
      x = boss.x;
      z = boss.z;
    }
    const max = Math.round(def.hp * mobHpScale(1));
    const m: MobRT = {
      id: this.nextId++,
      species,
      kind: 'add',
      x,
      z,
      facing: Math.atan2(this.player.z - z, this.player.x - x),
      hp: max,
      max,
      state: 'fight',
      dead: false,
      diedAt: 0,
      stunUntil: 0,
      slowUntil: 0,
      home: { x, z },
      pack: -1,
      threat: 5,
      atkAt: -99,
      moving: false,
      phase: 0,
      cast: null,
      size: SMALL.has(species) ? 0.8 : 1,
      nextAtk: this.time + 0.8,
      next: [],
      castIdx: -1,
      stuck: 0,
    };
    this.mobs.set(m.id, m);
    this.emit({ type: 'spawn', id: m.id });
  }

  private kill(m: SimMob): void {
    m.hp = 0;
    m.dead = true;
    m.state = 'dead';
    m.diedAt = this.time;
    m.moving = false;
    m.cast = null;
    this.emit({ type: 'mobDied', id: m.id });
    if (this.player.target === m.id) this.player.target = null;
    if (m.pack >= 0) {
      const pack = this.packs[m.pack];
      if (pack && pack.members.every((id) => this.mobs.get(id)?.dead)) pack.dead = true;
    }
    const boss = SAGA_BOSSES[m.species];
    if (!boss || (m.kind !== 'boss' && m.kind !== 'mini')) return;
    this.dropZonesOf(m.id);
    this.removeAdds();
    this.emit({ type: 'yell', by: m.id, text: boss.yells.death });
    if (m.kind === 'mini') {
      this.gateOpen = true;
      if (this.world.saga) this.world.saga.gateOpen = true;
      this.fields.clear();
      this.emit({ type: 'gateOpen' });
    } else {
      this.cleared = true;
      this.emit({ type: 'cleared' });
    }
  }

  private removeAdds(): void {
    for (const a of this.mobs.values()) if (a.kind === 'add') this.removeAdd(a);
  }

  /** An add is sent away (or its boss fell): it is marked dead so the renderer lets it fade. */
  private removeAdd(a: SimMob): void {
    if (a.dead) return;
    a.hp = 0;
    a.dead = true;
    a.state = 'dead';
    a.diedAt = this.time;
    a.moving = false;
    this.emit({ type: 'mobDied', id: a.id });
  }

  private dropZonesOf(by: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i]!.by === by) this.zones.splice(i, 1);
  }

  /** A monster loses interest: full health, no grudge, a boss also drops its attack and its helpers. */
  private goHome(m: SimMob): void {
    if (m.dead) return;
    if (m.kind === 'add') {
      this.removeAdd(m);
      return;
    }
    m.state = 'home';
    m.threat = 0;
    m.hp = m.max;
    m.stunUntil = 0;
    m.slowUntil = 0;
    m.cast = null;
    (m as MobRT).stuck = 0;
    if (m.kind === 'boss' || m.kind === 'mini') {
      m.phase = 0;
      this.dropZonesOf(m.id);
      this.removeAdds();
    }
  }

  /** Wakes a monster and its whole pack. */
  private pull(m: SimMob): void {
    const group = m.pack >= 0 ? (this.packs[m.pack]?.members ?? []).map((id) => this.mobs.get(id)).filter((x): x is SimMob => !!x) : [m];
    if (!group.includes(m)) group.push(m);
    for (const g of group) {
      if (g.dead || g.state === 'fight') continue;
      const rt = g as MobRT;
      g.state = 'fight';
      g.threat = Math.max(g.threat, 1);
      rt.nextAtk = this.time + 0.6;
      const boss = SAGA_BOSSES[g.species];
      if (boss && (g.kind === 'boss' || g.kind === 'mini')) {
        g.phase = 0;
        rt.next = boss.moves.map((mv) => this.time + mv.first / 1000);
        this.emit({ type: 'yell', by: g.id, text: boss.yells.pull });
      }
    }
  }

  /** A stun: a normal monster stands dazed; a boss is only stopped in a big attack that can be stopped. */
  private stun(m: SimMob, ms: number): void {
    if (m.dead) return;
    if (m.kind === 'boss' || m.kind === 'mini') {
      const rt = m as MobRT;
      const mv = m.cast ? SAGA_BOSSES[m.species]?.moves[rt.castIdx] : undefined;
      if (!m.cast || !mv?.interrupt) return;
      this.dropZonesOf(m.id);
      const c = m.cast;
      m.cast = null;
      this.emit({ type: 'interrupt', by: m.id });
      this.emit({ type: 'bossMove', by: m.id, move: c.move, name: c.name, interrupted: true });
      return;
    }
    m.stunUntil = this.time + ms / 1000;
  }

  private hurtPlayer(raw: number, spell: string | undefined, by: SimMob): void {
    const p = this.player;
    if (p.down) return;
    let n = Math.max(1, Math.round(raw * mobDmgScale(1) * vary() * (this.time < p.wallUntil ? WALL_MUL : 1)));
    // one blow from more than half health never knocks you down
    if (n >= p.hp && p.hp > p.max * 0.5 && n < p.max) n = Math.max(1, Math.round(p.hp - 1));
    p.hp -= n;
    this.lastFight = this.time;
    this.emit({ type: 'damage', target: 'player', amount: n, at: { x: p.x, z: p.z }, ...(spell ? { spell } : {}) });
    if (p.hp > 0) return;
    p.hp = 0;
    p.down = true;
    p.downAt = this.time;
    p.moving = false;
    this.emit({ type: 'playerDown' });
    const boss = SAGA_BOSSES[by.species];
    if (boss && (by.kind === 'boss' || by.kind === 'mini')) this.emit({ type: 'yell', by: by.id, text: boss.yells.kill });
    for (const m of this.mobs.values()) if (m.state === 'fight') this.goHome(m);
    this.pending = this.pending.filter((s) => s.from === 'player');
  }

  private respawn(): void {
    const p = this.player;
    p.down = false;
    p.hp = p.max;
    p.x = p.checkpoint.x;
    p.z = p.checkpoint.z;
    p.target = null;
    p.wallUntil = p.rageUntil = p.slowUntil = p.hotUntil = 0;
    this.lastFight = this.time;
    this.emit({ type: 'playerUp' });
  }

  // -------------------------------------------------------------------------
  // Movement and collision
  // -------------------------------------------------------------------------

  private canStand(x: number, z: number): boolean {
    const w = this.walk;
    return w(x - RADIUS, z - RADIUS) && w(x + RADIUS, z - RADIUS) && w(x - RADIUS, z + RADIUS) && w(x + RADIUS, z + RADIUS);
  }

  /** Moves by (dx, dz), sliding along walls one axis at a time. An actor already stuck in a wall may walk out. */
  private slide(a: P2, dx: number, dz: number): void {
    const stuck = !this.canStand(a.x, a.z);
    const ok = (x: number, z: number): boolean => (stuck ? this.walk(x, z) : this.canStand(x, z));
    if (dx !== 0 && ok(a.x + dx, a.z)) a.x += dx;
    if (dz !== 0 && ok(a.x, a.z + dz)) a.z += dz;
  }

  private los(a: P2, b: P2): boolean {
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / 0.25));
    for (let i = 1; i <= n; i++) if (!this.walk(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
    return true;
  }

  /** How many steps every floor tile is from (tx, tz), so a monster finds its way around corners. */
  private field(tx: number, tz: number): Int16Array {
    tx = Math.min(MAP_W - 1, Math.max(0, tx));
    tz = Math.min(MAP_H - 1, Math.max(0, tz));
    const key = tz * MAP_W + tx;
    const cached = this.fields.get(key);
    if (cached) return cached;
    const f = new Int16Array(MAP_W * MAP_H).fill(-1);
    f[key] = 0;
    const q = [key];
    for (let i = 0; i < q.length; i++) {
      const k = q[i]!;
      const x = k % MAP_W;
      const y = (k - x) / MAP_W;
      const v = f[k]!;
      if (v >= 80) continue;
      for (let n = 0; n < 4; n++) {
        const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
        const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const j = ny * MAP_W + nx;
        if (f[j] !== -1 || !this.walk(nx + 0.5, ny + 0.5)) continue;
        f[j] = v + 1;
        q.push(j);
      }
    }
    if (this.fields.size >= 64) {
      const first = this.fields.keys().next().value;
      if (first !== undefined) this.fields.delete(first);
    }
    this.fields.set(key, f);
    return f;
  }

  /** Walks a monster towards a spot (around corners when the way straight is blocked). Returns whether it moved. */
  private steer(m: SimMob, goal: P2, speed: number): boolean {
    let gx = goal.x;
    let gz = goal.z;
    if (!this.los(m, goal)) {
      const f = this.field(Math.floor(goal.x), Math.floor(goal.z));
      const cx = Math.floor(m.x);
      const cz = Math.floor(m.z);
      let best = cx >= 0 && cz >= 0 && cx < MAP_W && cz < MAP_H ? f[cz * MAP_W + cx]! : -1;
      if (best >= 0) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
          const v = f[nz * MAP_W + nx]!;
          if (v >= 0 && v < best) {
            best = v;
            gx = nx + 0.5;
            gz = nz + 0.5;
          }
        }
      }
    }
    const dx = gx - m.x;
    const dz = gz - m.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return false;
    const s = Math.min(speed * STEP, d);
    const before = { x: m.x, z: m.z };
    this.slide(m, (dx / d) * s, (dz / d) * s);
    m.facing = Math.atan2(dz, dx);
    return m.x !== before.x || m.z !== before.z;
  }

  // -------------------------------------------------------------------------
  // The tick
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.acc += Math.min(Math.max(dt, 0), MAX_FRAME);
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP;
      this.step();
    }
  }

  private step(): void {
    this.time += STEP;
    this.fighting = false;
    for (const m of this.mobs.values()) if (m.state === 'fight') this.fighting = true;
    if (this.fighting) this.lastFight = this.time;
    this.stepPlayer();
    this.stepMobs();
    this.stepShots();
    this.stepZones();
  }

  private stepPlayer(): void {
    const p = this.player;
    if (p.down) {
      p.moving = false;
      if (this.time - p.downAt >= DOWN_S) this.respawn();
      return;
    }
    const slowed = this.time < p.slowUntil;
    const raging = this.time < p.rageUntil;
    p.speed = PLAYER_SPEED * (slowed ? SLOW_MUL : 1) * (raging ? RAGE_SPEED : 1);
    const len = Math.hypot(this.inX, this.inZ);
    p.moving = false;
    if (len > 0.01) {
      const before = { x: p.x, z: p.z };
      const s = p.speed * Math.min(1, len) * STEP;
      this.slide(p, (this.inX / len) * s, (this.inZ / len) * s);
      p.facing = Math.atan2(this.inZ, this.inX);
      p.moving = Math.abs(p.x - before.x) + Math.abs(p.z - before.z) > 1e-6;
    }
    // the healing ring
    if (this.time < p.hotUntil) {
      p.hp = Math.min(p.max, p.hp + this.hotPer * STEP);
      this.hotTimer += STEP;
      if (this.hotTimer >= 1 - EPS) {
        this.hotTimer = 0;
        this.emit({ type: 'heal', target: 'player', amount: Math.round(this.hotPer), at: { x: p.x, z: p.z } });
      }
    }
    // rest stones: they set the checkpoint and heal fast
    let near = -1;
    this.rests.forEach((r, i) => {
      if (dist(r, p) <= REST_RADIUS) near = i;
    });
    if (near >= 0 && near !== this.restIn) {
      const r = this.rests[near]!;
      this.emit({ type: 'rest', x: r.x, z: r.z });
      p.checkpoint = this.spotNear(r);
    }
    this.restIn = near;
    if (!this.fighting) {
      if (near >= 0) p.hp = Math.min(p.max, p.hp + p.max * REST_REGEN * STEP);
      else if (this.time - this.lastFight > CALM) p.hp = Math.min(p.max, p.hp + p.max * REGEN * STEP);
    }
  }

  /** Where a fallen player gets up: in front of the stone if that is free ground. */
  private spotNear(r: P2): P2 {
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]] as const) {
      if (this.canStand(r.x + dx, r.z + dz)) return { x: r.x + dx, z: r.z + dz };
    }
    return { x: r.x, z: r.z };
  }

  private stepMobs(): void {
    const p = this.player;
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const def = SAGA_BOSSES[m.species] ?? SAGA_MOBS[m.species];
      if (!def) continue;
      const rt = m as MobRT;
      const boss = m.kind === 'boss' || m.kind === 'mini';
      if (m.state === 'idle') {
        m.moving = false;
        const sight = boss ? 5 : (def as SagaMobDef).aggro;
        if (!p.down && dist(m, p) <= sight && this.los(m, p)) this.pull(m);
        continue;
      }
      if (m.state === 'home') {
        const before = { x: m.x, z: m.z };
        const moved = this.steer(m, m.home, def.speed * HOME_SPEED);
        m.moving = moved;
        rt.stuck = moved && Math.abs(m.x - before.x) + Math.abs(m.z - before.z) > 1e-4 ? 0 : rt.stuck + STEP;
        if (dist(m, m.home) < 0.15 || rt.stuck > 1) {
          m.x = m.home.x;
          m.z = m.home.z;
          m.moving = false;
          m.facing = Math.PI / 2;
          m.state = 'idle';
          m.hp = m.max;
        }
        continue;
      }
      // fighting
      if (p.down) {
        this.goHome(m);
        continue;
      }
      const far = boss ? dist(p, m.home) > LEASH_TILES : dist(m, m.home) > LEASH_TILES || dist(m, p) > LEASH_TILES;
      if (far) {
        this.goHome(m);
        continue;
      }
      if (this.time < m.stunUntil) {
        m.moving = false;
        continue;
      }
      if (m.cast) {
        m.moving = false;
        if (this.time >= m.cast.at) this.landCast(m);
        continue;
      }
      if (boss && this.startCast(m)) continue;
      const reach = def.reach;
      const ranged = reach > 2.5;
      const d = dist(m, p);
      const see = !ranged || this.los(m, p);
      if (d <= reach && see && this.time >= rt.nextAtk) this.attack(m, def);
      if (p.down) continue;
      const stop = ranged ? reach : reach * 0.8;
      if (d <= stop && see) {
        m.moving = false;
        m.facing = Math.atan2(p.z - m.z, p.x - m.x);
        continue;
      }
      const slow = this.time < m.slowUntil ? 0.5 : 1;
      const before = { x: m.x, z: m.z };
      m.moving = this.steer(m, p, def.speed * slow);
      if (boss && dist(m, m.home) > BOSS_HALL && dist(m, m.home) > dist(before, m.home)) {
        // a boss stops at the edge of its hall
        m.x = before.x;
        m.z = before.z;
        m.moving = false;
      }
    }
    this.pushApart();
  }

  private attack(m: SimMob, def: SagaMobDef | SagaBossDef): void {
    const p = this.player;
    const rt = m as MobRT;
    rt.nextAtk = this.time + (def as { atkMs: number }).atkMs / 1000;
    m.atkAt = this.time;
    m.facing = Math.atan2(p.z - m.z, p.x - m.x);
    if (def.reach > 2.5) {
      const from = { x: m.x, z: m.z };
      const to = { x: p.x, z: p.z };
      const arrive = this.time + dist(from, to) / MOB_BOLT_SPEED;
      this.emit({ type: 'bolt', spell: `mob_${m.species}`, from, to, target: 'player', arrive });
      this.pending.push({ from: 'mob', arrive, spell: `mob_${m.species}`, mob: m.id, amount: def.dmg, slows: !!(def as SagaMobDef).slows, lance: null });
    } else {
      this.hurtPlayer(def.dmg, undefined, m);
    }
  }

  /** Monsters in a fight do not stand inside each other. */
  private pushApart(): void {
    const fighters: SimMob[] = [];
    for (const m of this.mobs.values()) if (m.state === 'fight') fighters.push(m);
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i]!;
        const b = fighters[j]!;
        const min = RADIUS * (a.size + b.size);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const push = (min - d) / 2;
        this.slide(a, -nx * push, -nz * push);
        this.slide(b, nx * push, nz * push);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Bolts in the air
  // -------------------------------------------------------------------------

  private stepShots(): void {
    if (!this.pending.length) return;
    const left: Pending[] = [];
    for (const s of this.pending) {
      if (this.time + EPS < s.arrive) {
        left.push(s);
        continue;
      }
      const m = this.mobs.get(s.mob);
      if (s.from === 'mob') {
        if (!m || this.player.down) continue;
        this.hurtPlayer(s.amount, s.spell, m);
        if (s.slows && !this.player.down) this.player.slowUntil = this.time + SHOT_SLOW_S;
        continue;
      }
      if (!m || m.dead || m.state === 'home') continue;
      this.hitMob(m, s.amount, s.spell, SPELLS[s.spell]?.threat ?? 1);
      if (s.lance && !m.dead) {
        m.slowUntil = this.time + (s.lance.ms ?? 3000) / 1000;
        // the ice also stops a boss's big attack
        this.stun(m, 0);
      }
    }
    this.pending = left;
  }

  // -------------------------------------------------------------------------
  // Boss attacks: marked on the floor, then they land
  // -------------------------------------------------------------------------

  private addZone(by: SimMob, z: Omit<SimZone, 'id' | 'by' | 'born'>): string {
    const zone: ZoneRT = { ...z, id: `z${this.zoneSeq++}`, by: by.id, born: this.time, landed: false, tickAt: 0 };
    this.zones.push(zone);
    return zone.id;
  }

  /** Starts the next ready attack, if any. True if the boss is now busy with it. */
  private startCast(m: SimMob): boolean {
    const boss = SAGA_BOSSES[m.species];
    const rt = m as MobRT;
    if (!boss) return false;
    const i = boss.moves.findIndex((mv, k) => (mv.phase ?? 0) <= m.phase && this.time >= (rt.next[k] ?? Infinity));
    if (i < 0) return false;
    const mv: BossAbility = boss.moves[i]!;
    rt.next[i] = this.time + (mv.every + mv.warn) / 1000;
    // the ice prison needs a friend to break it: never on someone alone
    if (mv.move === 'freeze') return false;
    const p = this.player;
    const at = this.time + mv.warn / 1000;
    const ids: string[] = [];
    const lingers = mv.linger ? { until: at + mv.linger / 1000 } : {};
    const circle = (x: number, z: number, r: number, extra: Partial<SimZone> = {}): void => {
      ids.push(this.addZone(m, { shape: 'circle', x, z, r, at, dmg: mv.dmg, ...extra }));
    };
    switch (mv.move) {
      case 'cleave':
        ids.push(this.addZone(m, { shape: 'cone', x: m.x, z: m.z, r: mv.radius, dir: Math.atan2(p.z - m.z, p.x - m.x), arc: mv.arc ?? 90, at, dmg: mv.dmg }));
        break;
      case 'slam':
      case 'nova':
        circle(m.x, m.z, mv.radius);
        break;
      case 'rain':
      case 'pools':
        circle(p.x, p.z, mv.radius, lingers);
        for (let k = 0; k < (mv.count ?? 0); k++) {
          const ang = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * 3;
          const x = p.x + Math.cos(ang) * r;
          const z = p.z + Math.sin(ang) * r;
          if (this.walk(x, z)) circle(x, z, mv.radius, lingers);
        }
        break;
      case 'charge':
        circle(p.x, p.z, mv.radius);
        break;
      case 'summon':
        break;
    }
    m.cast = { move: mv.move, name: mv.name, at, started: this.time, zones: ids };
    rt.castIdx = i;
    m.facing = Math.atan2(p.z - m.z, p.x - m.x);
    m.moving = false;
    this.emit({ type: 'bossMove', by: m.id, move: mv.move, name: mv.name });
    return true;
  }

  private inZone(z: SimZone, a: P2): boolean {
    const d = Math.hypot(a.x - z.x, a.z - z.z);
    if (d > z.r) return false;
    if (z.shape === 'circle' || d < 0.6) return true;
    return angleDiff(Math.atan2(a.z - z.z, a.x - z.x), z.dir ?? 0) <= (((z.arc ?? 90) / 2) * Math.PI) / 180;
  }

  /** The attack lands: whoever still stands in its marks is hit. */
  private landCast(m: SimMob): void {
    const rt = m as MobRT;
    const cast = m.cast!;
    m.cast = null;
    const boss = SAGA_BOSSES[m.species]!;
    const mv = boss.moves[rt.castIdx]!;
    const zs = cast.zones.map((id) => this.zones.find((z) => z.id === id) as ZoneRT | undefined).filter((z): z is ZoneRT => !!z);
    const p = this.player;
    if (mv.move === 'charge' && zs[0]) {
      // the boss lands where the mark was
      const from = { x: m.x, z: m.z };
      const to = { x: zs[0].x, z: zs[0].z };
      if (this.canStand(to.x, to.z)) {
        m.x = to.x;
        m.z = to.z;
        this.emit({ type: 'charge', who: m.id, from, to });
      }
    }
    for (const z of zs) {
      if (!p.down && this.inZone(z, p)) this.hurtPlayer(mv.dmg, `boss_${mv.move}`, m);
      if (z.until !== undefined) {
        // burning ground stays a while, hurting a little every second
        z.landed = true;
        z.tickAt = this.time + 1;
      } else {
        const k = this.zones.indexOf(z);
        if (k >= 0) this.zones.splice(k, 1);
      }
    }
    if (mv.move === 'summon' && mv.add) {
      const n = addCount(mv.count ?? 2, 1);
      for (let i = 0; i < n; i++) this.spawnAdd(mv.add, m, (i / n) * Math.PI * 2, 2);
    }
  }

  private stepZones(): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i] as ZoneRT;
      if (z.until === undefined || !z.landed) continue;
      if (this.time >= z.until) {
        this.zones.splice(i, 1);
        continue;
      }
      if (this.time + EPS < z.tickAt) continue;
      z.tickAt += 1;
      const by = this.mobs.get(z.by);
      if (by && !this.player.down && this.inZone(z, this.player)) this.hurtPlayer(z.dmg, 'boss_pools', by);
    }
  }
}
