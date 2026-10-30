// Drawing Stjärnstorm: the starfield and each sector's backdrop, everything in the field, the
// frame around it and the score panels.
import { drawPowerIcon, type Emit } from './enemies.ts';
import { CHAIN_TIME, SHIP_BODY, SHIP_FIN_L, SHIP_FIN_R, SHIP_NOZZLE, SHIP_WINDOW, type Game } from './game.ts';
import { computeLayout, type Layout, type Pen, type Screen } from './render.ts';
import { C, FH, FW, TAU, clamp, rand, regular, rockPoly, starPoly } from './util.ts';
import { SECTORS } from './waves.ts';

interface BgStar {
  x: number;
  y: number;
  z: number;
}

interface BgRock {
  x: number;
  y: number;
  r: number;
  rot: number;
  spin: number;
  v: number;
  poly: number[];
}

const LOOK_COLORS = [C.cyan, C.gold, C.magenta, C.violet];
const STAR4 = starPoly(4, 6, 2.2);
const STAR4_SMALL = starPoly(4, 3.2, 1.2);
const STAR_HOMING = starPoly(4, 7, 2.5);
const BOMB_STAR = starPoly(8, 1, 0.45);
const HEX = regular(6, 1, Math.PI / 6);
const LIFE_ICON = [0, -9, 4, -4, 4, 5, -4, 5, -4, -4];
const LIFE_FINS = [-4, 0, -8, 7, -4, 5, 4, 5, 8, 7, 4, 0];
const BOMB_ICON = starPoly(6, 7, 3);
const BOSS_STAR = starPoly(5, 1, 0.45);

/** Persistence: how much of the last frame fades away each 60th of a second. */
const FADE = 0.42;

export class Renderer {
  private stars: BgStar[] = [];
  private rocks: BgRock[] = [];
  private layout: Layout | null = null;
  private bolt: { pts: number[]; t: number } | null = null;
  private boltCd = 3;
  private lastLook = -1;

  constructor(
    private screen: Screen,
    private touch: boolean,
    private low: boolean,
    private color: string,
  ) {
    const n = low ? 70 : 150;
    for (let i = 0; i < n; i++) this.stars.push({ x: Math.random(), y: Math.random(), z: rand(0.15, 1) });
    for (let i = 0; i < (low ? 5 : 8); i++) {
      const r = rand(40, 110);
      this.rocks.push({ x: rand(0, FW), y: rand(-200, FH), r, rot: rand(0, TAU), spin: rand(-0.2, 0.2), v: rand(18, 34), poly: rockPoly(r, 12) });
    }
  }

  /** Screen px per world unit (for turning finger drags into world moves). */
  /** The shell turned its touch buttons on (a finger touched a laptop's screen): make room for them. */
  setTouch(on: boolean): void {
    if (on === this.touch) return;
    this.touch = on;
    this.layout = null;
  }

  scale(): number {
    return this.layout?.s ?? 1;
  }

  render(game: Game, dt: number): void {
    const sc = this.screen;
    if (sc.frame() || !this.layout) this.layout = computeLayout(sc.w, sc.h, this.touch);
    const L = this.layout;
    const pen = sc.pen;
    const g = sc.g;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    pen.setWarp(sc.w, sc.h, 0.055);
    sc.fade(1 - Math.pow(1 - FADE, Math.max(0.25, dt * 60)));
    const pulse = game.sound.pulse();

    // shake moves the field's contents, a little
    const sh = game.shake * game.shake * 11;
    const shx = sh ? rand(-sh, sh) : 0;
    const shy = sh ? rand(-sh, sh) : 0;

    this.drawStarfield(game, pen, L, dt);

    pen.setWorld(L.fx + shx * L.s, L.fy + shy * L.s, L.s);
    g.save();
    g.beginPath();
    pen.sseg(L.fx, L.fy, L.fx + L.fw, L.fy);
    pen.sseg(L.fx + L.fw, L.fy, L.fx + L.fw, L.fy + L.fh, false);
    pen.sseg(L.fx + L.fw, L.fy + L.fh, L.fx, L.fy + L.fh, false);
    pen.sseg(L.fx, L.fy + L.fh, L.fx, L.fy, false);
    g.closePath();
    g.clip();

    this.drawBackdrop(game, pen, dt, pulse);
    this.drawPickups(game, pen);
    for (const e of game.enemies) if (!e.dead) e.draw(pen, game);
    this.drawShots(game, pen);
    this.drawPlayer(game, pen);
    this.drawBullets(game, pen);
    game.fx.draw(pen, this.low);
    this.drawBomb(game, pen);
    this.drawBanner(game, pen, L);
    g.restore();

    pen.setWorld(L.fx, L.fy, L.s);
    this.drawFrame(game, pen, L, pulse);
    this.drawHud(game, pen, L, pulse);
    g.globalAlpha = 1;
    if (game.flashA > 0.01) sc.flash(game.flashC, game.flashA * 0.55);
    sc.bloom();
  }

  // ---------------- the sky ----------------

  private drawStarfield(game: Game, pen: Pen, L: Layout, dt: number): void {
    const warp = game.warp;
    const speed = (game.phase === 'intro' ? 0.4 : 1) * (1 + warp * 16);
    const col = LOOK_COLORS[game.look] ?? C.cyan;
    const { w, h } = L;
    for (const s of this.stars) {
      s.y += s.z * 0.11 * dt * speed;
      if (s.y > 1.05) {
        s.y -= 1.1;
        s.x = Math.random();
      }
    }
    // three depths, in the field brighter than beside it
    for (let layer = 0; layer < 3; layer++) {
      for (const inside of [true, false]) {
        pen.begin();
        let any = false;
        for (const s of this.stars) {
          const lz = s.z < 0.45 ? 0 : s.z < 0.8 ? 1 : 2;
          if (lz !== layer) continue;
          const x = s.x * w;
          const y = s.y * h;
          const inF = x > L.fx && x < L.fx + L.fw && y > L.fy && y < L.fy + L.fh;
          if (inF !== inside) continue;
          const len = (1.5 + s.z * 3.5) * (L.s + 0.4) + warp * 170 * s.z * L.s;
          pen.sm(x, y);
          pen.sl(x, y - len);
          any = true;
        }
        if (!any) continue;
        const color = layer === 2 ? C.white : layer === 1 ? C.ice : col;
        const a = (0.35 + layer * 0.3) * (inside ? 1 : 0.4);
        pen.stroke(color, Math.max(1, (0.8 + layer * 0.5) * Math.min(1.4, L.s + 0.3)), a);
      }
    }
  }

  private drawBackdrop(game: Game, pen: Pen, dt: number, pulse: number): void {
    const look = game.look;
    if (look !== this.lastLook) {
      this.lastLook = look;
      for (const r of this.rocks) r.y = rand(-300, FH);
    }
    const t = game.t;
    if (look === 0) {
      // a ringed planet far away
      const py = 150 + Math.min(1, game.sectorT / 60) * 160;
      pen.begin();
      pen.circle(470, py, 58);
      pen.stroke(C.violet, pen.lw(1.5), 0.35);
      pen.begin();
      pen.arc(470, py, 58, -0.6, 1.3);
      pen.stroke(C.ice, pen.lw(1), 0.2);
      pen.begin();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU;
        const x = Math.cos(a) * 102;
        const y = Math.sin(a) * 18;
        const rx = x * Math.cos(-0.35) - y * Math.sin(-0.35);
        const ry = x * Math.sin(-0.35) + y * Math.cos(-0.35);
        const behind = Math.sin(a) < 0 && Math.abs(x) < 58;
        if (i === 0 || behind) pen.m(470 + rx, py + ry);
        else pen.l(470 + rx, py + ry);
      }
      pen.stroke(C.violet, pen.lw(1.4), 0.3);
      this.drawMoonBase(game, pen);
    } else if (look === 1) {
      for (const r of this.rocks) {
        r.y += r.v * dt;
        r.rot += r.spin * dt;
        if (r.y - r.r > FH) {
          r.y = -r.r - rand(0, 200);
          r.x = rand(0, FW);
        }
        pen.begin();
        pen.shape(r.poly, r.x, r.y, r.rot, 1, true);
        pen.stroke(C.gold, pen.lw(1.2), game.boss ? 0.09 : 0.16);
      }
    } else if (look === 2) {
      // the storm's eye turns slowly far ahead
      const cx = FW / 2;
      const cy = 240;
      for (let arm = 0; arm < 5; arm++) {
        pen.begin();
        for (let i = 0; i <= 40; i++) {
          const r = 18 + i * 13;
          const a = t * 0.3 + (arm * TAU) / 5 + r * 0.011;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r * 0.75;
          if (i === 0) pen.m(x, y);
          else pen.l(x, y);
        }
        pen.stroke(arm % 2 ? C.violet : C.magenta, pen.lw(1.2), (game.boss ? 0.1 : 0.16) + pulse * 0.07);
      }
      this.boltCd -= dt;
      if (this.boltCd <= 0 && !this.bolt) {
        this.boltCd = rand(2.5, 5.5);
        const pts: number[] = [];
        let x = rand(40, FW - 40);
        let y = -10;
        while (y < rand(260, 520)) {
          pts.push(x, y);
          x += rand(-34, 34);
          y += rand(26, 52);
        }
        pts.push(x, y);
        this.bolt = { pts, t: 0.16 };
      }
      if (this.bolt) {
        this.bolt.t -= dt;
        pen.begin();
        pen.shape(this.bolt.pts, 0, 0, 0, 1, false);
        pen.stroke(C.ice, pen.lw(1.6), 0.45);
        if (this.bolt.t <= 0) this.bolt = null;
      }
    } else {
      // a tunnel of light rushing past: the storm's heart
      const cx = FW / 2;
      const cy = 230;
      for (let i = 0; i < 7; i++) {
        const r = (t * 70 + i * 95) % 665;
        pen.begin();
        pen.shape(HEX, cx, cy, t * 0.1, r, true);
        pen.stroke(i % 2 ? C.violet : C.magenta, pen.lw(1 + pulse * 0.6), (r / 665) * (0.15 + pulse * 0.12));
      }
      pen.begin();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6 + t * 0.1;
        pen.seg(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, cx + Math.cos(a) * 700, cy + Math.sin(a) * 700);
      }
      pen.stroke(C.violet, pen.lw(1), 0.09);
    }
  }

  /** Rymdbasen on the moon, where the rocket starts. */
  private drawMoonBase(game: Game, pen: Pen): void {
    const hy = FH - 46 + game.baseScroll;
    if (hy - 140 > FH) return;
    const t = game.t;
    // the moon's curved ground and its craters
    pen.begin();
    pen.arc(FW / 2, hy + 1700, 1700, -Math.PI / 2 - 0.22, -Math.PI / 2 + 0.22);
    pen.stroke(C.ice, pen.lw(2), 0.85);
    pen.begin();
    for (const [x, y, rx, ry] of [
      [80, 34, 34, 7],
      [470, 52, 46, 9],
      [250, 96, 28, 6],
      [560, 120, 24, 5],
    ] as const) {
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * TAU;
        if (i === 0) pen.m(x + Math.cos(a) * rx, hy + y + Math.sin(a) * ry);
        else pen.l(x + Math.cos(a) * rx, hy + y + Math.sin(a) * ry);
      }
    }
    pen.stroke(C.ice, pen.lw(1.3), 0.45);
    // the launch pad
    pen.begin();
    pen.m(250, hy - 4);
    pen.l(350, hy - 4);
    pen.m(262, hy - 4);
    pen.l(256, hy + 6);
    pen.m(338, hy - 4);
    pen.l(344, hy + 6);
    pen.stroke(C.cyan, pen.lw(2), 1);
    // the tower with a blinking light
    pen.begin();
    pen.m(226, hy - 4);
    pen.l(226, hy - 98);
    pen.m(240, hy - 4);
    pen.l(240, hy - 98);
    for (let y = hy - 4; y > hy - 96; y -= 16) {
      pen.m(226, y);
      pen.l(240, y - 16);
      pen.m(240, y);
      pen.l(226, y - 16);
    }
    pen.m(240, hy - 70);
    pen.l(258, hy - 70);
    pen.stroke(C.cyan, pen.lw(1.4), 0.8);
    if (Math.floor(t * 2) % 2 === 0) {
      pen.begin();
      pen.circle(233, hy - 104, 3);
      pen.stroke(C.red, pen.lw(2.5), 1);
    }
    // domes with lit windows
    for (const [x, r] of [
      [110, 38],
      [470, 28],
      [530, 18],
    ] as const) {
      pen.begin();
      pen.arc(x, hy, r, Math.PI, TAU);
      pen.m(x - r - 6, hy);
      pen.l(x + r + 6, hy);
      pen.stroke(C.cyan, pen.lw(1.8), 1);
      pen.begin();
      for (let k = -1; k <= 1; k++) {
        pen.m(x + k * r * 0.4 - 3, hy - r * 0.4);
        pen.l(x + k * r * 0.4 + 3, hy - r * 0.4);
      }
      pen.stroke(C.yellow, pen.lw(2), 0.6 + Math.sin(t * 3 + x) * 0.3);
    }
    // the dish
    pen.begin();
    pen.m(392, hy - 4);
    pen.l(392, hy - 30);
    pen.arc(392, hy - 46, 22, 0.35 + Math.PI * 0.5, 0.35 + Math.PI * 1.5);
    pen.stroke(C.ice, pen.lw(1.5), 0.8);
    // a Swedish flag
    pen.begin();
    pen.m(170, hy - 2);
    pen.l(170, hy - 62);
    pen.stroke(C.ice, pen.lw(1.4), 0.9);
    const wave = Math.sin(t * 4) * 2;
    pen.begin();
    pen.m(170, hy - 62);
    pen.l(206, hy - 62 + wave);
    pen.l(206, hy - 40 + wave);
    pen.l(170, hy - 40);
    pen.stroke(C.blue, pen.lw(1.6), 1);
    pen.begin();
    pen.m(170, hy - 51);
    pen.l(206, hy - 51 + wave);
    pen.m(182, hy - 62 + wave * 0.3);
    pen.l(182, hy - 40 + wave * 0.3);
    pen.stroke(C.yellow, pen.lw(1.8), 1);
  }

  // ---------------- things in the field ----------------

  private drawPickups(game: Game, pen: Pen): void {
    const t = game.t;
    pen.begin();
    let any = false;
    for (const k of game.pickups) {
      if (k.kind !== 'star') continue;
      if (k.t > 9 && Math.floor(k.t * 8) % 2 === 0) continue;
      pen.shape(STAR4, k.x, k.y, k.t * 3, 1 + Math.sin(k.t * 9) * 0.15, true);
      any = true;
    }
    if (any) pen.stroke(C.yellow, pen.lw(1.6), 1);
    pen.begin();
    any = false;
    for (const k of game.pickups) {
      if (k.kind !== 'mini') continue;
      pen.shape(STAR4_SMALL, k.x, k.y, k.t * 5, 1, true);
      any = true;
    }
    if (any) pen.stroke(C.ice, pen.lw(1.3), 0.9);
    const emit = this.worldEmit(pen);
    for (const k of game.pickups) {
      if (k.kind !== 'power' || !k.power) continue;
      const col = k.power === 'spread' ? C.yellow : k.power === 'laser' ? C.cyan : k.power === 'homing' ? C.magenta : k.power === 'shield' ? C.blue : k.power === 'life' ? C.green : C.gold;
      pen.begin();
      pen.circle(k.x, k.y, 18 + Math.sin(t * 6) * 1.5);
      pen.stroke(col, pen.lw(2), 1);
      pen.begin();
      for (let i = 0; i < 8; i++) {
        const a = t * 2 + (i / 8) * TAU;
        pen.arc(k.x, k.y, 24, a, a + 0.35);
      }
      pen.stroke(C.white, pen.lw(1.4), 0.6);
      drawPowerIcon(emit, k.power, k.x, k.y, 0.85, game);
    }
  }

  private worldEmit(pen: Pen): Emit {
    return (pts, x, y, rot, sc, closed, color, sx = 1, w = 2) => {
      pen.begin();
      pen.shape(pts, x, y, rot, sc, closed, sx);
      pen.stroke(color, pen.lw(w), 1);
    };
  }

  private drawShots(game: Game, pen: Pen): void {
    pen.begin();
    let any = false;
    for (const s of game.shots) {
      if (s.kind !== 'bolt') continue;
      const k = 0.022;
      pen.m(s.x, s.y);
      pen.l(s.x - s.vx * k, s.y - s.vy * k);
      any = true;
    }
    if (any) pen.stroke(C.ice, pen.lw(2.6), 1);
    pen.begin();
    any = false;
    for (const s of game.shots) {
      if (s.kind !== 'spread') continue;
      const k = 0.02;
      pen.m(s.x, s.y);
      pen.l(s.x - s.vx * k, s.y - s.vy * k);
      any = true;
    }
    if (any) pen.stroke(C.yellow, pen.lw(2.6), 1);
    pen.begin();
    any = false;
    for (const s of game.shots) {
      if (s.kind !== 'star') continue;
      pen.shape(STAR_HOMING, s.x, s.y, s.t * 14, 1, true);
      any = true;
    }
    if (any) pen.stroke(C.magenta, pen.lw(1.8), 1);
    // the laser
    const p = game.player;
    if (p.laser && p.alive) {
      const w = p.laserW;
      const wob = Math.sin(game.t * 70) * 0.8;
      pen.begin();
      pen.seg(p.x, p.y - 22, p.x, -20);
      pen.stroke(C.cyan, pen.lw(w * 2.2 + wob), 0.35);
      pen.begin();
      pen.seg(p.x, p.y - 22, p.x, -20);
      pen.stroke(C.cyan, pen.lw(w + wob), 0.8);
      pen.begin();
      pen.seg(p.x, p.y - 22, p.x, -20);
      pen.stroke(C.white, pen.lw(Math.max(1.5, w * 0.35)), 1);
      pen.begin();
      pen.circle(p.x, p.y - 24, w * 1.1 + Math.random() * 2);
      pen.stroke(C.white, pen.lw(2), 1);
    }
  }

  private drawPlayer(game: Game, pen: Pen): void {
    const p = game.player;
    if (!p.alive) return;
    const t = game.t;
    const blink = p.inv > 0 && p.inv < 50 && Math.floor(t * 14) % 2 === 0;
    const a = blink ? 0.3 : 1;
    const rot = p.bank * 0.22;
    const sx = 1 - Math.abs(p.bank) * 0.22;
    const y = p.y + p.recoil * 1.5;
    const col = this.color;
    // flame
    const thrust = p.parked ? (game.phaseT > 0.4 ? 1.6 : 0.4) : 1 + Math.max(0, -p.vy / 340) * 0.8;
    pen.begin();
    const fl = (9 + Math.random() * 7) * thrust;
    pen.shape([-4.5, 11, 0, 11 + fl, 4.5, 11], p.x, y, rot, 1, false, sx);
    pen.stroke(C.gold, pen.lw(2), a);
    pen.begin();
    pen.shape([-2, 11, 0, 11 + fl * 0.55, 2, 11], p.x, y, rot, 1, false, sx);
    pen.stroke(C.white, pen.lw(1.6), a);
    // body
    pen.begin();
    pen.shape(SHIP_BODY, p.x, y, rot, 1, true, sx);
    pen.shape(SHIP_NOZZLE, p.x, y, rot, 1, true, sx);
    pen.stroke(C.white, pen.lw(2.2), a);
    pen.begin();
    pen.shape(SHIP_FIN_L, p.x, y, rot, 1, true, sx);
    pen.shape(SHIP_FIN_R, p.x, y, rot, 1, true, sx);
    pen.shape(SHIP_WINDOW, p.x, y, rot, 1, true, sx);
    pen.stroke(col, pen.lw(2.2), a);
    // the tiny hitbox: only this dot counts
    if (!p.parked) {
      pen.begin();
      pen.dot(p.x, p.y, 2.2);
      pen.fill(C.white, 1);
      pen.begin();
      pen.circle(p.x, p.y, 4.2 + Math.sin(t * 10) * 0.6);
      pen.stroke(col, pen.lw(1.2), 0.9);
    }
    // shield
    if (p.shield > 0) {
      pen.begin();
      pen.shape(HEX, p.x, p.y - 4, t * 1.5, 30 + Math.sin(t * 5) * 1.5, true);
      pen.stroke(C.blue, pen.lw(2), 0.85);
      pen.begin();
      for (let i = 0; i < 6; i++) {
        const b = -t * 2 + (i / 6) * TAU;
        pen.arc(p.x, p.y - 4, 35, b, b + 0.45);
      }
      pen.stroke(C.ice, pen.lw(1.2), 0.5);
    }
  }

  private drawBullets(game: Game, pen: Pen): void {
    const t = game.t;
    const g = pen.g;
    const bl = game.bullets;
    if (!bl.length) return;
    const flick = 1 + Math.sin(t * 30) * 0.12;
    // outer rings
    pen.begin();
    for (const b of bl) if (b.kind === 'orb') pen.circle(b.x, b.y, 6.2 * flick * Math.min(1, b.t * 10 + 0.3));
    pen.stroke(C.pink, pen.lw(2.2), 1);
    pen.begin();
    let anyBig = false;
    for (const b of bl) {
      if (b.kind !== 'big') continue;
      pen.circle(b.x, b.y, 9.5 * flick * Math.min(1, b.t * 8 + 0.3));
      anyBig = true;
    }
    if (anyBig) pen.stroke(C.magenta, pen.lw(2.6), 1);
    pen.begin();
    let anyDart = false;
    for (const b of bl) {
      if (b.kind !== 'dart') continue;
      const k = 0.06;
      pen.m(b.x + b.vx * k * 0.3, b.y + b.vy * k * 0.3);
      pen.l(b.x - b.vx * k, b.y - b.vy * k);
      anyDart = true;
    }
    if (anyDart) pen.stroke(C.gold, pen.lw(3), 1);
    // hot white cores
    pen.begin();
    for (const b of bl) pen.dot(b.x, b.y, b.kind === 'big' ? 3.6 : 2.6);
    pen.fill(C.white, 1);
    g.globalAlpha = 1;
  }

  private drawBomb(game: Game, pen: Pen): void {
    if (game.bombT <= 0) return;
    const k = game.bombT / 0.85;
    pen.begin();
    pen.shape(BOMB_STAR, game.bombX, game.bombY, game.t * 2, game.bombR, true);
    pen.stroke(C.yellow, pen.lw(5 * k + 1), k);
    pen.begin();
    pen.shape(BOMB_STAR, game.bombX, game.bombY, -game.t * 2, game.bombR * 0.7, true);
    pen.stroke(C.white, pen.lw(3 * k + 1), k);
  }

  private drawBanner(game: Game, pen: Pen, L: Layout): void {
    const b = game.banner;
    const cx = pen.ox + (FW / 2) * pen.s;
    if (game.phase === 'intro') {
      const t = game.phaseT;
      const line1 = 'STJÄRNSTORMEN ANFALLER RYMDBASEN!';
      const line2 = 'FLYG UPP OCH STOPPA DEN!';
      const y = pen.oy + 470 * pen.s;
      const s = 15 * pen.s;
      pen.text(line1, cx, y, s, C.yellow, { reveal: Math.max(0, (t - 0.2) * 28), alpha: t > 3 ? 1 - (t - 3) * 3 : 1 });
      pen.text(line2, cx, y + s * 1.9, s * 0.85, C.ice, { reveal: Math.max(0, (t - 1.2) * 28), alpha: t > 3 ? 1 - (t - 3) * 3 : 1 });
    }
    if (b) {
      const t = b.t;
      const fadeIn = Math.min(1, t * 4);
      const fadeOut = Math.min(1, (b.dur - t) * 2.5);
      let alpha = Math.min(fadeIn, fadeOut);
      if (b.blink && Math.floor(t * 5) % 2 === 1) alpha *= 0.35;
      const y = pen.oy + 300 * pen.s;
      const titleSize = 50 * pen.s * (b.title.length > 12 ? 0.72 : 1);
      const reveal = t * 30;
      const glitch = t < 0.35 ? 0.6 : 0;
      pen.text(b.title, cx, y, titleSize, b.color, { reveal, alpha, jitter: glitch, width: Math.max(2, titleSize * 0.11), spacing: 0.6 });
      const lw = Math.min(1, t * 2) * (pen.measure(b.title, titleSize, 0.6) / 2 + 30 * pen.s);
      pen.begin();
      pen.sseg(cx - lw, y + titleSize * 0.95, cx + lw, y + titleSize * 0.95);
      pen.stroke(b.color, Math.max(1, 2 * pen.s), alpha * 0.8);
      if (b.sub) pen.text(b.sub, cx, y + titleSize * 1.75, 20 * pen.s, C.white, { reveal: Math.max(0, (t - 0.3) * 30), alpha, spacing: 0.3 });
    }
    // tallies (sector bonus, the end)
    if (game.tallies.length) {
      const y0 = pen.oy + (b && b.sub ? 430 : 400) * pen.s;
      game.tallies.forEach((tl, i) => {
        if (tl.t < 0) return;
        const a = Math.min(1, tl.t * 3);
        const pop = tl.t < 0.15 ? 1 + (0.15 - tl.t) * 3 : 1;
        pen.text(tl.text, cx, y0 + i * 33 * pen.s, 19 * pen.s * pop, tl.color, { alpha: a });
      });
    }
    void L;
  }

  // ---------------- frame and panels ----------------

  private drawFrame(game: Game, pen: Pen, L: Layout, pulse: number): void {
    const col = LOOK_COLORS[game.look] ?? C.cyan;
    const { fx, fy, fw, fh } = L;
    pen.begin();
    pen.srect(fx, fy, fw, fh);
    pen.stroke(col, 1.2, 0.3 + pulse * 0.15);
    const c = Math.min(40, fw * 0.08);
    pen.begin();
    for (const [x, y, dx, dy] of [
      [fx, fy, 1, 1],
      [fx + fw, fy, -1, 1],
      [fx, fy + fh, 1, -1],
      [fx + fw, fy + fh, -1, -1],
    ] as const) {
      pen.sm(x + dx * c, y);
      pen.sl(x, y);
      pen.sl(x, y + dy * c);
    }
    pen.stroke(col, 2.2, 0.85);
  }

  private drawHud(game: Game, pen: Pen, L: Layout, pulse: number): void {
    if (L.hud === 'side') this.hudSide(game, pen, L, pulse);
    else this.hudStrip(game, pen, L, pulse);
    this.bossBar(game, pen, L);
  }

  private hudSide(game: Game, pen: Pen, L: Layout, pulse: number): void {
    const side = L.fx;
    const lx = side / 2;
    const rx = L.fx + L.fw + side / 2;
    const unit = clamp(Math.min(side * 0.1, L.h * 0.042), 9, 34);
    const top = L.fy + unit * 1.6;
    const panelW = Math.min(side * 0.8, unit * 9);
    // left: score, chain
    pen.text('POÄNG', lx, top, unit * 0.62, C.cyan, { alpha: 0.75, spacing: 0.5 });
    pen.text(String(Math.round(game.score)), lx, top + unit * 1.55, unit * 1.25, C.white, { width: Math.max(1.6, unit * 0.13) });
    const my = top + unit * 3.6;
    pen.text(`×${game.mult}`, lx, my, unit * (1.5 + (game.mult > 1 ? pulse * 0.12 : 0)), game.mult > 1 ? C.yellow : C.ice, { width: Math.max(2, unit * 0.15), alpha: game.mult > 1 ? 1 : 0.6 });
    this.chainBar(game, pen, lx - panelW / 2, my + unit * 1.2, panelW, unit);
    pen.text(`KEDJA ${game.chain}`, lx, my + unit * 2.1, unit * 0.55, C.ice, { alpha: 0.7, spacing: 0.4 });
    // the little stars picked up
    const sy = my + unit * 3.9;
    const label = String(game.starsGot);
    const lw = pen.measure(label, unit * 0.9);
    pen.begin();
    pen.sshape(STAR4, lx - lw / 2 - unit * 0.55, sy, game.t * 1.5, unit / 9, true);
    pen.stroke(C.yellow, Math.max(1.2, unit * 0.12), 1);
    pen.text(label, lx + unit * 0.35, sy, unit * 0.9, C.yellow, {});
    // right: lives, bombs, gun, sector
    pen.text('LIV', rx, top, unit * 0.62, C.green, { alpha: 0.75, spacing: 0.5 });
    this.icons(pen, LIFE_ICON, LIFE_FINS, game.lives, rx, top + unit * 1.35, unit, this.color);
    pen.text('BOMBER', rx, top + unit * 2.7, unit * 0.62, C.gold, { alpha: 0.75, spacing: 0.5 });
    this.icons(pen, BOMB_ICON, null, game.bombs, rx, top + unit * 4.0, unit, C.gold);
    this.weapon(game, pen, rx, top + unit * 5.7, unit);
    if (!L.touch || L.h > 560) this.sectorMap(game, pen, rx, top + unit * 9.0, panelW, unit, pulse);
    if (!L.touch) this.panelArt(game, pen, lx, L.fy + L.fh - unit * 2.2, panelW, unit);
  }

  private hudStrip(game: Game, pen: Pen, L: Layout, pulse: number): void {
    const inside = L.hud === 'inside';
    const box = L.strip ?? { x: L.fx + 8, y: L.fy + 4, w: L.fw - 16 - (L.fx + L.fw > L.w - 60 ? 50 : 0), h: 48 };
    const unit = clamp(Math.min(box.h * 0.3, L.w * 0.045), 9, 24);
    const cy = box.y + (inside ? unit * 1.3 : box.h / 2);
    const x0 = box.x + unit * 0.6;
    pen.text(String(Math.round(game.score)), x0, cy - unit * 0.1, unit * 1.2, C.white, { align: 'left', width: Math.max(1.5, unit * 0.13) });
    const mw = pen.measure(String(Math.round(game.score)), unit * 1.2) + unit * 1.2;
    pen.text(`×${game.mult}`, x0 + mw, cy - unit * 0.1, unit * (1.2 + (game.mult > 1 ? pulse * 0.1 : 0)), game.mult > 1 ? C.yellow : C.ice, { align: 'left', alpha: game.mult > 1 ? 1 : 0.6 });
    this.chainBar(game, pen, x0, cy + unit * 1.1, Math.min(box.w * 0.3, unit * 8), unit * 0.8);
    const right = box.x + box.w - unit * 0.8;
    // lives and bombs as icons from the right
    const n = Math.min(6, game.lives);
    for (let i = 0; i < n; i++) {
      pen.begin();
      pen.sshape(LIFE_ICON, right - i * unit * 1.75, cy - unit * 0.45, 0, unit / 11, true);
      pen.sshape(LIFE_FINS, right - i * unit * 1.75, cy - unit * 0.45, 0, unit / 11, false);
      pen.stroke(this.color, Math.max(1.2, unit * 0.12), 1);
    }
    for (let i = 0; i < Math.min(6, game.bombs); i++) {
      pen.begin();
      pen.sshape(BOMB_ICON, right - i * unit * 1.75, cy + unit * 1.25, game.t, unit / 12, true);
      pen.stroke(C.gold, Math.max(1.2, unit * 0.12), 1);
    }
    // the gun in the middle, when there is room
    if (box.w > unit * 19) this.weapon(game, pen, box.x + box.w * 0.55, cy - unit * 0.35, unit * 1.05);
  }

  private chainBar(game: Game, pen: Pen, x: number, y: number, w: number, unit: number): void {
    const k = clamp(game.chainT / CHAIN_TIME, 0, 1);
    pen.begin();
    pen.sseg(x, y, x + w, y);
    pen.stroke(C.ice, Math.max(1, unit * 0.1), 0.25);
    if (k > 0) {
      pen.begin();
      pen.sseg(x, y, x + w * k, y);
      pen.stroke(k < 0.3 ? C.red : C.yellow, Math.max(1.5, unit * 0.22), 1);
    }
  }

  private icons(pen: Pen, a: number[], b: number[] | null, n: number, cx: number, y: number, unit: number, color: string): void {
    const count = Math.min(6, n);
    const gap = unit * 2;
    const x0 = cx - ((count - 1) * gap) / 2;
    pen.begin();
    for (let i = 0; i < count; i++) {
      pen.sshape(a, x0 + i * gap, y, 0, unit / 11, true);
      if (b) pen.sshape(b, x0 + i * gap, y, 0, unit / 11, false);
    }
    pen.stroke(color, Math.max(1.2, unit * 0.12), 1);
    if (n === 0) pen.text('0', cx, y, unit, C.ice, { alpha: 0.4 });
  }

  private weapon(game: Game, pen: Pen, cx: number, y: number, unit: number): void {
    const p = game.player;
    const names = { twin: 'TVILLING', spread: 'SPRIDNING', laser: 'LASER', homing: 'JAKTSTJÄRNOR' } as const;
    pen.text(names[p.weapon], cx, y, unit * 0.55, C.ice, { alpha: 0.8, spacing: 0.3 });
    for (let i = 0; i < 3; i++) {
      pen.begin();
      pen.sshape(HEX, cx + (i - 1) * unit * 0.9, y + unit * 0.9, 0, unit * 0.28, true);
      pen.stroke(i < p.level ? C.yellow : C.ice, Math.max(1.2, unit * (i < p.level ? 0.14 : 0.07)), i < p.level ? 1 : 0.4);
    }
    if (p.shield > 0) {
      const w = pen.measure('SKÖLD', unit * 0.5, 0.3);
      pen.begin();
      pen.sshape(HEX, cx - w / 2 - unit * 0.5, y + unit * 2.0, game.t, unit * 0.36, true);
      pen.stroke(C.blue, Math.max(1.2, unit * 0.12), 1);
      pen.text('SKÖLD', cx + unit * 0.25, y + unit * 2.0, unit * 0.5, C.blue, { spacing: 0.3 });
    }
  }

  /** The way to the storm's heart: three sectors and the boss. */
  private sectorMap(game: Game, pen: Pen, cx: number, y: number, w: number, unit: number, pulse: number): void {
    const n = 4;
    const gap = Math.min(w / (n - 1), unit * 2.4);
    const x0 = cx - (gap * (n - 1)) / 2;
    const cur = Math.min(3, game.sector);
    pen.begin();
    pen.sseg(x0, y, x0 + gap * (n - 1), y);
    pen.stroke(C.ice, Math.max(1, unit * 0.08), 0.35);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      const done = i < cur;
      const here = i === cur;
      const col = i === 3 ? C.magenta : (LOOK_COLORS[i] ?? C.cyan);
      pen.begin();
      if (i === 3) pen.sshape(BOSS_STAR, x, y, 0, unit * 0.55 * (here ? 1 + pulse * 0.25 : 1), true);
      else pen.scircle(x, y, unit * 0.38 * (here ? 1 + pulse * 0.25 : 1));
      pen.stroke(col, Math.max(1.2, unit * (here ? 0.16 : 0.09)), done || here ? 1 : 0.4);
      if (done) {
        pen.begin();
        pen.sm(x - unit * 0.18, y);
        pen.sl(x - unit * 0.03, y + unit * 0.16);
        pen.sl(x + unit * 0.2, y - unit * 0.18);
        pen.stroke(col, Math.max(1.2, unit * 0.12), 1);
      }
    }
    if (cur < 3) {
      const k = game.progress();
      pen.begin();
      pen.sseg(x0 + cur * gap, y, x0 + cur * gap + gap * k, y);
      pen.stroke(LOOK_COLORS[cur] ?? C.cyan, Math.max(1.5, unit * 0.16), 1);
    }
    const label = cur < 3 ? (SECTORS[cur]?.title ?? '') : 'BOSSEN';
    pen.text(label, cx, y + unit * 1.1, unit * 0.55, C.white, { alpha: 0.85, spacing: 0.4 });
  }

  /** The panel's own little picture: the moon base we protect. */
  private panelArt(game: Game, pen: Pen, cx: number, y: number, w: number, unit: number): void {
    const s = unit / 10;
    pen.begin();
    pen.sseg(cx - w / 2, y, cx + w / 2, y);
    pen.stroke(C.ice, Math.max(1, unit * 0.08), 0.4);
    pen.begin();
    for (const [dx, r] of [
      [-2.2, 1.6],
      [0.6, 2.4],
      [2.9, 1.1],
    ] as const) {
      const x = cx + dx * unit;
      const rr = r * unit;
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI + (i / 16) * Math.PI;
        if (i === 0) pen.sm(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else pen.sl(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    }
    pen.stroke(C.cyan, Math.max(1, 1.4 * s), 0.55);
    pen.text('RYMDBASEN', cx, y + unit * 0.9, unit * 0.45, C.cyan, { alpha: 0.55, spacing: 0.5 });
    if (Math.floor(game.t * 2) % 2 === 0) {
      pen.begin();
      pen.scircle(cx + 0.6 * unit, y - 2.6 * unit, unit * 0.12);
      pen.stroke(C.red, 2, 1);
    }
  }

  private bossBar(game: Game, pen: Pen, L: Layout): void {
    const b = game.boss;
    if (!b || b.state === 'dying') return;
    const appear = b.state === 'enter' ? clamp(b.st / 1.2, 0, 1) : 1;
    const inside = L.hud === 'inside';
    const y = L.fy + (inside ? 64 : 22) * Math.max(0.6, L.s);
    const w = L.fw * 0.72 * appear;
    const x = L.fx + (L.fw - w) / 2;
    const size = clamp(13 * L.s, 8, 20);
    pen.text(b.name, L.fx + L.fw / 2, y, size, b.color, { spacing: 0.6, alpha: appear });
    const by = y + size * 1.25;
    pen.begin();
    pen.sseg(x, by, x + w, by);
    pen.stroke(C.ice, Math.max(1, size * 0.1), 0.3);
    const k = b.state === 'enter' ? appear : b.healthFrac();
    pen.begin();
    pen.sseg(x, by, x + w * k, by);
    pen.stroke(k < 0.25 ? C.red : C.yellow, Math.max(2, size * 0.35), 1);
    const marks = (b as { marks?: () => number[] }).marks?.() ?? [];
    pen.begin();
    for (const m of marks) {
      pen.sm(x + w * m, by - size * 0.45);
      pen.sl(x + w * m, by + size * 0.45);
    }
    pen.stroke(C.white, 1.5, 0.8);
  }
}
