// Röstprat on the server: which room every online device is in, who speaks for each room, introducing the rooms'
// speakers to each other and relaying their WebRTC handshake. No sound ever passes through here, and nothing is
// saved: it all lives as long as the connections do.
import crypto from 'node:crypto';
import {
  VOICE_SIGNAL_MAX,
  VOICE_SIGNALS_PER_SEC,
  VOICE_TALKING_MIN_MS,
  type ClientMsg,
  type IceServer,
  type ServerMsg,
  type VoicePolicy,
  type VoiceRoom,
  type VoiceState,
} from '../../shared/src/index.ts';

/** What the voice rooms need from the game. */
export interface VoiceHost {
  /** Sends a message to one player (every connection of theirs). */
  send(playerId: string, msg: ServerMsg): void;
  name(playerId: string): string | undefined;
  /** The parent's choice: nobody, family devices, or guests too. */
  policy(): VoicePolicy;
  /** The STUN/TURN servers for a device that just became a speaker. */
  ice(): Promise<IceServer[]>;
  now?: () => number;
}

type VoiceMsg = Extract<ClientMsg, { t: 'voice' }>;

interface Member {
  id: string;
  ip: string;
  guest: boolean;
  /** Picked up: wants voice. */
  joined: boolean;
  /** Automatic room (same address = same room), a room of one's own, or another player's room. */
  mode: 'auto' | 'alone' | 'with';
  /** The room key chosen with `with` (kept even if that player moves on). */
  withKey?: string;
  talking: boolean;
  lastTalking: number;
  /** Signals this second. */
  signals: { n: number; until: number };
}

/** The room key everyone behind one address shares. */
const autoKey = (ip: string): string => `ip:${ip}`;
/** What clients see of a room key: never the address. */
const roomId = (key: string): string => crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);

export class Voice {
  private members = new Map<string, Member>();
  /** Room key → the player whose device is that room's speakerphone. */
  private speakers = new Map<string, string>();
  private now: () => number;

  constructor(private host: VoiceHost) {
    this.now = host.now ?? Date.now;
  }

  /** A player came online from a device at this address (a guest device may be left out by the parent). */
  online(id: string, ip: string, guest: boolean): void {
    if (this.members.has(id)) this.offline(id, false);
    this.members.set(id, { id, ip, guest, joined: false, mode: 'auto', talking: false, lastTalking: 0, signals: { n: 0, until: 0 } });
    this.broadcast();
  }

  offline(id: string, broadcast = true): void {
    const m = this.members.get(id);
    if (!m) return;
    this.members.delete(id);
    this.unspeak(m);
    if (broadcast) this.broadcast();
  }

  /** The parent changed who may use voice: throw out whoever may not any more. */
  refresh(): void {
    for (const m of this.members.values()) {
      if (!this.allowed(m) && m.joined) {
        m.joined = false;
        this.unspeak(m);
      }
    }
    this.broadcast();
  }

  handle(id: string, msg: VoiceMsg): void {
    const m = this.members.get(id);
    if (!m) return;
    switch (msg.a) {
      case 'join':
        if (!this.allowed(m) || m.joined) return;
        m.joined = true;
        this.claimIfEmpty(m);
        this.broadcast();
        return;
      case 'leave':
        if (!m.joined) return;
        m.joined = false;
        this.unspeak(m);
        this.broadcast();
        return;
      case 'speaker': {
        if (!this.allowed(m) || !m.joined) return;
        const key = this.roomKey(m);
        if (this.speakers.get(key) === id) return;
        const old = this.speakers.get(key);
        if (old) this.stopTalking(old);
        this.speakers.set(key, id);
        this.sendIce(id);
        this.broadcast();
        return;
      }
      case 'room': {
        const wasKey = this.roomKey(m);
        if (msg.mode === 'with') {
          const other = typeof msg.with === 'string' ? this.members.get(msg.with) : undefined;
          if (!other || other.id === id) return;
          m.mode = 'with';
          m.withKey = this.roomKey(other);
        } else if (msg.mode === 'alone' || msg.mode === 'auto') {
          m.mode = msg.mode;
          delete m.withKey;
        } else return;
        if (this.roomKey(m) === wasKey) return;
        // out of the old room: hand its speakerphone to someone else there; into the new: take it if nobody has it
        if (this.speakers.get(wasKey) === id) {
          this.speakers.delete(wasKey);
          this.stopTalking(id);
          this.promote(wasKey);
        }
        if (m.joined) this.claimIfEmpty(m);
        this.broadcast();
        return;
      }
      case 'signal': {
        if (!this.isSpeaker(m)) return;
        const to = typeof msg.to === 'string' ? this.members.get(msg.to) : undefined;
        if (!to || !this.isSpeaker(to) || this.roomKey(to) === this.roomKey(m)) return;
        const t = this.now();
        if (m.signals.until <= t) m.signals = { n: 0, until: t + 1000 };
        if (++m.signals.n > VOICE_SIGNALS_PER_SEC) return;
        if (msg.data === undefined || JSON.stringify(msg.data).length > VOICE_SIGNAL_MAX) return;
        this.host.send(to.id, { t: 'voice', ev: 'signal', from: id, data: msg.data });
        return;
      }
      case 'talking': {
        if (!this.isSpeaker(m)) return;
        const on = !!msg.on;
        const t = this.now();
        if (on === m.talking || t - m.lastTalking < VOICE_TALKING_MIN_MS) return;
        m.talking = on;
        m.lastTalking = t;
        for (const other of this.members.keys()) this.host.send(other, { t: 'voice', ev: 'talking', id, on });
        return;
      }
    }
  }

  /** For tests and the parent page: the rooms as a given player sees them. */
  stateFor(id: string): VoiceState | null {
    const m = this.members.get(id);
    return m ? this.state(m) : null;
  }

  // ---- rooms ----

  private roomKey(m: Member): string {
    if (m.mode === 'alone') return `solo:${m.id}`;
    if (m.mode === 'with' && m.withKey) return m.withKey;
    return autoKey(m.ip);
  }

  private allowed(m: Member): boolean {
    const p = this.host.policy();
    return p === 'open' || (p === 'family' && !m.guest);
  }

  private isSpeaker(m: Member): boolean {
    return m.joined && this.allowed(m) && this.speakers.get(this.roomKey(m)) === m.id;
  }

  /** A joined member takes the speakerphone of a room nobody speaks for. */
  private claimIfEmpty(m: Member): void {
    const key = this.roomKey(m);
    const cur = this.speakers.get(key);
    const curM = cur ? this.members.get(cur) : undefined;
    if (curM && curM.joined && this.roomKey(curM) === key && this.allowed(curM)) return;
    this.speakers.set(key, m.id);
    this.sendIce(m.id);
  }

  /** Someone else in the room who has picked up takes over, else the room falls silent. */
  private promote(key: string): void {
    for (const o of this.members.values()) {
      if (o.joined && this.allowed(o) && this.roomKey(o) === key) {
        this.speakers.set(key, o.id);
        this.sendIce(o.id);
        return;
      }
    }
    this.speakers.delete(key);
  }

  /** Takes the speakerphone from a member who left, hung up or may not use voice any more. */
  private unspeak(m: Member): void {
    this.stopTalking(m.id);
    for (const [key, id] of this.speakers) {
      if (id !== m.id) continue;
      this.speakers.delete(key);
      this.promote(key);
    }
  }

  private stopTalking(id: string): void {
    const m = this.members.get(id);
    if (!m?.talking) return;
    m.talking = false;
    for (const other of this.members.keys()) this.host.send(other, { t: 'voice', ev: 'talking', id, on: false });
  }

  private sendIce(id: string): void {
    void this.host
      .ice()
      .then((servers) => {
        if (this.members.has(id)) this.host.send(id, { t: 'voice', ev: 'ice', servers });
      })
      .catch((e) => console.error('ice servers:', e));
  }

  private rooms(): VoiceRoom[] {
    const byKey = new Map<string, VoiceRoom>();
    for (const m of this.members.values()) {
      const key = this.roomKey(m);
      let r = byKey.get(key);
      if (!r) {
        const sp = this.speakers.get(key);
        const spM = sp ? this.members.get(sp) : undefined;
        byKey.set(key, (r = { id: roomId(key), members: [], speaker: spM && this.isSpeaker(spM) ? spM.id : null }));
      }
      r.members.push({ id: m.id, name: this.host.name(m.id) ?? '?', joined: m.joined && this.allowed(m) });
    }
    return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  private state(m: Member): VoiceState {
    const rooms = this.rooms();
    const talking = [...this.members.values()].filter((o) => o.talking && this.isSpeaker(o)).map((o) => o.id);
    return { allowed: this.allowed(m), room: roomId(this.roomKey(m)), joined: m.joined && this.allowed(m), rooms, talking };
  }

  private broadcast(): void {
    for (const m of this.members.values()) this.host.send(m.id, { t: 'voice', ev: 'state', state: this.state(m) });
  }
}
