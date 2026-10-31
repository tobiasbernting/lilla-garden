// The car's paint job as one canvas per car: the body panels (bonnet, roof, doors, back…) are UV-mapped
// onto regions of a square atlas, and this file paints the atlas: the base colour, the livery pattern in
// the second colour, the stickers in their slots, and a damage layer (dirt and scratches) on top.
// Every region is drawn in metres (the geometry tells us how big each panel really is), so dots stay
// round and stickers keep their shape whatever the panel's size on the canvas.
import type { CarDecal, CarLivery, CarStyle, DecalSlot } from '@lilla-garden/shared';
import { rng } from './util.ts';

/**
 * The body's paintable panels. `doorP` is the +x side (the driver's, the car's left), `doorN` the −x side;
 * `plain` is paint without pattern, `dark` the underside and the floor of open cockpits.
 */
export type Region = 'doorP' | 'doorN' | 'hood' | 'roof' | 'deck' | 'back' | 'front' | 'plain' | 'dark';

/**
 * How a region's canvas rectangle is oriented on the car:
 * - sideP / sideN: canvas x runs along the car (the front at the left on the +x side, at the right on the
 *   −x side), canvas y downward;
 * - top: seen from above with the front up (canvas y runs front to back);
 * - end: the front or back face seen from outside, upright.
 * In every case the canvas reads unmirrored from outside the car, so stickers and text can be drawn upright.
 */
export type RegionKind = 'sideP' | 'sideN' | 'top' | 'end' | 'flat';

/** Atlas rectangles as fractions of the canvas: x, y, w, h. */
export const ATLAS: Record<Region, readonly [number, number, number, number]> = {
  doorP: [0, 0, 1, 0.22],
  doorN: [0, 0.22, 1, 0.22],
  hood: [0, 0.44, 0.5, 0.3],
  roof: [0.5, 0.44, 0.5, 0.3],
  deck: [0, 0.74, 0.34, 0.26],
  back: [0.34, 0.74, 0.36, 0.26],
  front: [0.7, 0.74, 0.3, 0.18],
  plain: [0.7, 0.92, 0.15, 0.08],
  dark: [0.85, 0.92, 0.15, 0.08],
};

export const REGION_KIND: Record<Region, RegionKind> = {
  doorP: 'sideP',
  doorN: 'sideN',
  hood: 'top',
  roof: 'top',
  deck: 'top',
  back: 'end',
  front: 'end',
  plain: 'flat',
  dark: 'flat',
};

/** Real size (metres) of what each region covers, along canvas x and canvas y. */
export type RegionSizes = Partial<Record<Region, { w: number; h: number }>>;

/** Where a sticker sits: centre as fractions of its region, size in metres. */
export interface DecalSpot {
  region: Region;
  u: number;
  v: number;
  size: number;
}

/** What the painter needs to know about a body (the geometry fills this in). */
export interface PaintLayout {
  sizes: RegionSizes;
  /** Sticker spots per slot; `doors` is the right side (the left one is mirrored). */
  spots: Record<DecalSlot, DecalSpot>;
  /** Where the number roundel goes on the doors when no `number` sticker is placed (right side). */
  numberSpot: DecalSpot;
  /** Fraction of the side's height below which the dirt gathers (the sills). */
  dirtLine: number;
  seed: number;
}

export const DARK_TRIM = '#1c1d22';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Small shape helpers (unit sized, drawn round 0, 0)
// ---------------------------------------------------------------------------

function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = 0.45): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function heartPath(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.3, y + r * 0.1, x - r * 0.9, y - r * 1.0, x, y - r * 0.4);
  g.bezierCurveTo(x + r * 0.9, y - r * 1.0, x + r * 1.3, y + r * 0.1, x, y + r * 0.9);
  g.closePath();
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
}

function boltPath(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(0.12, -0.5);
  g.lineTo(-0.26, 0.06);
  g.lineTo(-0.02, 0.06);
  g.lineTo(-0.14, 0.5);
  g.lineTo(0.28, -0.1);
  g.lineTo(0.03, -0.1);
  g.closePath();
}

function flamePath(g: CanvasRenderingContext2D, s: number): void {
  g.beginPath();
  g.moveTo(0, 0.48 * s);
  g.bezierCurveTo(-0.42 * s, 0.4 * s, -0.4 * s, 0.0, -0.18 * s, -0.22 * s);
  g.bezierCurveTo(-0.14 * s, -0.05 * s, -0.06 * s, -0.02 * s, -0.04 * s, -0.08 * s);
  g.bezierCurveTo(-0.1 * s, -0.3 * s, 0.0, -0.42 * s, 0.06 * s, -0.5 * s);
  g.bezierCurveTo(0.12 * s, -0.3 * s, 0.42 * s, -0.12 * s, 0.36 * s, 0.18 * s);
  g.bezierCurveTo(0.32 * s, 0.38 * s, 0.18 * s, 0.48 * s, 0, 0.48 * s);
  g.closePath();
}

// ---------------------------------------------------------------------------
// Stickers: drawn once into a little canvas with a white die-cut border, then stamped on the body
// ---------------------------------------------------------------------------

const STICKER_PX = 160;
const stickerCache = new Map<string, HTMLCanvasElement>();

/** Draws a sticker's artwork in a unit square centred on 0, 0 (−0.5..0.5). */
function drawDecal(g: CanvasRenderingContext2D, d: CarDecal, num: number): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (d) {
    case 'number': {
      circle(g, 0, 0, 0.48, '#15171c');
      circle(g, 0, 0, 0.42, '#ffffff');
      g.fillStyle = '#15171c';
      const s = String(Math.max(1, Math.min(99, Math.round(num))));
      g.font = `bold ${s.length > 1 ? 0.5 : 0.6}px system-ui, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s, 0, 0.04);
      break;
    }
    case 'star':
      g.fillStyle = '#ffcf1f';
      starPath(g, 0, 0.03, 0.5);
      g.fill();
      g.fillStyle = '#ffe680';
      starPath(g, -0.04, -0.02, 0.24);
      g.fill();
      break;
    case 'heart':
      g.fillStyle = '#e8283c';
      heartPath(g, 0, 0.02, 0.5);
      g.fill();
      ellipse(g, -0.18, -0.14, 0.08, 0.05, 'rgba(255,255,255,0.6)', -0.6);
      break;
    case 'flame':
      g.fillStyle = '#f2541b';
      flamePath(g, 1);
      g.fill();
      g.save();
      g.translate(0, 0.1);
      g.fillStyle = '#ffc21f';
      flamePath(g, 0.6);
      g.fill();
      g.restore();
      break;
    case 'lightning':
      g.fillStyle = '#ffd400';
      g.save();
      g.scale(1.6, 1);
      boltPath(g);
      g.fill();
      g.restore();
      g.strokeStyle = '#d18f00';
      g.lineWidth = 0.03;
      g.save();
      g.scale(1.6, 1);
      boltPath(g);
      g.restore();
      g.stroke();
      break;
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 5;
        ellipse(g, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.2, 0.15, '#ff7fbf', a);
      }
      circle(g, 0, 0, 0.16, '#ffd21f');
      circle(g, -0.04, -0.04, 0.05, '#ffe98a');
      break;
    }
    case 'rainbow': {
      const cols = ['#e8412c', '#ff8a1f', '#f4d20d', '#3fbf4f', '#2f8fe0', '#8a4fd8'];
      g.lineWidth = 0.065;
      for (let i = 0; i < cols.length; i++) {
        g.strokeStyle = cols[i]!;
        g.beginPath();
        g.arc(0, 0.22, 0.46 - i * 0.065, Math.PI, TAU);
        g.stroke();
      }
      ellipse(g, -0.38, 0.26, 0.14, 0.09, '#ffffff');
      ellipse(g, 0.38, 0.26, 0.14, 0.09, '#ffffff');
      break;
    }
    case 'paw':
      g.fillStyle = '#5a3a2a';
      g.beginPath();
      g.ellipse(0, 0.16, 0.24, 0.2, 0, 0, TAU);
      g.fill();
      for (const [x, y] of [
        [-0.3, -0.08],
        [-0.12, -0.28],
        [0.12, -0.28],
        [0.3, -0.08],
      ] as const)
        ellipse(g, x, y, 0.1, 0.13, '#5a3a2a');
      break;
    case 'cow': {
      for (const sx of [-1, 1]) {
        ellipse(g, sx * 0.4, -0.18, 0.13, 0.07, '#f0d7d0', sx * 0.4);
        g.fillStyle = '#e8dfc4';
        g.beginPath();
        g.moveTo(sx * 0.2, -0.3);
        g.lineTo(sx * 0.3, -0.5);
        g.lineTo(sx * 0.12, -0.34);
        g.fill();
      }
      ellipse(g, 0, -0.02, 0.32, 0.38, '#ffffff');
      ellipse(g, 0.14, -0.2, 0.13, 0.11, '#26221f', 0.4);
      ellipse(g, -0.22, 0.02, 0.08, 0.12, '#26221f');
      ellipse(g, 0, 0.24, 0.28, 0.17, '#f2a7b0');
      ellipse(g, -0.1, 0.24, 0.04, 0.05, '#8a4a52');
      ellipse(g, 0.1, 0.24, 0.04, 0.05, '#8a4a52');
      circle(g, -0.12, -0.06, 0.05, '#1a1a1a');
      circle(g, 0.12, -0.06, 0.05, '#1a1a1a');
      circle(g, -0.105, -0.075, 0.017, '#ffffff');
      circle(g, 0.135, -0.075, 0.017, '#ffffff');
      break;
    }
    case 'hen': {
      for (let i = -1; i <= 1; i++) circle(g, i * 0.11, -0.36 + Math.abs(i) * 0.05, 0.09, '#e3261c');
      circle(g, 0, 0, 0.36, '#fbf6ea');
      g.fillStyle = '#f5a623';
      g.beginPath();
      g.moveTo(-0.11, 0.02);
      g.lineTo(0.11, 0.02);
      g.lineTo(0, 0.2);
      g.closePath();
      g.fill();
      ellipse(g, 0, 0.27, 0.06, 0.09, '#e3261c');
      circle(g, -0.15, -0.08, 0.05, '#1a1a1a');
      circle(g, 0.15, -0.08, 0.05, '#1a1a1a');
      ellipse(g, -0.24, 0.08, 0.06, 0.035, '#ffb3b3');
      ellipse(g, 0.24, 0.08, 0.06, 0.035, '#ffb3b3');
      break;
    }
    case 'pig': {
      for (const sx of [-1, 1]) {
        g.fillStyle = '#e98a9a';
        g.beginPath();
        g.moveTo(sx * 0.14, -0.3);
        g.lineTo(sx * 0.4, -0.44);
        g.lineTo(sx * 0.36, -0.14);
        g.closePath();
        g.fill();
      }
      circle(g, 0, 0.02, 0.38, '#f6aab6');
      ellipse(g, 0, 0.12, 0.16, 0.11, '#e98a9a');
      ellipse(g, -0.06, 0.12, 0.03, 0.05, '#9b4a58');
      ellipse(g, 0.06, 0.12, 0.03, 0.05, '#9b4a58');
      circle(g, -0.15, -0.1, 0.045, '#1a1a1a');
      circle(g, 0.15, -0.1, 0.045, '#1a1a1a');
      break;
    }
    case 'sheep': {
      for (let i = 0; i < 10; i++) {
        const a = (i * TAU) / 10;
        circle(g, Math.cos(a) * 0.32, Math.sin(a) * 0.3 - 0.04, 0.14, '#f4f1e8');
      }
      circle(g, 0, -0.04, 0.3, '#f4f1e8');
      for (const sx of [-1, 1]) ellipse(g, sx * 0.24, 0.02, 0.1, 0.05, '#3a332d', sx * 0.4);
      ellipse(g, 0, 0.08, 0.17, 0.22, '#3a332d');
      circle(g, -0.07, 0.02, 0.035, '#ffffff');
      circle(g, 0.07, 0.02, 0.035, '#ffffff');
      for (let i = -1; i <= 1; i++) circle(g, i * 0.1, -0.2, 0.09, '#ffffff');
      break;
    }
    case 'crown':
      g.fillStyle = '#f5c518';
      g.beginPath();
      g.moveTo(-0.44, 0.3);
      g.lineTo(-0.48, -0.26);
      g.lineTo(-0.22, 0.0);
      g.lineTo(0, -0.4);
      g.lineTo(0.22, 0.0);
      g.lineTo(0.48, -0.26);
      g.lineTo(0.44, 0.3);
      g.closePath();
      g.fill();
      g.fillStyle = '#d99a00';
      g.fillRect(-0.44, 0.2, 0.88, 0.1);
      circle(g, 0, 0.06, 0.07, '#e8283c');
      circle(g, -0.25, 0.1, 0.05, '#2f6fe0');
      circle(g, 0.25, 0.1, 0.05, '#2fa84f');
      for (const x of [-0.48, 0, 0.48]) circle(g, x, x === 0 ? -0.42 : -0.28, 0.05, '#fff1a0');
      break;
    case 'smiley':
      circle(g, 0, 0, 0.48, '#ffd21f');
      ellipse(g, -0.15, -0.12, 0.06, 0.1, '#2a2116');
      ellipse(g, 0.15, -0.12, 0.06, 0.1, '#2a2116');
      g.strokeStyle = '#2a2116';
      g.lineWidth = 0.07;
      g.beginPath();
      g.arc(0, 0.02, 0.28, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
      break;
    case 'flag':
      // the Swedish flag, 16:10, the cross nearer the hoist
      g.fillStyle = '#006aa7';
      g.fillRect(-0.5, -0.31, 1, 0.62);
      g.fillStyle = '#fecc00';
      g.fillRect(-0.5, -0.06, 1, 0.12);
      g.fillRect(-0.19, -0.31, 0.12, 0.62);
      break;
    case 'strawberry': {
      g.fillStyle = '#e3263a';
      g.beginPath();
      g.moveTo(0, 0.48);
      g.bezierCurveTo(-0.5, 0.18, -0.44, -0.3, 0, -0.26);
      g.bezierCurveTo(0.44, -0.3, 0.5, 0.18, 0, 0.48);
      g.fill();
      const r = rng(7);
      for (let i = 0; i < 12; i++) {
        const x = (r() - 0.5) * 0.5;
        const y = -0.1 + r() * 0.42;
        if (Math.abs(x) < 0.3 - (y + 0.1) * 0.35) ellipse(g, x, y, 0.018, 0.03, '#ffe27a');
      }
      g.fillStyle = '#3aa845';
      starPath(g, 0, -0.28, 0.22, 5, 0.4);
      g.fill();
      g.fillRect(-0.025, -0.48, 0.05, 0.14);
      break;
    }
  }
}

/** A sticker with a white border, cached (only the number changes per car). */
function sticker(d: CarDecal, num: number): HTMLCanvasElement {
  const key = d === 'number' ? `number:${num}` : d;
  const hit = stickerCache.get(key);
  if (hit) return hit;
  const S = STICKER_PX;
  const art = document.createElement('canvas');
  art.width = S;
  art.height = S;
  const a = art.getContext('2d')!;
  a.setTransform(S * 0.84, 0, 0, S * 0.84, S / 2, S / 2);
  drawDecal(a, d, num);
  const out = document.createElement('canvas');
  out.width = S;
  out.height = S;
  const o = out.getContext('2d')!;
  // the die-cut border: the artwork stamped round in a ring, then filled white
  const rad = S * 0.035;
  for (let i = 0; i < 12; i++) o.drawImage(art, Math.cos((i * TAU) / 12) * rad, Math.sin((i * TAU) / 12) * rad);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = '#ffffff';
  o.fillRect(0, 0, S, S);
  o.globalCompositeOperation = 'source-over';
  o.drawImage(art, 0, 0);
  if (stickerCache.size > 64) stickerCache.clear();
  stickerCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Liveries: drawn per region in a frame where `a` runs from the front to the back (metres) and `b`
// across the panel (top to bottom on the sides, side to side on top)
// ---------------------------------------------------------------------------

interface Frame {
  region: Region;
  kind: RegionKind;
  /** Length (along a) and width (along b) in metres. */
  len: number;
  wid: number;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function luma(hex: string): number {
  const p = parseInt(hex.slice(1), 16);
  return (((p >> 16) & 255) * 0.299 + ((p >> 8) & 255) * 0.587 + (p & 255) * 0.114) / 255;
}

const RAINBOW = ['#e8412c', '#ff8a1f', '#f4d20d', '#3fbf4f', '#2f8fe0', '#8a4fd8'];

function drawLivery(g: CanvasRenderingContext2D, f: Frame, livery: CarLivery, style: CarStyle, seed: number): void {
  const c2 = style.paint2;
  const { len, wid, kind } = f;
  const side = kind === 'sideP' || kind === 'sideN';
  const top = kind === 'top';
  const end = kind === 'end';
  const roof = f.region === 'roof';
  const r = rng(seed * 31 + f.region.length * 977 + f.region.charCodeAt(0));
  g.fillStyle = c2;
  g.strokeStyle = c2;
  g.lineJoin = 'round';
  switch (livery) {
    case 'none':
      return;
    case 'stripe':
      // the classic rally stripe over the top and down the ends
      if (top) g.fillRect(0, wid / 2 - 0.19, len, 0.38);
      else if (end) g.fillRect(len / 2 - 0.19, 0, 0.38, wid);
      else g.fillRect(0, wid * 0.62, len, 0.06);
      return;
    case 'stripes2':
      if (top || end) {
        const along = top;
        for (const o of [-0.22, 0.08]) {
          if (along) g.fillRect(0, wid / 2 + o, len, 0.14);
          else g.fillRect(len / 2 + o, 0, 0.14, wid);
        }
      } else {
        g.fillRect(0, wid * 0.36, len, 0.06);
        g.fillRect(0, wid * 0.36 + 0.1, len, 0.06);
      }
      return;
    case 'flames': {
      if (!(side || f.region === 'hood' || f.region === 'front')) return;
      const inner = luma(c2) > 0.6 ? mixHex(c2, '#ff6a00', 0.5) : mixHex(c2, '#ffd21f', 0.55);
      const tongues = (reach: number, h0: number, h1: number, col: string, shrink: number): void => {
        // a row of tongues licking backwards from a = 0 between b = h0 and h1
        const n = 5;
        const step = (h1 - h0) / n;
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(-0.05, h0);
        for (let i = 0; i < n; i++) {
          const b0 = h0 + i * step;
          const tip = reach * (0.55 + 0.45 * Math.sin(i * 2.3 + 1)) * shrink;
          g.quadraticCurveTo(tip * 0.55, b0 + step * 0.05, tip, b0 + step * 0.35);
          g.quadraticCurveTo(tip * 0.5, b0 + step * 0.65, tip * 0.25, b0 + step);
        }
        g.lineTo(-0.05, h1);
        g.closePath();
        g.fill();
      };
      if (f.region === 'front') {
        g.fillRect(0, wid * 0.55, len, wid * 0.45);
        return;
      }
      if (side) {
        tongues(len * 0.55, wid * 0.18, wid * 0.98, c2, 1);
        tongues(len * 0.55, wid * 0.32, wid * 0.9, inner, 0.6);
      } else {
        // on the bonnet the tongues run across the width from the front edge
        const n = 6;
        const step = wid / n;
        for (const [col, k] of [
          [c2, 1],
          [inner, 0.6],
        ] as const) {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(-0.05, 0);
          for (let i = 0; i < n; i++) {
            const b0 = i * step;
            const tip = len * (0.45 + 0.35 * Math.sin(i * 1.9 + 0.5)) * k;
            g.quadraticCurveTo(tip * 0.5, b0 + step * 0.1, tip, b0 + step * 0.5);
            g.quadraticCurveTo(tip * 0.5, b0 + step * 0.9, Math.min(tip, 0.05), b0 + step);
          }
          g.lineTo(-0.05, wid);
          g.closePath();
          g.fill();
        }
      }
      return;
    }
    case 'checker': {
      const s = 0.13;
      const band = (b0: number, rows: number): void => {
        for (let i = 0; i * s < len + s; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) g.fillRect(i * s, b0 + j * s, s, s);
      };
      if (side) band(wid * 0.45, 2);
      else if (roof) band(0, Math.ceil(wid / s));
      else if (top) band(wid / 2 - s, 2);
      else if (end) for (let i = 0; i * s < len + s; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(i * s, wid * 0.08 + j * s, s, s);
      return;
    }
    case 'dots': {
      const sp = 0.3;
      for (let i = 0; i * sp < len + sp; i++)
        for (let j = 0; j * sp < wid + sp; j++) {
          const a = i * sp + (j % 2 ? sp / 2 : 0);
          circle(g, a, j * sp + sp * 0.3, 0.075, c2);
        }
      return;
    }
    case 'zigzag': {
      g.lineWidth = 0.09;
      const zig = (b: number, amp: number, step: number): void => {
        g.beginPath();
        for (let a = -step, k = 0; a <= len + step; a += step, k++) g.lineTo(a, b + (k % 2 ? amp : -amp));
        g.stroke();
      };
      if (side) {
        zig(wid * 0.5, Math.min(0.12, wid * 0.18), 0.25);
      } else if (top) {
        zig(wid / 2 - 0.25, 0.08, 0.2);
        zig(wid / 2 + 0.25, 0.08, 0.2);
      } else if (end) {
        g.beginPath();
        for (let a = -0.2, k = 0; a <= len + 0.2; a += 0.2, k++) g.lineTo(a, wid * 0.4 + (k % 2 ? 0.08 : -0.08));
        g.stroke();
      }
      return;
    }
    case 'stars':
    case 'hearts': {
      const n = Math.max(2, Math.round((len * wid) / 0.16));
      for (let i = 0; i < n; i++) {
        const a = r() * len;
        const b = r() * wid;
        const s = 0.07 + r() * 0.07;
        if (livery === 'stars') starPath(g, a, b, s);
        else heartPath(g, a, b, s);
        g.fill();
      }
      return;
    }
    case 'camo': {
      const dark = mixHex(style.paint, '#000000', 0.45);
      const n = Math.max(3, Math.round((len * wid) / 0.09));
      for (let i = 0; i < n; i++) {
        const a = r() * len;
        const b = r() * wid;
        const col = i % 3 === 0 ? dark : c2;
        g.fillStyle = col;
        g.beginPath();
        const k = 5 + Math.floor(r() * 3);
        const rad = 0.12 + r() * 0.12;
        for (let j = 0; j < k; j++) {
          const t = (j * TAU) / k;
          const rr = rad * (0.6 + r() * 0.6);
          g.lineTo(a + Math.cos(t) * rr * 1.4, b + Math.sin(t) * rr);
        }
        g.closePath();
        g.fill();
      }
      return;
    }
    case 'lightning': {
      const bolt = (b: number, amp: number, w: number): void => {
        g.beginPath();
        const pts: [number, number][] = [];
        const n = 7;
        for (let i = 0; i <= n; i++) pts.push([(len * i) / n, b + (i % 2 ? amp : -amp) * (1 - i / (n + 2))]);
        for (const [a, bb] of pts) g.lineTo(a, bb - w * (1 - a / len / 1.4));
        for (const [a, bb] of pts.reverse()) g.lineTo(a, bb + w * (1 - a / len / 1.4));
        g.closePath();
        g.fill();
      };
      if (side) bolt(wid * 0.5, wid * 0.18, Math.min(0.07, wid * 0.1));
      else if (f.region === 'hood') bolt(wid / 2, 0.22, 0.08);
      else if (end) {
        g.save();
        g.translate(len / 2, wid / 2);
        g.scale(wid * 0.9, wid * 0.9);
        boltPath(g);
        g.fill();
        g.restore();
      }
      return;
    }
    case 'rainbow': {
      const bw = 0.055;
      for (let i = 0; i < RAINBOW.length; i++) {
        g.fillStyle = RAINBOW[i]!;
        if (side) g.fillRect(0, wid * 0.38 + i * bw, len, bw);
        else if (top) g.fillRect(0, wid / 2 - 3 * bw + i * bw, len, bw);
        else if (end) g.fillRect(len / 2 - 3 * bw + i * bw, 0, bw, wid);
      }
      return;
    }
  }
}

/** Sets the canvas transform to a region's livery frame (metres, `a` from the front). */
function liveryFrame(g: CanvasRenderingContext2D, S: number, region: Region, sz: { w: number; h: number }): Frame {
  const [fx, fy, fw, fh] = ATLAS[region];
  const x0 = fx * S;
  const y0 = fy * S;
  const pw = fw * S;
  const ph = fh * S;
  const kind = REGION_KIND[region];
  const kx = pw / sz.w;
  const ky = ph / sz.h;
  switch (kind) {
    case 'sideP':
      g.setTransform(kx, 0, 0, ky, x0, y0);
      return { region, kind, len: sz.w, wid: sz.h };
    case 'sideN':
      g.setTransform(-kx, 0, 0, ky, x0 + pw, y0);
      return { region, kind, len: sz.w, wid: sz.h };
    case 'top':
      // a (front to back) along canvas y, b across along canvas x
      g.setTransform(0, ky, kx, 0, x0, y0);
      return { region, kind, len: sz.h, wid: sz.w };
    default:
      g.setTransform(kx, 0, 0, ky, x0, y0);
      return { region, kind, len: sz.w, wid: sz.h };
  }
}

function clipRegion(g: CanvasRenderingContext2D, S: number, region: Region): void {
  const [fx, fy, fw, fh] = ATLAS[region];
  g.beginPath();
  g.rect(fx * S, fy * S, fw * S, fh * S);
  g.clip();
}

/** Stamps a sticker centred at (u, v) of its region, `size` metres across, upright. */
function stamp(g: CanvasRenderingContext2D, S: number, img: HTMLCanvasElement, spot: DecalSpot, sizes: RegionSizes, mirrorU = false): void {
  const sz = sizes[spot.region];
  if (!sz) return;
  const [fx, fy, fw, fh] = ATLAS[spot.region];
  const kx = (fw * S) / sz.w;
  const ky = (fh * S) / sz.h;
  const u = mirrorU ? 1 - spot.u : spot.u;
  const cx = (fx + fw * u) * S;
  const cy = (fy + fh * spot.v) * S;
  g.save();
  clipRegion(g, S, spot.region);
  g.setTransform(kx, 0, 0, ky, cx, cy);
  g.drawImage(img, -spot.size / 2, -spot.size / 2, spot.size, spot.size);
  g.restore();
}

const PAINTED: Region[] = ['doorP', 'doorN', 'hood', 'roof', 'deck', 'back', 'front'];

/** Paints the clean car (no damage) onto `cv`. */
export function paintCar(cv: HTMLCanvasElement, style: CarStyle, layout: PaintLayout): void {
  const S = cv.width;
  const g = cv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = style.paint;
  g.fillRect(0, 0, S, S);
  const [dx, dy, dw, dh] = ATLAS.dark;
  g.fillStyle = DARK_TRIM;
  g.fillRect(dx * S, dy * S, dw * S, dh * S);
  // a soft shade toward the sills and a highlight along the shoulder, so flat panels read as rounded
  for (const reg of ['doorP', 'doorN'] as const) {
    const [fx, fy, fw, fh] = ATLAS[reg];
    const gr = g.createLinearGradient(0, fy * S, 0, (fy + fh) * S);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0)');
    gr.addColorStop(0.75, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr;
    g.fillRect(fx * S, fy * S, fw * S, fh * S);
  }
  for (const reg of PAINTED) {
    const sz = layout.sizes[reg];
    if (!sz) continue;
    g.save();
    clipRegion(g, S, reg);
    const f = liveryFrame(g, S, reg, sz);
    drawLivery(g, f, style.livery, style, layout.seed);
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // stickers in their slots
  const placed = new Set(Object.values(style.decals));
  for (const slot of ['hood', 'roof', 'doors', 'back'] as const) {
    const d = style.decals[slot];
    if (!d) continue;
    const spot = layout.spots[slot];
    const img = sticker(d, style.number);
    stamp(g, S, img, spot, layout.sizes);
    if (slot === 'doors') stamp(g, S, img, { ...spot, region: 'doorN' }, layout.sizes, true);
  }
  // the race number on the doors, as on every rally car, unless it is stuck somewhere else
  if (!placed.has('number')) {
    const img = sticker('number', style.number);
    const spot = style.decals.doors ? { ...layout.numberSpot, u: layout.numberSpot.u + 0.2, size: layout.numberSpot.size * 0.8 } : layout.numberSpot;
    stamp(g, S, img, spot, layout.sizes);
    stamp(g, S, img, { ...spot, region: 'doorN' }, layout.sizes, true);
  }
}

/**
 * The damage layer over the clean paint: mud splashes up from the sills, scratches on the doors.
 * `amount` 0..1. Seeded, so the same car always gets the same splashes, more of them as it grows.
 */
export function paintDamage(g: CanvasRenderingContext2D, S: number, layout: PaintLayout, amount: number): void {
  if (amount <= 0) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const r = rng(layout.seed * 7 + 13);
  const mud = ['rgba(92,66,40,0.75)', 'rgba(120,88,52,0.7)', 'rgba(70,52,34,0.8)'];
  const splash = (reg: Region, n: number, from: number): void => {
    const [fx, fy, fw, fh] = ATLAS[reg];
    g.save();
    clipRegion(g, S, reg);
    for (let i = 0; i < n; i++) {
      const x = (fx + fw * r()) * S;
      const t = r();
      const y = (fy + fh * (from + (1 - from) * Math.sqrt(t))) * S;
      const rad = S * (0.004 + r() * 0.012) * (1 + t);
      g.fillStyle = mud[i % mud.length]!;
      g.beginPath();
      g.ellipse(x, y, rad * 1.6, rad, 0, 0, TAU);
      g.fill();
      if (r() < 0.4) {
        g.beginPath();
        g.ellipse(x + rad * 2.2, y - rad * 1.4, rad * 0.5, rad * 0.4, 0, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  };
  // a mud band along the sills that rises with the damage
  for (const reg of ['doorP', 'doorN'] as const) {
    const [fx, fy, fw, fh] = ATLAS[reg];
    const top = fy + fh * (1 - (1 - layout.dirtLine) * (0.4 + amount * 0.8));
    const gr = g.createLinearGradient(0, top * S, 0, (fy + fh) * S);
    gr.addColorStop(0, 'rgba(96,70,44,0)');
    gr.addColorStop(1, `rgba(96,70,44,${0.35 + amount * 0.45})`);
    g.fillStyle = gr;
    g.fillRect(fx * S, top * S, fw * S, (fy + fh - top) * S);
    splash(reg, Math.round(10 + amount * 60), layout.dirtLine * 0.8);
  }
  splash('front', Math.round(4 + amount * 18), 0.4);
  splash('back', Math.round(4 + amount * 22), 0.35);
  splash('hood', Math.round(amount * 14), 0);
  // scratches through the paint
  if (amount >= 0.3) {
    const n = Math.round(amount * 10);
    g.strokeStyle = 'rgba(235,235,235,0.75)';
    g.lineWidth = Math.max(1, S / 400);
    for (let i = 0; i < n; i++) {
      const reg = i % 2 ? 'doorP' : 'doorN';
      const [fx, fy, fw, fh] = ATLAS[reg];
      const x = (fx + fw * (0.1 + r() * 0.8)) * S;
      const y = (fy + fh * (0.3 + r() * 0.5)) * S;
      const len = S * (0.04 + r() * 0.08);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 1; k <= 3; k++) g.lineTo(x + (len * k) / 3, y + (r() - 0.5) * S * 0.008);
      g.stroke();
    }
  }
}

/** The number plate: a white Swedish plate with the blue band, the text centred. */
export function paintPlate(cv: HTMLCanvasElement, text: string): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  g.fillStyle = '#20232b';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f7f7f2';
  g.fillRect(2, 2, W - 4, H - 4);
  g.fillStyle = '#1f4fb8';
  g.fillRect(2, 2, W * 0.12, H - 4);
  g.fillStyle = '#fecc00';
  g.font = `bold ${Math.round(H * 0.28)}px system-ui, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('S', 2 + W * 0.06, H * 0.68);
  g.fillStyle = '#15171c';
  const t = text.toUpperCase().slice(0, 8);
  g.font = `bold ${Math.round(H * (t.length > 6 ? 0.56 : 0.66))}px system-ui, Arial, sans-serif`;
  g.fillText(t, W * 0.56, H * 0.54, W * 0.82);
}

/** A star of cracks on transparent glass, for the cracked windscreen. */
export function paintCrack(cv: HTMLCanvasElement, seed: number): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  g.clearRect(0, 0, W, H);
  const r = rng(seed);
  const cx = W * (0.3 + r() * 0.4);
  const cy = H * (0.35 + r() * 0.3);
  g.strokeStyle = 'rgba(235,245,255,0.9)';
  g.lineCap = 'round';
  g.lineWidth = Math.max(1.5, W / 120);
  for (let i = 0; i < 9; i++) {
    let x = cx;
    let y = cy;
    let a = (i / 9) * TAU + r() * 0.4;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 3 + Math.floor(r() * 3);
    for (let k = 0; k < steps; k++) {
      const l = (W * (0.06 + r() * 0.1)) as number;
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = Math.max(1, W / 200);
  for (const rad of [0.06, 0.13]) {
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * TAU;
      const rr = W * rad * (0.8 + r() * 0.4);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(cx, cy, W * 0.025, 0, TAU);
  g.fill();
}
