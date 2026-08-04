import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [react(), tailwindcss(), VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'manifest.json'],
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Keep the complete app shell, including sql.js' emitted WASM file,
        // available before the browser is taken offline.
        globPatterns: [
          '**/*.{html,ico,png,svg,json}',
          'assets/**/*.{js,css,wasm,woff2}',
          '**/sql-wasm*.wasm',
        ],
        // OAuth and Drive endpoints must never be satisfied by the SPA
        // navigation fallback or a cached response.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: []
      },
      devOptions: {
        // Development has no emitted asset bundle to precache; enabling the
        // service worker here makes Workbox scan an empty dev-dist directory.
        enabled: false,
        type: 'module',
      }
    })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // ExcelJS is intentionally lazy-loaded for export and is ~940 kB.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-dom/client', 'scheduler'],
            charts: ['recharts'],
            motion: ['motion', 'motion/react'],
            database: ['sql.js'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
