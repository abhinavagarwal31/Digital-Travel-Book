import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

const SECRET = 'x'.repeat(32);
const required = { MONGODB_URI: 'mongodb://127.0.0.1:27017/tb', JWT_SECRET: SECRET };

describe('loadEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadEnv(required)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/tb',
      JWT_SECRET: SECRET,
    });
  });

  it('accepts an Atlas SRV URI and a numeric PORT string', () => {
    const env = loadEnv({
      ...required,
      NODE_ENV: 'production',
      PORT: '10000',
      MONGODB_URI: 'mongodb+srv://user:pw@cluster0.example.mongodb.net/tb',
    });
    expect(env.PORT).toBe(10000);
    expect(env.NODE_ENV).toBe('production');
  });

  it('names every missing required variable', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI is required[\s\S]*JWT_SECRET is required/);
  });

  it('reports every invalid variable at once', () => {
    expect(() =>
      loadEnv({ ...required, NODE_ENV: 'staging', PORT: 'abc', MONGODB_URI: 'mongodb://x' }),
    ).toThrow(/NODE_ENV is invalid[\s\S]*PORT is invalid/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...required, JWT_SECRET: 'short' })).toThrow('JWT_SECRET is invalid');
  });

  it('rejects the unedited .env.example placeholder secret', () => {
    const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const placeholder = /^JWT_SECRET=(.*)$/m.exec(example)?.[1];
    expect(placeholder?.length).toBeGreaterThanOrEqual(32);
    expect(() => loadEnv({ ...required, JWT_SECRET: placeholder })).toThrow(
      'JWT_SECRET is invalid',
    );
  });

  it('never echoes a value, which may be a secret', () => {
    let message = '';
    try {
      loadEnv({
        MONGODB_URI: 'postgres://admin:hunter2@db.internal',
        JWT_SECRET: 'tooShortSecret',
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('MONGODB_URI is invalid');
    expect(message).toContain('JWT_SECRET is invalid');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('tooShortSecret');
  });
});
