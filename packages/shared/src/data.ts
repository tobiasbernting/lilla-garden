import type { AnimalDef, CropDef, ItemDef, ObjectDef, RecipeDef } from './types.ts';

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
add(I('wood', 'material', { sell: 2, buy: 5, tab: 'materials' }));
add(I('stone', 'material', { sell: 2, buy: 5, tab: 'materials' }));
add(I('fiber', 'material', { sell: 1 }));
add(I('hay', 'feed', { sell: 1, buy: 4, tab: 'feed' }));

// Animal products
add(I('egg', 'animal_product', { sell: 15 }));
add(I('milk', 'animal_product', { sell: 40 }));
add(I('wool', 'animal_product', { sell: 50 }));
add(I('egg_pask', 'animal_product', { sell: 25 }));

// Animals (catalogue)
add(I('animal_hen', 'animal', { species: 'hen', buy: 150, tab: 'animals', stack: 1 }));
add(I('animal_rabbit', 'animal', { species: 'rabbit', buy: 200, tab: 'animals', stack: 1 }));
add(I('animal_sheep', 'animal', { species: 'sheep', buy: 400, tab: 'animals', stack: 1 }));
add(I('animal_cow', 'animal', { species: 'cow', buy: 600, tab: 'animals', stack: 1 }));

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
place('flowerbox', { sell: 5 });
place('well', { sell: 20 });
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

// Built things (break -> same item back)
const built = (kind: string, extra: Partial<ObjectDef> = {}) =>
  addO(O(kind, { drops: [{ item: kind, min: 1, max: 1 }], ...extra }));
built('fence');
built('gate', { solid: false });
built('wall_wood');
built('wall_stone');
built('door', { solid: false });
built('chest', { interact: 'chest' });
built('trough', { interact: 'feed' });
built('workbench', { interact: 'workbench' });
built('torch', { solid: false });
built('scarecrow');
built('bench');
built('table');
built('flowerbox');
built('well', { interact: 'water' });
built('coop', { w: 2, h: 2, houses: { species: 'hen', capacity: 4 } });
built('hutch', { w: 1, h: 1, houses: { species: 'rabbit', capacity: 2 } });
built('sheepfold', { w: 2, h: 2, houses: { species: 'sheep', capacity: 3 } });
built('barn', { w: 3, h: 2, houses: { species: 'cow', capacity: 2 } });
built('pumpkin_lantern');
built('ghost_flag', { solid: false });
built('xmas_tree', { w: 1, h: 2 });
built('lights', { solid: false });
built('snowman');
built('easter_twigs');
built('egg_basket');
built('maypole', { w: 1, h: 2 });
built('flower_wreath_decor', { solid: false, flat: true });

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
};

// ---------- Recipes ----------

const R = (id: string, count: number, ...ins: [string, number][]): RecipeDef => ({
  id,
  out: { item: id, count },
  in: ins.map(([item, c]) => ({ item, count: c })),
});

export const RECIPES: RecipeDef[] = [
  R('fence', 4, ['wood', 2]),
  R('gate', 1, ['wood', 3]),
  R('path_dirt', 4, ['fiber', 1]),
  R('path_stone', 4, ['stone', 2]),
  R('wall_wood', 2, ['wood', 3]),
  R('wall_stone', 2, ['stone', 3]),
  R('floor_wood', 4, ['wood', 2]),
  R('floor_stone', 4, ['stone', 2]),
  R('door', 1, ['wood', 4]),
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
  R('hay', 2, ['fiber', 3]),
];
