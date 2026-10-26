import { describe, expect, it } from 'vitest';
import { loginBodySchema, registerBodySchema } from './auth.ts';

describe('registerBodySchema', () => {
  const valid = { name: 'Asha', email: 'asha@example.com', password: 'correct horse' };

  it('accepts a valid body and normalizes email and name', () => {
    expect(
      registerBodySchema.parse({ ...valid, name: '  Asha  ', email: '  Asha@Example.COM ' }),
    ).toEqual({ name: 'Asha', email: 'asha@example.com', password: 'correct horse' });
  });

  it.each([
    ['an invalid email', { email: 'not-an-email' }],
    ['a blank name', { name: '   ' }],
    ['a 7-character password', { password: '1234567' }],
    ['a 129-character password', { password: 'x'.repeat(129) }],
  ])('rejects %s', (_label, change) => {
    expect(registerBodySchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it('keeps passwords exactly as typed, including spaces', () => {
    expect(registerBodySchema.parse({ ...valid, password: ' spaced pw ' }).password).toBe(
      ' spaced pw ',
    );
  });
});

describe('loginBodySchema', () => {
  it('accepts a short password so length rules do not leak account details', () => {
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
