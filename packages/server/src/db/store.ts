// Persistence: load the world from Postgres on boot, flush dirty rows every second.
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AREA_GEN, CAVE_EXIT_TILE, MAX_HEARTS, TILE, settlePlayer, upgradeSavedArea, ensureArcadeHall, ensureBathhouse, ensureSagaPlaces, ensureCave, ensureCity, ensureFarmBusStop, ensureFarmExits, ensureInterior, ensurePizzeria, ensureTransport, ensureTv, ensureVillagers, generateWorld, isHallKey, isSagaKey, DUNGEONS, dungeonOfKey, portalFront, rebuildOccupancy, type Change, type WorldState } from '../../../shared/src/index.ts';
import * as s from './schema.ts';
import { PgAccessStore } from './accessStore.ts';

export interface Store {
  load(): Promise<WorldState>;
  noteChanges(changes: Change[]): void;
  /** An overworld area was entered or changed; persist it on the next flush. */
  noteArea?(key: string): void;
  markAllDirty(world: WorldState): void;
  flush(world: WorldState): Promise<void>;
  close(): Promise<void>;
}

/** In-memory store for development/tests without a database. */
export class MemoryStore implements Store {
  constructor(private seed = 1337) {}
  async load(): Promise<WorldState> {
    return generateWorld(this.seed);
  }
  noteChanges(): void {}
  markAllDirty(): void {}
  async flush(): Promise<void> {}
  async close(): Promise<void> {}
}

const here = path.dirname(fileURLToPath(import.meta.url));

export class PgStore implements Store {
  private sqlc: ReturnType<typeof postgres>;
  private db: PostgresJsDatabase;
  private worldDirty = false;
  private objects = new Set<number>();
  private crops = new Set<string>();
  private animals = new Set<number>();
  private players = new Set<string>();
  private gone = { objects: new Set<number>(), crops: new Set<string>(), animals: new Set<number>(), players: new Set<string>() };
  private flushing: Promise<void> | null = null;

  constructor(url: string) {
    this.sqlc = postgres(url, { max: 4, onnotice: () => {} });
    this.db = drizzle(this.sqlc);
  }

  /** The access control's tables live in the same database. */
  accessStore(): PgAccessStore {
    return new PgAccessStore(this.db);
  }

  async migrate(): Promise<void> {
    const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../../../../drizzle')];
    const { existsSync } = await import('node:fs');
    const folder = process.env.MIGRATIONS_DIR ?? candidates.find((c) => existsSync(c));
    if (!folder) throw new Error('migrations folder not found');
    await migrate(this.db, { migrationsFolder: folder });
  }

  async load(): Promise<WorldState> {
    const rows = await this.db.select().from(s.world).where(sql`${s.world.id} = 1`);
    const row = rows[0];
    if (!row) {
      const world = generateWorld();
      this.markAllDirty(world);
      await this.flush(world);
      return world;
    }
    const world: WorldState = {
      day: row.day,
      timeMs: row.timeMs,
      nextId: row.nextId,
      quests: [],
      questsDay: 0,
      npcs: {},
      seasonOverride: (row.seasonOverride as WorldState['seasonOverride']) ?? null,
      terrain: row.terrain,
      drops: row.drops ?? {},
      crops: {},
      objects: {},
      occupancy: {},
      animals: {},
      players: {},
    };
    const loadedObjectIds: number[] = [];
    for (const o of await this.db.select().from(s.objects)) {
      world.objects[o.id] = o.data;
      loadedObjectIds.push(o.id);
    }
    for (const c of await this.db.select().from(s.crops)) world.crops[c.k] = c.data;
    for (const a of await this.db.select().from(s.animals)) world.animals[a.id] = a.data;
    for (const p of await this.db.select().from(s.players)) {
      world.players[p.id] = { ...p.data, questsDone: p.data.questsDone ?? [], stars: p.data.stars ?? 0, stats: p.data.stats ?? {}, achievements: p.data.achievements ?? [], area: p.data.area && p.data.area !== 'dungeon' ? p.data.area : 'farm', visited: p.data.visited ?? ['farm'], hearts: MAX_HEARTS, online: false, moving: false };
      delete world.players[p.id]!.riding; // horses are re-mounted after a restart
      delete world.players[p.id]!.swimming;
      if (p.data.area === 'dungeon') {
        world.players[p.id]!.x = CAVE_EXIT_TILE.x * TILE + TILE / 2;
        world.players[p.id]!.y = CAVE_EXIT_TILE.y * TILE + TILE / 2;
      }
      // inside a dungeon when the server stopped: wait in front of its arch
      const sagaId = dungeonOfKey(p.data.area ?? '');
      if (sagaId) {
        const front = portalFront(DUNGEONS[sagaId].portal);
        world.players[p.id]!.area = DUNGEONS[sagaId].portal.area;
        world.players[p.id]!.x = front.x * TILE + TILE / 2;
        world.players[p.id]!.y = front.y * TILE + TILE / 2;
      }
      delete world.players[p.id]!.emote;
      delete world.players[p.id]!.fishing;
    }
    rebuildOccupancy(world);
    world.areas = {};
    for (const row of await this.db.select().from(s.areas)) {
      // Spelhallen is rebuilt from its plan each time, so it always has the latest machines; dungeons start over
      if (isHallKey(row.key) || isSagaKey(row.key)) continue;
      const a = row.data;
      a.players = {};
      a.area = row.key;
      rebuildOccupancy(a);
      if (ensureCity(a, world)) {
        console.log(`rebuilt the saved village ${row.key} as a city`);
        this.dirtyAreas.add(row.key);
      }
      if (ensurePizzeria(a)) {
        console.log(`added the pizzeria to the saved village ${row.key}`);
        this.dirtyAreas.add(row.key);
      }
      world.areas[row.key] = a;
    }
    if (Object.keys(world.areas).length) console.log(`loaded ${Object.keys(world.areas).length} explored areas`);
    // Maps from before the wider world (new biomes, caves, treasure): untouched ones are rebuilt, the rest topped up
    let rebuilt = 0;
    let topped = 0;
    for (const [k, a] of Object.entries(world.areas)) {
      if ((a.gen ?? 1) >= AREA_GEN) continue;
      const up = upgradeSavedArea(a, k);
      this.dirtyAreas.add(k);
      if (!up.rebuilt) {
        topped++;
        continue;
      }
      rebuilt++;
      world.areas[k] = up.area;
      for (const p of Object.values(world.players)) if (p.area === k) settlePlayer(up.area, p);
    }
    if (rebuilt || topped) console.log(`the wider world: rebuilt ${rebuilt} untouched explored areas, topped up ${topped}`);
    // Villages saved before the bath house existed get one
    for (const [k, a] of Object.entries(world.areas)) {
      if (ensureBathhouse(a)) {
        this.dirtyAreas.add(k);
        console.log(`added the bath house to ${k}`);
      }
      if (ensureTransport(a)) {
        this.dirtyAreas.add(k);
        console.log(`added the bus stop and station to ${k}`);
      }
      if (ensureArcadeHall(a)) {
        this.dirtyAreas.add(k);
        console.log(`added Spelhallen to ${k}`);
      }
      if (ensureSagaPlaces(k, a)) {
        this.dirtyAreas.add(k);
        console.log(`added a dungeon's arch or Kämpastenen to ${k}`);
      }
    }
    // Worlds saved by older versions: add the farmhouse interior and room for the villagers
    const before = Object.keys(world.objects).length;
    if (ensureInterior(world)) console.log('added the farmhouse interior to the saved world');
    if (ensureTv(world)) console.log('put a TV in the farmhouse');
    ensureVillagers(world);
    if (ensureCave(world)) console.log('added the cave to the saved world');
    ensureFarmExits(world);
    if (ensureFarmBusStop(world)) console.log('added the bus stop to the farm');
    // Objects removed by the repairs above must also leave the database
    for (const id of loadedObjectIds) if (!world.objects[id]) this.gone.objects.add(id);
    if (Object.keys(world.objects).length !== before || this.gone.objects.size > 0 || before === 0) {
      this.markAllDirty(world);
      await this.flush(world);
    }
    return world;
  }

  private dirtyAreas = new Set<string>();

  noteArea(key: string): void {
    if (key !== 'farm' && key !== 'dungeon') this.dirtyAreas.add(key);
  }

  noteChanges(changes: Change[]): void {
    for (const c of changes) {
      if ('area' in c && c.area && c.area !== 'dungeon') {
        this.dirtyAreas.add(c.area);
        continue;
      }
      if (c.t === 'areaData' && c.key !== 'dungeon') this.dirtyAreas.add(c.key);
      switch (c.t) {
        case 'terrain':
        case 'day':
          this.worldDirty = true;
          break;
        case 'crop':
          if (c.crop) this.crops.add(c.k), this.gone.crops.delete(c.k);
          else this.gone.crops.add(c.k), this.crops.delete(c.k);
          this.worldDirty = true;
          break;
        case 'object':
          if (c.obj) this.objects.add(c.id), this.gone.objects.delete(c.id);
          else this.gone.objects.add(c.id), this.objects.delete(c.id);
          this.worldDirty = true;
          break;
        case 'animal':
          if (c.animal) this.animals.add(c.id), this.gone.animals.delete(c.id);
          else this.gone.animals.add(c.id), this.animals.delete(c.id);
          this.worldDirty = true;
          break;
        case 'player':
          if (c.player) this.players.add(c.id), this.gone.players.delete(c.id);
          else this.gone.players.add(c.id), this.players.delete(c.id);
          this.worldDirty = true;
          break;
        case 'drop':
          this.worldDirty = true;
          break;
      }
    }
  }

  markAllDirty(world: WorldState): void {
    this.worldDirty = true;
    for (const id of Object.keys(world.objects)) this.objects.add(Number(id));
    for (const k of Object.keys(world.crops)) this.crops.add(k);
    for (const id of Object.keys(world.animals)) this.animals.add(Number(id));
    for (const id of Object.keys(world.players)) this.players.add(id);
  }

  /** Positions of animals and players change without Change records; call this every so often. */
  markMoving(world: WorldState): void {
    for (const [k, a] of Object.entries(world.areas ?? {})) if (Object.values(a.players).some((p) => p.online)) this.dirtyAreas.add(k);
    for (const id of Object.keys(world.animals)) this.animals.add(Number(id));
    for (const p of Object.values(world.players)) if (p.online) this.players.add(p.id);
    this.worldDirty = true;
  }

  async flush(world: WorldState): Promise<void> {
    if (this.flushing) await this.flushing;
    this.flushing = this.doFlush(world).finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async doFlush(world: WorldState): Promise<void> {
    const objects = [...this.objects].filter((id) => world.objects[id]);
    const crops = [...this.crops].filter((k) => world.crops[k]);
    const animals = [...this.animals].filter((id) => world.animals[id]);
    const players = [...this.players].filter((id) => world.players[id]);
    const gone = {
      objects: [...this.gone.objects],
      crops: [...this.gone.crops],
      animals: [...this.gone.animals],
      players: [...this.gone.players],
    };
    const worldDirty = this.worldDirty;
    const areasToSave = [...this.dirtyAreas].filter((k) => !isSagaKey(k));
    this.dirtyAreas.clear();
    this.objects.clear();
    this.crops.clear();
    this.animals.clear();
    this.players.clear();
    for (const g of Object.values(this.gone)) g.clear();
    this.worldDirty = false;

    await this.db.transaction(async (tx) => {
      if (worldDirty) {
        const row = {
          id: 1,
          day: world.day,
          timeMs: Math.floor(world.timeMs),
          nextId: world.nextId,
          seasonOverride: world.seasonOverride,
          terrain: world.terrain,
          drops: world.drops,
          updatedAt: new Date(),
        };
        await tx
          .insert(s.world)
          .values(row)
          .onConflictDoUpdate({ target: s.world.id, set: { ...row, id: undefined } });
      }
      for (const batch of chunk(objects, 200)) {
        const rows = batch.map((id) => {
          const o = world.objects[id]!;
          return { id, kind: o.kind, x: o.x, y: o.y, data: o };
        });
        await tx.insert(s.objects).values(rows).onConflictDoUpdate({
          target: s.objects.id,
          set: { kind: sql`excluded.kind`, x: sql`excluded.x`, y: sql`excluded.y`, data: sql`excluded.data` },
        });
      }
      for (const batch of chunk(crops, 200)) {
        await tx
          .insert(s.crops)
          .values(batch.map((k) => ({ k, data: world.crops[k]! })))
          .onConflictDoUpdate({ target: s.crops.k, set: { data: sql`excluded.data` } });
      }
      for (const batch of chunk(animals, 200)) {
        await tx
          .insert(s.animals)
          .values(batch.map((id) => ({ id, species: world.animals[id]!.species, name: world.animals[id]!.name, data: world.animals[id]! })))
          .onConflictDoUpdate({ target: s.animals.id, set: { species: sql`excluded.species`, name: sql`excluded.name`, data: sql`excluded.data` } });
      }
      for (const batch of chunk(players, 50)) {
        await tx
          .insert(s.players)
          .values(batch.map((id) => ({ id, name: world.players[id]!.name, data: world.players[id]! })))
          .onConflictDoUpdate({ target: s.players.id, set: { name: sql`excluded.name`, data: sql`excluded.data` } });
      }
      for (const k of areasToSave) {
        const a = world.areas?.[k];
        if (!a) continue;
        const data = { ...a, players: {} };
        await tx
          .insert(s.areas)
          .values({ key: k, biome: a.biome ?? 'ang', data, updatedAt: new Date() })
          .onConflictDoUpdate({ target: s.areas.key, set: { data, updatedAt: new Date() } });
      }
      if (gone.objects.length) await tx.delete(s.objects).where(inArray(s.objects.id, gone.objects));
      if (gone.crops.length) await tx.delete(s.crops).where(inArray(s.crops.k, gone.crops));
      if (gone.animals.length) await tx.delete(s.animals).where(inArray(s.animals.id, gone.animals));
      if (gone.players.length) await tx.delete(s.players).where(inArray(s.players.id, gone.players));
    });
  }

  async close(): Promise<void> {
    await this.sqlc.end({ timeout: 5 });
  }
}

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
