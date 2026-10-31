// Client-side mirror of the world plus a tiny event bus.
import {
  CHAT_BUBBLE_MS,
  objectDef,
  rebuildOccupancy,
  key as tileKey,
  type AnimalSnap,
  type NpcSnap,
  type Change,
  type PlayerSnap,
  type PlayerState,
  type SagaSnap,
  type ServerMsg,
  type Season,
  type WeatherState,
  type WorldObject,
  type WorldState,
} from '@lilla-garden/shared';

type Handler<T> = (data: T) => void;

export interface Events {
  welcome: void;
  state: void;
  change: Change;
  /** Own player record changed (inventory, coins, outfit…). */
  me: void;
  /** Any player record changed. */
  player: string;
  toast: string;
  open: Extract<Change, { t: 'open' }>;
  fx: Extract<Change, { t: 'fx' }>;
  connection: 'connecting' | 'open' | 'closed';
  season: Season;
  day: number;
  /** The local player moved to another map (key). */
  area: string;
  /** 2D game: someone wrote in the chat. */
  chat: Extract<Change, { t: 'chat' }>;
  /** 2D game: the weather turned. */
  weather: WeatherState | null;
  /** Dungeons: the monster or friend you aim at changed. */
  target: void;
  /** Rallyvärlden: the lobby, the race and free roam from the server (ui/rally.ts). */
  rally: Extract<ServerMsg, { t: 'race' | 'roam' }>;
  /** Röstprat: rooms, speakers, the handshake and who is talking (ui/voice.ts). */
  voice: Extract<ServerMsg, { t: 'voice' }>;
}

class Bus {
  private handlers = new Map<keyof Events, Set<Handler<unknown>>>();
  on<K extends keyof Events>(evt: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(evt);
    if (!set) this.handlers.set(evt, (set = new Set()));
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }
  emit<K extends keyof Events>(evt: K, data: Events[K]): void {
    this.handlers.get(evt)?.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

export const bus = new Bus();

export const client = {
  world: null as WorldState | null,
  dungeon: null as WorldState | null,
  areas: {} as Record<string, WorldState>,
  /** The biome of every explored map (from the server at login, kept up to date as maps arrive). */
  biomes: {} as Record<string, string>,
  me: '',
  season: 'none' as Season,
  /** server clock = Date.now() - offset */
  serverOffset: 0,
  snaps: { players: new Map<string, PlayerSnap>(), animals: new Map<number, AnimalSnap>(), npcs: new Map<string, NpcSnap>() },
  timeMs: 0,
  day: 1,
  lastStateAt: 0,
  weather: null as WeatherState | null,
  /** 2D game: the latest chat line of each player, for the bubble over their head. */
  chatBubbles: new Map<string, { text: string; until: number }>(),
  /** Dungeons: everyone's health and state in each dungeon with someone in it (the server sends it 10 times a second). */
  saga: {} as Record<string, SagaSnap>,
  /** Röstprat: the speakers whose room is talking right now (a 🔊 by their name). */
  talking: new Set<string>(),
};

export const serverNow = (): number => Date.now() - client.serverOffset;

export const myPlayer = () => (client.world ? client.world.players[client.me] : undefined);
/** The map the local player is on, falling back to the farm until that map's data has arrived. */
export const myArea = (): string => {
  const a = myPlayer()?.area ?? 'farm';
  if (a === 'dungeon') return client.dungeon ? 'dungeon' : 'farm';
  if (a !== 'farm') return client.areas[a] ? a : 'farm';
  return 'farm';
};
export const worldFor = (key: string): WorldState | null => (key === 'farm' ? client.world : key === 'dungeon' ? client.dungeon : (client.areas[key] ?? null));
/** The world the local player is in. */
export const activeWorld = (): WorldState | null => worldFor(myArea());

function putObject(world: WorldState, obj: WorldObject): void {
  const old = world.objects[obj.id];
  if (old) dropObject(world, old);
  world.objects[obj.id] = obj;
  const def = objectDef(obj.kind);
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) world.occupancy[tileKey(obj.x + dx, obj.y + dy)] = obj.id;
}
function dropObject(world: WorldState, obj: WorldObject): void {
  const def = objectDef(obj.kind);
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (world.occupancy[tileKey(obj.x + dx, obj.y + dy)] === obj.id) delete world.occupancy[tileKey(obj.x + dx, obj.y + dy)];
  delete world.objects[obj.id];
}

export function applyChange(c: Change): void {
  const farm = client.world;
  if (!farm) return;
  if (c.t === 'areaData') {
    const w = c.world;
    if (w) {
      rebuildOccupancy(w);
      // player records inside other maps are copies; use the farm's records
      for (const id of Object.keys(w.players)) if (farm.players[id]) w.players[id] = farm.players[id]!;
    }
    if (c.key === 'dungeon') client.dungeon = w;
    else if (w) {
      client.areas[c.key] = w;
      if (w.biome && c.key.startsWith('a:')) client.biomes[c.key] = w.biome;
    } else delete client.areas[c.key];
    bus.emit('change', c);
    if (myPlayer()?.area === c.key && w) bus.emit('area', c.key);
    return;
  }
  const areaK = ('area' in c && c.area) || 'farm';
  // a dungeon's fight is only seen by those inside it
  if ((c.t === 'spell' || c.t === 'hit' || c.t === 'zone' || c.t === 'yell' || c.t === 'banner') && 'area' in c && c.area && c.area !== myPlayer()?.area) return;
  const world = worldFor(areaK);
  if (!world) return;
  switch (c.t) {
    case 'terrain':
      world.terrain[c.y * 64 + c.x] = c.terrain;
      break;
    case 'crop':
      if (c.crop) world.crops[c.k] = c.crop;
      else delete world.crops[c.k];
      break;
    case 'object':
      if (c.obj) putObject(world, c.obj);
      else {
        const old = world.objects[c.id];
        if (old) dropObject(world, old);
      }
      break;
    case 'animal':
      if (c.animal) world.animals[c.id] = c.animal;
      else {
        delete world.animals[c.id];
        if ((client.snaps.animals.get(c.id)?.area ?? 'farm') === areaK) client.snaps.animals.delete(c.id);
      }
      break;
    case 'drop':
      if (c.drop) world.drops[c.id] = c.drop;
      else delete world.drops[c.id];
      break;
    case 'player': {
      if (!c.player) {
        delete world.players[c.id];
        break;
      }
      const old = world.players[c.id];
      const areaChanged = old && old.area !== c.player.area;
      if (old) {
        // the server sends the whole player: optional fields it dropped (riding, fishing, emote…) go away here too
        for (const k of Object.keys(old) as (keyof PlayerState)[]) if (!(k in c.player)) delete old[k];
      }
      if (c.id === client.me && old && !areaChanged) {
        // keep predicted position
        Object.assign(old, { ...c.player, x: old.x, y: old.y, facing: old.facing, moving: old.moving });
      } else if (old) Object.assign(old, c.player);
      else world.players[c.id] = c.player;
      if (c.id === client.me && areaChanged) bus.emit('area', c.player.area);
      break;
    }
    case 'warp': {
      // the server moved someone (blink, charge, getting up): straight there, no sliding, no prediction
      const p = farm.players[c.id];
      if (p) {
        p.x = c.x;
        p.y = c.y;
        p.moving = false;
      }
      const snap = client.snaps.players.get(c.id);
      if (snap) {
        snap.x = c.x;
        snap.y = c.y;
      }
      break;
    }
    case 'zone': {
      const zones = world.saga?.zones;
      if (!zones) break;
      const i = zones.findIndex((z) => z.id === c.id);
      if (c.zone) {
        if (i >= 0) zones[i] = c.zone;
        else zones.push(c.zone);
      } else if (i >= 0) zones.splice(i, 1);
      break;
    }
    case 'quests':
      world.quests = c.quests;
      break;
    case 'day':
      world.day = c.day;
      client.day = c.day;
      bus.emit('day', c.day);
      break;
    case 'toast':
      bus.emit('toast', c.text);
      break;
    case 'open':
      bus.emit('open', c);
      break;
    case 'fx':
      bus.emit('fx', c);
      break;
    case 'chat':
      if (!c.old) client.chatBubbles.set(c.from, { text: c.text, until: performance.now() + CHAT_BUBBLE_MS });
      bus.emit('chat', c);
      break;
  }
  bus.emit('change', c);
  if (c.t === 'player') {
    bus.emit('player', c.id);
    if (c.id === client.me) bus.emit('me', undefined);
  }
}

// ---- local preferences ----

const LS_PLAYER = 'lilla-garden.player';
export const rememberedPlayer = (): string | null => {
  try {
    return localStorage.getItem(LS_PLAYER);
  } catch {
    return null;
  }
};
export const rememberPlayer = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(LS_PLAYER, id);
    else localStorage.removeItem(LS_PLAYER);
  } catch {
    /* ignore */
  }
};

const LS_HELP = 'lilla-garden.helpSeen';
export const helpSeen = (): boolean => {
  try {
    return localStorage.getItem(LS_HELP) === '1';
  } catch {
    return true;
  }
};
export const markHelpSeen = (): void => {
  try {
    localStorage.setItem(LS_HELP, '1');
  } catch {
    /* ignore */
  }
};
