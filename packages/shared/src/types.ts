// Core shared types. Identifiers are English; all player-facing text lives in sv.ts.

export const TILE = 16;
export const MAP_W = 64;
export const MAP_H = 64;
export const DAY_LENGTH_MS = 10 * 60 * 1000; // one game day = 10 real minutes
export const TICK_HZ = 20;
export const PLAYER_SPEED = 64; // px per second
export const RIDE_SPEED_MUL = 1.8; // on horseback
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
  | 'floor_stone'
  | 'snow'
  | 'gravel'
  | 'ice'
  | 'pool' // swimmable water (the bath house)
  | 'road' // asphalt (the city)
  | 'sidewalk'
  | 'crossing' // zebra crossing
  | 'rail'
  | 'dirt' // bare earth (3D game: a dug or placed dirt block on top)
  | 'stone' // bare rock (3D game: mountains, dug rock)
  // The wider world (2026-10-29): biome grounds, and ground nobody walks on (see WALL_TERRAIN)
  | 'rock' // a cliff, or the rock around a cave
  | 'sandstone' // red cliffs (the desert and Dinodalen)
  | 'basalt' // black cliffs (the volcano)
  | 'lava' // the volcano's glowing rivers
  | 'ash' // volcanic ground
  | 'mud' // the swamp's soft ground
  | 'bog' // the swamp's murky water (fish live in it)
  | 'moss' // the mushroom forest's soft ground
  | 'redsand' // Dinodalen
  | 'candy' // Godislandet's sugar ground
  | 'choco' // Godislandet's chocolate river
  | 'moon' // moon dust
  | 'space' // the starry sky around the moon
  // Minigames (2026-10-30)
  | 'carpet'; // Spelhallen's patterned arcade carpet

/** Ground nobody walks on or builds on: water and the like, cliffs, and the sky around the moon. */
export const WALL_TERRAIN: ReadonlySet<Terrain> = new Set<Terrain>(['water', 'bog', 'lava', 'choco', 'rock', 'sandstone', 'basalt', 'space']);
/** Cliffs (and the rock around a cave). */
export const isCliff = (t: Terrain | undefined): boolean => t === 'rock' || t === 'sandstone' || t === 'basalt';
/** Water you can fish in and fill the watering can from. */
export const isFishWater = (t: Terrain | undefined): boolean => t === 'water' || t === 'bog';

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
  | 'decor'
  | 'fish';

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
  tab?: 'seeds' | 'animals' | 'feed' | 'materials' | 'furniture' | 'clothes' | 'season' | 'stars' | 'pizzeria' | 'vehicles';
  /** Edible: eating restores hearts and gives a speed boost for this long. */
  food?: { boostMs: number };
  /** Price in stars (Stjärnor tab) instead of kr. */
  stars?: number;
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
  /** Vehicles: colour variant of the bought vehicle. */
  variant?: number;
  /** 3D game: the block placed when building with this item. */
  block?: 'dirt' | 'sand' | 'gravel' | 'cobble' | 'planks';
  /** For tools. */
  tool?: 'hoe' | 'can' | 'axe' | 'pick' | 'scythe' | 'hammer' | 'brush' | 'rod' | 'sword' | 'shield' | 'bow' | 'bazooka' | 'lasso';
  /** Paint buckets: colour index (1..6) applied to houses and wall pieces. */
  paint?: number;
  /** Game cartridges: the minigame it adds to the family's TV (never kept in the bag). */
  game?: string;
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
  /** Item dropped when broken with the hammer/axe/pick (and tool needed). The hoe digs up dig spots. */
  breakWith?: 'hammer' | 'axe' | 'pick' | 'scythe' | 'hoe';
  drops?: { item: string; min: number; max: number }[];
  /** Resource that regrows: days until it comes back. */
  regrowDays?: number;
  /** Housing capacity for a species. */
  houses?: { species: string; capacity: number };
  /** Opens a UI when interacted with. */
  interact?: 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'water' | 'feed' | 'cook' | 'cave' | 'exit' | 'treasure' | 'pizzeria' | 'bath' | 'sleep' | 'bus' | 'train' | 'grotto' | 'loot' | 'rocket' | 'fairy' | 'tv' | 'hall' | 'machine' | 'prizes' | 'scores';
  /** A loot table (LOOT in data.ts) rolled when it is broken, dug up or opened. */
  loot?: string;
  /** Gives light at night (client). */
  light?: boolean;
  /** Walkable floor-like decoration (rendered under the player). */
  flat?: boolean;
  /** Picked up by hand with any (or no) tool held. */
  harvest?: boolean;
}

export interface AnimalDef {
  species: string;
  product?: string;
  /** Building kind required. */
  house: string;
  /** Days until a baby is grown. */
  growDays: number;
  speed: number;
  /** Pets follow their owner instead of wandering near a house. */
  pet?: boolean;
  /** Wild animals live in these biomes only ('skog' or 'skog|berg'). */
  wild?: string;
  /** How many of them an area gets (default 3..5). */
  wildCount?: [number, number];
  /** Wild animals that come in several colours (AnimalState.variant). */
  variants?: number;
  /** Chance that a lasso throw tames it (default 0.6). */
  tame?: number;
  /** Predators chase players within aggroRange tiles and bite; hp like a monster, they drop fur. */
  predator?: { hp: number; aggroRange: number };
  /** Dungeon monsters: hit points and whether it is the boss. */
  mob?: { hp: number; boss?: boolean; drops: { item: string; min: number; max: number; chance: number }[] };
  /** Vehicles: speed multiplier when driven; traffic = AI-driven city vehicles; rideable = players may drive/board it. */
  vehicle?: { speed: number; ride?: number; traffic?: boolean; seats?: number; rideable?: boolean };
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
  /** A painted tavla: its pixels. Stacks with data never merge. */
  data?: string;
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
  /** Pending catalogue animal deliveries (arrive next morning). */
  orders: { species: string; homeId: number }[];
  /** Ids of quests this player has completed. */
  questsDone: string[];
  /** Stars earned from quests. */
  stars: number;
  /** Fishing in progress. */
  fishing?: { x: number; y: number; biteAt: number; bite: boolean; until: number };
  /** Lifetime counters for the Gårdsbok (harvest, chop, …). */
  stats: Record<string, number>;
  /** 3D game: height of the feet in blocks (undefined = standing on the ground). */
  z?: number;
  /** Which map the player is on: 'farm', 'dungeon' or an area key 'a:x,y'. */
  area: string;
  /** Area keys the player has been to (for the world map and teleport). */
  visited: string[];
  /** Hearts left (dungeon); restored when leaving. */
  hearts: number;
  /** Invulnerable until (wall clock) after being hit. */
  hurtUntil?: number;
  /** Bazooka reloading until (wall clock). */
  reloadUntil?: number;
  /** Ticks during which client positions are ignored (just moved to another map). */
  moveLock?: number;
  /** Id of the horse the player is riding. */
  riding?: number;
  /** Pizzapower: moves faster until this server time. */
  boostUntil?: number;
  /** Standing in a pool (set by the server tick, drives the splash and the Gårdsbok). */
  swimming?: boolean;
  /** Next time (wall clock) a lost heart grows back outside the cave. */
  healAt?: number;
  /** In bed: the night passes once every online player sleeps. */
  sleeping?: boolean;
  /** Unlocked achievement ids. */
  achievements: string[];
  /** Minigames: best scores, tickets and the TV games this player found. */
  arcade?: ArcadeState;
}

export interface ArcadeState {
  /** Best score per game. */
  best: Record<string, number>;
  /** Tickets to spend at Spelhallen's prize counter. */
  tickets: number;
  /** TV games this player found or won (the family's TV has everyone's). */
  games: string[];
  /** Tickets won on `day` (a daily limit keeps the prizes special). */
  day: number;
  won: number;
  /** The TV or machine last opened (wall clock), so scores come from a real game. */
  open?: { where: 'tv' | 'hall'; game?: string; at: number; last?: number };
}

export interface Achievement {
  id: string;
  /** Which stat it counts. */
  stat: string;
  goal: number;
  stars: number;
  /** Item id for the icon. */
  icon: string;
}

export interface NpcState {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** Ms spent blocked on the way to the current target. */
  stuckMs: number;
}

export interface Quest {
  id: string;
  npc: string;
  want: { item: string; count: number };
  reward: { coins: number; stars: number; item?: { item: string; count: number } };
  /** Dialogue line (Swedish). */
  text: string;
  /** Fixed story quest (not replaced daily). */
  fixed?: boolean;
}

export interface NpcDef {
  id: string;
  name: string;
  x: number;
  y: number;
  appearance: Appearance;
  outfit: Outfit;
  greeting: string[];
  /** Daily walking routine: where to be from `at` (fraction of the day, sorted). */
  routine: { at: number; x: number; y: number }[];
  /** Map the villager lives on: 'farm' (default) or an area key. */
  area?: string;
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
  /** Chest / trough contents. */
  items?: Inventory;
  /** Placed by (player id) — informational. */
  by?: string;
  /** Decorations: variant/tint. */
  variant?: number;
  /** A painted tavla hung up: its pixels. */
  data?: string;
  /** Loot chests and fairy rings: the day each player last took something. */
  openedBy?: Record<string, number>;
  /** A loot chest's own loot table (else the kind's). */
  loot?: string;
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
  /** False until a player has given it a name. */
  named: boolean;
  age: number; // days; < growDays = baby
  homeId: number; // object id of its house
  /** Pets: the player they follow. Horses: the player who bought it (only they may ride). */
  owner?: string;
  /** Told to stay (2D game): waits around this spot until the owner whistles. */
  stay?: { x: number; y: number };
  /** Horses: whistled for, so it follows its owner around the farm like a pet. */
  follow?: boolean;
  /** Vehicles (and some wild animals): colour variant. */
  variant?: number;
  /** Mobs and predators: remaining hit points and next time it may attack. */
  hp?: number;
  attackAt?: number;
  /** Runs away from a point until (wall clock) after a missed lasso throw. */
  fleeUntil?: number;
  fleeX?: number;
  fleeY?: number;
  /** Wander target (vehicles: the next corner of their route). */
  tx?: number;
  ty?: number;
  /** Traffic: which loop it drives and the corner it is heading for. */
  route?: { loop: number; leg: number };
  /** Traffic: when it may honk at the player in front of it / when it last stopped at a stop. */
  honkAt?: number;
  stoppedAt?: number;
  waitMs: number;
}

export interface DropState {
  id: number;
  item: string;
  count: number;
  x: number;
  y: number;
  /** The player who dropped it cannot pick it up again for this many ticks. */
  ignore?: { player: string; ticks: number };
  /** A dropped painted tavla keeps its pixels. */
  data?: string;
}

export interface WorldState {
  day: number;
  /** Milliseconds into the current day. */
  timeMs: number;
  /** Everyone is in bed: the new day starts at this wall-clock time. */
  nightAt?: number;
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
  /** Today's quest offers from the villagers. */
  quests: Quest[];
  /** Day the quests were generated for. */
  questsDay: number;
  /** Villager positions (not persisted; rebuilt from routines). */
  npcs: Record<string, NpcState>;
  /** 'dungeon', an area key 'a:x,y', or undefined for the farm. */
  area?: string;
  /** Biome of a generated area. */
  biome?: string;
  /** The current cave instance (farm world only, not persisted). */
  dungeon?: WorldState;
  /** Loaded overworld areas by key (farm world only). */
  areas?: Record<string, WorldState>;
  /** 3D game: the block layer (see voxel.ts). */
  voxel?: VoxelData;
  /** 2D game: today's weather, the same everywhere in the world (not persisted). */
  weather?: WeatherState;
  /** Dungeon: seed, size, whether the boss is beaten. */
  dungeonInfo?: { seed: number; w: number; h: number; cleared: boolean; level: number; start: { x: number; y: number }; bossRoom: { x: number; y: number; w: number; h: number } };
  /** A cave out in the world: its look, the box it fills, and the map and tile its mouth is on. */
  cave?: CaveInfo;
  /** Version of the area generator that built this map (see AREA_GEN in biomes.ts). */
  gen?: number;
  /** How many of each renewable thing (berries, crystals, buried treasure…) grow back here. */
  renew?: Record<string, number>;
}

/** The look of a cave out in the world (each biome has its own). */
export type CaveTheme = 'rot' | 'is' | 'kristall' | 'sjorovare' | 'pyramid' | 'tempel' | 'lava' | 'svamp' | 'fossil' | 'godis' | 'rymd';

export interface CaveInfo {
  theme: CaveTheme;
  /** The cave fills the top-left w × h tiles of the map; everything else is rock. */
  w: number;
  h: number;
  /** Where you appear (next to the way out). */
  start: { x: number; y: number };
  /** The map the cave mouth is on, and the tile in front of the mouth. */
  parent: string;
  out: { x: number; y: number };
}

/** 2D game: what the sky is doing. */
export type WeatherKind = 'sun' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'hail' | 'wind' | 'fog';

export interface WeatherState {
  kind: WeatherKind;
  /** Wall clock (ms) when this weather began and when it changes. */
  since: number;
  until: number;
  /** The weather before this one (sun after rain shows a rainbow). */
  prev?: WeatherKind;
  /** Chosen on the parent page: lasts its time and then the random pattern takes over again. */
  forced?: boolean;
  /** When the rain last watered the fields. */
  rainedAt?: number;
}

export const key = (x: number, y: number): string => `${x},${y}`;

/** 3D game: generated column heights (MAP_W × MAP_H) and every block players changed ("x,y,h" → block). */
export interface VoxelData {
  heights: number[];
  edits: Record<string, number>;
  seed: number;
}
