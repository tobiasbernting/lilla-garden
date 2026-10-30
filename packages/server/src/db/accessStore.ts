// Persistence for the access control: devices, invites, gate settings and the gate log.
import { desc, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AccessSettings, Device, Invite, LogEntry } from '../access.ts';
import * as s from './schema.ts';

export interface AccessData {
  devices: Device[];
  invites: Invite[];
  settings: AccessSettings | null;
  log: LogEntry[];
}

export interface AccessStore {
  load(): Promise<AccessData>;
  saveDevice(d: Device): Promise<void>;
  deleteDevice(id: string): Promise<void>;
  saveInvite(i: Invite): Promise<void>;
  deleteInvite(id: string): Promise<void>;
  saveSettings(st: AccessSettings): Promise<void>;
  log(e: LogEntry): Promise<void>;
}

/** Keeps nothing between restarts (development and tests). */
export class MemoryAccessStore implements AccessStore {
  async load(): Promise<AccessData> {
    return { devices: [], invites: [], settings: null, log: [] };
  }
  async saveDevice(): Promise<void> {}
  async deleteDevice(): Promise<void> {}
  async saveInvite(): Promise<void> {}
  async deleteInvite(): Promise<void> {}
  async saveSettings(): Promise<void> {}
  async log(): Promise<void> {}
}

const LOG_KEEP = 2000;

export class PgAccessStore implements AccessStore {
  private logged = 0;

  constructor(private db: PostgresJsDatabase) {}

  async load(): Promise<AccessData> {
    const devices = (await this.db.select().from(s.devices)).map((r) => r.data as Device);
    const invites = (await this.db.select().from(s.invites)).map((r) => r.data as Invite);
    const st = (await this.db.select().from(s.settings).where(sql`${s.settings.key} = 'access'`))[0];
    const log = (await this.db.select().from(s.accessLog).orderBy(desc(s.accessLog.id)).limit(200))
      .map((r) => ({ at: r.at.getTime(), event: r.event, detail: r.detail, ip: r.ip }))
      .reverse();
    return { devices, invites, settings: st ? (JSON.parse(st.value) as AccessSettings) : null, log };
  }

  async saveDevice(d: Device): Promise<void> {
    await this.db.insert(s.devices).values({ id: d.id, data: d, updatedAt: new Date() }).onConflictDoUpdate({ target: s.devices.id, set: { data: d, updatedAt: new Date() } });
  }

  async deleteDevice(id: string): Promise<void> {
    await this.db.delete(s.devices).where(sql`${s.devices.id} = ${id}`);
  }

  async saveInvite(i: Invite): Promise<void> {
    await this.db.insert(s.invites).values({ id: i.id, data: i, updatedAt: new Date() }).onConflictDoUpdate({ target: s.invites.id, set: { data: i, updatedAt: new Date() } });
  }

  async deleteInvite(id: string): Promise<void> {
    await this.db.delete(s.invites).where(sql`${s.invites.id} = ${id}`);
  }

  async saveSettings(st: AccessSettings): Promise<void> {
    const value = JSON.stringify(st);
    await this.db.insert(s.settings).values({ key: 'access', value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  }

  async log(e: LogEntry): Promise<void> {
    const [row] = await this.db.insert(s.accessLog).values({ at: new Date(e.at), event: e.event, detail: e.detail, ip: e.ip }).returning({ id: s.accessLog.id });
    // keep the table small: prune now and then
    if (row && ++this.logged % 100 === 0) await this.db.delete(s.accessLog).where(lt(s.accessLog.id, row.id - LOG_KEEP));
  }
}
