// Packs the 2D game's art (drawn into many small canvases at boot) into a few big textures. LittleJS starts a new
// WebGL batch whenever the texture changes, so with one sheet the whole depth-sorted world draws in one batch.
import { TextureInfo, glMaxTextureSize } from 'littlejsengine';

/** Gap around each picture of its own (two between neighbours), so a turned or scaled sprite never samples its
 * neighbour, not even a ground tile's edge pixels smeared into that tile's own gap. */
const PAD = 2;

export class Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  tex: TextureInfo | null = null;
  dirty = false;
  private x = PAD;
  private y = PAD;
  private rowH = 0;

  constructor(readonly size: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Top-left of a free w×h spot (shelf packing), or null when the sheet is full. */
  place(w: number, h: number): [number, number] | null {
    if (w + 2 * PAD > this.size) return null;
    if (this.x + w + PAD > this.size) {
      this.x = PAD;
      this.y += this.rowH + 2 * PAD;
      this.rowH = 0;
    }
    if (this.y + h + PAD > this.size) return null;
    const at: [number, number] = [this.x, this.y];
    this.x += w + 2 * PAD;
    this.rowH = Math.max(this.rowH, h);
    return at;
  }
}

export interface Sprite {
  /** The sheet (or a texture of its own) the picture is on. */
  sheet: { tex: TextureInfo | null };
  /** Texture coordinates of the picture's corners. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Size in world pixels (16 per tile), whatever resolution the art was drawn at. */
  w: number;
  h: number;
}

export interface Picture {
  src: CanvasImageSource;
  /** Region of src in texture pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Copy the edge pixels into the padding (ground tiles), so smooth filtering never shows a seam. */
  extrude?: boolean;
}

export class Atlas {
  private sheets: Sheet[] = [];
  /** Decided on the first pack, once WebGL can say how big a texture may be. */
  private size = 0;

  /** Packs one picture. */
  add(p: Picture): Sprite {
    return this.addMany([p])[0]!;
  }

  /** Packs pictures tallest first (much tighter shelves), returning sprites in the order given. */
  addMany(pics: Picture[]): Sprite[] {
    const order = pics.map((_, i) => i).sort((a, b) => pics[b]!.sh - pics[a]!.sh);
    const out: Sprite[] = new Array(pics.length);
    for (const i of order) out[i] = this.pack(pics[i]!);
    return out;
  }

  /** Packs a strip of equal frames as one block (they stay side by side) and returns a sprite per frame. */
  addFrames(src: HTMLCanvasElement, frameW: number, frameH: number, count: number): Sprite[] {
    const whole = this.pack({ src, sx: 0, sy: 0, sw: frameW * count, sh: frameH });
    const du = (whole.u1 - whole.u0) / count;
    return Array.from({ length: count }, (_, i) => ({ ...whole, u0: whole.u0 + du * i, u1: whole.u0 + du * (i + 1), w: frameW, h: frameH }));
  }

  /** Uploads the sheets that changed since the last call. */
  flush(): void {
    for (const s of this.sheets) {
      if (!s.dirty) continue;
      s.dirty = false;
      if (s.tex) s.tex.createWebGLTexture();
      else s.tex = new TextureInfo(s.canvas, true, false, true);
    }
  }

  private pack(p: Picture): Sprite {
    this.size ||= Math.min(glMaxTextureSize || 2048, 2048);
    let at: [number, number] | null = null;
    let sheet = this.sheets[this.sheets.length - 1];
    if (sheet) at = sheet.place(p.sw, p.sh);
    if (!at) {
      sheet = new Sheet(this.size);
      this.sheets.push(sheet);
      at = sheet.place(p.sw, p.sh);
      if (!at) throw new Error(`picture ${p.sw}×${p.sh} does not fit a ${this.size} sheet`);
    }
    const [x, y] = at;
    const ctx = sheet!.ctx;
    if (p.extrude) {
      // smear the picture into its padding first, then draw it on top
      for (const [ox, oy] of [[-PAD, 0], [PAD, 0], [0, -PAD], [0, PAD], [-PAD, -PAD], [PAD, -PAD], [-PAD, PAD], [PAD, PAD]] as const)
        ctx.drawImage(p.src, p.sx, p.sy, p.sw, p.sh, x + ox, y + oy, p.sw, p.sh);
    }
    ctx.clearRect(x, y, p.sw, p.sh);
    ctx.drawImage(p.src, p.sx, p.sy, p.sw, p.sh, x, y, p.sw, p.sh);
    sheet!.dirty = true;
    const inv = 1 / sheet!.size;
    return { sheet: sheet!, u0: x * inv, v0: y * inv, u1: (x + p.sw) * inv, v1: (y + p.sh) * inv, w: p.sw, h: p.sh };
  }
}

export const atlas = new Atlas();

/** The whole canvas as a picture. */
export const whole = (c: HTMLCanvasElement): Picture => ({ src: c, sx: 0, sy: 0, sw: c.width, sh: c.height });

/** A picture on a texture of its own, for things redrawn now and then (roofs); free it with `release`. */
export const standalone = (c: HTMLCanvasElement): Sprite => ({
  sheet: { tex: new TextureInfo(c, true, false, true) },
  u0: 0,
  v0: 0,
  u1: 1,
  v1: 1,
  w: c.width,
  h: c.height,
});

export const release = (s: Sprite): void => {
  s.sheet.tex?.destroyWebGLTexture();
  s.sheet.tex = null;
};
