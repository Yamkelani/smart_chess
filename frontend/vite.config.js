import { defineConfig } from 'vite';

// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: '.',

  // Vite options tailored for Tauri dev — file protocol + Desktop HMR
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 5174 }
      : undefined,
    proxy: {
      '/api/engine': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/engine/, ''),
      },
      '/api/ai': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux/mobile
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
