// One level being played: the map, Hilda, the animals, the bits flying about and the camera.
// Units are LCD pixels and seconds; the update runs at a fixed 60 Hz.
import type { LevelDef } from './levels.ts';

export const TS = 8;
export const HUD_H = 10;
export const VIEW_W = 160;
export const VIEW_H = 144;

// ---- tiles
export const EMPTY = 0;
export const GROUND = 1;
export const BLOCK = 2;
export const PLANK = 3;
export const WATER = 4;
export const THORN = 5;
export const CRUMBLE = 6;
export const ICE = 7;
export const SPRING = 8;
export const LINE = 9;

const SOLID = [false, true, true, false, false, true, true, true, true, false];
const CHAR_TILE: Record<string, number> = { '#': GROUND, B: BLOCK, '=': PLANK, '~': WATER, '*': THORN, x: CRUMBLE, i: ICE, '^': SPRING, L: LINE, u: BLOCK };

// ---- Hilda
export const HEN_W = 10;
export const HEN_H = 12;
const RUN = 82;
const GRAVITY = 760;
const JUMP_V = 244;
const CUT_V = 75;
const MAX_FALL = 230;
export const FLAPS = 3;
const FLAP_T = 0.27;
const FLAP_LIFT = 32;
const GLIDE_G = 380;
const GLIDE_FALL = 40;
const TIRED_FALL = 105;
const COYOTE = 0.1;
const BUFFER = 0.14;
const SPRING_V = 340;
const SPRING_HELD = 382;
const LINE_V = 250;
const LINE_HELD = 300;
const BOP_V = 205;
const BOP_HELD = 275;

// ---- particles
export const P_DUST = 0;
export const P_FEATHER = 1;
export const P_SPARK = 2;
export const P_TEXT = 3;
export const P_LEAF = 4;
export const P_SNOW = 5;
export const P_SMOKE = 6;
export const P_STREAK = 7;
export const P_DROP = 8;
export const P_HAY = 9;
export const P_HEART = 10;
export const P_STAR = 11;
export const P_FLY = 12;
export const P_NOTE = 13;
export const P_ZZZ = 14;

export interface Part {
  k: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  g: number;
  c: number;
  s: string;
  seed: number;
}

export type Kind = 'egg' | 'gold' | 'fox' | 'hog' | 'crow' | 'bird' | 'mover' | 'scare' | 'house' | 'draft' | 'lantern' | 'sign' | 'spring' | 'line';

export class Ent {
  k: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx = 0;
  vy = 0;
  dir = 1;
  /** State (what it means depends on the kind). */
  st = 0;
  /** Time in this state. */
  t = 0;
  dead = false;
  x0: number;
  y0: number;
  x1 = 0;
  y1 = 0;
  ph = 0;
  dx = 0;
  dy = 0;
  n = 0;
  constructor(k: Kind, x: number, y: number, w: number, h: number) {
    this.k = k;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.x0 = x;
    this.y0 = y;
  }
}

// creature states
export const FOX_WALK = 0;
export const FOX_DIZZY = 1;
export const FOX_RUN = 2;
/** Night: curled up asleep until Hilda walks close. */
export const FOX_SLEEP = 3;
export const FOX_WAKE = 4;
export const CROW_PERCH = 0;
export const CROW_ALERT = 1;
export const CROW_SWOOP = 2;
export const CROW_BACK = 3;
export const CROW_SCARED = 4;

export interface Hen {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  ground: boolean;
  /** The tile under her feet. */
  on: number;
  coyote: number;
  buffer: number;
  flaps: number;
  flapT: number;
  /** Rising from a jump while the button is held (for the variable height). */
  jumping: boolean;
  inv: number;
  stun: number;
  sx: number;
  sy: number;
  ride: Ent | null;
  chain: number;
  anim: number;
  idle: number;
  blink: number;
  hidden: boolean;
  inDraft: boolean;
  /** Seconds since she last pressed or held anything (for the idle pecking). */
  still: number;
}

/** What the player is doing with the controller this step. */
export interface Ctl {
  x: number;
  jump: boolean;
  hold: boolean;
}

/** The game around the level: the score, the hearts, the sounds. */
export interface Hooks {
  sfx(name: string): void;
  egg(e: Ent): void;
  gold(e: Ent): void;
  bop(e: Ent, chain: number): void;
  checkpoint(e: Ent): void;
  /** Hilda got hurt (by a creature or thorns); returns false when that was her last heart. */
  hurt(): boolean;
  /** Fell into a hole or the water. */
  fell(water: boolean): void;
  /** Reached the hen house. */
  home(): void;
}

export interface Crumb {
  t: number;
  /** 0 whole, 1 shaking, 2 gone */
  st: number;
}

const approach = (v: number, target: number, step: number): number => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

/** A small seeded random so a level looks the same each time. */
export function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}

export class World {
  readonly def: LevelDef;
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
  readonly ents: Ent[] = [];
  readonly parts: Part[] = [];
  readonly crumbs = new Map<number, Crumb>();
  readonly hen: Hen;
  readonly maxParts: number;
  camX = 0;
  camY = -HUD_H;
  shake = 0;
  /** Freeze frames after a hit, for weight. */
  hitstop = 0;
  time = 0;
  /** Seconds played in this level (the clock for the time bonus). */
  clock = 0;
  eggs = 0;
  eggsGot = 0;
  golds = 0;
  goldsGot = 0;
  checkX = 0;
  checkY = 0;
  /** −1…1: the wind pushing sideways right now (rooftop). */
  wind = 0;
  /** The wind is about to blow (streaks, warning sound). */
  windWarn = 0;
  private windT = 0;
  private windN = 0;
  /** Walking into the hen house by herself. */
  auto = false;
  houseClosed = false;
  private hooks: Hooks;

  constructor(def: LevelDef, hooks: Hooks, quality: 'high' | 'low') {
    this.def = def;
    this.hooks = hooks;
    this.maxParts = quality === 'low' ? 70 : 170;
    const rows = def.map;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    this.hen = {
      x: 16,
      y: 100,
      vx: 0,
      vy: 0,
      face: 1,
      ground: false,
      on: EMPTY,
      coyote: 0,
      buffer: 0,
      flaps: FLAPS,
      flapT: 0,
      jumping: false,
      inv: 0,
      stun: 0,
      sx: 1,
      sy: 1,
      ride: null,
      chain: 0,
      anim: 0,
      idle: 0,
      blink: 2,
      hidden: false,
      inDraft: false,
      still: 0,
    };
    this.load(rows);
    this.checkX = this.hen.x;
    this.checkY = this.hen.y;
    this.updateCamera(1, true);
  }

  // ------------------------------------------------------------------ the map

  private load(rows: string[]): void {
    const springRuns: [number, number, number][] = [];
    const lineRuns: [number, number, number][] = [];
    for (let r = 0; r < this.h; r++) {
      const row = rows[r]!;
      let sStart = -1;
      let lStart = -1;
      for (let c = 0; c <= this.w; c++) {
        const ch = row[c] ?? '.';
        // runs of springs and clothes lines become one thing each
        if (ch === '^' && sStart < 0) sStart = c;
        if (ch !== '^' && sStart >= 0) {
          springRuns.push([sStart, c - 1, r]);
          sStart = -1;
        }
        if (ch === 'L' && lStart < 0) lStart = c;
        if (ch !== 'L' && lStart >= 0) {
          lineRuns.push([lStart, c - 1, r]);
          lStart = -1;
        }
        if (c >= this.w) break;
        this.tiles[r * this.w + c] = CHAR_TILE[ch] ?? EMPTY;
        const x = c * TS;
        const y = r * TS;
        const feet = y + TS;
        switch (ch) {
          case 'P':
            this.hen.x = x + TS / 2 - HEN_W / 2;
            this.hen.y = feet - HEN_H;
            break;
          case 'o':
            this.ents.push(new Ent('egg', x + 1, y, 6, 8));
            this.eggs++;
            break;
          case 'G':
            this.ents.push(new Ent('gold', x, y - 2, 8, 10));
            this.golds++;
            break;
          case 'f': {
            const e = new Ent('fox', x - 3, feet - 9, 14, 9);
            e.dir = -1;
            if (this.def.place === 'night') e.st = FOX_SLEEP;
            this.ents.push(e);
            break;
          }
          case 'h': {
            const e = new Ent('hog', x - 2, feet - 7, 11, 7);
            e.dir = -1;
            this.ents.push(e);
            break;
          }
          case 'c':
            this.ents.push(new Ent('crow', x - 1, feet - 8, 10, 8));
            break;
          case 'b': {
            const e = new Ent('bird', x - 3, y, 12, 7);
            e.ph = hash(c * 31 + r) * 6;
            this.ents.push(e);
            break;
          }
          case 'M': {
            let n = 0;
            while (row[c + 1 + n] === '-') n++;
            const e = new Ent('mover', x, y, 24, 8);
            e.x1 = x + Math.max(0, n - 2) * TS;
            e.y1 = y;
            this.ents.push(e);
            break;
          }
          case 'V': {
            let n = 0;
            while (rows[r + 1 + n]?.[c] === '|') n++;
            const e = new Ent('mover', x, y, 24, 8);
            e.x1 = x;
            e.y1 = y + n * TS;
            e.ph = Math.PI;
            this.ents.push(e);
            break;
          }
          case 'S':
            this.ents.push(new Ent('scare', x - 4, feet - 24, 16, 24));
            break;
          case 'H':
            this.ents.push(new Ent('house', x, feet - 32, 32, 32));
            break;
          case 'u':
            this.ents.push(new Ent('draft', x - 6, y - 8 * TS, 20, 8 * TS));
            break;
          case 'l':
            this.ents.push(new Ent('lantern', x + 1, y, 6, 7));
            break;
          case 's':
            this.ents.push(new Ent('sign', x - 2, feet - 10, 12, 10));
            break;
        }
      }
    }
    for (const [a, b, r] of springRuns)
      for (let c = a; c <= b; c += 2) {
        this.ents.push(new Ent('spring', c * TS, r * TS, Math.min(2, b - c + 1) * TS, TS));
      }
    for (const [a, b, r] of lineRuns) {
      const e = new Ent('line', a * TS, r * TS, (b - a + 1) * TS, 2);
      this.ents.push(e);
    }
    // fireflies and lanterns light the night
  }

  tile(c: number, r: number): number {
    if (c < 0 || c >= this.w) return BLOCK;
    if (r < 0 || r >= this.h) return EMPTY;
    const t = this.tiles[r * this.w + c]!;
    if (t === CRUMBLE && (this.crumbs.get(r * this.w + c)?.st ?? 0) === 2) return EMPTY;
    return t;
  }

  tileAt(x: number, y: number): number {
    return this.tile(Math.floor(x / TS), Math.floor(y / TS));
  }

  solidAt(x: number, y: number): boolean {
    return SOLID[this.tileAt(x, y)]!;
  }

  /** Something a creature can walk on. */
  private floorAt(x: number, y: number): boolean {
    const t = this.tileAt(x, y);
    return SOLID[t]! || t === PLANK;
  }

  // ------------------------------------------------------------------ the step

  update(dt: number, ctl: Ctl): void {
    this.time += dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.updateParts(dt * 0.25);
      return;
    }
    if (!this.auto) this.clock += dt;
    this.updateWind(dt);
    this.updateMovers(dt);
    this.updateHen(dt, ctl);
    this.updateEnts(dt);
    this.updateCrumbs(dt);
    this.updateWeather(dt);
    this.updateParts(dt);
    this.updateCamera(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }

  /** Keep the place alive while nobody plays (cards, falls): bits fly and the weather falls. */
  tick(dt: number): void {
    this.time += dt;
    this.updateWeather(dt);
    this.updateParts(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }

  // ------------------------------------------------------------------ Hilda

  private updateHen(dt: number, c: Ctl): void {
    const h = this.hen;
    h.anim += dt;
    h.inv = Math.max(0, h.inv - dt);
    h.stun = Math.max(0, h.stun - dt);
    h.sx += (1 - h.sx) * Math.min(1, dt * 12);
    h.sy += (1 - h.sy) * Math.min(1, dt * 12);
    h.blink -= dt;
    if (h.blink < -0.13) h.blink = 2 + Math.random() * 2.5;
    if (h.hidden) return;

    if (this.auto) return this.walkHome(dt);
    this.lastHold = c.hold;

    // standing on a moving bale: go along with it
    const startBottom = h.y + HEN_H;
    if (h.ride) {
      const m = h.ride;
      this.moveX(m.dx);
      h.y = m.y - HEN_H;
    }

    const control = h.stun > 0 ? 0 : c.x;
    if (control !== 0) h.face = control;
    if (control !== 0 || c.hold) h.still = 0;
    else h.still += dt;

    const onIce = h.ground && h.on === ICE;
    let accel: number;
    let decel: number;
    if (h.ground) {
      const turning = control !== 0 && h.vx !== 0 && Math.sign(h.vx) !== control;
      accel = onIce ? 230 : turning ? 1700 : 820;
      decel = onIce ? 70 : 1100;
      if (turning && !onIce && Math.abs(h.vx) > 40) this.dust(h.x + HEN_W / 2, h.y + HEN_H, 1);
    } else {
      accel = 600;
      decel = 260;
    }
    if (control !== 0) h.vx = approach(h.vx, control * RUN, accel * dt);
    else h.vx = approach(h.vx, 0, decel * dt);

    // jumping, with a grace time on both sides
    h.buffer = c.jump ? BUFFER : Math.max(0, h.buffer - dt);
    h.coyote = h.ground ? COYOTE : Math.max(0, h.coyote - dt);
    let jumped = false;
    if (h.buffer > 0 && h.coyote > 0 && h.stun <= 0) {
      jumped = true;
      h.vy = -JUMP_V;
      h.ground = false;
      h.coyote = 0;
      h.buffer = 0;
      h.jumping = true;
      h.ride = null;
      h.flaps = FLAPS;
      h.flapT = 0;
      h.sx = 0.72;
      h.sy = 1.32;
      this.dust(h.x + HEN_W / 2, h.y + HEN_H, 2);
      this.hooks.sfx('jump');
    }
    if (h.jumping && (!c.hold || h.vy >= 0)) {
      if (h.vy < -CUT_V) h.vy = -CUT_V;
      h.jumping = false;
    }

    // flapping: hold the button in the air for a few slow flaps
    let g = GRAVITY;
    let maxFall = MAX_FALL;
    h.inDraft = false;
    const draft = this.ents.find((e) => e.k === 'draft' && overlap(h.x, h.y, HEN_W, HEN_H, e.x, e.y, e.w, e.h));
    if (!h.ground && c.hold && h.stun <= 0) {
      if (draft) {
        // warm air from the chimney: ride it up without tiring
        h.inDraft = true;
        h.vy = Math.max(-135, h.vy - 1150 * dt);
        if (h.flapT <= 0) h.flapT = FLAP_T;
        g = 0;
      } else if (!jumped && h.flapT <= 0 && h.flaps > 0 && h.coyote <= 0 && (h.vy > -25 || c.jump)) {
        h.flaps--;
        h.flapT = FLAP_T;
        h.vy = Math.min(h.vy, -FLAP_LIFT);
        h.sx = 1.15;
        h.sy = 0.9;
        if (Math.random() < 0.7) this.feather(h.x + 2, h.y + 4, 1);
        this.hooks.sfx('flap');
      }
      if (h.flapT > 0) {
        if (!h.inDraft) {
          g = GLIDE_G;
          maxFall = GLIDE_FALL;
        }
      } else if (h.flaps === 0) maxFall = TIRED_FALL;
    } else if (!h.ground && draft && h.stun <= 0) {
      h.vy -= 420 * dt;
    }
    if (h.flapT > 0) h.flapT = c.hold ? h.flapT - dt : 0;

    if (h.vy > maxFall) h.vy = Math.max(maxFall, h.vy - 1400 * dt);
    else h.vy = Math.min(maxFall, h.vy + g * dt);

    // the wind pushes harder in the air, and hardest on spread wings
    let push = 0;
    if (this.wind !== 0) push = this.wind * (h.ground ? 30 : h.flapT > 0 ? 74 : 54);

    const fallSpeed = h.vy;
    this.moveX((h.vx + push) * dt);
    this.moveY(h.vy * dt, startBottom, fallSpeed, c.hold);
    if (h.ride && !h.ground) h.ride = null;

    // running animation clock
    if (h.ground && Math.abs(h.vx) > 8) {
      h.idle = 0;
      if (Math.random() < dt * 3 * (Math.abs(h.vx) / RUN) && this.def.place !== 'roof') this.dust(h.x + HEN_W / 2 - h.face * 4, h.y + HEN_H, 0);
    } else h.idle += dt;

    // hazards: water and holes
    const feetY = h.y + HEN_H;
    if (this.tileAt(h.x + HEN_W / 2, feetY - 3) === WATER) {
      this.splash(h.x + HEN_W / 2, Math.floor((feetY - 3) / TS) * TS + 2);
      this.hooks.fell(true);
      return;
    }
    if (h.y > this.h * TS + 24) {
      this.hooks.fell(false);
      return;
    }
    this.touchThings();
  }

  private moveX(dx: number): void {
    const h = this.hen;
    if (dx === 0) return;
    h.x += dx;
    const top = Math.floor((h.y + 1) / TS);
    const bot = Math.floor((h.y + HEN_H - 1) / TS);
    if (dx > 0) {
      const col = Math.floor((h.x + HEN_W) / TS);
      for (let r = top; r <= bot; r++)
        if (SOLID[this.tile(col, r)]) {
          h.x = col * TS - HEN_W;
          if (h.vx > 0) h.vx = 0;
          break;
        }
    } else {
      const col = Math.floor(h.x / TS);
      for (let r = top; r <= bot; r++)
        if (SOLID[this.tile(col, r)]) {
          h.x = (col + 1) * TS;
          if (h.vx < 0) h.vx = 0;
          break;
        }
    }
  }

  private moveY(dy: number, prevBottom: number, fallSpeed: number, held: boolean): void {
    const h = this.hen;
    h.y += dy;
    h.ground = false;
    const c0 = Math.floor((h.x + 1) / TS);
    const c1 = Math.floor((h.x + HEN_W - 1) / TS);
    if (dy >= 0) {
      const row = Math.floor((h.y + HEN_H) / TS);
      const top = row * TS;
      let best = -1;
      let bestCol = c0;
      for (let col = c0; col <= c1; col++) {
        const t = this.tile(col, row);
        const stand = SOLID[t] || ((t === PLANK || t === LINE) && prevBottom <= top + 0.5);
        if (!stand) continue;
        // springs and lines win over plain ground; thorns lose to anything safe
        const rank = t === SPRING ? 4 : t === LINE ? 3 : t === THORN ? 0 : 2;
        const bestRank = best < 0 ? -1 : best === SPRING ? 4 : best === LINE ? 3 : best === THORN ? 0 : 2;
        if (rank > bestRank) {
          best = t;
          bestCol = col;
        }
      }
      if (best >= 0 && h.y + HEN_H >= top) {
        h.y = top - HEN_H;
        this.land(best, bestCol, row, fallSpeed, held);
        return;
      }
      // moving bales
      for (const m of this.ents) {
        if (m.k !== 'mover') continue;
        if (h.x + HEN_W - 1 <= m.x || h.x + 1 >= m.x + m.w) continue;
        if (prevBottom <= m.y - m.dy + 0.6 && h.y + HEN_H >= m.y) {
          h.y = m.y - HEN_H;
          h.ride = m;
          this.land(BLOCK, -1, -1, fallSpeed, held);
          return;
        }
      }
    } else {
      const row = Math.floor(h.y / TS);
      const hitL = SOLID[this.tile(c0, row)];
      const hitR = SOLID[this.tile(c1, row)];
      if (!hitL && !hitR) return;
      // only clipping a corner: slide past it instead of bonking
      if (c0 !== c1 && hitR && !hitL && h.x + HEN_W - c1 * TS <= 3) {
        h.x = c1 * TS - HEN_W;
        return;
      }
      if (c0 !== c1 && hitL && !hitR && (c0 + 1) * TS - (h.x + 1) <= 3) {
        h.x = (c0 + 1) * TS - 1;
        return;
      }
      h.y = (row + 1) * TS;
      h.vy = 20;
      h.jumping = false;
      this.hooks.sfx('bonk');
    }
  }

  private land(t: number, col: number, row: number, fallSpeed: number, held: boolean): void {
    const h = this.hen;
    if (t === SPRING) {
      h.vy = -(held ? SPRING_HELD : SPRING_V);
      h.jumping = false;
      h.flaps = FLAPS;
      h.flapT = 0;
      h.ride = null;
      h.sx = 0.7;
      h.sy = 1.4;
      const s = this.ents.find((e) => e.k === 'spring' && col * TS >= e.x && col * TS < e.x + e.w && e.y === row * TS);
      if (s) s.t = 0.001;
      this.hooks.sfx('spring');
      this.dust(h.x + HEN_W / 2, h.y + HEN_H, 2);
      return;
    }
    if (t === LINE) {
      h.vy = -(held ? LINE_HELD : LINE_V);
      h.jumping = false;
      h.flaps = FLAPS;
      h.flapT = 0;
      h.sx = 0.8;
      h.sy = 1.25;
      const l = this.ents.find((e) => e.k === 'line' && h.x + HEN_W / 2 >= e.x - 4 && h.x + HEN_W / 2 <= e.x + e.w + 4 && e.y === row * TS);
      if (l) {
        l.t = 0.001;
        l.n = h.x + HEN_W / 2 - l.x;
      }
      this.hooks.sfx('boing');
      return;
    }
    if (t === THORN) {
      if (!this.hurt(h.x + HEN_W / 2 - h.face * 6)) return;
      h.vy = -230;
      return;
    }
    h.vy = 0;
    h.ground = true;
    h.on = t;
    h.flaps = FLAPS;
    h.flapT = 0;
    h.jumping = false;
    if (fallSpeed > 140) {
      h.sx = 1.32;
      h.sy = 0.72;
      this.dust(h.x + HEN_W / 2, h.y + HEN_H, 3);
      this.hooks.sfx('land');
    } else if (fallSpeed > 60) {
      h.sx = 1.15;
      h.sy = 0.88;
    }
    h.chain = 0;
    if (t === CRUMBLE && col >= 0) {
      // the tiles under both feet start to give way
      const c0 = Math.floor((h.x + 1) / TS);
      const c1 = Math.floor((h.x + HEN_W - 1) / TS);
      for (let cc = c0; cc <= c1; cc++) if (this.tile(cc, row) === CRUMBLE) this.stepOnCrumble(cc, row);
    }
  }

  private stepOnCrumble(col: number, row: number): void {
    const k = row * this.w + col;
    const cr = this.crumbs.get(k);
    if (!cr) {
      this.crumbs.set(k, { t: 0, st: 1 });
      this.hooks.sfx('crumble');
    } else if (cr.st === 0) {
      cr.st = 1;
      cr.t = 0;
      this.hooks.sfx('crumble');
    }
  }

  private updateCrumbs(dt: number): void {
    const h = this.hen;
    // standing on crumbling hay keeps it going
    if (h.ground && h.on === CRUMBLE) {
      const row = Math.floor((h.y + HEN_H + 1) / TS);
      for (let col = Math.floor((h.x + 1) / TS); col <= Math.floor((h.x + HEN_W - 1) / TS); col++) if (this.tiles[row * this.w + col] === CRUMBLE) this.stepOnCrumble(col, row);
    }
    for (const [k, cr] of this.crumbs) {
      cr.t += dt;
      if (cr.st === 1 && cr.t > 0.5) {
        cr.st = 2;
        cr.t = 0;
        const x = (k % this.w) * TS;
        const y = Math.floor(k / this.w) * TS;
        for (let i = 0; i < 5; i++) this.part(P_HAY, x + Math.random() * 8, y + Math.random() * 6, (Math.random() - 0.5) * 30, Math.random() * 20, 0.9, 300);
        // anything standing on it falls
        if (h.ground && h.on === CRUMBLE) {
          const row = Math.floor((h.y + HEN_H + 1) / TS);
          if (row === Math.floor(k / this.w)) h.ground = false;
        }
      } else if (cr.st === 2 && cr.t > 3.2) {
        // grows back, but not into Hilda
        const x = (k % this.w) * TS;
        const y = Math.floor(k / this.w) * TS;
        if (!overlap(h.x, h.y, HEN_W, HEN_H, x, y, TS, TS)) this.crumbs.delete(k);
      }
    }
  }

  /** Can she still hold on (true), or was that the last heart (false)? */
  hurt(fromX: number): boolean {
    const h = this.hen;
    if (h.inv > 0) return true;
    const alive = this.hooks.hurt();
    h.inv = 1.7;
    h.stun = 0.3;
    const away = Math.sign(h.x + HEN_W / 2 - fromX) || -h.face;
    h.vx = away * 115;
    h.vy = -175;
    h.ground = false;
    h.ride = null;
    h.jumping = false;
    h.flapT = 0;
    h.sx = 1.3;
    h.sy = 0.8;
    this.feather(h.x + HEN_W / 2, h.y + 6, 8);
    this.shake = 0.28;
    this.hitstop = 0.11;
    return alive;
  }

  /** Start somewhere else in the level (the lab's level select): on the highest floor in that column. */
  placeAt(col: number): void {
    col = Math.max(1, Math.min(this.w - 2, Math.floor(col)));
    for (let r = 1; r < this.h; r++) {
      const t = this.tile(col, r);
      if ((SOLID[t] || t === PLANK) && this.tile(col, r - 1) === EMPTY && this.tile(col, r - 2) === EMPTY) {
        this.hen.x = col * TS + TS / 2 - HEN_W / 2;
        this.hen.y = r * TS - HEN_H;
        this.checkX = this.hen.x;
        this.checkY = this.hen.y;
        this.updateCamera(1, true);
        return;
      }
    }
  }

  /** Back to the last scarecrow after a fall. */
  respawn(): void {
    const h = this.hen;
    h.x = this.checkX;
    h.y = this.checkY;
    h.vx = 0;
    h.vy = 0;
    h.ground = false;
    h.ride = null;
    h.inv = 2;
    h.stun = 0;
    h.flaps = FLAPS;
    h.flapT = 0;
    h.face = 1;
    h.sx = 0.8;
    h.sy = 1.25;
    h.hidden = false;
    this.updateCamera(1, true);
    this.feather(h.x + HEN_W / 2, h.y + 6, 4);
  }

  private walkHome(dt: number): void {
    const h = this.hen;
    const house = this.ents.find((e) => e.k === 'house');
    if (!house) return;
    const door = house.x + 16 - HEN_W / 2;
    h.face = 1;
    h.vy = Math.min(MAX_FALL, h.vy + GRAVITY * dt);
    const prevBottom = h.y + HEN_H;
    const dir = Math.sign(door - h.x);
    h.vx = dir * 40;
    this.moveX(h.vx * dt);
    this.moveY(h.vy * dt, prevBottom, h.vy, false);
    if (Math.abs(door - h.x) < 1.5 && h.ground) {
      h.x = door;
      h.vx = 0;
      h.idle += dt;
      if (h.idle > 0.35) {
        h.hidden = true;
        this.houseClosed = true;
        this.hooks.sfx('door');
        for (let i = 0; i < 6; i++) this.part(P_HEART, house.x + 16 + (Math.random() - 0.5) * 12, house.y + 14, (Math.random() - 0.5) * 30, -40 - Math.random() * 30, 1.4, -10);
      }
    } else h.idle = 0;
  }

  // ------------------------------------------------------------------ things

  private touchThings(): void {
    const h = this.hen;
    for (const e of this.ents) {
      if (e.dead) continue;
      switch (e.k) {
        case 'egg':
          if (overlap(h.x - 1, h.y - 1, HEN_W + 2, HEN_H + 2, e.x - 1, e.y - 1, e.w + 2, e.h + 2)) {
            e.dead = true;
            this.eggsGot++;
            this.part(P_SPARK, e.x + 3, e.y + 4, 0, -10, 0.3, 0);
            this.hooks.egg(e);
          }
          break;
        case 'gold':
          if (overlap(h.x - 1, h.y - 1, HEN_W + 2, HEN_H + 2, e.x, e.y, e.w, e.h)) {
            e.dead = true;
            this.goldsGot++;
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              this.part(P_SPARK, e.x + 4, e.y + 5, Math.cos(a) * 50, Math.sin(a) * 50, 0.55, 0);
            }
            this.hooks.gold(e);
          }
          break;
        case 'scare':
          if (e.st === 0 && overlap(h.x, h.y, HEN_W, HEN_H, e.x + 2, e.y, e.w - 4, e.h)) {
            e.st = 1;
            e.t = 0;
            this.checkX = e.x + 8 - HEN_W / 2;
            this.checkY = e.y + 24 - HEN_H;
            for (let i = 0; i < 6; i++) this.part(P_NOTE, e.x + 8, e.y + 4, (Math.random() - 0.5) * 40, -30 - Math.random() * 30, 1.1, 0);
            this.hooks.checkpoint(e);
          }
          break;
        case 'house':
          if (!this.auto && h.x + HEN_W / 2 > e.x + 10 && h.y + HEN_H > e.y + 8) {
            this.auto = true;
            h.idle = 0;
            h.ride = null;
            h.flapT = 0;
            this.hooks.home();
          }
          break;
        case 'fox':
          if (e.st === FOX_DIZZY || e.st === FOX_RUN) break;
          if (overlap(h.x + 1, h.y + 1, HEN_W - 2, HEN_H - 1, e.x, e.y + 1, e.w, e.h - 1)) {
            const prevBottom = h.y + HEN_H - h.vy / 60;
            if (h.vy > 0 && prevBottom <= e.y + 6) this.bop(e);
            else if (e.st === FOX_SLEEP) this.wake(e);
            else if (h.inv <= 0) this.hurt(e.x + e.w / 2);
          }
          break;
        case 'hog':
          if (h.inv <= 0 && overlap(h.x + 1, h.y + 1, HEN_W - 2, HEN_H - 1, e.x + 1, e.y + 1, e.w - 2, e.h - 1)) {
            const fromAbove = h.vy > 0 && h.y + HEN_H - h.vy / 60 <= e.y + 4;
            if (this.hurt(e.x + e.w / 2) && fromAbove) h.vy = -220;
          }
          break;
        case 'crow':
          if (e.st === CROW_PERCH || e.st === CROW_ALERT) {
            if (overlap(h.x, h.y, HEN_W, HEN_H, e.x - 2, e.y - 2, e.w + 4, e.h + 4)) {
              // a sitting crow just flaps off in a fright
              e.st = CROW_SCARED;
              e.t = 0;
              e.dir = h.x < e.x ? 1 : -1;
              this.feather(e.x + 5, e.y + 3, 2, 3);
              this.hooks.sfx('caw');
            }
          } else if (e.st !== CROW_SCARED && h.inv <= 0 && overlap(h.x + 1, h.y + 1, HEN_W - 2, HEN_H - 2, e.x + 1, e.y + 1, e.w - 2, e.h - 2)) this.hurt(e.x + e.w / 2);
          break;
        case 'bird':
          if (h.inv <= 0 && overlap(h.x + 1, h.y + 1, HEN_W - 2, HEN_H - 2, e.x + 2, e.y + 1, e.w - 4, e.h - 2)) this.hurt(e.x + e.w / 2);
          break;
      }
    }
  }

  /** A sleeping fox jumps up with a start (and does not bite this time). */
  private wake(e: Ent): void {
    if (e.st !== FOX_SLEEP) return;
    e.st = FOX_WAKE;
    e.t = 0;
    e.dir = this.hen.x + HEN_W / 2 < e.x + e.w / 2 ? -1 : 1;
    this.hooks.sfx('wake');
  }

  private bop(e: Ent): void {
    const h = this.hen;
    // a fox caught napping is worth more
    e.n = e.st === FOX_SLEEP ? 1 : 0;
    e.st = FOX_DIZZY;
    e.t = 0;
    h.chain = Math.min(8, h.chain + 1);
    h.vy = -(this.lastHold ? BOP_HELD : BOP_V);
    h.jumping = false;
    h.flaps = FLAPS;
    h.flapT = 0;
    h.sx = 0.75;
    h.sy = 1.3;
    this.hitstop = 0.05;
    this.shake = 0.12;
    for (let i = 0; i < 4; i++) this.part(P_STAR, e.x + e.w / 2, e.y, (Math.random() - 0.5) * 70, -40 - Math.random() * 40, 0.5, 200);
    this.hooks.bop(e, h.chain);
  }

  /** Whether the button was held on the last step (for bounce heights). */
  lastHold = false;

  private updateMovers(dt: number): void {
    for (const m of this.ents) {
      if (m.k !== 'mover') continue;
      const dist = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
      m.ph += (dt * Math.PI * 30) / Math.max(24, dist);
      const f = 0.5 - 0.5 * Math.cos(m.ph);
      const nx = m.x0 + (m.x1 - m.x0) * f;
      const ny = m.y0 + (m.y1 - m.y0) * f;
      m.dx = nx - m.x;
      m.dy = ny - m.y;
      m.x = nx;
      m.y = ny;
    }
  }

  private updateEnts(dt: number): void {
    const h = this.hen;
    const hx = h.x + HEN_W / 2;
    const hy = h.y + HEN_H / 2;
    for (const e of this.ents) {
      if (e.dead) continue;
      e.t += dt;
      switch (e.k) {
        case 'fox': {
          if (e.st === FOX_SLEEP) {
            if (Math.random() < dt * 0.9) this.part(P_ZZZ, e.x + (e.dir < 0 ? 3 : 11), e.y - 2, 5, -9, 2.2, 0);
            const dx = Math.abs(hx - (e.x + e.w / 2));
            if (dx < 30 && Math.abs(hy - (e.y + e.h / 2)) < 18 && this.hen.ground) this.wake(e);
          } else if (e.st === FOX_WAKE) {
            if (e.t > 0.55) {
              e.st = FOX_WALK;
              e.t = 0;
            }
          } else if (e.st === FOX_WALK) {
            const speed = this.def.place === 'night' ? 30 : 25;
            this.patrol(e, speed, 52, dt);
          } else if (e.st === FOX_DIZZY) {
            if (e.t > 0.45) {
              e.st = FOX_RUN;
              e.t = 0;
              e.dir = e.x + e.w / 2 > hx ? 1 : -1;
            }
          } else {
            e.x += e.dir * 105 * dt;
            e.y += Math.sin(e.t * 22) * 0.4;
            if (e.t > 1.6) e.dead = true;
          }
          break;
        }
        case 'hog':
          this.patrol(e, 11, 36, dt);
          break;
        case 'crow':
          this.crow(e, hx, hy, dt);
          break;
        case 'bird': {
          const t = e.t * 0.9 + e.ph;
          const nx = e.x0 + Math.sin(t) * 44;
          e.dir = Math.cos(t) >= 0 ? 1 : -1;
          e.x = nx;
          e.y = e.y0 + Math.sin(t * 2.6) * 7;
          break;
        }
        case 'spring':
        case 'line':
          if (e.t > 0.5 && e.t < 10) e.t = 10;
          break;
        case 'gold':
          if (this.onScreen(e) && Math.random() < dt * 3) this.part(P_SPARK, e.x + Math.random() * 8, e.y + Math.random() * 10, 0, -6, 0.4, 0);
          break;
        case 'draft':
          if (this.onScreen(e) && Math.random() < dt * 5) this.part(P_SMOKE, e.x + 6 + Math.random() * 8, e.y + e.h - 2, (Math.random() - 0.5) * 6, -28 - Math.random() * 14, 1.8, 0);
          break;
      }
    }
  }

  private onScreen(e: Ent): boolean {
    return e.x + e.w > this.camX - 24 && e.x < this.camX + VIEW_W + 24;
  }

  /** Walk to and fro on the ground under it, turning at walls, edges and the end of its beat. */
  private patrol(e: Ent, speed: number, range: number, dt: number): void {
    e.x += e.dir * speed * dt;
    const front = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const feet = e.y + e.h + 2;
    const wall = this.solidAt(front, e.y + e.h - 3);
    const edge = !this.floorAt(front, feet);
    const far = Math.abs(e.x - e.x0) > range && Math.sign(e.x - e.x0) === e.dir;
    if (wall || edge || far) {
      e.x -= e.dir * speed * dt;
      e.dir = -e.dir;
    }
  }

  private crow(e: Ent, hx: number, hy: number, dt: number): void {
    const cx = e.x + e.w / 2;
    switch (e.st) {
      case CROW_PERCH: {
        e.dir = hx < cx ? -1 : 1;
        const dx = Math.abs(hx - cx);
        if (e.n <= 0 && dx < 62 && dx > 10 && hy > e.y - 10 && hy < e.y + 100 && !this.hen.hidden) {
          e.st = CROW_ALERT;
          e.t = 0;
          this.hooks.sfx('caw');
        }
        e.n -= dt;
        break;
      }
      case CROW_ALERT:
        if (e.t > 0.5) {
          e.st = CROW_SWOOP;
          e.t = 0;
          e.x1 = hx;
          e.y1 = Math.max(e.y0 + 12, Math.min(hy - 2, e.y0 + 90));
          e.dir = hx < cx ? -1 : 1;
          e.vx = Math.max(55, Math.min(95, (Math.abs(hx - cx) * 2) / 1.3));
          this.hooks.sfx('swoop');
        }
        break;
      case CROW_SWOOP: {
        const T = 1.3;
        const f = Math.min(1, e.t / T);
        e.x = e.x0 + e.dir * e.vx * e.t;
        e.y = e.y0 + (e.y1 - e.y0) * Math.sin(Math.PI * f);
        if (f >= 1) {
          e.st = CROW_BACK;
          e.t = 0;
          e.x1 = e.x;
          e.y1 = e.y;
        }
        break;
      }
      case CROW_BACK: {
        // fly home in a hop
        const T = 1.4;
        const f = Math.min(1, e.t / T);
        e.dir = e.x0 > e.x1 ? 1 : -1;
        e.x = e.x1 + (e.x0 - e.x1) * f;
        e.y = e.y1 + (e.y0 - e.y1) * f - Math.sin(Math.PI * f) * 18;
        if (f >= 1) {
          e.st = CROW_PERCH;
          e.t = 0;
          e.x = e.x0;
          e.y = e.y0;
          e.n = 1.6;
        }
        break;
      }
      case CROW_SCARED: {
        e.x += e.dir * 60 * dt;
        e.y -= 70 * dt;
        if (e.t > 2.4) {
          e.st = CROW_BACK;
          e.t = 0;
          e.x1 = e.x;
          e.y1 = e.y;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ wind and weather

  private updateWind(dt: number): void {
    if (!this.def.wind) return;
    this.windT += dt;
    const CALM = 3.0;
    const WARN = 1.0;
    const GUST = 2.6;
    const FADE = 0.6;
    const cycle = CALM + WARN + GUST + FADE;
    if (this.windT >= cycle) {
      this.windT -= cycle;
      this.windN++;
    }
    const dir = [1, 1, -1, 1, -1, -1, 1][this.windN % 7]!;
    const t = this.windT;
    let s = 0;
    this.windWarn = 0;
    if (t < CALM) s = 0;
    else if (t < CALM + WARN) {
      this.windWarn = dir;
      s = ((t - CALM) / WARN) * 0.2;
      if (t - dt < CALM) this.hooks.sfx('wind');
    } else if (t < CALM + WARN + GUST) s = 1;
    else s = 1 - (t - CALM - WARN - GUST) / FADE;
    this.wind = dir * s;
    const n = Math.abs(this.wind) + (this.windWarn ? 0.25 : 0);
    if (Math.random() < dt * 26 * n) {
      const fromLeft = (this.wind || this.windWarn) > 0;
      this.part(P_STREAK, this.camX + (fromLeft ? -10 : 170), this.camY + HUD_H + Math.random() * 120, (fromLeft ? 1 : -1) * (150 + Math.random() * 60), 0, 1.4, 0);
    }
  }

  private updateWeather(dt: number): void {
    const place = this.def.place;
    if (this.def.snow && Math.random() < dt * 22) this.part(P_SNOW, this.camX + Math.random() * 180 - 10 + this.wind * -30, this.camY + HUD_H - 2, (Math.random() - 0.5) * 8, 14 + Math.random() * 12, 9, 0);
    if (place === 'forest' && Math.random() < dt * 1.6) this.part(P_LEAF, this.camX + Math.random() * 170, this.camY + HUD_H, 6 + Math.random() * 8, 16 + Math.random() * 8, 9, 0);
    if (place === 'barn' && Math.random() < dt * 3) this.part(P_HAY, this.camX + Math.random() * 160, this.camY + HUD_H + Math.random() * 100, (Math.random() - 0.5) * 4, 3 + Math.random() * 4, 4, 0, 1);
    if (this.def.dark && Math.random() < dt * 1.4) {
      const p = this.part(P_FLY, this.camX + Math.random() * 160, this.camY + 30 + Math.random() * 90, 0, 0, 7 + Math.random() * 4, 0);
      if (p) p.seed = Math.random() * 100;
    }
  }

  // ------------------------------------------------------------------ particles

  part(k: number, x: number, y: number, vx: number, vy: number, life: number, g: number, c = 0, s = ''): Part | null {
    if (this.parts.length >= this.maxParts) {
      // weather gives way to the important bits
      if (k === P_SNOW || k === P_LEAF || k === P_STREAK || k === P_HAY || k === P_FLY) return null;
      const i = this.parts.findIndex((p) => p.k === P_SNOW || p.k === P_LEAF || p.k === P_STREAK || p.k === P_DUST);
      if (i < 0) return null;
      this.parts.splice(i, 1);
    }
    const p: Part = { k, x, y, vx, vy, t: 0, life, g, c, s, seed: Math.random() * 1000 };
    this.parts.push(p);
    return p;
  }

  dust(x: number, y: number, n: number): void {
    if (n === 0) {
      this.part(P_DUST, x, y - 1, -this.hen.face * 8, -6, 0.3, 0, 1);
      return;
    }
    for (let i = 0; i < n + 1; i++) this.part(P_DUST, x + (i - n / 2) * 4, y - 1, (i - n / 2) * 18, -8 - Math.random() * 6, 0.32 + Math.random() * 0.1, 0, 2);
  }

  feather(x: number, y: number, n: number, c = 0): void {
    for (let i = 0; i < n; i++) this.part(P_FEATHER, x, y, (Math.random() - 0.5) * 80, -30 - Math.random() * 50, 1.4 + Math.random() * 0.6, 0, c);
  }

  splash(x: number, y: number): void {
    for (let i = 0; i < 10; i++) this.part(P_DROP, x + (Math.random() - 0.5) * 8, y, (Math.random() - 0.5) * 70, -60 - Math.random() * 80, 0.9, 420);
    this.shake = 0.2;
  }

  private updateParts(dt: number): void {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.t += dt;
      if (p.t >= p.life) {
        ps.splice(i, 1);
        continue;
      }
      switch (p.k) {
        case P_FEATHER:
          // drift down, swaying
          p.vx *= 1 - dt * 2.5;
          p.vy = Math.min(p.vy + 140 * dt, 16);
          p.x += (p.vx + Math.sin(p.t * 5 + p.seed) * 14) * dt;
          p.y += p.vy * dt;
          continue;
        case P_LEAF:
        case P_SNOW:
          p.x += (p.vx + Math.sin(p.t * 2 + p.seed) * 8 + this.wind * 40) * dt;
          p.y += p.vy * dt;
          if (p.y > this.camY + VIEW_H + 4) p.t = p.life;
          continue;
        case P_FLY:
          p.x += Math.sin(p.t * 0.9 + p.seed) * 9 * dt;
          p.y += Math.cos(p.t * 1.3 + p.seed * 2) * 7 * dt;
          continue;
        case P_STREAK:
          p.x += p.vx * dt;
          if (p.x < this.camX - 30 || p.x > this.camX + 200) p.t = p.life;
          continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === P_DUST || p.k === P_SMOKE) {
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 2;
      }
    }
  }

  // ------------------------------------------------------------------ camera

  updateCamera(dt: number, snap = false): void {
    const h = this.hen;
    const lead = this.auto ? 0 : h.face * 16 + h.vx * 0.12;
    const tx = h.x + HEN_W / 2 - VIEW_W / 2 + lead;
    this.camX = snap ? tx : this.camX + (tx - this.camX) * Math.min(1, dt * 4.5);
    this.camX = Math.max(0, Math.min(this.w * TS - VIEW_W, this.camX));
    if (this.h * TS <= VIEW_H) this.camY = -HUD_H;
    else {
      const ty = h.y - 70;
      this.camY = snap ? ty : this.camY + (ty - this.camY) * Math.min(1, dt * 4);
      this.camY = Math.max(-HUD_H, Math.min(this.h * TS - VIEW_H, this.camY));
    }
  }
}
