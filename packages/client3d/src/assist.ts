// Forgiving tool use: how worthwhile it is to use the held item on a tile, mirroring the server's
// performAction rules, so aim assist only snaps to things that will actually react.
import { CROPS, ITEMS, WALL_KINDS, WALL_TERRAIN, isFishWater, key, objectDef, tileIndex, type CropState, type PlayerState, type WorldState } from '@lilla-garden/shared';

export interface Use {
  /** 0 = nothing happens; higher = more clearly what the player means. */
  score: number;
  /** Safe to repeat while the button is held (breaking, hoeing, watering, planting, placing). */
  repeat: boolean;
}

const NONE: Use = { score: 0, repeat: false };
const FLOORS = new Set(['path_stone', 'path_dirt', 'floor_wood', 'floor_stone']);
const PAINTABLE = new Set(['house', ...WALL_KINDS]);
const mature = (c: CropState): boolean => c.stage >= (CROPS[c.crop]?.stages.length ?? 99);

/**
 * `who` says what stands on the tile: an animal (and whether it is hostile) or a villager.
 * `own` is the tile the player stands on.
 */
export function usefulness(world: WorldState, p: PlayerState, tx: number, ty: number, who: { animal?: boolean; hostile?: boolean; npc?: boolean }, own: boolean): Use {
  const held = p.inventory[p.selected] ?? null;
  const def = held ? ITEMS[held.item] : undefined;
  const tool = def?.tool;
  if (tool === 'bazooka' || tool === 'lasso') return { score: 1, repeat: false }; // fire straight ahead
  if (who.npc) return { score: 3, repeat: false };
  const id = world.occupancy[key(tx, ty)];
  const obj = id === undefined ? undefined : world.objects[id];
  const odef = obj ? objectDef(obj.kind) : undefined;
  // (only the farm's monster cave has fighting rules; a cave out in the world works like any other map)
  if (world.area === 'dungeon') {
    if (odef?.interact === 'exit' || odef?.interact === 'treasure') return { score: 3, repeat: false };
    if (who.animal && tool === 'sword') return { score: 4, repeat: true };
    if (tool === 'bow') return { score: who.animal ? 4 : 1, repeat: false };
    if (odef?.breakWith && tool === odef.breakWith) return { score: 2, repeat: true };
    return NONE;
  }
  if (tool === 'sword' || tool === 'bow') {
    if (who.animal && who.hostile) return { score: 4, repeat: tool === 'sword' };
    if (!(odef?.interact || (who.animal && !who.hostile))) return tool === 'bow' ? { score: 0.5, repeat: false } : NONE;
  }
  const terrain = world.terrain[tileIndex(tx, ty)];
  if (tool === 'rod') return isFishWater(terrain) ? { score: 2, repeat: false } : NONE;
  if (who.animal) return { score: 3, repeat: false };
  if (obj && odef) {
    if (def?.paint !== undefined) return PAINTABLE.has(obj.kind) ? { score: 3, repeat: false } : NONE;
    if (odef.harvest || (odef.breakWith && tool === odef.breakWith)) return { score: 3, repeat: true };
    if (odef.interact) return { score: 2, repeat: false };
    // a flat tuft or flower: the hoe clears it, the can and empty hands fall through to the ground
    if (!(odef.flat && (tool === 'hoe' || tool === 'can' || !held))) return NONE;
    if (odef.flat && tool === 'hoe' && odef.breakWith) return { score: 1.5, repeat: true };
  }
  if (held && def?.food) return { score: 1, repeat: false };
  const crop = world.crops[key(tx, ty)];
  if (crop) {
    if (mature(crop)) return { score: 3, repeat: true };
    if (tool === 'can') return crop.watered || (held?.charges ?? 0) <= 0 ? NONE : { score: 2, repeat: true };
    return NONE; // (the hoe would dig it up: never aim at that by accident)
  }
  if (!held) return NONE;
  switch (tool) {
    case 'hoe':
      return terrain === 'grass' && !obj ? { score: 1.5, repeat: true } : NONE;
    case 'can':
      if (isFishWater(terrain)) return { score: (held.charges ?? 0) < 20 ? 2 : 0.5, repeat: false };
      return terrain === 'soil' && (held.charges ?? 0) > 0 ? { score: 1.5, repeat: true } : NONE;
    case 'scythe':
      return NONE; // turning soil back to grass is never what you meant by accident
    case 'hammer':
      return terrain && FLOORS.has(terrain) ? { score: 1, repeat: true } : NONE;
    case 'axe':
    case 'pick':
    case 'brush':
      return NONE;
  }
  if (def?.category === 'seed' && def.crop) return (terrain === 'soil' || terrain === 'soil_wet') && !obj ? { score: 2, repeat: true } : NONE;
  if (def?.category === 'placeable' && def.places) {
    if (own || terrain === 'pool' || (terrain && WALL_TERRAIN.has(terrain))) return NONE;
    if (FLOORS.has(def.places)) return terrain !== def.places && !(obj && objectDef(obj.kind).solid) && !crop ? { score: 1, repeat: true } : NONE;
    return obj ? NONE : { score: 1, repeat: true };
  }
  if (held.item === 'paper') return { score: 1, repeat: false };
  return NONE;
}
