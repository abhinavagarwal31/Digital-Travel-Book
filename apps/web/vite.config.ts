import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development too: the browser only ever talks to Vite,
    // which forwards /api to Express, so cookies stay first-party.
    proxy: {
      '/api': 'http://localhost:3000',
      // Development-only local photo storage (stands in for Cloudinary uploads).
      '/dev-storage': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'jsdom' },
});
