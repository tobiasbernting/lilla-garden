// Landmarks of the wider world (cave mouths, the temple, the pyramid, the volcano, the space base and the
// UFO), what is inside the caves (walls, crystals, ore, chests), and the souvenirs you can make.
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

export function drawLandmarks(set: SetArt): void {
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
