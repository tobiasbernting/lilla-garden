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
  WorldObject,
  WorldState,
} from './types.ts';

/** A change to the world that the server broadcasts after applying. `area` marks dungeon changes. */
export type Change =
  | { t: 'terrain'; x: number; y: number; terrain: Terrain; area?: 'dungeon' }
  | { t: 'crop'; k: string; crop: CropState | null; area?: 'dungeon' }
  | { t: 'object'; id: number; obj: WorldObject | null; area?: 'dungeon' }
  | { t: 'animal'; id: number; animal: AnimalState | null; area?: 'dungeon' }
  | { t: 'drop'; id: number; drop: DropState | null; area?: 'dungeon' }
  /** Full player record (inventory, coins, outfit…). Sent to everyone; inventory only matters to the owner. */
  | { t: 'player'; id: string; player: PlayerState | null }
  | { t: 'day'; day: number }
  | { t: 'toast'; to: string | null; text: string }
  | { t: 'open'; to: string; ui: 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'nameAnimal' | 'npc' | 'cook'; id?: number; npc?: string }
  | { t: 'quests'; quests: Quest[] }
  | { t: 'fx'; x: number; y: number; kind: 'heart' | 'sparkle' | 'water' | 'chop' | 'poof' | 'coin' | 'hit' | 'arrow'; area?: 'dungeon'; from?: { x: number; y: number } }
  /** Sent to one player when they enter the cave (full instance) or when it is torn down (null). */
  | { t: 'dungeon'; to: string; world: WorldState | null };

/** A slot in the player's own inventory (chest undefined) or in a chest object. */
export interface SlotRef {
  chest?: number;
  slot: number;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string }
  | { t: 'move'; x: number; y: number; facing: Facing; moving: boolean }
  | { t: 'act'; tx: number; ty: number }
  | { t: 'select'; slot: number }
  | { t: 'swap'; a: SlotRef; b: SlotRef }
  | { t: 'craft'; recipe: string }
  | { t: 'cook'; recipe: string }
  | { t: 'buy'; item: string; qty: number }
  | { t: 'sell'; slot: number; qty: number }
  | { t: 'equip'; slot: 'hat' | 'shirt' | 'pants' | 'shoes'; item: string | null }
  | { t: 'emote'; id: string }
  | { t: 'drop'; slot: number; qty: number }
  | { t: 'nameAnimal'; id: number; name: string }
  | { t: 'quest'; id: string }
  | { t: 'ping' };

export interface PlayerSnap {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  held: string | null;
  emote?: { id: string; until: number };
  area?: 'dungeon';
}

export interface NpcSnap {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

export interface AnimalSnap {
  id: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  area?: 'dungeon';
}

export type ServerMsg =
  | { t: 'welcome'; you: string; world: WorldState; season: Season; now: number; tick: number }
  | { t: 'state'; timeMs: number; day: number; season: Season; players: PlayerSnap[]; animals: AnimalSnap[]; npcs: NpcSnap[]; now: number }
  | { t: 'changes'; changes: Change[] }
  | { t: 'error'; text: string }
  | { t: 'pong' };

export interface PlayerSummary {
  id: string;
  name: string;
  appearance: Appearance;
  outfit: Outfit;
}
