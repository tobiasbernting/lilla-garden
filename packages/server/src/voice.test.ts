// Röstprat on the server: rooms by address, one speaker per room, the parent's policy, the relayed handshake.
import { describe, expect, it, vi } from 'vitest';
import { VOICE_SIGNALS_PER_SEC, VOICE_TALKING_MIN_MS, type IceServer, type ServerMsg, type VoicePolicy, type VoiceState } from '../../shared/src/index.ts';
import { Voice } from './voice.ts';
import { Game, type Link } from './game.ts';
import { MemoryStore } from './db/store.ts';

type VoiceOut = Extract<ServerMsg, { t: 'voice' }>;

function setup(policy: VoicePolicy = 'open') {
  const sent = new Map<string, VoiceOut[]>();
  let now = 1_000_000;
  const ice: IceServer[] = [{ urls: ['stun:stun.example:3478'] }];
  const v = new Voice({
    send: (id, msg) => {
      if (msg.t !== 'voice') return;
      sent.set(id, [...(sent.get(id) ?? []), msg]);
    },
    name: (id) => ({ a: 'Astrid', b: 'Bo', c: 'Cilla', d: 'Dag' })[id],
    policy: () => policy,
    ice: async () => ice,
    now: () => now,
  });
  const state = (id: string): VoiceState => {
    const m = sent.get(id)?.filter((x): x is Extract<VoiceOut, { ev: 'state' }> => x.ev === 'state').at(-1);
    if (!m) throw new Error(`no state for ${id}`);
    return m.state;
  };
  const of = <E extends VoiceOut['ev']>(id: string, ev: E) => (sent.get(id) ?? []).filter((x): x is Extract<VoiceOut, { ev: E }> => x.ev === ev);
  return { v, sent, state, of, tick: (ms: number) => (now += ms), setPolicy: (p: VoicePolicy) => (policy = p) };
}

const room = (st: VoiceState, id = st.room) => st.rooms.find((r) => r.id === id)!;

describe('voice rooms', () => {
  it('puts devices behind one address in one room and gives the room one speaker', async () => {
    const { v, state, of } = setup();
    v.online('a', '1.2.3.4', false);
    v.online('b', '1.2.3.4', false);
    v.online('c', '5.6.7.8', false);
    expect(state('a').room).toBe(state('b').room);
    expect(state('a').room).not.toBe(state('c').room);
    expect(state('a').rooms).toHaveLength(2);
    expect(state('a').room).not.toContain('1.2.3.4');
    expect(room(state('a')).speaker).toBeNull();

    // Astrid picks up: her tablet is the room's speakerphone and gets the ICE servers
    v.handle('a', { t: 'voice', a: 'join' });
    expect(room(state('b')).speaker).toBe('a');
    expect(state('a').joined).toBe(true);
    expect(room(state('a')).members).toEqual([
      { id: 'a', name: 'Astrid', joined: true },
      { id: 'b', name: 'Bo', joined: false },
    ]);
    await Promise.resolve();
    expect(of('a', 'ice')).toHaveLength(1);
    expect(of('a', 'ice')[0]!.servers[0]!.urls).toEqual(['stun:stun.example:3478']);

    // Bo picks up too: still one speaker, he does not get the servers
    v.handle('b', { t: 'voice', a: 'join' });
    expect(room(state('b')).speaker).toBe('a');
    await Promise.resolve();
    expect(of('b', 'ice')).toHaveLength(0);

    // Bo takes the speakerphone
    v.handle('b', { t: 'voice', a: 'speaker' });
    expect(room(state('a')).speaker).toBe('b');
    await Promise.resolve();
    expect(of('b', 'ice')).toHaveLength(1);

    // Bo hangs up: Astrid has it again; she hangs up: the room is silent
    v.handle('b', { t: 'voice', a: 'leave' });
    expect(room(state('a')).speaker).toBe('a');
    v.handle('a', { t: 'voice', a: 'leave' });
    expect(room(state('a')).speaker).toBeNull();
  });

  it('hands the speakerphone on when the speaker goes offline, and forgets a device that left', () => {
    const { v, state } = setup();
    v.online('a', '1.2.3.4', false);
    v.online('b', '1.2.3.4', false);
    v.handle('a', { t: 'voice', a: 'join' });
    v.handle('b', { t: 'voice', a: 'join' });
    v.offline('a');
    expect(room(state('b')).speaker).toBe('b');
    expect(room(state('b')).members.map((m) => m.id)).toEqual(['b']);
    expect(v.stateFor('a')).toBeNull();
    // back after a Wi-Fi blip: a fresh device, not joined
    v.online('a', '1.2.3.4', false);
    expect(state('a').joined).toBe(false);
    expect(room(state('a')).speaker).toBe('b');
  });

  it('lets a device move to a room of its own, into another player’s room, and back', () => {
    const { v, state } = setup();
    v.online('a', '1.2.3.4', false);
    v.online('b', '1.2.3.4', false);
    v.online('c', '5.6.7.8', false);
    v.handle('a', { t: 'voice', a: 'join' });
    v.handle('b', { t: 'voice', a: 'join' });
    // Bo is really in another room: he gets his own, and becomes its speaker since he had picked up
    v.handle('b', { t: 'voice', a: 'room', mode: 'alone' });
    expect(state('b').room).not.toBe(state('a').room);
    expect(state('b').rooms).toHaveLength(3);
    expect(room(state('b')).speaker).toBe('b');
    expect(room(state('a')).speaker).toBe('a');
    // Cilla (mobile data at the same house) joins Astrid's room
    v.handle('c', { t: 'voice', a: 'room', mode: 'with', with: 'a' });
    expect(state('c').room).toBe(state('a').room);
    v.handle('c', { t: 'voice', a: 'room', mode: 'with', with: 'zzz' }); // nobody: ignored
    expect(state('c').room).toBe(state('a').room);
    // the speaker leaves the room: the speakerphone goes to who is left there
    v.handle('c', { t: 'voice', a: 'join' });
    v.handle('a', { t: 'voice', a: 'room', mode: 'alone' });
    expect(room(state('c')).speaker).toBe('c');
    expect(room(state('a')).speaker).toBe('a');
    v.handle('a', { t: 'voice', a: 'room', mode: 'auto' });
    expect(state('a').room).toBe(state('c').room);
    expect(room(state('a')).speaker).toBe('c');
  });

  it('keeps guests out when the parent says family only, and throws everyone out when it is off', () => {
    const s = setup('family');
    const { v, state } = s;
    v.online('a', '1.2.3.4', false);
    v.online('b', '9.9.9.9', true);
    expect(state('a').allowed).toBe(true);
    expect(state('b').allowed).toBe(false);
    v.handle('b', { t: 'voice', a: 'join' });
    expect(state('b').joined).toBe(false);
    expect(room(state('b')).speaker).toBeNull();
    v.handle('a', { t: 'voice', a: 'join' });
    expect(room(state('a')).speaker).toBe('a');

    s.setPolicy('open');
    v.refresh();
    expect(state('b').allowed).toBe(true);
    v.handle('b', { t: 'voice', a: 'join' });
    expect(room(state('b')).speaker).toBe('b');

    s.setPolicy('off');
    v.refresh();
    expect(state('a').allowed).toBe(false);
    expect(state('a').joined).toBe(false);
    expect(state('a').rooms.every((r) => r.speaker === null)).toBe(true);
  });

  it('relays signals only between the speakers of different rooms, within limits', () => {
    const { v, of, tick } = setup();
    v.online('a', '1.2.3.4', false);
    v.online('b', '1.2.3.4', false);
    v.online('c', '5.6.7.8', false);
    v.online('d', '7.7.7.7', false);
    v.handle('a', { t: 'voice', a: 'join' });
    v.handle('b', { t: 'voice', a: 'join' });
    v.handle('c', { t: 'voice', a: 'join' });
    v.handle('a', { t: 'voice', a: 'signal', to: 'c', data: { type: 'offer', sdp: 'v=0' } });
    expect(of('c', 'signal')).toEqual([{ t: 'voice', ev: 'signal', from: 'a', data: { type: 'offer', sdp: 'v=0' } }]);
    v.handle('c', { t: 'voice', a: 'signal', to: 'a', data: { type: 'answer', sdp: 'v=0' } });
    expect(of('a', 'signal')).toHaveLength(1);
    // Bo is in Astrid's room but not its speaker; Dag never picked up; Astrid and Bo share a room
    v.handle('b', { t: 'voice', a: 'signal', to: 'c', data: {} });
    v.handle('d', { t: 'voice', a: 'signal', to: 'c', data: {} });
    v.handle('a', { t: 'voice', a: 'signal', to: 'b', data: {} });
    v.handle('a', { t: 'voice', a: 'signal', to: 'd', data: {} });
    expect(of('c', 'signal')).toHaveLength(1);
    expect(of('b', 'signal')).toHaveLength(0);
    expect(of('d', 'signal')).toHaveLength(0);
    // too big, or too many this second
    v.handle('a', { t: 'voice', a: 'signal', to: 'c', data: 'x'.repeat(20_000) });
    expect(of('c', 'signal')).toHaveLength(1);
    for (let i = 0; i < VOICE_SIGNALS_PER_SEC + 10; i++) v.handle('c', { t: 'voice', a: 'signal', to: 'a', data: { candidate: i } });
    expect(of('a', 'signal')).toHaveLength(VOICE_SIGNALS_PER_SEC);
    tick(1000);
    v.handle('c', { t: 'voice', a: 'signal', to: 'a', data: { candidate: 'later' } });
    expect(of('a', 'signal')).toHaveLength(VOICE_SIGNALS_PER_SEC + 1);
  });

  it('tells everyone when a speaker starts and stops talking', () => {
    const { v, of, state, tick } = setup();
    v.online('a', '1.2.3.4', false);
    v.online('b', '1.2.3.4', false);
    v.online('c', '5.6.7.8', false);
    v.handle('a', { t: 'voice', a: 'join' });
    v.handle('c', { t: 'voice', a: 'join' });
    v.handle('b', { t: 'voice', a: 'talking', on: true }); // not a speaker
    expect(of('c', 'talking')).toHaveLength(0);
    v.handle('a', { t: 'voice', a: 'talking', on: true });
    expect(of('c', 'talking')).toEqual([{ t: 'voice', ev: 'talking', id: 'a', on: true }]);
    expect(of('b', 'talking')).toHaveLength(1);
    v.handle('a', { t: 'voice', a: 'talking', on: false }); // too soon
    expect(of('c', 'talking')).toHaveLength(1);
    tick(VOICE_TALKING_MIN_MS);
    v.handle('a', { t: 'voice', a: 'talking', on: false });
    expect(of('c', 'talking')).toHaveLength(2);
    // whoever comes online sees who is talking in the state, and a speaker that hangs up falls silent
    tick(VOICE_TALKING_MIN_MS);
    v.handle('a', { t: 'voice', a: 'talking', on: true });
    v.online('d', '8.8.8.8', false);
    expect(state('d').talking).toEqual(['a']);
    v.handle('a', { t: 'voice', a: 'leave' });
    expect(of('c', 'talking').at(-1)).toEqual({ t: 'voice', ev: 'talking', id: 'a', on: false });
    expect(state('d').talking).toEqual([]);
  });
});

describe('voice in the game', () => {
  const fakeLink = (): Link & { msgs: ServerMsg[] } => {
    const l = { msgs: [] as ServerMsg[], send: (m: ServerMsg) => void l.msgs.push(m), close() {} };
    return l;
  };

  it('puts connections into rooms by address and takes them out when they disconnect', async () => {
    const policy = vi.fn<() => VoicePolicy>(() => 'family');
    const game = new Game(new MemoryStore(), { autoStart: false, voice: { policy, ice: async () => [{ urls: ['stun:s'] }] } });
    await game.start();
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
    const b = game.createPlayer('Bo', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'long' })!;
    const la = fakeLink();
    const lb = fakeLink();
    const ha = game.connect(la, { ip: '1.2.3.4' });
    const hb = game.connect(lb, { ip: '1.2.3.4', guest: true });
    ha({ t: 'hello', playerId: a.id });
    hb({ t: 'hello', playerId: b.id });
    const states = (l: { msgs: ServerMsg[] }) => l.msgs.filter((m): m is Extract<ServerMsg, { t: 'voice'; ev: 'state' }> => m.t === 'voice' && m.ev === 'state');
    expect(states(la).at(-1)!.state.room).toBe(states(lb).at(-1)!.state.room);
    expect(states(lb).at(-1)!.state.allowed).toBe(false); // a guest, family only
    ha({ t: 'voice', a: 'join' });
    expect(states(lb).at(-1)!.state.rooms[0]!.speaker).toBe(a.id);
    await Promise.resolve();
    expect(la.msgs.some((m) => m.t === 'voice' && m.ev === 'ice')).toBe(true);
    game.disconnect(la);
    expect(states(lb).at(-1)!.state.rooms[0]!.speaker).toBeNull();
    expect(states(lb).at(-1)!.state.rooms[0]!.members.map((m) => m.name)).toEqual(['Bo']);
    expect(game.voice.stateFor(a.id)).toBeNull();
    await game.stop();
  });
});
