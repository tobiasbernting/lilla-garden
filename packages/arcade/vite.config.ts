import { defineConfig } from 'vite';

// The arcade lab: every minigame on its own page, without the game server (pnpm --filter @lilla-garden/arcade lab)
export default defineConfig({
  server: { host: true, port: 5180 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
