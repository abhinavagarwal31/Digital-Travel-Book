import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5174;
const API_PORT = 3100; // e2e/server.ts

/**
 * End-to-end tests in a real browser against the real app, with its own
 * in-memory database and disk storage. Run: npm run test:e2e
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: [
    {
      command: 'node e2e/server.ts',
      port: API_PORT,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -w @tb/web -- --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      env: { API_ORIGIN: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
