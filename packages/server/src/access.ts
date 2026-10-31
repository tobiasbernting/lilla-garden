// Who may enter the world. Nobody plays without an approved device. A parent hands out join codes (typed on the
// start page, or opened as a link) for a named person: the code lets in at most a few devices before it expires,
// either straight away (the parent decided when creating it) or after the parent approves each device. Parents log
// in with a password (and optionally a code from an authenticator app). Rules on top: world closed / family only /
// open to guests, and play hours.
import crypto from 'node:crypto';
import type { VoicePolicy } from '../../shared/src/index.ts';
import type { AccessStore } from './db/accessStore.ts';
import { verifyTotp } from './totp.ts';

export type DeviceKind = 'family' | 'guest';
export type AccessMode = 'closed' | 'family' | 'open';

export interface Device {
  id: string;
  /** sha256 of the secret in the device's cookie */
  tokenHash: string;
  /** What the visitor called the device when joining ("Annas surfplatta") */
  name: string;
  kind: DeviceKind;
  status: 'pending' | 'approved';
  /** Approved but blocked for now (the parent can turn it back on) */
  paused: boolean;
  inviteId: string | null;
  /** Label of the invite it came from ("Kusin Anna") */
  inviteLabel: string;
  /** Characters a guest device may play; family devices may play everyone */
  players: string[];
  /** How many more characters a guest device may create */
  newPlayers: number;
  /** Shown on the waiting screen and on the parent page, so the parent knows which device they approve */
  code: string;
  createdAt: number;
  approvedAt: number | null;
  lastSeenAt: number;
  lastIp: string;
  userAgent: string;
}

/** A join code. Only a hash of the code is stored; the code itself is shown to the parent once. */
export interface Invite {
  id: string;
  tokenHash: string;
  /** Who it is for ("Kusin Anna", "Familjen Svensson") */
  label: string;
  kind: DeviceKind;
  /** Characters each device may create */
  newPlayers: number;
  createdAt: number;
  expiresAt: number;
  /** How many devices may join with it, and how many have */
  maxDevices: number;
  used: number;
  /** 'auto': devices are in at once; 'parent': each device waits for the parent's approval */
  approval: 'auto' | 'parent';
  /** "Öppna igen": the code gives this existing device a new key instead of creating a device */
  deviceId?: string;
  /** Codes saved before join codes existed were single-use links */
  usedAt?: number | null;
}

export interface AccessSettings {
  mode: AccessMode;
  /** Röstprat: nobody, family devices, or guests too (missing in settings saved before it existed = family). */
  voice?: VoicePolicy;
  /** Play hours, 'HH:MM' in Swedish time; both null = any time */
  from: string | null;
  to: string | null;
  totpSecret: string | null;
}

export interface LogEntry {
  at: number;
  event: string;
  detail: string;
  ip: string;
}

/** Why a device may (not) play right now. */
export type Gate = 'ok' | 'unknown' | 'pending' | 'paused' | 'closed' | 'guests-closed' | 'hours';

export interface ParentSession {
  id: string;
  expiresAt: number;
  /** TOTP enrollment in progress */
  totpPending?: string;
  /** A join code created moments ago, shown once */
  newCode?: { code: string; link: string; label: string; reopen: boolean };
}

export const DEVICE_COOKIE = 'lg_device';
export const PARENT_COOKIE = 'lg_parent';

const HOUR = 3_600_000;
const SESSION_MS = 8 * HOUR;
const PENDING_MAX = 10;
const PENDING_TTL = 48 * HOUR;
const LOG_MEMORY = 200;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');
const token = (): string => crypto.randomBytes(32).toString('base64url');
const id = (): string => crypto.randomUUID();

/** No 0/O, 1/I/L: easy to read aloud and type on a tablet. 32 symbols × 8 = 40 bits. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newJoinCode = (): string => {
  let c = '';
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};
/** What the visitor typed, made comparable: case, spaces and dashes don't matter. */
export const normalizeCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Minutes since midnight in Sweden. */
export function swedishMinutes(now: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Inside the play hours? Hours may wrap past midnight (20:00–02:00). */
export function withinHours(from: string | null, to: string | null, now: number): boolean {
  if (!from || !to) return true;
  const m = swedishMinutes(now);
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a === b) return true;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** Fixed-window counters per key (login attempts, invite attempts). */
class Limiter {
  private hits = new Map<string, { n: number; until: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  blocked(key: string, now: number): boolean {
    const h = this.hits.get(key);
    return !!h && h.until > now && h.n >= this.max;
  }
  hit(key: string, now: number): void {
    const h = this.hits.get(key);
    if (!h || h.until <= now) this.hits.set(key, { n: 1, until: now + this.windowMs });
    else h.n++;
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
  }
}

export interface AccessOptions {
  /** Required: the parent password (at least 12 characters). */
  parentPassword: string;
  now?: () => number;
  /** Told about every gate event (push notifications) */
  notify?: (e: LogEntry) => void;
}

export class Access {
  private devices = new Map<string, Device>();
  private byToken = new Map<string, Device>();
  private invites = new Map<string, Invite>();
  private sessions = new Map<string, ParentSession>();
  settings: AccessSettings = { mode: 'family', from: null, to: null, totpSecret: null };
  log: LogEntry[] = [];
  private pwSalt = crypto.randomBytes(16);
  private pwHash: Buffer;
  private lastTotpStep = 0;
  private loginIp = new Limiter(5, 15 * 60_000);
  private loginAll = new Limiter(30, HOUR);
  private joinIp = new Limiter(10, 15 * 60_000);
  /** Wrong codes from everywhere together: stops guessing from many addresses */
  private joinAll = new Limiter(100, HOUR);
  private now: () => number;
  private notify: (e: LogEntry) => void;
  /** Called when devices may have lost access, so open connections can be closed. */
  onChange: () => void = () => {};

  constructor(
    private store: AccessStore,
    opts: AccessOptions,
  ) {
    if (opts.parentPassword.length < 12) throw new Error('PARENT_PASSWORD must be at least 12 characters');
    this.pwHash = crypto.scryptSync(opts.parentPassword, this.pwSalt, 32);
    this.now = opts.now ?? Date.now;
    this.notify = opts.notify ?? (() => {});
  }

  async load(): Promise<void> {
    const data = await this.store.load();
    for (const d of data.devices) {
      this.devices.set(d.id, d);
      this.byToken.set(d.tokenHash, d);
    }
    for (const i of data.invites) this.invites.set(i.id, i);
    if (data.settings) this.settings = { ...this.settings, ...data.settings };
    this.log = data.log;
    await this.cleanup();
  }

  // ---- log ----

  async record(event: string, detail: string, ip: string): Promise<void> {
    const e = { at: this.now(), event, detail, ip };
    this.log.push(e);
    if (this.log.length > LOG_MEMORY) this.log.splice(0, this.log.length - LOG_MEMORY);
    try {
      this.notify(e);
    } catch (err) {
      console.error('could not notify', err);
    }
    try {
      await this.store.log(e);
    } catch (err) {
      console.error('could not write the access log', err);
    }
  }

  // ---- parent ----

  totpEnabled(): boolean {
    return !!this.settings.totpSecret;
  }

  /** Checks the password (and code), with per-address and global limits on failed attempts. */
  async login(password: string, code: string, ip: string): Promise<{ ok: true; session: string } | { ok: false; reason: 'limit' | 'wrong' }> {
    const now = this.now();
    if (this.loginIp.blocked(ip, now) || this.loginAll.blocked('all', now)) {
      await this.record('login-blocked', 'för många försök', ip);
      return { ok: false, reason: 'limit' };
    }
    const hash = crypto.scryptSync(password, this.pwSalt, 32);
    let ok = crypto.timingSafeEqual(hash, this.pwHash);
    if (ok && this.settings.totpSecret) {
      const step = verifyTotp(this.settings.totpSecret, code, now);
      // a code works once
      ok = step !== null && step > this.lastTotpStep;
      if (ok) this.lastTotpStep = step!;
    }
    if (!ok) {
      this.loginIp.hit(ip, now);
      this.loginAll.hit('all', now);
      await this.record('login-failed', 'fel lösenord eller kod', ip);
      return { ok: false, reason: 'wrong' };
    }
    const t = token();
    this.sessions.set(sha256(t), { id: id(), expiresAt: now + SESSION_MS });
    await this.record('login', 'förälder loggade in', ip);
    return { ok: true, session: t };
  }

  session(t: string | undefined): ParentSession | null {
    if (!t) return null;
    const s = this.sessions.get(sha256(t));
    if (!s) return null;
    if (s.expiresAt <= this.now()) {
      this.sessions.delete(sha256(t));
      return null;
    }
    return s;
  }

  logout(t: string | undefined): void {
    if (t) this.sessions.delete(sha256(t));
  }

  /** Signs out every parent (after turning on two-step login, say). */
  logoutAll(): void {
    this.sessions.clear();
  }

  verifyTotpCode(secret: string, code: string): boolean {
    return verifyTotp(secret, code, this.now()) !== null;
  }

  async setTotp(secret: string | null, ip: string): Promise<void> {
    this.settings.totpSecret = secret;
    await this.store.saveSettings(this.settings);
    await this.record(secret ? 'totp-on' : 'totp-off', secret ? 'tvåstegsinloggning på' : 'tvåstegsinloggning av', ip);
  }

  // ---- rules ----

  async setMode(mode: AccessMode, ip: string): Promise<void> {
    this.settings.mode = mode;
    await this.store.saveSettings(this.settings);
    await this.record('mode', { closed: 'stängt för alla', family: 'bara familjen', open: 'familj och gäster' }[mode], ip);
    this.onChange();
  }

  /** Who may use voice. */
  voicePolicy(): VoicePolicy {
    return this.settings.voice ?? 'family';
  }

  async setVoice(policy: VoicePolicy, ip: string): Promise<void> {
    this.settings.voice = policy;
    await this.store.saveSettings(this.settings);
    await this.record('voice', { off: 'röstprat av', family: 'röstprat för familjen', open: 'röstprat för familj och gäster' }[policy], ip);
    this.onChange();
  }

  async setHours(from: string | null, to: string | null, ip: string): Promise<boolean> {
    if ((from && !TIME_RE.test(from)) || (to && !TIME_RE.test(to)) || !!from !== !!to) return false;
    this.settings.from = from;
    this.settings.to = to;
    await this.store.saveSettings(this.settings);
    await this.record('hours', from ? `${from}–${to}` : 'alltid', ip);
    this.onChange();
    return true;
  }

  // ---- join codes ----

  async createInvite(
    opts: { label: string; kind: DeviceKind; hours: number; newPlayers: number; maxDevices?: number; approval?: 'auto' | 'parent' },
    ip: string,
  ): Promise<{ invite: Invite; code: string }> {
    const code = newJoinCode();
    const now = this.now();
    const invite: Invite = {
      id: id(),
      tokenHash: sha256(normalizeCode(code)),
      label: opts.label.trim().slice(0, 40) || 'Inbjudan',
      kind: opts.kind,
      newPlayers: Math.max(0, Math.min(3, Math.floor(opts.newPlayers) || 0)),
      createdAt: now,
      expiresAt: now + Math.max(1, Math.min(30 * 24, Math.floor(opts.hours) || 24)) * HOUR,
      maxDevices: Math.max(1, Math.min(5, Math.floor(opts.maxDevices ?? 1) || 1)),
      used: 0,
      approval: opts.approval === 'parent' ? 'parent' : 'auto',
    };
    this.invites.set(invite.id, invite);
    await this.store.saveInvite(invite);
    await this.record(
      'invite',
      `${invite.label} (${invite.kind === 'family' ? 'familj' : 'gäst'}, ${invite.maxDevices} enhet${invite.maxDevices > 1 ? 'er' : ''}, ${invite.approval === 'auto' ? 'släpps in direkt' : 'du godkänner'})`,
      ip,
    );
    return { invite, code };
  }

  /** "Öppna igen": a one-time code (7 days) that gives an existing device a new key, keeping its characters. */
  async createReopenCode(deviceId: string, ip: string): Promise<{ invite: Invite; code: string } | null> {
    const d = this.devices.get(deviceId);
    if (!d) return null;
    // only one reopen code per device at a time
    for (const i of [...this.invites.values()]) if (i.deviceId === d.id) await this.deleteInvite(i.id, ip, false);
    const r = await this.createInvite({ label: d.name, kind: d.kind, hours: 7 * 24, newPlayers: 0, maxDevices: 1, approval: 'auto' }, ip);
    r.invite.deviceId = d.id;
    await this.store.saveInvite(r.invite);
    return r;
  }

  private spent(i: Invite, now: number): boolean {
    return i.expiresAt <= now || !!i.usedAt || (i.used ?? 0) >= (i.maxDevices ?? 1);
  }

  activeInvites(): Invite[] {
    const now = this.now();
    return [...this.invites.values()].filter((i) => !this.spent(i, now)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteInvite(inviteId: string, ip: string, log = true): Promise<void> {
    const i = this.invites.get(inviteId);
    if (!i) return;
    this.invites.delete(inviteId);
    await this.store.deleteInvite(inviteId);
    if (log) await this.record('invite-deleted', i.label, ip);
  }

  joinBlocked(ip: string): boolean {
    const now = this.now();
    return this.joinIp.blocked(ip, now) || this.joinAll.blocked('all', now);
  }

  /**
   * A visitor typed a join code (or opened its link). Creates a device, approved at once or waiting for the parent,
   * as the code says; a reopen code gives its device a new key instead.
   */
  async redeem(
    codeOrToken: string,
    name: string,
    ip: string,
    userAgent: string,
  ): Promise<{ device: Device; token: string } | { error: 'limit' | 'invalid' | 'full' }> {
    const now = this.now();
    if (this.joinBlocked(ip)) {
      await this.record('join-blocked', 'för många fel koder', ip);
      return { error: 'limit' };
    }
    const hash = sha256(normalizeCode(codeOrToken));
    const legacy = sha256(codeOrToken.trim());
    const invite = [...this.invites.values()].find((i) => i.tokenHash === hash || i.tokenHash === legacy);
    if (!invite || this.spent(invite, now)) {
      this.joinIp.hit(ip, now);
      this.joinAll.hit('all', now);
      await this.record('join-refused', invite ? `${invite.label}: koden är använd eller för gammal` : 'okänd kod', ip);
      return { error: 'invalid' };
    }
    const reopen = invite.deviceId ? this.devices.get(invite.deviceId) : undefined;
    if (invite.deviceId && !reopen) {
      await this.record('join-refused', `${invite.label}: enheten finns inte längre`, ip);
      return { error: 'invalid' };
    }
    if (!reopen && invite.approval === 'parent' && this.pending().length >= PENDING_MAX) {
      await this.record('join-refused', 'för många enheter väntar redan', ip);
      return { error: 'full' };
    }
    invite.used = (invite.used ?? 0) + 1;
    await this.store.saveInvite(invite);
    const t = token();
    if (reopen) {
      this.byToken.delete(reopen.tokenHash);
      reopen.tokenHash = sha256(t);
      reopen.lastSeenAt = now;
      reopen.lastIp = ip;
      reopen.userAgent = userAgent.slice(0, 200);
      this.byToken.set(reopen.tokenHash, reopen);
      await this.store.saveDevice(reopen);
      await this.record('reopened', `${reopen.name} öppnades igen`, ip);
      this.onChange(); // the old key's connections close
      return { device: reopen, token: t };
    }
    const auto = invite.approval === 'auto';
    const device: Device = {
      id: id(),
      tokenHash: sha256(t),
      name: name.trim().slice(0, 40) || invite.label,
      kind: invite.kind,
      status: auto ? 'approved' : 'pending',
      paused: false,
      inviteId: invite.id,
      inviteLabel: invite.label,
      players: [],
      newPlayers: invite.newPlayers,
      code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
      createdAt: now,
      approvedAt: auto ? now : null,
      lastSeenAt: now,
      lastIp: ip,
      userAgent: userAgent.slice(0, 200),
    };
    this.addDevice(device);
    await this.store.saveDevice(device);
    if (auto) await this.record('join', `${device.name} kom in med koden för ${invite.label}`, ip);
    else await this.record('join-waiting', `${device.name} via ${invite.label} väntar (kod ${device.code})`, ip);
    return { device, token: t };
  }

  /** A parent signed in on this very browser makes it a family device, no invite needed. */
  async addFamilyDevice(name: string, ip: string, userAgent: string): Promise<{ device: Device; token: string }> {
    const now = this.now();
    const t = token();
    const device: Device = {
      id: id(),
      tokenHash: sha256(t),
      name: name.trim().slice(0, 40) || 'Familjens enhet',
      kind: 'family',
      status: 'approved',
      paused: false,
      inviteId: null,
      inviteLabel: 'tillagd av förälder',
      players: [],
      newPlayers: 0,
      code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
      createdAt: now,
      approvedAt: now,
      lastSeenAt: now,
      lastIp: ip,
      userAgent: userAgent.slice(0, 200),
    };
    this.addDevice(device);
    await this.store.saveDevice(device);
    await this.record('device-added', `${device.name} (familj)`, ip);
    return { device, token: t };
  }

  private addDevice(d: Device): void {
    this.devices.set(d.id, d);
    this.byToken.set(d.tokenHash, d);
  }

  // ---- devices ----

  deviceFor(cookieToken: string | undefined): Device | null {
    if (!cookieToken) return null;
    return this.byToken.get(sha256(cookieToken)) ?? null;
  }

  device(deviceId: string): Device | null {
    return this.devices.get(deviceId) ?? null;
  }

  pending(): Device[] {
    return [...this.devices.values()].filter((d) => d.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  }

  approved(): Device[] {
    return [...this.devices.values()].filter((d) => d.status === 'approved').sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Remembers when and from where a device was last used (saved at most every 10 minutes). */
  seen(d: Device, ip: string): void {
    const now = this.now();
    const save = now - d.lastSeenAt > 10 * 60_000 || d.lastIp !== ip;
    d.lastSeenAt = now;
    d.lastIp = ip;
    if (save) this.store.saveDevice(d).catch((e) => console.error('could not save device', e));
  }

  async approve(deviceId: string, ip: string): Promise<void> {
    const d = this.devices.get(deviceId);
    if (!d || d.status !== 'pending') return;
    d.status = 'approved';
    d.approvedAt = this.now();
    await this.store.saveDevice(d);
    await this.record('approved', `${d.name} (${d.kind === 'family' ? 'familj' : 'gäst'})`, ip);
  }

  async setPaused(deviceId: string, paused: boolean, ip: string): Promise<void> {
    const d = this.devices.get(deviceId);
    if (!d) return;
    d.paused = paused;
    await this.store.saveDevice(d);
    await this.record(paused ? 'paused' : 'unpaused', d.name, ip);
    this.onChange();
  }

  /** Denies a waiting device or takes access away from an approved one. The device has to be invited again. */
  async remove(deviceId: string, ip: string): Promise<void> {
    const d = this.devices.get(deviceId);
    if (!d) return;
    this.devices.delete(d.id);
    this.byToken.delete(d.tokenHash);
    await this.store.deleteDevice(d.id);
    await this.record(d.status === 'pending' ? 'denied' : 'removed', d.name, ip);
    this.onChange();
  }

  async setPlayers(deviceId: string, players: string[], newPlayers: number, ip: string): Promise<void> {
    const d = this.devices.get(deviceId);
    if (!d) return;
    d.players = [...new Set(players)];
    d.newPlayers = Math.max(0, Math.min(3, Math.floor(newPlayers) || 0));
    await this.store.saveDevice(d);
    await this.record('players', `${d.name}: ${d.players.length} karaktärer, får skapa ${d.newPlayers}`, ip);
    this.onChange();
  }

  // ---- decisions ----

  gate(d: Device | null): Gate {
    if (!d) return 'unknown';
    if (d.status === 'pending') return 'pending';
    if (d.paused) return 'paused';
    if (this.settings.mode === 'closed') return 'closed';
    if (this.settings.mode === 'family' && d.kind === 'guest') return 'guests-closed';
    if (!withinHours(this.settings.from, this.settings.to, this.now())) return 'hours';
    return 'ok';
  }

  mayPlay(d: Device, playerId: string): boolean {
    return this.gate(d) === 'ok' && (d.kind === 'family' || d.players.includes(playerId));
  }

  visible<T extends { id: string }>(d: Device, players: T[]): T[] {
    return d.kind === 'family' ? players : players.filter((p) => d.players.includes(p.id));
  }

  mayCreate(d: Device): boolean {
    return this.gate(d) === 'ok' && (d.kind === 'family' || d.newPlayers > 0);
  }

  async created(d: Device, playerId: string, name: string, ip: string): Promise<void> {
    if (d.kind === 'guest') {
      d.players.push(playerId);
      d.newPlayers = Math.max(0, d.newPlayers - 1);
      await this.store.saveDevice(d);
    }
    await this.record('character', `${d.name} skapade ${name}`, ip);
  }

  /** Drops old waiting devices and spent invites. */
  async cleanup(): Promise<void> {
    const now = this.now();
    for (const d of this.pending()) {
      if (now - d.createdAt > PENDING_TTL) {
        this.devices.delete(d.id);
        this.byToken.delete(d.tokenHash);
        await this.store.deleteDevice(d.id);
      }
    }
    for (const i of [...this.invites.values()]) {
      if (i.expiresAt + 7 * 24 * HOUR < now) {
        this.invites.delete(i.id);
        await this.store.deleteInvite(i.id);
      }
    }
  }
}
