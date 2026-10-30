// 16x16 item icons for the hotbar and menus.
import { ITEMS, type ItemDef } from '@lilla-garden/shared';
import { drawAnimal } from './animals.js';
import { arcadeIcons } from './arcade.ts';
import { sagaIcons } from './saga.ts';
import { drawCharacter, HEADROOM } from './characters.js';
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
  /** Sparkles and glow, drawn after the outline so they stay loose specks. */
  const glints: [number, number, string][] = [];
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
    case 'dirt':
      p.rect(2, 3, 12, 11, '#866043').rect(2, 3, 12, 1, '#a07a58').rect(2, 13, 12, 1, '#5a3e2a').px(5, 6, '#5a3e2a').px(10, 8, '#5a3e2a').px(7, 11, '#a07a58');
      break;
    case 'sand':
      p.rect(2, 3, 12, 11, '#dbcf9b').rect(2, 3, 12, 1, '#ebe2b8').rect(2, 13, 12, 1, '#bfae74').px(5, 7, '#bfae74').px(10, 10, '#bfae74');
      break;
    case 'gravel':
      p.rect(2, 3, 12, 11, '#857f7c').rect(2, 3, 12, 1, '#a8a3a1').rect(2, 13, 12, 1, '#5d5856').px(4, 6, '#5d5856').px(9, 5, '#a8a3a1').px(11, 10, '#5d5856').px(6, 10, '#a8a3a1');
      break;
    case 'coal':
      p.ellipse(3, 4, 10, 9, '#2a2a2e').ellipse(4, 4, 6, 5, '#48484e').px(6, 6, '#6a6a72');
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
    case 'pizza':
    case 'pizza_kebab':
    case 'pizza_hawaii':
      p.circle(8, 8, 7, '#e8b060').circle(8, 8, 6, '#e0453a').circle(8, 8, 5, '#f5d94a');
      if (id === 'pizza') p.rect(5, 5, 2, 2, '#e0453a').rect(9, 8, 2, 2, '#e0453a').rect(6, 10, 2, 2, '#e0453a').px(9, 5, '#3f8a2e').px(5, 9, '#3f8a2e');
      else if (id === 'pizza_kebab') p.rect(5, 5, 2, 2, '#8a4a2a').rect(9, 6, 2, 2, '#8a4a2a').rect(6, 9, 2, 2, '#8a4a2a').rect(9, 10, 2, 1, '#ffffff');
      else p.rect(5, 5, 2, 2, '#f5e04a').rect(9, 6, 2, 2, '#f08a2a').rect(6, 9, 2, 2, '#e07a9a').rect(9, 10, 2, 2, '#f5e04a');
      p.rect(8, 1, 1, 14, '#c89040').rect(1, 8, 14, 1, '#c89040');
      break;
    case 'lemonade':
      p.rect(4, 3, 8, 11, '#ffb347').rect(4, 3, 8, 1, '#ffd08a').rect(3, 2, 10, 1, '#d8d8d8').rect(10, 1, 1, 6, '#e03a3a').rect(5, 6, 2, 2, '#ffffff').rect(6, 10, 1, 1, '#ffffff');
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
    case 'truffle':
      p.ellipse(3, 4, 10, 9, '#3a2a1e').ellipse(4, 5, 8, 7, '#5a4030').px(6, 6, '#8a6a50').px(9, 8, '#8a6a50').px(5, 9, '#8a6a50').px(10, 5, '#2a1a10');
      break;
    case 'truffle_pasta':
      p.ellipse(1, 7, 14, 8, '#e0e0e0').ellipse(2, 5, 12, 7, '#f2d35a').rect(3, 7, 10, 1, '#e0b040').rect(6, 5, 3, 2, '#5a4030').rect(9, 8, 2, 2, '#5a4030').rect(1, 11, 14, 1, '#b0b0b0');
      break;
    case 'wool':
      p.ellipse(2, 3, 12, 10, '#f7f3ee').ellipse(1, 6, 5, 5, '#f7f3ee').ellipse(10, 6, 5, 5, '#f7f3ee').px(7, 8, '#d8d4ce');
      break;
    case 'fur': // a material, drawn with the tools
      return tool('fur');
    // ---- the wider world ----
    case 'blueberry':
      // three dusky blueberries with their little crowns, and a leaf
      p.ellipse(8, 0, 6, 4, '#4f9a3a').line(9, 2, 12, 1, '#7ac05a');
      for (const [x, y, r] of [[8.5, 6.5, 3], [5, 10.5, 3.5], [11, 11, 3]] as const) {
        p.circle(x, y, r, '#2e3a80').circle(x - 0.5, y - 0.5, r - 0.7, '#4a5ab8');
        p.px(Math.round(x - r / 2), Math.round(y - r / 2), '#a8b4f0').px(Math.round(x), Math.round(y - r + 1), '#1e2860');
      }
      break;
    case 'cloudberry':
      // golden-orange cloudberry made of little round drupelets, sitting in its green sepals
      p.tpl(1, 9, ['GG.........GG.', '.GGG.....GGG..', '..GGGGGGGGG...', '......SS......', '......SS......'], { G: '#4f9a3a', S: '#6a8a3a' });
      p.circle(7.5, 6.5, 5.5, '#c8781a').circle(7, 6, 4.8, '#f0a030');
      for (const [x, y] of [[4, 4], [7, 3], [10, 4], [5, 7], [8, 6], [11, 7], [6, 10], [9, 9], [3, 6]] as const) p.px(x, y, '#ffd890').px(x + 1, y + 1, '#d8861e');
      p.px(4, 3, '#fff2c8');
      break;
    case 'banana':
      p.tpl(1, 2, [
        '............SS.',
        '............SS.',
        '...........YYD.',
        'T..........YYD.',
        'YY........YYYD.',
        'YLY......YYYD..',
        '.YLYY...YYYYD..',
        '..YLLYYYYYYD...',
        '...YYLLLLYDD...',
        '....DYYYYDD....',
        '......DDD......',
      ], { Y: '#f5d43a', L: '#fff2a8', D: '#d0981e', T: '#5a4a2a', S: '#8a9a3a' });
      break;
    case 'glowshroom':
      // a glowing teal mushroom
      p.rect(6, 9, 4, 6, '#d8f4ec').rect(9, 9, 1, 6, '#a8d8cc');
      p.ellipse(1, 2, 14, 9, '#1fa8a0').ellipse(2, 2, 12, 7, '#4ae8d8').rect(3, 9, 10, 1, '#167a78');
      p.px(5, 4, '#e8fffa').px(6, 4, '#e8fffa').px(9, 3, '#e8fffa').px(11, 6, '#e8fffa').px(6, 7, '#b0fff0');
      glints.push([1, 0, '#aafff4'], [14, 0, '#aafff4'], [0, 12, '#7af0e0'], [15, 11, '#aafff4'], [12, 14, '#7af0e0'], [3, 14, '#aafff4']);
      break;
    case 'fairy_dust':
      // a tiny pouch of sparkly pink-purple fairy dust
      p.ellipse(3, 7, 10, 8, '#a84ec0').ellipse(4, 7, 7, 6, '#d27ae0').px(5, 9, '#ecb0f4');
      p.rect(6, 5, 4, 3, '#a84ec0').rect(5, 3, 6, 2, '#d27ae0').rect(6, 3, 4, 1, '#fff0ff');
      p.rect(5, 6, 6, 1, '#f5d04a').px(10, 7, '#f5d04a').px(11, 8, '#f5d04a');
      glints.push([7, 1, '#ffffff'], [9, 0, '#ff9ef0'], [5, 0, '#e8a0ff'], [11, 1, '#ffffff'], [13, 3, '#ff9ef0'], [2, 2, '#ffffff'], [14, 6, '#e8a0ff'], [1, 5, '#ff9ef0']);
      break;
    case 'obsidian':
      // a shiny shard of black volcanic glass
      p.tpl(1, 2, [
        '.....KK.......',
        '....KHKK......',
        '...KHHKKK.....',
        '..KHHKKKKK....',
        '..KHKKKKKPK...',
        '.KHKKKKKPPKK..',
        '.KKKKKKPPKKKK.',
        'KKKKKKPPKKKKK.',
        'KKKKKPPKKKKK..',
        '.KKKKKKKKKK...',
        '..KKKKKKKK....',
      ], { K: '#2a2236', H: '#6c5c8c', P: '#463a62' });
      p.px(5, 4, '#ffffff').px(9, 9, '#8a7aaa');
      break;
    case 'crystal':
      // a cluster of purple crystals on a bit of rock
      p.tpl(1, 1, [
        '......W.......',
        '.....LMD......',
        '.....LMD..W...',
        '.....LMD.LMD..',
        '..W..LMD.LMD..',
        '.LMD.LMD.LMD..',
        '.LMD.LMD.LMD..',
        '.LMD.LMD.LMD..',
        '.LMD.LMD.LMD..',
        '.LMDDLMDDLMD..',
        '.LMDDLMDDLMD..',
        'GGGGGGGGGGGGG.',
        '.gggggggggggg.',
      ], { W: '#f4e8ff', L: '#d8b8ff', M: '#a070e0', D: '#6a40b0', G: '#8a8690', g: '#66626c' });
      break;
    case 'fire_crystal':
      // glowing fire crystals leaning out of dark rock, with sparks
      for (const [bx, tx, ty] of [[2, 0, 5], [6, 6, 1], [10, 12, 4]] as const) {
        p.line(bx, 12, tx, ty, '#ffe07a').line(bx + 1, 12, tx + 1, ty, '#ff8a2a').line(bx + 2, 12, tx + 2, ty, '#c8401a');
        p.px(tx + 1, ty - 1, '#fff6c0');
      }
      p.rect(1, 12, 14, 2, '#3a3238').rect(2, 14, 12, 1, '#2a2428').px(5, 12, '#f06a1a').px(10, 13, '#f06a1a');
      glints.push([4, 1, '#ffb030'], [9, 0, '#ffe07a'], [14, 1, '#ff8a2a'], [11, 0, '#ff6a1a']);
      break;
    case 'fossil':
      // an ammonite: a coiled stone shell with a spiral groove
      p.circle(8, 8.5, 6.5, '#a89878').circle(7.6, 8.1, 5.8, '#d8c8a2');
      for (let t = 0; t < Math.PI * 4; t += 0.04) {
        const r = 0.5 + t * 0.44;
        p.px(Math.round(8 + Math.cos(t) * r), Math.round(8.5 + Math.sin(t) * r), '#8a7656');
      }
      p.px(5, 4, '#f4ead0').px(4, 5, '#f4ead0');
      break;
    case 'pearl':
      // a big shiny pearl in an open oyster shell
      p.ellipse(2, 1, 12, 8, '#6a6a8a').ellipse(3, 2, 10, 6, '#c8c0dc'); // upper shell, open
      p.ellipse(1, 8, 14, 7, '#7a7a9a').ellipse(2, 8, 12, 5, '#d8d0e8'); // lower shell
      p.circle(8, 9, 3.5, '#e2dcec').circle(7.7, 8.7, 2.9, '#fbf8ff');
      p.px(6, 7, '#ffffff').px(7, 7, '#ffffff').px(10, 11, '#f0d0e4').px(9, 12, '#d8e4f4');
      break;
    case 'old_coin':
      // a worn old silver coin with a crown, chipped and a little tarnished
      p.circle(8, 8, 6.5, '#7d786c').circle(8, 8, 5.5, '#bdb6a4').circle(7.6, 7.6, 4.6, '#d2ccba');
      p.tpl(6, 6, ['X.X.X', 'XXXXX', 'XXXXX'], { X: '#8a8474' }).rect(6, 10, 5, 1, '#a8a292');
      p.clear(13, 4, 2, 1).clear(14, 5, 1, 1);
      p.px(4, 5, '#ece6d4').px(5, 4, '#ece6d4').px(10, 12, '#8a9a6a').px(11, 11, '#8a9a6a').px(3, 10, '#9aa47a');
      break;
    case 'scarab': {
      // golden scarab beetle seen from above
      const G = '#f2c23a';
      const D = '#b08018';
      for (const s of [-1, 1]) {
        p.line(8 + s * 3, 5, 8 + s * 6, 3, D).line(8 + s * 4, 9, 8 + s * 7, 9, D).line(8 + s * 3, 12, 8 + s * 6, 14, D);
      }
      p.ellipse(6, 1, 5, 3, D).px(6, 0, D).px(10, 0, D);
      p.ellipse(4, 3, 9, 5, G).ellipse(4, 6, 9, 9, G).rect(4, 7, 9, 1, D).rect(8, 8, 1, 6, D);
      p.px(6, 4, '#fff2a0').px(5, 9, '#fff2a0').px(6, 10, '#fff2a0').px(10, 10, '#ffe070');
      break;
    }
    case 'idol':
      // a small golden statuette with ruby eyes on a stone base
      p.tpl(3, 2, [
        '...LGGD...',
        '..LLGGGD..',
        '..LRGGRD..',
        '..LGGGGD..',
        '...GKKD...',
        '.LLGGGGDD.',
        'LLGGGGGGDD',
        'LG.GGGG.DD',
        '...LGGD...',
        '...LGGD...',
        '..LG..GD..',
        '.BBBBBBBB.',
        'BBBBBBBBBB',
      ], { L: '#ffe680', G: '#e8b830', D: '#a87818', R: '#e03a3a', K: '#7a5410', B: '#7a7068' });
      break;
    case 'polkagris':
      // a Swedish red-and-white candy stick
      for (let y = 3; y <= 13; y++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = 15 - y + dx;
          p.px(x, y, Math.floor((x - y + 40) / 2) % 3 === 0 ? '#e0303a' : dx === -1 ? '#ffffff' : dx === 0 ? '#f4f0ec' : '#dcd6d0');
        }
      break;
    case 'lollipop':
      // a round pink swirl lollipop on a white stick
      p.rect(7, 11, 2, 5, '#f4efe6').rect(8, 11, 1, 5, '#d8d2c6');
      p.circle(8, 6.5, 5.5, '#c02a6a').circle(7.7, 6.2, 5, '#f04a92');
      for (let t = 0; t < Math.PI * 4.2; t += 0.04) {
        const r = 0.3 + t * 0.36;
        p.px(Math.round(7.7 + Math.cos(t) * r), Math.round(6.2 + Math.sin(t) * r), '#ffe0ee');
      }
      p.px(5, 3, '#ffffff');
      break;
    case 'moon_rock':
      // a pale grey moon rock full of little craters
      p.ellipse(1, 4, 14, 10, '#6e6e7c').ellipse(2, 3, 12, 9, '#b4b4c4');
      p.circle(5.5, 6.5, 1.6, '#8c8c9c').px(5, 6, '#7a7a8a').circle(10.5, 9, 2, '#8c8c9c').px(10, 8, '#7a7a8a').circle(6.5, 10.5, 1, '#8c8c9c');
      p.px(6, 8, '#d8d8e4').px(11, 11, '#d8d8e4').rect(4, 4, 3, 1, '#dcdce8');
      glints.push([14, 1, '#fff6a0'], [1, 1, '#ffffff']);
      break;
    case 'star_crystal':
      // a glowing star-shaped crystal
      p.tpl(1, 1, [
        '......L.......',
        '......LD......',
        '.....LLDD.....',
        '.....LWDD.....',
        'LLLLLLWDDDDDDD',
        '.LLLLLLDDDDDD.',
        '..LLLLLDDDDD..',
        '...LLLLDDDD...',
        '...LLLLDDDD...',
        '..LLLL..DDDD..',
        '..LLL....DDD..',
        '.LLL......DDD.',
        '.L..........D.',
      ], { L: '#fff6c0', W: '#ffffff', D: '#f2cf55' });
      p.px(7, 6, '#ffffff').px(6, 7, '#ffffff');
      glints.push([1, 1, '#fff6a0'], [14, 2, '#ffffff'], [14, 14, '#fff6a0']);
      break;
    case 'moon_cheese':
      // a wedge of yellow cheese with holes (the moon is made of it, of course)
      p.tpl(1, 2, [
        '...........TT.',
        '.........TTTS.',
        '.......TTTTTS.',
        '.....TTTTHTTS.',
        '...TTTHTTTTTS.',
        '.TTTTTTTTTTTS.',
        '.FFFFFFFFFFFS.',
        '.FFHFFFFFHFFS.',
        '.FHHFFFFFFFFS.',
        '.FFFFFHFFFFS..',
        '.FFFFFFFFFF...',
      ], { T: '#fbe68a', F: '#f5cf4a', S: '#d8a830', H: '#d0a038' });
      break;
    case 'cloudberry_jam':
      // a jar of golden cloudberry jam with a checked cloth on the lid
      p.rect(4, 5, 8, 10, '#f0a030').rect(4, 5, 8, 1, '#ffc870').rect(11, 6, 1, 9, '#c87818').rect(5, 6, 1, 7, '#ffd890');
      p.rect(6, 9, 4, 3, '#f7f0e0').px(7, 10, '#f0a030').px(8, 10, '#f0a030');
      p.rect(3, 2, 10, 3, '#ffffff').rect(3, 5, 1, 2, '#ffffff').rect(12, 5, 1, 2, '#ffffff');
      for (let x = 3; x < 13; x += 2) p.px(x, 2, '#d8363a').px(x + 1, 3, '#d8363a').px(x, 4, '#d8363a');
      p.px(3, 6, '#d8363a').px(12, 5, '#d8363a');
      break;
    case 'blueberry_pie':
      // a blueberry pie with a lattice crust
      p.ellipse(1, 6, 14, 9, '#b07a3a').ellipse(1, 5, 14, 8, '#e0a860').ellipse(2, 5, 12, 6, '#3a2e72');
      for (let y = 5; y < 11; y++)
        for (let x = 2; x < 14; x++) {
          const dx = (x + 0.5 - 8) / 6;
          const dy = (y + 0.5 - 8) / 3;
          if (dx * dx + dy * dy > 1) continue;
          if ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) p.px(x, y, '#f0c070');
          else if ((x * 7 + y * 3) % 5 === 0) p.px(x, y, '#6a5ab8');
        }
      break;
    default:
      p.rect(4, 4, 8, 8, '#ff00ff');
  }
  p.outline(OUTLINE);
  for (const [x, y, c] of glints) p.px(x, y, c);
  return p;
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
      if (c.style.startsWith('dress') || c.style === 'gown' || c.style === 'robe') {
        // a-line dress on a hanger
        const gown = c.style === 'gown' || c.style === 'robe';
        p.rect(5, 2, 6, 4, C).rect(2, 2, 3, 3, C).rect(11, 2, 3, 3, C);
        for (let y = 6; y < 14; y++) {
          const half = 3 + Math.round(((y - 6) / 7) * (gown ? 4 : 3));
          p.rect(8 - half, y, half * 2, 1, y === 13 ? D : C);
        }
        if (c.style === 'robe') {
          // wide sleeves, a rope belt, runes down the front and round the hem
          p.rect(0, 3, 3, 5, D).rect(13, 3, 3, 5, D).rect(5, 6, 6, 1, '#ecdcae').rect(7, 7, 2, 6, shade(C, 1.35));
          for (const [x, y] of [[7, 8], [8, 10], [7, 12], [3, 12], [12, 12]] as const) p.px(x, y, '#fff0a0');
          break;
        }
        if (c.style === 'dress_belt' || gown) p.rect(5, 6, 6, 1, '#ffffff');
        if (c.style === 'dress_flowers') p.px(6, 9, '#ffffff').px(10, 11, '#f5e04a').px(8, 12, '#ffffff').px(5, 12, '#f5e04a');
        if (gown) p.px(8, 8, shade(C, 1.3)).px(8, 10, shade(C, 1.3)).px(3, 12, '#ffffff').px(12, 12, '#ffffff');
        break;
      }
      if (c.style === 'cloak') {
        // a long cloak, a gold clasp at the neck, a raven on it
        p.rect(3, 2, 10, 13, C).rect(2, 4, 12, 11, C).rect(2, 14, 12, 1, D).rect(13, 4, 1, 10, D).rect(3, 2, 10, 1, shade(C, 1.3));
        p.rect(7, 2, 2, 2, '#f2c84a').px(7, 2, '#fff2b0');
        p.tpl(5, 7, ['..##..', '.####.', '######', '#.##.#'], { '#': '#14121a' }).px(8, 8, '#ffffff');
        break;
      }
      p.rect(4, 3, 8, 10, C).rect(1, 3, 3, 5, C).rect(12, 3, 3, 5, C).rect(6, 2, 4, 1, D).rect(4, 12, 8, 1, D);
      if (c.style === 'stripes') for (let y = 5; y < 12; y += 2) p.rect(4, y, 8, 1, '#ffffff');
      if (c.style === 'overalls') p.rect(4, 3, 8, 10, '#f0e4c8').rect(6, 3, 4, 10, C).rect(5, 3, 1, 3, C).rect(10, 3, 1, 3, C);
      if (c.style === 'xmas') p.rect(4, 6, 8, 1, '#d8363a').rect(4, 8, 8, 1, '#ffffff');
      if (c.style === 'star') p.rect(7, 5, 2, 1, '#f5e04a').rect(6, 6, 4, 1, '#f5e04a').rect(7, 7, 2, 1, '#f5e04a').px(6, 8, '#f5e04a').px(9, 8, '#f5e04a');
      if (c.style === 'ghost') p.rect(4, 3, 8, 10, '#f4f4f4').rect(1, 3, 3, 5, '#f4f4f4').rect(12, 3, 3, 5, '#f4f4f4').rect(6, 6, 1, 2, OUTLINE).rect(9, 6, 1, 2, OUTLINE);
      if (c.style === 'space') {
        // astronaut suit: grey collar ring, cuffs and belt, a chest panel and a Swedish flag patch
        p.rect(5, 2, 6, 1, '#a2a9b4').rect(1, 7, 3, 1, '#a2a9b4').rect(12, 7, 3, 1, '#a2a9b4').rect(4, 10, 8, 1, '#a2a9b4');
        p.tpl(5, 4, ['BYBB', 'YYYY', 'BYBB'], { B: '#2f6fc8', Y: '#f5d03a' }).rect(9, 7, 2, 2, '#737b88').px(9, 7, '#ff5a4a').px(10, 8, '#5ae05a');
      }
      if (c.style === 'chainmail' || c.style === 'tabard') {
        // rings all over (grey under a tabard), a ragged hem, a belt; the tabard with a shield on its chest
        const m = c.style === 'chainmail' ? C : '#a4acb6';
        for (let y = 3; y < 14; y++)
          for (let x = 1; x < 15; x++) if ((x >= 4 && x < 12) || (y < 8 && (x < 4 || x >= 12))) p.px(x, y, (x + y) % 2 === 0 ? shade(m, 1.24) : m);
        for (let x = 4; x < 12; x += 2) p.px(x, 13, shade(m, 0.7));
        if (c.style === 'tabard') p.rect(5, 3, 6, 10, C).rect(6, 4, 4, 4, '#f2c84a').rect(7, 5, 2, 2, '#f4f0e6').rect(1, 3, 3, 2, '#c4ccd6').rect(12, 3, 3, 2, '#c4ccd6');
        p.rect(4, 10, 8, 1, '#4a3020');
      }
      if (c.style === 'bearpelt') {
        // a leather tunic under a shaggy pelt with its paws hanging down
        p.rect(4, 3, 8, 10, '#6a4a30').rect(1, 3, 3, 5, '#5a3e28').rect(12, 3, 3, 5, '#5a3e28').rect(4, 12, 8, 1, '#4a3020');
        for (let x = 0; x < 16; x++) p.rect(x, 2, 1, x % 2 ? 4 : 5, x % 3 === 0 ? shade(C, 1.2) : C);
        p.rect(4, 7, 2, 3, C).rect(10, 7, 2, 3, C).px(4, 10, '#f4f0e6').px(5, 10, '#f4f0e6').px(10, 10, '#f4f0e6').px(11, 10, '#f4f0e6');
      }
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
      // crop the head and the hat into 16x16: from 3 rows over the head's top, or higher for a tall hat
      const alpha = ch.ctx.getImageData(0, 0, ch.w, ch.h).data;
      let top = 0;
      while (top < HEADROOM && !alpha.slice(top * ch.w * 4, (top + 1) * ch.w * 4).some((v, i) => i % 4 === 3 && v > 0)) top++;
      const y0 = Math.min(HEADROOM - 3, top);
      p.ctx.drawImage(ch.canvas, 0, y0, 16, 16, 0, 0, 16, 16);
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
        const a = drawAnimal(d.species!, 0, false, false, d.variant ?? 0);
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
  Object.assign(icons, arcadeIcons());
  Object.assign(icons, sagaIcons());
  return icons;
}
