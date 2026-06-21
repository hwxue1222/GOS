import { randomBytes, scrypt as _scrypt, timingSafeEqual, type ScryptOptions } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt) as unknown as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

type ParsedHash = {
  salt: Buffer;
  derivedKey: Buffer;
};

function parseHash(hash: string): ParsedHash | null {
  const parts = hash.split('$');
  if (parts[0] !== 'scrypt') return null;

  let saltPart = '';
  let derivedPart = '';

  if (parts.length === 3) {
    saltPart = parts[1] ?? '';
    derivedPart = parts[2] ?? '';
  } else if (parts.length === 5 && parts[1] === '' && parts[3] === '') {
    saltPart = parts[2] ?? '';
    derivedPart = parts[4] ?? '';
  } else {
    return null;
  }

  const salt = Buffer.from(saltPart, 'base64');
  const derivedKey = Buffer.from(derivedPart, 'base64');
  if (!salt.length || !derivedKey.length) return null;
  return { salt, derivedKey };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  })) as Buffer;
  return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const parsed = parseHash(passwordHash);
  if (!parsed) return false;
  const derivedKey = (await scrypt(password, parsed.salt, parsed.derivedKey.length, {
    N: 16384,
    r: 8,
    p: 1,
  })) as Buffer;
  if (derivedKey.length !== parsed.derivedKey.length) return false;
  return timingSafeEqual(derivedKey, parsed.derivedKey);
}
