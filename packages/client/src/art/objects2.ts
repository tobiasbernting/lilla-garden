// Things of the wider world: plants and finds of the new biomes, landmarks and cave entrances, what is
// inside the caves, the space base and the moon, and the souvenirs you can make from it all.
import { Px } from './px.js';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;

// PLACEHOLDER ART: coloured boxes of the right size, replaced by the real sprites.
const ph = (w: number, h: number, c: string, label = 0): Px => {
  const p = new Px(w, h).rect(1, 1, w - 2, h - 2, c);
  p.box(0, 0, w, h, '#1b1a17');
  for (let i = 0; i < label; i++) p.rect(3 + i * 3, 3, 2, 2, '#ffffff');
  return p;
};
const n = (count: number, f: (i: number) => Px): Px[] => Array.from({ length: count }, (_, i) => f(i));

/** cave_wall frames for the caves out in the world: theme 0..10 (see CAVE_THEMES), plain or with a torch. */
export function caveWallThemed(theme: number, lit: boolean): Px {
  const cols = ['#5a4a3a', '#a8c8e0', '#6a5a8a', '#6a6050', '#c8a060', '#5a6a4a', '#3a2a2a', '#4a5a5a', '#a0603a', '#e8a0c0', '#8a8a96'];
  return ph(16, 24, cols[theme] ?? '#4a4640', lit ? 1 : 0);
}

export function drawBiomeObjects(set: SetArt): void {
  set('blueberry_bush', [ph(16, 16, '#3a5aa0')]);
  set('cloudberry', [ph(16, 16, '#f0a030')]);
  set('reed', [ph(16, 22, '#8a9a4a')], 0, -6);
  set('dead_tree', [ph(24, 36, '#6a5040')], -4, -20);
  set('wisp', n(3, (i) => ph(16, 16, i ? '#a0f0ff' : '#60d0f0')), 0, -4, true);
  set('jungle_tree', [ph(32, 40, '#2a7a3a')], -8, -24);
  set('banana_plant', [ph(16, 26, '#5aaa3a')], 0, -10);
  set('jungle_flower', n(3, () => ph(16, 16, '#e04a8a')));
  set('ruin_pillar', [ph(16, 28, '#8a8a7a')], 0, -12);
  set('obsidian_rock', [ph(16, 16, '#2a1a3a')]);
  set('fire_crystal', [ph(16, 20, '#ff6a1a')], 0, -4);
  set('steam_vent', n(3, () => ph(16, 16, '#6a6a6a')), 0, 0, true);
  set('giant_mushroom', n(2, (i) => ph(24, 32, i ? '#a06a3a' : '#d8363a')), -4, -16);
  set('giant_glowshroom', [ph(24, 32, '#3ac0f0')], -4, -16);
  set('glowshroom', [ph(16, 16, '#5af0e0')]);
  set('fairy_ring', [ph(32, 32, '#c0a0f0')]);
  set('fern', [ph(16, 18, '#3a8a3a')], 0, -2);
  set('dino_bones', [ph(48, 36, '#f0e8d0')], 0, -4);
  set('fossil_rock', [ph(16, 16, '#c0a080')]);
  set('lollipop_tree', n(3, (i) => ph(24, 36, ['#f04a8a', '#4ac0f0', '#f0d04a'][i]!)), -4, -20);
  set('candy_cane', [ph(16, 24, '#f05050')], 0, -8);
  set('dig_spot', [ph(16, 16, '#c0302a')]);
  set('cave_mouth', n(11, (i) => ph(32, 40, '#3a3a3a', i)), 0, -8);
  set('temple', [ph(64, 56, '#7a8a6a')], 0, -8);
  set('pyramid', [ph(96, 80, '#e0c080')], 0, -16);
  set('gingerbread_house', [ph(48, 56, '#b06a3a')], 0, -8);
  set('volcano', [ph(96, 96, '#4a3a3a')], 0, -16);
  set('shipwreck', [ph(64, 40, '#7a5a3a')], 0, -8);
  set('rocket', [ph(32, 64, '#e8e8f0')], 0, -16);
  set('satellite_dish', [ph(32, 40, '#c8c8d0')], 0, -8);
  set('ufo', n(2, () => ph(48, 32, '#9ab0c0')), 0, 0, true);
  set('flag_se', n(2, () => ph(16, 28, '#2a6ad0')), 0, -12, true);
  set('earth', [ph(64, 64, '#2a6ad0')]);
  set('crater', [ph(32, 32, '#9a9aa4')]);
  set('moon_rock', [ph(16, 16, '#8a8a94')]);
  set('star_crystal', [ph(16, 20, '#fff0a0')], 0, -4);
  set('moon_cheese', [ph(16, 16, '#f0d050')]);
  set('crystal', n(4, (i) => ph(16, 20, ['#b06af0', '#8ad0f0', '#6af08a', '#f08ac8'][i]!)), 0, -4);
  set('gold_vein', [ph(16, 16, '#d0a020')]);
  set('gem_vein', [ph(16, 16, '#30c0e0')]);
  set('stalagmite', n(11, () => ph(16, 24, '#6a6a6a')), 0, -8);
  set('loot_chest', n(12, (i) => ph(16, 16, i % 2 ? '#5a3a1a' : '#b07a44', Math.floor(i / 2))));
  set('barrel', [ph(16, 18, '#8a5a2a')], 0, -2);
  set('bones', [ph(16, 16, '#e8e0d0')]);
  set('crystal_lamp', [ph(16, 24, '#c08af0')], 0, -8);
  set('mushroom_lamp', [ph(16, 24, '#5af0e0')], 0, -8);
  set('dino_skeleton', [ph(48, 40, '#f0e8d0')], 0, -8);
  set('wisp_jar', [ph(16, 20, '#a0f0ff')], 0, -4);
  set('dragon_egg', [ph(16, 16, '#8a3ac0')]);
}
