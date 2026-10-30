// Small maths helpers and the palette for Stjärnstorm.

export const TAU = Math.PI * 2;

/** The playfield in world units: a 3:4 column; y grows downwards and enemies come from the top. */
export const FW = 600;
export const FH = 800;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const rand = (a = 0, b = 1): number => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
export const easeOut = (t: number): number => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOut = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
/** Frame-rate independent smoothing: move a fraction of the way each second. */
export const damp = (v: number, target: number, rate: number, dt: number): number => target + (v - target) * Math.exp(-rate * dt);
export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;

/** A regular polygon (flat x,y list) around 0,0. */
export function regular(n: number, r: number, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

/** A star polygon with n points. */
export function starPoly(n: number, ro: number, ri: number, rot = -Math.PI / 2): number[] {
  const out: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 ? ri : ro;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

/** An irregular rock outline. */
export function rockPoly(r: number, n = 10): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.12, 0.12);
    const rr = r * rand(0.74, 1.12);
    out.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return out;
}

export const C = {
  cyan: '#4ff4ff',
  ice: '#bffcff',
  yellow: '#ffe24a',
  gold: '#ffb43c',
  magenta: '#ff4fe0',
  pink: '#ff5aa8',
  violet: '#a77bff',
  white: '#f2fbff',
  green: '#70ffa8',
  red: '#ff5470',
  blue: '#5a8cff',
} as const;

/** Hex colour to "r,g,b" for rgba() strings. */
export function rgbOf(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix a hex colour towards white (t = 0..1). */
export function whiten(hex: string, t: number): string {
  const [r, g, b] = rgbOf(hex);
  const m = (v: number): number => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** A player colour that reads on black: too dark colours are brightened. */
export function brightColor(hex: string): string {
  try {
    const [r, g, b] = rgbOf(hex);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum >= 110) return hex;
    const t = Math.min(0.75, (110 - lum) / 160 + 0.15);
    return whiten(hex, t);
  } catch {
    return C.pink;
  }
}
