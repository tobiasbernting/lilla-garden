import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '../../shared/src/index.ts';
import { Game, type Link } from './game.ts';
import { MemoryStore } from './db/store.ts';

const fakeLink = (): Link & { msgs: ServerMsg[]; closed: boolean } => {
  const l = {
    msgs: [] as ServerMsg[],
    closed: false,
    send(m: ServerMsg) {
      l.msgs.push(m);
    },
    close() {
      l.closed = true;
    },
  };
  return l;
};

describe('Game', () => {
  it('creates players, welcomes them, runs actions and broadcasts', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false, seasonOverride: 'jul' });
    await game.start();
    expect(game.season()).toBe('jul');
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' }, 'shirt_red')!;
    const b = game.createPlayer('Bo', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'long' })!;
    expect(game.playerSummaries().map((p) => p.name)).toEqual(['Astrid', 'Bo']);

    const la = fakeLink();
    const ha = game.connect(la);
    ha({ t: 'hello', playerId: a.id });
    const welcome = la.msgs.find((m) => m.t === 'welcome');
    expect(welcome && welcome.t === 'welcome' && welcome.you).toBe(a.id);
    expect(game.onlinePlayers()).toEqual(['Astrid']);

    const lb = fakeLink();
    const hb = game.connect(lb);
    hb({ t: 'hello', playerId: b.id });
    // Both see Bo coming online
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'player' && c.id === b.id))).toBe(true);

    // Astrid hoes the tile in front of her
    const pa = game.world.players[a.id]!;
    ha({ t: 'select', slot: 0 });
    const tx = Math.floor(pa.x / 16) + 1;
    const ty = Math.floor(pa.y / 16);
    game.world.terrain[ty * 64 + tx] = 'grass';
    ha({ t: 'act', tx, ty });
    expect(game.world.terrain[ty * 64 + tx]).toBe('soil');
    expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'terrain' && c.x === tx))).toBe(true);

    // A private toast only reaches its recipient
    lb.msgs.length = 0;
    la.msgs.length = 0;
    ha({ t: 'buy', item: 'animal_cow', qty: 1 });
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'toast'))).toBe(true);
    expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'toast'))).toBe(false);

    // Tick and state broadcast
    game.tick(50);
    game.broadcastState();
    const state = lb.msgs.find((m) => m.t === 'state');
    expect(state && state.t === 'state' && state.players.length).toBe(2);

    // Same character from a second device kicks the first
    const la2 = fakeLink();
    const ha2 = game.connect(la2);
    ha2({ t: 'hello', playerId: a.id });
    expect(la.closed).toBe(true);
    game.disconnect(la);
    expect(game.onlinePlayers().length).toBe(2);
    game.disconnect(la2);
    expect(game.onlinePlayers()).toEqual(['Bo']);

    // Admin
    game.setSeasonOverride('pask');
    expect(game.season()).toBe('pask');
    game.setSeasonOverride(null);
    expect(game.season()).toBe('jul');
    const day = game.world.day;
    game.skipDay();
    expect(game.world.day).toBe(day + 1);
    await game.stop();
  });

  it('caps the number of characters', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    for (let i = 0; i < 8; i++) expect(game.createPlayer(`P${i}`, { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })).not.toBeNull();
    expect(game.createPlayer('P9', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })).toBeNull();
  });
});
