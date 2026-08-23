import { AuthService } from './auth.service';
import { assertPasswordPolicy } from './password-policy';
import { verify } from 'argon2';

describe('password security', () => {
  const service = new AuthService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  it('rejects passwords shorter than 12 characters', () =>
    expect(() => assertPasswordPolicy('too-short')).toThrow());
  it('creates a non-plaintext Argon2id hash that verifies only the valid password', async () => {
    const password = 'a long passphrase';
    const digest = await service.hashPassword(password);
    expect(digest).not.toBe(password);
    expect(digest).toContain('$argon2id$');
    expect(await verify(digest, password)).toBe(true);
    expect(await verify(digest, 'not the password')).toBe(false);
  });
});
