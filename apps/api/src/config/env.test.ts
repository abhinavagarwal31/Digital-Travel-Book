import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

describe('loadEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/tb' })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/tb',
    });
  });

  it('accepts an Atlas SRV URI and a numeric PORT string', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      PORT: '10000',
      MONGODB_URI: 'mongodb+srv://user:pw@cluster0.example.mongodb.net/tb',
    });
    expect(env.PORT).toBe(10000);
    expect(env.NODE_ENV).toBe('production');
  });

  it('names a missing required variable', () => {
    expect(() => loadEnv({})).toThrow('MONGODB_URI is required');
  });

  it('reports every invalid variable at once', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging', PORT: 'abc', MONGODB_URI: 'mongodb://x' })).toThrow(
      /NODE_ENV is invalid[\s\S]*PORT is invalid/,
    );
  });

  it('never echoes a value, which may be a secret', () => {
    const secret = 'postgres://admin:hunter2@db.internal';
    let message = '';
    try {
      loadEnv({ MONGODB_URI: secret });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('MONGODB_URI is invalid');
    expect(message).not.toContain('hunter2');
  });
});
