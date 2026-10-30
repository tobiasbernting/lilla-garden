import { ARCADE_GAMES, cartOf } from './arcade.ts';
import type { Achievement, AnimalDef, CropDef, ItemDef, NpcDef, ObjectDef, RecipeDef } from './types.ts';

// ---------- Items ----------

const I = (
  id: string,
  category: ItemDef['category'],
  extra: Partial<ItemDef> = {},
): ItemDef => ({
  id,
  category,
  stack: category === 'tool' ? 1 : 99,
  icon: id,
  ...extra,
});

export const ITEMS: Record<string, ItemDef> = {};
const add = (d: ItemDef) => (ITEMS[d.id] = d);

// Tools
add(I('hoe', 'tool', { tool: 'hoe' }));
add(I('can', 'tool', { tool: 'can' }));
add(I('axe', 'tool', { tool: 'axe' }));
add(I('pick', 'tool', { tool: 'pick' }));
add(I('scythe', 'tool', { tool: 'scythe' }));
add(I('hammer', 'tool', { tool: 'hammer' }));
add(I('brush', 'tool', { tool: 'brush' }));
add(I('rod', 'tool', { tool: 'rod' }));
add(I('sword', 'tool', { tool: 'sword' }));
add(I('shield', 'tool', { tool: 'shield' }));
add(I('bow', 'tool', { tool: 'bow' }));
add(I('bazooka', 'tool', { tool: 'bazooka' }));
add(I('rocket', 'material', { sell: 3 }));
add(I('lasso', 'tool', { tool: 'lasso' }));
add(I('fur', 'material', { sell: 15 }));

// Seeds + crops
const crop = (id: string, buySeed: number, sellCrop: number) => {
  add(I(`${id}_seed`, 'seed', { crop: id, buy: buySeed, tab: 'seeds', sell: Math.max(1, Math.floor(buySeed / 2)) }));
  add(I(id, 'crop', { sell: sellCrop }));
};
crop('carrot', 10, 12);
crop('potato', 12, 15);
crop('strawberry', 30, 22);
crop('tomato', 25, 20);
crop('pumpkin', 40, 60);
crop('sunflower', 20, 28);
crop('wheat', 10, 10);

// Materials
add(I('wood', 'material', { sell: 2, buy: 5, tab: 'materials', block: 'planks' }));
add(I('stone', 'material', { sell: 2, buy: 5, tab: 'materials', block: 'cobble' }));
// 3D game: dug out of the ground, and built with
add(I('dirt', 'material', { sell: 1, block: 'dirt' }));
add(I('sand', 'material', { sell: 1, block: 'sand' }));
add(I('gravel', 'material', { sell: 1, block: 'gravel' }));
add(I('coal', 'material', { sell: 4 }));
add(I('fiber', 'material', { sell: 1 }));
add(I('paper', 'material', { sell: 1, buy: 3, tab: 'materials' }));
add(I('hay', 'feed', { sell: 1, buy: 4, tab: 'feed' }));
// Found out in the world
add(I('mushroom', 'crop', { sell: 12 }));
add(I('honey', 'crop', { sell: 45 }));
add(I('iceberry', 'crop', { sell: 18 }));
add(I('shell', 'material', { sell: 8 }));
add(I('cactus_fruit', 'crop', { sell: 16 }));
// Cave loot
add(I('gold', 'material', { sell: 10 }));
add(I('gem', 'material', { sell: 150 }));
add(I('heartberry', 'crop', { sell: 20 }));
// The wider world: found in the new biomes, their caves and on the moon
add(I('blueberry', 'crop', { sell: 6 }));
add(I('cloudberry', 'crop', { sell: 30 }));
add(I('banana', 'crop', { sell: 14, food: { boostMs: 20_000 } }));
add(I('glowshroom', 'crop', { sell: 25 }));
add(I('fairy_dust', 'material', { sell: 50 }));
add(I('obsidian', 'material', { sell: 25 }));
add(I('crystal', 'material', { sell: 40 }));
add(I('fire_crystal', 'material', { sell: 80 }));
add(I('fossil', 'material', { sell: 35 }));
add(I('pearl', 'material', { sell: 90 }));
add(I('old_coin', 'material', { sell: 60 }));
add(I('scarab', 'material', { sell: 150 }));
add(I('idol', 'material', { sell: 250 }));
add(I('polkagris', 'crop', { sell: 8, food: { boostMs: 30_000 } }));
add(I('lollipop', 'crop', { sell: 10, food: { boostMs: 30_000 } }));
add(I('moon_rock', 'material', { sell: 30 }));
add(I('star_crystal', 'material', { sell: 120 }));
add(I('moon_cheese', 'crop', { sell: 40, food: { boostMs: 45_000 } }));

// Animal products
add(I('egg', 'animal_product', { sell: 15 }));
add(I('milk', 'animal_product', { sell: 40 }));
add(I('wool', 'animal_product', { sell: 50 }));
add(I('truffle', 'animal_product', { sell: 60 }));
add(I('egg_pask', 'animal_product', { sell: 25 }));

// Dishes (cooked at the stove)
add(I('pancakes', 'crop', { sell: 70 }));
add(I('truffle_pasta', 'crop', { sell: 160 }));
add(I('carrot_cake', 'crop', { sell: 60 }));
add(I('pumpkin_pie', 'crop', { sell: 120 }));
add(I('strawberry_jam', 'crop', { sell: 55 }));
add(I('fish_soup', 'crop', { sell: 65 }));
add(I('bread', 'crop', { sell: 30 }));
add(I('cloudberry_jam', 'crop', { sell: 150 }));
add(I('blueberry_pie', 'crop', { sell: 110 }));
// Pizzeria menu (bought in the village, eaten for pizzapower)
add(I('pizza', 'crop', { sell: 10, buy: 30, tab: 'pizzeria', food: { boostMs: 60_000 } }));
add(I('pizza_kebab', 'crop', { sell: 12, buy: 40, tab: 'pizzeria', food: { boostMs: 60_000 } }));
add(I('pizza_hawaii', 'crop', { sell: 11, buy: 35, tab: 'pizzeria', food: { boostMs: 60_000 } }));
add(I('lemonade', 'crop', { sell: 3, buy: 10, tab: 'pizzeria', food: { boostMs: 20_000 } }));

// Fish
add(I('fish_roach', 'fish', { sell: 8 }));
add(I('fish_perch', 'fish', { sell: 14 }));
add(I('fish_pike', 'fish', { sell: 35 }));
add(I('fish_gold', 'fish', { sell: 90 }));

// Animals (catalogue)
add(I('animal_hen', 'animal', { species: 'hen', buy: 150, tab: 'animals', stack: 1 }));
add(I('animal_rabbit', 'animal', { species: 'rabbit', buy: 200, tab: 'animals', stack: 1 }));
add(I('animal_sheep', 'animal', { species: 'sheep', buy: 400, tab: 'animals', stack: 1 }));
add(I('animal_cow', 'animal', { species: 'cow', buy: 600, tab: 'animals', stack: 1 }));
add(I('animal_horse', 'animal', { species: 'horse', buy: 500, tab: 'animals', stack: 1 }));
add(I('animal_pig', 'animal', { species: 'pig', buy: 350, tab: 'animals', stack: 1 }));
add(I('animal_dog', 'animal', { species: 'dog', buy: 250, tab: 'animals', stack: 1 }));
add(I('animal_cat', 'animal', { species: 'cat', buy: 250, tab: 'animals', stack: 1 }));
// Vehicles (bought like animals, parked next to you at once, driven like a horse)
add(I('vehicle_motorcycle', 'animal', { species: 'motorcycle', buy: 800, tab: 'vehicles', stack: 1 }));
add(I('vehicle_car_red', 'animal', { species: 'car', variant: 0, buy: 2500, tab: 'vehicles', stack: 1 }));
add(I('vehicle_car_blue', 'animal', { species: 'car', variant: 1, buy: 2500, tab: 'vehicles', stack: 1 }));
add(I('vehicle_car_yellow', 'animal', { species: 'car', variant: 2, buy: 2500, tab: 'vehicles', stack: 1 }));

// Placeables (crafted or bought)
const place = (id: string, extra: Partial<ItemDef> = {}) =>
  add(I(id, 'placeable', { places: id, ...extra }));
place('fence', { sell: 2 });
place('gate', { sell: 3 });
place('path_stone', { sell: 1 });
place('path_dirt', { sell: 1 });
place('wall_wood', { sell: 2 });
place('wall_stone', { sell: 3 });
place('floor_wood', { sell: 1 });
place('floor_stone', { sell: 1 });
place('door', { sell: 4 });
place('window', { sell: 3 });
place('chest', { sell: 10 });
place('trough', { sell: 5 });
place('workbench', { sell: 10 });
place('torch', { sell: 2 });
place('scarecrow', { sell: 8 });
place('bench', { sell: 5 });
place('table', { sell: 6 });
place('coop', { sell: 20 });
place('hutch', { sell: 15 });
place('sheepfold', { sell: 30 });
place('barn', { sell: 50 });
place('stall', { sell: 60 });
place('pigsty', { sell: 25 });
place('flowerbox', { sell: 5 });
place('well', { sell: 20 });
// Furniture (Möbler) – crafted or bought, usable inside the house and outside
place('bed', { sell: 15, buy: 120, tab: 'furniture' });
place('rug', { sell: 5, buy: 40, tab: 'furniture' });
place('chair', { sell: 3, buy: 25, tab: 'furniture' });
place('sofa', { sell: 10, buy: 90, tab: 'furniture' });
place('bookshelf', { sell: 8, buy: 70, tab: 'furniture' });
place('lamp', { sell: 5, buy: 45, tab: 'furniture' });
place('plant', { sell: 4, buy: 30, tab: 'furniture' });
place('painting', { sell: 5, buy: 60, tab: 'furniture' });
place('stove', { sell: 10, buy: 110, tab: 'furniture' });
place('clock', { sell: 5, buy: 50, tab: 'furniture' });
// Paint buckets (Måla): one bucket paints the farmhouse or a whole run of connected walls
export const PAINT_NAMES = ['red', 'yellow', 'blue', 'green', 'white', 'pink'] as const;
PAINT_NAMES.forEach((c, i) => add(I(`paint_${c}`, 'material', { paint: i + 1, buy: 25, sell: 5, tab: 'furniture' })));
// Season decorations
place('pumpkin_lantern', { buy: 30, tab: 'season', season: 'halloween', sell: 5 });
place('ghost_flag', { buy: 25, tab: 'season', season: 'halloween', sell: 5 });
place('xmas_tree', { buy: 80, tab: 'season', season: 'jul', sell: 10 });
place('lights', { buy: 30, tab: 'season', season: 'jul', sell: 5 });
place('snowman', { buy: 40, tab: 'season', season: 'jul', sell: 5 });
place('easter_twigs', { buy: 30, tab: 'season', season: 'pask', sell: 5 });
place('egg_basket', { buy: 25, tab: 'season', season: 'pask', sell: 5 });
place('maypole', { buy: 80, tab: 'season', season: 'midsommar', sell: 10 });
place('flower_wreath_decor', { buy: 20, tab: 'season', season: 'midsommar', sell: 5 });
// Souvenirs from the wider world (crafted from what you find, or found as they are)
place('crystal_lamp', { sell: 60 });
place('mushroom_lamp', { sell: 45 });
place('dino_skeleton', { sell: 120 });
place('wisp_jar', { sell: 30 });
place('dragon_egg');
// Minigames: the TV (shows every game the family has), game cartridges, and Spelhallen's prizes
place('tv', { sell: 40, buy: 250, tab: 'furniture' });
for (const g of ARCADE_GAMES) add(I(cartOf(g), 'material', { game: g, stack: 1 }));
place('plush_cow', { sell: 5 });
place('plush_hen', { sell: 5 });
place('plush_dragon', { sell: 10 });
place('trophy', { sell: 20 });
place('lava_lamp', { sell: 10 });
place('disco_ball', { sell: 15 });
place('neon_sign', { sell: 15 });

// Clothing
const cloth = (
  id: string,
  slot: 'hat' | 'shirt' | 'pants' | 'shoes',
  style: string,
  color: string,
  buy: number,
  season?: ItemDef['season'],
) => add(I(id, 'clothing', { clothing: { slot, style, color }, buy, tab: season ? 'season' : 'clothes', season, stack: 1 }));
cloth('shirt_red', 'shirt', 'plain', '#d9453b', 60);
cloth('shirt_blue', 'shirt', 'plain', '#3b6fd9', 60);
cloth('shirt_green', 'shirt', 'plain', '#3ba35b', 60);
cloth('shirt_yellow', 'shirt', 'plain', '#e8c23a', 60);
cloth('shirt_pink', 'shirt', 'plain', '#e87ab8', 60);
cloth('shirt_purple', 'shirt', 'plain', '#8a4fd1', 60);
cloth('shirt_stripes', 'shirt', 'stripes', '#3b6fd9', 90);
cloth('shirt_overalls', 'shirt', 'overalls', '#3b5fa6', 120);
// Dresses (worn in the shirt slot; they hide the pants)
cloth('dress_pink', 'shirt', 'dress', '#e87ab8', 90);
cloth('dress_blue', 'shirt', 'dress', '#5aa0e8', 90);
cloth('dress_purple', 'shirt', 'dress', '#8a4fd1', 90);
cloth('dress_mint', 'shirt', 'dress', '#5ac8a8', 90);
cloth('dress_red_belt', 'shirt', 'dress_belt', '#d9453b', 110);
cloth('dress_green_belt', 'shirt', 'dress_belt', '#3ba35b', 110);
cloth('dress_yellow_flowers', 'shirt', 'dress_flowers', '#e8c23a', 120);
cloth('dress_white_flowers', 'shirt', 'dress_flowers', '#f4f2ec', 120);
cloth('dress_midsommar', 'shirt', 'dress_flowers', '#9ad0f0', 100, 'midsommar');
cloth('dress_lucia', 'shirt', 'dress_belt', '#ffffff', 100, 'jul');
cloth('pants_blue', 'pants', 'plain', '#2f4c8a', 50);
cloth('pants_brown', 'pants', 'plain', '#7a5230', 50);
cloth('pants_green', 'pants', 'plain', '#3f7a3a', 50);
cloth('pants_red', 'pants', 'plain', '#a63838', 50);
cloth('pants_skirt_pink', 'pants', 'skirt', '#e87ab8', 70);
cloth('pants_skirt_blue', 'pants', 'skirt', '#5aa0e8', 70);
cloth('shoes_boots', 'shoes', 'boots', '#3a3a3a', 40);
cloth('shoes_rubber', 'shoes', 'boots', '#2e8a3a', 40);
cloth('shoes_red', 'shoes', 'plain', '#c43a3a', 30);
cloth('hat_straw', 'hat', 'straw', '#e0c060', 80);
cloth('hat_cap_red', 'hat', 'cap', '#d9453b', 60);
cloth('hat_cap_blue', 'hat', 'cap', '#3b6fd9', 60);
cloth('hat_beanie', 'hat', 'beanie', '#8a4fd1', 60);
cloth('hat_cowboy', 'hat', 'cowboy', '#8a5a2a', 120);
cloth('hat_flowerwreath', 'hat', 'wreath', '#e8e0a0', 50, 'midsommar');
cloth('hat_witch', 'hat', 'witch', '#2a1a3a', 90, 'halloween');
cloth('shirt_ghost', 'shirt', 'ghost', '#f0f0f0', 90, 'halloween');
cloth('hat_santa', 'hat', 'santa', '#d9453b', 80, 'jul');
cloth('shirt_xmas', 'shirt', 'xmas', '#2e8a3a', 100, 'jul');
cloth('hat_bunny', 'hat', 'bunny', '#f5e6e8', 70, 'pask');
cloth('shirt_easter', 'shirt', 'plain', '#f5e04a', 70, 'pask');
// Star rewards: bought with stars from quests and achievements
const starCloth = (id: string, slot: 'hat' | 'shirt' | 'pants' | 'shoes', style: string, color: string, stars: number) =>
  add(I(id, 'clothing', { clothing: { slot, style, color }, stars, tab: 'stars', stack: 1 }));
starCloth('hat_party', 'hat', 'party', '#e87ab8', 5);
starCloth('shirt_gold', 'shirt', 'plain', '#f2c230', 10);
starCloth('hat_crown', 'hat', 'crown', '#f2d35a', 20);
starCloth('shirt_star', 'shirt', 'star', '#3b3f8a', 30);
starCloth('gown_gold', 'shirt', 'gown', '#f2c230', 15);
starCloth('gown_blue', 'shirt', 'gown', '#3b6fd9', 15);
// Cave treasure clothes (not for sale)
add(I('hat_viking', 'clothing', { clothing: { slot: 'hat', style: 'viking', color: '#9d9a92' }, stack: 1 }));
add(I('shirt_knight', 'clothing', { clothing: { slot: 'shirt', style: 'plain', color: '#b8bcc4' }, stack: 1 }));
// Found in the caves and on the moon (not for sale)
const found = (id: string, slot: 'hat' | 'shirt', style: string, color: string) => add(I(id, 'clothing', { clothing: { slot, style, color }, stack: 1 }));
found('hat_pirate', 'hat', 'pirate', '#2b2622');
found('hat_explorer', 'hat', 'explorer', '#d9c48f');
found('hat_space', 'hat', 'space', '#e8eef5');
found('shirt_space', 'shirt', 'space', '#eef1f5');
found('hat_frog', 'hat', 'frog', '#5aae4a');
found('hat_dino', 'hat', 'dino', '#4f9a3a');
found('hat_ice_crown', 'hat', 'crown', '#bfe3f5');

export const item = (id: string): ItemDef => {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
};

// ---------- Crops ----------

export const CROPS: Record<string, CropDef> = {
  carrot: { id: 'carrot', seed: 'carrot_seed', produce: 'carrot', stages: [1, 1, 1], yield: [1, 2], seedsBack: [1, 2] },
  potato: { id: 'potato', seed: 'potato_seed', produce: 'potato', stages: [1, 1, 1, 1], yield: [2, 3], seedsBack: [1, 2] },
  strawberry: { id: 'strawberry', seed: 'strawberry_seed', produce: 'strawberry', stages: [1, 1, 1, 2], regrowTo: 2, yield: [1, 2], seedsBack: [0, 1] },
  tomato: { id: 'tomato', seed: 'tomato_seed', produce: 'tomato', stages: [1, 1, 2, 1], regrowTo: 2, yield: [1, 3], seedsBack: [0, 1] },
  pumpkin: { id: 'pumpkin', seed: 'pumpkin_seed', produce: 'pumpkin', stages: [1, 1, 1, 1, 1], yield: [1, 1], seedsBack: [1, 2] },
  sunflower: { id: 'sunflower', seed: 'sunflower_seed', produce: 'sunflower', stages: [1, 1, 1, 1], yield: [1, 1], seedsBack: [2, 3] },
  wheat: { id: 'wheat', seed: 'wheat_seed', produce: 'wheat', stages: [1, 1, 1], yield: [1, 2], seedsBack: [1, 2] },
};

// ---------- Objects ----------

const O = (kind: string, extra: Partial<ObjectDef> = {}): ObjectDef => ({
  kind,
  w: 1,
  h: 1,
  solid: true,
  breakWith: 'hammer',
  ...extra,
});

export const OBJECTS: Record<string, ObjectDef> = {};
const addO = (d: ObjectDef) => (OBJECTS[d.kind] = d);

// Natural resources
addO(O('tree', { breakWith: 'axe', drops: [{ item: 'wood', min: 3, max: 5 }], regrowDays: 4 }));
addO(O('tree_pine', { breakWith: 'axe', drops: [{ item: 'wood', min: 3, max: 5 }], regrowDays: 4 }));
addO(O('tree_apple', { breakWith: 'axe', drops: [{ item: 'wood', min: 3, max: 5 }], regrowDays: 4 }));
addO(O('stump', { breakWith: 'axe', drops: [{ item: 'wood', min: 1, max: 1 }] }));
addO(O('rock', { breakWith: 'pick', drops: [{ item: 'stone', min: 2, max: 4 }], regrowDays: 3 }));
addO(O('rock_small', { breakWith: 'pick', drops: [{ item: 'stone', min: 1, max: 2 }], regrowDays: 2 }));
addO(O('grass_tuft', { solid: false, flat: true, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 2 }, { item: 'hay', min: 0, max: 1 }], regrowDays: 2 }));
addO(O('bush', { breakWith: 'axe', drops: [{ item: 'fiber', min: 2, max: 3 }], regrowDays: 3 }));
addO(O('flower', { solid: false, flat: true, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 1 }], regrowDays: 3 }));
addO(O('wild_pumpkin', { harvest: true, drops: [{ item: 'pumpkin', min: 1, max: 1 }] }));
addO(O('wild_flower_mid', { solid: false, flat: true, harvest: true, drops: [{ item: 'fiber', min: 1, max: 1 }] }));
// Biome specials
addO(O('mushroom', { solid: false, flat: true, harvest: true, drops: [{ item: 'mushroom', min: 1, max: 2 }] }));
addO(O('beehive', { harvest: true, drops: [{ item: 'honey', min: 1, max: 1 }] }));
addO(O('iceberry', { solid: false, harvest: true, drops: [{ item: 'iceberry', min: 1, max: 3 }] }));
addO(O('snowman_wild', { breakWith: undefined }));
addO(O('ore', { breakWith: 'pick', drops: [{ item: 'stone', min: 1, max: 2 }, { item: 'gem', min: 0, max: 1 }] }));
addO(O('palm', { breakWith: 'axe', drops: [{ item: 'wood', min: 2, max: 4 }] }));
addO(O('shell', { solid: false, flat: true, harvest: true, drops: [{ item: 'shell', min: 1, max: 1 }] }));
addO(O('cactus', { harvest: true, drops: [{ item: 'cactus_fruit', min: 1, max: 2 }] }));
addO(O('signpost', { breakWith: undefined }));
// The wider world (2026-10-29). Skogen: blueberries. Träsket: cloudberries, reeds, dead trees and will-o'-the-wisps
addO(O('blueberry_bush', { harvest: true, drops: [{ item: 'blueberry', min: 2, max: 4 }] }));
addO(O('cloudberry', { solid: false, flat: true, harvest: true, drops: [{ item: 'cloudberry', min: 1, max: 2 }] }));
addO(O('reed', { solid: false, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 2 }] }));
addO(O('dead_tree', { breakWith: 'axe', drops: [{ item: 'wood', min: 1, max: 3 }] }));
addO(O('wisp', { solid: false, harvest: true, light: true, drops: [{ item: 'wisp_jar', min: 1, max: 1 }] }));
// Djungeln
addO(O('jungle_tree', { breakWith: 'axe', drops: [{ item: 'wood', min: 4, max: 6 }] }));
addO(O('banana_plant', { harvest: true, drops: [{ item: 'banana', min: 1, max: 3 }] }));
addO(O('jungle_flower', { solid: false, flat: true, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 1 }] }));
addO(O('ruin_pillar', { breakWith: undefined }));
// Vulkanen
addO(O('obsidian_rock', { breakWith: 'pick', drops: [{ item: 'obsidian', min: 1, max: 2 }, { item: 'stone', min: 0, max: 1 }] }));
addO(O('fire_crystal', { breakWith: 'pick', light: true, drops: [{ item: 'fire_crystal', min: 1, max: 1 }] }));
addO(O('steam_vent', { solid: false, flat: true, breakWith: undefined }));
// Svampskogen
addO(O('giant_mushroom', { breakWith: 'axe', drops: [{ item: 'fiber', min: 2, max: 3 }, { item: 'mushroom', min: 0, max: 2 }] }));
addO(O('giant_glowshroom', { breakWith: 'axe', light: true, drops: [{ item: 'fiber', min: 2, max: 3 }, { item: 'glowshroom', min: 1, max: 2 }] }));
addO(O('glowshroom', { solid: false, flat: true, harvest: true, light: true, drops: [{ item: 'glowshroom', min: 1, max: 2 }] }));
addO(O('fairy_ring', { w: 2, h: 2, solid: false, flat: true, breakWith: undefined, interact: 'fairy', loot: 'fairy' }));
// Dinodalen
addO(O('fern', { solid: false, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 2 }] }));
addO(O('dino_bones', { w: 3, h: 2, breakWith: undefined }));
addO(O('fossil_rock', { breakWith: 'pick', drops: [{ item: 'stone', min: 1, max: 1 }], loot: 'fossil_rock' }));
// Godislandet
addO(O('lollipop_tree', { harvest: true, drops: [{ item: 'lollipop', min: 1, max: 2 }] }));
addO(O('candy_cane', { harvest: true, drops: [{ item: 'polkagris', min: 1, max: 2 }] }));
// Buried treasure: an X in the sand, dug up with the hoe (the loot depends on the biome)
addO(O('dig_spot', { solid: false, flat: true, breakWith: 'hoe', loot: 'dig' }));
// Landmarks. Cave mouths, the temple, the pyramid and the gingerbread house lead into caves.
addO(O('cave_mouth', { w: 2, h: 2, interact: 'grotto', breakWith: undefined }));
addO(O('temple', { w: 4, h: 3, interact: 'grotto', breakWith: undefined }));
addO(O('pyramid', { w: 6, h: 4, interact: 'grotto', breakWith: undefined }));
addO(O('gingerbread_house', { w: 3, h: 3, interact: 'grotto', breakWith: undefined, light: true }));
addO(O('volcano', { w: 6, h: 5, breakWith: undefined, light: true }));
addO(O('shipwreck', { w: 4, h: 2, breakWith: undefined }));
// Rymdbasen and the moon
addO(O('rocket', { w: 2, h: 3, interact: 'rocket', breakWith: undefined, light: true }));
addO(O('satellite_dish', { w: 2, h: 2, breakWith: undefined }));
addO(O('ufo', { w: 3, h: 2, breakWith: undefined, light: true }));
addO(O('flag_se', { breakWith: undefined }));
addO(O('earth', { w: 4, h: 4, solid: false, flat: true, breakWith: undefined }));
addO(O('crater', { w: 2, h: 2, solid: false, flat: true, breakWith: undefined }));
addO(O('moon_rock', { breakWith: 'pick', drops: [{ item: 'moon_rock', min: 1, max: 2 }] }));
addO(O('star_crystal', { breakWith: 'pick', light: true, drops: [{ item: 'star_crystal', min: 1, max: 1 }] }));
addO(O('moon_cheese', { solid: false, harvest: true, drops: [{ item: 'moon_cheese', min: 1, max: 1 }] }));
// Inside the caves
addO(O('crystal', { breakWith: 'pick', light: true, drops: [{ item: 'crystal', min: 1, max: 2 }] }));
addO(O('gold_vein', { breakWith: 'pick', drops: [{ item: 'gold', min: 1, max: 3 }, { item: 'stone', min: 0, max: 1 }] }));
addO(O('gem_vein', { breakWith: 'pick', drops: [{ item: 'gem', min: 1, max: 1 }] }));
addO(O('stalagmite', { breakWith: 'pick', drops: [{ item: 'stone', min: 1, max: 1 }] }));
addO(O('loot_chest', { interact: 'loot', breakWith: undefined }));
addO(O('barrel', { drops: [{ item: 'wood', min: 1, max: 2 }] }));
addO(O('bones', { solid: false, flat: true, breakWith: undefined }));
// Village
addO(O('house_small', { w: 3, h: 3, breakWith: undefined }));
addO(O('market', { w: 2, h: 2, interact: 'catalogue', breakWith: undefined }));
addO(O('sellstall', { w: 2, h: 2, interact: 'sell', breakWith: undefined }));
addO(O('pizzeria', { w: 3, h: 2, interact: 'pizzeria', breakWith: undefined, light: true }));
addO(O('lantern', { solid: false, breakWith: undefined, light: true }));
addO(O('town_well', { interact: 'water', breakWith: undefined }));

// Built things (break -> same item back)
const built = (kind: string, extra: Partial<ObjectDef> = {}) =>
  addO(O(kind, { drops: [{ item: kind, min: 1, max: 1 }], ...extra }));
built('fence');
built('gate', { solid: false });
built('wall_wood');
built('wall_stone');
built('door', { solid: false });
built('window');
built('chest', { interact: 'chest' });
built('trough', { interact: 'feed' });
built('workbench', { interact: 'workbench' });
built('torch', { solid: false, light: true });
built('scarecrow');
built('bench');
built('table');
built('flowerbox');
built('well', { interact: 'water' });
built('bed', { w: 1, h: 2, interact: 'sleep' });
built('rug', { w: 2, h: 2, solid: false, flat: true });
built('chair');
built('sofa', { w: 2, h: 1 });
built('bookshelf');
built('lamp', { light: true });
built('plant');
built('painting', { solid: false, flat: true, harvest: true });
built('stove', { light: true, interact: 'cook' });
built('clock', { solid: false, flat: true });
built('door_out', { solid: false, flat: true, breakWith: undefined, drops: [] });
// Cave
addO(O('cave', { w: 2, h: 2, interact: 'cave', breakWith: undefined }));
addO(O('bathhouse', { w: 3, h: 2, interact: 'bath', breakWith: undefined }));
// The city: streets, blocks and stops (interaction with stops/stations lives with the travel feature)
addO(O('bus_stop', { interact: 'bus', breakWith: undefined }));
addO(O('train_station', { w: 3, h: 2, interact: 'train', breakWith: undefined, light: true }));
addO(O('apartment', { w: 3, h: 3, breakWith: undefined }));
addO(O('shop', { w: 3, h: 2, breakWith: undefined, light: true }));
addO(O('traffic_light', { breakWith: undefined }));
addO(O('street_lamp', { solid: false, breakWith: undefined, light: true }));
addO(O('parked_car', { w: 2, h: 1, breakWith: undefined }));
addO(O('bath_exit', { solid: false, flat: true, interact: 'exit', breakWith: undefined }));
addO(O('cave_exit', { solid: false, flat: true, interact: 'exit', breakWith: undefined }));
addO(O('cave_wall', { breakWith: undefined }));
addO(O('cave_torch', { solid: false, breakWith: undefined, light: true }));
addO(O('cave_rock', { breakWith: 'pick', drops: [{ item: 'stone', min: 1, max: 2 }] }));
addO(O('treasure', { interact: 'treasure', breakWith: undefined }));
// Minigames: the TV at home; Spelhallen with a machine per game (variant = ARCADE_GAMES index), the prize counter and the score board
built('tv', { w: 2, h: 1, interact: 'tv', light: true });
addO(O('arcade_hall', { w: 3, h: 2, interact: 'hall', breakWith: undefined, light: true }));
addO(O('arcade_machine', { interact: 'machine', breakWith: undefined, light: true }));
addO(O('prize_counter', { w: 3, h: 1, interact: 'prizes', breakWith: undefined, light: true }));
addO(O('score_board', { w: 2, h: 1, interact: 'scores', breakWith: undefined, light: true }));
addO(O('hall_wall', { breakWith: undefined }));
addO(O('hall_exit', { solid: false, flat: true, interact: 'exit', breakWith: undefined }));
built('plush_cow');
built('plush_hen');
built('plush_dragon');
built('trophy');
built('lava_lamp', { light: true });
built('disco_ball', { light: true });
built('neon_sign', { light: true });
built('coop', { w: 2, h: 2, houses: { species: 'hen', capacity: 4 } });
built('hutch', { w: 1, h: 1, houses: { species: 'rabbit', capacity: 2 } });
built('sheepfold', { w: 2, h: 2, houses: { species: 'sheep', capacity: 3 } });
built('barn', { w: 3, h: 2, houses: { species: 'cow', capacity: 2 } });
built('stall', { w: 3, h: 2, houses: { species: 'horse', capacity: 2 } });
built('pigsty', { w: 2, h: 2, houses: { species: 'pig', capacity: 3 } });
built('pumpkin_lantern');
built('ghost_flag', { solid: false });
built('xmas_tree', { w: 1, h: 2 });
built('lights', { solid: false });
built('snowman');
built('easter_twigs');
built('egg_basket');
built('maypole', { w: 1, h: 2 });
built('flower_wreath_decor', { solid: false, flat: true });
built('crystal_lamp', { light: true });
built('mushroom_lamp', { light: true });
built('dino_skeleton', { w: 3, h: 2 });
built('wisp_jar', { light: true });
built('dragon_egg');

// Farmhouse fixtures (not breakable)
addO(O('house', { w: 5, h: 4, breakWith: undefined }));
addO(O('mailbox', { interact: 'catalogue', breakWith: undefined }));
addO(O('sellbox', { interact: 'sell', breakWith: undefined }));
addO(O('wardrobe', { interact: 'wardrobe', breakWith: undefined }));
addO(O('start_chest', { interact: 'chest', breakWith: undefined }));
addO(O('start_bench', { interact: 'workbench', breakWith: undefined }));

export const objectDef = (kind: string): ObjectDef => {
  const d = OBJECTS[kind];
  if (!d) throw new Error(`unknown object ${kind}`);
  return d;
};

// ---------- Animals ----------

export const ANIMALS: Record<string, AnimalDef> = {
  hen: { species: 'hen', product: 'egg', house: 'coop', growDays: 3, speed: 20 },
  rabbit: { species: 'rabbit', house: 'hutch', growDays: 3, speed: 28 },
  sheep: { species: 'sheep', product: 'wool', house: 'sheepfold', growDays: 3, speed: 16 },
  cow: { species: 'cow', product: 'milk', house: 'barn', growDays: 3, speed: 14 },
  // Pigs root up truffles in the morning
  pig: { species: 'pig', product: 'truffle', house: 'pigsty', growDays: 3, speed: 16 },
  // Horses give nothing but can be ridden by their owner once grown
  horse: { species: 'horse', house: 'stall', growDays: 3, speed: 24 },
  // Pets follow their owner and need no house
  dog: { species: 'dog', house: '', growDays: 0, speed: 70, pet: true },
  cat: { species: 'cat', house: '', growDays: 0, speed: 60, pet: true },
  // Wild animals, one kind per biome; they wander and like to be petted
  fox: { species: 'fox', house: '', growDays: 0, speed: 34, wild: 'skog' },
  deer: { species: 'deer', house: '', growDays: 0, speed: 30, wild: 'ang' },
  penguin: { species: 'penguin', house: '', growDays: 0, speed: 18, wild: 'is' },
  crab: { species: 'crab', house: '', growDays: 0, speed: 20, wild: 'strand' },
  goat: { species: 'goat', house: '', growDays: 0, speed: 26, wild: 'berg' },
  lizard: { species: 'lizard', house: '', growDays: 0, speed: 36, wild: 'oken' },
  hare: { species: 'hare', house: '', growDays: 0, speed: 40, wild: 'ang', wildCount: [2, 4] },
  boar: { species: 'boar', house: '', growDays: 0, speed: 28, wild: 'skog', wildCount: [1, 2], tame: 0.5 },
  moose: { species: 'moose', house: '', growDays: 0, speed: 22, wild: 'skog', wildCount: [0, 1], tame: 0.2 },
  // The wider world: one or two kinds per new biome (all can be caught with the lasso)
  frog: { species: 'frog', house: '', growDays: 0, speed: 30, wild: 'trask', wildCount: [3, 5] },
  parrot: { species: 'parrot', house: '', growDays: 0, speed: 40, wild: 'djungel', wildCount: [2, 4], variants: 3 },
  monkey: { species: 'monkey', house: '', growDays: 0, speed: 38, wild: 'djungel', wildCount: [2, 3] },
  salamander: { species: 'salamander', house: '', growDays: 0, speed: 26, wild: 'vulkan', wildCount: [2, 4] },
  hedgehog: { species: 'hedgehog', house: '', growDays: 0, speed: 16, wild: 'svamp|skog', wildCount: [1, 3] },
  dino: { species: 'dino', house: '', growDays: 0, speed: 34, wild: 'dino', wildCount: [3, 5], tame: 0.4, variants: 3 },
  gummy: { species: 'gummy', house: '', growDays: 0, speed: 24, wild: 'godis', wildCount: [3, 6], variants: 4 },
  alien: { species: 'alien', house: '', growDays: 0, speed: 28, wild: 'mane', wildCount: [3, 4], tame: 0.5 },
  // Hatches from a dragon egg found in the volcano's cave; follows whoever put the egg down
  dragon: { species: 'dragon', house: '', growDays: 0, speed: 64, pet: true },
  // Predators (mild): they chase you a little and bite one heart; a lasso makes them pets
  bear: { species: 'bear', house: '', growDays: 0, speed: 26, wild: 'skog', wildCount: [1, 1], tame: 0.3, predator: { hp: 5, aggroRange: 4 } },
  wolf: { species: 'wolf', house: '', growDays: 0, speed: 34, wild: 'berg|skog', wildCount: [1, 2], tame: 0.3, predator: { hp: 3, aggroRange: 4 } },
  lynx: { species: 'lynx', house: '', growDays: 0, speed: 36, wild: 'berg', wildCount: [1, 1], tame: 0.3, predator: { hp: 3, aggroRange: 3 } },
  // Vehicles: city traffic drives around the blocks (speed in px/s) and always stops for people;
  // a bought car or moped stands where you park it and is driven at `ride` × walking speed
  car: { species: 'car', house: '', growDays: 0, speed: 48, vehicle: { speed: 48, ride: 2.6, traffic: true, rideable: true, seats: 2 } },
  motorcycle: { species: 'motorcycle', house: '', growDays: 0, speed: 60, vehicle: { speed: 60, ride: 2.2, traffic: true, rideable: true, seats: 1 } },
  bus: { species: 'bus', house: '', growDays: 0, speed: 36, vehicle: { speed: 36, traffic: true, seats: 6 } },
  train: { species: 'train', house: '', growDays: 0, speed: 40, vehicle: { speed: 40, traffic: true, seats: 8 } },
  // Cave monsters (gentle): slime, bat, troll and the boss troll
  slime: { species: 'slime', house: '', growDays: 0, speed: 22, mob: { hp: 2, drops: [{ item: 'gold', min: 1, max: 2, chance: 0.8 }, { item: 'heartberry', min: 1, max: 1, chance: 0.25 }] } },
  bat: { species: 'bat', house: '', growDays: 0, speed: 44, mob: { hp: 1, drops: [{ item: 'gold', min: 1, max: 1, chance: 0.6 }] } },
  troll: { species: 'troll', house: '', growDays: 0, speed: 26, mob: { hp: 4, drops: [{ item: 'gold', min: 2, max: 4, chance: 1 }, { item: 'heartberry', min: 1, max: 1, chance: 0.4 }] } },
  boss: { species: 'boss', house: '', growDays: 0, speed: 20, mob: { hp: 10, boss: true, drops: [{ item: 'gold', min: 8, max: 12, chance: 1 }] } },
};

// ---------- Recipes ----------

const R = (id: string, count: number, ...ins: [string, number][]): RecipeDef => ({
  id,
  out: { item: id, count },
  in: ins.map(([item, c]) => ({ item, count: c })),
});

export const RECIPES: RecipeDef[] = [
  R('fence', 4, ['wood', 2]),
  R('paper', 3, ['wood', 1]),
  R('gate', 1, ['wood', 3]),
  R('path_dirt', 4, ['fiber', 1]),
  R('path_stone', 4, ['stone', 2]),
  R('wall_wood', 2, ['wood', 2]),
  R('wall_stone', 2, ['stone', 3]),
  R('floor_wood', 4, ['wood', 2]),
  R('floor_stone', 4, ['stone', 2]),
  R('door', 1, ['wood', 4]),
  R('window', 1, ['wood', 2], ['stone', 1]),
  R('chest', 1, ['wood', 8]),
  R('workbench', 1, ['wood', 10], ['stone', 2]),
  R('trough', 1, ['wood', 4], ['fiber', 2]),
  R('torch', 2, ['wood', 1], ['fiber', 1]),
  R('scarecrow', 1, ['wood', 3], ['fiber', 5]),
  R('bench', 1, ['wood', 4]),
  R('table', 1, ['wood', 5]),
  R('flowerbox', 1, ['wood', 2], ['fiber', 2]),
  R('well', 1, ['stone', 15], ['wood', 4]),
  R('hutch', 1, ['wood', 10], ['fiber', 4]),
  R('coop', 1, ['wood', 20], ['stone', 4]),
  R('sheepfold', 1, ['wood', 25], ['stone', 6]),
  R('barn', 1, ['wood', 40], ['stone', 15]),
  R('stall', 1, ['wood', 45], ['stone', 10]),
  R('pigsty', 1, ['wood', 24], ['stone', 8]),
  R('hay', 2, ['fiber', 3]),
  R('chair', 1, ['wood', 3]),
  R('bed', 1, ['wood', 10], ['fiber', 6]),
  R('bookshelf', 1, ['wood', 8]),
  R('rug', 1, ['fiber', 8]),
  R('lamp', 1, ['wood', 2], ['fiber', 2]),
  R('plant', 1, ['fiber', 3], ['stone', 1]),
  R('sword', 1, ['wood', 5], ['stone', 4]),
  R('shield', 1, ['wood', 6], ['stone', 2]),
  R('bow', 1, ['wood', 4], ['fiber', 5]),
  R('lasso', 1, ['fiber', 5], ['wood', 2]),
  R('bazooka', 1, ['stone', 12], ['wood', 8], ['gold', 2]),
  R('rocket', 3, ['stone', 2], ['wood', 1]),
  R('crystal_lamp', 1, ['crystal', 2], ['stone', 2]),
  R('mushroom_lamp', 1, ['glowshroom', 3], ['wood', 1]),
  R('dino_skeleton', 1, ['fossil', 5]),
  ...PAINT_NAMES.map((c) => R(`paint_${c}`, 1, ['wood', 1], ['fiber', 2])),
];

/** What the treasure chest may hold besides gold and stars. */
export const TREASURE: { item: string; count: number; weight: number }[] = [
  { item: 'gem', count: 1, weight: 30 },
  { item: 'hat_viking', count: 1, weight: 15 },
  { item: 'shirt_knight', count: 1, weight: 15 },
  { item: 'pumpkin_seed', count: 5, weight: 20 },
  { item: 'strawberry_seed', count: 5, weight: 20 },
];

/** What loot chests, dig spots, fossil rocks and fairy rings give: `coins` kr, `stars` stars and `picks` draws from the pool. */
export interface LootTable {
  coins?: [number, number];
  stars?: number;
  picks: number;
  /** Weighted; an empty item id means nothing this time. */
  pool: { item: string; min: number; max: number; weight: number }[];
}
const L = (item: string, min: number, max: number, weight: number) => ({ item, min, max, weight });
/** Cave chests are `cave_<theme>`, dig spots `dig_<biome>` (else `dig`). */
export const LOOT: Record<string, LootTable> = {
  cave_rot: { coins: [10, 25], stars: 1, picks: 2, pool: [L('gold', 2, 4, 30), L('crystal', 1, 1, 15), L('glowshroom', 2, 3, 20), L('mushroom', 2, 4, 20), L('old_coin', 1, 2, 15), L('gem', 1, 1, 8), L('hat_frog', 1, 1, 8), L('cart_rally', 1, 1, 10)] },
  cave_is: { coins: [10, 25], stars: 1, picks: 2, pool: [L('crystal', 1, 2, 30), L('iceberry', 3, 5, 25), L('gold', 2, 4, 20), L('gem', 1, 1, 10), L('hat_ice_crown', 1, 1, 8), L('fish_gold', 1, 1, 5), L('cart_snow', 1, 1, 12)] },
  cave_kristall: { coins: [15, 30], stars: 1, picks: 2, pool: [L('crystal', 2, 3, 35), L('gold', 3, 5, 25), L('gem', 1, 1, 20), L('gem', 2, 2, 5), L('cart_dance', 1, 1, 8)] },
  cave_sjorovare: { coins: [20, 40], stars: 1, picks: 2, pool: [L('gold', 4, 8, 30), L('pearl', 1, 2, 25), L('old_coin', 2, 4, 25), L('hat_pirate', 1, 1, 15), L('gem', 1, 1, 5)] },
  cave_pyramid: { coins: [20, 40], stars: 1, picks: 2, pool: [L('gold', 4, 8, 30), L('scarab', 1, 1, 25), L('old_coin', 2, 3, 20), L('gem', 1, 1, 10)] },
  cave_tempel: { coins: [20, 40], stars: 1, picks: 2, pool: [L('gold', 4, 8, 30), L('idol', 1, 1, 20), L('hat_explorer', 1, 1, 15), L('banana', 3, 5, 15), L('gem', 1, 1, 10)] },
  cave_lava: { coins: [15, 30], stars: 1, picks: 2, pool: [L('fire_crystal', 1, 2, 30), L('obsidian', 2, 4, 25), L('gold', 3, 5, 20), L('gem', 1, 1, 10), L('dragon_egg', 1, 1, 9)] },
  cave_svamp: { coins: [10, 25], stars: 1, picks: 2, pool: [L('glowshroom', 3, 5, 30), L('fairy_dust', 1, 2, 25), L('mushroom', 3, 5, 20), L('crystal', 1, 1, 10), L('gem', 1, 1, 5)] },
  cave_fossil: { coins: [10, 25], stars: 1, picks: 2, pool: [L('fossil', 1, 3, 35), L('gold', 2, 4, 20), L('old_coin', 1, 2, 15), L('hat_dino', 1, 1, 12), L('gem', 1, 1, 8)] },
  cave_godis: { coins: [10, 25], stars: 1, picks: 2, pool: [L('polkagris', 3, 6, 30), L('lollipop', 2, 4, 30), L('gold', 2, 4, 15), L('crystal', 1, 1, 10), L('gem', 1, 1, 5), L('cart_dance', 1, 1, 12)] },
  cave_rymd: { coins: [20, 40], stars: 2, picks: 2, pool: [L('star_crystal', 1, 1, 25), L('moon_rock', 2, 4, 25), L('moon_cheese', 1, 2, 20), L('hat_space', 1, 1, 12), L('shirt_space', 1, 1, 12), L('cart_star', 1, 1, 12)] },
  // the chest by the shipwreck, and the one in the crashed UFO on the moon
  shipwreck: { coins: [15, 30], stars: 1, picks: 2, pool: [L('gold', 3, 6, 30), L('pearl', 1, 1, 20), L('old_coin', 1, 3, 25), L('hat_pirate', 1, 1, 15), L('fish_gold', 1, 1, 5)] },
  ufo: { coins: [20, 40], stars: 2, picks: 2, pool: [L('hat_space', 1, 1, 30), L('shirt_space', 1, 1, 30), L('star_crystal', 1, 2, 25), L('moon_cheese', 2, 2, 15), L('cart_star', 1, 1, 25)] },
  // the secret room behind the rubble in a cave (break it with the pickaxe)
  secret: { coins: [20, 50], stars: 2, picks: 1, pool: [L('gem', 1, 2, 40), L('gold', 5, 10, 40), L('crystal', 2, 3, 20)] },
  dig_strand: { picks: 1, pool: [L('old_coin', 1, 2, 30), L('gold', 1, 3, 30), L('shell', 2, 3, 25), L('pearl', 1, 1, 10), L('hat_pirate', 1, 1, 5)] },
  dig_oken: { picks: 1, pool: [L('old_coin', 1, 2, 30), L('gold', 2, 3, 35), L('cactus_fruit', 1, 2, 20), L('scarab', 1, 1, 10), L('gem', 1, 1, 5)] },
  dig_dino: { picks: 1, pool: [L('fossil', 1, 1, 55), L('old_coin', 1, 1, 15), L('gold', 1, 3, 20), L('gem', 1, 1, 10)] },
  dig_mane: { picks: 1, pool: [L('moon_rock', 1, 2, 40), L('star_crystal', 1, 1, 20), L('moon_cheese', 1, 1, 40)] },
  dig: { picks: 1, pool: [L('old_coin', 1, 2, 40), L('gold', 1, 3, 50), L('gem', 1, 1, 10)] },
  fossil_rock: { picks: 1, pool: [L('fossil', 1, 1, 60), L('', 0, 0, 40)] },
  fairy: { picks: 1, pool: [L('fairy_dust', 1, 1, 70), L('fairy_dust', 2, 2, 20), L('gem', 1, 1, 10)] },
};
/** Days before a loot chest has something for the same player again. */
export const LOOT_REFILL_DAYS = 7;

/** Recipes cooked at the stove (same shape as crafting recipes). */
export const COOKING: RecipeDef[] = [
  R('bread', 2, ['wheat', 3]),
  R('pancakes', 1, ['wheat', 2], ['egg', 1], ['milk', 1]),
  R('carrot_cake', 1, ['carrot', 3], ['egg', 1], ['wheat', 1]),
  R('pumpkin_pie', 1, ['pumpkin', 1], ['egg', 1], ['wheat', 1]),
  R('strawberry_jam', 1, ['strawberry', 4]),
  R('fish_soup', 1, ['fish_perch', 1], ['potato', 2], ['carrot', 1]),
  R('truffle_pasta', 1, ['truffle', 1], ['wheat', 2], ['milk', 1]),
  R('cloudberry_jam', 1, ['cloudberry', 4]),
  R('blueberry_pie', 1, ['blueberry', 6], ['wheat', 2], ['egg', 1]),
];

// ---------- Villagers ----------

export const NPCS: Record<string, NpcDef> = {
  greta: {
    id: 'greta',
    name: 'Tant Greta',
    x: 20,
    y: 13,
    appearance: { skin: '#f1c9a5', hair: '#d9d9d9', hairStyle: 'curly' },
    outfit: { shirt: 'shirt_purple', pants: 'pants_skirt_blue', shoes: 'shoes_red' },
    greeting: ['Hej lilla vän! Vad roligt att du kom.', 'Så fint ni har det på gården!', 'Jag bakar gärna om jag får ingredienser.'],
    routine: [
      { at: 0, x: 20, y: 13 }, // morning by the path
      { at: 0.25, x: 26, y: 22 }, // a stroll past the fields
      { at: 0.45, x: 36, y: 35 }, // visiting Sven by the pond
      { at: 0.7, x: 20, y: 13 }, // back for the evening
    ],
  },
  sven: {
    id: 'sven',
    name: 'Fiskar-Sven',
    x: 37,
    y: 36,
    appearance: { skin: '#dba97d', hair: '#8a4a1e', hairStyle: 'short' },
    outfit: { shirt: 'shirt_stripes', pants: 'pants_brown', shoes: 'shoes_rubber', hat: 'hat_straw' },
    greeting: ['Hallå där! Fiskarna nappar bra idag.', 'Vet du att det finns en guldfisk i dammen?', 'Stå stilla vid vattnet och vänta på napp.'],
    routine: [
      { at: 0, x: 37, y: 36 }, // north-west shore
      { at: 0.12, x: 45, y: 33 }, // around the north side
      { at: 0.24, x: 53, y: 37 }, // east shore
      { at: 0.36, x: 53, y: 45 },
      { at: 0.44, x: 44, y: 47 }, // south shore
      { at: 0.5, x: 35, y: 42 },
      { at: 0.55, x: 37, y: 36 }, // back where Greta comes visiting
    ],
  },
  elsa: {
    id: 'elsa',
    name: 'Lilla Elsa',
    x: 6,
    y: 20,
    appearance: { skin: '#f7d7c0', hair: '#f2d16b', hairStyle: 'ponytail' },
    outfit: { shirt: 'shirt_pink', pants: 'pants_skirt_blue', shoes: 'shoes_red' },
    greeting: ['Hej! Vill du leka?', 'Jag letar efter blommor. Har du sett några?', 'Min kanin heter Snövit. Fast hon bor hemma.', 'Jag kan springa jättefort!'],
    routine: [
      { at: 0, x: 6, y: 20 }, // by the forest edge, picking flowers
      { at: 0.2, x: 18, y: 16 }, // comes to look at the farm
      { at: 0.4, x: 30, y: 44 }, // plays by the pond's south side
      { at: 0.6, x: 24, y: 30 }, // the meadow
      { at: 0.8, x: 6, y: 20 }, // home for the evening
    ],
  },
};

/** The village east of the farm. */
export const VILLAGE_KEY = 'a:1,0';
NPCS.bo = {
  id: 'bo',
  name: 'Bagar-Bo',
  area: VILLAGE_KEY,
  x: 27,
  y: 29,
  appearance: { skin: '#f1c9a5', hair: '#2b2119', hairStyle: 'short' },
  outfit: { shirt: 'shirt_yellow', pants: 'pants_brown', shoes: 'shoes_boots', hat: 'hat_cap_red' },
  greeting: ['Välkommen till bageriet! Mjöl behövs alltid.', 'Nybakat bröd är det bästa som finns.', 'Har du vete? Jag bakar gärna.'],
  routine: [
    { at: 0, x: 27, y: 29 },
    { at: 0.3, x: 35, y: 29 },
    { at: 0.5, x: 28, y: 24 },
    { at: 0.7, x: 27, y: 29 },
  ],
};
NPCS.pino = {
  id: 'pino',
  name: 'Pizza-Pino',
  area: VILLAGE_KEY,
  x: 40,
  y: 24,
  appearance: { skin: '#dba97d', hair: '#2b2119', hairStyle: 'curly' },
  outfit: { shirt: 'shirt_red', pants: 'pants_brown', shoes: 'shoes_boots', hat: 'hat_cap_red' },
  greeting: ['Buongiorno! Vill du ha en pizza?', 'Pizzan är nybakad i stenugnen!', 'Tomater och vete – då blir det pizza!'],
  routine: [
    { at: 0, x: 40, y: 24 },
    { at: 0.35, x: 37, y: 28 },
    { at: 0.5, x: 40, y: 24 },
    { at: 0.75, x: 43, y: 26 },
    { at: 0.85, x: 40, y: 24 },
  ],
};
NPCS.stina = {
  id: 'stina',
  name: 'Smed-Stina',
  area: VILLAGE_KEY,
  x: 38,
  y: 30,
  appearance: { skin: '#b97a4e', hair: '#c43a2a', hairStyle: 'ponytail' },
  outfit: { shirt: 'shirt_overalls', pants: 'pants_blue', shoes: 'shoes_boots' },
  greeting: ['Hör du hammaren? Det är jag!', 'Sten och malm, det är mina favoriter.', 'Ädelstenar från bergen är underbara.'],
  routine: [
    { at: 0, x: 38, y: 30 },
    { at: 0.4, x: 42, y: 30 },
    { at: 0.6, x: 38, y: 30 },
  ],
};
NPCS.lind = {
  id: 'lind',
  name: 'Fru Lind',
  area: VILLAGE_KEY,
  x: 45,
  y: 27,
  appearance: { skin: '#f7d7c0', hair: '#f2d16b', hairStyle: 'long' },
  outfit: { shirt: 'shirt_green', pants: 'pants_skirt_pink', shoes: 'shoes_red', hat: 'hat_straw' },
  greeting: ['Mina blommor behöver sällskap.', 'Honung från ängen är det godaste jag vet.', 'Har du varit i skogen? Där växer svamp.'],
  routine: [
    { at: 0, x: 45, y: 27 },
    { at: 0.25, x: 41, y: 30 },
    { at: 0.55, x: 36, y: 26 },
    { at: 0.75, x: 45, y: 27 },
  ],
};

/** Context lines villagers say in their speech bubbles. {name} is the player's name. */
export const NPC_LINES: Record<string, { morning: string[]; day: string[]; evening: string[]; meet: string[] }> = {
  greta: {
    morning: ['God morgon, {name}!', 'Vilken fin morgon!'],
    day: ['Hej {name}!', 'Så flitigt du jobbar!', 'Har du sett mina blomlådor?'],
    evening: ['God kväll, {name}.', 'Nu blir det snart mörkt.'],
    meet: ['Hej Sven! Nappar det?', 'Hej Elsa, var är dina föräldrar?', 'Vilket väder!'],
  },
  sven: {
    morning: ['Morrn! Fiskarna är pigga nu.', 'God morgon, {name}!'],
    day: ['Hallå {name}!', 'Stå still så nappar det.', 'Gäddan är lurig.'],
    evening: ['Kvällen är bäst för fiske.', 'God kväll, {name}!'],
    meet: ['Hej Greta! Vill du ha fisk?', 'Hej Elsa! Inte för nära vattnet.', 'Fint väder för fiske!'],
  },
  bo: {
    morning: ['God morgon! Brödet är nybakat.', 'Morgonstund har guld i mund!'],
    day: ['Hej {name}! Vill du ha en bulle?', 'Vete, vete, vete…'],
    evening: ['Nu stänger bageriet.', 'God kväll, {name}!'],
    meet: ['Hej Stina! Hammaren går varm?', 'Fru Lind, vilka blommor!'],
  },
  stina: {
    morning: ['Smedjan är varm redan!', 'God morgon, {name}!'],
    day: ['Hej {name}! Har du sten med dig?', 'Klang, klang!'],
    evening: ['Jag släcker ässjan nu.', 'God kväll!'],
    meet: ['Hej Bo! Bröd till lunch?', 'Fru Lind, honung till kaffet?'],
  },
  pino: {
    morning: ['Buongiorno! Ugnen är varm.', 'God morgon, {name}! Pizza till frukost?'],
    day: ['Hej {name}! En pizza med extra ost?', 'Mamma mia, vilken dag!', 'Pizzapower gör dig snabb som vinden!'],
    evening: ['Sista pizzan för idag!', 'Buonanotte, {name}!'],
    meet: ['Bo! Har du vete till min deg?', 'Stina, ugnen behöver ses över!', 'Fru Lind, basilika till pizzan?'],
  },
  lind: {
    morning: ['God morgon! Blommorna har vaknat.', 'Vilken fin dag!'],
    day: ['Hej {name}! Luktar du på rosorna?', 'Bina surrar så fint idag.'],
    evening: ['Blommorna somnar nu.', 'God kväll, {name}.'],
    meet: ['Hej Bo! Fint väder!', 'Stina, du är alltid så flitig.'],
  },
  elsa: {
    morning: ['God morgon! Jag är redan vaken!', 'Titta, en fjäril!'],
    day: ['Hej {name}! Kom och lek!', 'Ska vi plocka blommor?', 'Jag har hittat en fin sten.'],
    evening: ['Jag måste hem snart…', 'Natti natti, {name}!'],
    meet: ['Hej tant Greta!', 'Hej Sven! Får jag se fisken?', 'Jag vann!'],
  },
};

// ---------- Gårdsbok (achievements) ----------

const A = (id: string, stat: string, goal: number, stars: number, icon: string): Achievement => ({ id, stat, goal, stars, icon });
export const ACHIEVEMENTS: Achievement[] = [
  A('harvest_1', 'harvest', 1, 1, 'carrot'),
  A('harvest_25', 'harvest', 25, 2, 'strawberry'),
  A('harvest_100', 'harvest', 100, 3, 'pumpkin'),
  A('chop_10', 'chop', 10, 1, 'axe'),
  A('chop_50', 'chop', 50, 2, 'wood'),
  A('mine_10', 'mine', 10, 1, 'pick'),
  A('mine_50', 'mine', 50, 2, 'stone'),
  A('build_10', 'build', 10, 1, 'fence'),
  A('build_50', 'build', 50, 3, 'coop'),
  A('walls_20', 'walls', 20, 2, 'wall_wood'),
  A('painted_1', 'painted', 1, 1, 'paint_red'),
  A('rooms_1', 'rooms', 1, 2, 'floor_wood'),
  A('fed_5', 'fed', 5, 1, 'hay'),
  A('fed_30', 'fed', 30, 2, 'animal_cow'),
  A('product_10', 'product', 10, 2, 'egg'),
  A('fish_1', 'fish', 1, 1, 'rod'),
  A('fish_20', 'fish', 20, 2, 'fish_pike'),
  A('fish_gold', 'fish_gold', 1, 3, 'fish_gold'),
  A('cook_5', 'cook', 5, 2, 'pancakes'),
  A('pizza_5', 'pizza', 5, 2, 'pizza'),
  A('quests_3', 'quests', 3, 1, 'egg_basket'),
  A('quests_15', 'quests', 15, 3, 'maypole'),
  A('coins_500', 'earned', 500, 1, 'animal_hen'),
  A('coins_3000', 'earned', 3000, 3, 'animal_cow'),
  A('areas_5', 'areas', 5, 2, 'signpost'),
  A('areas_15', 'areas', 15, 4, 'signpost'),
  A('wild_5', 'wildpet', 5, 2, 'animal_rabbit'),
  A('wild_20', 'wildpet', 20, 3, 'animal_sheep'),
  A('mobs_10', 'mobs', 10, 1, 'sword'),
  A('mobs_50', 'mobs', 50, 2, 'bow'),
  A('boss_1', 'boss', 1, 3, 'gem'),
  A('boss_5', 'boss', 5, 5, 'hat_viking'),
  A('boom_1', 'boom', 1, 1, 'bazooka'),
  A('boom_25', 'boom', 25, 2, 'rocket'),
  A('paint_1', 'paint', 1, 2, 'painting'),
  A('paint_10', 'paint', 10, 3, 'paper'),
  A('ride_1', 'ride', 1, 1, 'animal_horse'),
  A('ride_25', 'ride', 25, 2, 'stall'),
  A('drive_1', 'drive', 1, 1, 'vehicle_car_red'),
  A('drive_1000', 'drive_tiles', 1000, 2, 'vehicle_motorcycle'),
  A('truffle_1', 'truffle', 1, 1, 'truffle'),
  A('truffle_20', 'truffle', 20, 2, 'animal_pig'),
  A('swim_1', 'swim', 1, 1, 'shell'),
  A('swim_25', 'swim', 25, 2, 'shell'),
  A('trip_1', 'rides', 1, 1, 'lemonade'),
  A('train_10', 'train_rides', 10, 2, 'gem'),
  A('tame_1', 'tame', 1, 1, 'lasso'),
  A('tame_bear', 'tame_bear', 1, 2, 'fur'),
  A('tame_5', 'tame_species', 5, 3, 'animal_dog'),
  A('biomes_5', 'biomes', 5, 2, 'signpost'),
  A('biomes_all', 'biomes', 15, 6, 'star_crystal'),
  A('caves_1', 'caves', 1, 1, 'crystal'),
  A('arcade_1', 'arcade', 1, 1, 'tv'),
  A('arcade_25', 'arcade', 25, 2, 'cart_rally'),
  A('tickets_200', 'tickets', 200, 2, 'trophy'),
  A('caves_10', 'caves', 10, 3, 'gem'),
  A('loot_5', 'loot', 5, 2, 'old_coin'),
  A('loot_25', 'loot', 25, 4, 'idol'),
  A('dig_5', 'dig', 5, 2, 'pearl'),
  A('fossil_5', 'fossil', 5, 2, 'fossil'),
  A('moon_1', 'moon', 1, 3, 'moon_rock'),
  A('dragon_1', 'dragon', 1, 5, 'dragon_egg'),
];

/** Fish and how likely they bite (weights). */
export const FISH: { item: string; weight: number }[] = [
  { item: 'fish_roach', weight: 45 },
  { item: 'fish_perch', weight: 35 },
  { item: 'fish_pike', weight: 15 },
  { item: 'fish_gold', weight: 5 },
];
