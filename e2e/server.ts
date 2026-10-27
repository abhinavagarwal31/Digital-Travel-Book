// The API for end-to-end tests: a throwaway in-memory MongoDB and photos on a
// temporary disk folder, so a test run never touches real data or Cloudinary.
// Started by playwright.config.ts; stops when Playwright stops it.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app.ts';
import { LocalDiskStorage } from '../apps/api/src/lib/localDiskStorage.ts';

export const E2E_API_PORT = 3100;

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
await mongoose.syncIndexes();

const app = createApp({
  jwtSecret: 'e2e-secret-that-is-at-least-32-characters-long',
  cookieSecure: false,
  authRateLimit: { windowMs: 60_000, limit: 1000 },
  storage: new LocalDiskStorage(mkdtempSync(join(tmpdir(), 'travel-book-e2e-'))),
  storageNamespace: 'e2e',
});

const server = app.listen(E2E_API_PORT, () => {
  console.log(`e2e API on http://localhost:${E2E_API_PORT}`);
});

async function stop() {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
