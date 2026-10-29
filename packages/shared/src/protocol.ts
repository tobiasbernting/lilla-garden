import type {
  AnimalState,
  Appearance,
  CropState,
  DropState,
  Facing,
  Outfit,
  PlayerState,
  Quest,
  Season,
  Terrain,
  WeatherState,
  WorldObject,
  WorldState,
} from './types.ts';

/** A change to the world that the server broadcasts after applying. `area` marks dungeon changes. */
export type Change =
  | { t: 'terrain'; x: number; y: number; terrain: Terrain; area?: string }
  /** 3D game: one block dug or placed. */
  | { t: 'block'; x: number; y: number; h: number; b: number; area?: string }
  | { t: 'crop'; k: string; crop: CropState | null; area?: string }
  | { t: 'object'; id: number; obj: WorldObject | null; area?: string }
  | { t: 'animal'; id: number; animal: AnimalState | null; area?: string }
  | { t: 'drop'; id: number; drop: DropState | null; area?: string }
  /** Full player record (inventory, coins, outfit…). Sent to everyone; inventory only matters to the owner. */
  | { t: 'player'; id: string; player: PlayerState | null }
  | { t: 'day'; day: number }
  | { t: 'toast'; to: string | null; text: string }
  | { t: 'open'; to: string; ui: 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'nameAnimal' | 'npc' | 'cook' | 'paint' | 'pizzeria' | 'travel'; id?: number; npc?: string }
  /** Private: the rider boards a bus, a train or the rocket (the client plays the trip). */
  | { t: 'ride'; to: string; via: 'bus' | 'train' | 'rocket'; place: string }
  | { t: 'quests'; quests: Quest[] }
  | { t: 'fx'; x: number; y: number; kind: 'heart' | 'sparkle' | 'water' | 'chop' | 'poof' | 'coin' | 'hit' | 'arrow' | 'rocket' | 'boom' | 'splash' | 'lasso' | 'honk'; area?: string; from?: { x: number; y: number } }
  /** 2D game: someone said something. `old` marks history sent to a player who just came online. */
  | { t: 'chat'; from: string; name: string; text: string; at: number; old?: boolean }
  /** Sent to one player when they enter another map (full state) or when it is torn down (null). */
  | { t: 'areaData'; to: string; key: string; world: WorldState | null };

/** A slot in the player's own inventory (chest undefined) or in a chest object. */
export interface SlotRef {
  chest?: number;
  slot: number;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string }
  | { t: 'move'; x: number; y: number; z?: number; facing: Facing; moving: boolean }
  /** 3D game: dig the block at a cell, or build one there. */
  | { t: 'dig'; x: number; y: number; h: number }
  | { t: 'place'; x: number; y: number; h: number }
  | { t: 'act'; tx: number; ty: number }
  | { t: 'select'; slot: number }
  | { t: 'swap'; a: SlotRef; b: SlotRef }
  | { t: 'craft'; recipe: string }
  | { t: 'cook'; recipe: string }
  | { t: 'buy'; item: string; qty: number }
  | { t: 'sell'; slot: number; qty: number }
  | { t: 'equip'; slot: 'hat' | 'shirt' | 'pants' | 'shoes'; item: string | null }
  | { t: 'emote'; id: string }
  | { t: 'honk' }
  | { t: 'drop'; slot: number; qty: number }
  | { t: 'nameAnimal'; id: number; name: string }
  | { t: 'quest'; id: string }
  | { t: 'travel'; dir: 'n' | 's' | 'e' | 'w' }
  | { t: 'teleport'; to: string }
  | { t: 'ride'; via: 'bus' | 'train'; to: string }
  | { t: 'paint'; pixels: string }
  /** 2D game: tell your pets and horses to stay, or whistle for them. */
  | { t: 'pets'; cmd: 'stay' | 'come' }
  /** 2D game: a chat line to everyone. */
  | { t: 'chat'; text: string }
  | { t: 'ping' };

export interface PlayerSnap {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  held: string | null;
  emote?: { id: string; until: number };
  area?: string;
  /** 3D game: feet height in blocks. */
  z?: number;
}

export interface NpcSnap {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  area?: string;
}

export interface AnimalSnap {
  id: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  area?: string;
}

export type ServerMsg =
  /** `biomes`: the biome of every explored map (for the world map). */
  | { t: 'welcome'; you: string; world: WorldState; season: Season; now: number; tick: number; biomes?: Record<string, string> }
  | { t: 'state'; timeMs: number; day: number; season: Season; players: PlayerSnap[]; animals: AnimalSnap[]; npcs: NpcSnap[]; now: number; weather?: WeatherState }
  | { t: 'changes'; changes: Change[] }
  | { t: 'error'; text: string }
  | { t: 'pong' };

export interface PlayerSummary {
  id: string;
  name: string;
  appearance: Appearance;
  outfit: Outfit;
}
