import { randomBytes } from 'crypto';

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}
