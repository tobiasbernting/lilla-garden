// Animals: side view facing right (flip for left), 2 walk frames, adult + baby, optional tomteluva.
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';

export const ANIMAL_SIZE: Record<string, { w: number; h: number }> = {
  hen: { w: 16, h: 16 },
  rabbit: { w: 16, h: 14 },
  sheep: { w: 18, h: 16 },
  cow: { w: 24, h: 18 },
};

function hen(p: Px, f: number): void {
  p.ellipse(3, 5, 10, 8, '#f4ead8').rect(10, 3, 4, 5, '#f4ead8').rect(11, 2, 2, 1, '#d8363a').px(14, 5, '#f5a623').px(13, 4, OUTLINE);
  p.rect(4, 6, 5, 3, shade('#f4ead8', 0.85));
  p.rect(1, 6, 3, 2, '#d8a070').rect(2, 5, 1, 1, '#d8a070');
  p.rect(6 + f, 13, 1, 2, '#f5a623').rect(9 - f, 13, 1, 2, '#f5a623').rect(5 + f, 15, 2, 1, '#f5a623').rect(8 - f, 15, 2, 1, '#f5a623');
  p.px(11, 8, '#d8363a');
}
function rabbit(p: Px, f: number): void {
  const c = '#e9e2d9';
  p.ellipse(2, 6, 11, 7, c).circle(12, 7, 3, c).rect(10, 0, 2, 5, c).rect(13, 1, 2, 4, c).px(11, 1, '#ffb0c8').px(14, 2, '#ffb0c8');
  p.px(13, 6, OUTLINE).px(15, 8, '#ffb0c8');
  p.rect(3 + f, 12, 3, 2, c).rect(9 - f, 12, 3, 2, c).circle(2, 8, 1.5, '#ffffff');
}
function sheep(p: Px, f: number): void {
  const w = '#f7f3ee';
  p.ellipse(1, 3, 14, 10, w).ellipse(3, 1, 10, 7, w).ellipse(0, 6, 6, 6, w);
  p.rect(12, 6, 5, 5, '#3a3129').rect(13, 5, 3, 1, '#3a3129').px(15, 7, '#ffffff').px(14, 10, shade('#3a3129', 1.3));
  p.rect(3 + f, 13, 2, 3, '#3a3129').rect(7, 13, 2, 3, '#3a3129').rect(11 - f, 13, 2, 3, '#3a3129');
}
function cow(p: Px, f: number): void {
  const c = '#f4f0ea';
  p.rect(2, 4, 16, 9, c).ellipse(1, 3, 18, 10, c);
  p.rect(16, 3, 7, 8, c).rect(18, 10, 5, 3, '#f0b8a8').rect(15, 1, 2, 2, '#e0c8a0').rect(21, 1, 2, 2, '#e0c8a0');
  p.px(19, 5, OUTLINE).px(22, 5, OUTLINE).px(19, 11, shade('#f0b8a8', 0.7)).px(21, 11, shade('#f0b8a8', 0.7));
  p.ellipse(4, 5, 6, 5, '#3a3129').ellipse(10, 8, 5, 4, '#3a3129');
  p.rect(3 + f, 13, 3, 5, c).rect(8, 13, 3, 5, c).rect(13 - f, 13, 3, 5, c).rect(3 + f, 17, 3, 1, '#3a3129').rect(8, 17, 3, 1, '#3a3129').rect(13 - f, 17, 3, 1, '#3a3129');
  p.rect(0, 5, 2, 6, c).px(0, 11, '#3a3129');
  p.rect(2, 10, 3, 2, '#f0b8a8');
}

const DRAW: Record<string, (p: Px, f: number) => void> = { hen, rabbit, sheep, cow };

/** Head position (x of head centre, top y) for the tomteluva per species. */
const HAT_POS: Record<string, [number, number]> = { hen: [12, 1], rabbit: [12, -1], sheep: [14, 4], cow: [19, 0] };

export function drawAnimal(species: string, frame: number, baby: boolean, jul: boolean): Px {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const full = new Px(size.w, size.h);
  DRAW[species]?.(full, frame);
  if (jul) {
    const [hx, hy] = HAT_POS[species] ?? [8, 0];
    full.rect(hx - 3, hy + 1, 6, 1, '#ffffff').rect(hx - 2, hy - 1, 4, 2, '#d8363a').rect(hx - 1, hy - 3, 2, 2, '#d8363a').px(hx + 1, hy - 3, '#ffffff');
  }
  full.outline(OUTLINE);
  if (!baby) return full;
  // baby: 2/3 scale, drawn bottom-aligned in a same-sized canvas
  const bw = Math.round(size.w * 0.66);
  const bh = Math.round(size.h * 0.66);
  const p = new Px(size.w, size.h);
  p.blitScaled(full, Math.round((size.w - bw) / 2), size.h - bh, bw, bh);
  return p;
}

export function animalSheet(species: string, baby: boolean, jul: boolean): HTMLCanvasElement {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const sheet = new Px(size.w * 2, size.h);
  sheet.blit(drawAnimal(species, 0, baby, jul), 0, 0).blit(drawAnimal(species, 1, baby, jul), size.w, 0);
  return sheet.canvas;
}

export const animalKey = (species: string, baby: boolean, jul: boolean): string => `animal-${species}-${baby ? 'baby' : 'adult'}${jul ? '-jul' : ''}`;
