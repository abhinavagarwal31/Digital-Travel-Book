import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';

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

  const server = createApp({ webDistDir }).listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
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
