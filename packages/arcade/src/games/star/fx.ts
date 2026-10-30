// Light effects: shapes that burst into flying line pieces, rings of light, sparks and score popups.
import type { Pen } from './render.ts';
import { FW, TAU, rand } from './util.ts';

interface Frag {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  hl: number;
  life: number;
  max: number;
  color: string;
  w: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  w: number;
  sides: number;
  rot: number;
  delay: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  drag: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
  size: number;
}

/** A polyline in world space (for shattering). */
export interface Poly {
  pts: number[];
  closed: boolean;
  color: string;
}

export class Fx {
  frags: Frag[] = [];
  rings: Ring[] = [];
  sparks: Spark[] = [];
  pops: Popup[] = [];

  constructor(
    private maxFrags: number,
    private maxSparks: number,
  ) {}

  /** Every edge of the shape flies away from (cx, cy), spinning. */
  shatter(polys: Poly[], cx: number, cy: number, speed = 160, life = 0.9, width = 2): void {
    for (const p of polys) {
      const n = p.pts.length / 2;
      const segs = p.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        if (this.frags.length >= this.maxFrags) this.frags.shift();
        const x0 = p.pts[i * 2]!;
        const y0 = p.pts[i * 2 + 1]!;
        const j = (i + 1) % n;
        const x1 = p.pts[j * 2]!;
        const y1 = p.pts[j * 2 + 1]!;
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const d = Math.hypot(dx, dy) || 1;
        const sp = speed * rand(0.6, 1.4);
        const m = rand(0.85, 1.25) * life;
        this.frags.push({
          x: mx,
          y: my,
          vx: (dx / d) * sp + rand(-30, 30),
          vy: (dy / d) * sp + rand(-30, 30),
          a: Math.atan2(y1 - y0, x1 - x0),
          va: rand(-9, 9),
          hl: Math.hypot(x1 - x0, y1 - y0) / 2,
          life: m,
          max: m,
          color: p.color,
          w: width,
        });
      }
    }
  }

  /** Loose line pieces in all directions (no shape to break). */
  debris(x: number, y: number, n: number, color: string, speed = 180, len = 8, life = 0.8): void {
    for (let i = 0; i < n; i++) {
      if (this.frags.length >= this.maxFrags) this.frags.shift();
      const a = rand(0, TAU);
      const sp = speed * rand(0.4, 1.3);
      const m = life * rand(0.7, 1.3);
      this.frags.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: rand(0, TAU), va: rand(-10, 10), hl: len * rand(0.5, 1), life: m, max: m, color, w: 2 });
    }
  }

  /** An expanding ring (sides = 0 for a circle, or a polygon). */
  ring(x: number, y: number, color: string, speed = 300, life = 0.45, w = 3, sides = 0, r0 = 4, delay = 0): void {
    if (this.rings.length > 60) this.rings.shift();
    this.rings.push({ x, y, r: r0, vr: speed, life, max: life, color, w, sides, rot: rand(0, TAU), delay });
  }

  burst(x: number, y: number, n: number, color: string, speed = 220, life = 0.5, drag = 2.5): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      const a = rand(0, TAU);
      const sp = speed * rand(0.3, 1.2);
      const m = life * rand(0.6, 1.4);
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: m, max: m, color, drag });
    }
  }

  /** Sparks thrown in a direction (a hit): angle and spread in radians. */
  spray(x: number, y: number, n: number, color: string, angle: number, spread: number, speed = 260, life = 0.25): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      const a = angle + rand(-spread, spread);
      const sp = speed * rand(0.5, 1.2);
      const m = life * rand(0.6, 1.3);
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: m, max: m, color, drag: 4 });
    }
  }

  popup(x: number, y: number, text: string, color: string, size = 14, life = 0.8): void {
    if (this.pops.length > 24) this.pops.shift();
    this.pops.push({ x, y, text, life, max: life, color, size });
  }

  clear(): void {
    this.frags.length = 0;
    this.rings.length = 0;
    this.sparks.length = 0;
    this.pops.length = 0;
  }

  update(dt: number): void {
    const f = this.frags;
    for (let i = f.length - 1; i >= 0; i--) {
      const p = f[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        f[i] = f[f.length - 1]!;
        f.pop();
        continue;
      }
      const drag = Math.exp(-1.4 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.va * dt;
    }
    const r = this.rings;
    for (let i = r.length - 1; i >= 0; i--) {
      const q = r[i]!;
      if (q.delay > 0) {
        q.delay -= dt;
        continue;
      }
      q.life -= dt;
      if (q.life <= 0) {
        r.splice(i, 1);
        continue;
      }
      q.r += q.vr * dt;
      q.vr *= Math.exp(-2.2 * dt);
    }
    const s = this.sparks;
    for (let i = s.length - 1; i >= 0; i--) {
      const p = s[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        s[i] = s[s.length - 1]!;
        s.pop();
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const pp = this.pops;
    for (let i = pp.length - 1; i >= 0; i--) {
      const p = pp[i]!;
      p.life -= dt;
      p.y -= 34 * dt;
      if (p.life <= 0) pp.splice(i, 1);
    }
  }

  draw(pen: Pen, low: boolean): void {
    const g = pen.g;
    // rings
    for (const q of this.rings) {
      if (q.delay > 0) continue;
      const t = q.life / q.max;
      pen.begin();
      if (q.sides) {
        for (let i = 0; i <= q.sides; i++) {
          const a = q.rot + (i / q.sides) * TAU;
          if (i === 0) pen.m(q.x + Math.cos(a) * q.r, q.y + Math.sin(a) * q.r);
          else pen.l(q.x + Math.cos(a) * q.r, q.y + Math.sin(a) * q.r);
        }
      } else pen.circle(q.x, q.y, q.r);
      pen.stroke(q.color, pen.lw(q.w * (0.4 + t * 0.8)), Math.min(1, t * 1.6));
    }
    // fragments, grouped by colour (few distinct colours → few strokes)
    const byColor = new Map<string, Frag[]>();
    for (const p of this.frags) {
      let list = byColor.get(p.color);
      if (!list) byColor.set(p.color, (list = []));
      list.push(p);
    }
    for (const [color, list] of byColor) {
      // two brightness steps keep the fade smooth without a stroke per piece
      for (const half of [0, 1]) {
        pen.begin();
        let any = false;
        for (const p of list) {
          const t = p.life / p.max;
          if ((t > 0.45 ? 0 : 1) !== half) continue;
          any = true;
          const c = Math.cos(p.a) * p.hl;
          const s = Math.sin(p.a) * p.hl;
          pen.m(p.x - c, p.y - s);
          pen.l(p.x + c, p.y + s);
        }
        if (any) pen.stroke(color, pen.lw(2), half ? 0.45 : 1);
      }
    }
    // sparks as short streaks
    g.globalCompositeOperation = 'lighter';
    const sparkBy = new Map<string, Spark[]>();
    for (const p of this.sparks) {
      let list = sparkBy.get(p.color);
      if (!list) sparkBy.set(p.color, (list = []));
      list.push(p);
    }
    for (const [color, list] of sparkBy) {
      pen.begin();
      for (const p of list) {
        pen.m(p.x, p.y);
        pen.l(p.x - p.vx * 0.03, p.y - p.vy * 0.03 + 0.01);
      }
      pen.stroke(color, pen.lw(low ? 2 : 1.8), 0.9);
    }
    g.globalCompositeOperation = 'source-over';
    // popups
    for (const p of this.pops) {
      const t = p.life / p.max;
      // readable on a small phone too, and the words stay inside the field
      const maxPx = (FW * pen.s * 0.9) / (pen.measure(p.text, 1) || 1);
      const px = Math.min(Math.max(p.size * pen.s, 9), maxPx);
      const half = (pen.measure(p.text, px) / 2 + 6) / pen.s;
      p.x = Math.max(half, Math.min(FW - half, p.x));
      const sx = pen.ox + p.x * pen.s;
      const sy = pen.oy + p.y * pen.s;
      pen.text(p.text, sx, sy, px * (t > 0.85 ? 1 + (t - 0.85) * 2 : 1), p.color, { alpha: Math.min(1, t * 2.2) });
    }
    g.globalAlpha = 1;
  }
}
