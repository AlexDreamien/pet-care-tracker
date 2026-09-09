import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The worker is written out rather than generated: it has to handle push, which
      // generateSW cannot express.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Питомец — карточка и напоминания',
        short_name: 'Питомец',
        description:
          'Документы, медкнижка, замеры и календарь ухода за домашним животным в одном месте',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f5f2',
        theme_color: '#2f6f5e',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // One origin in development too, so the session cookie behaves as it will in production.
      '/api': { target: 'http://127.0.0.1:5174', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
