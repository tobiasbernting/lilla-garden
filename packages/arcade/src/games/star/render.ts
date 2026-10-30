// The vector display: a pen that draws thin lines through a slight CRT barrel curve, a phosphor
// buffer that fades instead of clearing (afterglow trails), and a cheap bloom (the frame halved a
// few times, shown on top with additive blending by the browser).
import { fullCanvas } from '../../kit.ts';
import { glyph, measureUnits } from './font.ts';
import { FH, FW, TAU } from './util.ts';

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  align?: Align;
  alpha?: number;
  /** Line width in px (default from the size). */
  width?: number;
  /** Show only this many characters (typewriter); the last one flickers. */
  reveal?: number;
  /** Random wobble in grid units (a glitchy banner). */
  jitter?: number;
  /** Lean the letters (grid units per unit of height). */
  skew?: number;
  /** Extra space between letters in grid units. */
  spacing?: number;
}

export class Pen {
  ox = 0;
  oy = 0;
  s = 1;
  px = 0;
  py = 0;
  private cx = 0;
  private cy = 0;
  private k = 0;

  constructor(public g: CanvasRenderingContext2D) {}

  /** World units → screen px: x * s + ox. */
  setWorld(ox: number, oy: number, s: number): void {
    this.ox = ox;
    this.oy = oy;
    this.s = s;
  }

  /** The tube's curve: strength is how much the corners pull in (0.05 = 5 %). */
  setWarp(w: number, h: number, strength: number): void {
    this.cx = w / 2;
    this.cy = h / 2;
    this.k = strength / (this.cx * this.cx + this.cy * this.cy);
  }

  /** Bend a screen point; the result is in px, py. */
  P(x: number, y: number): void {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const f = 1 - this.k * (dx * dx + dy * dy);
    this.px = this.cx + dx * f;
    this.py = this.cy + dy * f;
  }

  /** Local shrink of the curve at a screen point (for small circles). */
  scaleAt(x: number, y: number): number {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return 1 - this.k * (dx * dx + dy * dy);
  }

  begin(): void {
    this.g.beginPath();
  }

  stroke(color: string, width: number, alpha = 1): void {
    const g = this.g;
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
  }

  fill(color: string, alpha = 1): void {
    const g = this.g;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fill();
  }

  /** A world line width in px (never thinner than a hairline). */
  lw(w: number): number {
    return Math.max(1, w * this.s);
  }

  // ---- world space ----

  m(x: number, y: number): void {
    this.P(this.ox + x * this.s, this.oy + y * this.s);
    this.g.moveTo(this.px, this.py);
  }

  l(x: number, y: number): void {
    this.P(this.ox + x * this.s, this.oy + y * this.s);
    this.g.lineTo(this.px, this.py);
  }

  /** A long world line, cut in pieces so it follows the curve. */
  seg(x0: number, y0: number, x1: number, y1: number, move = true): void {
    const len = Math.hypot(x1 - x0, y1 - y0) * this.s;
    const n = Math.max(1, Math.min(24, Math.ceil(len / 48)));
    if (move) this.m(x0, y0);
    for (let i = 1; i <= n; i++) this.l(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  }

  /** A shape (flat x,y list) placed in the world: rotated, scaled, optionally squashed (sx) for a 3D spin. */
  shape(pts: readonly number[], x: number, y: number, rot = 0, sc = 1, closed = true, sx = 1, sy = 1): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < pts.length; i += 2) {
      const lx = pts[i]! * sc * sx;
      const ly = pts[i + 1]! * sc * sy;
      const wx = x + lx * c - ly * s;
      const wy = y + lx * s + ly * c;
      if (i === 0) this.m(wx, wy);
      else this.l(wx, wy);
    }
    if (closed) this.g.closePath();
  }

  /** A world circle (a polygon that follows the curve; small ones are plain arcs). */
  circle(x: number, y: number, r: number): void {
    const sx = this.ox + x * this.s;
    const sy = this.oy + y * this.s;
    const rp = r * this.s;
    if (rp < 10) {
      this.P(sx, sy);
      const rr = Math.max(0.5, rp * this.scaleAt(sx, sy));
      this.g.moveTo(this.px + rr, this.py);
      this.g.arc(this.px, this.py, rr, 0, TAU);
      return;
    }
    const n = Math.max(12, Math.min(56, Math.round(rp / 3)));
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      if (i === 0) this.m(x + r, y);
      else this.l(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  /** An arc of a world circle. */
  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const rp = r * this.s;
    const n = Math.max(3, Math.min(48, Math.ceil((Math.abs(a1 - a0) * rp) / 6)));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      if (i === 0) this.m(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else this.l(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  /** A filled dot (bullet cores, sparks). */
  dot(x: number, y: number, r: number): void {
    const sx = this.ox + x * this.s;
    const sy = this.oy + y * this.s;
    this.P(sx, sy);
    const rr = Math.max(0.6, r * this.s * this.scaleAt(sx, sy));
    this.g.moveTo(this.px + rr, this.py);
    this.g.arc(this.px, this.py, rr, 0, TAU);
  }

  // ---- screen space (the HUD) ----

  sm(x: number, y: number): void {
    this.P(x, y);
    this.g.moveTo(this.px, this.py);
  }

  sl(x: number, y: number): void {
    this.P(x, y);
    this.g.lineTo(this.px, this.py);
  }

  sseg(x0: number, y0: number, x1: number, y1: number, move = true): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.min(24, Math.ceil(len / 48)));
    if (move) this.sm(x0, y0);
    for (let i = 1; i <= n; i++) this.sl(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  }

  srect(x: number, y: number, w: number, h: number): void {
    this.sseg(x, y, x + w, y);
    this.sseg(x + w, y, x + w, y + h, false);
    this.sseg(x + w, y + h, x, y + h, false);
    this.sseg(x, y + h, x, y, false);
  }

  sshape(pts: readonly number[], x: number, y: number, rot = 0, sc = 1, closed = true): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < pts.length; i += 2) {
      const lx = pts[i]! * sc;
      const ly = pts[i + 1]! * sc;
      if (i === 0) this.sm(x + lx * c - ly * s, y + lx * s + ly * c);
      else this.sl(x + lx * c - ly * s, y + lx * s + ly * c);
    }
    if (closed) this.g.closePath();
  }

  scircle(x: number, y: number, r: number): void {
    const n = Math.max(10, Math.min(48, Math.round(r / 2.5)));
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      if (i === 0) this.sm(x + r, y);
      else this.sl(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  /** Width of text in px at a cap height. */
  measure(text: string, size: number, spacing = 0): number {
    const u = size / 6;
    return (measureUnits(text) + spacing * Math.max(0, [...text].length - 1)) * u;
  }

  /**
   * Vector text in screen px: `y` is the middle of the capitals, `size` their height. Adds the
   * strokes to the current path and strokes them in one go.
   */
  text(str: string, x: number, y: number, size: number, color: string, o: TextOpts = {}): number {
    const text = str.toUpperCase();
    const u = size / 6;
    const spacing = o.spacing ?? 0;
    const w = this.measure(text, size, spacing);
    let cx = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    const top = y - size / 2;
    const skew = o.skew ?? 0;
    const jit = (o.jitter ?? 0) * u;
    const reveal = o.reveal ?? Infinity;
    const g = this.g;
    g.beginPath();
    let i = 0;
    for (const ch of text) {
      const gl = glyph(ch);
      if (i >= reveal) break;
      const partial = reveal - i < 1;
      if (!partial || Math.random() < 0.6) {
        const jx = jit ? (Math.random() - 0.5) * jit : 0;
        const jy = jit ? (Math.random() - 0.5) * jit : 0;
        for (const st of gl.strokes) {
          for (let k = 0; k < st.length; k += 2) {
            const gx = st[k]!;
            const gy = st[k + 1]!;
            const px = cx + (gx + gl.dx) * u + (6 - gy) * skew * u + jx;
            const py = top + gy * u + jy;
            if (k === 0) this.sm(px, py);
            else this.sl(px, py);
          }
        }
      }
      cx += (gl.adv + spacing) * u;
      i++;
    }
    g.globalAlpha = o.alpha ?? 1;
    g.strokeStyle = color;
    g.lineWidth = o.width ?? Math.max(1.2, size * 0.1);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
    return w;
  }
}

/** Where the playfield and the score panels go on this screen. */
export interface Layout {
  w: number;
  h: number;
  /** Field top-left in px and world → px scale. */
  fx: number;
  fy: number;
  s: number;
  fw: number;
  fh: number;
  /** 'side': panels left and right of the field; 'strip': a band above or below it; 'inside': over the field's top. */
  hud: 'side' | 'strip' | 'inside';
  strip: { x: number; y: number; w: number; h: number } | null;
  touch: boolean;
}

/** Room the shell's touch controls take in the bottom corners (stick left, buttons right). */
const CTRL_W = 236;
const CTRL_H = 200;

/** Height of the score band when there is no room for side panels. */
const STRIP = 58;

export function computeLayout(w: number, h: number, touch: boolean): Layout {
  const margin = Math.max(6, h * 0.03);
  let s: number;
  let fx: number;
  let fy: number;
  let strip: Layout['strip'] = null;
  if (!touch) {
    s = Math.min((h - margin * 2) / FH, (w - 12) / FW);
    fx = (w - FW * s) / 2;
    fy = (h - FH * s) / 2;
    if (fx < 150) {
      // too narrow for panels beside the field: a score band above it (left of the pause button)
      s = Math.min((h - margin * 2 - STRIP) / FH, (w - 12) / FW);
      fx = (w - FW * s) / 2;
      fy = margin + STRIP + Math.max(0, (h - margin * 2 - STRIP - FH * s) / 2);
      strip = { x: 8, y: fy - STRIP, w: w - 16 - 56, h: STRIP - 6 };
    }
  } else {
    // controls beside the field, or under it (portrait) with the score band between: the bigger field wins
    const sA = Math.min((h - margin * 2) / FH, (w - CTRL_W * 2) / FW);
    const sB = Math.min((h - CTRL_H - STRIP - margin) / FH, (w - 8) / FW);
    if (sA >= sB) {
      s = sA;
      fx = (w - FW * s) / 2;
      fy = (h - FH * s) / 2;
    } else {
      s = sB;
      fx = (w - FW * s) / 2;
      // clear of the pause button when there is room to spare
      fy = Math.max(margin * 0.6, Math.min(54, (h - CTRL_H - STRIP - FH * s) * 0.5));
      const top = fy + FH * s + 4;
      strip = { x: 8, y: top, w: w - 16, h: Math.max(STRIP - 6, h - CTRL_H - top - 4) };
    }
  }
  s = Math.max(0.05, s);
  const fw = FW * s;
  const fh = FH * s;
  const hud: Layout['hud'] = fx >= 150 && !strip ? 'side' : strip ? 'strip' : 'inside';
  return { w, h, fx, fy, s, fw, fh, hud, strip, touch };
}

/** The canvases: the phosphor buffer you draw on, its bloom on top, and the glass (vignette, scanlines). */
export class Screen {
  readonly wrap: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly pen: Pen;
  private glow: HTMLCanvasElement;
  private gg: CanvasRenderingContext2D;
  private half = document.createElement('canvas');
  private hg: CanvasRenderingContext2D;
  private small = document.createElement('canvas');
  private sg: CanvasRenderingContext2D;
  private tiny = document.createElement('canvas');
  private tg: CanvasRenderingContext2D;
  private disposeCanvas: () => void;
  private sizeFn: () => { w: number; h: number };
  private bw = 0;
  private bh = 0;
  w = 0;
  h = 0;

  constructor(
    root: HTMLElement,
    private dpr: number,
    private quality: 'high' | 'low',
  ) {
    this.wrap = document.createElement('div');
    Object.assign(this.wrap.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      background: '#000',
      borderRadius: 'min(26px, 3.2vmin)',
      touchAction: 'none',
    });
    root.append(this.wrap);
    const fc = fullCanvas(this.wrap, dpr);
    this.canvas = fc.canvas;
    this.g = fc.g;
    this.sizeFn = fc.size;
    this.disposeCanvas = fc.dispose;
    this.pen = new Pen(this.g);

    this.glow = document.createElement('canvas');
    const plus = typeof CSS !== 'undefined' && CSS.supports?.('mix-blend-mode', 'plus-lighter');
    Object.assign(this.glow.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      mixBlendMode: plus ? 'plus-lighter' : 'screen',
      opacity: quality === 'low' ? '0.85' : '0.95',
    });
    this.wrap.append(this.glow);
    this.gg = this.glow.getContext('2d')!;
    this.hg = this.half.getContext('2d')!;
    this.sg = this.small.getContext('2d')!;
    this.tg = this.tiny.getContext('2d')!;

    const glass = document.createElement('div');
    const scan =
      quality === 'high'
        ? ', repeating-linear-gradient(to bottom, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, rgba(0,0,0,0.11) 1px, rgba(0,0,0,0.11) 3px)'
        : '';
    Object.assign(glass.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      borderRadius: 'inherit',
      background:
        'radial-gradient(ellipse 75% 32% at 50% 0%, rgba(150,220,255,0.05), rgba(150,220,255,0) 70%),' +
        'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.38) 88%, rgba(0,0,0,0.75) 100%)' +
        scan,
      boxShadow: 'inset 0 0 70px rgba(0,0,0,0.85), inset 0 0 3px rgba(120,230,255,0.35)',
    });
    this.wrap.append(glass);
  }

  /** Call first every frame: keeps the bloom canvases the size of the screen. Returns true after a resize. */
  frame(): boolean {
    const { w, h } = this.sizeFn();
    const bw = this.canvas.width;
    const bh = this.canvas.height;
    const changed = w !== this.w || h !== this.h || bw !== this.bw || bh !== this.bh;
    if (changed) {
      this.w = w;
      this.h = h;
      this.bw = bw;
      this.bh = bh;
      const set = (c: HTMLCanvasElement, div: number): void => {
        c.width = Math.max(1, Math.ceil(bw / div));
        c.height = Math.max(1, Math.ceil(bh / div));
      };
      set(this.half, 2);
      set(this.glow, 4);
      set(this.small, 8);
      set(this.tiny, 16);
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g.fillStyle = '#000';
      this.g.fillRect(0, 0, w, h);
    }
    return changed;
  }

  /** Let the last frame fade like phosphor (amount 0..1 of the way to black). */
  fade(amount: number): void {
    const g = this.g;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = `rgba(0,0,0,${amount.toFixed(3)})`;
    g.fillRect(0, 0, this.w, this.h);
  }

  /** Light the whole tube (a bomb's flash). */
  flash(color: string, alpha: number): void {
    const g = this.g;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, alpha);
    g.fillStyle = color;
    g.fillRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /** Build the bloom from this frame: halve it a few times and add the soft copies together. */
  bloom(): void {
    const copy = (ctx: CanvasRenderingContext2D, src: CanvasImageSource, c: HTMLCanvasElement): void => {
      ctx.globalCompositeOperation = 'copy';
      ctx.globalAlpha = 1;
      ctx.drawImage(src, 0, 0, c.width, c.height);
    };
    copy(this.hg, this.canvas, this.half);
    copy(this.gg, this.half, this.glow);
    copy(this.sg, this.glow, this.small);
    const gg = this.gg;
    gg.globalCompositeOperation = 'lighter';
    if (this.quality === 'high') {
      copy(this.tg, this.small, this.tiny);
      gg.globalAlpha = 0.9;
      gg.drawImage(this.tiny, 0, 0, this.glow.width, this.glow.height);
    }
    gg.globalAlpha = 1;
    gg.drawImage(this.small, 0, 0, this.glow.width, this.glow.height);
    gg.globalCompositeOperation = 'source-over';
  }

  dispose(): void {
    this.disposeCanvas();
    this.wrap.remove();
  }
}
