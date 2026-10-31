import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_LEN,
  JOKES,
  NPCS,
  NPC_TALK,
  RIDDLES,
  TILE,
  WEATHER_KINDS,
  addAnimal,
  addObject,
  callPets,
  cleanChat,
  createPlayer,
  generateWorld,
  key,
  localWeather,
  mulberry32,
  nextWeather,
  setOnline,
  setWeather,
  talkNode,
  teleport,
  tick,
  tileIndex,
  type Change,
  type PlayerState,
  type SimCtx,
  type TalkCtx,
  type WorldState,
  mySpeaker,
  offers,
  voicePeers,
  type VoiceState,
} from './index.ts';

const ctx = (now = 1_000_000): SimCtx => ({ season: 'none', rnd: mulberry32(7), now });

function setup(): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Test', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
  setOnline(world, p.id, true);
  return { world, p };
}

const at = (p: PlayerState, tx: number, ty: number): void => {
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE / 2;
};

const toasts = (ch: Change[]): string[] => ch.filter((c) => c.t === 'toast').map((c) => (c as { text: string }).text);

describe('pets: stay and whistle', () => {
  it('a dog told to stay stops following, and comes back when you whistle', () => {
    const { world, p } = setup();
    at(p, 20, 20);
    const dog = addAnimal(world, 'dog', 0, 'Bamse');
    dog.owner = p.id;
    dog.x = p.x;
    dog.y = p.y + 3;
    const out = callPets(world, p.id, 'stay', ctx());
    expect(dog.stay).toBeDefined();
    expect(toasts(out)[0]).toContain('Bamse');
    at(p, 30, 20);
    for (let i = 0; i < 60; i++) tick(world, 50, ctx());
    // it potters around where it was told to stay
    expect(Math.hypot(dog.x - 20 * TILE, dog.y - 20 * TILE)).toBeLessThan(3 * TILE);
    const come = callPets(world, p.id, 'come', ctx());
    expect(dog.stay).toBeUndefined();
    expect(p.emote?.id).toBe('vissla');
    expect(toasts(come)[0]).toContain('Bamse');
    for (let i = 0; i < 60; i++) tick(world, 50, ctx());
    expect(Math.hypot(dog.x - p.x, dog.y - p.y)).toBeLessThan(30);
  });

  it('a staying pet is left behind when you go to another map, and a whistle fetches it', () => {
    const { world, p } = setup();
    at(p, 20, 20);
    const cat = addAnimal(world, 'cat', 0, 'Misse');
    cat.owner = p.id;
    callPets(world, p.id, 'stay', ctx());
    p.visited.push('a:1,0');
    teleport(world, p.id, 'a:1,0');
    expect(p.area).toBe('a:1,0');
    expect(world.animals[cat.id]?.species).toBe('cat'); // still home on the farm
    const out = callPets(world, p.id, 'come', ctx());
    expect(Object.values(world.animals).some((a) => a.species === 'cat')).toBe(false);
    const village = world.areas!['a:1,0']!;
    const moved = Object.values(village.animals).find((a) => a.species === 'cat' && a.owner === p.id);
    expect(moved?.name).toBe('Misse');
    expect(out.some((c) => c.t === 'animal' && c.area === 'a:1,0' && c.animal?.name === 'Misse')).toBe(true);
    // and "stay" over there tells the village map, not the farm
    const stay = callPets(world, p.id, 'stay', ctx());
    expect(stay.filter((c) => c.t === 'animal').every((c) => c.t === 'animal' && c.area === 'a:1,0')).toBe(true);
    expect(moved?.stay).toBeDefined();
  });

  it('a whistled horse follows its owner around the farm, and stays when told', () => {
    const { world, p } = setup();
    const stall = addObject(world, 'stall', 30, 40)!;
    const horse = addAnimal(world, 'horse', stall.id, 'Blixten');
    horse.owner = p.id;
    at(p, 20, 20);
    callPets(world, p.id, 'come', ctx());
    expect(horse.follow).toBe(true);
    for (let i = 0; i < 400; i++) tick(world, 50, ctx());
    expect(Math.hypot(horse.x - p.x, horse.y - p.y)).toBeLessThan(2 * TILE);
    callPets(world, p.id, 'stay', ctx());
    expect(horse.follow).toBeUndefined();
    const spot = { x: horse.x, y: horse.y };
    at(p, 26, 20);
    for (let i = 0; i < 100; i++) tick(world, 50, ctx());
    expect(Math.hypot(horse.x - spot.x, horse.y - spot.y)).toBeLessThan(3 * TILE);
  });

  it('other players’ animals do not listen, and without pets you get a hint', () => {
    const { world, p } = setup();
    const q = createPlayer(world, 'Kompis', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
    const dog = addAnimal(world, 'dog', 0, 'Bamse');
    dog.owner = q.id;
    const out = callPets(world, p.id, 'stay', ctx());
    expect(dog.stay).toBeUndefined();
    expect(toasts(out).length).toBe(1);
  });
});

describe('weather', () => {
  it('starts sunny and moves on when its time is up', () => {
    const { world } = setup();
    tick(world, 50, ctx());
    expect(world.weather?.kind).toBe('sun');
    const until = world.weather!.until;
    tick(world, 50, ctx(until + 1));
    expect(world.weather!.since).toBe(until + 1);
    expect(WEATHER_KINDS).toContain(world.weather!.kind);
  });

  it('follows a pattern: snow is common in winter and very rare in summer', () => {
    const rnd = mulberry32(3);
    let winter = 0;
    let summer = 0;
    for (let i = 0; i < 2000; i++) {
      if (nextWeather('cloudy', 0, rnd) === 'snow') winter++;
      if (nextWeather('cloudy', 6, rnd) === 'snow') summer++;
    }
    expect(winter).toBeGreaterThan(300);
    expect(summer).toBeLessThan(40);
    // a storm never jumps straight to sunshine
    for (let i = 0; i < 200; i++) expect(nextWeather('storm', 5, rnd)).not.toBe('sun');
  });

  it('looks different on the ice and in the desert', () => {
    expect(localWeather('rain', 'is')).toBe('snow');
    expect(localWeather('rain', 'oken')).toBe('wind');
    expect(localWeather('rain', 'skog')).toBe('rain');
  });

  it('rain waters the fields and their crops', () => {
    const { world } = setup();
    world.terrain[tileIndex(10, 30)] = 'soil';
    world.crops[key(10, 30)] = { crop: 'carrot', stage: 0, progress: 0, watered: false };
    setWeather(world, 'rain', ctx(), true);
    tick(world, 50, ctx(1_000_000 + 2000));
    expect(world.terrain[tileIndex(10, 30)]).toBe('soil'); // just started
    const out = tick(world, 50, ctx(1_000_000 + 10_000));
    expect(world.terrain[tileIndex(10, 30)]).toBe('soil_wet');
    expect(world.crops[key(10, 30)]!.watered).toBe(true);
    expect(out.some((c) => c.t === 'crop' && c.k === key(10, 30))).toBe(true);
  });

  it('tells the players outside when the weather turns', () => {
    const { world, p } = setup();
    setWeather(world, 'sun', ctx());
    const out = setWeather(world, 'snow', ctx());
    expect(out).toEqual([{ t: 'toast', to: p.id, text: expect.stringContaining('snöar') }]);
    expect(setWeather(world, 'sun', ctx()).length).toBe(1);
  });
});

describe('chat', () => {
  it('keeps one tidy line', () => {
    expect(cleanChat('  hej\n\npå   dig\u0007 ')).toBe('hej på dig');
    expect(cleanChat('')).toBe('');
    expect(cleanChat(42)).toBe('');
    expect([...cleanChat('😀'.repeat(200))].length).toBe(CHAT_MAX_LEN);
  });
});

describe('villager conversations', () => {
  const tctx = (seed = 1): TalkCtx => ({ name: 'Ella', weather: 'rain', dayFraction: 0.4, season: 'none', pets: [{ name: 'Bamse', species: 'dog' }], rnd: mulberry32(seed) });

  it('every villager can talk, and every answer leads somewhere', () => {
    for (const id of Object.keys(NPCS)) {
      expect(NPC_TALK[id], id).toBeDefined();
      const seen = new Set<string>();
      const queue = ['start'];
      while (queue.length) {
        const node = queue.shift()!;
        if (seen.has(node)) continue;
        seen.add(node);
        // try a few random rolls so every joke, riddle and hand gets visited
        for (let seed = 1; seed <= 15; seed++) {
          const t = talkNode(id, node, tctx(seed));
          expect(t.say.length, `${id}/${node}`).toBeGreaterThan(0);
          expect(t.say, `${id}/${node}`).not.toMatch(/\{\w+\}/);
          expect(t.options.length, `${id}/${node}`).toBeGreaterThan(0);
          for (const o of t.options) {
            if (o.go === '') continue;
            const known = ['start', 'topics', 'bye', 'how', 'weather', 'likes', 'dislikes', 'pet', 'joke', 'riddle', 'rps', 'ask'].includes(o.go.split(':')[0]!) || o.go in NPC_TALK[id]!.nodes;
            expect(known, `${id}/${node} → ${o.go}`).toBe(true);
            queue.push(o.go);
          }
        }
      }
      expect(seen.has('bye')).toBe(true);
    }
  });

  it('a story never leaves you stuck: you can always get back to the topics', () => {
    const hasBack = (id: string, node: string) => talkNode(id, node, tctx()).options.some((o) => o.go === 'topics' || o.go === '');
    for (const [id, def] of Object.entries(NPC_TALK)) {
      for (const node of Object.keys(def.nodes)) {
        // a quiz question may offer only answers, as long as each answer leads back
        const ok = hasBack(id, node) || talkNode(id, node, tctx()).options.every((o) => hasBack(id, o.go));
        expect(ok, `${id}/${node}`).toBe(true);
      }
    }
  });

  it('riddles say when you are right and let you give up', () => {
    const r = RIDDLES[0]!;
    expect(talkNode('greta', `riddle:0:${r.right}`, tctx()).say).toContain(r.answers[r.right]!.toLowerCase());
    const wrong = talkNode('greta', `riddle:0:${(r.right + 1) % 3}`, tctx());
    expect(wrong.options.some((o) => o.go === 'riddle:0:give')).toBe(true);
    expect(talkNode('greta', 'riddle:0:give', tctx()).say).toContain(r.answers[r.right]!);
    expect(JOKES.length).toBeGreaterThan(8);
  });

  it('uses your name, your pet and the weather', () => {
    expect(talkNode('elsa', 'start', tctx()).say).toContain('Ella');
    expect(talkNode('elsa', 'pet', tctx()).say).toContain('Bamse');
    expect(talkNode('sven', 'weather', tctx()).say).toContain('Regn');
    const noPets = talkNode('elsa', 'topics', { ...tctx(), pets: [], weather: null });
    expect(noPets.options.some((o) => o.go === 'pet' || o.go === 'weather')).toBe(false);
  });
});

describe('voice', () => {
  const state = (room: string, rooms: VoiceState['rooms']): VoiceState => ({ allowed: true, room, joined: true, rooms, talking: [] });
  it('connects a speaker to the speakers of the other rooms only', () => {
    const st = state('r1', [
      { id: 'r1', members: [{ id: 'a', name: 'A', joined: true }], speaker: 'a' },
      { id: 'r2', members: [{ id: 'b', name: 'B', joined: true }], speaker: 'b' },
      { id: 'r3', members: [{ id: 'c', name: 'C', joined: false }], speaker: null },
    ]);
    expect(voicePeers(st)).toEqual(['b']);
    expect(mySpeaker(st)).toBe('a');
    expect(mySpeaker(state('r3', st.rooms))).toBeNull();
  });
  it('lets exactly one of two speakers make the offer', () => {
    expect(offers('a', 'b')).not.toBe(offers('b', 'a'));
    expect(offers('a', 'b') || offers('b', 'a')).toBe(true);
  });
});
