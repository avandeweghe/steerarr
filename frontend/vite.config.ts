import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Where the dev server forwards /api. In docker-compose.dev.yml this is the backend service.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:6232';
// Docker Desktop on Windows doesn't forward file-change events from C:\ into containers.
const usePolling = process.env.VITE_USE_POLLING === 'true';

export default defineConfig({
  // Relative asset URLs, so the app works at any path behind a reverse proxy.
  base: './',
  plugins: [svelte()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget },
    },
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
  },
});
