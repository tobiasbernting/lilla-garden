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
import type { SagaZone } from './saga.ts';
import type { SagaSnap } from './sagasim.ts';
import type { CarBody, CarPart, CarSnap, CarStyle, GarageCar, RaceResultLine, RaceRules, RoomInfo } from './rally.ts';
import type { IceServer, VoiceState } from './voice.ts';

/** A change to the world that the server broadcasts after applying. `area` marks dungeon changes. */
export type Change =
  | { t: 'terrain'; x: number; y: number; terrain: Terrain; area?: string }
  | { t: 'crop'; k: string; crop: CropState | null; area?: string }
  | { t: 'object'; id: number; obj: WorldObject | null; area?: string }
  | { t: 'animal'; id: number; animal: AnimalState | null; area?: string }
  | { t: 'drop'; id: number; drop: DropState | null; area?: string }
  /** Full player record (inventory, coins, outfit…). Sent to everyone; inventory only matters to the owner. */
  | { t: 'player'; id: string; player: PlayerState | null }
  | { t: 'day'; day: number }
  | { t: 'toast'; to: string | null; text: string }
  | { t: 'open'; to: string; ui: 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'nameAnimal' | 'npc' | 'cook' | 'paint' | 'pizzeria' | 'travel' | 'arcade' | 'prizes' | 'scores' | 'saga' | 'sagaClass' | 'rally'; id?: number; npc?: string }
  /** Private: the rider boards a bus, a train or the rocket (the client plays the trip). */
  | { t: 'ride'; to: string; via: 'bus' | 'train' | 'rocket'; place: string }
  | { t: 'quests'; quests: Quest[] }
  | { t: 'fx'; x: number; y: number; kind: 'heart' | 'sparkle' | 'water' | 'chop' | 'poof' | 'coin' | 'hit' | 'arrow' | 'rocket' | 'boom' | 'splash' | 'lasso' | 'honk'; area?: string; from?: { x: number; y: number } }
  /** 2D game: someone said something. `old` marks history sent to a player who just came online. */
  | { t: 'chat'; from: string; name: string; text: string; at: number; old?: boolean }
  /** Sent to one player when they enter another map (full state) or when it is torn down (null). */
  | { t: 'areaData'; to: string; key: string; world: WorldState | null }
  /** The server moved a player within their map (blink, charge, getting up): their client jumps there too. */
  | { t: 'warp'; id: string; x: number; y: number; area?: string }
  /** Dungeons: a spell or a monster's attack, for the picture. `by` is a player id or a monster's animal id. */
  | { t: 'spell'; area: string; by: string | number; spell: string; x: number; y: number; tx?: number; ty?: number; on?: string | number }
  /** Dungeons: a number floating up from a player (id) or a monster (animal id): damage, healing, or a stun or interrupt. */
  | { t: 'hit'; area: string; on: string | number; n: number; kind: 'dmg' | 'heal' | 'crit' | 'block' | 'stun' | 'kick' | 'miss' }
  /** Dungeons: a boss's attack marked on the ground until it lands, or burning ground; null when it is gone. */
  | { t: 'zone'; area: string; id: string; zone: SagaZone | null }
  /** Dungeons: a boss says something to everyone inside. */
  | { t: 'yell'; area: string; name: string; text: string }
  /** Big words across the screen: a dungeon's name, a boss beaten (celebrate!), a new chapter, a rest stone, everyone fallen. */
  | { t: 'banner'; to: string | null; area?: string; text: string; sub?: string; kind?: 'enter' | 'boss' | 'cleared' | 'chapter' | 'reward' | 'rest' | 'wipe' }
  /** What a dungeon chest gave you (a loot window in rarity colours). */
  | { t: 'loot'; to: string; from: string; items: { item: string; count: number }[]; coins: number; stars: number };

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
  | { t: 'sort'; chest?: number }
  | { t: 'quickStack'; chest: number }
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
  /** A minigame run ended (TV or a machine in Spelhallen). */
  | { t: 'arcade'; game: string; score: number }
  /** Swap tickets for a prize at Spelhallen's prize counter. */
  | { t: 'prize'; item: string }
  /** 2D game: tell your pets and horses to stay, or whistle for them. */
  | { t: 'pets'; cmd: 'stay' | 'come' }
  /** 2D game: a chat line to everyone. */
  | { t: 'chat'; text: string }
  /** Dungeons: cast a spell at a monster (animal id) or a friend (player id); left out, the server picks. */
  | { t: 'cast'; spell: string; target?: number | string }
  /** Dungeons: drink a healing potion. */
  | { t: 'potion' }
  /** The saga: pick a class at Kämpastenen, hear or hand in Völvan's chapter, take or hand in a villager's quest. */
  | { t: 'saga'; a: 'class'; cls: string }
  | { t: 'saga'; a: 'chapter' }
  | { t: 'saga'; a: 'quest'; id: string }
  /** Jump to a family member, wherever they are. */
  | { t: 'jump'; to: string }
  /** Rallyvärlden, the garage: buy a car, pick the one you drive, buy the next level of a part, change the style (the server charges for what changed), repair, rename, sell. */
  | { t: 'garage'; a: 'buyCar'; body: CarBody; name?: string }
  | { t: 'garage'; a: 'select'; car: number }
  | { t: 'garage'; a: 'part'; car: number; part: CarPart }
  | { t: 'garage'; a: 'style'; car: number; style: Partial<CarStyle> }
  | { t: 'garage'; a: 'repair'; car: number }
  | { t: 'garage'; a: 'rename'; car: number; name: string }
  | { t: 'garage'; a: 'sell'; car: number }
  /** Rallyvärlden, races: the lobby (create a room with rules, join, leave, ready, the host starts), then the race itself (car snapshots relayed to the room, my finish time, and `done` when the result card is closed: the car's damage is saved). `solo` races alone against the computer: no room, prizes paid on `finish`. */
  | { t: 'race'; a: 'rooms' }
  | { t: 'race'; a: 'create'; rules: RaceRules }
  | { t: 'race'; a: 'join'; room: string }
  | { t: 'race'; a: 'leave' }
  | { t: 'race'; a: 'ready'; ready: boolean }
  | { t: 'race'; a: 'rules'; rules: RaceRules }
  | { t: 'race'; a: 'start' }
  | { t: 'race'; a: 'snap'; snaps: CarSnap[] }
  /** My finish; the host also reports each of its computer cars crossing the line (`id` `ai:<n>` and its name). */
  | { t: 'race'; a: 'finish'; time: number; damage: number; id?: string; name?: string }
  | { t: 'race'; a: 'solo'; rules: RaceRules; place: number; n: number; time: number; damage: number }
  | { t: 'race'; a: 'done'; damage: number }
  /** Rallyvärlden, free roam: who is out driving (positions relayed), and the coins found when you come back. */
  | { t: 'roam'; a: 'enter' }
  | { t: 'roam'; a: 'leave'; coins: number; damage: number }
  | { t: 'roam'; a: 'snap'; snap: CarSnap }
  /** Röstprat: pick up (want voice) or hang up; make this device the room's speaker; move to a room of your own,
   * back to the automatic room, or into another player's room; a WebRTC signal to another speaker; speaking or not. */
  | { t: 'voice'; a: 'join' }
  | { t: 'voice'; a: 'leave' }
  | { t: 'voice'; a: 'speaker' }
  | { t: 'voice'; a: 'room'; mode: 'auto' | 'alone' | 'with'; with?: string }
  | { t: 'voice'; a: 'signal'; to: string; data: unknown }
  | { t: 'voice'; a: 'talking'; on: boolean }
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
  | { t: 'state'; timeMs: number; day: number; season: Season; players: PlayerSnap[]; animals: AnimalSnap[]; npcs: NpcSnap[]; now: number; weather?: WeatherState; saga?: Record<string, SagaSnap> }
  | { t: 'changes'; changes: Change[] }
  | { t: 'error'; text: string }
  /** Rallyvärlden: the lobby's rooms (to whoever asked or is in the garage), your room (null when it closed), the start (startAt is server wall clock), relayed snapshots, and the result with everyone's prize. */
  | { t: 'race'; ev: 'rooms'; rooms: RoomInfo[] }
  | { t: 'race'; ev: 'room'; room: RoomInfo | null }
  | { t: 'race'; ev: 'go'; room: RoomInfo }
  | { t: 'race'; ev: 'snap'; from: string; snaps: CarSnap[] }
  | { t: 'race'; ev: 'finish'; from: string; time: number }
  | { t: 'race'; ev: 'result'; room: string; results: RaceResultLine[] }
  /** Free roam: the others out driving (name and car for the model), their snapshots, and who went home. */
  | { t: 'roam'; ev: 'peers'; peers: { id: string; name: string; car: GarageCar }[] }
  | { t: 'roam'; ev: 'snap'; from: string; snap: CarSnap }
  | { t: 'roam'; ev: 'left'; id: string }
  /** Röstprat: the rooms and who speaks for them (to everyone online when it changes), the STUN/TURN servers (to a
   * device that became a speaker), a relayed signal from another speaker, and a room that started or stopped talking. */
  | { t: 'voice'; ev: 'state'; state: VoiceState }
  | { t: 'voice'; ev: 'ice'; servers: IceServer[] }
  | { t: 'voice'; ev: 'signal'; from: string; data: unknown }
  | { t: 'voice'; ev: 'talking'; id: string; on: boolean }
  | { t: 'pong' };

export interface PlayerSummary {
  id: string;
  name: string;
  appearance: Appearance;
  outfit: Outfit;
}
