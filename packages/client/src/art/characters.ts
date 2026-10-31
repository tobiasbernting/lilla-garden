// Layered, tintable 16x24 characters: body, hair, shirt, pants, shoes, hat.
// Directions: down, up, right (left is right flipped). Frames: 0 stand, 1/2 walk.
import { ITEMS, type Appearance, type Facing, type Outfit } from '@lilla-garden/shared';
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';

export type Dir = 'down' | 'up' | 'right';
export const DIRS: Dir[] = ['down', 'up', 'right'];
export const CHAR_W = 16;
/** Empty rows over the 24-row figure, so tall hats (a wizard's point, horns, wings) fit in the frame. */
export const HEADROOM = 8;
export const CHAR_H = 24 + HEADROOM;

export const SKIN_TONES = ['#f7d7c0', '#f1c9a5', '#dba97d', '#b97a4e', '#8d5a32', '#5a3a22'];
export const HAIR_COLORS = ['#f2d16b', '#d98b3a', '#8a4a1e', '#5a3a1e', '#2b2119', '#c43a2a', '#e87ab8', '#5aa0e8'];
export const HAIR_STYLES = ['short', 'long', 'curly', 'ponytail', 'bald'];

export const dirOf = (f: Facing): { dir: Dir; flip: boolean } =>
  f === 'left' ? { dir: 'right', flip: true } : { dir: f as Dir, flip: false };

interface Look {
  skin: string;
  hair: string;
  hairStyle: string;
  shirt: { style: string; color: string };
  pants: { style: string; color: string };
  shoes: { style: string; color: string };
  hat?: { style: string; color: string };
}

export function lookOf(appearance: Appearance, outfit: Outfit): Look {
  const cl = (id: string | undefined, fallback: { style: string; color: string }) => {
    const d = id ? ITEMS[id] : undefined;
    return d?.clothing ? { style: d.clothing.style, color: d.clothing.color } : fallback;
  };
  const hat = outfit.hat ? ITEMS[outfit.hat]?.clothing : undefined;
  return {
    skin: appearance.skin,
    hair: appearance.hair,
    hairStyle: appearance.hairStyle,
    shirt: cl(outfit.shirt, { style: 'plain', color: '#3b6fd9' }),
    pants: cl(outfit.pants, { style: 'plain', color: '#2f4c8a' }),
    shoes: cl(outfit.shoes, { style: 'boots', color: '#3a3a3a' }),
    hat: hat ? { style: hat.style, color: hat.color } : undefined,
  };
}

export const lookKey = (l: Look): string =>
  [l.skin, l.hair, l.hairStyle, l.shirt.style, l.shirt.color, l.pants.style, l.pants.color, l.shoes.style, l.shoes.color, l.hat?.style ?? '-', l.hat?.color ?? '-'].join('|');

export const DRESS_STYLES = ['dress', 'dress_belt', 'dress_flowers', 'gown', 'robe'];
export const isDress = (style: string): boolean => DRESS_STYLES.includes(style);

/** A-line skirt from the waist (row 15) to the hem (row 21), wider for a gown; a robe reaches the ankles. */
function drawDressPixel(p: Px, style: string, c: string, dir: Dir, frame: number): void {
  const d = shade(c, 0.78);
  const lt = shade(c, 1.15);
  const gown = style === 'gown' || style === 'robe';
  const hem = gown ? 22 : 21;
  const side = dir === 'right';
  for (let y = 15; y <= hem; y++) {
    const t = (y - 15) / (hem - 15);
    const half = gown ? 5 + Math.round(t * 3) : 5 + Math.round(t * 2); // 5..7 (gown 5..8)
    const sway = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    const x0 = side ? 8 - half + 1 + (y > 18 ? sway : 0) : 8 - half;
    const w = side ? half * 2 - 1 : half * 2;
    p.rect(x0, y, w, 1, y === hem ? d : c);
    if (!side && y < hem) p.px(x0 + w - 1, y, d); // shaded edge
    if (!side && y < hem && y > 15) p.px(x0, y, lt);
  }
  if (style === 'robe') {
    // a rope belt with its knot hanging, runes stitched down the front and round the hem
    const rope = '#ecdcae';
    const rune = '#fff0a0';
    p.rect(side ? 5 : 3, 14, side ? 7 : 10, 1, rope);
    if (dir !== 'up') p.px(side ? 10 : 9, 15, rope).px(side ? 10 : 9, 16, shade(rope, 0.8));
    for (let x = 2; x < 14; x++) if (x % 3 === 0) p.px(x + (side && frame ? (frame === 1 ? 1 : -1) : 0), 21, rune);
    if (dir === 'down') {
      p.rect(7, 15, 2, 6, lt);
      for (let y = 16; y < 21; y += 2) p.px(7, y, rune);
    }
    if (dir === 'up') p.rect(6, 16, 4, 1, lt).rect(7, 15, 2, 3, lt).px(7, 16, rune);
    return;
  }
  if (style === 'dress_belt' || gown) {
    p.rect(side ? 5 : 3, 15, side ? 7 : 10, 1, '#ffffff');
    if (!side && dir === 'down') p.rect(6, 10, 4, 1, '#ffffff').px(5, 11, '#ffffff').px(10, 11, '#ffffff');
  }
  if (style === 'dress_flowers') {
    const pts: [number, number][] = side ? [[6, 17], [9, 19], [5, 20], [10, 16]] : [[4, 17], [9, 18], [6, 20], [11, 20], [8, 16], [3, 19]];
    pts.forEach(([x, y], i) => p.px(x, y, i % 2 ? '#ffffff' : '#f5e04a'));
  }
  if (gown) {
    for (let y = 16; y < hem; y += 2) p.px(side ? 7 : 8, y, lt);
    if (!side) p.px(2, hem - 1, lt).px(13, hem - 1, lt);
  }
}

/** Draws one frame: the 16x24 figure at the bottom, the HEADROOM rows above it free for a tall hat. */
export function drawCharacter(l: Look, dir: Dir, frame: number): Px {
  const p = new Px(CHAR_W, CHAR_H);
  p.ctx.translate(0, HEADROOM);
  const skinD = shade(l.skin, 0.8);
  const legOff = frame === 0 ? [0, 0] : frame === 1 ? [-1, 1] : [1, -1]; // leg length deltas (walk)
  const bob = frame === 0 ? 0 : 0; // keep head steady for crisp pixels

  // --- legs & shoes (rows 17..23) ---
  const pantsC = l.pants.color;
  const pantsD = shade(pantsC, 0.75);
  const shoeC = l.shoes.color;
  const shoeL = shade(shoeC, 1.3);
  const dress = isDress(l.shirt.style);
  if (dress) {
    // legs are hidden under the skirt: only the shoes show, stepping with the walk cycle
    if (dir === 'right') {
      const frontX = frame === 1 ? 8 : frame === 2 ? 5 : 6;
      const backX = frame === 1 ? 5 : frame === 2 ? 8 : 8;
      p.rect(backX, 22, 3, 2, shade(shoeC, 0.8));
      p.rect(frontX, 22, 4, 2, shoeC).px(frontX + 3, 22, shoeL);
    } else {
      const ly = 22 + legOff[0]! * 0;
      p.rect(4, ly + Math.max(0, legOff[0]!), 3, 2, shoeC).rect(9, ly + Math.max(0, legOff[1]!), 3, 2, shoeC);
      p.px(4, ly + Math.max(0, legOff[0]!), shoeL).px(9, ly + Math.max(0, legOff[1]!), shoeL);
    }
  } else if (dir === 'right') {
    // side view: legs overlap, show two with walk offset
    const back = 6 + legOff[1]! * 0; // keep simple: alternate which leg is forward
    const frontX = frame === 1 ? 8 : frame === 2 ? 5 : 6;
    const backX = frame === 1 ? 5 : frame === 2 ? 8 : 8;
    p.rect(backX, 17, 3, 5, pantsD);
    p.rect(frontX, 17, 3, 5, pantsC);
    void back;
    p.rect(backX, 22, 3, 2, shade(shoeC, 0.8));
    p.rect(frontX, 22, 4, 2, shoeC).px(frontX + 3, 22, shoeL);
  } else {
    const ly = 17;
    const lLen = 5 + legOff[0]!;
    const rLen = 5 + legOff[1]!;
    p.rect(4, ly, 3, lLen, pantsC).rect(9, ly, 3, rLen, pantsC);
    p.rect(6, ly, 1, lLen, pantsD).rect(11, ly, 1, rLen, pantsD);
    p.rect(4, ly + lLen, 3, 2, shoeC).rect(9, ly + rLen, 3, 2, shoeC);
    p.px(4, ly + lLen, shoeL).px(9, ly + rLen, shoeL);
    if (l.shoes.style === 'boots') p.rect(4, ly + lLen - 1, 3, 1, shade(shoeC, 0.9)).rect(9, ly + rLen - 1, 3, 1, shade(shoeC, 0.9));
  }
  if (l.pants.style === 'skirt' && !dress) {
    const sk = shade(pantsC, 1.1);
    p.rect(3, 15, 10, 1, sk).rect(2, 16, 12, 3, sk).rect(2, 18, 12, 1, pantsD);
  }

  // --- torso & shirt (rows 10..17) ---
  const shirtC = l.shirt.style === 'ghost' ? '#f4f4f4' : l.shirt.color;
  const shirtD = shade(shirtC, 0.8);
  p.rect(3, 10 + bob, 10, 7, shirtC);
  p.rect(3, 16 + bob, 10, 1, shirtD);
  // arms
  if (dir === 'right') {
    p.rect(6, 11 + bob, 3, 5, shirtD);
    p.rect(6, 16 + bob, 3, 1, l.skin);
  } else {
    p.rect(2, 11 + bob, 2, 5, shirtD).rect(12, 11 + bob, 2, 5, shirtD);
    const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    p.rect(2, 16 + bob + Math.max(0, swing), 2, 1, l.skin).rect(12, 16 + bob + Math.max(0, -swing), 2, 1, l.skin);
  }
  if (l.shirt.style === 'stripes') for (let y = 11; y < 16; y += 2) p.rect(3, y + bob, 10, 1, '#ffffff');
  if (l.shirt.style === 'overalls') {
    p.rect(3, 10 + bob, 10, 7, '#f0e4c8');
    p.rect(5, 10 + bob, 6, 7, shirtC).rect(4, 10 + bob, 1, 3, shirtC).rect(11, 10 + bob, 1, 3, shirtC).px(7, 13 + bob, '#f2d35a').px(8, 13 + bob, '#f2d35a');
    if (dir === 'right') p.rect(6, 11 + bob, 3, 5, '#d9ccb0');
    else p.rect(2, 11 + bob, 2, 5, '#d9ccb0').rect(12, 11 + bob, 2, 5, '#d9ccb0');
  }
  if (l.shirt.style === 'star') {
    p.px(7, 12 + bob, '#f5e04a').px(8, 12 + bob, '#f5e04a').rect(6, 13 + bob, 4, 1, '#f5e04a').px(7, 14 + bob, '#f5e04a').px(8, 14 + bob, '#f5e04a').px(6, 15 + bob, '#f5e04a').px(9, 15 + bob, '#f5e04a');
  }
  if (l.shirt.style === 'xmas') {
    p.rect(3, 12 + bob, 10, 1, '#d8363a').rect(3, 14 + bob, 10, 1, '#ffffff');
    for (let x = 3; x < 13; x += 2) p.px(x, 13 + bob, '#ffffff');
  }
  if (l.shirt.style === 'ghost') {
    // sheet covers torso to knees, wavy hem
    p.rect(2, 10 + bob, 12, 10, '#f4f4f4');
    for (let x = 2; x < 14; x += 3) p.rect(x, 20, 2, 1, '#f4f4f4');
    if (dir !== 'up') p.rect(5, 12, 2, 2, OUTLINE).rect(9, 12, 2, 2, OUTLINE);
  }
  if (l.shirt.style === 'space') {
    // astronaut suit: grey collar ring, belt and cuffs, a chest panel, a tiny Swedish flag and a backpack
    const G = '#a2a9b4';
    const Gd = '#737b88';
    const flag = { B: '#2f6fc8', Y: '#f5d03a' };
    p.rect(3, 15 + bob, 10, 1, G);
    if (dir === 'down') {
      p.rect(5, 10 + bob, 6, 1, G).rect(2, 15 + bob, 2, 1, G).rect(12, 15 + bob, 2, 1, G);
      p.tpl(4, 12 + bob, ['BYBB', 'YYYY', 'BYBB'], flag);
      p.rect(9, 12 + bob, 2, 2, Gd).px(9, 12 + bob, '#ff5a4a').px(10, 13 + bob, '#5ae05a');
    } else if (dir === 'right') {
      p.rect(2, 10 + bob, 2, 6, Gd).rect(2, 11 + bob, 1, 3, G);
      p.tpl(6, 12 + bob, ['BYB', 'YYY', 'BYB'], flag).rect(6, 15 + bob, 3, 1, G);
    } else {
      p.rect(4, 11 + bob, 8, 5, Gd).rect(5, 12 + bob, 6, 3, G).px(6, 13 + bob, '#ff5a4a').px(9, 13 + bob, '#5ae05a');
    }
  }

  drawNorseShirt(p, l.shirt.style, shirtC, dir, frame);
  if (dress) drawDressPixel(p, l.shirt.style, shirtC, dir, frame);

  // --- head (rows 2..10) ---
  const hx = 4;
  const hy = 2 + bob;
  p.rect(hx, hy, 8, 8, l.skin);
  p.rect(hx, hy + 7, 8, 1, skinD);
  p.rect(6, 9 + bob, 4, 1, l.skin); // neck
  if (dir === 'down') {
    p.rect(hx + 1, hy + 4, 2, 2, OUTLINE).rect(hx + 5, hy + 4, 2, 2, OUTLINE);
    p.px(hx + 1, hy + 4, '#ffffff').px(hx + 5, hy + 4, '#ffffff');
    p.rect(hx + 3, hy + 7, 2, 1, shade(l.skin, 0.6));
    p.px(hx, hy + 5, '#f0a0a0').px(hx + 7, hy + 5, '#f0a0a0');
  } else if (dir === 'right') {
    p.rect(hx + 5, hy + 4, 2, 2, OUTLINE).px(hx + 5, hy + 4, '#ffffff');
    p.rect(hx + 8, hy + 4, 1, 3, l.skin); // nose
    p.px(hx + 6, hy + 7, shade(l.skin, 0.6));
  }

  // --- hair ---
  const H = l.hair;
  const Hd = shade(H, 0.75);
  const style = l.hat?.style === 'space' && (l.hairStyle === 'long' || l.hairStyle === 'ponytail') ? 'short' : l.hairStyle; // tucked into the helmet
  if (style !== 'bald') {
    // cap of hair on top of head
    p.rect(hx - 1, hy - 1, 10, 2, H).rect(hx, hy - 2, 8, 1, H);
    p.rect(hx - 1, hy + 1, 10, 1, H);
    if (dir === 'up') p.rect(hx - 1, hy, 10, 6, H).rect(hx - 1, hy + 5, 10, 1, Hd);
    if (dir === 'down') p.rect(hx - 1, hy + 1, 1, 3, H).rect(hx + 8, hy + 1, 1, 3, H).px(hx + 1, hy + 2, H).px(hx + 5, hy + 2, Hd);
    if (dir === 'right') p.rect(hx - 1, hy + 1, 3, 4, H).rect(hx, hy + 2, 3, 1, H);
    if (style === 'long') {
      p.rect(hx - 2, hy + 1, 2, 9, H).rect(hx + 8, hy + 1, 2, 9, H).rect(hx - 2, hy + 9, 2, 1, Hd).rect(hx + 8, hy + 9, 2, 1, Hd);
      if (dir === 'up') p.rect(hx - 1, hy + 2, 10, 8, H).rect(hx - 1, hy + 9, 10, 1, Hd);
      if (dir === 'right') p.rect(hx - 2, hy + 1, 4, 9, H);
    }
    if (style === 'curly') {
      p.rect(hx - 2, hy - 2, 12, 4, H).rect(hx - 1, hy - 3, 10, 1, H);
      for (let x = hx - 2; x < hx + 10; x += 2) p.px(x, hy - 3 + (x % 4 === 0 ? 0 : 1), Hd);
      p.rect(hx - 2, hy + 2, 1, 3, H).rect(hx + 9, hy + 2, 1, 3, H);
      if (dir === 'up') p.rect(hx - 2, hy - 1, 12, 7, H);
    }
    if (style === 'ponytail') {
      if (dir === 'up') p.rect(hx - 1, hy, 10, 6, H).rect(hx + 3, hy + 6, 2, 6, H).rect(hx + 3, hy + 11, 2, 1, Hd);
      if (dir === 'right') p.rect(hx - 3, hy + 2, 3, 2, H).rect(hx - 3, hy + 3, 2, 5, H).px(hx - 3, hy + 7, Hd);
      if (dir === 'down') p.px(hx - 1, hy + 4, H).px(hx + 8, hy + 4, H);
    }
  }

  // soft shading: darker right edge of torso and head, hair highlight, eye shine (before the hat, which covers it)
  p.rect(12, 10 + bob, 1, 7, shade(shirtC, 0.72));
  p.rect(11, 2 + bob, 1, 7, shade(l.skin, 0.85));
  if (style !== 'bald') p.rect(hx + 1, hy - 1, 3, 1, shade(l.hair, 1.35));
  if (dir === 'down') p.px(hx + 2, hy + 4, '#ffffff').px(hx + 6, hy + 4, '#ffffff');

  // --- hat ---
  if (l.hat) {
    const C = l.hat.color;
    const Cd = shade(C, 0.75);
    switch (l.hat.style) {
      case 'cap':
        p.rect(hx - 1, hy - 2, 10, 3, C).rect(hx, hy - 3, 8, 1, C);
        if (dir === 'down') p.rect(hx - 2, hy + 1, 12, 1, Cd);
        if (dir === 'right') p.rect(hx + 6, hy + 1, 6, 1, Cd);
        if (dir === 'up') p.rect(hx - 1, hy + 1, 10, 1, Cd);
        break;
      case 'beanie':
        p.rect(hx - 1, hy - 3, 10, 5, C).rect(hx, hy - 4, 8, 1, C).rect(hx - 1, hy + 1, 10, 1, Cd).rect(hx + 3, hy - 5, 2, 1, '#ffffff');
        break;
      case 'straw':
        p.rect(hx - 1, hy - 3, 10, 4, C).rect(hx, hy - 4, 8, 1, C).rect(hx - 3, hy, 14, 1, C).rect(hx - 3, hy + 1, 14, 1, Cd).rect(hx - 1, hy - 1, 10, 1, '#d8363a');
        break;
      case 'cowboy':
        p.rect(hx, hy - 4, 8, 4, C).rect(hx + 1, hy - 5, 6, 1, C).rect(hx - 3, hy - 1, 14, 2, C).px(hx - 3, hy - 2, C).px(hx + 10, hy - 2, C).rect(hx, hy - 1, 8, 1, Cd);
        break;
      case 'wreath':
        p.rect(hx - 1, hy - 2, 10, 2, '#4f9a3a');
        [hx - 1, hx + 2, hx + 5, hx + 8].forEach((x, i) => p.px(x, hy - 2, ['#f5e04a', '#e87ab8', '#5aa0e8', '#ffffff'][i]!));
        break;
      case 'witch':
        p.rect(hx - 3, hy - 1, 14, 2, C).rect(hx, hy - 4, 8, 3, C).rect(hx + 1, hy - 7, 6, 3, C).rect(hx + 2, hy - 9, 3, 2, C).px(hx + 3, hy - 10, C).rect(hx, hy - 2, 8, 1, '#8a4fd1');
        break;
      case 'santa':
        p.rect(hx - 1, hy - 2, 10, 3, C).rect(hx, hy - 4, 8, 2, C).rect(hx + 1, hy - 6, 5, 2, C).rect(hx + 3, hy - 7, 3, 1, C).rect(hx - 1, hy + 1, 10, 1, '#ffffff').rect(hx + 6, hy - 7, 2, 2, '#ffffff');
        break;
      case 'viking':
        p.rect(hx - 1, hy - 3, 10, 5, C).rect(hx, hy - 4, 8, 1, C).rect(hx - 1, hy + 1, 10, 1, Cd).rect(hx + 3, hy - 4, 2, 5, '#f2d35a');
        p.rect(hx - 3, hy - 5, 2, 4, '#f4ead8').px(hx - 2, hy - 6, '#f4ead8').rect(hx + 9, hy - 5, 2, 4, '#f4ead8').px(hx + 9, hy - 6, '#f4ead8');
        break;
      case 'party':
        p.rect(hx + 1, hy - 2, 6, 2, C).rect(hx + 2, hy - 5, 4, 3, C).rect(hx + 3, hy - 8, 2, 3, C).px(hx + 3, hy - 9, '#f5e04a').px(hx + 4, hy - 9, '#f5e04a');
        p.px(hx + 2, hy - 4, '#ffffff').px(hx + 5, hy - 2, '#ffffff').px(hx + 4, hy - 6, '#5aa0e8');
        break;
      case 'crown':
        // three points stand above the band (they have to fit in the two rows above the head)
        p.tpl(0, hy - 2, ['....L..LL..L....', '....CC.CC.CC....', '....CRCBBCGC....', '....DDDDDDDD....'], { C, L: shade(C, 1.4), D: Cd, R: '#e03a3a', B: '#2f7ae8', G: '#2ab84a' });
        break;
      case 'bunny':
        p.rect(hx - 1, hy - 2, 10, 2, C).rect(hx, hy - 8, 2, 6, C).rect(hx + 6, hy - 8, 2, 6, C).rect(hx, hy - 7, 1, 4, '#ffb0c8').rect(hx + 7, hy - 7, 1, 4, '#ffb0c8');
        break;
      case 'pirate': {
        // black tricorn with a gold-trimmed brim and a white skull on the front
        const pal = { B: C, T: '#e8c040', W: '#f4f0e6', K: OUTLINE };
        if (dir === 'right') p.tpl(0, hy - 2, ['.TTTTTTTTTTTTT..', '.BBBBBBBBWWBBBT.', '..BBBBBBWKKWBB..', '...BBBBBBWWBB...', '.......BBBBB....'], pal);
        else p.tpl(0, hy - 2, ['.TTTTTTTTTTTTTT.', '.BBBBBBWWBBBBBB.', '..BBBBWKKWBBBB..', '...BBBBWWBBBB...', '.....BBBBBB.....'].map((r) => (dir === 'up' ? r.replace(/[WK]/g, 'B') : r)), pal);
        break;
      }
      case 'explorer': {
        // beige pith helmet: a high dome, a darker band and a wide brim
        const pal = { C, L: shade(C, 1.3), N: shade(C, 0.6), D: shade(C, 0.8) };
        if (dir === 'right') p.tpl(0, hy - 2, ['....LCCCCCCC....', '...LCCCCCCCCC...', '...NNNNNNNNNN...', '..DDDDDDDDDDDD..', '.D............D.'], pal);
        else p.tpl(0, hy - 2, ['....LLCCCCCC....', '...LCCCCCCCCC...', '...NNNNNNNNNN...', '.DDDDDDDDDDDDDD.'], pal);
        break;
      }
      case 'space': {
        // round glass astronaut helmet with a white rim: the head shows through the glass
        const inside = (x: number, y: number) => ((x + 0.5 - 8) / 6) ** 2 + ((y + 0.5 - 5.5 - bob) / 5.5) ** 2 <= 1;
        for (let y = 0; y < 10 + bob; y++) for (let x = 0; x < CHAR_W; x++) if (!inside(x, y)) p.clear(x, y, 1, 1); // hair stays inside
        for (let y = 0; y < 11 + bob; y++)
          for (let x = 2; x < 14; x++) {
            if (!inside(x, y)) continue;
            const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
            p.px(x, y, edge ? 'rgba(226,242,255,0.92)' : 'rgba(150,205,255,0.3)');
          }
        p.px(4, 2 + bob, 'rgba(255,255,255,0.9)').px(3, 3 + bob, 'rgba(255,255,255,0.9)').px(3, 4 + bob, 'rgba(255,255,255,0.7)');
        p.rect(2, 10 + bob, 12, 1, C).rect(2, 11 + bob, 12, 1, shade(C, 0.72));
        break;
      }
      case 'frog': {
        // green frog hat with two big eyes on top (no hair peeking out between them)
        const pal = { G: C, D: shade(C, 0.72), W: '#ffffff', K: OUTLINE };
        p.clear(hx - 1, hy - 2, 10, 1);
        if (dir === 'down') p.tpl(0, hy - 2, ['...GGG....GGG...', '..GWWWGGGGWWWG..', '..GWKWGGGGWKWG..', '..GGGGGGGGGGGG..', '...DDDDDDDDDD...'], pal);
        else if (dir === 'up') p.tpl(0, hy - 2, ['...GGG....GGG...', '..GGGGGGGGGGGG..', '..GGGGGGGGGGGG..', '..GGGGGGGGGGGG..', '...DDDDDDDDDD...'], pal);
        else p.tpl(0, hy - 2, ['....GG...GGG....', '...GGGGGGWWWG...', '...GGGGGGWWKG...', '..GGGGGGGGGGGG..', '..DDDDDDDDDDD...'], pal);
        break;
      }
      case 'dino': {
        // green dino hood with orange spikes, and a row of white teeth over the forehead
        const pal = { G: C, D: shade(C, 0.75), O: '#f08a2a', W: '#ffffff' };
        p.clear(hx - 1, hy - 2, 10, 1);
        if (dir === 'down')
          p.tpl(0, hy - 2, ['.....O.OO.O.....', '...GGOGOOGOGG...', '..GGGGGGGGGGGG..', '..GGGGGGGGGGGG..', '..GGWGW..WGWGG..', '..GG........GG..', '..GG........GG..', '..GG........GG..', '..DG........GD..', '..DD........DD..'], pal);
        else if (dir === 'up')
          p.tpl(0, hy - 2, ['.......OO.......', '...GGGOOOOGGG...', '..GGGGGGGGGGGG..', '..GGGGGOOGGGGG..', '..GGGGOOOOGGGG..', '..GGGGGGGGGGGG..', '..GGGGGOOGGGGG..', '..GGGGOOOOGGGG..', '..GGGGGGGGGGGG..', '..DDDDDDDDDDDD..'], pal);
        else
          p.tpl(0, hy - 2, ['....O..O..O.....', '...GOGGOGGOGG...', '..OGGGGGGGGGGG..', '..GGGGGGGGGGGGG.', '.OGGGG.W.W.W.W..', '..GGGG..........', '.OGGGG..........', '..GGGG..........', '..GGGG..........', '..DDDD..........'], pal);
        break;
      }
      default:
        drawNorseHat(p, l.hat.style, C, dir, hx, hy);
    }
  }
  p.ctx.setTransform(1, 0, 0, 1, 0, 0);
  return p.outline('#2a2420');
}

// ---------------------------------------------------------------------------
// Norse clothes: the dungeons' classes wear them all the time, and the bosses drop them
// ---------------------------------------------------------------------------

/** Mail, a bear's pelt, a long cloak or a tabard over mail (rows 10..17; a robe is a dress, see drawDressPixel). */
function drawNorseShirt(p: Px, style: string, c: string, dir: Dir, frame: number): void {
  const side = dir === 'right';
  const L = shade(c, 1.22);
  const D = shade(c, 0.74);
  /** Little rings in two tones over a box. */
  const mail = (m: string, x0: number, y0: number, w: number, h: number) => {
    const ml = shade(m, 1.24);
    const md = shade(m, 0.8);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) p.px(x, y, (x + y) % 2 === 0 ? ml : (x + y * 3) % 4 === 1 ? md : m);
  };
  const sleeves = (col: string) => (side ? p.rect(6, 11, 3, 5, col) : p.rect(2, 11, 2, 5, col).rect(12, 11, 2, 5, col));
  switch (style) {
    case 'chainmail':
    case 'tabard': {
      // a shirt of rings with a short skirt of it over the legs, a leather belt
      const m = style === 'chainmail' ? c : '#a4acb6';
      mail(m, 3, 10, 10, 7);
      if (side) mail(m, 6, 11, 3, 5);
      else {
        mail(m, 2, 11, 2, 5);
        mail(m, 12, 11, 2, 5);
      }
      for (let x = side ? 5 : 3; x < (side ? 12 : 13); x++) p.px(x, 17, x % 2 ? shade(m, 0.7) : m);
      p.rect(side ? 5 : 3, 10, side ? 6 : 10, 1, shade(m, 0.7));
      if (style === 'chainmail') {
        p.rect(3, 15, 10, 1, '#5a3a22');
        if (dir === 'down') p.rect(7, 15, 2, 1, '#e8c040');
        break;
      }
      // Väktarrustning: a tabard in the class's colour with a shield on the chest, steel on the shoulders
      if (dir === 'up') {
        p.rect(4, 10, 8, 8, c).rect(4, 10, 8, 1, L).rect(11, 11, 1, 7, D).rect(7, 11, 2, 7, L);
      } else if (side) {
        p.rect(8, 10, 4, 8, c).rect(8, 10, 4, 1, L).rect(11, 11, 1, 7, D);
        p.rect(9, 12, 2, 2, '#f2c84a').px(9, 12, '#fff2b0');
      } else {
        p.rect(4, 10, 8, 9, c).rect(4, 10, 8, 1, L).rect(11, 11, 1, 8, D).rect(4, 18, 8, 1, D);
        // the shield: a gold rim round a white field with a blue boss
        p.rect(6, 11, 4, 4, '#f2c84a').rect(7, 12, 2, 2, '#f4f0e6').px(7, 12, '#ffffff').px(8, 13, c).px(6, 11, '#fff2b0');
      }
      p.rect(side ? 5 : 3, 15, side ? 7 : 10, 1, '#4a3020');
      if (dir === 'down') p.rect(7, 15, 2, 1, '#e8c040');
      // pauldrons
      const steel = '#c4ccd6';
      if (side) p.rect(5, 10, 5, 2, steel).rect(5, 11, 5, 1, '#8a94a4').px(5, 10, '#ffffff');
      else p.rect(1, 10, 4, 2, steel).rect(11, 10, 4, 2, steel).rect(1, 11, 4, 1, '#8a94a4').rect(11, 11, 4, 1, '#8a94a4').px(1, 10, '#ffffff').px(11, 10, '#ffffff');
      break;
    }
    case 'bearpelt': {
      // a leather tunic, and a bear's pelt over the shoulders: shaggy, its paws hanging over the chest; from behind
      // it covers the back, the bear's little ears peeking up at the neck
      const tunic = '#6a4a30';
      p.rect(3, 10, 10, 7, tunic).rect(3, 16, 10, 1, '#4a3020');
      sleeves('#5a3e28');
      p.rect(3, 15, 10, 1, '#3a2418');
      const shag = (x: number, y: number) => ((x * 7 + y * 3) % 5 === 0 ? L : (x + y) % 3 === 0 ? D : c);
      if (dir === 'up') {
        for (let y = 9; y < 19; y++) for (let x = 2; x < 14; x++) if (y < 18 || x % 2 === 0) p.px(x, y, shag(x, y));
        p.rect(3, 8, 2, 2, c).rect(11, 8, 2, 2, c).px(3, 8, L).px(11, 8, L).px(4, 9, D).px(12, 9, D);
      } else if (side) {
        for (let y = 9; y < 17; y++) for (let x = 2; x < 9 - (y > 13 ? 1 : 0); x++) if (y < 16 || x % 2 === 0) p.px(x, y, shag(x, y));
        p.rect(8, 12, 2, 3, c).px(8, 15, '#f4f0e6').px(9, 15, '#f4f0e6');
      } else {
        for (let y = 9; y < 13; y++) for (let x = 1; x < 15; x++) if (y < 12 || x % 2 === 1) p.px(x, y, shag(x, y));
        for (const px of [3, 11]) p.rect(px, 12, 2, 3, c).px(px, 12, L).px(px, 15, '#f4f0e6').px(px + 1, 15, '#f4f0e6');
      }
      break;
    }
    case 'cloak': {
      // Odens mantel: a long dark cloak clasped at the neck with gold, a linen tunic under it; from behind a raven
      const tunic = '#8e8678';
      p.rect(3, 10, 10, 7, tunic).rect(3, 16, 10, 1, shade(tunic, 0.8));
      sleeves(shade(tunic, 0.85));
      p.rect(3, 15, 10, 1, '#4a3020');
      const sway = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      if (dir === 'up') {
        p.rect(2, 10, 12, 11, c).rect(2, 10, 12, 1, L).rect(13, 11, 1, 10, D).rect(5, 12, 1, 9, D).rect(10, 12, 1, 9, D);
        for (let x = 2; x < 14; x += 2) p.px(x, 21, c);
        // the raven
        p.tpl(5, 13, ['..##..', '.####.', '######', '#.##.#', '..##..'], { '#': '#14121a' }).px(8, 14, '#ffffff');
      } else if (side) {
        for (let y = 10; y < 22; y++) {
          const back = y > 15 ? sway * (y > 18 ? 2 : 1) : 0;
          p.rect(1 - back, y, 4, 1, y === 10 ? L : (y + back) % 4 === 0 ? D : c);
        }
        p.rect(4, 10, 4, 2, c).px(7, 11, '#f2c84a');
      } else {
        p.rect(1, 10, 3, 11, c).rect(12, 10, 3, 11, c).rect(1, 10, 14, 2, c).rect(1, 10, 14, 1, L).rect(14, 11, 1, 10, D).rect(1, 11, 1, 10, L);
        for (const x of [1, 13]) p.px(x + sway, 21, c);
        p.rect(7, 10, 2, 2, '#f2c84a').px(7, 10, '#fff2b0');
        p.rect(2, 16, 1, 1, tunic).rect(13, 16, 1, 1, tunic);
      }
      break;
    }
    case 'robe': {
      // wide bell sleeves with pale cuffs (the rest of the robe is drawn like a dress)
      if (side) p.rect(5, 11, 4, 5, D).rect(5, 15, 4, 1, L);
      else p.rect(1, 11, 3, 5, D).rect(12, 11, 3, 5, D).rect(1, 15, 3, 1, L).rect(12, 15, 3, 1, L);
      p.rect(side ? 6 : 5, 10, side ? 5 : 6, 1, L);
      break;
    }
  }
}

/** The Norse hats (the head's top-left at hx, hy; HEADROOM rows above the frame are free for them). */
function drawNorseHat(p: Px, style: string, C: string, dir: Dir, hx: number, hy: number): void {
  const Cd = shade(C, 0.72);
  const Cl = shade(C, 1.28);
  const side = dir === 'right';
  /** A round helmet over the top of the head down to the brow, lit on the left. */
  const dome = (col: string, lit: string, dark: string) => {
    p.rect(hx + 2, hy - 4, 4, 1, col).rect(hx, hy - 3, 8, 1, col).rect(hx - 1, hy - 2, 10, 4, col);
    p.rect(hx - 1, hy - 2, 2, 4, lit).rect(hx, hy - 3, 2, 1, lit).rect(hx + 2, hy - 4, 1, 1, lit).rect(hx + 7, hy - 2, 2, 4, dark);
  };
  switch (style) {
    case 'nasal': {
      // Väktarhjälm: a steel helmet with a raised ridge, a brow band with rivets, a nose guard and a short blue crest;
      // a mail curtain at the back of the neck
      const B = '#4f8fe8';
      p.rect(hx + 2, hy - 6, 4, 2, B).rect(hx + 3, hy - 7, 3, 1, B).px(hx + 3, hy - 6, '#9ac0ff').px(hx + 5, hy - 5, '#2a5ab0');
      dome(C, Cl, Cd);
      p.rect(hx + 3, hy - 4, 2, 6, Cl).px(hx + 4, hy - 3, '#ffffff');
      p.rect(hx - 1, hy + 2, 10, 1, Cd);
      const mail = (x0: number, w: number) => {
        for (let y = hy + 3; y < hy + 7; y++) for (let x = x0; x < x0 + w; x++) p.px(x, y, (x + y) % 2 === 0 ? '#8e98a8' : '#5c6676');
      };
      if (dir === 'down') {
        p.px(hx, hy + 2, Cl).px(hx + 7, hy + 2, Cl).px(hx + 2, hy + 2, Cl).px(hx + 5, hy + 2, Cl);
        p.rect(hx + 3, hy + 3, 2, 3, C).px(hx + 3, hy + 3, Cl).px(hx + 4, hy + 5, Cd);
      } else if (side) {
        mail(hx - 1, 3);
        p.rect(hx + 7, hy + 2, 2, 3, C).px(hx + 8, hy + 4, Cd).px(hx + 7, hy + 2, Cl);
      } else mail(hx - 1, 10);
      break;
    }
    case 'circlet': {
      // Völvans krans: a band of gold with little runes cut into it and leaves twined round, a green stone at the front
      const leaf = '#4fae5a';
      const leafL = '#8ae08a';
      p.rect(hx - 1, hy, 10, 2, C).rect(hx - 1, hy + 1, 10, 1, Cd).px(hx - 1, hy, Cl);
      for (const x of [hx + 1, hx + 3, hx + 6]) p.px(x, hy + 1, shade(C, 0.5));
      const leaves: [number, number][] = side ? [[hx, hy - 1], [hx + 3, hy - 1], [hx + 6, hy - 1]] : [[hx - 1, hy - 1], [hx + 2, hy - 1], [hx + 5, hy - 1], [hx + 8, hy - 1]];
      for (const [x, y] of leaves) p.px(x, y, leaf).px(x + 1, y, leafL);
      if (dir === 'down') p.rect(hx + 3, hy - 1, 2, 2, '#5fd38d').px(hx + 3, hy - 1, '#d8ffe4').px(hx + 4, hy, '#2e9a5a');
      if (side) p.rect(hx + 7, hy - 1, 2, 2, '#5fd38d').px(hx + 7, hy - 1, '#d8ffe4');
      break;
    }
    case 'runehat': {
      // Runhatt: a tall pointed hat with a broad brim, its tip flopping over, runes glowing on it
      const glow = '#ffe27a';
      const glow2 = '#9ae8ff';
      const lean = side ? -1 : 1;
      // the cone, narrowing to the tip (each row: its left x and width)
      const cone: [number, number, number][] = [
        [hy - 1, hx, 8],
        [hy - 2, hx + 1, 6],
        [hy - 3, hx + 1, 6],
        [hy - 4, hx + 2, 4],
        [hy - 5, hx + 2, 4],
        [hy - 6, hx + 3, 3],
        [hy - 7, hx + 3 + lean, 2],
        [hy - 8, hx + 4 + lean * 2, 2],
        [hy - 9, hx + 5 + lean * 3, 1],
      ];
      for (const [y, x, w] of cone) p.rect(x, y, w, 1, C).px(x, y, Cl).px(x + w - 1, y, Cd);
      p.px(hx + 5 + lean * 3 + (lean > 0 ? 1 : -1), hy - 9, glow);
      // the band and its rune, the brim
      p.rect(hx, hy - 1, 8, 1, Cd);
      p.rect(side ? hx - 1 : hx - 3, hy, side ? 13 : 14, 2, C).rect(side ? hx - 1 : hx - 3, hy + 1, side ? 13 : 14, 1, Cd).px(side ? hx - 1 : hx - 3, hy, Cl);
      if (dir !== 'up') p.px(hx + 3, hy - 1, glow).px(hx + 4, hy - 1, glow2);
      p.px(hx + 3, hy - 4, glow).px(hx + 4, hy - 5, glow2).px(hx + 2, hy - 2, glow2).px(hx + 5, hy - 3, glow);
      break;
    }
    case 'valkyrie': {
      // Valkyriahjälm: a round silver helmet with a gold brow band and a white wing on each side
      dome(C, Cl, Cd);
      p.rect(hx - 1, hy + 1, 10, 1, '#d8a830').px(hx + 3, hy + 1, '#fff2b0');
      const W = '#ffffff';
      const Wd = '#c8d4e2';
      const wing = (x: number, dx: number) => {
        // feathers fanning up and out from the side of the helmet
        for (let i = 0; i < 6; i++) {
          const y = hy + 1 - i;
          const w = i < 4 ? 2 : 1;
          p.rect(x + dx * Math.floor(i / 2) - (dx < 0 ? w - 1 : 0), y, w, 1, i % 2 ? W : Wd);
        }
        p.px(x + dx * 3, hy - 5, W).px(x + dx * 2, hy - 6, Wd);
      };
      if (side) wing(hx + 1, -1);
      else {
        wing(hx - 2, -1);
        wing(hx + 9, 1);
      }
      break;
    }
    case 'wanderer': {
      // Odens hatt: a wanderer's hat with a wide floppy brim and a dented crown, a raven's feather in the band
      p.rect(hx, hy - 4, 8, 4, C).rect(hx + 1, hy - 5, 2, 1, C).rect(hx + 5, hy - 5, 2, 1, C).px(hx + 3, hy - 4, Cd).px(hx + 4, hy - 4, Cd);
      p.rect(hx, hy - 4, 2, 4, Cl).rect(hx + 6, hy - 4, 2, 4, Cd);
      p.rect(hx, hy - 1, 8, 1, '#5a4030');
      if (side) {
        p.rect(hx - 2, hy, 15, 1, C).rect(hx - 2, hy + 1, 15, 1, Cd).px(hx + 12, hy + 2, Cd).px(hx - 2, hy + 2, Cd);
        p.px(hx, hy - 3, '#14121a').px(hx - 1, hy - 4, '#14121a').px(hx - 1, hy - 5, '#3a3a52');
      } else {
        p.rect(hx - 4, hy, 16, 1, C).rect(hx - 3, hy + 1, 14, 1, Cd).px(hx - 4, hy + 1, Cd).px(hx + 11, hy + 1, Cd).px(hx - 4, hy, Cl);
        p.px(hx + 7, hy - 3, '#14121a').px(hx + 8, hy - 4, '#14121a').px(hx + 8, hy - 5, '#3a3a52');
      }
      break;
    }
    case 'draugcrown': {
      // Draugkrona: an old crown gone grey-green, its points uneven and one bent, a stone glowing ghostly green
      const rust = '#7a6a50';
      p.rect(hx - 1, hy - 1, 10, 3, C).rect(hx - 1, hy + 1, 10, 1, Cd).rect(hx - 1, hy - 1, 10, 1, Cl);
      const points: [number, number][] = side ? [[hx, 3], [hx + 3, 2], [hx + 6, 3]] : [[hx - 1, 3], [hx + 2, 2], [hx + 5, 3], [hx + 8, 2]];
      points.forEach(([x, h], i) => p.rect(x, hy - 1 - h, 1, h, i === 1 ? Cd : C).px(x, hy - 1 - h, Cl));
      if (!side) p.px(hx + 3, hy - 3, Cd);
      p.px(hx + 1, hy + 1, rust).px(hx + 6, hy, rust);
      if (dir === 'down') p.rect(hx + 3, hy, 2, 1, '#9cff8a').px(hx + 3, hy, '#e8ffd8').px(hx, hy, '#3a5a3a').px(hx + 7, hy, '#3a5a3a');
      if (side) p.rect(hx + 7, hy, 2, 1, '#9cff8a').px(hx + 8, hy, '#e8ffd8');
      break;
    }
    case 'seacrown':
    case 'crown_sea': {
      // Sjökrona: a band of sea-green with coral branching up from it, a pearl at the front
      const coral = '#f07a8a';
      const coralL = '#ffc0c0';
      p.rect(hx - 1, hy, 10, 2, C).rect(hx - 1, hy + 1, 10, 1, Cd).px(hx - 1, hy, Cl);
      const points: [number, number][] = side ? [[hx, 3], [hx + 3, 4], [hx + 6, 3]] : [[hx - 1, 3], [hx + 2, 4], [hx + 5, 4], [hx + 8, 3]];
      for (const [x, h] of points) {
        p.rect(x, hy - h, 1, h, coral).px(x, hy - h, coralL);
        p.px(x + (x < hx + 4 ? -1 : 1), hy - h + 1, coral);
      }
      if (dir === 'down') p.rect(hx + 3, hy - 1, 2, 2, '#ffffff').px(hx + 4, hy, '#d8d0e8');
      if (side) p.rect(hx + 7, hy - 1, 2, 2, '#ffffff').px(hx + 8, hy, '#d8d0e8');
      for (const x of [hx, hx + 6]) p.px(x, hy + 1, '#ffffff');
      break;
    }
    case 'elfcrown': {
      // Alvkrona: a thin silver circlet whose points grow into leaves, the middle ones tallest, a violet stone in front
      const leaf = '#9ae0a0';
      p.rect(hx - 1, hy, 10, 1, C).px(hx - 1, hy, Cl).rect(hx - 1, hy + 1, 10, 1, Cd);
      const points: [number, number][] = side ? [[hx + 1, 2], [hx + 4, 4], [hx + 7, 2]] : [[hx, 2], [hx + 3, 4], [hx + 4, 4], [hx + 7, 2]];
      for (const [x, h] of points) p.rect(x, hy - h, 1, h, C).px(x, hy - h, leaf).px(x + (x < hx + 4 ? -1 : 1), hy - h, leaf);
      if (dir === 'down') p.rect(hx + 3, hy, 2, 1, '#b06ef0').px(hx + 3, hy, '#e8c8ff');
      if (side) p.rect(hx + 7, hy, 2, 1, '#b06ef0');
      break;
    }
    case 'wolfhood': {
      // Ulvhuva: a grey wolf's head worn as a hood, its ears up, its snout over your brow, the pelt down your back
      const pal = { G: C, D: Cd, S: Cl, E: shade(C, 0.55), K: '#14121a', N: '#14121a', W: '#ffffff', P: '#e8a0a8' };
      if (dir === 'down')
        p.tpl(0, hy - 4, ['...EE......EE...', '..EPGGGGGGGGPE..', '..GGGGGGGGGGGG..', '..GGKGGSSGGKGG..', '..GGDGSSSSGDGG..', '..GG..WNNW..GG..', '..GG........GG..', '..GG........GG..', '..GG........GG..', '..DG........GD..', '..DD........DD..'], pal);
      else if (dir === 'up')
        p.tpl(0, hy - 4, ['...EE......EE...', '..EGGGGGGGGGGE..', '..GGGGGGGGGGGG..', '..GGGGGSSGGGGG..', '..GGGGGGGGGGGG..', '..GGGGGSGGGGGG..', '..GGGGGGGGGGGG..', '..GGGGGGSGGGGG..', '..GGGGGGGGGGGG..', '..DGGGGGGGGGGD..', '..DDDDDDDDDDDD..'], pal);
      else
        p.tpl(0, hy - 4, ['.....E..........', '....EPGG........', '...GGGGGGGG.....', '..GGGGGKGGGG....', '..GGGGGGGSSSSN..', '..GGGG...WW.....', '..GGGG..........', '..GGGG..........', '..GGGG..........', '..DGGD..........', '..DDDD..........'], pal);
      break;
    }
    case 'horns': {
      // Lokes horn: a dark green cap with a gold band and two great horns curling up and out, trickster-style
      dome('#2e7a3a', '#5fd38d', '#1e5a2a');
      p.rect(hx - 1, hy + 1, 10, 1, '#d8a830').px(hx + 3, hy + 1, '#fff2b0');
      const horn = (x0: number, dx: number) => {
        const pts: [number, number][] = [[0, 0], [1, 0], [1, -1], [2, -1], [2, -2], [2, -3], [2, -4], [1, -5], [1, -6]];
        pts.forEach(([ox, oy], i) => p.px(x0 + dx * ox, hy - 1 + oy, i > 6 ? Cl : i % 2 ? C : Cd));
        p.px(x0 + dx * 3, hy - 3, Cd).px(x0 + dx * 3, hy - 2, Cd);
      };
      if (side) horn(hx + 2, -1);
      else {
        horn(hx - 1, -1);
        horn(hx + 8, 1);
      }
      break;
    }
    default: {
      // a hat style this drawing does not know: a plain cap, so it never shows as nothing
      p.rect(hx - 1, hy - 2, 10, 3, C).rect(hx, hy - 3, 8, 1, C).rect(hx - 1, hy + 1, 10, 1, Cd);
    }
  }
}

/** Sprite sheet of 9 frames (3 dirs x 3 frames). */
export function drawCharacterSheet(l: Look): HTMLCanvasElement {
  const sheet = new Px(CHAR_W * 9, CHAR_H);
  DIRS.forEach((dir, di) => {
    for (let f = 0; f < 3; f++) sheet.blit(drawCharacter(l, dir, f), (di * 3 + f) * CHAR_W, 0);
  });
  return sheet.canvas;
}

export const frameIndex = (dir: Dir, frame: number): number => DIRS.indexOf(dir) * 3 + frame;

/** Portrait data URL (down-facing, scaled). */
export function portrait(l: Look, scale = 4): string {
  const f = drawCharacter(l, 'down', 0);
  const p = new Px(CHAR_W * scale, CHAR_H * scale).blitScaled(f, 0, 0, CHAR_W * scale, CHAR_H * scale);
  return p.dataUrl();
}
