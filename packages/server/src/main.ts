import { setVoxelMode } from '../../shared/src/index.ts';
import { Game } from './game.ts';
import { MemoryStore, PgStore } from './db/store.ts';
import { createServer, findClientDist } from './http.ts';
import { Access } from './access.ts';
import { MemoryAccessStore } from './db/accessStore.ts';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8080);
  // v2 (the 3D game): hills, mountains, digging and building in blocks
  if (process.env.WORLD_MODE === 'voxel') {
    setVoxelMode(true);
    console.log('world mode: voxel (3D blocks)');
  }
  const url = process.env.DATABASE_URL;
  let store: MemoryStore | PgStore;
  if (url) {
    const pg = new PgStore(url);
    try {
      await pg.migrate();
    } catch (e) {
      console.error(`Could not reach or migrate the database at ${url.replace(/\/\/.*@/, '//…@')}. Is Postgres running (pnpm db:up)?`);
      throw e;
    }
    store = pg;
    console.log('database: postgres');
  } else {
    store = new MemoryStore();
    console.warn('DATABASE_URL not set – running in memory, nothing is saved!');
  }
  // Access control: on unless explicitly turned off for a home network
  let access: Access | null = null;
  if (process.env.ACCESS === 'open') {
    console.warn('ACCESS=open – no access control: anyone who reaches the server can play and open /admin. Home network only!');
  } else {
    const password = process.env.PARENT_PASSWORD ?? '';
    if (password.length < 12) {
      throw new Error('PARENT_PASSWORD (at least 12 characters) is required. Set ACCESS=open to run without access control on a home network.');
    }
    access = new Access(store instanceof PgStore ? store.accessStore() : new MemoryAccessStore(), { parentPassword: password });
    await access.load();
    console.log(`access control: on (${access.approved().length} devices, mode ${access.settings.mode})`);
  }
  const seasonEnv = process.env.SEASON_OVERRIDE;
  const game = new Game(store, { seasonOverride: seasonEnv });
  await game.start();
  const clientDist = findClientDist();
  const server = createServer(game, {
    clientDist,
    seasonEnv,
    access,
    trustProxy: process.env.TRUST_PROXY === '1',
    publicUrl: process.env.PUBLIC_URL || undefined,
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`Lilla Gården on http://0.0.0.0:${port} (day ${game.world.day}, season ${game.season()})`);
    if (clientDist) console.log(`serving client from ${clientDist}`);
    else console.log('no client build found – run the Vite dev server for the client');
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: saving and stopping`);
    server.close();
    await game.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
