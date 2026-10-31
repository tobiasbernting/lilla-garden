// The client's mirror of the world: the player records the other maps carry.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerState, WorldState } from '@lilla-garden/shared';
import { applyChange, client, worldFor } from './state.ts';

const player = (id: string, area: string): PlayerState => ({ id, name: id, area, x: 0, y: 0, facing: 'down', moving: false, online: true, inventory: [], selected: 0 }) as unknown as PlayerState;
const world = (area: string, players: Record<string, PlayerState>): WorldState =>
  ({ area, players, objects: {}, crops: {}, drops: {}, animals: {}, terrain: new Array(64 * 64).fill(0), occupancy: {}, timeMs: 0, day: 1 }) as unknown as WorldState;

describe('player records on other maps', () => {
  beforeEach(() => {
    client.me = 'me';
    client.areas = {};
    client.dungeon = null;
  });

  it('someone who arrives on the map I am on lands in that map\'s player list, by the farm\'s record', () => {
    const me = player('me', 'a:city');
    const other = player('other', 'farm');
    client.world = world('farm', { me, other });
    // I travel to the city: the server sends me the city with its players (only me so far)
    applyChange({ t: 'areaData', to: 'me', key: 'a:city', world: world('a:city', { me: { ...me } }) });
    applyChange({ t: 'player', id: 'me', player: me });
    expect(worldFor('a:city')!.players['other']).toBeUndefined();
    // the other player follows: everyone gets their record, only they get the map
    applyChange({ t: 'player', id: 'other', player: { ...other, area: 'a:city' } });
    const city = worldFor('a:city')!;
    expect(city.players['other']).toBe(client.world.players['other']);
    expect(city.players['other']!.area).toBe('a:city');
    // and leaves again: gone from the city's list, still on the farm's
    applyChange({ t: 'player', id: 'other', player: { ...other, area: 'farm' } });
    expect(city.players['other']).toBeUndefined();
    expect(client.world.players['other']!.area).toBe('farm');
  });

  it('the dungeon keeps its list in step too, and a removed player leaves every list', () => {
    const me = player('me', 'dungeon');
    const other = player('other', 'farm');
    client.world = world('farm', { me, other });
    applyChange({ t: 'areaData', to: 'me', key: 'dungeon', world: world('dungeon', { me: { ...me } }) });
    applyChange({ t: 'player', id: 'other', player: { ...other, area: 'dungeon' } });
    expect(client.dungeon!.players['other']).toBe(client.world.players['other']);
    applyChange({ t: 'player', id: 'other', player: null });
    expect(client.dungeon!.players['other']).toBeUndefined();
    expect(client.world.players['other']).toBeUndefined();
  });
});
