// Drawing helpers for the neon disco look: colours, cached glow sprites (drawn with additive blending),
// neon tubes, the arrow shape and a few shapes.

export const C = {
  magenta: '#ff3fd8',
  cyan: '#2fe6ff',
  yellow: '#ffe04a',
  lime: '#8dff5a',
  orange: '#ff9f40',
  violet: '#a477ff',
  red: '#ff4a5e',
  white: '#fff6fd',
  ink: '#1a0b2e',
};

/** Lane colours: ← ↓ ↑ →. */
export const LANE_COLOR = [C.magenta, C.cyan, C.lime, C.yellow];
export const ARROWS = ['←', '↓', '↑', '→'];
/** Rotation of the up-pointing arrow for each lane. */
export const LANE_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const font = (px: number, weight = 900): string => `${weight} ${Math.max(1, Math.round(px))}px ${FONT}`;

export type G = CanvasRenderingContext2D;

/** Cheap mode (phones, tablets): no per-frame shadow blur, which is slow on some tablets. */
export const QUALITY = { cheap: false };

/** A soft glow behind the current path or text without shadowBlur: a few wide, faint strokes. */
export function haloText(g: G, text: string, x: number, y: number, color: string, width: number, alpha: number): void {
  const prev = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round';
  for (const [k, a] of [
    [2.2, 0.12],
    [1.2, 0.22],
  ] as const) {
    g.lineWidth = width * k;
    g.strokeStyle = rgba(color, a * alpha);
    g.strokeText(text, x, y);
  }
  g.globalCompositeOperation = prev;
}

export function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/** Mix two hex colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  const c = (i: number): number => Math.round(x[i]! + (y[i]! - x[i]!) * t);
  return `#${((1 << 24) | (c(0) << 16) | (c(1) << 8) | c(2)).toString(16).slice(1)}`;
}

/** A rainbow colour going round with `t` (0..1). */
export function rainbow(t: number): string {
  const cols = [C.magenta, C.violet, C.cyan, C.lime, C.yellow, C.orange];
  const x = (((t % 1) + 1) % 1) * cols.length;
  const i = Math.floor(x);
  return mix(cols[i]!, cols[(i + 1) % cols.length]!, x - i);
}

export function canvas(w: number, h: number): { c: HTMLCanvasElement; g: G } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return { c, g: c.getContext('2d')! };
}

const glows = new Map<string, HTMLCanvasElement>();
/** A soft round glow (64 px) in a colour, to be drawn scaled with 'lighter'. */
export function glowSprite(color: string): HTMLCanvasElement {
  let s = glows.get(color);
  if (s) return s;
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(mix(color, '#ffffff', 0.5), 1));
  gr.addColorStop(0.18, rgba(color, 0.75));
  gr.addColorStop(0.5, rgba(color, 0.22));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glows.set(color, c);
  s = c;
  return s;
}

/** Draw a glow (call with globalCompositeOperation 'lighter'). */
export function glow(g: G, color: string, x: number, y: number, r: number, alpha = 1): void {
  if (alpha <= 0.003 || r <= 0.5) return;
  g.globalAlpha = Math.min(1, alpha);
  g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

/** Stroke the current path as a neon tube: a wide soft glow and a bright core. */
export function neonStroke(g: G, color: string, width: number, on: number): void {
  const prev = g.globalCompositeOperation;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // the dark tube when the light is off
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = rgba(mix(color, '#000000', 0.65), 0.9);
  g.lineWidth = width;
  g.stroke();
  if (on > 0.01) {
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba(color, 0.12 * on);
    g.lineWidth = width * 6;
    g.stroke();
    g.strokeStyle = rgba(color, 0.28 * on);
    g.lineWidth = width * 2.6;
    g.stroke();
    g.strokeStyle = rgba(mix(color, '#ffffff', 0.55), Math.min(1, 0.95 * on));
    g.lineWidth = width;
    g.stroke();
  }
  g.globalCompositeOperation = prev;
}

/** The arrow pointing up in a box of ±1. */
export function arrowPath(g: G, x: number, y: number, size: number, rot: number): void {
  const pts: [number, number][] = [
    [0, -0.92],
    [0.86, -0.04],
    [0.4, -0.04],
    [0.4, 0.84],
    [-0.4, 0.84],
    [-0.4, -0.04],
    [-0.86, -0.04],
  ];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  g.beginPath();
  pts.forEach(([px, py], i) => {
    const X = x + (px * c - py * s) * size;
    const Y = y + (px * s + py * c) * size;
    if (i === 0) g.moveTo(X, Y);
    else g.lineTo(X, Y);
  });
  g.closePath();
}

export interface ArrowSprites {
  size: number;
  /** Per lane: the note, its outline at the line, and a grey one for a miss. */
  note: HTMLCanvasElement[];
  ring: HTMLCanvasElement[];
  grey: HTMLCanvasElement[];
  pad: number;
}

/** Pre-draw the arrows at a size (CSS px) and pixel ratio. */
export function arrowSprites(size: number, dpr: number): ArrowSprites {
  const half = size / 2;
  const pad = size * 0.45;
  const full = (size + pad * 2) * dpr;
  const make = (lane: number, kind: 'note' | 'ring' | 'grey'): HTMLCanvasElement => {
    const { c, g } = canvas(full, full);
    g.scale(dpr, dpr);
    const m = size / 2 + pad;
    const col = LANE_COLOR[lane]!;
    const rot = LANE_ROT[lane]!;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (kind === 'note') {
      g.shadowColor = col;
      g.shadowBlur = size * 0.35;
      arrowPath(g, m, m, half * 0.98, rot);
      g.fillStyle = col;
      g.fill();
      g.shadowBlur = 0;
      const gr = g.createLinearGradient(m - half, m - half, m + half, m + half);
      gr.addColorStop(0, mix(col, '#ffffff', 0.7));
      gr.addColorStop(0.55, col);
      gr.addColorStop(1, mix(col, '#000000', 0.25));
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = size * 0.075;
      g.strokeStyle = C.ink;
      g.stroke();
      arrowPath(g, m, m, half * 0.58, rot);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fill();
    } else if (kind === 'ring') {
      arrowPath(g, m, m, half * 0.98, rot);
      g.fillStyle = 'rgba(12,4,30,0.55)';
      g.fill();
      g.shadowColor = col;
      g.shadowBlur = size * 0.2;
      g.lineWidth = size * 0.08;
      g.strokeStyle = rgba(col, 0.95);
      g.stroke();
      g.shadowBlur = 0;
      g.lineWidth = size * 0.03;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.stroke();
    } else {
      arrowPath(g, m, m, half * 0.98, rot);
      g.fillStyle = '#5b5470';
      g.fill();
      g.lineWidth = size * 0.075;
      g.strokeStyle = '#26203a';
      g.stroke();
    }
    return c;
  };
  return {
    size,
    pad,
    note: [0, 1, 2, 3].map((l) => make(l, 'note')),
    ring: [0, 1, 2, 3].map((l) => make(l, 'ring')),
    grey: [0, 1, 2, 3].map((l) => make(l, 'grey')),
  };
}

/** Draw a pre-drawn arrow centred at x, y with a scale (1 = the sprite's size). */
export function drawArrow(g: G, sp: ArrowSprites, img: HTMLCanvasElement, x: number, y: number, k: number, alpha = 1): void {
  if (alpha <= 0.01) return;
  const d = (sp.size + sp.pad * 2) * k;
  g.globalAlpha = Math.min(1, alpha);
  g.drawImage(img, x - d / 2, y - d / 2, d, d);
  g.globalAlpha = 1;
}

export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export function ellipse(g: G, x: number, y: number, rx: number, ry: number, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
}

export function star(g: G, x: number, y: number, r: number, inner = 0.45, points = 5, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    const X = x + Math.cos(a) * rr;
    const Y = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(X, Y);
    else g.lineTo(X, Y);
  }
  g.closePath();
}

/** A seeded random generator, so the background looks the same every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ease = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
/** A quick decay: 1 right after an event, falling towards 0. */
export const decay = (since: number, rate: number): number => (since < 0 ? 0 : Math.exp(-since * rate));

/** Text with a dark outline and a coloured glow. */
export function glowText(g: G, text: string, x: number, y: number, px: number, color: string, opts: { align?: CanvasTextAlign; glow?: number; outline?: number; alpha?: number; weight?: number } = {}): void {
  g.save();
  g.globalAlpha = opts.alpha ?? 1;
  g.font = font(px, opts.weight ?? 900);
  g.textAlign = opts.align ?? 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const ol = opts.outline ?? px * 0.14;
  if (ol > 0) {
    g.lineWidth = ol;
    g.strokeStyle = C.ink;
    g.strokeText(text, x, y);
  }
  const gl = opts.glow ?? 1;
  if (gl > 0) {
    if (QUALITY.cheap) haloText(g, text, x, y, color, px * 0.3 * gl, 1);
    else {
      g.shadowColor = color;
      g.shadowBlur = px * 0.45 * gl;
    }
  }
  g.fillStyle = mix(color, '#ffffff', 0.35);
  g.fillText(text, x, y);
  g.restore();
}
