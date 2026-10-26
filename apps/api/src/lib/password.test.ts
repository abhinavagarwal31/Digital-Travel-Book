import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterY', hash)).toBe(false);
  });

  it('stores parameters and never the password itself', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('correct horse');
  });

  it('salts every hash differently', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });

  it('treats differently composed unicode as the same password', async () => {
    const hash = await hashPassword('café au lait'); // é as one code point
    expect(await verifyPassword('café au lait', hash)).toBe(true); // e + combining accent
  });

  it.each([
    '',
    'plain',
    'bcrypt$1$2$3$4$5',
    'scrypt$0$8$1$c2FsdA==$aGFzaA==',
    'scrypt$32768$8$1$$',
  ])('returns false for a malformed stored hash %j', async (stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });
});
