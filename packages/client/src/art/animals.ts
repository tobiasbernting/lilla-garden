// Animals: side view facing right (flip for left), 2 walk frames, adult + baby, optional tomteluva.
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';

export const ANIMAL_SIZE: Record<string, { w: number; h: number }> = {
  hen: { w: 16, h: 16 },
  rabbit: { w: 16, h: 14 },
  sheep: { w: 18, h: 16 },
  cow: { w: 24, h: 18 },
  dog: { w: 16, h: 14 },
  cat: { w: 14, h: 12 },
  slime: { w: 14, h: 12 },
  bat: { w: 16, h: 10 },
  troll: { w: 18, h: 22 },
  boss: { w: 28, h: 32 },
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

function dog(p: Px, f: number): void {
  const c = '#c8924a';
  const d = shade(c, 0.75);
  p.ellipse(1, 4, 11, 7, c).rect(10, 2, 5, 6, c).rect(12, 1, 3, 2, d).rect(9, 1, 2, 4, d).px(13, 4, OUTLINE).px(15, 6, OUTLINE);
  p.rect(0, 2, 2, 4, d).px(1, 1, d); // tail
  p.rect(2 + f, 10, 2, 4, c).rect(5, 10, 2, 4, d).rect(8, 10, 2, 4, c).rect(10 - f, 10, 2, 4, d);
  p.rect(4, 7, 4, 3, '#f0e0c0');
}
function cat(p: Px, f: number): void {
  const c = '#7a7a7a';
  const d = shade(c, 0.7);
  p.ellipse(1, 4, 10, 6, c).rect(9, 2, 5, 5, c).rect(9, 0, 2, 2, c).rect(12, 0, 2, 2, c).px(11, 3, '#9ad04a').px(13, 3, '#9ad04a').px(12, 5, '#ffb0c8');
  p.rect(0, 1, 2, 2, c).rect(0, 2, 1, 4, c); // tail up
  p.rect(2 + f, 9, 2, 3, d).rect(5, 9, 2, 3, c).rect(8 - f, 9, 2, 3, d).rect(10, 9, 2, 3, c);
  for (let x = 3; x < 9; x += 2) p.rect(x, 5, 1, 2, d);
}

function slime(p: Px, f: number): void {
  const c = '#6ad04a';
  p.ellipse(1, 2 + f, 12, 10 - f, c).ellipse(3, 3 + f, 8, 4, '#9af07a');
  p.rect(4, 6 + f, 2, 2, OUTLINE).rect(8, 6 + f, 2, 2, OUTLINE).rect(6, 9 + f, 2, 1, shade(c, 0.6));
}
function bat(p: Px, f: number): void {
  const c = '#5a4a7a';
  p.ellipse(5, 2, 6, 7, c).rect(5, 0, 2, 2, c).rect(9, 0, 2, 2, c);
  if (f === 0) p.rect(0, 3, 5, 3, c).rect(11, 3, 5, 3, c).px(0, 2, c).px(15, 2, c);
  else p.rect(1, 5, 4, 3, c).rect(11, 5, 4, 3, c).px(1, 8, c).px(14, 8, c);
  p.px(6, 4, '#ffe14a').px(9, 4, '#ffe14a');
}
function troll(p: Px, f: number): void {
  const c = '#7a9a4a';
  const d = shade(c, 0.75);
  p.ellipse(3, 0, 12, 10, c).rect(4, 9, 10, 8, c).rect(4, 9, 10, 1, d);
  p.rect(5, 3, 2, 2, OUTLINE).rect(10, 3, 2, 2, OUTLINE).rect(7, 7, 4, 1, d).px(7, 6, '#ffffff').px(10, 6, '#ffffff');
  p.rect(2, 10, 2, 6, c).rect(14, 10, 2, 6, c);
  p.rect(5, 17, 3, 5 - f, d).rect(10, 17 + f, 3, 5 - f, d);
  p.rect(15, 4, 3, 9, '#8a5a2a').rect(14, 2, 4, 3, '#6f4a26'); // club
  p.rect(6, 0, 6, 2, '#3a2a1a');
}
function boss(p: Px, f: number): void {
  const c = '#6a8a3a';
  const d = shade(c, 0.75);
  p.ellipse(5, 0, 18, 14, c).rect(5, 13, 18, 12, c).rect(5, 13, 18, 1, d);
  p.rect(9, 4, 3, 3, OUTLINE).rect(16, 4, 3, 3, OUTLINE).px(10, 5, '#ff4a4a').px(17, 5, '#ff4a4a');
  p.rect(10, 9, 8, 2, d).rect(11, 9, 2, 2, '#ffffff').rect(15, 9, 2, 2, '#ffffff');
  p.rect(1, 14, 4, 9, c).rect(23, 14, 4, 9, c);
  p.rect(7, 25, 5, 7 - f, d).rect(16, 25 + f, 5, 7 - f, d);
  p.rect(24, 2, 4, 14, '#8a5a2a').rect(22, 0, 6, 4, '#6f4a26');
  p.rect(8, 0, 12, 2, '#3a2a1a').rect(10, 2, 2, 1, '#f2d35a').rect(16, 2, 2, 1, '#f2d35a'); // crown bits
}

const DRAW: Record<string, (p: Px, f: number) => void> = { hen, rabbit, sheep, cow, dog, cat, slime, bat, troll, boss };

/** Head position (x of head centre, top y) for the tomteluva per species. */
const HAT_POS: Record<string, [number, number]> = { hen: [12, 1], rabbit: [12, -1], sheep: [14, 4], cow: [19, 0], dog: [12, 1], cat: [11, 0] };

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
