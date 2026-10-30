// Stjärnstorm's rules: the rocket, its guns, the storm's waves, scoring and the run from the launch
// to the last boss. No DOM here (drawing lives in draw.ts), so a run can also be simulated.
import type { SoundApi } from './audio.ts';
import { Boss, StormCrystal, miniBoss } from './bosses.ts';
import { Enemy, POWER_NAMES, powerColor, updateSnakeHeads } from './enemies.ts';
import { Fx } from './fx.ts';
import { SECTORS } from './waves.ts';
import { C, FH, FW, TAU, angleDiff, clamp, damp, dist2, easeInOut, pick, rand } from './util.ts';

export const PLAYER_R = 3.6;
export const CHAIN_TIME = 3.2;
export const SCORE = {
  /** Times the sector's number. */
  sector: 250,
  noHit: 500,
  miniBoss: 400,
  boss: 3500,
  life: 1000,
  bomb: 150,
  maxedPower: 200,
  star: 2,
  mini: 1,
};

export type Weapon = 'twin' | 'spread' | 'laser' | 'homing';
export type Power = Weapon | 'shield' | 'bomb' | 'life';
export type BulletKind = 'orb' | 'big' | 'dart';

/** What the player does this update. */
export interface Controls {
  /** Stick / arrows, -1..1. */
  mx: number;
  my: number;
  fire: boolean;
  /** The bomb button went down. */
  bomb: boolean;
  /** A finger or the mouse dragged the ship this far (world units). */
  dx: number;
  dy: number;
  drag: boolean;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  kind: 'bolt' | 'spread' | 'star';
  t: number;
  dead: boolean;
  target: Enemy | null;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: BulletKind;
  t: number;
  dead: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'star' | 'mini' | 'power';
  power: Power | null;
  t: number;
  dead: boolean;
  magnet: boolean;
  val: number;
}

export interface Banner {
  title: string;
  sub: string;
  color: string;
  t: number;
  dur: number;
  blink: boolean;
}

export interface Tally {
  text: string;
  color: string;
  t: number;
}

export class Player {
  x = FW / 2;
  y = FH - 72;
  vx = 0;
  vy = 0;
  alive = true;
  deadT = 0;
  inv = 0;
  shield = 0;
  weapon: Weapon = 'twin';
  level = 1;
  cd = 0;
  starCd = 0;
  bank = 0;
  laser = false;
  laserW = 0;
  /** > 0 while flying back in after a pop. */
  enter = 0;
  /** The intro: sitting on the launch pad. */
  parked = true;
  recoil = 0;
}

export type Phase = 'intro' | 'waves' | 'miniboss' | 'clear' | 'warp' | 'bosswarn' | 'boss' | 'win' | 'over';

export interface GameOpts {
  sound: SoundApi;
  low: boolean;
  onEnd: (score: number, detail: string) => void;
  /** Debug: 0 = from the launch, 1–2 = sector 2–3, 3 = the final boss. */
  startAt?: number;
  god?: boolean;
}

const multFor = (chain: number): number => (chain >= 60 ? 4 : chain >= 32 ? 3 : chain >= 12 ? 2 : 1);

/** Removes dead things in place. */
function sweep<T extends { dead: boolean }>(arr: T[]): void {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (!v.dead) arr[j++] = v;
  }
  arr.length = j;
}

const MAX_BULLETS = 150;

export class Game {
  readonly fx: Fx;
  readonly sound: SoundApi;
  readonly low: boolean;
  private onEnd: GameOpts['onEnd'];
  god: boolean;

  phase: Phase = 'intro';
  phaseT = 0;
  /** Game clock (slow motion counts slower). */
  t = 0;
  /** 0..2 the sectors, 3 the final boss. */
  sector = 0;
  sectorT = 0;
  private ev = 0;
  /** Which sector the background shows (switches in the middle of a warp). */
  look = 0;
  /** 0..1: the stars stretch into lines between sectors. */
  warp = 0;
  /** How far the moon base has scrolled away under the rocket. */
  baseScroll = 0;

  player = new Player();
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  boss: Boss | null = null;
  private pendingBoss: Boss | null = null;
  private bossCall = 0;
  banner: Banner | null = null;
  tallies: Tally[] = [];

  score = 0;
  lives = 3;
  bombs = 3;
  chain = 0;
  chainT = 0;
  mult = 1;
  bestChain = 0;
  kills = 0;
  /** Little stars picked up (shown in the panel). */
  starsGot = 0;
  deaths = 0;
  private sectorHits = 0;
  private gaveLife = false;

  bombId = 0;
  bombT = 0;
  bombX = 0;
  bombY = 0;
  bombR = 0;

  shake = 0;
  flashA = 0;
  flashC = '#ffffff';
  private stop = 0;
  private slow = 1;
  private slowT = 0;
  private starRun = 0;
  private starRunT = 0;
  private fireworkT = 0;
  ended = false;
  /** Shown on the result card's line. */
  detail = '';

  /** Enemy fire speed-up (sector and mercy). */
  fireRate = 1;
  speedMul = 1;

  constructor(o: GameOpts) {
    this.sound = o.sound;
    this.low = o.low;
    this.onEnd = o.onEnd;
    this.god = !!o.god;
    this.fx = new Fx(o.low ? 170 : 520, o.low ? 140 : 420);
    const s = o.startAt ?? 0;
    if (s > 0) this.debugStart(s);
    else {
      this.sound.section('intro');
      this.showBanner(SECTORS[0]!.title, SECTORS[0]!.name, SECTORS[0]!.color, 3.2);
    }
  }

  private debugStart(s: number): void {
    this.player.parked = false;
    this.player.y = FH - 150;
    this.baseScroll = 2000;
    this.player.weapon = 'spread';
    this.player.level = 2;
    if (s >= 11 && s <= 13) {
      // straight to a sector's guard
      this.startSector(s - 11);
      const ev = SECTORS[s - 11]!.events;
      this.ev = ev.length;
      this.sectorT = ev[ev.length - 1]![0] + 8;
      this.look = s - 11;
    } else if (s >= 3) {
      this.sector = 2;
      this.look = 3;
      this.setPhase('bosswarn');
      this.sound.section('boss');
      this.showBanner('VARNING!', 'STORMKRISTALLEN', C.magenta, 3.2, true);
    } else this.startSector(s);
  }

  // ---------------- the run ----------------

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  private startSector(i: number): void {
    const def = SECTORS[i]!;
    this.sector = i;
    this.look = i;
    this.sectorT = 0;
    this.ev = 0;
    this.sectorHits = 0;
    this.bossCall = 0;
    this.pendingBoss = null;
    this.tallies = [];
    this.setPhase('waves');
    this.sound.section(def.music);
    if (i > 0) {
      this.showBanner(def.title, def.name, def.color, 2.8);
      this.sound.play('stab');
    }
    // the storm fires a little faster deeper in, and a little slower after a few pops
    this.updateDifficulty();
  }

  private updateDifficulty(): void {
    const base = [0.82, 1.0, 1.12, 1.0][this.sector] ?? 1;
    const mercy = Math.max(0.72, 1 - this.deaths * 0.09);
    this.fireRate = base * mercy;
    this.speedMul = ([0.92, 1.0, 1.06, 1.0][this.sector] ?? 1) * (this.deaths >= 2 ? 0.94 : 1);
  }

  showBanner(title: string, sub: string, color: string, dur = 2.8, blink = false): void {
    this.banner = { title, sub, color, t: 0, dur, blink };
  }

  /** Progress through the current sector (0..1) for the HUD. */
  progress(): number {
    if (this.phase === 'intro') return 0;
    if (this.sector >= 3 || this.phase === 'bosswarn' || this.phase === 'boss' || this.phase === 'win') return 1;
    if (this.phase === 'miniboss' || this.phase === 'clear' || this.phase === 'warp') return 1;
    return clamp(this.sectorT / SECTORS[this.sector]!.length, 0, 1);
  }

  private updatePhase(dt: number): void {
    switch (this.phase) {
      case 'intro': {
        const p = this.player;
        // lift-off from the moon base
        if (this.phaseT > 0.6) {
          const k = easeInOut((this.phaseT - 0.6) / 1.6);
          p.y = FH - 72 - k * 78;
          this.baseScroll += dt * (40 + k * 260);
          if (Math.random() < 0.6) this.fx.spray(p.x + rand(-6, 6), p.y + 22, 1, C.yellow, Math.PI / 2, 0.5, 160, 0.4);
        }
        if (this.phaseT > 2.2) p.parked = false;
        if (this.phaseT > 3.3) this.startSector(0);
        break;
      }
      case 'waves': {
        this.baseScroll += dt * 300;
        this.sectorT += dt;
        const def = SECTORS[this.sector]!;
        while (this.ev < def.events.length && def.events[this.ev]![0] <= this.sectorT) {
          def.events[this.ev]![1](this);
          this.ev++;
        }
        if (this.ev >= def.events.length && this.bossCall === 0) {
          const lastT = def.events[def.events.length - 1]![0];
          const calm = !this.enemies.some((e) => !e.dead && e.y > -60 && e.y < FH + 40);
          if ((calm && this.sectorT > lastT + 2.5) || this.sectorT > lastT + 7) {
            this.pendingBoss = miniBoss(this.sector);
            this.bossCall = 0.001;
            this.showBanner('VARNING!', this.pendingBoss.name, C.red, 2.4, true);
            this.sound.play('warn');
            this.sound.section(def.bossMusic);
          }
        }
        if (this.bossCall > 0) {
          this.bossCall += dt;
          if (this.bossCall > 2.0 && this.pendingBoss) {
            this.spawnBoss(this.pendingBoss);
            this.pendingBoss = null;
            this.setPhase('miniboss');
          }
        }
        break;
      }
      case 'clear':
        if (this.phaseT > 2.9) {
          this.setPhase('warp');
          this.sound.play('whoosh');
        }
        break;
      case 'warp': {
        const k = this.phaseT / 1.9;
        this.warp = Math.sin(Math.min(1, k) * Math.PI);
        if (k > 0.5) this.look = this.sector < 2 ? this.sector + 1 : 3;
        if (k >= 1) {
          this.warp = 0;
          if (this.sector < 2) this.startSector(this.sector + 1);
          else {
            this.sector = 3;
            this.setPhase('bosswarn');
            this.updateDifficulty();
            this.showBanner('VARNING!', 'STORMKRISTALLEN', C.magenta, 3.2, true);
            this.sound.play('warn');
            this.sound.section('boss');
          }
        }
        break;
      }
      case 'bosswarn':
        if (this.phaseT > 3.0) {
          this.spawnBoss(new StormCrystal());
          this.setPhase('boss');
          this.sound.play('charge');
        }
        break;
      case 'win': {
        this.fireworkT -= dt;
        if (this.fireworkT <= 0 && this.phaseT < 7.6) {
          this.fireworkT = rand(0.22, 0.4);
          this.firework(rand(70, FW - 70), rand(90, FH * 0.55));
        }
        const add = (at: number, text: string, color: string, pts: number): void => {
          if (this.phaseT - dt < at && this.phaseT >= at) {
            this.tallies.push({ text, color, t: 0 });
            this.score += pts;
            this.sound.play(pts > 0 ? 'bonus' : 'chain', 3);
          }
        };
        add(1.6, `STORMKRISTALLEN +${SCORE.boss}`, C.yellow, SCORE.boss);
        if (this.lives > 0) add(2.4, `LIV KVAR ${this.lives} × ${SCORE.life}`, C.green, this.lives * SCORE.life);
        if (this.bombs > 0) add(3.2, `BOMBER KVAR ${this.bombs} × ${SCORE.bomb}`, C.gold, this.bombs * SCORE.bomb);
        add(4.0, `BÄSTA KEDJA ${this.bestChain}`, C.cyan, 0);
        if (this.phaseT > 8.2) this.finish('Sektor 3 · bossen besegrad');
        break;
      }
      case 'over':
        if (this.phaseT > 3.4) {
          let detail = `Sektor ${this.sector + 1} av 3`;
          if (this.sector >= 3) detail = this.boss && this.boss.healthFrac() < 0.35 ? 'Sektor 3 · bossen nästan besegrad' : 'Sektor 3 · mötte bossen';
          this.finish(detail);
        }
        break;
      default:
        break;
    }
  }

  private finish(detail: string): void {
    if (this.ended) return;
    this.ended = true;
    this.detail = detail;
    this.onEnd(Math.round(this.score), detail);
  }

  private spawnBoss(b: Boss): void {
    this.boss = b;
    this.spawn(b);
    b.onSpawn(this);
    this.addShake(0.3);
  }

  onBossDying(b: Boss): void {
    this.hitstop(0.15);
    this.slowmo(0.35, b.final ? 2.4 : 1.1);
    this.clearBullets(true);
    this.addShake(0.6);
    this.sound.play('crack');
    for (const e of this.enemies) if (!e.dead && !e.boss && !(b.children.includes(e))) e.damage(this, 999);
  }

  onBossDefeated(b: Boss): void {
    this.boss = null;
    this.flashScreen('#ffffff', b.final ? 1 : 0.7);
    this.hitstop(b.final ? 0.25 : 0.12);
    if (b.final) {
      this.setPhase('win');
      this.sound.section('win');
      this.showBanner('STORMEN ÄR ÖVER!', 'RYMDBASEN ÄR RÄDDAD!', C.yellow, 7.5);
      const p = this.player;
      p.inv = 99;
      if (!p.alive) {
        // the rocket comes back for the party
        p.alive = true;
        p.x = FW / 2;
        p.y = FH + 40;
        p.enter = 0.8;
      }
      this.fireworkT = 0.6;
      for (const p of this.pickups) p.magnet = true;
    } else {
      this.score += SCORE.miniBoss;
      this.fx.popup(b.x, b.y - 50, `+${SCORE.miniBoss}`, C.yellow, 26, 1.6);
      this.sectorClear();
    }
  }

  onBossFlee(b: Boss): void {
    this.fx.popup(b.x, b.y + 60, `${b.name} FLYR!`, C.white, 16, 1.6);
  }

  onBossGone(_b: Boss): void {
    this.boss = null;
    this.sectorClear();
  }

  private sectorClear(): void {
    this.setPhase('clear');
    const bonus = SCORE.sector * (this.sector + 1);
    this.score += bonus;
    this.tallies = [{ text: `BONUS +${bonus}`, color: C.yellow, t: 0 }];
    if (this.sectorHits === 0) {
      this.score += SCORE.noHit;
      this.tallies.push({ text: `INGEN SKADA +${SCORE.noHit}`, color: C.green, t: -0.5 });
    }
    this.showBanner('SEKTOR KLAR!', '', C.yellow, 2.8);
    this.sound.play('bonus');
    for (const p of this.pickups) p.magnet = true;
  }

  // ---------------- the update ----------------

  update(dt: number, c: Controls): void {
    if (this.stop > 0) {
      this.stop -= dt;
      this.shake = Math.max(0, this.shake - dt * 1.2);
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slow = 1;
    }
    const gdt = dt * this.slow;
    this.t += gdt;
    this.phaseT += gdt;
    this.updatePhase(gdt);
    this.updatePlayer(gdt, c);
    this.updateEnemies(gdt);
    this.updateShots(gdt);
    this.updateBullets(gdt);
    this.updatePickups(gdt);
    this.collide();
    this.updateBomb(gdt);
    this.fx.update(gdt);
    this.updateChain(gdt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    for (const t of this.tallies) t.t += dt;
    this.shake = Math.max(0, this.shake - dt * 1.3);
    this.flashA = Math.max(0, this.flashA - dt * 2.6);
    this.sound.laser(this.player.laser);
  }

  private updateChain(dt: number): void {
    if (this.chainT <= 0) return;
    const hold = this.phase === 'intro' || this.phase === 'clear' || this.phase === 'warp' || this.phase === 'bosswarn' || this.bossCall > 0 || this.phase === 'win';
    if (hold) return;
    this.chainT -= dt;
    if (this.chainT <= 0) {
      this.chainT = 0;
      if (this.chain >= 12) this.fx.popup(this.player.x, this.player.y - 40, 'KEDJAN BRÖTS', C.violet, 11, 0.9);
      this.chain = 0;
      this.mult = 1;
    }
  }

  /** A boss was hit: the chain lives on. */
  keepChain(): void {
    if (this.chain > 0) this.chainT = CHAIN_TIME;
  }

  // ---------------- the rocket ----------------

  private updatePlayer(dt: number, c: Controls): void {
    const p = this.player;
    p.inv = Math.max(0, p.inv - dt);
    p.recoil = Math.max(0, p.recoil - dt * 8);
    if (!p.alive) {
      p.laser = false;
      p.deadT += dt;
      if (this.lives > 0 && p.deadT > 1.4 && this.phase !== 'over') this.respawn();
      if (this.lives <= 0 && p.deadT > 1.6 && this.phase !== 'over' && this.phase !== 'win' && this.boss?.state !== 'dying') {
        this.setPhase('over');
        this.showBanner('BRA KÄMPAT!', this.sector >= 3 ? 'BOSSEN VANN DEN HÄR GÅNGEN' : `DU KOM TILL SEKTOR ${this.sector + 1}`, C.cyan, 4);
        this.sound.section('over');
      }
      return;
    }
    if (p.parked) {
      p.laser = false;
      return;
    }
    if (p.enter > 0) {
      p.enter -= dt;
      const k = 1 - Math.max(0, p.enter) / 0.8;
      p.y = FH + 40 - easeInOut(k) * 170;
      p.laser = false;
      return;
    }
    const sp = 340;
    p.vx = damp(p.vx, c.mx * sp, 24, dt);
    p.vy = damp(p.vy, c.my * sp, 24, dt);
    p.x += p.vx * dt + c.dx;
    p.y += p.vy * dt + c.dy;
    p.x = clamp(p.x, 18, FW - 18);
    p.y = clamp(p.y, 70, FH - 30);
    const sideways = p.vx / sp + (dt > 0 ? c.dx / dt / 600 : 0);
    p.bank = damp(p.bank, clamp(sideways, -1, 1), 10, dt);
    const firing = (c.fire || c.drag) && this.phase !== 'over';
    if (firing) this.fireGuns(dt);
    else {
      p.cd = Math.max(0, p.cd - dt);
      p.starCd = Math.max(0, p.starCd - dt);
    }
    p.laser = firing && p.weapon === 'laser';
    if (p.laser) this.fireLaser(dt);
    if (c.bomb) this.useBomb();
  }

  private respawn(): void {
    const p = this.player;
    p.alive = true;
    p.x = FW / 2;
    p.y = FH + 40;
    p.vx = p.vy = 0;
    p.enter = 0.8;
    p.inv = 3.2;
    this.bombs = Math.max(this.bombs, 2);
    this.updateDifficulty();
  }

  private bolt(x: number, y: number, ang: number, kind: 'bolt' | 'spread' = 'bolt'): void {
    const sp = 920;
    this.shots.push({ x, y, vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp, dmg: 1, r: 7, kind, t: 0, dead: false, target: null });
  }

  private fireGuns(dt: number): void {
    const p = this.player;
    p.cd -= dt;
    p.starCd -= dt;
    const L = p.level;
    const x = p.x;
    const y = p.y - 18;
    switch (p.weapon) {
      case 'twin':
        if (p.cd <= 0) {
          p.cd += L === 1 ? 0.1 : L === 2 ? 0.09 : 0.085;
          this.bolt(x - 6, y, 0);
          this.bolt(x + 6, y, 0);
          if (L >= 2) this.bolt(x, y - 6, 0);
          if (L >= 3) {
            this.bolt(x - 13, y + 6, -0.09);
            this.bolt(x + 13, y + 6, 0.09);
          }
          p.recoil = 1;
          this.sound.play('twin');
        }
        break;
      case 'spread':
        if (p.cd <= 0) {
          p.cd += L === 1 ? 0.12 : L === 2 ? 0.11 : 0.1;
          // a twin core straight ahead, and pairs fanning out to the sides
          this.bolt(x - 5, y, 0, 'spread');
          this.bolt(x + 5, y, 0, 'spread');
          const pairs = L === 1 ? 1 : L === 2 ? 2 : 3;
          const step = L === 1 ? 0.2 : L === 2 ? 0.15 : 0.12;
          for (let i = 1; i <= pairs; i++) {
            for (const s of [-1, 1]) {
              const a = s * i * step;
              this.bolt(x + Math.sin(a) * 12, y + i * 5, a, 'spread');
            }
          }
          p.recoil = 1;
          this.sound.play('spread');
        }
        break;
      case 'homing':
        if (p.cd <= 0) {
          p.cd += 0.13;
          this.bolt(x - 5, y, 0);
          this.bolt(x + 5, y, 0);
          this.sound.play('twin');
        }
        if (p.starCd <= 0) {
          p.starCd += 0.34 - L * 0.03;
          const n = L + 1;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55;
            this.shots.push({ x, y: y + 8, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, dmg: 2, r: 8, kind: 'star', t: 0, dead: false, target: null });
          }
          this.sound.play('homing');
        }
        break;
      case 'laser':
        p.cd = 0;
        break;
    }
    p.cd = Math.max(-0.05, p.cd);
    p.starCd = Math.max(-0.05, p.starCd);
  }

  private fireLaser(dt: number): void {
    const p = this.player;
    const L = p.level;
    const w = L === 1 ? 5 : L === 2 ? 7.5 : 10;
    const dps = L === 1 ? 24 : L === 2 ? 34 : 46;
    p.laserW = w;
    for (const e of this.enemies) {
      if (e.dead || e.y < -20 || e.y > p.y - 10) continue;
      if (!e.beamHits(p.x, w)) continue;
      if (e.shielded()) {
        if (Math.random() < 0.15) this.fx.spray(p.x, e.y + e.r * 0.5, 2, C.white, Math.PI / 2, 1, 200, 0.2);
        continue;
      }
      e.damage(this, dps * dt);
      if (Math.random() < 0.35) this.fx.spray(p.x, e.y + e.r * 0.6, 2, C.cyan, Math.PI / 2, 1.1, 260, 0.25);
    }
  }

  private useBomb(): void {
    const p = this.player;
    if (this.bombs <= 0 || !p.alive || p.enter > 0 || p.parked || this.bombT > 0) return;
    if (this.phase === 'win' || this.phase === 'over') return;
    this.bombs--;
    this.bombId++;
    this.bombT = 0.85;
    this.bombX = p.x;
    this.bombY = p.y;
    this.bombR = 0;
    p.inv = Math.max(p.inv, 1.8);
    this.clearBullets(true);
    this.flashScreen('#ffffff', 0.75);
    this.addShake(0.8);
    this.hitstop(0.05);
    this.sound.play('bomb');
    const cols = [C.white, C.yellow, C.cyan, C.magenta];
    cols.forEach((col, i) => this.fx.ring(p.x, p.y, col, 900 - i * 120, 0.9, 5 - i, i === 1 ? 8 : 0, 10, i * 0.05));
    this.fx.burst(p.x, p.y, this.low ? 30 : 70, C.yellow, 700, 0.9, 1.5);
  }

  private updateBomb(dt: number): void {
    if (this.bombT <= 0) return;
    this.bombT -= dt;
    this.bombR += dt * 1250;
    for (const e of this.enemies) {
      if (e.dead || e.bombId === this.bombId || e.y < -40) continue;
      if (Math.hypot(e.x - this.bombX, e.y - this.bombY) > this.bombR + e.r) continue;
      e.bombId = this.bombId;
      if (!e.shielded()) e.damage(this, e.bombDamage);
    }
  }

  /** The rocket is hit (bullet, beam or bump): the shield takes it, or the rocket pops. */
  hurtPlayer(): void {
    const p = this.player;
    if (!p.alive || p.inv > 0 || p.enter > 0 || p.parked || this.god || this.phase === 'win' || this.boss?.state === 'dying') return;
    if (p.shield > 0) {
      p.shield = 0;
      p.inv = 1.4;
      this.sound.play('shieldBreak');
      this.fx.shatter([{ pts: hexAround(p.x, p.y, 30), closed: true, color: C.blue }], p.x, p.y, 220, 0.8);
      this.fx.ring(p.x, p.y, C.blue, 300, 0.4, 3);
      this.clearBulletsNear(p.x, p.y, 150);
      this.addShake(0.35);
      this.fx.popup(p.x, p.y - 44, 'SKÖLDEN RÄDDADE DIG!', C.blue, 12, 1.1);
      return;
    }
    p.alive = false;
    p.deadT = 0;
    p.laser = false;
    this.lives--;
    this.deaths++;
    this.sectorHits++;
    if (this.chain >= 12) this.fx.popup(p.x, p.y - 40, 'KEDJAN BRÖTS', C.violet, 11, 0.9);
    this.chain = 0;
    this.chainT = 0;
    this.mult = 1;
    p.level = Math.max(1, p.level - 1);
    this.sound.play('hurt');
    this.addShake(0.85);
    this.hitstop(0.18);
    this.slowmo(0.4, 0.7);
    this.flashScreen(C.red, 0.35);
    this.fx.shatter(shipPolys(p.x, p.y, this.playerColor), p.x, p.y, 200, 1.3, 2.5);
    this.fx.ring(p.x, p.y, C.white, 380, 0.6, 4);
    this.fx.ring(p.x, p.y, this.playerColor, 240, 0.8, 3, 0, 4, 0.1);
    this.fx.burst(p.x, p.y, this.low ? 20 : 45, C.yellow, 380, 0.8);
    this.clearBullets(true);
  }

  /** The player's colour (set by the factory from the shell). */
  playerColor: string = C.pink;

  // ---------------- enemies and their fire ----------------

  spawn(e: Enemy): void {
    this.enemies.push(e);
  }

  /** Angle from a point to the rocket (straight down when it is away). */
  aim(x: number, y: number): number {
    const p = this.player;
    if (!p.alive) return Math.PI / 2;
    return Math.atan2(p.y - y, p.x - x);
  }

  shoot(x: number, y: number, ang: number, spd: number, kind: BulletKind = 'orb', quiet = false): void {
    if (this.bullets.length >= MAX_BULLETS) return;
    const p = this.player;
    if (!p.alive || p.parked || this.phase === 'win' || this.phase === 'over') return;
    if (dist2(x, y, p.x, p.y) < 85 * 85) return;
    if (y > p.y - 40) return;
    if (x < -20 || x > FW + 20 || y < -30) return;
    const v = spd * this.speedMul;
    this.bullets.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, kind, t: 0, dead: false });
    if (!quiet) this.sound.play('enemyShot');
  }

  fan(x: number, y: number, n: number, spread: number, spd: number, ang: number, kind: BulletKind = 'orb'): void {
    for (let i = 0; i < n; i++) this.shoot(x, y, ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), spd, kind, i > 0);
  }

  /** A ring of n bullets; the first `gap` places stay empty (a way through). */
  ring(x: number, y: number, n: number, spd: number, rot: number, kind: BulletKind = 'orb', gap = 0): void {
    for (let i = gap; i < n; i++) this.shoot(x, y, rot + (i / n) * TAU, spd, kind, i > gap);
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(this, dt);
      e.flash = Math.max(-1, e.flash - dt);
      if (!e.dead && e.offscreen()) e.dead = true;
    }
    sweep(this.enemies);
    updateSnakeHeads(this.enemies);
  }

  onKill(e: Enemy): void {
    const big = e.size;
    const parts = e.parts(this);
    this.fx.shatter(parts, e.x, e.y, 110 + big * 180, 0.55 + big * 0.7, e.boss ? 3 : 2);
    this.fx.ring(e.x, e.y, e.color, 180 + big * 300, 0.3 + big * 0.35, 2 + big * 3);
    this.fx.burst(e.x, e.y, Math.round((this.low ? 4 : 8) + big * (this.low ? 10 : 24)), C.white, 160 + big * 260, 0.45 + big * 0.4);
    if (big >= 0.5) {
      this.fx.ring(e.x, e.y, C.white, 420, 0.5, 3, 0, 6, 0.06);
      this.sound.play('boom');
    } else this.sound.play('pop', big);
    this.addShake(0.035 + big * 0.22);
    this.dropStars(e.x, e.y, e.stars);
    if (e.boss) {
      // the big one: rings on rings
      const b = e as Boss;
      for (let i = 0; i < 6; i++) this.fx.ring(e.x, e.y, [C.white, C.cyan, C.magenta, C.yellow][i % 4]!, 300 + i * 160, 1.1, 5, i === 2 ? 6 : 0, 10, i * 0.07);
      this.fx.debris(e.x, e.y, this.low ? 20 : 60, b.color, 420, 18, 1.4);
      this.fx.burst(e.x, e.y, this.low ? 30 : 90, C.yellow, 600, 1.2, 1.4);
      this.sound.play(b.final ? 'huge' : 'boom');
      this.addShake(b.final ? 1 : 0.7);
      return;
    }
    this.kills++;
    this.chain++;
    this.chainT = CHAIN_TIME;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const m = multFor(this.chain);
    if (m > this.mult) {
      this.mult = m;
      this.fx.popup(this.player.x, this.player.y - 46, `KEDJA ×${m}!`, C.yellow, 14, 1.1);
      this.sound.play('chain', m);
    }
    const pts = e.points * this.mult;
    this.score += pts;
    this.fx.popup(e.x, e.y - 6, `${pts}`, this.mult > 1 ? C.yellow : C.ice, 9 + Math.min(6, e.size * 10), 0.6);
    const g = e.group;
    if (g) {
      g.killed++;
      if (g.killed === g.total && g.lost === 0) {
        this.score += g.bonus;
        this.fx.popup(e.x, e.y - 30, `${g.label} +${g.bonus}`, C.green, 14, 1.4);
        this.sound.play('bonus');
        this.fx.ring(e.x, e.y, C.green, 300, 0.5, 3, 5);
      }
    }
  }

  /** A small light burst (bosses breaking apart). */
  explodeAt(x: number, y: number, color: string, size: number): void {
    this.fx.ring(x, y, color, 160 + size * 200, 0.4, 3);
    this.fx.debris(x, y, Math.round(4 + size * 8), color, 200, 8, 0.6);
    this.fx.burst(x, y, this.low ? 4 : 10, C.white, 240, 0.4);
    this.sound.play('pop', size);
    this.addShake(0.12 * size);
  }

  /** Something pretty for the end: a burst of light in the storm's colours. */
  private firework(x: number, y: number): void {
    const col = pick([C.yellow, C.cyan, C.magenta, C.green, C.white, this.playerColor]);
    this.fx.burst(x, y, this.low ? 18 : 44, col, 260, 1.2, 1.6);
    this.fx.ring(x, y, col, 200, 0.7, 2.5, pick([0, 0, 5, 6]));
    this.fx.ring(x, y, C.white, 90, 0.4, 2);
    this.sound.play('firework');
  }

  // ---------------- bullets and shots ----------------

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      s.t += dt;
      if (s.kind === 'star') {
        if (!s.target || s.target.dead || s.target.y < -20) s.target = this.findTarget(s.x, s.y);
        const sp = Math.min(640, 420 + s.t * 900);
        let a = Math.atan2(s.vy, s.vx);
        if (s.target && s.t > 0.08) {
          const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
          a += clamp(angleDiff(a, want), -8 * dt, 8 * dt);
        }
        s.vx = Math.cos(a) * sp;
        s.vy = Math.sin(a) * sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y < -40 || s.y > FH + 40 || s.x < -40 || s.x > FW + 40 || s.t > 2.4) s.dead = true;
    }
    sweep(this.shots);
  }

  private findTarget(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.y < 0 || e.y > FH || e.shielded()) continue;
      const d = dist2(x, y, e.x, e.y) * (e.y > y ? 3 : 1);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > FH + 30 || b.y < -60 || b.x < -40 || b.x > FW + 40) b.dead = true;
    }
    sweep(this.bullets);
  }

  /** Every bullet on screen turns into a little star (a bomb, a pop, a boss phase). */
  clearBullets(toStars: boolean): void {
    for (const b of this.bullets) {
      if (toStars && this.pickups.length < 200) this.pickups.push({ x: b.x, y: b.y, vx: rand(-50, 50), vy: rand(-70, 10), kind: 'mini', power: null, t: 0, dead: false, magnet: false, val: SCORE.mini });
      this.fx.burst(b.x, b.y, 2, C.pink, 90, 0.3);
    }
    this.bullets.length = 0;
  }

  private clearBulletsNear(x: number, y: number, r: number): void {
    for (const b of this.bullets) {
      if (dist2(b.x, b.y, x, y) > r * r) continue;
      b.dead = true;
      this.fx.burst(b.x, b.y, 2, C.pink, 90, 0.3);
    }
    sweep(this.bullets);
  }

  // ---------------- pickups ----------------

  dropStars(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.pickups.length > 220) break;
      this.pickups.push({ x, y, vx: rand(-90, 90), vy: rand(-140, -20), kind: 'star', power: null, t: rand(0, 1), dead: false, magnet: false, val: SCORE.star });
    }
  }

  dropPower(x: number, y: number, power: Power): void {
    this.pickups.push({ x, y, vx: 0, vy: -60, kind: 'power', power, t: 0, dead: false, magnet: false, val: 0 });
    this.fx.ring(x, y, powerColor(power), 260, 0.5, 3, 6);
  }

  /** What would help most right now (capsules in the last sector). */
  smartPower(): Power {
    const p = this.player;
    if (this.lives <= 1 && !this.gaveLife) {
      this.gaveLife = true;
      return 'life';
    }
    if (this.bombs <= 1) return 'bomb';
    if (p.shield === 0) return 'shield';
    if (p.level < 3) return p.weapon === 'twin' ? pick<Power>(['spread', 'laser', 'homing']) : p.weapon;
    return 'bomb';
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    this.starRunT -= dt;
    if (this.starRunT <= 0) this.starRun = 0;
    for (const k of this.pickups) {
      k.t += dt;
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      if (k.kind === 'mini' && k.t > 0.45) k.magnet = true;
      const pull = p.alive && !p.parked && (k.magnet || d < (k.kind === 'power' ? 90 : 140));
      if (pull) {
        const acc = k.kind === 'power' ? 1400 : 2600;
        k.vx += (dx / d) * acc * dt;
        k.vy += (dy / d) * acc * dt;
        const sp = Math.hypot(k.vx, k.vy);
        const max = 820;
        if (sp > max) {
          k.vx *= max / sp;
          k.vy *= max / sp;
        }
      } else if (k.kind === 'power') {
        k.vx = Math.sin(k.t * 1.6) * 34;
        k.vy = Math.min(50, k.vy + 120 * dt);
      } else {
        k.vx *= Math.exp(-2 * dt);
        k.vy = Math.min(k.vy + 150 * dt, 90);
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (p.alive && !p.parked && d < (k.kind === 'power' ? 36 : 26)) {
        k.dead = true;
        this.collect(k);
        continue;
      }
      if (k.y > FH + 30 || (k.kind !== 'power' && k.t > 11 && !k.magnet)) k.dead = true;
    }
    sweep(this.pickups);
  }

  private collect(k: Pickup): void {
    const p = this.player;
    if (k.kind !== 'power') {
      this.score += k.val;
      if (k.kind === 'star') this.starsGot++;
      this.starRun++;
      this.starRunT = 0.6;
      this.sound.play('star', Math.min(10, this.starRun / 2));
      if (k.kind === 'star') this.fx.burst(k.x, k.y, 3, C.yellow, 120, 0.25);
      return;
    }
    const pw = k.power!;
    let text = POWER_NAMES[pw] + '!';
    switch (pw) {
      case 'spread':
      case 'laser':
      case 'homing':
        if (p.weapon === pw) {
          if (p.level < 3) {
            p.level++;
            text = `${POWER_NAMES[pw]} NIVÅ ${p.level}!`;
          } else {
            this.score += SCORE.maxedPower;
            text = `MAX! +${SCORE.maxedPower}`;
          }
        } else p.weapon = pw;
        this.sound.play('power');
        break;
      case 'shield':
        if (p.shield > 0) {
          this.score += SCORE.maxedPower;
          text = `SKÖLD +${SCORE.maxedPower}`;
        }
        p.shield = 1;
        this.sound.play('shieldUp');
        break;
      case 'bomb':
        this.bombs = Math.min(6, this.bombs + 1);
        this.sound.play('power');
        break;
      case 'life':
        this.lives = Math.min(6, this.lives + 1);
        this.sound.play('life');
        break;
      default:
        break;
    }
    this.fx.popup(p.x, p.y - 50, text, powerColor(pw), 14, 1.4);
    this.fx.ring(p.x, p.y, powerColor(pw), 260, 0.45, 3, 6);
    this.fx.burst(p.x, p.y, this.low ? 10 : 24, powerColor(pw), 260, 0.5);
  }

  // ---------------- collisions ----------------

  private collide(): void {
    // shots against enemies; newest first, so a boss's parts are hit before the boss under them
    for (const s of this.shots) {
      if (s.dead) continue;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i]!;
        if (e.dead || e.y < -30) continue;
        if (!e.hits(s.x, s.y, s.r)) continue;
        s.dead = true;
        if (e.shielded()) {
          this.fx.spray(s.x, s.y, 3, C.white, Math.atan2(-s.vy, -s.vx), 0.9, 220, 0.2);
          this.sound.play('tink');
        } else {
          e.damage(this, s.dmg);
          this.fx.spray(s.x, s.y, 2, s.kind === 'star' ? C.magenta : C.ice, Math.atan2(-s.vy, -s.vx), 0.8, 200, 0.18);
          this.sound.play('hit');
        }
        break;
      }
    }
    const p = this.player;
    if (!p.alive || p.parked || p.enter > 0 || p.inv > 0 || this.god) return;
    for (const b of this.bullets) {
      const rr = (b.kind === 'big' ? 6.5 : b.kind === 'dart' ? 4 : 4.8) + PLAYER_R;
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        b.dead = true;
        this.hurtPlayer();
        return;
      }
    }
    for (const e of this.enemies) {
      if (e.dead || !e.solid || e.y < -30) continue;
      if (e.hits(p.x, p.y, PLAYER_R - e.r * 0.28)) {
        this.hurtPlayer();
        if (!e.boss) e.damage(this, 4);
        return;
      }
    }
  }

  // ---------------- juice ----------------

  addShake(a: number): void {
    this.shake = Math.min(1, this.shake + a);
  }

  /** Light up the whole screen; at most about three flashes a second, so it never strobes. */
  flashScreen(color: string, a: number): void {
    if (this.t - this.lastFlash < 0.34 && a < this.flashA + 0.4) return;
    this.lastFlash = this.t;
    this.flashC = color;
    this.flashA = Math.max(this.flashA, a);
  }
  private lastFlash = -9;

  hitstop(s: number): void {
    this.stop = Math.max(this.stop, s);
  }

  slowmo(scale: number, dur: number): void {
    this.slow = scale;
    this.slowT = dur;
  }

  popup(x: number, y: number, text: string, color: string, size = 14): void {
    this.fx.popup(x, y, text, color, size, 1.4);
  }
}

// ---------------- the rocket's shape ----------------

export const SHIP_BODY = [0, -24, 7, -12, 8, 6, -8, 6, -7, -12];
export const SHIP_FIN_L = [-8, -2, -16, 10, -16, 15, -8, 9];
export const SHIP_FIN_R = [8, -2, 16, 10, 16, 15, 8, 9];
export const SHIP_NOZZLE = [-5, 6, -6, 11, 6, 11, 5, 6];
export const SHIP_WINDOW = (() => {
  const out: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    out.push(Math.cos(a) * 3.6, -8 + Math.sin(a) * 3.6);
  }
  return out;
})();

function place(pts: number[], x: number, y: number): number[] {
  return pts.map((v, i) => v + (i % 2 ? y : x));
}

export function shipPolys(x: number, y: number, color: string) {
  return [
    { pts: place(SHIP_BODY, x, y), closed: true, color: C.white },
    { pts: place(SHIP_FIN_L, x, y), closed: true, color },
    { pts: place(SHIP_FIN_R, x, y), closed: true, color },
    { pts: place(SHIP_NOZZLE, x, y), closed: true, color: C.ice },
    { pts: place(SHIP_WINDOW, x, y), closed: true, color },
  ];
}

function hexAround(x: number, y: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return out;
}
