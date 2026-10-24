// Layered, tintable 16x24 characters: body, hair, shirt, pants, shoes, hat.
// Directions: down, up, right (left is right flipped). Frames: 0 stand, 1/2 walk.
import { ITEMS, type Appearance, type Facing, type Outfit } from '@lilla-garden/shared';
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';

export type Dir = 'down' | 'up' | 'right';
export const DIRS: Dir[] = ['down', 'up', 'right'];
export const CHAR_W = 16;
export const CHAR_H = 24;

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

/** Draws one 16x24 frame. */
export function drawCharacter(l: Look, dir: Dir, frame: number): Px {
  const p = new Px(CHAR_W, CHAR_H);
  const skinD = shade(l.skin, 0.8);
  const legOff = frame === 0 ? [0, 0] : frame === 1 ? [-1, 1] : [1, -1]; // leg length deltas (walk)
  const bob = frame === 0 ? 0 : 0; // keep head steady for crisp pixels

  // --- legs & shoes (rows 17..23) ---
  const pantsC = l.pants.color;
  const pantsD = shade(pantsC, 0.75);
  const shoeC = l.shoes.color;
  const shoeL = shade(shoeC, 1.3);
  if (dir === 'right') {
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
  if (l.pants.style === 'skirt') {
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
  const style = l.hairStyle;
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
      case 'bunny':
        p.rect(hx - 1, hy - 2, 10, 2, C).rect(hx, hy - 8, 2, 6, C).rect(hx + 6, hy - 8, 2, 6, C).rect(hx, hy - 7, 1, 4, '#ffb0c8').rect(hx + 7, hy - 7, 1, 4, '#ffb0c8');
        break;
    }
  }
  return p.outline(OUTLINE);
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
