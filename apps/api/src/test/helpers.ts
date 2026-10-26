import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { Express } from 'express';
import request from 'supertest';
import type { AppConfig } from '../app.ts';

type TestAgent = ReturnType<typeof request.agent>;

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export const TEST_CONFIG: AppConfig = {
  jwtSecret: TEST_JWT_SECRET,
  cookieSecure: false,
  // High enough that ordinary tests never hit it; the limiter has its own test.
  authRateLimit: { windowMs: 60_000, limit: 1000 },
};

/** Starts a throwaway MongoDB, connects mongoose and builds schema indexes. */
export async function startTestDatabase(): Promise<() => Promise<void>> {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await mongoose.syncIndexes();
  return async () => {
    await mongoose.disconnect();
    await mongo.stop();
  };
}

/** A supertest agent logged in as a freshly registered user (cookie kept between calls). */
export async function loggedInAgent(app: Express, email: string): Promise<TestAgent> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ name: email.split('@')[0], email, password: 'correct horse battery' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return agent;
}
