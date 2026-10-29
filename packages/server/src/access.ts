// Who may enter the world. Nobody plays without a device the parent approved: an invite link creates a device,
// the parent approves it on the parent page, and only then does the game load. Parents log in with a password
// (and optionally a code from an authenticator app). Rules on top: world closed / family only / open to guests,
// and play hours.
import crypto from 'node:crypto';
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

export interface Invite {
  id: string;
  tokenHash: string;
  label: string;
  kind: DeviceKind;
  /** Characters the device may create */
  newPlayers: number;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface AccessSettings {
  mode: AccessMode;
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
  /** An invite link created moments ago, shown once */
  newLink?: string;
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
  private now: () => number;
  /** Called when devices may have lost access, so open connections can be closed. */
  onChange: () => void = () => {};

  constructor(
    private store: AccessStore,
    opts: AccessOptions,
  ) {
    if (opts.parentPassword.length < 12) throw new Error('PARENT_PASSWORD must be at least 12 characters');
    this.pwHash = crypto.scryptSync(opts.parentPassword, this.pwSalt, 32);
    this.now = opts.now ?? Date.now;
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

  async setHours(from: string | null, to: string | null, ip: string): Promise<boolean> {
    if ((from && !TIME_RE.test(from)) || (to && !TIME_RE.test(to)) || !!from !== !!to) return false;
    this.settings.from = from;
    this.settings.to = to;
    await this.store.saveSettings(this.settings);
    await this.record('hours', from ? `${from}–${to}` : 'alltid', ip);
    this.onChange();
    return true;
  }

  // ---- invites ----

  async createInvite(opts: { label: string; kind: DeviceKind; hours: number; newPlayers: number }, ip: string): Promise<{ invite: Invite; token: string }> {
    const t = token();
    const now = this.now();
    const invite: Invite = {
      id: id(),
      tokenHash: sha256(t),
      label: opts.label.trim().slice(0, 40) || 'Inbjudan',
      kind: opts.kind,
      newPlayers: Math.max(0, Math.min(3, Math.floor(opts.newPlayers))),
      createdAt: now,
      expiresAt: now + Math.max(1, Math.min(7 * 24, Math.floor(opts.hours))) * HOUR,
      usedAt: null,
    };
    this.invites.set(invite.id, invite);
    await this.store.saveInvite(invite);
    await this.record('invite', `${invite.label} (${invite.kind})`, ip);
    return { invite, token: t };
  }

  activeInvites(): Invite[] {
    const now = this.now();
    return [...this.invites.values()].filter((i) => !i.usedAt && i.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteInvite(inviteId: string, ip: string): Promise<void> {
    const i = this.invites.get(inviteId);
    if (!i) return;
    this.invites.delete(inviteId);
    await this.store.deleteInvite(inviteId);
    await this.record('invite-deleted', i.label, ip);
  }

  joinBlocked(ip: string): boolean {
    return this.joinIp.blocked(ip, this.now());
  }

  /** Turns an invite into a device waiting for the parent's approval. The invite works once. */
  async redeem(inviteToken: string, name: string, ip: string, userAgent: string): Promise<{ device: Device; token: string } | { error: 'limit' | 'invalid' | 'full' }> {
    const now = this.now();
    if (this.joinIp.blocked(ip, now)) return { error: 'limit' };
    this.joinIp.hit(ip, now);
    const hash = sha256(inviteToken);
    const invite = [...this.invites.values()].find((i) => i.tokenHash === hash);
    if (!invite || invite.usedAt || invite.expiresAt <= now) {
      await this.record('join-refused', invite ? `${invite.label}: redan använd eller för gammal` : 'okänd länk', ip);
      return { error: 'invalid' };
    }
    if (this.pending().length >= PENDING_MAX) {
      await this.record('join-refused', 'för många enheter väntar redan', ip);
      return { error: 'full' };
    }
    invite.usedAt = now;
    await this.store.saveInvite(invite);
    const t = token();
    const device: Device = {
      id: id(),
      tokenHash: sha256(t),
      name: name.trim().slice(0, 40) || 'Okänd enhet',
      kind: invite.kind,
      status: 'pending',
      paused: false,
      inviteId: invite.id,
      inviteLabel: invite.label,
      players: [],
      newPlayers: invite.newPlayers,
      code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
      createdAt: now,
      approvedAt: null,
      lastSeenAt: now,
      lastIp: ip,
      userAgent: userAgent.slice(0, 200),
    };
    this.addDevice(device);
    await this.store.saveDevice(device);
    await this.record('join', `${device.name} via ${invite.label} väntar (kod ${device.code})`, ip);
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
