// Sparks, rings, confetti and fireworks. Everything is pooled in plain arrays and drawn additively.
import { C, glow, mix, rainbow, rgba, star, type G } from './art.ts';

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2 | 3 | 4; // spark, star, confetti, smoke, flash
  rot: number;
  vr: number;
  drag: number;
  grav: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  color: string;
  big: boolean;
  trail: number;
}

export class Fx {
  private parts: Part[] = [];
  private rings: Ring[] = [];
  private rockets: Rocket[] = [];
  private cap: number;

  constructor(low: boolean) {
    this.cap = low ? 260 : 700;
  }

  get count(): number {
    return this.parts.length;
  }

  clear(): void {
    this.parts = [];
    this.rings = [];
    this.rockets = [];
  }

  private add(p: Part): void {
    if (this.parts.length >= this.cap) this.parts.shift();
    this.parts.push(p);
  }

  /** A burst of sparks (and stars for a Perfekt) at a receptor. */
  burst(x: number, y: number, color: string, n: number, speed: number, stars: boolean, s: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.35 + Math.random() * 0.35,
        size: (3 + Math.random() * 4) * s,
        color: Math.random() < 0.3 ? C.white : color,
        kind: stars && i % 3 === 0 ? 1 : 0,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        drag: 2.5,
        grav: 900 * s,
      });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, time: number, width: number): void {
    this.rings.push({ x, y, r0, r1, life: 0, max: time, color, width });
  }

  /** Grey puffs for a miss. */
  puff(x: number, y: number, s: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({ x, y, vx: Math.cos(a) * 60 * s, vy: Math.sin(a) * 60 * s - 40 * s, life: 0, max: 0.5, size: (8 + Math.random() * 8) * s, color: '#8a80a8', kind: 3, rot: 0, vr: 0, drag: 3, grav: -60 * s });
    }
  }

  /** Confetti raining over the screen. */
  confetti(w: number, n: number, s: number): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x: Math.random() * w,
        y: -20 - Math.random() * 200 * s,
        vx: (Math.random() - 0.5) * 80 * s,
        vy: (100 + Math.random() * 120) * s,
        life: 0,
        max: 3 + Math.random() * 2,
        size: (5 + Math.random() * 5) * s,
        color: rainbow(Math.random()),
        kind: 2,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        drag: 0.6,
        grav: 60 * s,
      });
    }
  }

  /** Send a rocket up from (x, y) to burst near (tx, ty) after `fly` seconds. */
  rocket(x: number, y: number, tx: number, ty: number, fly: number, color: string, big: boolean): void {
    this.rockets.push({ x, y, vx: (tx - x) / fly, vy: (ty - y) / fly, fuse: fly, color, big, trail: 0 });
  }

  private bang(r: Rocket, s: number): void {
    const n = Math.round((r.big ? 96 : 64) * (this.cap < 400 ? 0.6 : 1));
    const speed = (r.big ? 560 : 420) * s;
    this.add({ x: r.x, y: r.y, vx: 0, vy: 0, life: 0, max: 0.45, size: (r.big ? 200 : 140) * s, color: mix(r.color, '#ffffff', 0.4), kind: 4, rot: 0, vr: 0, drag: 0, grav: 0 });
    const second = Math.random() < 0.5 ? C.white : rainbow(Math.random());
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      const v = speed * (0.75 + Math.random() * 0.3);
      this.add({
        x: r.x,
        y: r.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 1.2 + Math.random() * 0.7,
        size: (5 + Math.random() * 4) * s,
        color: i % 4 === 0 ? second : r.color,
        kind: i % 9 === 0 ? 1 : 0,
        rot: 0,
        vr: 4,
        drag: 1.6,
        grav: 160 * s,
      });
    }
    this.ring(r.x, r.y, 10 * s, (r.big ? 320 : 230) * s, r.color, 0.55, 6 * s);
  }

  update(dt: number, s: number): void {
    for (const p of this.parts) {
      p.life += dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const r of this.rockets) {
      r.fuse -= dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.trail += dt;
      if (r.trail > 0.025) {
        r.trail = 0;
        this.add({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 20 * s, vy: 30 * s, life: 0, max: 0.4, size: 3 * s, color: mix(r.color, '#ffffff', 0.5), kind: 0, rot: 0, vr: 0, drag: 2, grav: 50 * s });
      }
      if (r.fuse <= 0) this.bang(r, s);
    }
    this.rockets = this.rockets.filter((r) => r.fuse > 0);
  }

  draw(g: G): void {
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const f = r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - f, 2));
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, Math.PI * 2);
      g.lineWidth = r.width * (1 - f * 0.7);
      g.strokeStyle = rgba(r.color, 0.8 * (1 - f));
      g.stroke();
    }
    for (const r of this.rockets) glow(g, mix(r.color, '#ffffff', 0.5), r.x, r.y, 16, 1);
    for (const p of this.parts) {
      const f = p.life / p.max;
      const a = 1 - f;
      if (p.kind === 4) {
        glow(g, p.color, p.x, p.y, p.size * (0.6 + f * 0.6), (1 - f) * (1 - f));
      } else if (p.kind === 0) {
        glow(g, p.color, p.x, p.y, p.size * 2.2, a);
      } else if (p.kind === 1) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        star(g, 0, 0, p.size * 1.6, 0.45);
        g.fillStyle = rgba(mix(p.color, '#ffffff', 0.5), a);
        g.fill();
        g.restore();
        glow(g, p.color, p.x, p.y, p.size * 3, a * 0.6);
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (const p of this.parts) {
      const f = p.life / p.max;
      if (p.kind === 2) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(p.rot * 1.7));
        g.fillStyle = rgba(p.color, Math.min(1, (1 - f) * 3));
        g.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
        g.restore();
      } else if (p.kind === 3) {
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.6 + f), 0, Math.PI * 2);
        g.fillStyle = rgba(p.color, 0.35 * (1 - f));
        g.fill();
      }
    }
  }
}
