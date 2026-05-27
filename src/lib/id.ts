import { randomBytes } from 'crypto';

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}

export function newPublicToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}
