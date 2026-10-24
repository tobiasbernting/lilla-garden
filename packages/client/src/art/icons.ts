// 16x16 item icons for the hotbar and menus.
import { ITEMS, type ItemDef } from '@lilla-garden/shared';
import { drawAnimal } from './animals.js';
import { drawCharacter } from './characters.js';
import { Px, shade } from './px.js';
import { OUTLINE, PAINT_COLORS, type ObjectArt } from './world.js';

const WOOD = '#9a6a3a';
const WOOD_D = '#6f4a26';
const WOOD_L = '#c58f55';
const STEEL = '#b8bcc4';
const STEEL_D = '#7d828c';

const tool = (kind: string): Px => {
  const p = new Px(16, 16);
  switch (kind) {
    case 'hoe':
      p.line(3, 13, 11, 5, WOOD).line(4, 13, 12, 5, WOOD_D).rect(10, 2, 4, 3, STEEL).rect(12, 5, 2, 3, STEEL).rect(10, 2, 4, 1, '#e0e3e8');
      break;
    case 'can':
      p.rect(3, 6, 8, 8, '#4f86d6').rect(3, 6, 8, 1, '#8fb8ee').rect(10, 4, 4, 2, '#4f86d6').rect(13, 3, 2, 3, '#4f86d6').rect(5, 3, 4, 3, '#4f86d6').rect(6, 2, 2, 1, '#4f86d6').px(14, 2, '#8fd0f0');
      break;
    case 'axe':
      p.line(4, 13, 11, 6, WOOD).line(5, 13, 12, 6, WOOD_D).rect(9, 2, 5, 5, STEEL).rect(12, 2, 2, 7, STEEL).rect(9, 2, 5, 1, '#e0e3e8').rect(13, 4, 1, 3, STEEL_D);
      break;
    case 'pick':
      p.line(4, 13, 11, 6, WOOD).line(5, 13, 12, 6, WOOD_D).rect(7, 2, 8, 2, STEEL).rect(6, 3, 2, 3, STEEL).rect(13, 4, 2, 3, STEEL).rect(7, 2, 8, 1, '#e0e3e8');
      break;
    case 'scythe':
      p.line(3, 14, 9, 5, WOOD).line(4, 14, 10, 5, WOOD_D).rect(4, 2, 10, 2, STEEL).rect(3, 3, 2, 3, STEEL).rect(13, 4, 1, 2, STEEL).rect(4, 2, 10, 1, '#e0e3e8');
      break;
    case 'hammer':
      p.rect(7, 6, 2, 9, WOOD).rect(8, 6, 1, 9, WOOD_D).rect(4, 2, 8, 5, STEEL_D).rect(4, 2, 8, 2, STEEL).rect(4, 2, 8, 1, '#e0e3e8');
      break;
    case 'sword':
      p.line(3, 13, 11, 5, STEEL).line(4, 13, 12, 5, '#e0e3e8').line(3, 12, 11, 4, STEEL_D).rect(2, 11, 2, 2, WOOD_D).rect(1, 13, 3, 2, WOOD).rect(4, 9, 2, 2, '#f2d35a').rect(2, 9, 2, 1, '#f2d35a').rect(5, 11, 1, 2, '#f2d35a');
      break;
    case 'shield':
      p.rect(3, 2, 10, 8, '#3b6fd9').rect(4, 10, 8, 2, '#3b6fd9').rect(5, 12, 6, 1, '#3b6fd9').rect(7, 13, 2, 1, '#3b6fd9').rect(7, 2, 2, 11, '#f2d35a').rect(3, 6, 10, 1, '#f2d35a').rect(3, 2, 10, 1, '#8fb8ee');
      break;
    case 'bow':
      p.line(4, 1, 11, 7, WOOD).line(11, 7, 4, 14, WOOD).line(4, 1, 4, 14, '#d8d8d8').rect(5, 7, 7, 1, WOOD_L).rect(12, 6, 2, 3, '#e04a2a');
      break;
    case 'bazooka':
      p.rect(1, 6, 13, 4, '#4f6b3a').rect(1, 6, 13, 1, '#7a9a5a').rect(1, 9, 13, 1, '#2f4a24').rect(13, 5, 3, 6, '#3a4a30').rect(14, 6, 1, 4, '#1a1a1a').rect(0, 5, 2, 6, '#3a4a30').rect(5, 10, 3, 3, WOOD_D).rect(9, 10, 2, 3, WOOD_D).rect(3, 4, 5, 2, '#d8d8d8').rect(4, 3, 3, 1, '#d8d8d8');
      break;
    case 'rod':
      p.line(2, 14, 12, 2, WOOD).line(3, 14, 13, 2, WOOD_D).line(12, 2, 14, 9, '#d8d8d8').rect(13, 9, 2, 2, '#d8d8d8').rect(12, 11, 2, 2, '#e04a2a');
      break;
    case 'lasso':
      // a rope loop with the coiled end
      p.circle(6, 7, 5.5, WOOD_L).circle(6, 7, 4.5, WOOD_D);
      p.ctx.clearRect(3, 4, 6, 6);
      p.rect(10, 9, 5, 2, WOOD_L).rect(13, 7, 2, 2, WOOD_L).rect(14, 5, 1, 2, WOOD_L).rect(11, 10, 3, 1, WOOD_D);
      break;
    case 'fur':
      p.ellipse(1, 4, 14, 9, '#8a5a2a').ellipse(3, 3, 10, 7, '#a9784a').rect(2, 10, 2, 3, '#8a5a2a').rect(12, 10, 2, 3, '#8a5a2a').rect(6, 2, 4, 2, '#8a5a2a').px(4, 6, '#c58f55').px(9, 7, '#c58f55');
      break;
    case 'brush':
      p.rect(6, 1, 4, 7, WOOD).rect(9, 1, 1, 7, WOOD_D).rect(3, 8, 10, 4, '#d8363a').rect(3, 12, 10, 3, '#e6c15a');
      for (let x = 3; x < 13; x += 2) p.rect(x, 12, 1, 3, '#cfa84a');
      break;
  }
  return p.outline(OUTLINE);
};

const seedPacket = (color: string): Px => {
  const p = new Px(16, 16).rect(3, 2, 10, 12, '#f0e4c8').rect(3, 2, 10, 2, color).rect(3, 13, 10, 1, '#d8ccb0');
  p.rect(6, 6, 4, 4, color).px(7, 7, shade(color, 1.4)).rect(5, 11, 6, 1, '#b8a888');
  return p.outline(OUTLINE);
};

const produce = (id: string): Px => {
  const p = new Px(16, 16);
  switch (id) {
    case 'carrot':
      p.rect(6, 5, 4, 3, '#f08a2a').rect(6, 8, 4, 3, '#f08a2a').rect(7, 11, 2, 2, '#e07a1e').px(7, 13, '#c96a14').rect(5, 2, 2, 3, '#3f8a2e').rect(8, 1, 2, 4, '#3f8a2e').px(10, 3, '#3f8a2e').px(6, 6, '#ffb070');
      break;
    case 'potato':
      p.ellipse(2, 4, 12, 9, '#c9a36a').px(5, 7, '#9a7a4a').px(10, 9, '#9a7a4a').px(7, 10, '#9a7a4a').rect(4, 5, 3, 1, '#e0c08a');
      break;
    case 'strawberry':
      p.tpl(3, 2, ['..###..', '.#####.', '#######', '#######', '.#####.', '..###..', '...#...'], { '#': '#e03a3a' }).rect(5, 1, 2, 2, '#3f8a2e').rect(8, 1, 2, 2, '#3f8a2e').rect(6, 0, 3, 1, '#3f8a2e').px(5, 4, '#ffffff').px(8, 5, '#ffffff').px(6, 7, '#ffffff');
      break;
    case 'tomato':
      p.circle(8, 9, 5, '#e04a2a').px(6, 7, '#ff9a7a').rect(7, 3, 2, 2, '#3f8a2e').rect(5, 4, 6, 1, '#3f8a2e');
      break;
    case 'pumpkin':
      p.ellipse(1, 4, 14, 11, '#d8631a').ellipse(2, 5, 12, 9, '#f08a2a').rect(7, 5, 1, 9, '#d8631a').rect(4, 6, 1, 7, '#d8631a').rect(11, 6, 1, 7, '#d8631a').rect(7, 2, 2, 3, '#3f8a2e');
      break;
    case 'sunflower':
      p.circle(8, 7, 6, '#f5d94a').circle(8, 7, 3, '#6f4a26').rect(7, 13, 2, 3, '#3f8a2e');
      break;
    case 'wheat':
      for (const x of [4, 8, 12]) p.rect(x, 7, 1, 8, '#9ab84a').rect(x - 1, 2, 3, 5, '#e6c15a').px(x, 1, '#e6c15a');
      break;
    case 'wood':
      p.rect(2, 5, 12, 6, WOOD).rect(2, 5, 12, 1, WOOD_L).rect(2, 10, 12, 1, WOOD_D).ellipse(0, 5, 4, 6, WOOD_L).px(1, 7, WOOD_D);
      break;
    case 'stone':
      p.ellipse(2, 4, 12, 9, '#6f6c66').ellipse(3, 3, 10, 8, '#9d9a92').rect(5, 5, 3, 2, '#c9c6bd');
      break;
    case 'paper':
      p.rect(3, 1, 10, 14, '#f6efdc').rect(3, 1, 10, 1, '#ffffff').rect(10, 1, 3, 3, '#e3d7b8').rect(5, 5, 6, 1, '#b9b0a0').rect(5, 8, 6, 1, '#b9b0a0').rect(5, 11, 4, 1, '#b9b0a0');
      break;
    case 'fiber':
      for (let i = 0; i < 5; i++) p.line(3 + i * 2, 14, 5 + i * 2 - (i % 2) * 3, 3 + (i % 3), '#9ab84a');
      break;
    case 'hay':
      p.rect(2, 5, 12, 8, '#e6c15a').rect(2, 5, 12, 1, '#f5dd8a').rect(5, 5, 1, 8, '#b8933a').rect(10, 5, 1, 8, '#b8933a').rect(2, 12, 12, 1, '#b8933a');
      break;
    case 'egg':
      p.ellipse(4, 2, 8, 11, '#f7f0e0').px(6, 4, '#ffffff');
      break;
    case 'egg_pask':
      p.ellipse(4, 2, 8, 11, '#ffe14a').rect(4, 6, 8, 1, '#e87ab8').rect(5, 9, 6, 1, '#5aa0e8').px(7, 4, '#e87ab8').px(9, 4, '#e87ab8');
      break;
    case 'milk':
      p.rect(5, 4, 6, 10, '#ffffff').rect(5, 4, 6, 1, '#d8d8d8').rect(6, 2, 4, 2, '#d8d8d8').rect(5, 8, 6, 3, '#4f86d6');
      break;
    case 'pancakes':
      p.ellipse(1, 9, 14, 5, '#e0a050').ellipse(1, 6, 14, 5, '#e8b060').ellipse(1, 3, 14, 5, '#f0c070').rect(5, 2, 5, 3, '#f2d35a').rect(7, 1, 2, 2, '#e03a3a');
      break;
    case 'carrot_cake':
      p.rect(2, 7, 12, 7, '#c8924a').rect(2, 7, 12, 1, '#e0a860').rect(2, 4, 12, 3, '#f7f0e0').rect(6, 2, 3, 2, '#f08a2a').rect(5, 1, 1, 2, '#3f8a2e');
      break;
    case 'pumpkin_pie':
      p.ellipse(1, 6, 14, 8, '#c8924a').ellipse(2, 5, 12, 6, '#e8933a').rect(2, 7, 12, 1, '#c87a2a').ellipse(6, 3, 4, 3, '#ffffff');
      break;
    case 'strawberry_jam':
      p.rect(4, 4, 8, 11, '#e03a3a').rect(4, 4, 8, 1, '#ff7a7a').rect(3, 2, 10, 3, '#e6c15a').rect(6, 8, 4, 3, '#f7f0e0');
      break;
    case 'fish_soup':
      p.ellipse(1, 6, 14, 9, '#e0e0e0').ellipse(2, 5, 12, 5, '#e8a050').rect(5, 6, 3, 2, '#7aa060').rect(9, 5, 2, 2, '#f08a2a').rect(1, 9, 14, 1, '#b0b0b0');
      break;
    case 'bread':
      p.ellipse(1, 4, 14, 9, '#c8924a').ellipse(2, 3, 12, 6, '#e0b070').rect(5, 5, 2, 1, '#b07a3a').rect(9, 5, 2, 1, '#b07a3a');
      break;
    case 'mushroom':
      p.rect(6, 9, 4, 6, '#f0e4c8').rect(2, 4, 12, 5, '#d8363a').rect(3, 3, 10, 1, '#d8363a').px(5, 5, '#ffffff').px(10, 6, '#ffffff').px(8, 4, '#ffffff');
      break;
    case 'honey':
      p.rect(4, 4, 8, 10, '#f5a623').rect(4, 4, 8, 1, '#ffd45a').rect(3, 2, 10, 2, '#e6c15a').rect(5, 7, 6, 4, '#f7f0e0');
      break;
    case 'iceberry':
      [[4, 5], [9, 4], [6, 10], [11, 9]].forEach(([x, y]) => p.rect(x!, y!, 3, 3, '#8fd0f0').px(x!, y!, '#ffffff'));
      p.rect(7, 2, 2, 2, '#4a7a6a');
      break;
    case 'shell':
      p.ellipse(2, 5, 12, 8, '#f7d7c0').rect(5, 7, 1, 4, '#d8b8a0').rect(8, 6, 1, 6, '#d8b8a0').rect(11, 7, 1, 4, '#d8b8a0');
      break;
    case 'cactus_fruit':
      p.ellipse(4, 3, 8, 10, '#e87ab8').px(6, 5, '#ffb0d8').rect(7, 1, 2, 2, '#4f9a3a').px(5, 8, '#c45a98');
      break;
    case 'gold':
      p.circle(8, 8, 6, '#d9b53a').circle(8, 8, 5, '#f2d35a').rect(6, 5, 4, 1, '#fff2a0').rect(7, 6, 2, 5, '#d9b53a').rect(6, 10, 4, 1, '#d9b53a');
      break;
    case 'gem':
      p.tpl(2, 2, ['..######....', '.########...', '############', '.##########.', '..########..', '...######...', '....####....', '.....##.....'], { '#': '#4ad0ff' }).rect(5, 3, 3, 1, '#ffffff').rect(4, 4, 2, 2, '#d0f4ff');
      break;
    case 'heartberry':
      p.tpl(2, 3, ['.##..##.', '########', '########', '.######.', '..####..', '...##...'], { '#': '#e03a5a' }).px(4, 4, '#ff9ab0').rect(7, 1, 2, 2, '#3f8a2e');
      break;
    case 'rocket':
      p.rect(6, 2, 4, 9, '#d8d8d8').rect(6, 2, 1, 9, '#ffffff').rect(9, 2, 1, 9, '#a8a8a8').tpl(5, 0, ['..##..', '.####.'], { '#': '#e04a2a' }).rect(4, 9, 2, 4, '#e04a2a').rect(10, 9, 2, 4, '#e04a2a').rect(7, 11, 2, 2, '#ffb24a').px(7, 13, '#ffe66a').px(8, 14, '#ff6a2a');
      break;
    case 'wool':
      p.ellipse(2, 3, 12, 10, '#f7f3ee').ellipse(1, 6, 5, 5, '#f7f3ee').ellipse(10, 6, 5, 5, '#f7f3ee').px(7, 8, '#d8d4ce');
      break;
    default:
      p.rect(4, 4, 8, 8, '#ff00ff');
  }
  return p.outline(OUTLINE);
};

const fish = (id: string): Px => {
  const col = { fish_roach: '#a8b8c8', fish_perch: '#7aa060', fish_pike: '#6a8a4a', fish_gold: '#f5c23a' }[id] ?? '#8fa0b0';
  const p = new Px(16, 16).ellipse(2, 5, 10, 6, col).rect(11, 6, 2, 4, col).rect(12, 4, 2, 2, col).rect(12, 10, 2, 2, col).px(4, 7, OUTLINE).rect(5, 9, 4, 1, shade(col, 0.8));
  if (id === 'fish_perch') p.rect(5, 5, 1, 6, shade(col, 0.7)).rect(8, 5, 1, 6, shade(col, 0.7));
  if (id === 'fish_gold') p.px(6, 6, '#fff2a0');
  return p.outline(OUTLINE);
};

const clothingIcon = (d: ItemDef): Px => {
  const c = d.clothing!;
  const p = new Px(16, 16);
  const C = c.color;
  const D = shade(C, 0.75);
  switch (c.slot) {
    case 'shirt':
      p.rect(4, 3, 8, 10, C).rect(1, 3, 3, 5, C).rect(12, 3, 3, 5, C).rect(6, 2, 4, 1, D).rect(4, 12, 8, 1, D);
      if (c.style === 'stripes') for (let y = 5; y < 12; y += 2) p.rect(4, y, 8, 1, '#ffffff');
      if (c.style === 'overalls') p.rect(4, 3, 8, 10, '#f0e4c8').rect(6, 3, 4, 10, C).rect(5, 3, 1, 3, C).rect(10, 3, 1, 3, C);
      if (c.style === 'xmas') p.rect(4, 6, 8, 1, '#d8363a').rect(4, 8, 8, 1, '#ffffff');
      if (c.style === 'star') p.rect(7, 5, 2, 1, '#f5e04a').rect(6, 6, 4, 1, '#f5e04a').rect(7, 7, 2, 1, '#f5e04a').px(6, 8, '#f5e04a').px(9, 8, '#f5e04a');
      if (c.style === 'ghost') p.rect(4, 3, 8, 10, '#f4f4f4').rect(1, 3, 3, 5, '#f4f4f4').rect(12, 3, 3, 5, '#f4f4f4').rect(6, 6, 1, 2, OUTLINE).rect(9, 6, 1, 2, OUTLINE);
      break;
    case 'pants':
      if (c.style === 'skirt') p.rect(5, 2, 6, 3, C).rect(4, 5, 8, 3, C).rect(3, 8, 10, 5, C).rect(3, 12, 10, 1, D);
      else p.rect(4, 2, 8, 4, C).rect(4, 6, 3, 8, C).rect(9, 6, 3, 8, C).rect(6, 6, 1, 8, D).rect(11, 6, 1, 8, D);
      break;
    case 'shoes':
      p.rect(2, 7, 5, 6, C).rect(9, 7, 5, 6, C).rect(2, 12, 6, 2, D).rect(9, 12, 6, 2, D);
      if (c.style === 'boots') p.rect(3, 3, 4, 4, C).rect(9, 3, 4, 4, C);
      break;
    case 'hat': {
      const look = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'bald', shirt: { style: 'plain', color: '#888' }, pants: { style: 'plain', color: '#888' }, shoes: { style: 'plain', color: '#333' }, hat: { style: c.style, color: C } };
      const ch = drawCharacter(look, 'down', 0);
      // crop the head area (rows -? .. 12) into 16x16
      p.ctx.drawImage(ch.canvas, 0, 0, 16, 13, 0, 3, 16, 13);
      break;
    }
  }
  return p.outline(OUTLINE);
};

export function drawIcons(objects: Record<string, ObjectArt>): Record<string, Px> {
  const icons: Record<string, Px> = {};
  const seedColors: Record<string, string> = { carrot: '#f08a2a', potato: '#c9a36a', strawberry: '#e03a3a', tomato: '#e04a2a', pumpkin: '#f08a2a', sunflower: '#f5d94a', wheat: '#e6c15a' };
  for (const d of Object.values(ITEMS)) {
    let p: Px;
    switch (d.category) {
      case 'tool':
        p = tool(d.tool!);
        break;
      case 'seed':
        p = seedPacket(seedColors[d.crop!] ?? '#3f8a2e');
        break;
      case 'crop':
      case 'material':
      case 'feed':
      case 'animal_product':
        p = produce(d.id);
        break;
      case 'fish':
        p = fish(d.id);
        break;
      case 'animal': {
        const a = drawAnimal(d.species!, 0, false, false);
        p = new Px(16, 16);
        const s = Math.min(16 / a.w, 16 / a.h);
        const w = Math.round(a.w * s);
        const h = Math.round(a.h * s);
        p.blitScaled(a, Math.round((16 - w) / 2), 16 - h, w, h);
        break;
      }
      case 'clothing':
        p = clothingIcon(d);
        break;
      case 'placeable':
      case 'decor': {
        const o = objects[d.places ?? d.id];
        p = new Px(16, 16);
        if (o) {
          const f = o.frames[0]!;
          const s = Math.min(1, 16 / f.w, 16 / f.h);
          const w = Math.round(f.w * s);
          const h = Math.round(f.h * s);
          p.blitScaled(f, Math.round((16 - w) / 2), 16 - h, w, h);
        } else if (d.id.startsWith('floor_') || d.id.startsWith('path_')) {
          p.rect(2, 4, 12, 8, d.id.includes('wood') ? WOOD : d.id === 'path_dirt' ? '#c9a978' : '#b5b2a8').rect(2, 4, 12, 1, d.id.includes('wood') ? WOOD_L : '#cbc8bf').outline(OUTLINE);
        }
        break;
      }
      default:
        p = new Px(16, 16).rect(2, 2, 12, 12, '#ff00ff');
    }
    icons[d.id] = p;
  }
  // paint buckets
  for (const d of Object.values(ITEMS)) {
    if (d.paint === undefined) continue;
    const c = PAINT_COLORS[d.paint] ?? '#ff00ff';
    const p = new Px(16, 16).rect(3, 5, 10, 9, STEEL).rect(3, 5, 10, 1, '#dfe2e8').rect(3, 13, 10, 1, STEEL_D);
    p.rect(4, 6, 8, 4, c).rect(4, 6, 8, 1, shade(c, 1.2));
    p.line(4, 4, 8, 1, STEEL_D).line(8, 1, 12, 4, STEEL_D);
    p.rect(9, 10, 2, 4, c).rect(10, 13, 2, 2, c);
    icons[d.id] = p.outline(OUTLINE);
  }
  // floor/path items have no object art: draw tiles
  const floorTile = (base: string, line: string) => new Px(16, 16).rect(1, 3, 14, 10, base).rect(1, 3, 14, 1, shade(base, 1.2)).rect(1, 7, 14, 1, line).rect(7, 3, 1, 4, line).rect(4, 8, 1, 5, line).outline(OUTLINE);
  icons.path_stone = floorTile('#b5b2a8', '#8d8a82');
  icons.path_dirt = floorTile('#c9a978', '#a98858');
  icons.floor_wood = floorTile('#b07a44', '#8a5c30');
  icons.floor_stone = floorTile('#b9b6ad', '#8e8b83');
  return icons;
}
