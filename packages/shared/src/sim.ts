// Authoritative world simulation. Pure functions over WorldState; no I/O.
// The server runs this; the client reuses movement for prediction.

import { ACHIEVEMENTS, ANIMALS, COOKING, CROPS, FISH, ITEMS, LOOT, LOOT_REFILL_DAYS, NPCS, RECIPES, TREASURE, item, objectDef } from './data.ts';
import { CAVE_EXIT_TILE, MAX_HEARTS, dungeonStart, generateDungeon } from './dungeon.ts';
import { BIOME_EMOJI, BIOME_NAMES, DISCOVERABLE, arrivalTile, areaCoords, areaKey, biomeAt, generateArea, inEdgeGap, isBiome, placeName, spawnWildAnimals } from './biomes.ts';
import { caveKey, entranceFront, generateCave, isCaveKey, isUnderground, parseCaveKey, regrow, themeOfEntrance } from './caves.ts';
import { MOON_KEY, MOON_ROCKET, SPACEPORT_KEY, BASE_ROCKET, generateMoon, isMoonKey, rocketFront } from './space.ts';
import { landmarkFronts, reachableFrom } from './worldgen.ts';
import { BATH_EXIT, BATH_POOL, SWIM_SPEED_MUL, bathKey, bathhouseDoorTile, generateBath, isBathKey, villageOfBath } from './bath.ts';
import { ARCADE, ARCADE_GAMES, ARCADE_MAX_SCORE, MAX_TICKETS_PER_DAY, MIN_GAME_MS, PRIZES, SPARE_CART_TICKETS, isArcadeGame, ticketsFor } from './arcade.ts';
import { INDOOR_EXIT, familyBest, familyGames, generateHall, hallDoorTile, hallKey, isHallKey, isIndoorKey, villageOfHall } from './hall.ts';
import { driveVehicle, isVehicle, vehicleBlocks } from './city.ts';
import { DUNGEONS, VOLVA_ID, dungeonOfKey, isSagaKey, sagaItem } from './saga.ts';
import { generateSaga } from './sagamap.ts';
import { garageOf, healCars } from './rallysim.ts';
import { enterSaga, ensureSagaPlaces, heroAction, idleSaga, isSagaMob, killXp, roamingDown, sagaAct, sagaRooted, tickSaga } from './sagasim.ts';
import { addItem, countItem, hasSpace, makeInventory, makeStack, moveStack, quickStack, removeItem, sortInventory, takeFromSlot } from './inventory.ts';
import { PORTALS, SPAWN, addObject, generateWorld, inBounds, inInterior, objectAt, portalAt, removeObject, tileIndex } from './map.ts';
import { randInt } from './rng.ts';
import { PAINTED_SELL, isValidPainting } from './paint.ts';
import { WALL_KINDS, findRooms, type Room } from './rooms.ts';
import { ACHIEVEMENT_TEXT, DEFAULT_ANIMAL_NAMES, QUEST_TEXTS, SPECIES_NAMES, T, fmt, itemName, objectName } from './sv.ts';
import type { Change, SlotRef } from './protocol.ts';
import { tickWeather } from './weather.ts';
import { WALL_TERRAIN, isFishWater } from './types.ts';
import type {
  AnimalState,
  Appearance,
  ArcadeState,
  ClothingSlot,
  CropState,
  DropState,
  Facing,
  Inventory,
  ItemStack,
  NpcDef,
  NpcState,
  PlayerState,
  Quest,
  Season,
  Terrain,
  WorldObject,
  WorldState,
} from './types.ts';
import {
  CHEST_SIZE,
  HOTBAR_SIZE,
  DAY_LENGTH_MS,
  INVENTORY_SIZE,
  MAP_H,
  MAP_W,
  MAX_STACK,
  PLAYER_SPEED,
  START_COINS,
  TILE,
  RIDE_SPEED_MUL,
  WATERING_CAN_CHARGES,
  key,
} from './types.ts';

export interface SimCtx {
  season: Season;
  rnd: () => number;
  /** Wall clock, ms since epoch (for emote expiry). */
  now: number;
}

export const PLAYER_HALF_W = 5;
export const PLAYER_HALF_H = 3;
export const ANIMAL_HALF_W = 5;
export const ANIMAL_HALF_H = 3;
export const PICKUP_RADIUS = 12;
export const EMOTE_MS = 2500;
/** How many tiles away from the player's own tile an action may reach (Chebyshev). */
export const REACH = 1;

export const tileOf = (px: number): number => Math.floor(px / TILE);

// ---------------------------------------------------------------------------
// Collision & movement
// ---------------------------------------------------------------------------

/** Current villager state, created from the routine on first use. */
export function npcState(world: WorldState, id: string): NpcState {
  if (!world.npcs) world.npcs = {};
  let st = world.npcs[id];
  if (!st) {
    const def = NPCS[id]!;
    const wp = routineTarget(def, world.timeMs);
    st = { x: wp.x * TILE + TILE / 2, y: wp.y * TILE + TILE / 2, facing: 'down', moving: false, stuckMs: 0 };
    world.npcs[id] = st;
  }
  return st;
}

export const routineTarget = (def: { routine: { at: number; x: number; y: number }[]; x: number; y: number }, timeMs: number) => {
  const f = timeMs / DAY_LENGTH_MS;
  let best = { x: def.x, y: def.y };
  for (const w of def.routine) if (f >= w.at) best = w;
  return best;
};

export const isFarm = (world: WorldState): boolean => !world.area;

/** Villagers who live on this map. */
export const npcsIn = (world: WorldState): NpcDef[] => (world.area === 'dungeon' ? [] : Object.values(NPCS).filter((n) => (n.area ?? 'farm') === (world.area ?? 'farm')));

export const npcAt = (world: WorldState, tx: number, ty: number) =>
  npcsIn(world).find((n) => {
    const st = npcState(world, n.id);
    return tileOf(st.x) === tx && tileOf(st.y) === ty;
  });

export const isMob = (a: AnimalState): boolean => !!ANIMALS[a.species]?.mob;

/** Hit points and drops for anything that can be fought: cave monsters and untamed predators. */
export const combatDef = (a: AnimalState): { hp: number; boss?: boolean; drops: { item: string; min: number; max: number; chance: number }[] } | undefined => {
  const def = ANIMALS[a.species];
  if (!def) return undefined;
  if (def.mob) return def.mob;
  if (def.predator && !a.owner) return { hp: def.predator.hp, drops: [{ item: 'fur', min: 1, max: 1, chance: 1 }] };
  return undefined;
};
/** Monsters and wild predators that chase and bite players. */
export const isHostile = (a: AnimalState): boolean => !!combatDef(a);
/** Pets follow their owner: dogs and cats, and wild animals caught with a lasso. */
export const isPetAnimal = (a: AnimalState): boolean => {
  const def = ANIMALS[a.species];
  return !!def && (!!def.pet || (!!def.wild && !!a.owner));
};

/** Animals that listen to their owner's "stay" and whistle: pets and the owner's horses. */
export const isCallable = (a: AnimalState): boolean => !!a.owner && !isVehicle(a) && (isPetAnimal(a) || isMount(a));
/** Horses, and Sleipner and Gullinbursti from the dungeons. */
export const isMount = (a: AnimalState): boolean => a.species === 'horse' || !!ANIMALS[a.species]?.mount;

/** Cars, mopeds (and city traffic): parked where they stand, driven like a horse. */

/** Maps you may drive or ride in: any overworld map, not the cave, the bath house or indoors. */
const canRideIn = (world: WorldState, tx: number, ty: number): boolean =>
  !isUnderground(world.area) && !isIndoorKey(world.area) && !isSagaKey(world.area) && !(isFarm(world) && inInterior(tx, ty));

/** Speed multiplier while riding or driving: horses are steady, vehicles love roads and hate mud. */
export function rideSpeedMul(world: WorldState, p: { x: number; y: number; riding?: number }): number {
  if (p.riding === undefined) return 1;
  const a = world.animals[p.riding];
  if (!a) return 1;
  const v = ANIMALS[a.species]?.vehicle;
  if (!v) return ANIMALS[a.species]?.mount?.speed ?? RIDE_SPEED_MUL;
  const t = world.terrain[tileIndex(tileOf(p.x), tileOf(p.y))] as string | undefined;
  const ground = t === 'road' || t === 'crossing' ? 1.3 : t === 'soil' || t === 'soil_wet' || t === 'sand' || t === 'gravel' ? 0.7 : 1;
  return (v.ride ?? RIDE_SPEED_MUL) * ground;
}

export function isSolidForPlayer(world: WorldState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return true;
  if (WALL_TERRAIN.has(world.terrain[tileIndex(tx, ty)]!)) return true;
  if (npcAt(world, tx, ty)) return true;
  if (vehicleBlocks(world, tx, ty)) return true;
  if (world.area === 'dungeon') {
    for (const a of Object.values(world.animals)) if (tileOf(a.x) === tx && tileOf(a.y) === ty) return true;
  } else if (isFarm(world) && portalAt(tx, ty)) return false;
  const obj = objectAt(world, tx, ty);
  return !!obj && objectDef(obj.kind).solid;
}

/** Teleports through a portal if standing on one. Returns true if moved. */
export function applyPortal(p: { x: number; y: number; facing: Facing }, world?: WorldState): boolean {
  if (world && !isFarm(world)) return false;
  const portal = portalAt(tileOf(p.x), tileOf(p.y));
  if (!portal) return false;
  p.x = portal.to.x * TILE + TILE / 2;
  p.y = portal.to.y * TILE + TILE / 2;
  p.facing = portal.facing;
  return true;
}

export function isSolidForAnimal(world: WorldState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return true;
  const t = world.terrain[tileIndex(tx, ty)]!;
  if (WALL_TERRAIN.has(t) || t === 'pool' || t === 'soil' || t === 'soil_wet') return true; // animals stay off the fields (and out of the pool)
  if (world.crops[key(tx, ty)]) return true;
  if (npcAt(world, tx, ty) || portalAt(tx, ty)) return true;
  const obj = objectAt(world, tx, ty);
  if (!obj) return false;
  const def = objectDef(obj.kind);
  return def.solid || obj.kind === 'gate' || obj.kind === 'door' || obj.kind === 'door_out';
}

const boxBlocked = (
  solid: (tx: number, ty: number) => boolean,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): boolean => {
  const x0 = tileOf(cx - hw);
  const x1 = tileOf(cx + hw - 0.01);
  const y0 = tileOf(cy - hh);
  const y1 = tileOf(cy + hh - 0.01);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
};

/** Moves a box from (x,y) towards (nx,ny), sliding along solids. Returns the reachable position. */
export function resolveMove(
  solid: (tx: number, ty: number) => boolean,
  x: number,
  y: number,
  nx: number,
  ny: number,
  hw = PLAYER_HALF_W,
  hh = PLAYER_HALF_H,
): { x: number; y: number } {
  const clampX = (v: number) => Math.min(MAP_W * TILE - hw, Math.max(hw, v));
  const clampY = (v: number) => Math.min(MAP_H * TILE - hh, Math.max(hh, v));
  let rx = clampX(nx);
  let ry = y;
  if (boxBlocked(solid, rx, ry, hw, hh)) rx = x;
  ry = clampY(ny);
  if (boxBlocked(solid, rx, ry, hw, hh)) ry = y;
  return { x: rx, y: ry };
}

/** One step of player input (used by the client for prediction and by tests). */
export function stepPlayer(
  world: WorldState,
  p: { x: number; y: number; facing: Facing; moving: boolean },
  dx: number,
  dy: number,
  dtMs: number,
  speedMul = 1,
): void {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) {
    p.moving = false;
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  if (inPool(world, p)) speedMul *= SWIM_SPEED_MUL;
  const dist = (PLAYER_SPEED * speedMul * dtMs) / 1000;
  const r = resolveMove((tx, ty) => isSolidForPlayer(world, tx, ty), p.x, p.y, p.x + ux * dist, p.y + uy * dist);
  p.moving = r.x !== p.x || r.y !== p.y;
  p.x = r.x;
  p.y = r.y;
  p.facing = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 'right' : 'left') : uy > 0 ? 'down' : 'up';
  applyPortal(p, world);
}

/** Standing in the bath house pool? */
export const inPool = (world: WorldState, p: { x: number; y: number }): boolean => world.terrain[tileIndex(tileOf(p.x), tileOf(p.y))] === 'pool';

/** The tile in front of the player (for the context action button). */
export function facingTile(p: { x: number; y: number; facing: Facing }): { tx: number; ty: number } {
  const tx = tileOf(p.x);
  const ty = tileOf(p.y);
  switch (p.facing) {
    case 'up':
      return { tx, ty: ty - 1 };
    case 'down':
      return { tx, ty: ty + 1 };
    case 'left':
      return { tx: tx - 1, ty };
    case 'right':
      return { tx: tx + 1, ty };
    default:
      return { tx, ty: ty + 1 };
  }
}

/** Is any player or animal standing inside the given tile footprint? */
export function footprintOccupied(world: WorldState, x: number, y: number, w: number, h: number): boolean {
  const inside = (px: number, py: number, hw: number, hh: number) =>
    px + hw > x * TILE && px - hw < (x + w) * TILE && py + hh > y * TILE && py - hh < (y + h) * TILE;
  for (const p of Object.values(world.players)) if (p.online && inside(p.x, p.y, PLAYER_HALF_W, PLAYER_HALF_H)) return true;
  for (const a of Object.values(world.animals)) if (inside(a.x, a.y, ANIMAL_HALF_W, ANIMAL_HALF_H)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export const STARTER_WARDROBE = ['shirt_red', 'shirt_blue', 'shirt_green', 'shirt_yellow', 'pants_blue', 'pants_brown', 'shoes_boots'];

export function createPlayer(world: WorldState, name: string, appearance: Appearance, shirt = 'shirt_blue'): PlayerState {
  const id = `p${world.nextId++}`;
  const inventory = makeInventory(INVENTORY_SIZE);
  for (const tool of ['hoe', 'can', 'axe', 'pick', 'scythe', 'hammer', 'brush']) addItem(inventory, tool, 1);
  addItem(inventory, 'carrot_seed', 6);
  addItem(inventory, 'potato_seed', 4);
  const p: PlayerState = {
    id,
    name: name.trim().slice(0, 16) || 'Spelare',
    appearance,
    outfit: { shirt: STARTER_WARDROBE.includes(shirt) ? shirt : 'shirt_blue', pants: 'pants_blue', shoes: 'shoes_boots' },
    wardrobe: [...STARTER_WARDROBE],
    x: SPAWN.x * TILE + TILE / 2,
    y: SPAWN.y * TILE + TILE / 2,
    facing: 'down',
    moving: false,
    coins: START_COINS,
    inventory,
    selected: 0,
    online: false,
    orders: [],
    questsDone: [],
    stars: 0,
    stats: {},
    achievements: [],
    area: 'farm',
    visited: ['farm'],
    hearts: MAX_HEARTS,
  };
  world.players[id] = p;
  return p;
}

export const heldItem = (p: PlayerState): ItemStack | null => p.inventory[p.selected] ?? null;

export const toast = (to: string | null, text: string): Change => ({ t: 'toast', to, text });
export const playerChange = (p: PlayerState): Change => ({ t: 'player', id: p.id, player: p });
export const fx = (tx: number, ty: number, kind: 'heart' | 'sparkle' | 'water' | 'chop' | 'poof' | 'coin' | 'hit' | 'boom' | 'splash' | 'honk'): Change => ({
  t: 'fx',
  x: tx * TILE + TILE / 2,
  y: ty * TILE + TILE / 2,
  kind,
});

/** Gives items to a player; whatever does not fit lands on the ground at the player's feet. */
export function giveItems(world: WorldState, p: PlayerState, id: string, count: number, out: Change[]): void {
  if (count <= 0) return;
  const left = addItem(p.inventory, id, count);
  if (left > 0) {
    const d = spawnDrop(world, id, left, p.x, p.y);
    out.push({ t: 'drop', id: d.id, drop: d });
    out.push(toast(p.id, T.inventoryFull));
  }
}

/** Gives a single stack that must not merge (a painted tavla); lands on the ground if there is no free slot. */
export function giveStack(world: WorldState, p: PlayerState, stack: ItemStack, out: Change[]): void {
  const free = p.inventory.indexOf(null);
  if (free >= 0) {
    p.inventory[free] = { ...stack };
    return;
  }
  const d = spawnDrop(world, stack.item, stack.count, p.x, p.y);
  if (stack.data !== undefined) d.data = stack.data;
  out.push({ t: 'drop', id: d.id, drop: d });
  out.push(toast(p.id, T.inventoryFull));
}

export function spawnDrop(world: WorldState, id: string, count: number, x: number, y: number, ignore?: string): DropState {
  const d: DropState = { id: world.nextId++, item: id, count, x, y };
  if (ignore) d.ignore = { player: ignore, ticks: 60 };
  world.drops[d.id] = d;
  return d;
}

// ---------------------------------------------------------------------------
// Gårdsbok: stats and achievements
// ---------------------------------------------------------------------------

/** Adds to a lifetime counter and unlocks any achievement it completes. */
export function bump(p: PlayerState, stat: string, n: number, out: Change[]): void {
  if (!p.stats) p.stats = {};
  if (!p.achievements) p.achievements = [];
  p.stats[stat] = (p.stats[stat] ?? 0) + n;
  for (const a of ACHIEVEMENTS) {
    if (a.stat !== stat || p.achievements.includes(a.id) || (p.stats[stat] ?? 0) < a.goal) continue;
    p.achievements.push(a.id);
    p.stars += a.stars;
    out.push(toast(p.id, fmt(T.achievement, { title: ACHIEVEMENT_TEXT[a.id]?.title ?? a.id, stars: a.stars })), fx(tileOf(p.x), tileOf(p.y), 'sparkle'), fx(tileOf(p.x), tileOf(p.y), 'coin'));
  }
}

// ---------------------------------------------------------------------------
// Actions on a tile
// ---------------------------------------------------------------------------

const PAINTABLE = new Set(['house', ...WALL_KINDS]);

/** Paints the farmhouse, or a wall piece and every piece connected to it. */
function paintObject(world: WorldState, p: PlayerState, obj: WorldObject, colour: number, out: Change[]): void {
  const todo = [obj];
  const seen = new Set<number>([obj.id]);
  while (todo.length) {
    const o = todo.pop()!;
    o.variant = colour;
    out.push({ t: 'object', id: o.id, obj: o });
    if (!WALL_KINDS.has(o.kind)) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const n = objectAt(world, o.x + dx, o.y + dy);
      if (n && !seen.has(n.id) && WALL_KINDS.has(n.kind)) {
        seen.add(n.id);
        todo.push(n);
      }
    }
  }
  takeFromSlot(p.inventory, p.selected, 1);
  bump(p, 'painted', 1, out);
  out.push(fx(obj.x, obj.y, 'sparkle'), toast(p.id, T.painted), playerChange(p));
}

/** Grows by itself (grass, flowers, trees, rocks…), as opposed to something a player built. */
const isWild = (kind: string): boolean => {
  const d = objectDef(kind);
  return (d.regrowDays !== undefined || d.harvest === true || kind === 'stump') && !d.drops?.some((x) => x.item === kind);
};

/**
 * The walls just closed a room: clear out what grew there (the builder gets the harvest),
 * lift crops (seeds back, or the produce when ripe) and lay a floor. The 2D client adds the roof.
 */
function finishRoom(world: WorldState, p: PlayerState, room: Room, ctx: SimCtx, out: Change[]): void {
  const floor: Terrain = room.stone ? 'floor_stone' : 'floor_wood';
  for (const i of room.tiles) {
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    const crop = world.crops[key(x, y)];
    if (crop) {
      const cdef = CROPS[crop.crop];
      if (cdef && cropMature(crop)) giveItems(world, p, cdef.produce, cdef.yield[0], out);
      else if (cdef) giveItems(world, p, cdef.seed, 1, out);
      delete world.crops[key(x, y)];
      out.push({ t: 'crop', k: key(x, y), crop: null });
    }
    const obj = objectAt(world, x, y);
    if (obj && isWild(obj.kind)) {
      removeObject(world, obj.id);
      out.push({ t: 'object', id: obj.id, obj: null });
      for (const d of objectDef(obj.kind).drops ?? []) giveItems(world, p, d.item, randInt(ctx.rnd, d.min, d.max), out);
    }
    const t = world.terrain[i]!;
    if (t === 'water' || t === 'pool' || t === 'floor_wood' || t === 'floor_stone') continue;
    const back = TERRAIN_ITEM[t];
    if (back) giveItems(world, p, back, 1, out);
    world.terrain[i] = floor;
    out.push({ t: 'terrain', x, y, terrain: floor });
  }
  const mid = room.tiles[Math.floor(room.tiles.length / 2)]!;
  bump(p, 'rooms', 1, out);
  out.push(fx(mid % MAP_W, Math.floor(mid / MAP_W), 'sparkle'), toast(p.id, T.roomDone), playerChange(p));
}

const FLOOR_ITEMS: Record<string, Terrain> = {
  path_stone: 'path_stone',
  path_dirt: 'path_dirt',
  floor_wood: 'floor_wood',
  floor_stone: 'floor_stone',
};
const TERRAIN_ITEM: Partial<Record<Terrain, string>> = {
  path_stone: 'path_stone',
  path_dirt: 'path_dirt',
  floor_wood: 'floor_wood',
  floor_stone: 'floor_stone',
};

export const animalAt = (world: WorldState, tx: number, ty: number): AnimalState | undefined => {
  for (const a of Object.values(world.animals)) if (tileOf(a.x) === tx && tileOf(a.y) === ty) return a;
  return undefined;
};

export const animalDisplayName = (a: AnimalState): string => a.name || SPECIES_NAMES[a.species] || a.species;

export function performAction(world: WorldState, playerId: string, tx: number, ty: number, ctx: SimCtx): Change[] {
  const p = world.players[playerId];
  const out: Change[] = [];
  if (!p || !inBounds(tx, ty)) return out;
  const ptx = tileOf(p.x);
  const pty = tileOf(p.y);
  if (Math.abs(tx - ptx) > REACH || Math.abs(ty - pty) > REACH) return out;
  if (p.riding !== undefined) {
    dismount(world, p, out);
    return out;
  }
  if (p.sleeping) {
    wakeUp(p, out, true);
    return out;
  }
  if (isSagaKey(world.area)) return sagaAct(world, p, tx, ty, ctx);
  // hero mode out in the world: a monster in reach gets the class's attack spell instead of the farm tool
  if (p.saga?.hero) {
    const hero = heroAction(world, p, tx, ty, ctx);
    if (hero) return hero;
  }
  const held = heldItem(p);
  const heldDef = held ? item(held.item) : null;
  const tool = heldDef?.tool;

  // 0'. A pet or mount from the dungeons: out of the bag and by your side
  if (held && (sagaItem(held.item)?.kind === 'pet' || sagaItem(held.item)?.kind === 'mount') && !objectAt(world, tx, ty) && !animalAt(world, tx, ty)) {
    summonFromBag(world, p, held.item, out);
    return out;
  }

  // 0. Bazooka: works everywhere, fires straight ahead
  if (tool === 'bazooka') {
    fireRocket(world, p, ctx, out);
    return out;
  }

  // 0b. Lasso: catches wild animals anywhere outdoors
  if (tool === 'lasso') {
    throwLasso(world, p, ctx, out);
    return out;
  }
  // 0c. Outside the cave, sword and bow only work on wild predators
  const pointedObject = objectAt(world, tx, ty);
  const pointedAnimal = animalAt(world, tx, ty);
  const canOpen = (!!pointedObject && !!objectDef(pointedObject.kind).interact) || (!!pointedAnimal && !isHostile(pointedAnimal));
  if (world.area !== 'dungeon' && (tool === 'sword' || tool === 'bow') && !canOpen) {
    // (pointing at a door, chest, the cave mouth, your horse or a friendly animal still works, whatever you hold)
    const target = animalAt(world, tx, ty);
    if (tool === 'sword') {
      if (target && isHostile(target)) attackMob(world, p, target, 2, ctx, out);
      else if (!target) out.push(fx(tx, ty, 'hit'));
      return out;
    }
    shootArrow(world, p, ctx, out);
    return out;
  }

  // 0a. In the cave: weapons, exit, treasure
  if (world.area === 'dungeon') {
    const target = animalAt(world, tx, ty);
    const interactable = objectAt(world, tx, ty);
    const idef = interactable ? objectDef(interactable.kind) : null;
    if (interactable && idef?.interact === 'exit') {
      out.push(...leaveCave(world, p.id, false));
      return out;
    }
    if (interactable && idef?.interact === 'treasure') {
      openTreasure(world, p, interactable, ctx, out);
      return out;
    }
    if (tool === 'sword') {
      if (target) attackMob(world, p, target, 2, ctx, out);
      else out.push(fx(tx, ty, 'hit'));
      return out;
    }
    if (tool === 'bow') {
      shootArrow(world, p, ctx, out);
      return out;
    }
    if (tool === 'shield' || target) return out; // shield up: no attack; hands: trolls do not like pats
    const obj = objectAt(world, tx, ty);
    if (obj) {
      const def = objectDef(obj.kind);
      if (def.interact === 'exit') {
        out.push(...leaveCave(world, p.id, false));
        return out;
      }
      if (def.interact === 'treasure') {
        openTreasure(world, p, obj, ctx, out);
        return out;
      }
      if (def.breakWith && tool === def.breakWith) {
        breakObject(world, p, obj, ctx, out);
        return out;
      }
      return out;
    }
    return out;
  }
  // 0b. Villager / fishing
  const npc = npcAt(world, tx, ty);
  if (npc) {
    out.push({ t: 'open', to: p.id, ui: npc.id === VOLVA_ID ? 'saga' : 'npc', npc: npc.id });
    return out;
  }
  if (p.fishing) {
    fishingAct(world, p, ctx, out);
    return out;
  }
  if (tool === 'rod' && isFishWater(world.terrain[tileIndex(tx, ty)])) {
    const wait = 1500 + ctx.rnd() * 3500;
    p.fishing = { x: tx, y: ty, biteAt: ctx.now + wait, bite: false, until: 0 };
    p.emote = { id: 'fiske', until: ctx.now + wait + 2000 };
    out.push(toast(p.id, T.fishingStart));
    return out;
  }
  if (tool === 'rod') return out;

  // 0c. Paper: open the drawing screen (unless pointing at something you can open)
  if (held?.item === 'paper') {
    const target = objectAt(world, tx, ty);
    if (!target || !objectDef(target.kind).interact) {
      out.push({ t: 'open', to: p.id, ui: 'paint' });
      return out;
    }
  }

  // 0d. Food: eat it (unless pointing at something you can open)
  if (held && item(held.item).food) {
    const target = objectAt(world, tx, ty);
    if (!target || !objectDef(target.kind).interact) return eat(world, p, held, ctx);
  }

  // 1. Animal
  const animal = animalAt(world, tx, ty);
  if (animal) {
    actOnAnimal(world, p, animal, held, ctx, out);
    return out;
  }

  // 2. Object
  const obj = objectAt(world, tx, ty);
  if (obj) {
    const def = objectDef(obj.kind);
    if (heldDef?.paint !== undefined) {
      if (PAINTABLE.has(obj.kind)) paintObject(world, p, obj, heldDef.paint, out);
      else out.push(toast(p.id, T.cantPaint));
      return out;
    }
    if (def.harvest || (def.breakWith && tool === def.breakWith)) {
      breakObject(world, p, obj, ctx, out);
      return out;
    }
    if (def.interact) {
      interactObject(world, p, obj, held, ctx, out);
      return out;
    }
    if (obj.kind === 'dig_spot') {
      out.push(toast(p.id, T.needHoeToDig));
      return out;
    }
    if (def.flat && tool === 'hoe' && def.breakWith) {
      // Hoeing through grass tufts / flowers clears them first.
      breakObject(world, p, obj, ctx, out);
    } else if (def.flat && (tool === 'can' || held?.item === undefined)) {
      // fall through to terrain (watering can on a flower, or walking around)
    } else {
      if (tool && def.breakWith) out.push(toast(p.id, fmt(T.needTool, { tool: itemName(toolItemId(def.breakWith)) })));
      return out;
    }
  }

  // 3. Crop
  const ck = key(tx, ty);
  const crop = world.crops[ck];
  if (crop) {
    actOnCrop(world, p, tx, ty, crop, held, ctx, out);
    return out;
  }

  // 4. Terrain
  actOnTerrain(world, p, tx, ty, held, ctx, out);
  return out;
}

const toolItemId = (tool: string): string => {
  for (const d of Object.values(ITEMS)) if (d.tool === tool) return d.id;
  return tool;
};

function actOnAnimal(world: WorldState, p: PlayerState, a: AnimalState, held: ItemStack | null, ctx: SimCtx, out: Change[]): void {
  const atx = tileOf(a.x);
  const aty = tileOf(a.y);
  const name = animalDisplayName(a);
  const heldDef = held ? item(held.item) : null;
  if (a.route !== undefined) {
    // city traffic: you cannot take the bus driver's seat, but you may honk
    out.push(fx(atx, aty, 'honk'), toast(p.id, fmt(T.vehicleHonk, { name })));
    return;
  }
  if (riderOf(world, a)) {
    out.push(toast(p.id, fmt(T.horseBusy, { name })));
    return;
  }
  if (isVehicle(a)) {
    mount(world, p, a, out);
    return;
  }
  if (held?.item === 'hay' && !ANIMALS[a.species]?.wild) {
    if (a.fed) {
      out.push(toast(p.id, fmt(T.alreadyFed, { name })));
      return;
    }
    removeItem(p.inventory, 'hay', 1);
    a.fed = true;
    bump(p, 'fed', 1, out);
    out.push(fx(atx, aty, 'heart'), toast(p.id, fmt(T.fed, { name })), playerChange(p), { t: 'animal', id: a.id, animal: a });
    return;
  }
  if (heldDef?.tool === 'brush') {
    if (!a.brushed) {
      a.brushed = true;
      out.push(fx(atx, aty, 'sparkle'), toast(p.id, fmt(T.brushed, { name })));
    } else out.push(fx(atx, aty, 'heart'));
    out.push({ t: 'animal', id: a.id, animal: a });
    return;
  }
  if (a.hasProduct) {
    const def = ANIMALS[a.species];
    let product = def?.product;
    if (product === 'egg' && ctx.season === 'pask') product = 'egg_pask';
    if (product) {
      a.hasProduct = false;
      giveItems(world, p, product, 1, out);
      bump(p, 'product', 1, out);
      if (product === 'truffle') bump(p, 'truffle', 1, out);
      out.push(fx(atx, aty, 'sparkle'), toast(p.id, fmt(T.collected, { item: itemName(product), name })), playerChange(p), {
        t: 'animal',
        id: a.id,
        animal: a,
      });
      return;
    }
  }
  // Pet
  const wild = !!ANIMALS[a.species]?.wild && !a.owner;
  if (wild && !a.petted) bump(p, 'wildpet', 1, out);
  if (wild) {
    a.petted = true;
    out.push(fx(atx, aty, 'heart'), toast(p.id, fmt(T.wildPetted, { name })), { t: 'animal', id: a.id, animal: a }, playerChange(p));
    return;
  }
  if (isMount(a) && a.petted && a.named) {
    mount(world, p, a, out);
    return;
  }
  a.petted = true;
  out.push(fx(atx, aty, 'heart'), toast(p.id, fmt(T.petted, { name })), { t: 'animal', id: a.id, animal: a });
  if (!a.named) out.push({ t: 'open', to: p.id, ui: 'nameAnimal', id: a.id });
}

// ---------------------------------------------------------------------------
// Riding
// ---------------------------------------------------------------------------

/** The player currently riding this animal, if any. */
export function riderOf(world: WorldState, a: AnimalState): PlayerState | undefined {
  for (const p of Object.values(world.players)) if (p.riding === a.id) return p;
  return undefined;
}

function mount(world: WorldState, p: PlayerState, a: AnimalState, out: Change[]): void {
  const name = animalDisplayName(a);
  if (isBaby(a)) {
    out.push(toast(p.id, fmt(T.horseTooYoung, { name })));
    return;
  }
  if (a.owner && a.owner !== p.id) {
    out.push(toast(p.id, fmt(T.notYourHorse, { name, owner: farmOf(world).players[a.owner]?.name ?? '?' })));
    return;
  }
  const vehicle = isVehicle(a);
  const anywhere = vehicle || !!ANIMALS[a.species]?.mount;
  if (anywhere ? !canRideIn(world, tileOf(p.x), tileOf(p.y)) : !isFarm(world) || inInterior(tileOf(p.x), tileOf(p.y))) {
    out.push(toast(p.id, T.notNow));
    return;
  }
  p.riding = a.id;
  delete p.fishing;
  delete a.stay;
  a.x = p.x;
  a.y = p.y;
  a.facing = p.facing;
  a.moving = false;
  delete a.tx;
  delete a.ty;
  bump(p, vehicle ? 'drive' : 'ride', 1, out);
  out.push(toast(p.id, fmt(vehicle ? T.drive : T.mounted, { name })), fx(tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p), { t: 'animal', id: a.id, animal: a });
}

/** Gets off the horse; the horse stays just behind the player (or on their tile). */
export function dismount(world: WorldState, p: PlayerState, out: Change[]): void {
  const here = areaOf(farmOf(world), p);
  const a = p.riding !== undefined ? here.animals[p.riding] : undefined;
  delete p.riding;
  out.push(playerChange(p));
  if (!a) return;
  const d = DIR_VEC[p.facing] ?? { dx: 0, dy: 1 };
  const btx = tileOf(p.x) - d.dx;
  const bty = tileOf(p.y) - d.dy;
  const behindFree = inBounds(btx, bty) && !isSolidForAnimal(here, btx, bty) && !(isFarm(here) && inInterior(btx, bty));
  a.x = behindFree ? btx * TILE + TILE / 2 : p.x;
  a.y = behindFree ? bty * TILE + TILE / 2 : p.y;
  a.moving = false;
  a.waitMs = 1500;
  delete a.tx;
  delete a.ty;
  const change: Change = { t: 'animal', id: a.id, animal: a };
  if (!isFarm(here)) change.area = here.area;
  out.push(toast(p.id, fmt(isVehicle(a) ? T.parked : T.dismounted, { name: animalDisplayName(a) })), change);
}

/** Beep beep: a little horn fx for everyone nearby (only while driving). */
export function honk(world: WorldState, playerId: string): Change[] {
  const p = world.players[playerId];
  if (!p || p.riding === undefined) return [];
  const a = world.animals[p.riding];
  if (!a || !isVehicle(a)) return [];
  return [fx(tileOf(p.x), tileOf(p.y), 'honk')];
}

/** "Ann, Bo och Cecilia" */
const joinNames = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${T.and} ${names[names.length - 1]}`);

/**
 * 2D game: tell your pets and horses to stay where they are, or whistle so they come back and follow you.
 * Only the animals on your map can hear "stay"; a whistle reaches pets left on any map (not in the cave).
 */
export function callPets(world: WorldState, playerId: string, cmd: 'stay' | 'come', ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || (cmd !== 'stay' && cmd !== 'come')) return [];
  const out: Change[] = [];
  if (cmd === 'come') p.emote = { id: 'vissla', until: ctx.now + EMOTE_MS };
  if (p.area === 'dungeon') {
    out.push(toast(p.id, cmd === 'come' ? T.petsCantHear : T.noPetsHere));
    return out;
  }
  const here = areaOf(farm, p);
  const hereKey = p.area ?? 'farm';
  const near: string[] = [];
  const waiting: string[] = [];
  const maps = [farm, ...Object.values(farm.areas ?? {})];
  for (const m of maps) {
    const mk = m.area ?? 'farm';
    for (const a of Object.values(m.animals)) {
      if (a.owner !== p.id || !isCallable(a) || riderOf(m, a)) continue;
      const tag = (c: Change): Change => {
        if (mk !== 'farm' && (c.t === 'animal' || c.t === 'fx')) c.area = mk;
        return c;
      };
      const name = animalDisplayName(a);
      if (cmd === 'stay') {
        if (mk !== hereKey) continue;
        a.stay = { x: a.x, y: a.y };
        delete a.follow;
        delete a.tx;
        delete a.ty;
        a.moving = false;
        a.waitMs = 2000;
        near.push(name);
        out.push(tag({ t: 'animal', id: a.id, animal: a }), tag(fx(tileOf(a.x), tileOf(a.y), 'heart')));
        continue;
      }
      delete a.stay;
      if (a.species === 'horse') {
        // horses stay on the farm: one whistled for elsewhere waits there and follows you once you are home
        a.follow = true;
        out.push(tag({ t: 'animal', id: a.id, animal: a }));
        if (mk === hereKey) near.push(name);
        else waiting.push(name);
        continue;
      }
      if (mk !== hereKey) moveAnimalAlong(m, here, hereKey, a, p, out);
      else out.push(tag({ t: 'animal', id: a.id, animal: a }));
      near.push(name);
    }
  }
  if (near.length) out.push(toast(p.id, fmt(cmd === 'stay' ? T.petsStay : T.petsCome, { names: joinNames(near) })));
  if (waiting.length) out.push(toast(p.id, fmt(T.horseWaitsHome, { names: joinNames(waiting) })));
  if (!near.length && !waiting.length) out.push(toast(p.id, cmd === 'stay' ? T.noPetsHere : T.noPets));
  out.push(playerChange(p));
  return out;
}

const DIR_VEC: Record<Facing, { dx: number; dy: number }> = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

/** Ridden horses sit under their rider; riders that vanished free their horse. */
function tickRiding(world: WorldState, out: Change[]): void {
  const here = world.area ?? 'farm';
  for (const p of Object.values(world.players)) {
    if (p.riding === undefined) continue;
    const a = world.animals[p.riding];
    if (!a || !p.online || p.area !== here || !canRideIn(world, tileOf(p.x), tileOf(p.y))) {
      delete p.riding;
      out.push(playerChange(p));
      continue;
    }
    if (isVehicle(a)) {
      // odometer: whole tiles driven count towards Långfärd
      if (!p.stats) p.stats = {};
      const px = (p.stats.drive_px ?? 0) + Math.hypot(p.x - a.x, p.y - (a.y + 1));
      const tiles = Math.floor(px / TILE);
      p.stats.drive_px = px - tiles * TILE;
      if (tiles > 0) bump(p, 'drive_tiles', tiles, out);
    }
    a.x = p.x;
    a.y = p.y + 1;
    a.facing = p.facing;
    a.moving = p.moving;
    delete a.tx;
    delete a.ty;
  }
}

function interactObject(world: WorldState, p: PlayerState, obj: WorldObject, held: ItemStack | null, ctx: SimCtx, out: Change[]): void {
  const def = objectDef(obj.kind);
  switch (def.interact) {
    case 'chest':
      if (!obj.items) obj.items = makeInventory(CHEST_SIZE);
      out.push({ t: 'open', to: p.id, ui: 'chest', id: obj.id });
      return;
    case 'catalogue':
    case 'sell':
    case 'workbench':
    case 'wardrobe':
    case 'cook':
    case 'pizzeria':
      out.push({ t: 'open', to: p.id, ui: def.interact });
      return;
    case 'cave':
      out.push(...enterCave(world, p.id));
      return;
    case 'bath':
      out.push(...enterBath(world, p.id));
      return;
    case 'hall':
      out.push(...enterHall(world, p.id));
      return;
    case 'saga':
      out.push(...enterSaga(world, p, obj));
      return;
    case 'sagaclass':
      out.push({ t: 'open', to: p.id, ui: 'sagaClass', id: obj.id });
      return;
    case 'tv':
    case 'machine':
      openArcade(p, obj, ctx, out);
      return;
    case 'prizes':
    case 'scores':
      out.push({ t: 'open', to: p.id, ui: def.interact });
      return;
    case 'garage': {
      // Rallyvärlden: the starter car is waiting in the garage the first time
      const fresh = !p.garage;
      garageOf(p);
      if (fresh) out.push(playerChange(p));
      out.push({ t: 'open', to: p.id, ui: 'rally', id: obj.id });
      return;
    }
    case 'sleep':
      goToSleep(world, p, out);
      return;
    case 'bus':
    case 'train':
      out.push({ t: 'open', to: p.id, ui: 'travel', id: obj.id });
      return;
    case 'exit':
      if (isBathKey(world.area)) out.push(...leaveBath(world, p.id));
      else if (isHallKey(world.area)) out.push(...leaveHall(world, p.id));
      else if (isCaveKey(world.area)) out.push(...leaveGrotto(world, p.id));
      return;
    case 'treasure':
      return;
    case 'grotto':
      out.push(...enterGrotto(world, p.id, obj));
      return;
    case 'loot':
      openLootChest(world, p, obj, ctx, out);
      return;
    case 'fairy':
      danceInRing(world, p, obj, ctx, out);
      return;
    case 'rocket':
      out.push(...flyRocket(world, p.id));
      return;
    case 'water':
      if (held && item(held.item).tool === 'can') {
        held.charges = WATERING_CAN_CHARGES;
        out.push(fx(obj.x, obj.y, 'water'), toast(p.id, T.filledCan), playerChange(p));
      }
      return;
    case 'feed': {
      if (!obj.items) obj.items = makeInventory(1);
      const stored = obj.items[0]?.count ?? 0;
      if (held?.item === 'hay') {
        const room = MAX_STACK - stored;
        const take = Math.min(room, held.count);
        if (take > 0) {
          removeItem(p.inventory, 'hay', take);
          obj.items[0] = makeStack('hay', stored + take);
          out.push(toast(p.id, fmt(T.troughFilled, { count: stored + take })), playerChange(p), { t: 'object', id: obj.id, obj });
        }
      } else if (stored > 0) out.push(toast(p.id, fmt(T.troughHas, { count: stored })));
      else out.push(toast(p.id, T.troughEmpty));
      return;
    }
  }
}

/** Someone else built it (and still lives on the farm): only they may take it down. */
const builtByOther = (world: WorldState, p: PlayerState, obj: WorldObject): PlayerState | undefined =>
  obj.by && obj.by !== p.id ? farmOf(world).players[obj.by] : undefined;

function breakObject(world: WorldState, p: PlayerState, obj: WorldObject, ctx: SimCtx, out: Change[]): void {
  const builder = builtByOther(world, p, obj);
  if (builder) {
    out.push(toast(p.id, fmt(T.notYourBuild, { owner: builder.name })));
    return;
  }
  const def = objectDef(obj.kind);
  removeObject(world, obj.id);
  out.push({ t: 'object', id: obj.id, obj: null });
  out.push(fx(obj.x, obj.y, def.breakWith === 'axe' || def.breakWith === 'pick' ? 'chop' : 'poof'));
  // Chest contents spill out
  if (obj.items) for (const s of obj.items) if (s) giveItems(world, p, s.item, s.count, out);
  for (const d of def.drops ?? []) {
    if (obj.data !== undefined && d.item === obj.kind) giveStack(world, p, { item: d.item, count: 1, data: obj.data }, out);
    else giveItems(world, p, d.item, randInt(ctx.rnd, d.min, d.max), out);
  }
  if (def.loot) {
    // buried treasure and fossils: what you find depends on where you are
    const table = def.loot === 'dig' && LOOT[`dig_${world.biome}`] ? `dig_${world.biome}` : def.loot;
    const got = grantLoot(world, p, table, ctx, out);
    if (obj.kind === 'dig_spot') {
      bump(p, 'dig', 1, out);
      out.push(fx(obj.x, obj.y, 'coin'), toast(p.id, got.length ? fmt(T.dugUp, { loot: got.join(' + ') }) : T.dugNothing));
    } else if (got.length) out.push(fx(obj.x, obj.y, 'sparkle'), toast(p.id, fmt(T.lootOpened, { loot: got.join(' + ') })));
    else if (obj.kind === 'fossil_rock') out.push(toast(p.id, T.noFossil));
  }
  if (obj.kind === 'wisp') out.push(fx(obj.x, obj.y, 'sparkle'), toast(p.id, T.wispCaught));
  if (obj.kind.startsWith('tree')) bump(p, 'chop', 1, out);
  if (def.breakWith === 'pick') bump(p, 'mine', 1, out);
  if (obj.kind === 'tree' || obj.kind === 'tree_pine' || obj.kind === 'tree_apple') {
    const stump = addObject(world, 'stump', obj.x, obj.y);
    if (stump) out.push({ t: 'object', id: stump.id, obj: stump });
  }
  if (def.houses) {
    // Animals that lived here now live "nowhere"; they keep wandering around the spot.
    for (const a of Object.values(world.animals)) if (a.homeId === obj.id) a.homeId = 0;
    // Refund any pending order for this house, from whoever placed it
    for (const pl of Object.values(world.players)) {
      const keep = pl.orders.filter((o) => o.homeId !== obj.id);
      for (const o of pl.orders) if (o.homeId === obj.id) pl.coins += ITEMS[`animal_${o.species}`]?.buy ?? 0;
      if (keep.length !== pl.orders.length) {
        pl.orders = keep;
        if (pl.id !== p.id) out.push(playerChange(pl));
      }
    }
  }
  out.push(playerChange(p));
}

const cropMature = (c: CropState): boolean => c.stage >= (CROPS[c.crop]?.stages.length ?? 99);

function actOnCrop(
  world: WorldState,
  p: PlayerState,
  tx: number,
  ty: number,
  crop: CropState,
  held: ItemStack | null,
  ctx: SimCtx,
  out: Change[],
): void {
  const ck = key(tx, ty);
  const def = CROPS[crop.crop];
  if (!def) return;
  const tool = held ? item(held.item).tool : undefined;
  if (cropMature(crop)) {
    bump(p, 'harvest', 1, out);
    giveItems(world, p, def.produce, randInt(ctx.rnd, def.yield[0], def.yield[1]), out);
    giveItems(world, p, def.seed, randInt(ctx.rnd, def.seedsBack[0], def.seedsBack[1]), out);
    if (def.regrowTo !== undefined) {
      crop.stage = def.regrowTo;
      crop.progress = 0;
      crop.watered = false;
      out.push({ t: 'crop', k: ck, crop });
    } else {
      delete world.crops[ck];
      out.push({ t: 'crop', k: ck, crop: null });
    }
    out.push(fx(tx, ty, 'sparkle'), playerChange(p));
    return;
  }
  if (tool === 'can' && held) {
    if ((held.charges ?? 0) <= 0) {
      out.push(toast(p.id, T.emptyCan));
      return;
    }
    if (crop.watered) return;
    held.charges = (held.charges ?? 0) - 1;
    crop.watered = true;
    world.terrain[tileIndex(tx, ty)] = 'soil_wet';
    out.push({ t: 'crop', k: ck, crop }, { t: 'terrain', x: tx, y: ty, terrain: 'soil_wet' }, fx(tx, ty, 'water'), playerChange(p));
    return;
  }
  if (tool === 'hoe') {
    delete world.crops[ck];
    giveItems(world, p, def.seed, 1, out);
    out.push({ t: 'crop', k: ck, crop: null }, fx(tx, ty, 'poof'), playerChange(p));
  }
}

function actOnTerrain(world: WorldState, p: PlayerState, tx: number, ty: number, held: ItemStack | null, ctx: SimCtx, out: Change[]): void {
  const ti = tileIndex(tx, ty);
  const terrain = world.terrain[ti]!;
  const setTerrain = (t: Terrain) => {
    world.terrain[ti] = t;
    out.push({ t: 'terrain', x: tx, y: ty, terrain: t });
  };
  if (!held) return;
  const def = item(held.item);
  switch (def.tool) {
    case 'hoe':
      if ((terrain === 'grass' || terrain === 'dirt') && !objectAt(world, tx, ty)) {
        setTerrain('soil');
        out.push(fx(tx, ty, 'poof'));
      }
      return;
    case 'can':
      if (isFishWater(terrain)) {
        held.charges = WATERING_CAN_CHARGES;
        out.push(fx(tx, ty, 'water'), toast(p.id, T.filledCan), playerChange(p));
      } else if (terrain === 'soil') {
        if ((held.charges ?? 0) <= 0) {
          out.push(toast(p.id, T.emptyCan));
          return;
        }
        held.charges = (held.charges ?? 0) - 1;
        setTerrain('soil_wet');
        out.push(fx(tx, ty, 'water'), playerChange(p));
      } else if (terrain === 'soil_wet' && (held.charges ?? 0) <= 0) {
        out.push(toast(p.id, T.emptyCan));
      }
      return;
    case 'scythe':
      if (terrain === 'soil' || terrain === 'soil_wet') {
        setTerrain('grass');
        out.push(fx(tx, ty, 'poof'));
      }
      return;
    case 'hammer': {
      const back = TERRAIN_ITEM[terrain];
      if (back) {
        setTerrain('grass');
        giveItems(world, p, back, 1, out);
        out.push(fx(tx, ty, 'poof'), playerChange(p));
      }
      return;
    }
    case 'axe':
    case 'pick':
    case 'brush':
      return;
  }
  if (def.category === 'seed' && def.crop) {
    if (terrain !== 'soil' && terrain !== 'soil_wet') return;
    if (objectAt(world, tx, ty)) return;
    takeFromSlot(p.inventory, p.selected, 1);
    const crop: CropState = { crop: def.crop, stage: 0, progress: 0, watered: terrain === 'soil_wet' };
    world.crops[key(tx, ty)] = crop;
    out.push({ t: 'crop', k: key(tx, ty), crop }, fx(tx, ty, 'sparkle'), playerChange(p));
    return;
  }
  if (def.category === 'placeable' && def.places) {
    const floor = FLOOR_ITEMS[def.places];
    if (terrain === 'pool' || (WALL_TERRAIN.has(terrain) && terrain !== 'water')) {
      out.push(toast(p.id, T.cantPlaceHere));
      return;
    }
    if (floor) {
      if (terrain === 'water' || terrain === floor) return;
      if ((terrain === 'soil' || terrain === 'soil_wet') && world.crops[key(tx, ty)]) return;
      const obj = objectAt(world, tx, ty);
      if (obj && objectDef(obj.kind).solid) return;
      const back = TERRAIN_ITEM[terrain];
      takeFromSlot(p.inventory, p.selected, 1);
      if (back) giveItems(world, p, back, 1, out);
      setTerrain(floor);
      bump(p, 'build', 1, out);
      out.push(playerChange(p));
      return;
    }
    const odef = objectDef(def.places);
    if (footprintOccupied(world, tx, ty, odef.w, odef.h)) {
      out.push(toast(p.id, T.cantPlaceHere));
      return;
    }
    const extra: Partial<WorldObject> = { by: p.id };
    if (odef.interact === 'chest') extra.items = makeInventory(CHEST_SIZE);
    if (odef.interact === 'feed') extra.items = makeInventory(1);
    if (held.data !== undefined) extra.data = held.data;
    // remember which tiles were indoors, to tell when this piece closes a new room
    const indoorsBefore = WALL_KINDS.has(def.places) ? new Set(findRooms(world).flatMap((r) => r.tiles)) : null;
    const obj = addObject(world, def.places, tx, ty, extra);
    if (!obj) {
      out.push(toast(p.id, T.cantPlaceHere));
      return;
    }
    takeFromSlot(p.inventory, p.selected, 1);
    bump(p, 'build', 1, out);
    if (WALL_KINDS.has(obj.kind)) bump(p, 'walls', 1, out);
    out.push({ t: 'object', id: obj.id, obj }, fx(tx, ty, 'poof'), playerChange(p));
    if (indoorsBefore)
      for (const room of findRooms(world)) if (room.tiles.some((i) => !indoorsBefore.has(i))) finishRoom(world, p, room, ctx, out);
    return;
  }
  void ctx;
}

// ---------------------------------------------------------------------------
// Inventory / economy / misc messages
// ---------------------------------------------------------------------------

const chestNear = (world: WorldState, p: PlayerState, chestId: number): WorldObject | null => {
  const obj = world.objects[chestId];
  if (!obj || !obj.items) return null;
  const def = objectDef(obj.kind);
  if (def.interact !== 'chest') return null;
  const dx = Math.abs(obj.x + 0.5 - p.x / TILE);
  const dy = Math.abs(obj.y + 0.5 - p.y / TILE);
  return dx <= REACH + 1.5 && dy <= REACH + 1.5 ? obj : null;
};

export function swapSlots(world: WorldState, playerId: string, a: SlotRef, b: SlotRef): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  const out: Change[] = [];
  const resolve = (r: SlotRef): Inventory | null => {
    if (r.chest === undefined) return p.inventory;
    const c = chestNear(world, p, r.chest);
    return c?.items ?? null;
  };
  const ia = resolve(a);
  const ib = resolve(b);
  if (!ia || !ib) return out;
  moveStack(ia, a.slot, ib, b.slot);
  out.push(playerChange(p));
  if (a.chest !== undefined) out.push({ t: 'object', id: a.chest, obj: world.objects[a.chest]! });
  if (b.chest !== undefined && b.chest !== a.chest) out.push({ t: 'object', id: b.chest, obj: world.objects[b.chest]! });
  return out;
}

/** Cheap structural fingerprint of an inventory, to tell whether a sort changed anything. */
const inventoryKey = (inv: Inventory): string =>
  JSON.stringify(inv.map((s) => (s ? [s.item, s.count, s.data ?? null, s.charges ?? null] : null)));

/** Sorts the backpack (slots 8..31, hotbar untouched) or, with a chestId in reach, that chest. */
export function sortSlots(world: WorldState, playerId: string, chestId?: number): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  if (chestId === undefined) {
    const before = inventoryKey(p.inventory);
    const heldSlot = p.selected;
    const held = p.inventory[heldSlot] ?? null;
    sortInventory(p.inventory, HOTBAR_SIZE, INVENTORY_SIZE);
    if (heldSlot >= HOTBAR_SIZE) {
      // The held backpack stack moved: follow it (same object, else same item, else slot 0).
      let at = held ? p.inventory.indexOf(held, HOTBAR_SIZE) : -1;
      if (at < 0 && held) at = p.inventory.findIndex((s, i) => i >= HOTBAR_SIZE && s?.item === held.item);
      p.selected = at >= 0 ? at : 0;
    }
    if (inventoryKey(p.inventory) === before) return [toast(p.id, T.sorted)];
    return [playerChange(p), toast(p.id, T.sorted)];
  }
  const c = chestNear(world, p, chestId);
  if (!c?.items) return [];
  const before = inventoryKey(c.items);
  sortInventory(c.items);
  if (inventoryKey(c.items) === before) return [toast(p.id, T.sorted)];
  return [{ t: 'object', id: chestId, obj: c }, toast(p.id, T.sorted)];
}

/** Moves backpack items (slots 8..31, except the held one) that already exist in the chest into it. */
export function quickStackToChest(world: WorldState, playerId: string, chestId: number): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  const c = chestNear(world, p, chestId);
  if (!c?.items) return [];
  const n = quickStack(p.inventory, HOTBAR_SIZE, INVENTORY_SIZE, c.items, p.selected);
  if (n <= 0) return [toast(p.id, T.nothingToStack)];
  const text = n === 1 ? T.quickStackedOne : fmt(T.quickStacked, { n });
  return [{ t: 'object', id: chestId, obj: c }, playerChange(p), toast(p.id, text)];
}

export function selectSlot(world: WorldState, playerId: string, slot: number): Change[] {
  const p = world.players[playerId];
  if (!p || slot < 0 || slot >= INVENTORY_SIZE) return [];
  p.selected = slot;
  return [];
}

export function craft(world: WorldState, playerId: string, recipeId: string): Change[] {
  const p = world.players[playerId];
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!p || !r) return [];
  for (const i of r.in) if (countItem(p.inventory, i.item) < i.count) return [toast(p.id, T.notNow)];
  const out: Change[] = [];
  for (const i of r.in) removeItem(p.inventory, i.item, i.count);
  giveItems(world, p, r.out.item, r.out.count, out);
  out.push(toast(p.id, fmt(T.bought, { item: itemName(r.out.item) }).replace('Köpt', 'Snickrade')), playerChange(p));
  return out;
}

export function cook(world: WorldState, playerId: string, recipeId: string): Change[] {
  const p = world.players[playerId];
  const r = COOKING.find((x) => x.id === recipeId);
  if (!p || !r) return [];
  for (const i of r.in) if (countItem(p.inventory, i.item) < i.count) return [toast(p.id, T.notNow)];
  const out: Change[] = [];
  for (const i of r.in) removeItem(p.inventory, i.item, i.count);
  giveItems(world, p, r.out.item, r.out.count, out);
  bump(p, 'cook', 1, out);
  out.push(fx(tileOf(p.x), tileOf(p.y), 'sparkle'), toast(p.id, fmt(T.cooked, { item: itemName(r.out.item) })), playerChange(p));
  return out;
}

export const catalogueAvailable = (id: string, season: Season): boolean => {
  const d = ITEMS[id];
  if (!d || (d.buy === undefined && d.stars === undefined)) return false;
  if (d.season && d.season !== season) return false;
  return true;
};

export function buy(world: WorldState, playerId: string, id: string, qty: number, ctx: SimCtx): Change[] {
  const p = world.players[playerId];
  if (!p || !catalogueAvailable(id, ctx.season)) return [];
  const d = item(id);
  qty = Math.max(1, Math.min(99, Math.floor(qty)));
  if (d.category === 'animal' || d.category === 'clothing') qty = 1;
  const out: Change[] = [];
  if (d.stars !== undefined) {
    if (p.wardrobe.includes(id)) return [toast(p.id, T.notNow)];
    if (p.stars < d.stars) return [toast(p.id, T.notEnoughStars)];
    p.stars -= d.stars;
    p.wardrobe.push(id);
    out.push(toast(p.id, fmt(T.bought, { item: itemName(id) })), fx(tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p));
    return out;
  }
  const cost = (d.buy ?? 0) * qty;
  if (p.coins < cost) return [toast(p.id, T.notEnoughCoins)];
  if (d.category === 'animal' && d.species && ANIMALS[d.species]?.vehicle) {
    const name = SPECIES_NAMES[d.species] ?? d.species;
    const already = Object.values(farmOf(world).animals)
      .concat(Object.values(world.animals))
      .some((a) => a.owner === p.id && a.species === d.species);
    if (already) return [toast(p.id, fmt(T.alreadyHaveVehicle, { name }))];
    if (!canRideIn(world, tileOf(p.x), tileOf(p.y))) return [toast(p.id, T.notNow)];
    p.coins -= cost;
    const a: AnimalState = { ...dummyAnimal, id: world.nextId++, species: d.species, homeId: 0, name: '', named: false, age: 10, owner: p.id, variant: d.variant ?? 0 };
    // parked on the nearest free tile next to the buyer
    const ptx = tileOf(p.x);
    const pty = tileOf(p.y);
    let spot = { tx: ptx, ty: pty + 1 };
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]] as const) {
      if (inBounds(ptx + dx, pty + dy) && !isSolidForAnimal(world, ptx + dx, pty + dy) && !(isFarm(world) && inInterior(ptx + dx, pty + dy))) {
        spot = { tx: ptx + dx, ty: pty + dy };
        break;
      }
    }
    a.x = spot.tx * TILE + TILE / 2;
    a.y = spot.ty * TILE + TILE / 2;
    a.facing = 'right';
    world.animals[a.id] = a;
    out.push(toast(p.id, fmt(T.vehicleBought, { name: itemName(id) })), fx(spot.tx, spot.ty, 'sparkle'), fx(tileOf(p.x), tileOf(p.y), 'coin'), playerChange(p), { t: 'animal', id: a.id, animal: a });
    return out;
  }
  if (d.category === 'animal' && d.species && ANIMALS[d.species]?.pet) {
    const already = Object.values(world.animals).some((a) => a.owner === p.id && a.species === d.species) || p.orders.some((o) => o.species === d.species);
    if (already) return [toast(p.id, T.notNow)];
    p.coins -= cost;
    p.orders.push({ species: d.species, homeId: 0 });
    out.push(toast(p.id, fmt(T.animalOrdered, { species: SPECIES_NAMES[d.species] ?? d.species })), fx(tileOf(p.x), tileOf(p.y), 'coin'), playerChange(p));
    return out;
  }
  if (d.category === 'animal' && d.species) {
    const adef = ANIMALS[d.species]!;
    const houses = Object.values(world.objects).filter((o) => objectDef(o.kind).houses?.species === d.species);
    if (houses.length === 0) return [toast(p.id, fmt(T.needHouse, { house: itemName(adef.house) }))];
    const occupancy = (homeId: number) =>
      Object.values(world.animals).filter((a) => a.homeId === homeId).length +
      Object.values(world.players).reduce((n, pl) => n + pl.orders.filter((o) => o.homeId === homeId).length, 0);
    const home = houses.find((h) => occupancy(h.id) < (objectDef(h.kind).houses?.capacity ?? 0));
    if (!home) return [toast(p.id, fmt(T.houseFull, { house: itemName(adef.house) }))];
    p.coins -= cost;
    p.orders.push({ species: d.species, homeId: home.id });
    out.push(toast(p.id, fmt(T.animalOrdered, { species: SPECIES_NAMES[d.species] ?? d.species })), fx(tileOf(p.x), tileOf(p.y), 'coin'), playerChange(p));
    return out;
  }
  if (d.category === 'clothing') {
    if (p.wardrobe.includes(id)) return [toast(p.id, T.notNow)];
    p.coins -= cost;
    p.wardrobe.push(id);
    out.push(toast(p.id, fmt(T.bought, { item: itemName(id) })), playerChange(p));
    return out;
  }
  if (!hasSpace(p.inventory, id, qty)) return [toast(p.id, T.inventoryFull)];
  p.coins -= cost;
  addItem(p.inventory, id, qty);
  out.push(toast(p.id, fmt(T.bought, { item: `${qty} ${itemName(id)}` })), playerChange(p));
  return out;
}

export function sell(world: WorldState, playerId: string, slot: number, qty: number): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  const s = p.inventory[slot];
  if (!s) return [];
  const d = item(s.item);
  if (d.sell === undefined) return [toast(p.id, T.notNow)];
  const taken = takeFromSlot(p.inventory, slot, Math.max(1, Math.floor(qty)));
  if (!taken) return [];
  const price = taken.data !== undefined ? PAINTED_SELL : d.sell;
  p.coins += price * taken.count;
  const out: Change[] = [fx(tileOf(p.x), tileOf(p.y), 'coin')];
  bump(p, 'earned', price * taken.count, out);
  out.push(playerChange(p));
  return out;
}

export function equip(world: WorldState, playerId: string, slot: ClothingSlot, id: string | null): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  if (id === null) {
    if (slot === 'hat') delete p.outfit.hat;
    else return []; // shirts, pants and shoes always stay on
  } else {
    const d = ITEMS[id];
    if (!d?.clothing || d.clothing.slot !== slot || !p.wardrobe.includes(id)) return [];
    p.outfit[slot] = id;
  }
  return [playerChange(p)];
}

export function emote(world: WorldState, playerId: string, id: string, ctx: SimCtx): Change[] {
  const p = world.players[playerId];
  if (!p || !T.emotes.includes(id)) return [];
  p.emote = { id, until: ctx.now + EMOTE_MS };
  return [];
}

export function dropItem(world: WorldState, playerId: string, slot: number, qty: number): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  const taken = takeFromSlot(p.inventory, slot, Math.max(1, Math.floor(qty)));
  if (!taken) return [];
  const f = facingTile(p);
  let x = f.tx * TILE + TILE / 2;
  let y = f.ty * TILE + TILE / 2;
  if (isSolidForPlayer(world, f.tx, f.ty)) {
    x = p.x;
    y = p.y;
  }
  const d = spawnDrop(world, taken.item, taken.count, x, y, p.id);
  if (taken.charges !== undefined) d.count = 1;
  if (taken.data !== undefined) d.data = taken.data;
  return [{ t: 'drop', id: d.id, drop: d }, playerChange(p)];
}

/** Turns one paper into a painted tavla (the drawing screen's "Klar"). */
export function paint(world: WorldState, playerId: string, pixels: string): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  if (!isValidPainting(pixels)) return [toast(p.id, T.paintEmpty)];
  if (!removeItem(p.inventory, 'paper', 1)) return [toast(p.id, T.notNow)];
  const out: Change[] = [];
  giveStack(world, p, { item: 'painting', count: 1, data: pixels }, out);
  bump(p, 'paint', 1, out);
  out.push(fx(tileOf(p.x), tileOf(p.y), 'sparkle'), toast(p.id, T.paintDone), playerChange(p));
  return out;
}

export function nameAnimal(world: WorldState, playerId: string, id: number, name: string): Change[] {
  const a = world.animals[id];
  const p = world.players[playerId];
  if (!a || !p) return [];
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!clean) return [];
  const old = animalDisplayName(a);
  a.name = clean;
  a.named = true;
  return [{ t: 'animal', id, animal: a }, toast(null, fmt(T.renamed, { name: old, newName: clean }))];
}

export function setOnline(world: WorldState, playerId: string, online: boolean): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  p.online = online;
  p.moving = false;
  return [playerChange(p)];
}

export function applyMove(world: WorldState, playerId: string, x: number, y: number, facing: Facing, moving: boolean): void {
  const p = world.players[playerId];
  if (!p || !Number.isFinite(x) || !Number.isFinite(y) || p.sleeping) return;
  if (isSagaKey(world.area) && sagaRooted(world, p)) return;
  if (p.moveLock && p.moveLock > 0) {
    // just arrived on another map: the client's old positions are meaningless; accept only nearby ones
    if (Math.hypot(x - p.x, y - p.y) > 3 * TILE) return;
    delete p.moveLock;
  }
  // A client that just walked through a portal reports a position by the portal's exit
  for (const portal of isFarm(world) ? PORTALS : []) {
    const nearFrom = Math.hypot(p.x - (portal.from.x + 0.5) * TILE, p.y - (portal.from.y + 0.5) * TILE) <= 3 * TILE;
    const nearTo = Math.hypot(x - (portal.to.x + 0.5) * TILE, y - (portal.to.y + 0.5) * TILE) <= 3 * TILE;
    if (nearFrom && nearTo && !isSolidForPlayer(world, tileOf(x), tileOf(y))) {
      p.x = x;
      p.y = y;
      p.facing = facing;
      p.moving = moving;
      delete p.fishing;
      return;
    }
  }
  const r = resolveMove((tx, ty) => isSolidForPlayer(world, tx, ty), p.x, p.y, x, y);
  const moved = r.x !== p.x || r.y !== p.y;
  p.x = r.x;
  p.y = r.y;
  p.facing = facing;
  p.moving = moving;
  if (moved && p.fishing) delete p.fishing;
  if (applyPortal(p, world) && p.riding !== undefined) {
    // walked indoors: the horse waits outside where it was (tickRiding would otherwise drag it along)
    const a = world.animals[p.riding];
    delete p.riding;
    if (a) {
      a.x = r.x;
      a.y = r.y;
      a.moving = false;
      a.waitMs = 1500;
    }
  }
}

// ---------------------------------------------------------------------------
// Fishing
// ---------------------------------------------------------------------------

function fishingAct(world: WorldState, p: PlayerState, ctx: SimCtx, out: Change[]): void {
  const f = p.fishing!;
  delete p.fishing;
  delete p.emote;
  if (!f.bite) {
    out.push(toast(p.id, T.fishingLost));
    return;
  }
  const total = FISH.reduce((n, x) => n + x.weight, 0);
  let r = ctx.rnd() * total;
  let caught = FISH[0]!.item;
  for (const x of FISH) {
    r -= x.weight;
    if (r <= 0) {
      caught = x.item;
      break;
    }
  }
  giveItems(world, p, caught, 1, out);
  bump(p, 'fish', 1, out);
  if (caught === 'fish_gold') bump(p, 'fish_gold', 1, out);
  out.push(fx(f.x, f.y, 'sparkle'), toast(p.id, fmt(T.fishingCaught, { fish: itemName(caught) })), playerChange(p));
}

const NPC_SPEED = 28;

/** Villagers walk their daily routine, pausing to chat when a player stands close. */
export function tickNpcs(world: WorldState, dtMs: number): void {
  for (const def of npcsIn(world)) {
    const st = npcState(world, def.id);
    const wp = routineTarget(def, farmOf(world).timeMs);
    const tx = wp.x * TILE + TILE / 2;
    const ty = wp.y * TILE + TILE / 2;
    const dx = tx - st.x;
    const dy = ty - st.y;
    const dist = Math.hypot(dx, dy);
    // Someone nearby? Stop and face them.
    let near: PlayerState | null = null;
    let nearD = 2.5 * TILE;
    for (const p of Object.values(world.players)) {
      if (!p.online) continue;
      const d = Math.hypot(p.x - st.x, p.y - st.y);
      if (d < nearD) {
        nearD = d;
        near = p;
      }
    }
    if (near) {
      const ex = near.x - st.x;
      const ey = near.y - st.y;
      st.facing = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'down' : 'up';
      st.moving = false;
      continue;
    }
    if (dist < 2) {
      st.moving = false;
      st.stuckMs = 0;
      continue;
    }
    const step = Math.min(dist, (NPC_SPEED * dtMs) / 1000);
    const nx = st.x + (dx / dist) * step;
    const ny = st.y + (dy / dist) * step;
    const r = resolveMove((x, y) => isSolidForNpc(world, x, y), st.x, st.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H);
    const moved = Math.hypot(r.x - st.x, r.y - st.y);
    st.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (moved < step * 0.5) {
      st.stuckMs += dtMs;
      if (st.stuckMs > 2500) {
        // Something is in the way (a rock, a fence): hop over to the next spot
        st.x = tx;
        st.y = ty;
        st.stuckMs = 0;
      }
      st.moving = false;
      continue;
    }
    st.x = r.x;
    st.y = r.y;
    st.moving = true;
  }
}

const isSolidForNpc = (world: WorldState, tx: number, ty: number): boolean => {
  if (!inBounds(tx, ty)) return true;
  const t = world.terrain[tileIndex(tx, ty)];
  if (t === 'water' || t === 'pool' || t === 'soil' || t === 'soil_wet') return true;
  if (world.crops[key(tx, ty)] || portalAt(tx, ty)) return true;
  const obj = objectAt(world, tx, ty);
  return !!obj && objectDef(obj.kind).solid;
};

function tickFishing(world: WorldState, ctx: SimCtx, out: Change[]): void {
  for (const p of Object.values(world.players)) {
    const f = p.fishing;
    if (!f) continue;
    if (!f.bite && ctx.now >= f.biteAt) {
      f.bite = true;
      f.until = ctx.now + 1300;
      p.emote = { id: 'napp', until: f.until };
      out.push(...tagArea([fx(f.x, f.y, 'water')], p.area), toast(p.id, T.fishingBite));
    } else if (f.bite && ctx.now >= f.until) {
      delete p.fishing;
      delete p.emote;
      out.push(toast(p.id, T.fishingLost));
    }
  }
}

// ---------------------------------------------------------------------------
// Villagers and quests
// ---------------------------------------------------------------------------

const QUEST_POOL: { npc: string; kind: keyof typeof QUEST_TEXTS; items: string[]; count: [number, number]; stars: number }[] = [
  { npc: 'greta', kind: 'crop', items: ['carrot', 'potato', 'strawberry', 'tomato', 'pumpkin', 'sunflower', 'wheat'], count: [2, 5], stars: 1 },
  { npc: 'greta', kind: 'product', items: ['egg', 'milk', 'wool'], count: [1, 2], stars: 2 },
  { npc: 'greta', kind: 'material', items: ['wood', 'stone', 'fiber'], count: [6, 12], stars: 1 },
  { npc: 'greta', kind: 'dish', items: ['bread', 'pancakes', 'carrot_cake', 'strawberry_jam'], count: [1, 2], stars: 3 },
  { npc: 'greta', kind: 'explore', items: ['blueberry', 'cloudberry', 'banana', 'mushroom'], count: [2, 5], stars: 2 },
  { npc: 'sven', kind: 'fish', items: ['fish_roach', 'fish_perch', 'fish_pike'], count: [1, 3], stars: 2 },
  { npc: 'elsa', kind: 'kid', items: ['strawberry', 'carrot', 'egg', 'bread', 'hay'], count: [1, 3], stars: 1 },
  { npc: 'elsa', kind: 'flowers', items: ['fiber'], count: [3, 6], stars: 1 },
  { npc: 'bo', kind: 'bake', items: ['wheat', 'egg', 'milk', 'honey'], count: [2, 4], stars: 2 },
  { npc: 'pino', kind: 'pizza', items: ['tomato', 'wheat'], count: [2, 4], stars: 2 },
  { npc: 'stina', kind: 'smith', items: ['stone', 'gold', 'gem', 'crystal', 'obsidian'], count: [1, 6], stars: 2 },
  { npc: 'lind', kind: 'garden', items: ['fiber', 'honey', 'mushroom', 'strawberry', 'iceberry', 'glowshroom', 'blueberry'], count: [2, 5], stars: 2 },
  { npc: 'sven', kind: 'material', items: ['wood'], count: [5, 10], stars: 1 },
];

const FIXED_QUESTS: Quest[] = [
  {
    id: 'elsa_flowerbox',
    npc: 'elsa',
    want: { item: 'stone', count: 5 },
    reward: { coins: 20, stars: 2, item: { item: 'flowerbox', count: 1 } },
    text: 'Pappa sa att jag får en blomlåda om jag hittar 5 fina stenar. Hjälper du mig?',
    fixed: true,
  },
  {
    id: 'sven_rod',
    npc: 'sven',
    want: { item: 'wood', count: 5 },
    reward: { coins: 0, stars: 1, item: { item: 'rod', count: 1 } },
    text: fmt(QUEST_TEXTS.rod![0]!, { n: 5, item: itemName('wood').toLowerCase() }),
    fixed: true,
  },
];

/** Generates today's quest offers (deterministic per day). */
export function generateQuests(world: WorldState): void {
  const rnd = mulberry(world.day * 7919 + 17);
  const quests: Quest[] = [...FIXED_QUESTS];
  for (const npc of Object.keys(NPCS)) {
    const pool = QUEST_POOL.filter((q) => q.npc === npc);
    const used = new Set<string>();
    for (let i = 0; i < 2 && pool.length; i++) {
      const tpl = pool[Math.floor(rnd() * pool.length)]!;
      const candidates = tpl.items.filter((x) => !used.has(x));
      const itemId = candidates[Math.floor(rnd() * candidates.length)] ?? tpl.items[0]!;
      used.add(itemId);
      let n = tpl.count[0] + Math.floor(rnd() * (tpl.count[1] - tpl.count[0] + 1));
      n = Math.max(1, Math.min(n, Math.floor(130 / Math.max(1, ITEMS[itemId]?.sell ?? 1))));
      const texts = QUEST_TEXTS[tpl.kind] ?? ['{n} {item}'];
      const coins = Math.round(((ITEMS[itemId]?.sell ?? 5) * n * 1.6 + 15) / 5) * 5;
      quests.push({
        id: `d${world.day}_${npc}_${i}`,
        npc,
        want: { item: itemId, count: n },
        reward: { coins, stars: tpl.stars },
        text: fmt(texts[Math.floor(rnd() * texts.length)]!, { n, item: itemName(itemId).toLowerCase() }),
      });
    }
  }
  world.quests = quests;
  world.questsDay = world.day;
}

const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Quests a player can still do today. */
export const openQuests = (world: WorldState, p: PlayerState, npc?: string): Quest[] =>
  world.quests.filter((q) => !p.questsDone.includes(q.id) && (!npc || q.npc === npc));

export function completeQuest(world: WorldState, playerId: string, questId: string): Change[] {
  const p = world.players[playerId];
  const q = world.quests.find((x) => x.id === questId);
  if (!p || !q || p.questsDone.includes(q.id)) return [];
  const npc = NPCS[q.npc];
  if (!npc || (npc.area ?? 'farm') !== p.area) return [];
  const st = npcState(areaOf(farmOf(world), p), npc.id);
  if (Math.abs(tileOf(p.x) - tileOf(st.x)) > REACH + 1 || Math.abs(tileOf(p.y) - tileOf(st.y)) > REACH + 1) return [];
  if (countItem(p.inventory, q.want.item) < q.want.count) return [toast(p.id, T.questNoItems)];
  const out: Change[] = [];
  removeItem(p.inventory, q.want.item, q.want.count);
  p.questsDone.push(q.id);
  p.coins += q.reward.coins;
  p.stars += q.reward.stars;
  if (q.reward.coins) bump(p, 'earned', q.reward.coins, out);
  const parts: string[] = [];
  if (q.reward.coins) parts.push(`${q.reward.coins} ${T.coins}`);
  if (q.reward.item) {
    giveItems(world, p, q.reward.item.item, q.reward.item.count, out);
    parts.push(itemName(q.reward.item.item));
  }
  parts.push(`${q.reward.stars} ⭐`);
  bump(p, 'quests', 1, out);
  out.push(fx(tileOf(st.x), tileOf(st.y), 'heart'), fx(tileOf(p.x), tileOf(p.y), 'coin'), toast(p.id, fmt(T.questDone, { reward: parts.join(' + ') })), playerChange(p));
  return out;
}

// ---------------------------------------------------------------------------
// The cave
// ---------------------------------------------------------------------------

/** The world a player is currently in. */
export const areaOf = (world: WorldState, p: PlayerState): WorldState => {
  if (p.area === 'dungeon') return world.dungeon ?? world;
  if (p.area !== 'farm') return world.areas?.[p.area] ?? world;
  return world;
};

/** The farm world that owns a dungeon or area world (they keep a non-enumerable back reference). */
export const farmOf = (world: WorldState): WorldState => (!isFarm(world) ? ((world as WorldState & { farm?: WorldState }).farm ?? world) : world);

const linkToFarm = (child: WorldState, farm: WorldState): void => {
  Object.defineProperty(child, 'farm', { value: farm, enumerable: false, writable: true, configurable: true });
};

/** Generates the overworld map at (ax, ay). */
export const buildArea = (ax: number, ay: number): WorldState => generateArea(ax, ay);

/** Loads (or generates) an overworld area. The server may pre-fill world.areas from the database. */
export function getArea(world: WorldState, keyStr: string): WorldState | null {
  const farm = farmOf(world);
  if (keyStr === 'farm') return farm;
  if (keyStr === 'dungeon') return farm.dungeon ?? null;
  if (!farm.areas) farm.areas = {};
  let a = farm.areas[keyStr];
  if (!a) {
    if (isBathKey(keyStr)) {
      if (!getArea(farm, villageOfBath(keyStr))) return null;
      a = generateBath(villageOfBath(keyStr));
    } else if (isHallKey(keyStr)) {
      if (!getArea(farm, villageOfHall(keyStr))) return null;
      a = generateHall(villageOfHall(keyStr));
    } else if (isSagaKey(keyStr)) {
      const id = dungeonOfKey(keyStr);
      if (!id) return null;
      a = generateSaga(id);
    } else if (isMoonKey(keyStr)) a = generateMoon();
    else if (isCaveKey(keyStr)) {
      // a cave is built from its entrance: the theme from the entrance, the way out in front of it
      const ck = parseCaveKey(keyStr);
      const parent = ck ? getArea(farm, ck.parent) : null;
      const mouth = ck && parent ? parent.objects[ck.mouth] : undefined;
      const theme = mouth ? themeOfEntrance(mouth) : null;
      if (!ck || !mouth || !theme) return null;
      a = generateCave(keyStr, theme, ck.parent, entranceFront(mouth));
    } else {
      const c = areaCoords(keyStr);
      if (!c) return null;
      a = buildArea(c.ax, c.ay);
    }
    farm.areas[keyStr] = a;
  }
  linkToFarm(a, farm);
  if (!sagaChecked.has(a)) {
    sagaChecked.add(a);
    ensureSagaPlaces(keyStr, a);
  }
  return a;
}
/** Maps already checked for their dungeon arch and Kämpastenen. */
const sagaChecked = new WeakSet<WorldState>();

export const areaName = (keyStr: string, world?: WorldState): string => {
  if (keyStr === 'farm' || keyStr === 'dungeon') return BIOME_NAMES[keyStr];
  if (isBathKey(keyStr)) return T.bathhouseName;
  if (isHallKey(keyStr)) return T.hallName;
  const sagaId = dungeonOfKey(keyStr);
  if (sagaId) return DUNGEONS[sagaId].name;
  const a = world ? getArea(world, keyStr) : null;
  return placeName(a?.biome);
};

/** Moves a player to another map at a given tile. */
export function placeIn(world: WorldState, p: PlayerState, keyStr: string, tx: number, ty: number, facing: Facing, out: Change[]): boolean {
  const farm = farmOf(world);
  const target = getArea(farm, keyStr);
  if (!target) return false;
  const current = areaOf(farm, p);
  const ridden = p.riding !== undefined ? current.animals[p.riding] : undefined;
  const drove = ridden && (isVehicle(ridden) || ANIMALS[ridden.species]?.mount) ? ridden : undefined;
  if (p.riding !== undefined) dismount(current, p, out);
  if (current !== farm) delete current.players[p.id];
  p.area = keyStr;
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE / 2;
  p.facing = facing;
  p.moving = false;
  delete p.fishing;
  if (target !== farm) target.players[p.id] = p;
  p.moveLock = 30;
  if (current !== target) {
    movePetsAlong(current, target, keyStr, p, out);
    if (drove && canRideIn(target, tx, ty)) {
      moveAnimalAlong(current, target, keyStr, drove, p, out);
      p.riding = drove.id;
      drove.x = p.x;
      drove.y = p.y + 1;
      drove.facing = p.facing;
    }
  }
  if (!p.visited) p.visited = ['farm'];
  // dungeons greet you themselves and are not places on the world map
  const firstVisit = !isSagaKey(keyStr) && !p.visited.includes(keyStr);
  if (firstVisit) {
    p.visited.push(keyStr);
    if (isCaveKey(keyStr)) bump(p, 'caves', 1, out);
    else if (!isIndoorKey(keyStr)) bump(p, 'areas', 1, out);
  }
  if (target !== farm) out.push({ t: 'areaData', to: p.id, key: keyStr, world: target });
  out.push(playerChange(p));
  // the first time somewhere: a cheer for a new kind of place, else a hello (caves and buildings greet you themselves)
  if (firstVisit && keyStr !== 'farm' && !discoverBiome(farm, p, target, out) && !isCaveKey(keyStr) && !isIndoorKey(keyStr)) out.push(toast(p.id, fmt(T.newArea, { name: areaName(keyStr, farm) })));
  if (firstVisit && keyStr !== 'farm') out.push(fx(tx, ty, 'sparkle'));
  return true;
}

/** Pets (and lasso-tamed animals) follow their owner from map to map; they get a fresh id in the new map. */
function movePetsAlong(from: WorldState, to: WorldState, toKey: string, p: PlayerState, out: Change[]): void {
  if (to.area === 'dungeon') return;
  for (const a of Object.values(from.animals)) {
    // pets follow, and the dungeons' mounts when whistled for (but they wait outside a dungeon)
    const mount = !!ANIMALS[a.species]?.mount && !!a.follow && !isSagaKey(toKey) && !isIndoorKey(toKey);
    if (a.owner !== p.id || !(isPetAnimal(a) || mount) || a.stay) continue;
    moveAnimalAlong(from, to, toKey, a, p, out);
  }
}

/** Moves one animal into the player's new map (fresh id there) and tells both maps. */
function moveAnimalAlong(from: WorldState, to: WorldState, toKey: string, a: AnimalState, p: PlayerState, out: Change[]): void {
  const fromKey = from.area ?? 'farm';
  delete from.animals[a.id];
  const gone: Change = { t: 'animal', id: a.id, animal: null };
  if (fromKey !== 'farm') gone.area = fromKey;
  a.id = to.nextId++;
  a.x = p.x;
  a.y = p.y + 3;
  a.moving = false;
  delete a.tx;
  delete a.ty;
  to.animals[a.id] = a;
  const here: Change = { t: 'animal', id: a.id, animal: a };
  if (toKey !== 'farm') here.area = toKey;
  out.push(gone, here);
}

const DIRS: Record<'n' | 's' | 'e' | 'w', { dx: number; dy: number; opposite: 'n' | 's' | 'e' | 'w' }> = {
  n: { dx: 0, dy: -1, opposite: 's' },
  s: { dx: 0, dy: 1, opposite: 'n' },
  e: { dx: 1, dy: 0, opposite: 'w' },
  w: { dx: -1, dy: 0, opposite: 'e' },
};

/** Walks off an edge of the current area into the neighbouring one. */
export function travel(world: WorldState, playerId: string, dir: 'n' | 's' | 'e' | 'w'): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.area === 'dungeon') return [];
  const c = areaCoords(p.area);
  if (!c) return [];
  // must stand in the edge gap on that side
  const tx = tileOf(p.x);
  const ty = tileOf(p.y);
  const atEdge = (dir === 'n' && ty <= 1) || (dir === 's' && ty >= MAP_H - 2) || (dir === 'w' && tx <= 1) || (dir === 'e' && tx >= MAP_W - 2);
  if (!atEdge || !inEdgeGap(tx, ty)) return [];
  const d = DIRS[dir];
  const nx = c.ax + d.dx;
  const ny = c.ay + d.dy;
  const keyStr = nx === 0 && ny === 0 ? 'farm' : areaKey(nx, ny);
  const arrive = arrivalTile(d.opposite);
  const out: Change[] = [];
  placeIn(farm, p, keyStr, arrive.x, arrive.y, dir === 'n' ? 'up' : dir === 's' ? 'down' : dir === 'e' ? 'right' : 'left', out);
  return out;
}

/** Jumps to a visited area (or home). */
export function teleport(world: WorldState, playerId: string, keyStr: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.area === 'dungeon' || keyStr === 'dungeon' || isCaveKey(keyStr) || isIndoorKey(keyStr)) return [];
  if (keyStr !== 'farm' && !(p.visited ?? []).includes(keyStr)) return [];
  const out: Change[] = [];
  if (keyStr === 'farm') placeIn(farm, p, 'farm', SPAWN.x, SPAWN.y, 'down', out);
  else {
    const target = getArea(farm, keyStr);
    if (!target) return [];
    const at = isMoonKey(keyStr) ? rocketFront(MOON_ROCKET) : openTileNear(target, MAP_W / 2, MAP_H / 2);
    placeIn(farm, p, keyStr, at.x, at.y, 'down', out);
  }
  out.push(fx(tileOf(p.x), tileOf(p.y), 'sparkle'));
  return out;
}

/** The open tile nearest (x, y) that you can walk to from the map's openings (else just any open tile). */
export function openTileNear(world: WorldState, x: number, y: number): { x: number; y: number } {
  const reach = reachableFrom(world, arrivalTile('n'));
  let fallback: { x: number; y: number } | null = null;
  for (let r = 0; r < MAP_W; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(tx, ty) || isSolidForPlayer(world, tx, ty)) continue;
        if (reach[tileIndex(tx, ty)]) return { x: tx, y: ty };
        fallback ??= { x: tx, y: ty };
      }
  return fallback ?? { x, y };
}

// ---------------------------------------------------------------------------
// Public transport: buses between places you know, trains also to one unknown city
// ---------------------------------------------------------------------------
export const TRANSPORT_PRICE: Record<'bus' | 'train', number> = { bus: 5, train: 15 };
export interface Destination {
  key: string;
  name: string;
  price: number;
  /** A city nobody has visited yet (train only). */
  unknown?: boolean;
}

/** Name of a city area (the first city is just "Byn"; others get their map coordinates). */
export const cityName = (keyStr: string): string => {
  if (keyStr === 'farm') return T.travelHome;
  const c = areaCoords(keyStr);
  if (!c) return BIOME_NAMES.by;
  return c.ax === 1 && c.ay === 0 ? BIOME_NAMES.by : `${T.cityName} ${c.ax},${c.ay}`;
};

/** The nearest city nobody in the party has been to (scanning outward from the farm). */
export function nearestUnknownCity(visited: string[]): string | null {
  for (let r = 1; r <= 16; r++)
    for (let ax = -r; ax <= r; ax++)
      for (const ay of ax === -r || ax === r ? Array.from({ length: 2 * r + 1 }, (_, i) => i - r) : [-r, r]) {
        if (biomeAt(ax, ay) !== 'by') continue;
        const k = areaKey(ax, ay);
        if (!visited.includes(k)) return k;
      }
  return null;
}

/** Where this player can go from a bus stop / station right now. */
export function transportDestinations(p: PlayerState, via: 'bus' | 'train'): Destination[] {
  const visited = p.visited ?? ['farm'];
  const price = TRANSPORT_PRICE[via];
  const out: Destination[] = [];
  if (p.area !== 'farm') out.push({ key: 'farm', name: T.travelHome, price });
  for (const k of visited) {
    const c = areaCoords(k);
    if (!c || k === 'farm' || k === p.area || biomeAt(c.ax, c.ay) !== 'by') continue;
    out.push({ key: k, name: cityName(k), price });
  }
  if (via === 'train') {
    const unknown = nearestUnknownCity(visited);
    if (unknown && unknown !== p.area) out.push({ key: unknown, name: T.unknownCity, price, unknown: true });
  }
  return out;
}

const stopKind = (via: 'bus' | 'train', keyStr: string): string => (via === 'train' && keyStr !== 'farm' ? 'train_station' : 'bus_stop');

/** Is the player standing next to a stop of this kind? */
function nearStop(world: WorldState, p: PlayerState, via: 'bus' | 'train'): boolean {
  const kind = stopKind(via, p.area);
  const ptx = tileOf(p.x);
  const pty = tileOf(p.y);
  for (const o of Object.values(world.objects)) {
    if (o.kind !== kind) continue;
    const def = objectDef(o.kind);
    if (ptx >= o.x - REACH - 1 && ptx <= o.x + def.w + REACH && pty >= o.y - REACH - 1 && pty <= o.y + def.h + REACH) return true;
  }
  return false;
}

/** Boards a bus or train: charges the fare and moves the player to the stop at the destination. */
export function ride(world: WorldState, playerId: string, via: 'bus' | 'train', to: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.area === 'dungeon' || (via !== 'bus' && via !== 'train')) return [];
  const here = areaOf(farm, p);
  if (!nearStop(here, p, via)) return [toast(p.id, T.noTransportHere)];
  const dest = transportDestinations(p, via).find((d) => d.key === to);
  if (!dest) return [toast(p.id, T.notNow)];
  if (p.coins < dest.price) return [toast(p.id, T.notEnoughCoins)];
  const target = getArea(farm, to);
  if (!target) return [toast(p.id, T.notNow)];
  p.coins -= dest.price;
  // land in front of the stop at the other end
  const kind = stopKind(via, to);
  const stop = Object.values(target.objects).find((o) => o.kind === kind) ?? Object.values(target.objects).find((o) => o.kind === 'bus_stop');
  let tx = to === 'farm' ? SPAWN.x : MAP_W / 2;
  let ty = to === 'farm' ? SPAWN.y : MAP_H / 2;
  if (stop) {
    const def = objectDef(stop.kind);
    tx = stop.x + Math.floor(def.w / 2);
    ty = stop.y + def.h;
  }
  for (let r = 0; r < 6 && isSolidForPlayer(target, tx, ty); r++) ty += 1;
  const place = dest.unknown ? cityName(to) : dest.name;
  const out: Change[] = [{ t: 'ride', to: p.id, via, place }, toast(p.id, fmt(via === 'bus' ? T.busLeaving : T.trainLeaving, { place }))];
  placeIn(farm, p, to, tx, ty, 'down', out);
  bump(p, 'rides', 1, out);
  if (via === 'train') bump(p, 'train_rides', 1, out);
  out.push(playerChange(p));
  void ctx;
  return out;
}

const dungeonOccupied = (d: WorldState): boolean => Object.values(d.players).some((p) => p.online && p.area === 'dungeon');

export function enterCave(world: WorldState, playerId: string): Change[] {
  const p = world.players[playerId];
  if (!p || p.area === 'dungeon') return [];
  const hasWeapon = p.inventory.some((s) => s && (s.item === 'sword' || s.item === 'bow' || s.item === 'bazooka'));
  if (!hasWeapon) return [toast(p.id, T.caveNeedWeapon)];
  let d = world.dungeon;
  if (!d || (d.dungeonInfo?.cleared && !dungeonOccupied(d))) {
    const level = 1 + Math.floor((p.stats?.boss ?? 0) / 2);
    d = generateDungeon((Date.now() ^ (world.day * 7919)) >>> 0, level);
    linkToFarm(d, world);
    world.dungeon = d;
  }
  const start = dungeonStart(d);
  p.area = 'dungeon';
  p.hearts = MAX_HEARTS;
  p.x = start.x * TILE + TILE / 2;
  p.y = start.y * TILE + TILE / 2;
  p.facing = 'down';
  p.moving = false;
  delete p.fishing;
  d.players[p.id] = p;
  p.moveLock = 30;
  return [{ t: 'areaData', to: p.id, key: 'dungeon', world: d }, playerChange(p), toast(p.id, T.enteredCave)];
}

/** Puts the player back on the farm by the cave mouth. `knockedOut` adds the gentle message. */
export function leaveCave(world: WorldState, playerId: string, knockedOut: boolean): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  const d = farm.dungeon;
  if (d) delete d.players[p.id];
  p.area = 'farm';
  p.hearts = MAX_HEARTS;
  delete p.hurtUntil;
  p.x = CAVE_EXIT_TILE.x * TILE + TILE / 2;
  p.y = CAVE_EXIT_TILE.y * TILE + TILE / 2;
  p.facing = 'down';
  p.moving = false;
  p.moveLock = 30;
  const out: Change[] = [playerChange(p)];
  if (knockedOut) out.push(toast(p.id, T.knockedOut));
  if (d && d.dungeonInfo?.cleared && !dungeonOccupied(d)) delete farm.dungeon;
  return out;
}

/** Hits a cave monster, a wild predator or one of Loke's roaming servants (the sword, arrows, rockets, hero spells). */
export function attackMob(d: WorldState, p: PlayerState, mob: AnimalState, dmg: number, ctx: SimCtx, out: Change[]): void {
  const def = combatDef(mob);
  if (!def) return;
  const predator = !ANIMALS[mob.species]?.mob;
  mob.hp = (mob.hp ?? def.hp) - dmg;
  const mtx = tileOf(mob.x);
  const mty = tileOf(mob.y);
  out.push(fx(mtx, mty, 'hit'));
  if (mob.hp > 0) {
    out.push({ t: 'animal', id: mob.id, animal: mob });
    return;
  }
  delete d.animals[mob.id];
  out.push({ t: 'animal', id: mob.id, animal: null }, fx(mtx, mty, 'poof'));
  for (const drop of def.drops) {
    if (ctx.rnd() > drop.chance) continue;
    const n = randInt(ctx.rnd, drop.min, drop.max);
    const dr = spawnDrop(d, drop.item, n, mob.x + (ctx.rnd() - 0.5) * 10, mob.y + (ctx.rnd() - 0.5) * 10);
    out.push({ t: 'drop', id: dr.id, drop: dr });
  }
  bump(p, predator ? 'predators' : 'mobs', 1, out);
  // experience for everyone close by, whatever beat it (SAGA_XP: roaming monsters, predators, the cave's monsters)
  killXp(d, p, mob, out);
  if (predator) {
    out.push(toast(p.id, fmt(T.predatorDown, { name: mob.name })), playerChange(p));
    return;
  }
  // Loke's servants out in the world: the saga's field tasks, quests and experience, and a world boss's chest
  if (d.area !== 'dungeon' && roamingDown(d, p, mob, ctx, out)) return;
  if (def.boss) {
    bump(p, 'boss', 1, out);
    const chest = addObject(d, 'treasure', mtx, mty) ?? addObject(d, 'treasure', mtx + 1, mty) ?? addObject(d, 'treasure', mtx, mty + 1);
    if (chest) out.push({ t: 'object', id: chest.id, obj: chest });
    out.push(toast(null, T.bossDown));
  } else out.push(toast(p.id, fmt(T.mobDown, { name: mob.name })));
  out.push(playerChange(p));
}

function shootArrow(d: WorldState, p: PlayerState, ctx: SimCtx, out: Change[]): void {
  const dir = p.facing === 'left' ? [-1, 0] : p.facing === 'right' ? [1, 0] : p.facing === 'up' ? [0, -1] : [0, 1];
  let tx = tileOf(p.x);
  let ty = tileOf(p.y);
  const from = { x: p.x, y: p.y };
  for (let i = 0; i < 6; i++) {
    tx += dir[0]!;
    ty += dir[1]!;
    if (!inBounds(tx, ty) || d.terrain[tileIndex(tx, ty)] === 'water') break;
    const obj = objectAt(d, tx, ty);
    if (obj && objectDef(obj.kind).solid) break;
    const mob = animalAt(d, tx, ty);
    if (mob && isHostile(mob)) {
      out.push({ t: 'fx', x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, kind: 'arrow', from });
      attackMob(d, p, mob, 1, ctx, out);
      return;
    }
  }
  out.push({ t: 'fx', x: (tx - dir[0]!) * TILE + TILE / 2, y: (ty - dir[1]!) * TILE + TILE / 2, kind: 'arrow', from });
}

const ROCKET_RANGE = 7;
const ROCKET_RELOAD_MS = 1000;
const ROCKET_DAMAGE = 4;

/** Fires a rocket straight ahead: it explodes on the first mob, solid object or wall, or at max range. */
function fireRocket(world: WorldState, p: PlayerState, ctx: SimCtx, out: Change[]): void {
  if (ctx.now < (p.reloadUntil ?? 0)) return;
  if (!removeItem(p.inventory, 'rocket', 1)) {
    out.push(toast(p.id, T.needRockets));
    return;
  }
  p.reloadUntil = ctx.now + ROCKET_RELOAD_MS;
  const dir = p.facing === 'left' ? [-1, 0] : p.facing === 'right' ? [1, 0] : p.facing === 'up' ? [0, -1] : [0, 1];
  let tx = tileOf(p.x);
  let ty = tileOf(p.y);
  const from = { x: p.x, y: p.y };
  for (let i = 0; i < ROCKET_RANGE; i++) {
    const nx = tx + dir[0]!;
    const ny = ty + dir[1]!;
    if (!inBounds(nx, ny)) break;
    tx = nx;
    ty = ny;
    if (animalAt(world, tx, ty)) break;
    const obj = objectAt(world, tx, ty);
    if (obj && objectDef(obj.kind).solid) break;
  }
  out.push({ t: 'fx', x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, kind: 'rocket', from });
  explode(world, p, tx, ty, ctx, out);
  bump(p, 'boom', 1, out);
  out.push(playerChange(p));
}

/** Blast at a tile: hurts every mob within 1.5 tiles; on the farm it also breaks rocks, stumps and weeds. */
function explode(world: WorldState, p: PlayerState, cx: number, cy: number, ctx: SimCtx, out: Change[]): void {
  out.push(fx(cx, cy, 'boom'));
  const r2 = 1.5 * 1.5;
  for (const mob of Object.values(world.animals)) {
    if (!isHostile(mob)) continue;
    const dx = tileOf(mob.x) - cx;
    const dy = tileOf(mob.y) - cy;
    if (dx * dx + dy * dy <= r2) attackMob(world, p, mob, ROCKET_DAMAGE, ctx, out);
  }
  if (world.area === 'dungeon') return;
  for (const obj of Object.values(world.objects)) {
    const def = objectDef(obj.kind);
    if (!def.breakWith || def.breakWith === 'hammer' || obj.kind.startsWith('tree') || obj.kind === 'palm') continue; // only rocks, stumps, weeds and the like
    if (builtByOther(world, p, obj)) continue;
    const dx = obj.x - cx;
    const dy = obj.y - cy;
    if (dx * dx + dy * dy <= r2) breakObject(world, p, obj, ctx, out);
  }
}

function openTreasure(d: WorldState, p: PlayerState, chest: WorldObject, ctx: SimCtx, out: Change[]): void {
  removeObject(d, chest.id);
  out.push({ t: 'object', id: chest.id, obj: null }, fx(chest.x, chest.y, 'sparkle'), fx(chest.x, chest.y, 'coin'));
  const gold = randInt(ctx.rnd, 20, 30);
  const loot: string[] = [];
  giveItems(d, p, 'gold', gold, out);
  loot.push(`${gold} ${itemName('gold').toLowerCase()}`);
  p.stars += 5;
  loot.push('5 ⭐');
  const total = TREASURE.reduce((n, t) => n + t.weight, 0);
  let r = ctx.rnd() * total;
  let picked = TREASURE[0]!;
  for (const t of TREASURE) {
    r -= t.weight;
    if (r <= 0) {
      picked = t;
      break;
    }
  }
  if (ITEMS[picked.item]?.category === 'clothing') {
    if (!p.wardrobe.includes(picked.item)) {
      p.wardrobe.push(picked.item);
      loot.push(itemName(picked.item));
    } else {
      giveItems(d, p, 'gem', 1, out);
      loot.push(itemName('gem'));
    }
  } else {
    giveItems(d, p, picked.item, picked.count, out);
    loot.push(`${picked.count} ${itemName(picked.item)}`);
  }
  if (d.dungeonInfo) d.dungeonInfo.cleared = true;
  out.push(toast(p.id, fmt(T.treasureOpened, { loot: loot.join(' + ') })), toast(null, T.caveCleared), playerChange(p));
}


// ---------------------------------------------------------------------------
// The wider world: discoveries, caves, treasure, fairy rings and the rocket to the moon
// ---------------------------------------------------------------------------

/** First time in a map of a new biome: +1 star and a cheer (returns whether it was new). The count is rebuilt from the maps visited. */
function discoverBiome(farm: WorldState, p: PlayerState, target: WorldState, out: Change[]): boolean {
  const b = target.biome;
  if (!isBiome(b)) return false;
  const seen = new Set<string>();
  for (const k of p.visited ?? []) {
    if (k === 'farm' || isCaveKey(k) || isIndoorKey(k)) continue;
    const bm = farm.areas?.[k]?.biome;
    if (isBiome(bm)) seen.add(bm);
  }
  const before = p.stats?.biomes ?? 0;
  if (seen.size <= before) return false; // nothing new (or counted already)
  if (!p.stats) p.stats = {};
  p.stats.biomes = seen.size - 1;
  bump(p, 'biomes', 1, out);
  p.stars += 1;
  out.push(toast(p.id, fmt(T.newBiome, { emoji: BIOME_EMOJI[b], name: BIOME_NAMES[b], n: seen.size, total: DISCOVERABLE.length })), playerChange(p));
  return true;
}

/** Rolls a loot table and gives it to the player; returns what they got, for the toast. */
export function grantLoot(world: WorldState, p: PlayerState, table: string, ctx: SimCtx, out: Change[]): string[] {
  const lt = LOOT[table];
  if (!lt) return [];
  const got: string[] = [];
  if (lt.coins) {
    const kr = randInt(ctx.rnd, lt.coins[0], lt.coins[1]);
    p.coins += kr;
    bump(p, 'earned', kr, out);
    got.push(`${kr} ${T.coins}`);
  }
  const total = lt.pool.reduce((n, e) => n + e.weight, 0);
  for (let k = 0; k < lt.picks; k++) {
    let r = ctx.rnd() * total;
    let pick = lt.pool[0]!;
    for (const e of lt.pool) {
      r -= e.weight;
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    if (!pick.item) continue;
    const n = randInt(ctx.rnd, pick.min, pick.max);
    const game = ITEMS[pick.item]?.game;
    if (game) {
      got.push(findCartridge(farmOf(world), p, game, out));
      continue;
    }
    if (ITEMS[pick.item]?.category === 'clothing') {
      // clothes go to the wardrobe; one you already have becomes a gem
      if (!p.wardrobe.includes(pick.item)) {
        p.wardrobe.push(pick.item);
        got.push(`${itemName(pick.item)} (${T.inWardrobe})`);
      } else {
        giveItems(world, p, 'gem', 1, out);
        got.push(itemName('gem'));
      }
      continue;
    }
    giveItems(world, p, pick.item, n, out);
    got.push(n > 1 ? `${n} ${itemName(pick.item).toLowerCase()}` : itemName(pick.item));
    if (pick.item === 'fossil') bump(p, 'fossil', n, out);
  }
  if (lt.stars) {
    p.stars += lt.stars;
    got.push(`${lt.stars} ⭐`);
  }
  out.push(playerChange(p));
  return got;
}

/** Opens a loot chest: something for every player once a week. */
function openLootChest(world: WorldState, p: PlayerState, chest: WorldObject, ctx: SimCtx, out: Change[]): void {
  const today = farmOf(world).day;
  const last = chest.openedBy?.[p.id];
  if (last !== undefined && today - last < LOOT_REFILL_DAYS) {
    const left = LOOT_REFILL_DAYS - (today - last);
    out.push(toast(p.id, left <= 1 ? T.lootEmptyTomorrow : fmt(T.lootEmpty, { n: left })));
    return;
  }
  chest.openedBy = { ...chest.openedBy, [p.id]: today };
  const table = chest.loot ?? (world.cave ? `cave_${world.cave.theme}` : 'shipwreck');
  const got = grantLoot(world, p, table, ctx, out);
  bump(p, 'loot', 1, out);
  out.push({ t: 'object', id: chest.id, obj: chest }, fx(chest.x, chest.y, 'sparkle'), fx(chest.x, chest.y, 'coin'), toast(p.id, fmt(T.lootOpened, { loot: got.join(' + ') })));
}

/** Dancing in a fairy ring: the fairies give a little something once a day. */
function danceInRing(world: WorldState, p: PlayerState, ring: WorldObject, ctx: SimCtx, out: Change[]): void {
  const today = farmOf(world).day;
  if (ring.openedBy?.[p.id] === today) {
    out.push(toast(p.id, T.fairyTired));
    return;
  }
  ring.openedBy = { ...ring.openedBy, [p.id]: today };
  p.emote = { id: 'dans', until: ctx.now + EMOTE_MS };
  const got = grantLoot(world, p, 'fairy', ctx, out);
  out.push({ t: 'object', id: ring.id, obj: ring }, fx(ring.x, ring.y, 'sparkle'), fx(ring.x + 1, ring.y + 1, 'sparkle'), fx(ring.x + 1, ring.y, 'heart'), toast(p.id, fmt(T.fairyDance, { loot: got.join(' + ') })));
}

/** Walks into a cave out in the world (built the first time anyone goes in). */
export function enterGrotto(world: WorldState, playerId: string, entrance: WorldObject): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || isUnderground(p.area) || !themeOfEntrance(entrance)) return [];
  const here = areaOf(farm, p);
  if (here.objects[entrance.id] !== entrance) return [];
  const k = caveKey(p.area, entrance.id);
  const cave = getArea(farm, k);
  if (!cave?.cave) return [];
  const out: Change[] = [];
  if (!placeIn(farm, p, k, cave.cave.start.x, cave.cave.start.y, 'up', out)) return [];
  out.push(toast(p.id, fmt(T.enteredGrotto, { name: placeName(cave.biome) })));
  return out;
}

/** Back out of a cave, in front of its entrance. */
export function leaveGrotto(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isCaveKey(p.area)) return [];
  const cave = farm.areas?.[p.area]?.cave;
  const out: Change[] = [];
  if (!cave || !getArea(farm, cave.parent)) {
    placeIn(farm, p, 'farm', SPAWN.x, SPAWN.y, 'down', out);
    return out;
  }
  placeIn(farm, p, cave.parent, cave.out.x, cave.out.y, 'down', out);
  return out;
}

/** The rocket: from the space base to the moon, and from the moon back to the base. */
export function flyRocket(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  const toMoon = !isMoonKey(p.area);
  const dest = toMoon ? MOON_KEY : SPACEPORT_KEY;
  const target = getArea(farm, dest);
  if (!target) return [];
  const rocket = Object.values(target.objects).find((o) => o.kind === 'rocket');
  const front = rocketFront(rocket ?? (toMoon ? MOON_ROCKET : BASE_ROCKET));
  const out: Change[] = [
    { t: 'ride', to: p.id, via: 'rocket', place: toMoon ? BIOME_NAMES.mane : BIOME_NAMES.rymdbas },
    toast(p.id, toMoon ? T.rocketUp : T.rocketHome),
  ];
  let ty = front.y;
  for (let r = 0; r < 4 && isSolidForPlayer(target, front.x, ty); r++) ty++;
  if (!placeIn(farm, p, dest, front.x, ty, 'down', out)) return [];
  if (toMoon) {
    bump(p, 'moon', 1, out);
    if ((p.stats.moon ?? 0) > 1) out.push(toast(p.id, T.onTheMoon));
  }
  return out;
}

/** Morning: dragon eggs that spent the night somewhere hatch into a little dragon for whoever put them down. */
/** A pet or mount from the dungeons comes out of the bag: it follows you from now on. */
function summonFromBag(world: WorldState, p: PlayerState, itemId: string, out: Change[]): void {
  const s = sagaItem(itemId);
  if (!s?.species) return;
  if (isUnderground(world.area) || isIndoorKey(world.area) || isSagaKey(world.area) || (isFarm(world) && inInterior(tileOf(p.x), tileOf(p.y)))) {
    out.push(toast(p.id, T.notNow));
    return;
  }
  if (!removeItem(p.inventory, itemId, 1)) return;
  const a: AnimalState = { ...dummyAnimal, id: world.nextId++, species: s.species, name: s.name, x: p.x, y: p.y + 4, owner: p.id, age: 10, named: true, petted: true, waitMs: 500 };
  if (s.kind === 'mount') a.follow = true;
  world.animals[a.id] = a;
  const tx = tileOf(p.x);
  const ty = tileOf(p.y);
  out.push({ t: 'animal', id: a.id, animal: a }, fx(tx, ty, 'sparkle'), fx(tx, ty + 1, 'heart'), toast(p.id, fmt(T.sagaPetCome, { name: s.name })), playerChange(p));
}

function hatchEggs(farm: WorldState, ctx: SimCtx, out: Change[]): void {
  const maps: [string, WorldState][] = [['farm', farm], ...Object.entries(farm.areas ?? {})];
  for (const [k, m] of maps) {
    for (const egg of Object.values(m.objects)) {
      if (egg.kind !== 'dragon_egg' || !egg.by) continue;
      const owner = farm.players[egg.by];
      if (!owner) continue;
      removeObject(m, egg.id);
      const dragon: AnimalState = {
        ...dummyAnimal,
        id: m.nextId++,
        species: 'dragon',
        name: SPECIES_NAMES.dragon ?? 'Drake',
        x: egg.x * TILE + TILE / 2,
        y: egg.y * TILE + TILE / 2,
        owner: owner.id,
        age: 10,
        waitMs: 1000,
      };
      m.animals[dragon.id] = dragon;
      const local: Change[] = [{ t: 'object', id: egg.id, obj: null }, { t: 'animal', id: dragon.id, animal: dragon }, fx(egg.x, egg.y, 'sparkle'), fx(egg.x, egg.y, 'heart')];
      out.push(...tagArea(local, k));
      bump(owner, 'dragon', 1, out);
      out.push(toast(null, fmt(T.dragonHatched, { name: owner.name })), playerChange(owner));
      if (owner.online) out.push({ t: 'open', to: owner.id, ui: 'nameAnimal', id: dragon.id });
      void ctx;
    }
  }
}

/** Morning out in the world: berries, crystals and buried treasure grow back a little everywhere. */
function regrowAreas(farm: WorldState, ctx: SimCtx, out: Change[]): void {
  for (const [k, a] of Object.entries(farm.areas ?? {})) {
    if (!a.renew) continue;
    const people = Object.values(a.players).map((pl) => [tileOf(pl.x), tileOf(pl.y)] as const);
    const fronts = landmarkFronts(a);
    const start = a.cave?.start;
    const blocked = (x: number, y: number) =>
      inEdgeGap(x, y) ||
      people.some(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1) ||
      fronts.some((f) => Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1) ||
      (!!start && Math.abs(start.x - x) + Math.abs(start.y - y) < 3) ||
      !!npcAt(a, x, y);
    const grown = regrow(a, ctx.rnd, blocked);
    if (grown.length) out.push(...tagArea(grown.map((o) => ({ t: 'object' as const, id: o.id, obj: o })), k));
  }
}

// ---------------------------------------------------------------------------
// Lasso, predators and hearts outside the cave
// ---------------------------------------------------------------------------

const LASSO_RANGE = 3;
const FLEE_MS = 3000;

/** Throws the lasso straight ahead; the first wild animal within range may become a pet. */
function throwLasso(world: WorldState, p: PlayerState, ctx: SimCtx, out: Change[]): void {
  const dir = DIR_VEC[p.facing];
  let tx = tileOf(p.x);
  let ty = tileOf(p.y);
  const from = { x: p.x, y: p.y };
  for (let i = 0; i < LASSO_RANGE; i++) {
    tx += dir.dx;
    ty += dir.dy;
    if (!inBounds(tx, ty)) break;
    const obj = objectAt(world, tx, ty);
    if (obj && objectDef(obj.kind).solid) break;
    const a = animalAt(world, tx, ty);
    if (!a) continue;
    const def = ANIMALS[a.species];
    out.push({ t: 'fx', x: a.x, y: a.y, kind: 'lasso', from });
    if (!def?.wild || a.owner) {
      out.push(toast(p.id, T.lassoNoTarget));
      return;
    }
    if (def.mob) {
      out.push(toast(p.id, T.lassoMonster));
      return;
    }
    const name = animalDisplayName(a);
    if (ctx.rnd() < (def.tame ?? 0.6)) {
      a.owner = p.id;
      a.named = false;
      a.petted = true;
      delete a.fleeUntil;
      delete a.tx;
      delete a.ty;
      a.waitMs = 0;
      const first = !(p.stats?.[`tame_${a.species}`] ?? 0);
      bump(p, 'tame', 1, out);
      bump(p, `tame_${a.species}`, 1, out);
      if (first) bump(p, 'tame_species', 1, out);
      out.push(fx(tx, ty, 'heart'), toast(p.id, fmt(T.tamed, { name })), { t: 'animal', id: a.id, animal: a }, playerChange(p), { t: 'open', to: p.id, ui: 'nameAnimal', id: a.id });
    } else {
      a.fleeUntil = ctx.now + FLEE_MS;
      a.fleeX = p.x;
      a.fleeY = p.y;
      delete a.tx;
      delete a.ty;
      a.waitMs = 0;
      out.push(fx(tx, ty, 'poof'), toast(p.id, fmt(T.tameMissed, { name })), { t: 'animal', id: a.id, animal: a });
    }
    return;
  }
  out.push({ t: 'fx', x: (tx - dir.dx) * TILE + TILE / 2, y: (ty - dir.dy) * TILE + TILE / 2, kind: 'lasso', from }, toast(p.id, T.lassoNoTarget));
}

/** Knocked out outdoors: wake up at home with full hearts (inventory kept). */
function faintHome(world: WorldState, p: PlayerState, out: Change[]): void {
  const farm = farmOf(world);
  placeIn(farm, p, 'farm', SPAWN.x, SPAWN.y, 'down', out);
  p.hearts = MAX_HEARTS;
  delete p.hurtUntil;
  delete p.healAt;
  out.push(playerChange(p), toast(p.id, T.fainted));
}

/** One bite or hit on a player; returns true when they went down. */
function hurtPlayer(world: WorldState, target: PlayerState, ctx: SimCtx, out: Change[]): boolean {
  const held = heldItem(target);
  if (held && item(held.item).tool === 'shield') {
    out.push(fx(tileOf(target.x), tileOf(target.y), 'hit'), toast(target.id, T.blocked));
    return false;
  }
  if (ctx.now < (target.hurtUntil ?? 0)) return false;
  target.hearts -= 1;
  target.hurtUntil = ctx.now + 900;
  if (target.healAt === undefined) target.healAt = ctx.now + HEAL_MS;
  out.push(fx(tileOf(target.x), tileOf(target.y), 'hit'));
  if (target.hearts <= 0) {
    if (world.area === 'dungeon') out.push(...leaveCave(world, target.id, true));
    else faintHome(world, target, out);
    return true;
  }
  out.push(playerChange(target));
  return false;
}

// ---------------------------------------------------------------------------
// Sleeping: crawl into a bed; the night passes as soon as everyone online sleeps.
// ---------------------------------------------------------------------------
const SLEEP_FADE_MS = 2500;
const onlinePlayers = (world: WorldState): PlayerState[] => Object.values(farmOf(world).players).filter((p) => p.online);

function goToSleep(world: WorldState, p: PlayerState, out: Change[]): void {
  p.sleeping = true;
  p.moving = false;
  out.push(playerChange(p), toast(p.id, T.goodNight));
  const awake = onlinePlayers(world).filter((o) => o.id !== p.id && !o.sleeping);
  if (awake.length) out.push(toast(p.id, fmt(T.sleepWaiting, { names: awake.map((o) => o.name).join(', ') })));
}

function wakeUp(p: PlayerState, out: Change[], tell: boolean): void {
  if (!p.sleeping) return;
  delete p.sleeping;
  out.push(playerChange(p));
  if (tell) out.push(toast(p.id, T.wokeUp));
}

/** Every online player asleep → it is morning. Offline sleepers wake up too, so nobody is stuck in bed. */
function tickSleep(world: WorldState, ctx: SimCtx, out: Change[]): void {
  const online = onlinePlayers(world);
  if (!online.length || !online.every((p) => p.sleeping)) {
    for (const p of Object.values(world.players)) if (!p.online && p.sleeping) wakeUp(p, out, false);
    delete world.nightAt;
    return;
  }
  // a short night so everyone sees the lights go out before the new day
  if (world.nightAt === undefined) world.nightAt = ctx.now + SLEEP_FADE_MS;
  if (ctx.now < world.nightAt) return;
  delete world.nightAt;
  newDay(world, ctx, out);
  world.timeMs = 1000;
  for (const p of Object.values(world.players)) wakeUp(p, out, false);
  out.push(toast(null, T.goodMorning));
}

/** Hearts grow back one per game hour outside the cave. */
const HEAL_MS = DAY_LENGTH_MS / 24;
function tickHearts(world: WorldState, ctx: SimCtx, out: Change[]): void {
  for (const p of Object.values(world.players)) {
    if (!p.online || p.area === 'dungeon' || p.hearts >= MAX_HEARTS) {
      if (p.hearts >= MAX_HEARTS && p.healAt !== undefined) delete p.healAt;
      continue;
    }
    if (p.healAt === undefined) p.healAt = ctx.now + HEAL_MS;
    if (ctx.now < p.healAt) continue;
    p.hearts = Math.min(MAX_HEARTS, p.hearts + 1);
    if (p.hearts >= MAX_HEARTS) delete p.healAt;
    else p.healAt = ctx.now + HEAL_MS;
    out.push(playerChange(p), fx(tileOf(p.x), tileOf(p.y), 'heart'));
  }
}

/** Scared animals run away from where the lasso came from. */
function tickFlee(world: WorldState, a: AnimalState, dtMs: number, ctx: SimCtx): boolean {
  if (a.fleeUntil === undefined || ctx.now >= a.fleeUntil) {
    if (a.fleeUntil !== undefined) {
      delete a.fleeUntil;
      delete a.fleeX;
      delete a.fleeY;
    }
    return false;
  }
  const dx = a.x - (a.fleeX ?? a.x);
  const dy = a.y - (a.fleeY ?? a.y);
  const dist = Math.hypot(dx, dy) || 1;
  const speed = (ANIMALS[a.species]?.speed ?? 20) * 1.5;
  const step = (speed * dtMs) / 1000;
  const r = resolveMove((tx, ty) => isSolidForAnimal(world, tx, ty), a.x, a.y, a.x + (dx / dist) * step, a.y + (dy / dist) * step, ANIMAL_HALF_W, ANIMAL_HALF_H);
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  return true;
}

const MOB_SIGHT = 7 * TILE;
/** Loke's roaming servants notice you this close (they are meant to be found, not to ambush). */
const ROAM_SIGHT = 4.5 * TILE;
/** A taunted monster keeps after its hero this far. */
const HUNT_RANGE = 14 * TILE;
/** The longest pause between two bites; a later attackAt means the monster is dazed. */
export const ATTACK_GAP = 1500;

/** True when no wall or rock lies on the straight tile line between two points. */
export function lineOfSight(d: WorldState, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = tileOf(x0 + (x1 - x0) * t);
    const ty = tileOf(y0 + (y1 - y0) * t);
    if (!inBounds(tx, ty) || d.terrain[tileIndex(tx, ty)] === 'water') return false;
    const o = objectAt(d, tx, ty);
    if (o && objectDef(o.kind).solid) return false;
  }
  return true;
}

/** Monsters (cave) and wild predators (outdoors) chase and bite players; everything else wanders. */
function tickMob(d: WorldState, a: AnimalState, dtMs: number, ctx: SimCtx, out: Change[]): boolean {
  const def = ANIMALS[a.species];
  const predator = def?.predator;
  // predators and Loke's roaming servants notice you closer than cave monsters do, and keep chasing a bit further
  // (a roaming monster may have its own, shorter reach: the meadow's Ängsvätte next to the farm)
  const roaming = !!def?.mob && !!def.wild;
  const sight = predator ? predator.aggroRange * TILE : roaming ? (def.mob!.aggro !== undefined ? def.mob!.aggro * TILE : ROAM_SIGHT) : MOB_SIGHT;
  const keep = predator || roaming ? (a.moving ? sight * 1.5 : sight) : MOB_SIGHT;
  const areaKeyStr = d.area ?? 'farm';
  let target: PlayerState | null = null;
  let best = keep;
  // taunted by a hero (Utmana! out in the world): it goes for them while it lasts
  const hunter = a.hunt && ctx.now < (a.huntUntil ?? 0) ? d.players[a.hunt] : undefined;
  if (hunter && hunter.online && hunter.area === areaKeyStr && Math.hypot(hunter.x - a.x, hunter.y - a.y) < HUNT_RANGE) {
    target = hunter;
    best = Math.hypot(hunter.x - a.x, hunter.y - a.y);
  } else {
    if (a.hunt) {
      delete a.hunt;
      delete a.huntUntil;
    }
    for (const p of Object.values(d.players)) {
      if (!p.online || p.area !== areaKeyStr) continue;
      const dist = Math.hypot(p.x - a.x, p.y - a.y);
      if (dist < best) {
        best = dist;
        target = p;
      }
    }
  }
  if (!target || (!hunter && !lineOfSight(d, a.x, a.y, target.x, target.y))) return false;
  // dazed by a hero's shield bash: it stands still a moment
  if (ctx.now < (a.attackAt ?? 0) - ATTACK_GAP) {
    a.moving = false;
    return true;
  }
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  if (best <= 1.4 * TILE) {
    a.moving = false;
    if (ctx.now >= (a.attackAt ?? 0)) {
      a.attackAt = ctx.now + (predator ? 1500 : 1300);
      hurtPlayer(d, target, ctx, out);
    }
    return true;
  }
  const speed = ANIMALS[a.species]?.speed ?? 20;
  const step = (speed * dtMs) / 1000;
  const nx = a.x + (dx / best) * step;
  const ny = a.y + (dy / best) * step;
  const r = resolveMove((tx, ty) => isSolidForAnimal(d, tx, ty), a.x, a.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H);
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  return true;
}

/** Marks changes as belonging to a map so clients apply them to the right one. */
export function tagArea(changes: Change[], keyStr: string): Change[] {
  if (keyStr === 'farm') return changes;
  for (const c of changes) {
    if (c.t === 'terrain' || c.t === 'crop' || c.t === 'object' || c.t === 'animal' || c.t === 'drop' || c.t === 'fx') c.area = keyStr;
  }
  return changes;
}
export const tagDungeon = (changes: Change[]): Change[] => tagArea(changes, 'dungeon');

const areaOccupied = (a: WorldState): boolean => Object.values(a.players).some((p) => p.online);

function tickOtherAreas(world: WorldState, dtMs: number, ctx: SimCtx, out: Change[]): void {
  const d = world.dungeon;
  if (d) {
    if (!dungeonOccupied(d)) {
      if (d.dungeonInfo?.cleared) delete world.dungeon;
    } else {
      const local: Change[] = [];
      tickAnimals(d, dtMs, ctx, local);
      tickDrops(d, local);
      out.push(...tagArea(local, 'dungeon'));
    }
  }
  for (const [k, a] of Object.entries(world.areas ?? {})) {
    if (!areaOccupied(a)) {
      // an empty dungeon starts over after a while
      if (a.saga && idleSaga(world, k, a, ctx.now)) delete world.areas![k];
      continue;
    }
    const local: Change[] = [];
    if (a.saga) tickSaga(a, k, dtMs, ctx, out);
    tickAnimals(a, dtMs, ctx, local);
    tickNpcs(a, dtMs);
    tickDrops(a, local);
    if (isBathKey(k)) tickBath(a, local, out);
    else if (isHallKey(k)) tickHall(a, out);
    out.push(...tagArea(local, k));
  }
}

// ---------------------------------------------------------------------------
// Badhuset
// ---------------------------------------------------------------------------

/** Walks into the bath house from the village square. */
export function enterBath(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.area === 'dungeon' || p.area === 'farm' || isIndoorKey(p.area)) return [];
  const out: Change[] = [];
  if (!placeIn(farm, p, bathKey(p.area), BATH_EXIT.x, BATH_EXIT.y - 1, 'up', out)) return [];
  out.push(toast(p.id, T.enteredBath));
  return out;
}

/** Back out through the door to the village. */
export function leaveBath(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isBathKey(p.area)) return [];
  const villageKey = villageOfBath(p.area);
  const village = getArea(farm, villageKey);
  if (!village) return [];
  const door = bathhouseDoorTile(village);
  const out: Change[] = [];
  delete p.swimming;
  placeIn(farm, p, villageKey, door.x, door.y, 'down', out);
  return out;
}

/** Splashes when someone jumps in, counts swims, and lets players walk out through the door. */
function tickBath(bath: WorldState, local: Change[], out: Change[]): void {
  for (const p of Object.values(bath.players)) {
    if (!p.online) continue;
    if (p.moveLock) continue;
    const tx = tileOf(p.x);
    const ty = tileOf(p.y);
    if (tx === BATH_EXIT.x && ty === BATH_EXIT.y) {
      out.push(...leaveBath(bath, p.id));
      continue;
    }
    const swimming = inPool(bath, p);
    if (swimming && !p.swimming) {
      p.swimming = true;
      local.push(fx(tx, ty, 'splash'));
      bump(p, 'swim', 1, out);
      out.push(playerChange(p));
    } else if (!swimming && p.swimming) {
      delete p.swimming;
      out.push(playerChange(p));
    }
  }
  void BATH_POOL;
}

// ---------------------------------------------------------------------------
// Minigames: the TV at home and Spelhallen in the city
// ---------------------------------------------------------------------------

function arcadeOf(p: PlayerState): ArcadeState {
  if (!p.arcade) p.arcade = { best: {}, tickets: 0, games: [], day: 0, won: 0 };
  return p.arcade;
}

/** Walks into Spelhallen from the street. */
export function enterHall(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.area === 'dungeon' || p.area === 'farm' || isIndoorKey(p.area)) return [];
  const out: Change[] = [];
  if (!placeIn(farm, p, hallKey(p.area), INDOOR_EXIT.x, INDOOR_EXIT.y - 1, 'up', out)) return [];
  out.push(toast(p.id, T.enteredHall));
  return out;
}

/** Back out through the door to the city. */
export function leaveHall(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isHallKey(p.area)) return [];
  const villageKey = villageOfHall(p.area);
  const village = getArea(farm, villageKey);
  if (!village) return [];
  const door = hallDoorTile(village);
  const out: Change[] = [];
  placeIn(farm, p, villageKey, door.x, door.y, 'down', out);
  return out;
}

/** Players walk out through the door. */
function tickHall(hall: WorldState, out: Change[]): void {
  for (const p of Object.values(hall.players)) {
    if (!p.online || p.moveLock) continue;
    if (tileOf(p.x) === INDOOR_EXIT.x && tileOf(p.y) === INDOOR_EXIT.y) out.push(...leaveHall(hall, p.id));
  }
}

/** The TV or a machine is turned on: the client opens the arcade (a machine plays its own game). */
function openArcade(p: PlayerState, obj: WorldObject, ctx: SimCtx, out: Change[]): void {
  const a = arcadeOf(p);
  a.open = obj.kind === 'arcade_machine' ? { where: 'hall', game: ARCADE_GAMES[obj.variant ?? 0] ?? ARCADE_GAMES[0], at: ctx.now } : { where: 'tv', at: ctx.now };
  out.push({ t: 'open', to: p.id, ui: 'arcade', id: obj.id });
}

/** A game cartridge was found: a new game on the family's TV, or tickets when the family has it already. Returns what to tell. */
function findCartridge(farm: WorldState, p: PlayerState, game: string, out: Change[]): string {
  const a = arcadeOf(p);
  if (!isArcadeGame(game) || familyGames(farm).includes(game)) {
    a.tickets += SPARE_CART_TICKETS;
    return `🎟️ ${fmt(T.spareCart, { n: SPARE_CART_TICKETS })}`;
  }
  a.games.push(game);
  bump(p, 'carts', 1, out);
  return `📺 ${ARCADE[game].name} (${T.newTvGame})`;
}

/** A minigame run ended: keep the best score, and in Spelhallen win tickets (up to a daily limit). */
export function arcadeScore(world: WorldState, playerId: string, game: string, raw: number, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isArcadeGame(game)) return [];
  const a = arcadeOf(p);
  const open = a.open;
  if (!open || ctx.now - open.at < MIN_GAME_MS) return [];
  if (open.where === 'hall' ? open.game !== game || !isHallKey(p.area) : !familyGames(farm).includes(game)) return [];
  const score = Math.max(0, Math.min(ARCADE_MAX_SCORE, Math.round(Number(raw) || 0)));
  const out: Change[] = [];
  const record = familyBest(farm, game);
  if (score > (a.best[game] ?? 0)) a.best[game] = score;
  // one run takes a while: quick repeats only keep the score
  if (open.where === 'hall' && (open.last === undefined || ctx.now - open.last >= MIN_GAME_MS)) {
    if (a.day !== farm.day) {
      a.day = farm.day;
      a.won = 0;
    }
    const n = Math.min(ticketsFor(score), Math.max(0, MAX_TICKETS_PER_DAY - a.won));
    a.tickets += n;
    a.won += n;
    if (n > 0) bump(p, 'tickets', n, out);
  }
  open.last = ctx.now;
  bump(p, 'arcade', 1, out);
  // beating someone else's family record is news for everyone
  if (record.id && record.id !== p.id && score > record.score) out.push(toast(null, fmt(T.arcadeRecord, { name: p.name, game: ARCADE[game].name, score: score.toLocaleString('sv-SE') })));
  out.push(playerChange(p));
  return out;
}

/** Swaps tickets for a prize at the prize counter. */
export function buyPrize(world: WorldState, playerId: string, itemId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isHallKey(p.area)) return [];
  const prize = PRIZES.find((x) => x.item === itemId);
  if (!prize) return [];
  const a = arcadeOf(p);
  const out: Change[] = [];
  const cart = ITEMS[itemId]?.game;
  const game = isArcadeGame(cart) ? cart : null;
  if (cart && (!game || familyGames(farm).includes(game))) {
    out.push(toast(p.id, T.familyHasGame));
    return out;
  }
  if (a.tickets < prize.tickets) {
    out.push(toast(p.id, T.notEnoughTickets));
    return out;
  }
  if (game) a.games.push(game);
  else giveItems(areaOf(farm, p), p, itemId, 1, out);
  a.tickets -= prize.tickets;
  bump(p, 'prizes', 1, out);
  out.push(toast(p.id, fmt(T.prizeBought, { item: game ? `${ARCADE[game].name} (${T.newTvGame})` : itemName(itemId) })), playerChange(p));
  return out;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export const anyoneOnline = (world: WorldState): boolean => Object.values(world.players).some((p) => p.online);

export function tick(world: WorldState, dtMs: number, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  if (!anyoneOnline(world)) return out;
  world.timeMs += dtMs;
  if (world.questsDay !== world.day || world.quests.length === 0) {
    generateQuests(world);
    out.push({ t: 'quests', quests: world.quests });
  }
  tickAnimals(world, dtMs, ctx, out);
  tickNpcs(world, dtMs);
  tickDrops(world, out);
  tickBoosts(world, ctx.now, out);
  tickFishing(world, ctx, out);
  tickHearts(world, ctx, out);
  tickSleep(world, ctx, out);
  tickWeather(world, ctx, out);
  tickOtherAreas(world, dtMs, ctx, out);
  for (const p of Object.values(world.players)) {
    if (p.emote && p.emote.until < ctx.now) delete p.emote;
    if (p.moveLock && --p.moveLock <= 0) delete p.moveLock;
  }
  if (world.timeMs >= DAY_LENGTH_MS) {
    world.timeMs -= DAY_LENGTH_MS;
    newDay(world, ctx, out);
  }
  return out;
}

const homeCenter = (world: WorldState, a: AnimalState): { x: number; y: number } => {
  const home = world.objects[a.homeId];
  if (!home) return { x: a.x, y: a.y };
  const def = objectDef(home.kind);
  return { x: (home.x + def.w / 2) * TILE, y: (home.y + def.h + 1) * TILE };
};

const LEASH = 7 * TILE;

const PET_FOLLOW = 26;
const PET_TELEPORT = 7 * TILE;
/** A called horse trots after its owner (its wandering speed is a slow walk). */
const HORSE_FOLLOW_SPEED = 60;
/** How far a staying animal potters around the spot it was told to stay on. */
const STAY_LEASH = 1.5 * TILE;

function tickPet(world: WorldState, a: AnimalState, dtMs: number): boolean {
  const owner = a.owner ? world.players[a.owner] : undefined;
  if (!owner || !owner.online || owner.area !== (world.area ?? 'farm')) return false;
  const horse = isMount(a);
  // a horse waits outside while you are indoors
  if (horse && isFarm(world) && inInterior(tileOf(owner.x), tileOf(owner.y))) return false;
  const dx = owner.x - a.x;
  const dy = owner.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist > PET_TELEPORT) {
    // Lost (fence, house door…): pop up at the owner's feet (never inside a tree or wall)
    a.x = owner.x;
    a.y = owner.y + 3;
    a.moving = false;
    return true;
  }
  if (dist <= PET_FOLLOW) {
    a.moving = false;
    delete a.tx;
    delete a.ty;
    return true;
  }
  const speed = horse ? HORSE_FOLLOW_SPEED : (ANIMALS[a.species]?.speed ?? 60);
  const step = Math.min(dist - PET_FOLLOW + 1, (speed * dtMs) / 1000);
  const nx = a.x + (dx / dist) * step;
  const ny = a.y + (dy / dist) * step;
  const r = resolveMove((tx, ty) => isSolidForPlayer(world, tx, ty), a.x, a.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H);
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  return true;
}

function tickAnimals(world: WorldState, dtMs: number, ctx: SimCtx, out: Change[]): void {
  if (world.area !== 'dungeon' && !isIndoorKey(world.area)) tickRiding(world, out);
  const walkers = world.biome === 'by' ? npcsIn(world).map((n) => npcState(world, n.id)) : [];
  for (const a of Object.values(world.animals)) {
    if ((isMount(a) || isVehicle(a)) && riderOf(world, a)) continue;
    if (world.saga?.mobs[a.id]) continue; // dungeon monsters fight by their own rules (tickSaga)
    if (isVehicle(a)) {
      // city traffic follows its route; a player's own vehicle stays parked
      if (a.route !== undefined) {
        if (driveVehicle(world, a, dtMs, ctx.now, walkers).honk) out.push(fx(tileOf(a.x), tileOf(a.y), 'honk'));
      } else a.moving = false;
      continue;
    }
    if (!a.stay && (isPetAnimal(a) || (isMount(a) && a.follow)) && tickPet(world, a, dtMs)) continue;
    if (tickFlee(world, a, dtMs, ctx)) continue;
    if (isHostile(a) && tickMob(world, a, dtMs, ctx, out)) continue;
    if (a.waitMs > 0) {
      a.waitMs -= dtMs;
      a.moving = false;
      continue;
    }
    if (a.tx === undefined || a.ty === undefined) {
      const c = a.stay ?? homeCenter(world, a);
      const ang = ctx.rnd() * Math.PI * 2;
      const r = ctx.rnd() * (a.stay ? STAY_LEASH : LEASH);
      a.tx = Math.min(MAP_W * TILE - 8, Math.max(8, c.x + Math.cos(ang) * r));
      a.ty = Math.min(MAP_H * TILE - 8, Math.max(8, c.y + Math.sin(ang) * r));
    }
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const dist = Math.hypot(dx, dy);
    const speed = ANIMALS[a.species]?.speed ?? 16;
    const step = (speed * dtMs) / 1000;
    if (dist <= step) {
      a.moving = false;
      delete a.tx;
      delete a.ty;
      a.waitMs = 1000 + ctx.rnd() * 4000;
      continue;
    }
    const nx = a.x + (dx / dist) * step;
    const ny = a.y + (dy / dist) * step;
    const r = resolveMove((tx, ty) => isSolidForAnimal(world, tx, ty), a.x, a.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H);
    const moved = Math.hypot(r.x - a.x, r.y - a.y);
    if (moved < step * 0.5) {
      // Blocked (fence, water, another building): give up and rest a bit
      a.moving = false;
      delete a.tx;
      delete a.ty;
      a.waitMs = 500 + ctx.rnd() * 2000;
      continue;
    }
    a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    a.x = r.x;
    a.y = r.y;
    a.moving = true;
  }
}

/** Speed multiplier while pizzapower lasts (client prediction uses the same number). */
export const BOOST_SPEED_MUL = 1.3;

/** Eats the held food: full hearts and a speed boost. */
function eat(world: WorldState, p: PlayerState, held: ItemStack, ctx: SimCtx): Change[] {
  const d = item(held.item);
  if (!d.food) return [];
  const out: Change[] = [];
  takeFromSlot(p.inventory, p.selected, 1);
  p.hearts = MAX_HEARTS;
  p.boostUntil = Math.max(p.boostUntil ?? 0, ctx.now) + d.food.boostMs;
  if (held.item.startsWith('pizza')) bump(p, 'pizza', 1, out);
  out.push(fx(tileOf(p.x), tileOf(p.y), 'heart'), toast(p.id, fmt(T.ate, { item: itemName(held.item) })), toast(p.id, T.pizzaPower), playerChange(p));
  void world;
  return out;
}

function tickBoosts(world: WorldState, now: number, out: Change[]): void {
  for (const p of Object.values(world.players)) {
    if (p.boostUntil !== undefined && now >= p.boostUntil) {
      delete p.boostUntil;
      out.push(playerChange(p));
    }
  }
}

function tickDrops(world: WorldState, out: Change[]): void {
  for (const d of Object.values(world.drops)) {
    if (d.ignore && --d.ignore.ticks <= 0) delete d.ignore;
    for (const p of Object.values(world.players)) {
      if (!p.online) continue;
      if (d.ignore?.player === p.id) continue;
      if (Math.hypot(p.x - d.x, p.y - d.y) > PICKUP_RADIUS) continue;
      if (d.item === 'heartberry' && world.area === 'dungeon' && p.hearts < MAX_HEARTS) {
        p.hearts = Math.min(MAX_HEARTS, p.hearts + d.count);
        delete world.drops[d.id];
        out.push({ t: 'drop', id: d.id, drop: null }, playerChange(p), toast(p.id, T.heartsFull), fx(tileOf(p.x), tileOf(p.y), 'heart'));
        break;
      }
      if (d.data !== undefined) {
        const free = p.inventory.indexOf(null);
        if (free < 0) continue;
        p.inventory[free] = { item: d.item, count: 1, data: d.data };
        delete world.drops[d.id];
        out.push({ t: 'drop', id: d.id, drop: null }, playerChange(p));
        break;
      }
      const left = addItem(p.inventory, d.item, d.count);
      if (left === d.count) continue;
      out.push(playerChange(p));
      if (left === 0) {
        delete world.drops[d.id];
        out.push({ t: 'drop', id: d.id, drop: null });
      } else {
        d.count = left;
        out.push({ t: 'drop', id: d.id, drop: d });
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Day rollover
// ---------------------------------------------------------------------------

/** Wild resources that regrow over time, never beyond how many the fresh map had. */
const REGROW: { kind: string; perDay: number; where: (x: number, y: number) => boolean; variant?: number }[] = [
  { kind: 'tree', perDay: 4, where: (x, y) => edgeDist(x, y) <= 3 || x >= 48 || y >= 50 },
  { kind: 'tree_pine', perDay: 2, where: (x, y) => edgeDist(x, y) <= 3 || x >= 48 || y >= 50 },
  { kind: 'tree_apple', perDay: 1, where: (x, y) => edgeDist(x, y) <= 3 || x >= 48 || y >= 50 },
  { kind: 'rock', perDay: 2, where: (x, y) => x >= 46 && x <= 60 && y >= 6 && y <= 34 },
  { kind: 'rock_small', perDay: 3, where: (x, y) => x >= 46 && x <= 60 && y >= 6 && y <= 34 },
  { kind: 'grass_tuft', perDay: 12, where: () => true, variant: 3 },
  { kind: 'flower', perDay: 4, where: () => true, variant: 4 },
  { kind: 'bush', perDay: 1, where: (x, y) => !(x >= 4 && x <= 40 && y >= 4 && y <= 46) },
];
let baselineCounts: Record<string, number> | null = null;
const baseline = (kind: string): number => {
  if (!baselineCounts) {
    baselineCounts = {};
    for (const o of Object.values(generateWorld().objects)) baselineCounts[o.kind] = (baselineCounts[o.kind] ?? 0) + 1;
  }
  return baselineCounts[kind] ?? 0;
};
const edgeDist = (x: number, y: number): number => Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
const nearHouse = (x: number, y: number): boolean => x >= 5 && x <= 18 && y >= 3 && y <= 14;

const freeGrass = (world: WorldState, x: number, y: number): boolean =>
  inBounds(x, y) &&
  !inInterior(x, y) &&
  !npcAt(world, x, y) &&
  world.terrain[tileIndex(x, y)] === 'grass' &&
  !objectAt(world, x, y) &&
  !world.crops[key(x, y)] &&
  !nearHouse(x, y) &&
  !footprintOccupied(world, x, y, 1, 1);

function spawnWild(world: WorldState, kind: string, count: number, cap: number, where: (x: number, y: number) => boolean, ctx: SimCtx, out: Change[], variants = 0): void {
  let have = 0;
  for (const o of Object.values(world.objects)) if (o.kind === kind) have++;
  let tries = count * 80;
  while (count > 0 && have < cap && tries-- > 0) {
    const x = randInt(ctx.rnd, 2, MAP_W - 3);
    const y = randInt(ctx.rnd, 2, MAP_H - 3);
    if (!where(x, y) || !freeGrass(world, x, y)) continue;
    const obj = addObject(world, kind, x, y, variants ? { variant: randInt(ctx.rnd, 0, variants - 1) } : {});
    if (!obj) continue;
    out.push({ t: 'object', id: obj.id, obj });
    have++;
    count--;
  }
}

export function newDay(world: WorldState, ctx: SimCtx, out: Change[] = []): Change[] {
  world.day++;
  world.timeMs = Math.min(world.timeMs, 1000);
  out.push({ t: 'day', day: world.day });
  // Fixed quests keep their done-state; daily ones are fresh
  for (const p of Object.values(world.players)) p.questsDone = p.questsDone.filter((id) => !id.startsWith('d'));
  generateQuests(world);
  out.push({ t: 'quests', quests: world.quests }, toast(null, T.questNew));

  // Crops grow if watered
  for (const [k, c] of Object.entries(world.crops)) {
    const def = CROPS[c.crop];
    if (!def) continue;
    if (c.watered && !cropMature(c)) {
      c.progress++;
      if (c.progress >= (def.stages[c.stage] ?? 1)) {
        c.stage++;
        c.progress = 0;
      }
    }
    c.watered = false;
    out.push({ t: 'crop', k, crop: c });
  }
  // Wet soil dries
  for (let i = 0; i < world.terrain.length; i++)
    if (world.terrain[i] === 'soil_wet') {
      world.terrain[i] = 'soil';
      out.push({ t: 'terrain', x: i % MAP_W, y: Math.floor(i / MAP_W), terrain: 'soil' });
    }

  // Troughs feed nearby animals
  const troughs = Object.values(world.objects).filter((o) => o.kind === 'trough' && (o.items?.[0]?.count ?? 0) > 0);
  for (const a of Object.values(world.animals)) {
    if (a.fed) continue;
    const t = troughs.find((o) => (o.items![0]?.count ?? 0) > 0 && Math.hypot((o.x + 0.5) * TILE - a.x, (o.y + 0.5) * TILE - a.y) <= 8 * TILE);
    if (t) {
      t.items![0]!.count--;
      if (t.items![0]!.count === 0) t.items![0] = null;
      a.fed = true;
      out.push({ t: 'object', id: t.id, obj: t });
    }
  }

  // Animals: hearts, products, growing up
  for (const a of Object.values(world.animals)) {
    const def = ANIMALS[a.species];
    if (!def) continue;
    let gain = 0;
    if (a.fed) gain += 0.34;
    if (a.petted) gain += 0.2;
    if (a.brushed) gain += 0.2;
    a.heartProgress += gain;
    while (a.heartProgress >= 1 && a.hearts < 5) {
      a.hearts++;
      a.heartProgress -= 1;
    }
    if (a.hearts >= 5) a.heartProgress = Math.min(a.heartProgress, 0.99);
    a.age++;
    if (def.product && a.fed && a.hearts >= 1 && a.age >= def.growDays) a.hasProduct = true;
    a.fed = false;
    a.petted = false;
    a.brushed = false;
    out.push({ t: 'animal', id: a.id, animal: a });
  }

  // Wild animals out in the world are happy to be petted again tomorrow, and the ones that ran off come back
  for (const [k, a] of Object.entries(world.areas ?? {})) {
    for (const an of Object.values(a.animals)) an.petted = false;
    if (a.biome) {
      const local: Change[] = [];
      for (const an of spawnWildAnimals(a, a.biome, ctx.rnd, true)) local.push({ t: 'animal', id: an.id, animal: an });
      out.push(...tagArea(local, k));
    }
  }
  regrowAreas(world, ctx, out);
  hatchEggs(world, ctx, out);
  healCars(world, out);

  // Ordered animals arrive
  for (const p of Object.values(world.players)) {
    if (p.orders.length === 0) continue;
    for (const o of p.orders) {
      const home = world.objects[o.homeId];
      const def = ANIMALS[o.species];
      if (!def) continue;
      const c = home ? homeCenter(world, { ...dummyAnimal, homeId: home.id }) : { x: p.x, y: p.y };
      const a: AnimalState = {
        ...dummyAnimal,
        id: world.nextId++,
        species: o.species,
        name: DEFAULT_ANIMAL_NAMES[randInt(ctx.rnd, 0, DEFAULT_ANIMAL_NAMES.length - 1)] ?? 'Ny vän',
        x: c.x,
        y: c.y,
        homeId: home?.id ?? 0,
        waitMs: 2000,
      };
      if (def.pet) {
        a.owner = p.id;
        a.age = 10;
      }
      if (o.species === 'horse') a.owner = p.id;
      world.animals[a.id] = a;
      out.push({ t: 'animal', id: a.id, animal: a }, toast(null, fmt(def.pet ? T.petArrived : T.animalArrived, { name: `${animalDisplayName(a)} (${SPECIES_NAMES[o.species] ?? o.species})` })));
    }
    p.orders = [];
    out.push(playerChange(p));
  }

  // Resources regrow
  for (const r of REGROW) spawnWild(world, r.kind, r.perDay, baseline(r.kind), r.where, ctx, out, r.variant ?? 0);

  // Season twists
  if (ctx.season === 'halloween') spawnWild(world, 'wild_pumpkin', 3, 12, (x, y) => !(x >= 4 && x <= 40 && y >= 4 && y <= 46) || edgeDist(x, y) <= 6, ctx, out);
  if (ctx.season === 'midsommar') spawnWild(world, 'wild_flower_mid', 20, 80, () => true, ctx, out, 3);
  for (const o of Object.values(world.objects)) {
    if ((o.kind === 'wild_pumpkin' && ctx.season !== 'halloween') || (o.kind === 'wild_flower_mid' && ctx.season !== 'midsommar')) {
      removeObject(world, o.id);
      out.push({ t: 'object', id: o.id, obj: null });
    }
  }

  out.push(toast(null, `${fmt(T.day, { day: world.day })} – ${T.newDay}`));
  return out;
}

const dummyAnimal: AnimalState = {
  id: 0,
  species: 'hen',
  name: '',
  x: 0,
  y: 0,
  facing: 'down',
  moving: false,
  hearts: 0,
  heartProgress: 0,
  fed: false,
  petted: false,
  brushed: false,
  hasProduct: false,
  named: false,
  age: 0,
  homeId: 0,
  waitMs: 0,
};

/** Convenience for tests and the admin page: add a grown animal next to a house. */
export function addAnimal(world: WorldState, species: string, homeId: number, name?: string): AnimalState {
  const a: AnimalState = { ...dummyAnimal, id: world.nextId++, species, homeId, name: name ?? '', named: !!name, age: 10 };
  const c = homeCenter(world, a);
  a.x = c.x;
  a.y = c.y;
  world.animals[a.id] = a;
  return a;
}

export const isBaby = (a: AnimalState): boolean => a.age < (ANIMALS[a.species]?.growDays ?? 3);

/** 0 = midday … 1 = deepest night, for the client's night overlay. */
export function nightAmount(timeMs: number): number {
  const f = timeMs / DAY_LENGTH_MS;
  if (f < 0.65) return 0;
  if (f < 0.8) return ((f - 0.65) / 0.15) * 0.8;
  return 0.8;
}

export const describeTile = (world: WorldState, tx: number, ty: number): string => {
  const a = animalAt(world, tx, ty);
  if (a) return animalDisplayName(a);
  const o = objectAt(world, tx, ty);
  if (o) return objectName(o.kind);
  const c = world.crops[key(tx, ty)];
  if (c) return itemName(c.crop);
  return '';
};
