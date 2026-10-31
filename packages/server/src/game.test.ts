import { describe, expect, it, vi } from 'vitest';
import { TICK_HZ, TILE, VILLAGE_KEY, addItem, areaKey, enterCave, getArea, landmarkOfKind, npcState, objectDef, placeIn, type Change, type ServerMsg } from '../../shared/src/index.ts';
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
    // the voice state comes after the welcome (the client starts its 📞 window over on a welcome)
    const iWelcome = la.msgs.findIndex((m) => m.t === 'welcome');
    const iVoice = la.msgs.findIndex((m) => m.t === 'voice' && m.ev === 'state');
    expect(iVoice).toBeGreaterThan(iWelcome);

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

describe('cave and dropped connections', () => {
  it('keeps you in the cave through a short disconnect and carries you out after the grace period', async () => {
    vi.useFakeTimers();
    try {
      const game = new Game(new MemoryStore(), { autoStart: false });
      await game.start();
      const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
      const la = fakeLink();
      const ha = game.connect(la);
      ha({ t: 'hello', playerId: a.id });
      const pa = game.world.players[a.id]!;
      addItem(pa.inventory, 'sword', 1);
      enterCave(game.world, a.id);
      expect(pa.area).toBe('dungeon');
      // the tablet drops the socket for a moment
      game.disconnect(la);
      expect(pa.online).toBe(false);
      expect(pa.area).toBe('dungeon');
      // ...and comes back: welcome plus the cave map, still inside
      const lb = fakeLink();
      const hb = game.connect(lb);
      hb({ t: 'hello', playerId: a.id });
      expect(pa.area).toBe('dungeon');
      expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'areaData' && c.key === 'dungeon'))).toBe(true);
      vi.advanceTimersByTime(120_000);
      expect(pa.area).toBe('dungeon');
      // gone for good: carried out after the grace period
      game.disconnect(lb);
      vi.advanceTimersByTime(60_000);
      expect(pa.area).toBe('dungeon');
      vi.advanceTimersByTime(60_000);
      expect(pa.area).toBe('farm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Smedjan: forge and craft messages reach Stina, with a toast for a refusal', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
    const la = fakeLink();
    const ha = game.connect(la);
    ha({ t: 'hello', playerId: a.id });
    const p = game.world.players[a.id]!;
    p.saga = { cls: 'krigare', chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [], gear: { weapon: 'runsvard' } };
    const toasts = (): string[] => la.msgs.flatMap((m) => (m.t === 'changes' ? m.changes.filter((c): c is Extract<Change, { t: 'toast' }> => c.t === 'toast').map((c) => c.text) : []));
    // at home, far from Stina
    ha({ t: 'saga', a: 'forge', item: 'runsvard' });
    expect(toasts().some((t) => t.includes('Smed-Stina'))).toBe(true);
    // by her side, with what it costs
    const town = getArea(game.world, VILLAGE_KEY)!;
    const st = npcState(town, 'stina');
    placeIn(game.world, p, VILLAGE_KEY, Math.floor(st.x / TILE), Math.floor(st.y / TILE) + 1, 'up', []);
    p.x = st.x;
    p.y = st.y + TILE;
    addItem(p.inventory, 'stone', 14);
    addItem(p.inventory, 'gold', 7);
    p.coins = 100;
    ha({ t: 'saga', a: 'forge', item: 'runsvard' });
    expect(p.saga.forge).toEqual({ runsvard: 1 });
    ha({ t: 'saga', a: 'craft', item: 'jarnsvard' });
    expect(p.inventory.some((s) => s?.item === 'jarnsvard')).toBe(true);
    expect(p.coins).toBe(0);
  });

  it('notes the landmarks a player out in the world comes close to, once a second', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
    const ha = game.connect(fakeLink());
    ha({ t: 'hello', playerId: a.id });
    const p = game.world.players[a.id]!;
    const k = areaKey(0, -1);
    const forest = getArea(game.world, k)!;
    const lm = Object.values(forest.objects).find((o) => landmarkOfKind(o.kind))!;
    const d = objectDef(lm.kind);
    placeIn(game.world, p, k, lm.x + 1, lm.y + d.h, 'up', []);
    for (let i = 0; i < TICK_HZ; i++) game.tick(1000 / TICK_HZ);
    expect(p.saga?.seen).toContain(`${k}:${landmarkOfKind(lm.kind)}`);
  });
});
