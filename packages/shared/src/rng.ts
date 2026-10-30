/** Small seeded PRNG (mulberry32) so map generation is deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rnd: () => number, min: number, max: number): number =>
  min + Math.floor(rnd() * (max - min + 1));

/** A well-mixed 32-bit hash of a few integers (stable across runs). */
export function hashInts(...ns: number[]): number {
  let h = 0x2545f491;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x9e3779b1);
    h = (h ^ (h >>> 15)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash of a string (cave keys and the like) for seeding. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return hashInts(h);
}

/** Smooth value noise in 0..1 on a grid whose cells are `scale` tiles wide. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const tx = sx * sx * (3 - 2 * sx);
  const ty = sy * sy * (3 - 2 * sy);
  const v = (dx: number, dy: number) => hashInts(x0 + dx, y0 + dy, seed) / 4294967296;
  const a = v(0, 0);
  const b = v(1, 0);
  const c = v(0, 1);
  const d = v(1, 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
