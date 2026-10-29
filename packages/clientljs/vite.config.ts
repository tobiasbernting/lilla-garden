import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // The HUD, menus, networking, sounds and pixel art are the 2D client's; only the view is LittleJS
  resolve: { alias: { '@v1': fileURLToPath(new URL('../client/src', import.meta.url)) } },
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': 'http://localhost:8080',
      '/admin': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Lilla Gården (LittleJS)',
        short_name: 'Gården LJS',
        description: 'Ett litet bondgårdsspel för hela familjen – med LittleJS, ljus och skuggor',
        lang: 'sv',
        start_url: '/',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#2a3d1f',
        theme_color: '#2a3d1f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/admin/, /^\/api/, /^\/ws/, /^\/health/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
