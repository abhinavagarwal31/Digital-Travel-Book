import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The end-to-end tests point the dev server at their own API.
const api = process.env.API_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development too: the browser only ever talks to Vite,
    // which forwards /api to Express, so cookies stay first-party.
    proxy: {
      '/api': api,
      // Development-only local photo storage (stands in for Cloudinary uploads).
      '/dev-storage': api,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'jsdom' },
});
