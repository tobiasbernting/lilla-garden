// Core shared types. Identifiers are English; all player-facing text lives in sv.ts.

export const TILE = 16;
export const MAP_W = 64;
export const MAP_H = 64;
export const DAY_LENGTH_MS = 10 * 60 * 1000; // one game day = 10 real minutes
export const TICK_HZ = 20;
export const PLAYER_SPEED = 64; // px per second
export const MAX_PLAYERS = 8;
export const HOTBAR_SIZE = 8;
export const BACKPACK_SIZE = 24;
export const INVENTORY_SIZE = HOTBAR_SIZE + BACKPACK_SIZE;
export const CHEST_SIZE = 32;
export const MAX_STACK = 99;
export const START_COINS = 150;
export const WATERING_CAN_CHARGES = 20;

export type Terrain =
  | 'grass'
  | 'soil'
  | 'soil_wet'
  | 'water'
  | 'sand'
  | 'path_stone'
  | 'path_dirt'
  | 'floor_wood'
  | 'floor_stone';

export type Facing = 'down' | 'up' | 'left' | 'right';

export type Season = 'none' | 'halloween' | 'jul' | 'pask' | 'midsommar';

export type ItemCategory =
  | 'tool'
  | 'seed'
  | 'crop'
  | 'material'
  | 'placeable'
  | 'animal_product'
  | 'feed'
  | 'clothing'
  | 'animal'
  | 'decor';

export type ClothingSlot = 'hat' | 'shirt' | 'pants' | 'shoes';

export interface ItemDef {
  id: string;
  category: ItemCategory;
  /** Max stack size (tools 1). */
  stack: number;
  /** Price when sold in the sell box; undefined = cannot be sold. */
  sell?: number;
  /** Price in the catalogue; undefined = not for sale. */
  buy?: number;
  /** Catalogue tab, if sold. */
  tab?: 'seeds' | 'animals' | 'feed' | 'materials' | 'clothes' | 'season';
  /** Season this item is only available in (catalogue). */
  season?: Season;
  /** For seeds: the crop they grow. */
  crop?: string;
  /** For placeables: the object kind placed. */
  places?: string;
  /** For clothing. */
  clothing?: { slot: ClothingSlot; style: string; color: string };
  /** For animals: species that moves in. */
  species?: string;
  /** For tools. */
  tool?: 'hoe' | 'can' | 'axe' | 'pick' | 'scythe' | 'hammer' | 'brush';
  /** Icon reference in the generated atlas. */
  icon: string;
}

export interface CropDef {
  id: string;
  seed: string;
  produce: string;
  /** Days per stage; length = number of growth stages before harvest. */
  stages: number[];
  /** After harvest, go back to this stage instead of being removed. */
  regrowTo?: number;
  /** Produce count on harvest [min, max]. */
  yield: [number, number];
  /** Seeds returned on harvest [min, max]. */
  seedsBack: [number, number];
}

export interface ObjectDef {
  kind: string;
  w: number;
  h: number;
  solid: boolean;
  /** Item dropped when broken with the hammer/axe/pick (and tool needed). */
  breakWith?: 'hammer' | 'axe' | 'pick' | 'scythe';
  drops?: { item: string; min: number; max: number }[];
  /** Resource that regrows: days until it comes back. */
  regrowDays?: number;
  /** Housing capacity for a species. */
  houses?: { species: string; capacity: number };
  /** Opens a UI when interacted with. */
  interact?: 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'water' | 'feed';
  /** Walkable floor-like decoration (rendered under the player). */
  flat?: boolean;
}

export interface AnimalDef {
  species: string;
  product?: string;
  /** Building kind required. */
  house: string;
  /** Days until a baby is grown. */
  growDays: number;
  speed: number;
}

export interface RecipeDef {
  id: string;
  out: { item: string; count: number };
  in: { item: string; count: number }[];
}

// ---- World state ----

export interface ItemStack {
  item: string;
  count: number;
  /** Tool-specific data (watering can charges). */
  charges?: number;
}

export type Inventory = (ItemStack | null)[];

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: string;
}

export interface Outfit {
  hat?: string;
  shirt?: string;
  pants?: string;
  shoes?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  appearance: Appearance;
  outfit: Outfit;
  /** Owned clothing item ids. */
  wardrobe: string[];
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  coins: number;
  inventory: Inventory;
  selected: number;
  online: boolean;
  emote?: { id: string; until: number };
  /** Pending catalogue animal deliveries. */
  orders: { species: string }[];
}

export interface CropState {
  crop: string;
  stage: number;
  /** Days accumulated in the current stage. */
  progress: number;
  watered: boolean;
}

export interface WorldObject {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** Chest contents. */
  items?: Inventory;
  /** Resource regrowing: days left. */
  regrow?: number;
  /** Placed by (player id) — informational. */
  by?: string;
  /** Decorations: variant/tint. */
  variant?: number;
}

export interface AnimalState {
  id: number;
  species: string;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  hearts: number; // 0..5
  /** Progress towards the next heart 0..1 */
  heartProgress: number;
  fed: boolean;
  petted: boolean;
  brushed: boolean;
  hasProduct: boolean;
  age: number; // days; < growDays = baby
  homeId: number; // object id of its house
  /** Wander target. */
  tx?: number;
  ty?: number;
  waitMs: number;
}

export interface DropState {
  id: number;
  item: string;
  count: number;
  x: number;
  y: number;
}

export interface WorldState {
  day: number;
  /** Milliseconds into the current day. */
  timeMs: number;
  terrain: Terrain[]; // MAP_W * MAP_H
  crops: Record<string, CropState>; // key "x,y"
  objects: Record<number, WorldObject>;
  /** Fast lookup: tile key -> object id (including footprint tiles). */
  occupancy: Record<string, number>;
  animals: Record<number, AnimalState>;
  drops: Record<number, DropState>;
  players: Record<string, PlayerState>;
  nextId: number;
  seasonOverride: Season | null;
}

export const key = (x: number, y: number): string => `${x},${y}`;
