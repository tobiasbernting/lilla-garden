import { Game } from './game.ts';
import { MemoryStore, PgStore } from './db/store.ts';
import { createServer, findClientDist } from './http.ts';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8080);
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
  const seasonEnv = process.env.SEASON_OVERRIDE;
  const game = new Game(store, { seasonOverride: seasonEnv });
  await game.start();
  const clientDist = findClientDist();
  const server = createServer(game, { clientDist, seasonEnv });
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
