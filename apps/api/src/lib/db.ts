import mongoose from 'mongoose';

const PING_TIMEOUT_MS = 2000;

/** True when the MongoDB connection is open and answers a ping within 2 s. */
export async function isDatabaseUp(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return false;

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      db
        .admin()
        .ping()
        .then(() => true),
      timeout,
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
