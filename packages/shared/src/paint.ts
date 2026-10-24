// Paintings drawn by players on paper: a 16×16 grid of palette indices.
export const PAINT_SIZE = 16;
export const PAINT_LEN = PAINT_SIZE * PAINT_SIZE;
/** Palette colours; a pixel is the index's character in PAINT_CHARS, '.' is transparent (paper). */
export const PAINT_PALETTE: string[] = [
  '#1b1a17', // black
  '#ffffff', // white
  '#e03a3a', // red
  '#f08a2a', // orange
  '#f5d94a', // yellow
  '#5fae3c', // green
  '#2e7a3a', // dark green
  '#3f86d6', // blue
  '#8fd0f0', // light blue
  '#a05ac8', // purple
  '#ff9ac8', // pink
  '#8a5a2a', // brown
];
export const PAINT_CHARS = '0123456789ab';
export const PAINT_EMPTY = '.'.repeat(PAINT_LEN);
/** What a painted tavla sells for. */
export const PAINTED_SELL = 20;

export const isValidPainting = (pixels: unknown): pixels is string =>
  typeof pixels === 'string' && pixels.length === PAINT_LEN && /^[0-9ab.]+$/.test(pixels) && pixels !== PAINT_EMPTY;

export const paintColor = (ch: string): string | null => {
  const i = PAINT_CHARS.indexOf(ch);
  return i < 0 ? null : PAINT_PALETTE[i]!;
};
