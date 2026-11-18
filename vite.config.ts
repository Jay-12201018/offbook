import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// GitHub Pages project site: https://jay-12201018.github.io/offbook/
const BASE = '/offbook/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        // App shell + small catalog JSON only. Never precache content/audio.
        globPatterns: [
          '**/*.{js,css,html,ico,png,webp,woff2,webmanifest,svg,txt}',
          'content/index.json',
          'content/packs.json',
          'content/sequence.json',
          'content/licenses.md',
          'content/scenes/*.json',
        ],
        globIgnores: ['**/content/audio/**', '**/node_modules/**', '**/splash/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Absolute so it stays inside the Pages subpath. Precache entries are
        // relative to sw.js, and Workbox resolves both to the same URL.
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/offbook\/content\/audio\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/offbook/content/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'offbook-audio',
              expiration: {
                maxEntries: 1200,
                maxAgeSeconds: 60 * 60 * 24 * 120,
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/offbook/content/') &&
              !url.pathname.startsWith('/offbook/content/audio/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'offbook-content',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 120,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
