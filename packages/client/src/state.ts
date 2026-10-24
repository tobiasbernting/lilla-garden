// Client-side mirror of the world plus a tiny event bus.
import {
  objectDef,
  key as tileKey,
  type AnimalSnap,
  type NpcSnap,
  type Change,
  type PlayerSnap,
  type Season,
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
  me: '',
  season: 'none' as Season,
  /** server clock = Date.now() - offset */
  serverOffset: 0,
  snaps: { players: new Map<string, PlayerSnap>(), animals: new Map<number, AnimalSnap>(), npcs: new Map<string, NpcSnap>() },
  timeMs: 0,
  day: 1,
  lastStateAt: 0,
};

export const serverNow = (): number => Date.now() - client.serverOffset;

export const myPlayer = () => (client.world ? client.world.players[client.me] : undefined);

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
  const world = client.world;
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
        client.snaps.animals.delete(c.id);
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
      if (c.id === client.me && old) {
        // keep predicted position
        world.players[c.id] = { ...c.player, x: old.x, y: old.y, facing: old.facing, moving: old.moving };
      } else world.players[c.id] = c.player;
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
