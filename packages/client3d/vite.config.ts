import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // The HUD, menus, networking and 2D icon art are shared with the 2D client
  resolve: { alias: { '@v1': fileURLToPath(new URL('../client/src', import.meta.url)) } },
  server: {
    host: true,
    port: 5174,
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
        name: 'Lilla Gården 3D',
        short_name: 'Gården 3D',
        description: 'Ett litet bondgårdsspel för hela familjen – i 3D',
        lang: 'sv',
        start_url: '/',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#78a7ff',
        theme_color: '#78a7ff',
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
