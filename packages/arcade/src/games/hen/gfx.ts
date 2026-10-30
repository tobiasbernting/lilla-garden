// The LCD of an old pocket console: 160 × 144 pixels in exactly four greens. Everything is drawn as
// shade numbers (0 = lightest … 3 = darkest) into a byte buffer, and turned into the greens once a frame.

export const W = 160;
export const H = 144;
export const GREENS = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'] as const;
const RGB = GREENS.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const);

/** A see-through pixel in a sprite. */
export const CLEAR = 255;

export interface Sprite {
  w: number;
  h: number;
  d: Uint8Array;
}

/** A sprite from rows of '0'–'3' (the shades); any other character is see-through. */
export function spr(rows: readonly string[]): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const d = new Uint8Array(w * h).fill(CLEAR);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = r.charCodeAt(x) - 48;
      if (c >= 0 && c <= 3) d[y * w + x] = c;
    }
  });
  return { w, h, d };
}

/** An empty (see-through) sprite. */
export function blank(w: number, h: number): Sprite {
  return { w, h, d: new Uint8Array(w * h).fill(CLEAR) };
}

/** Paint `top` onto a copy of `base` at (x, y). */
export function over(base: Sprite, top: Sprite, x = 0, y = 0): Sprite {
  const out: Sprite = { w: base.w, h: base.h, d: base.d.slice() };
  for (let j = 0; j < top.h; j++)
    for (let i = 0; i < top.w; i++) {
      const c = top.d[j * top.w + i]!;
      const xx = x + i;
      const yy = y + j;
      if (c !== CLEAR && xx >= 0 && yy >= 0 && xx < out.w && yy < out.h) out.d[yy * out.w + xx] = c;
    }
  return out;
}

/** The sprite with its shades swapped through `map` (shade → shade). */
export function recolor(s: Sprite, map: readonly number[]): Sprite {
  return { w: s.w, h: s.h, d: s.d.map((c) => (c === CLEAR ? CLEAR : map[c]!)) };
}

/** Shade maps for drawing a sprite another way. */
export const MAP_DIM = [1, 2, 3, 3];

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export class Screen {
  readonly b = new Uint8Array(W * H);

  clear(c: number): void {
    this.b.fill(c);
  }

  px(x: number, y: number, c: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.b[y * W + x] = c;
  }

  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    return this.b[y * W + x]!;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = clamp(Math.floor(x), 0, W);
    const y0 = clamp(Math.floor(y), 0, H);
    const x1 = clamp(Math.floor(x) + Math.floor(w), 0, W);
    const y1 = clamp(Math.floor(y) + Math.floor(h), 0, H);
    if (x1 <= x0) return;
    for (let yy = y0; yy < y1; yy++) this.b.fill(c, yy * W + x0, yy * W + x1);
  }

  /** Every other pixel, a checkerboard: the LCD's only way to mix two shades. */
  checker(x: number, y: number, w: number, h: number, c: number, odd = 0): void {
    const x0 = clamp(Math.floor(x), 0, W);
    const y0 = clamp(Math.floor(y), 0, H);
    const x1 = clamp(Math.floor(x) + Math.floor(w), 0, W);
    const y1 = clamp(Math.floor(y) + Math.floor(h), 0, H);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (((xx + yy + odd) & 1) === 0) this.b[yy * W + xx] = c;
  }

  /** A frame one pixel wide. */
  box(x: number, y: number, w: number, h: number, c: number): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: number): void {
    const rr = r * r + r * 0.8;
    for (let y = Math.floor(-r); y <= Math.ceil(r); y++)
      for (let x = Math.floor(-r); x <= Math.ceil(r); x++) if (x * x + y * y <= rr) this.px(cx + x, cy + y, c);
  }

  ring(cx: number, cy: number, r: number, c: number): void {
    const out = r * r + r * 0.8;
    const inn = (r - 1) * (r - 1) + (r - 1) * 0.8;
    for (let y = Math.floor(-r); y <= Math.ceil(r); y++)
      for (let x = Math.floor(-r); x <= Math.ceil(r); x++) {
        const d = x * x + y * y;
        if (d <= out && d > inn) this.px(cx + x, cy + y, c);
      }
  }

  blit(s: Sprite, x: number, y: number, flip = false, map?: readonly number[] | null): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= W || y >= H || x + s.w <= 0 || y + s.h <= 0) return;
    for (let j = 0; j < s.h; j++) {
      const yy = y + j;
      if (yy < 0 || yy >= H) continue;
      const row = j * s.w;
      for (let i = 0; i < s.w; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= W) continue;
        const c = s.d[row + (flip ? s.w - 1 - i : i)]!;
        if (c === CLEAR) continue;
        this.b[yy * W + xx] = map ? map[c]! : c;
      }
    }
  }

  /** Stretched about its bottom centre (squash and stretch), nearest pixel. */
  blitScaled(s: Sprite, cx: number, by: number, sx: number, sy: number, flip = false, map?: readonly number[] | null): void {
    if (Math.abs(sx - 1) < 0.04 && Math.abs(sy - 1) < 0.04) {
      this.blit(s, Math.round(cx - s.w / 2), Math.round(by - s.h), flip, map);
      return;
    }
    const w = Math.max(1, Math.round(s.w * sx));
    const h = Math.max(1, Math.round(s.h * sy));
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(by - h);
    for (let j = 0; j < h; j++) {
      const yy = y0 + j;
      if (yy < 0 || yy >= H) continue;
      const sj = Math.min(s.h - 1, Math.floor(((j + 0.5) * s.h) / h));
      for (let i = 0; i < w; i++) {
        const xx = x0 + i;
        if (xx < 0 || xx >= W) continue;
        let si = Math.min(s.w - 1, Math.floor(((i + 0.5) * s.w) / w));
        if (flip) si = s.w - 1 - si;
        const c = s.d[sj * s.w + si]!;
        if (c === CLEAR) continue;
        this.b[yy * W + xx] = map ? map[c]! : c;
      }
    }
  }

  /** Send every pixel in a rectangle through a shade map (dim a card's background, light up a lantern). */
  remap(x: number, y: number, w: number, h: number, map: readonly number[]): void {
    const x0 = clamp(Math.floor(x), 0, W);
    const y0 = clamp(Math.floor(y), 0, H);
    const x1 = clamp(Math.floor(x) + Math.floor(w), 0, W);
    const y1 = clamp(Math.floor(y) + Math.floor(h), 0, H);
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) {
        const k = yy * W + xx;
        this.b[k] = map[this.b[k]!]!;
      }
  }
}

/**
 * Shows a Screen on the canvas. `fade` −3…3 slides every shade toward the lightest (−) or the darkest
 * (+), the way old consoles faded. With `ghost` the pixels take a moment to change, like a real LCD.
 */
export class Lcd {
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private prev: Float32Array | null;
  private fresh = true;

  constructor(g: CanvasRenderingContext2D, ghost: boolean) {
    this.g = g;
    this.img = g.createImageData(W, H);
    this.prev = ghost ? new Float32Array(W * H * 3) : null;
  }

  show(s: Screen, fade = 0): void {
    const d = this.img.data;
    const f = Math.round(clamp(fade, -3, 3));
    const lut = [0, 1, 2, 3].map((i) => RGB[clamp(i + f, 0, 3)]!);
    const p = this.prev;
    const keep = this.fresh ? 0 : 0.33;
    this.fresh = false;
    for (let i = 0, j = 0, k = 0; i < W * H; i++, j += 4, k += 3) {
      const c = lut[s.b[i]! & 3]!;
      if (p) {
        const r = (p[k] = c[0] + (p[k]! - c[0]) * keep);
        const gg = (p[k + 1] = c[1] + (p[k + 1]! - c[1]) * keep);
        const b = (p[k + 2] = c[2] + (p[k + 2]! - c[2]) * keep);
        d[j] = r;
        d[j + 1] = gg;
        d[j + 2] = b;
      } else {
        d[j] = c[0];
        d[j + 1] = c[1];
        d[j + 2] = c[2];
      }
      d[j + 3] = 255;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}
