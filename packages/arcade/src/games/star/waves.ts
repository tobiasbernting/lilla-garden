// The three sectors: who comes when. Times are seconds after the sector banner.
import type { Section } from './audio.ts';
import { Carrier, Chevron, Diamond, Group, Rock, SnakeSeg, Spinner, Splitter, bez, type PathFn } from './enemies.ts';
import type { Game, Power } from './game.ts';
import { C, FW, rand } from './util.ts';

export interface SectorDef {
  title: string;
  name: string;
  color: string;
  music: Section;
  bossMusic: Section;
  /** Rough length of the waves (for the progress meter). */
  length: number;
  events: [number, (g: Game) => void][];
}

// ---- spawners ----

function diamondRow(g: Game, n: number, shooters = 0, amp = 55, vy = 105): void {
  const shooting = new Set<number>();
  while (shooting.size < Math.min(n, shooters)) shooting.add(Math.floor(Math.random() * n));
  for (let i = 0; i < n; i++) {
    const x = 80 + ((FW - 160) * i) / Math.max(1, n - 1);
    g.spawn(new Diamond(x, -30 - (i % 2) * 24, amp, 2.2, vy, i * 0.5, shooting.has(i)));
  }
}

function diamondColumn(g: Game, x: number, n: number, shoots = false, amp = 90): void {
  for (let i = 0; i < n; i++) g.spawn(new Diamond(x, -30 - i * 46, amp, 2.0, 110, 0, shoots && i === n - 1));
}

function diamondVee(g: Game, n: number, shooters = 0): void {
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - mid);
    g.spawn(new Diamond(FW / 2 + (i - mid) * 58, -30 - d * 40, 30, 1.6, 100, i, i < shooters));
  }
}

interface FormOpts {
  n: number;
  gap?: number;
  shooters?: number;
  color?: string;
  vee?: boolean;
  dur?: number;
}

function formation(g: Game, path: PathFn, o: FormOpts): void {
  const group = new Group(80 + o.n * 8, 'FORMATION');
  const dur = o.dur ?? 4.6;
  const shoot = new Set<number>();
  while (shoot.size < Math.min(o.n, o.shooters ?? 0)) shoot.add(Math.floor(Math.random() * o.n));
  const mid = (o.n - 1) / 2;
  for (let i = 0; i < o.n; i++) {
    let p = path;
    let delay = i * (o.gap ?? 0.26);
    if (o.vee) {
      const dx = (i - mid) * 36;
      const dy = -Math.abs(i - mid) * 30;
      p = (u) => {
        const [x, y] = path(u);
        return [x + dx, y + dy];
      };
      delay = Math.abs(i - mid) * 0.05;
    }
    g.spawn(new Chevron(p, dur, delay, group, shoot.has(i), o.color ?? C.yellow));
  }
}

const swoopL = (): PathFn => bez(-40, 70, 220, 610, 380, 610, 640, 70);
const swoopR = (): PathFn => bez(640, 70, 380, 610, 220, 610, -40, 70);
const dive = (x0: number, side: number): PathFn => bez(x0, -60, x0, 540, side, 540, side, -80);
const sweep = (y: number, dir: 1 | -1): PathFn =>
  dir > 0 ? bez(-40, y, 200, y + 140, 400, y - 60, 640, y + 60) : bez(640, y, 400, y + 140, 200, y - 60, -40, y + 60);
const zig = (dir: 1 | -1): PathFn => (dir > 0 ? bez(70, -50, 640, 260, -40, 420, 520, 880) : bez(530, -50, -40, 260, 640, 420, 80, 880));

function snake(g: Game, cx: number, n: number, amp = 140, freq = 1.6, speed = 95, dir = 1): void {
  const group = new Group(80 + n * 8, 'ORMEN');
  for (let i = 0; i < n; i++) g.spawn(new SnakeSeg(cx, amp, freq, speed, i * 0.19, group, dir));
}

function spinner(g: Game, x: number, ty: number, mode: 'aim' | 'fan' | 'ring', volleys = 3, wait = 0): void {
  g.spawn(new Spinner(x, ty, mode, volleys, wait));
}

function splitter(g: Game, x: number, vx = 0, y = -40): void {
  g.spawn(new Splitter(x, y, 0, vx, 55));
}

function rock(g: Game, x: number, rad: number, turret: 'none' | 'aim' | 'fan' = 'none', vy = 55): void {
  g.spawn(new Rock(x, -rad - 10, rad, turret, rand(-12, 12), vy));
}

function carrier(g: Game, x: number, power: Power | 'smart'): void {
  g.spawn(new Carrier(x, power === 'smart' ? g.smartPower() : power));
}

// ---- the sectors ----

export const SECTORS: SectorDef[] = [
  {
    title: 'SEKTOR 1',
    name: 'MÅNENS BANA',
    color: C.cyan,
    music: 's1',
    bossMusic: 's1b',
    length: 36,
    events: [
      [0.8, (g) => diamondRow(g, 5, 0, 50, 95)],
      [3.6, (g) => formation(g, swoopL(), { n: 6 })],
      [6.6, (g) => carrier(g, FW / 2, 'spread')],
      [7.6, (g) => (diamondColumn(g, 150, 4), diamondColumn(g, 450, 4))],
      [10.8, (g) => (spinner(g, 150, 170, 'aim', 2), spinner(g, 450, 230, 'aim', 2, 0.5))],
      [13.8, (g) => formation(g, swoopR(), { n: 6 })],
      [16.6, (g) => snake(g, FW / 2, 8, 150, 1.5, 92)],
      [20.0, (g) => (splitter(g, 190, 20), splitter(g, 410, -20, -110))],
      [22.4, (g) => carrier(g, 420, 'shield')],
      [23.6, (g) => formation(g, dive(FW / 2, -60), { n: 5, vee: true, dur: 4.2 })],
      [26.6, (g) => diamondRow(g, 6, 2)],
      [29.0, (g) => (spinner(g, 120, 190, 'aim', 2), spinner(g, 300, 150, 'aim', 2, 0.4), spinner(g, 480, 190, 'aim', 2, 0.8))],
      [31.6, (g) => formation(g, swoopL(), { n: 7 })],
      [33.8, (g) => snake(g, FW / 2, 9, 170, 1.7, 100, -1)],
    ],
  },
  {
    title: 'SEKTOR 2',
    name: 'ASTEROIDBÄLTET',
    color: C.gold,
    music: 's2',
    bossMusic: 's2b',
    length: 36,
    events: [
      [0.8, (g) => (rock(g, 110, 34), rock(g, 260, 42, 'none', 48), rock(g, 400, 30, 'none', 62), rock(g, 520, 38, 'none', 52))],
      [3.4, (g) => (rock(g, 160, 40, 'aim', 50), rock(g, 440, 40, 'aim', 50))],
      [5.8, (g) => formation(g, swoopR(), { n: 7, shooters: 2 })],
      [7.4, (g) => carrier(g, FW / 2, 'laser')],
      [8.8, (g) => snake(g, FW / 2, 10, 160, 1.6, 98)],
      [12.2, (g) => (splitter(g, 140, 30), splitter(g, 300, 0, -100), splitter(g, 460, -30))],
      [15.0, (g) => (rock(g, FW / 2, 46, 'fan', 45), rock(g, 120, 30), rock(g, 480, 32, 'none', 60))],
      [18.0, (g) => (spinner(g, 160, 190, 'ring', 2), spinner(g, 440, 190, 'ring', 2, 0.6))],
      [20.6, (g) => (formation(g, swoopL(), { n: 6, shooters: 1 }), formation(g, sweep(140, -1), { n: 6, shooters: 1, gap: 0.3 }))],
      [23.4, (g) => carrier(g, 180, 'homing')],
      [24.4, (g) => diamondRow(g, 7, 3)],
      [27.2, (g) => (snake(g, 190, 9, 110, 1.8, 100), snake(g, 410, 9, 110, 1.8, 100, -1))],
      [30.6, (g) => (rock(g, 130, 40, 'aim', 52), rock(g, 470, 40, 'aim', 52), spinner(g, 300, 160, 'fan', 2, 0.8))],
      [33.4, (g) => (formation(g, dive(FW / 2, FW + 60), { n: 5, vee: true, shooters: 2, dur: 4.2 }), splitter(g, 120, 30), splitter(g, 480, -30))],
    ],
  },
  {
    title: 'SEKTOR 3',
    name: 'STORMENS ÖGA',
    color: C.magenta,
    music: 's3',
    bossMusic: 's3b',
    length: 33,
    events: [
      [0.8, (g) => (diamondRow(g, 8, 3), diamondColumn(g, FW / 2, 3, true, 120))],
      [3.2, (g) => (formation(g, dive(170, -60), { n: 5, vee: true, shooters: 1, dur: 4 }), formation(g, dive(430, FW + 60), { n: 5, vee: true, shooters: 1, dur: 4 }))],
      [6.2, (g) => (splitter(g, 150, 20), splitter(g, 450, -20), spinner(g, 300, 150, 'ring', 2, 0.6))],
      [8.4, (g) => carrier(g, FW / 2, 'smart')],
      [9.4, (g) => (snake(g, 220, 10, 150, 1.5, 105), snake(g, 380, 10, 150, 1.5, 105, -1))],
      [12.8, (g) => (rock(g, 120, 40, 'fan', 50), rock(g, 300, 36, 'aim', 58), rock(g, 480, 40, 'fan', 50))],
      [15.8, (g) => (formation(g, zig(1), { n: 6, shooters: 2, dur: 5 }), formation(g, zig(-1), { n: 6, shooters: 2, dur: 5, gap: 0.3 }))],
      [18.6, (g) => (spinner(g, 100, 200, 'fan', 2), spinner(g, 230, 150, 'ring', 2, 0.4), spinner(g, 370, 150, 'ring', 2, 0.8), spinner(g, 500, 200, 'fan', 2, 1.2))],
      [21.8, (g) => carrier(g, 200, 'smart')],
      [22.8, (g) => (splitter(g, 100, 40), splitter(g, 250, 0, -100), splitter(g, 350, 0, -60), splitter(g, 500, -40), diamondVee(g, 5, 2))],
      [26.8, (g) => (snake(g, FW / 2, 14, 190, 1.4, 110), formation(g, sweep(110, 1), { n: 6, shooters: 2 }))],
      [30.2, (g) => (diamondRow(g, 8, 4, 70, 120), spinner(g, 300, 180, 'fan', 3, 1))],
    ],
  },
];

