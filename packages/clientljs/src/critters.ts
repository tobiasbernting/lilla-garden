// Small life in the fields: butterflies dancing between the flowers on warm days, and sparrows hopping and pecking
// in the grass that take off when someone comes close.
import { MAP_H, MAP_W, TILE, type WorldObject } from '@lilla-garden/shared';
import { on } from './features.ts';
import { alpha, type DrawQueue } from './gfx.ts';
import { inView, type Scene } from './scene.ts';

const FLOWERS = new Set(['flower', 'wild_flower_mid', 'flowerbox', 'plant']);

interface Butterfly {
  /** Ground position under it, and how high it flies. */
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  colour: number;
  target: { x: number; y: number } | null;
  /** Seconds left resting on a flower. */
  rest: number;
  phase: number;
}

interface Bird {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  flying: boolean;
  /** Seconds to the next hop or peck, and how long the current peck lasts. */
  next: number;
  peck: number;
  hop: number;
  face: number;
  phase: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class Critters {
  private flies: Butterfly[] = [];
  private birds: Bird[] = [];
  /** Seconds until a new flock may land. */
  private flockIn = 2;

  clear(): void {
    this.flies = [];
    this.birds = [];
    this.flockIn = 2;
  }

  private warm(sc: Scene): boolean {
    if (sc.weather !== 'sun' && sc.weather !== 'cloudy' && sc.weather !== null) return false;
    if (sc.year === 'summer' || (sc.year === 'spring' && sc.day < 0.62)) return true;
    // a mild autumn afternoon still has a few
    return sc.year === 'autumn' && sc.weather === 'sun' && sc.day > 0.15 && sc.day < 0.55;
  }

  update(sc: Scene, objects: Iterable<WorldObject>): void {
    if (!on('critters') || sc.where !== 'out') {
      this.clear();
      return;
    }
    const dt = sc.dt;
    const daylight = sc.sky.dark < 0.35;
    const flowers: { x: number; y: number }[] = [];
    for (const o of objects) if (FLOWERS.has(o.kind) && inView(sc, o.x * TILE, o.y * TILE, TILE, TILE, 60)) flowers.push({ x: o.x * TILE + 8, y: o.y * TILE + 10 });

    // butterflies: a few on warm days, more where the flowers are
    const want = daylight && this.warm(sc) ? Math.min(6, 2 + Math.floor(flowers.length / 3)) : 0;
    while (this.flies.length < want) {
      const f = flowers.length ? flowers[Math.floor(Math.random() * flowers.length)]! : { x: sc.vx + rnd(0, sc.vw), y: sc.vy + rnd(0, sc.vh) };
      this.flies.push({ x: f.x + rnd(-40, 40), y: f.y + rnd(-30, 30), h: rnd(6, 12), vx: 0, vy: 0, colour: Math.floor(Math.random() * 4), target: null, rest: 0, phase: rnd(0, 6) });
    }
    if (this.flies.length > want) this.flies.length = want;
    for (const b of this.flies) {
      if (b.rest > 0) {
        b.rest -= dt;
        b.h += (1.5 - b.h) * Math.min(1, dt * 6);
        if (b.rest <= 0) b.target = null;
        continue;
      }
      if (!b.target) b.target = flowers.length ? flowers[Math.floor(Math.random() * flowers.length)]! : { x: b.x + rnd(-50, 50), y: b.y + rnd(-30, 30) };
      const dx = b.target.x - b.x;
      const dy = b.target.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) {
        b.rest = flowers.length ? rnd(1.5, 4) : 0.1;
        continue;
      }
      // fluttering: steered towards the flower, but never in a straight line
      b.vx += ((dx / d) * 34 - b.vx) * dt * 2 + rnd(-90, 90) * dt;
      b.vy += ((dy / d) * 26 - b.vy) * dt * 2 + rnd(-90, 90) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.h += (8 + Math.sin(sc.t * 3 + b.phase) * 4 - b.h) * Math.min(1, dt * 3);
      if (!inView(sc, b.x, b.y, 0, 0, 200)) b.target = null;
    }

    // sparrows: a little flock on the grass now and then, off it goes when someone comes close
    for (const b of this.birds) {
      if (b.flying) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.h += 30 * dt;
        continue;
      }
      const scared = sc.movers.some((m) => Math.hypot(m.x - b.x, m.y - b.y) < 38);
      if (scared) {
        // the whole flock goes together, away from whoever came
        for (const o of this.birds) {
          if (o.flying) continue;
          const m = sc.movers.reduce((best, mv) => (Math.hypot(mv.x - o.x, mv.y - o.y) < Math.hypot(best.x - o.x, best.y - o.y) ? mv : best), sc.movers[0]!);
          const ax = o.x - m.x || 1;
          const ay = o.y - m.y;
          const al = Math.hypot(ax, ay) || 1;
          o.flying = true;
          o.vx = (ax / al) * rnd(55, 80);
          o.vy = (ay / al) * rnd(30, 50) - 25;
          o.face = o.vx >= 0 ? 1 : -1;
        }
        this.flockIn = rnd(14, 28);
        break;
      }
      b.next -= dt;
      if (b.peck > 0) b.peck -= dt;
      if (b.hop > 0) {
        b.hop -= dt;
        b.h = Math.sin((1 - b.hop / 0.18) * Math.PI) * 2;
      } else b.h = 0;
      if (b.next <= 0) {
        b.next = rnd(0.35, 1.3);
        if (Math.random() < 0.55) b.peck = 0.22;
        else {
          b.hop = 0.18;
          const step = rnd(3, 6);
          b.face = Math.random() < 0.5 ? -1 : 1;
          b.x += b.face * step;
          b.y += rnd(-2, 2);
        }
      }
    }
    this.birds = this.birds.filter((b) => !b.flying || inView(sc, b.x, b.y - b.h, 0, 0, 40));
    this.flockIn -= dt;
    const fair = sc.weather === 'sun' || sc.weather === 'cloudy' || sc.weather === 'wind' || sc.weather === null;
    if (!this.birds.length && this.flockIn <= 0 && daylight && fair) {
      // land on grass in view, away from everyone
      for (let tries = 0; tries < 20; tries++) {
        const tx = Math.floor((sc.vx + rnd(0.15, 0.85) * sc.vw) / TILE);
        const ty = Math.floor((sc.vy + rnd(0.15, 0.85) * sc.vh) / TILE);
        if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) continue;
        if (sc.world.terrain[ty * MAP_W + tx] !== 'grass' || sc.world.occupancy[`${tx},${ty}`] !== undefined) continue;
        const x = tx * TILE + 8;
        const y = ty * TILE + 8;
        if (sc.movers.some((m) => Math.hypot(m.x - x, m.y - y) < 80)) continue;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.birds.push({ x: x + rnd(-10, 10), y: y + rnd(-6, 6), h: 0, vx: 0, vy: 0, flying: false, next: rnd(0.2, 1), peck: 0, hop: 0, face: Math.random() < 0.5 ? -1 : 1, phase: rnd(0, 6) });
        break;
      }
      this.flockIn = rnd(8, 16);
    }
  }

  /** Into the y-sorted queue (flying birds over everything). */
  queue(sc: Scene, q: DrawQueue): void {
    if (!on('critters')) return;
    const ex = sc.extras;
    const shadow = sc.art.fx.shadow?.[0];
    for (const b of this.flies) {
      if (!inView(sc, b.x, b.y - b.h)) continue;
      const frames = ex.butterflies[b.colour]!;
      const flap = b.rest > 0 ? Math.sin(sc.t * 4 + b.phase) > 0.6 : Math.sin(sc.t * 40 + b.phase) > 0;
      const s = frames[flap ? 1 : 0]!;
      if (shadow) q.push(b.y - 1, shadow, b.x, b.y, 5, 2, 0, alpha(0.25));
      q.push(b.y + 1, s, b.x, b.y - b.h, s.w * (b.vx < 0 ? -1 : 1), s.h);
    }
    for (const b of this.birds) {
      if (!inView(sc, b.x, b.y - b.h)) continue;
      let f = 0;
      if (b.flying) f = Math.sin(sc.t * 30 + b.phase) > 0 ? 2 : 3;
      else if (b.peck > 0) f = 1;
      const s = ex.bird[f]!;
      if (shadow && b.h < 30) q.push(b.y - 1, shadow, b.x, b.y + 2, 6 * (1 - b.h / 40), 2 * (1 - b.h / 40), 0, alpha(0.3));
      q.push(b.flying ? 9500 : b.y + 2, s, b.x, b.y - b.h - s.h / 2 + 2, s.w * b.face, s.h);
    }
  }
}
