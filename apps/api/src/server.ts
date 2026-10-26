import mongoose from 'mongoose';
import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';

async function main(): Promise<void> {
  const env = loadEnv();

  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  } catch (err) {
    // The URI can contain a password, so only the driver's error name is logged.
    console.error(`Could not connect to MongoDB (${(err as Error).name}). Check MONGODB_URI.`);
    process.exit(1);
  }

  const server = createApp().listen(env.PORT, () => {
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
