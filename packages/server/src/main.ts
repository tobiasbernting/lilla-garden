import { Game } from './game.ts';
import { MemoryStore, PgStore } from './db/store.ts';
import { createServers, findClientDist } from './http.ts';
import { Access } from './access.ts';
import { MemoryAccessStore } from './db/accessStore.ts';
import { ntfyNotifier } from './notify.ts';

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
  // Access control: on unless explicitly turned off for a home network
  let access: Access | null = null;
  if (process.env.ACCESS === 'open') {
    console.warn('ACCESS=open – no access control: anyone who reaches the server can play and open /admin. Home network only!');
  } else {
    const password = process.env.PARENT_PASSWORD ?? '';
    if (password.length < 12) {
      throw new Error('PARENT_PASSWORD (at least 12 characters) is required. Set ACCESS=open to run without access control on a home network.');
    }
    const ntfy = process.env.NTFY_URL;
    access = new Access(store instanceof PgStore ? store.accessStore() : new MemoryAccessStore(), {
      parentPassword: password,
      ...(ntfy ? { notify: ntfyNotifier(ntfy, process.env.NTFY_TOKEN || undefined) } : {}),
    });
    if (ntfy) console.log(`notifications: ntfy ${new URL(ntfy).origin}`);
    await access.load();
    console.log(`access control: on (${access.approved().length} devices, mode ${access.settings.mode})`);
  }
  const seasonEnv = process.env.SEASON_OVERRIDE;
  const game = new Game(store, { seasonOverride: seasonEnv });
  await game.start();
  const clientDist = findClientDist();
  // ADMIN_PORT: the parent page gets its own listener (publish it only where the internet can't reach, e.g. a
  // Tailscale address) and disappears from the public one
  const adminPort = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : null;
  if (adminPort && !process.env.PUBLIC_URL) console.warn('ADMIN_PORT without PUBLIC_URL: join links will point at the parent page address');
  const { server, admin } = createServers(game, {
    clientDist,
    seasonEnv,
    access,
    trustProxy: process.env.TRUST_PROXY === '1',
    publicUrl: process.env.PUBLIC_URL || undefined,
    separateAdmin: !!adminPort,
  });
  if (admin && adminPort) {
    const host = process.env.ADMIN_HOST ?? '0.0.0.0';
    admin.listen(adminPort, host, () => console.log(`parent page on http://${host}:${adminPort}/admin (not on the public port)`));
  }
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
    admin?.close();
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
