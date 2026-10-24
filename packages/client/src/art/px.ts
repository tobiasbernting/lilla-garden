// Tiny pixel-art canvas helper. Everything in the game is drawn with this at boot.

export class Px {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  px(x: number, y: number, c: string): this {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    return this;
  }

  /** Makes a box transparent again. */
  clear(x: number, y: number, w: number, h: number): this {
    this.ctx.clearRect(x, y, w, h);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string): this {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }

  /** Hollow rectangle. */
  box(x: number, y: number, w: number, h: number, c: string): this {
    this.rect(x, y, w, 1, c).rect(x, y + h - 1, w, 1, c).rect(x, y, 1, h, c).rect(x + w - 1, y, 1, h, c);
    return this;
  }

  /** Filled ellipse in a bounding box. */
  ellipse(x: number, y: number, w: number, h: number, c: string): this {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let py = Math.floor(y); py < y + h; py++)
      for (let px = Math.floor(x); px < x + w; px++) {
        const dx = (px + 0.5 - cx) / rx;
        const dy = (py + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(px, py, c);
      }
    return this;
  }

  circle(cx: number, cy: number, r: number, c: string): this {
    return this.ellipse(cx - r, cy - r, r * 2, r * 2, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
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
    return this;
  }

  /** Draws an ASCII template; `.` and space are transparent. */
  tpl(x: number, y: number, rows: string[], pal: Record<string, string>): this {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx]!;
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c) this.px(x + rx, y + ry, c);
      }
    });
    return this;
  }

  /** Copies another Px (or canvas) into this one. */
  blit(src: Px | HTMLCanvasElement, x: number, y: number, flipX = false): this {
    const img = src instanceof Px ? src.canvas : src;
    if (flipX) {
      this.ctx.save();
      this.ctx.translate(Math.round(x) + img.width, Math.round(y));
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(img, 0, 0);
      this.ctx.restore();
    } else this.ctx.drawImage(img, Math.round(x), Math.round(y));
    return this;
  }

  /** Draws `src` scaled (nearest neighbour) into a box. */
  blitScaled(src: Px | HTMLCanvasElement, x: number, y: number, w: number, h: number): this {
    const img = src instanceof Px ? src.canvas : src;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }

  /** 1px dark outline around all opaque pixels (drawn into transparent neighbours). */
  outline(c = '#1b1a17'): this {
    const { w, h } = this;
    const d = this.ctx.getImageData(0, 0, w, h);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d.data[(y * w + x) * 4 + 3]!);
    const out: [number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (a(x, y) > 0) continue;
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) out.push([x, y]);
      }
    for (const [x, y] of out) this.px(x, y, c);
    return this;
  }

  /** Multiplies the whole canvas with a colour (for darker variants). */
  tint(c: string): this {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'multiply';
    this.ctx.fillStyle = c;
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.ctx.globalCompositeOperation = 'destination-in';
    this.ctx.drawImage(this.canvas, 0, 0);
    this.ctx.restore();
    return this;
  }

  dataUrl(): string {
    return this.canvas.toDataURL();
  }
}

// ---- colour helpers ----

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Darken (f < 1) or lighten (f > 1) a hex colour. */
export const shade = (hex: string, f: number): string => {
  const [r, g, b] = hexToRgb(hex);
  if (f <= 1) return rgbToHex(r * f, g * f, b * f);
  return rgbToHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1));
};

/** Deterministic small hash for picking variants. */
export const hash2 = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) % 1000;
};
