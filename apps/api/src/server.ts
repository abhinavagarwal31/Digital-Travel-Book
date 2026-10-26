import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { cloudinaryCredentials, loadEnv } from './config/env.ts';
import { createCloudinaryStorage } from './lib/cloudinaryStorage.ts';
import { LOCAL_STORAGE_ROOT, LocalDiskStorage } from './lib/localDiskStorage.ts';
import type { ImageStorage } from './lib/storage.ts';
import { startSweeper } from './modules/photos/sweeper.ts';

const WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv();

  // In production the API also serves the web app; in development Vite does.
  let webDistDir: string | undefined;
  if (env.NODE_ENV === 'production') {
    if (!existsSync(join(WEB_DIST_DIR, 'index.html'))) {
      console.error('Web build not found in apps/web/dist. Run `npm run build` first.');
      process.exit(1);
    }
    webDistDir = WEB_DIST_DIR;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  } catch (err) {
    // The URI can contain a password, so only the driver's error name is logged.
    console.error(`Could not connect to MongoDB (${(err as Error).name}). Check MONGODB_URI.`);
    process.exit(1);
  }
  // Builds the indexes declared in the schemas (e.g. unique email) before serving,
  // so uniqueness is enforced from the very first request.
  await mongoose.syncIndexes();

  const credentials = cloudinaryCredentials(env);
  let storage: ImageStorage | null = null;
  if (credentials) {
    storage = createCloudinaryStorage(credentials);
  } else if (env.NODE_ENV === 'development') {
    storage = new LocalDiskStorage(LOCAL_STORAGE_ROOT);
    console.warn(
      `Cloudinary is not configured: storing photos on disk in ${LOCAL_STORAGE_ROOT} (development only).`,
    );
  } else {
    console.warn('Cloudinary is not configured: photo uploads are disabled.');
  }

  const app = createApp({
    jwtSecret: env.JWT_SECRET,
    cookieSecure: env.NODE_ENV === 'production',
    webDistDir,
    storage,
    storageNamespace: env.NODE_ENV,
  });
  // Finishes interrupted deletions and clears abandoned uploads, every 10 minutes.
  const stopSweeper = storage ? startSweeper(storage, env.NODE_ENV) : () => undefined;
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopSweeper();
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
