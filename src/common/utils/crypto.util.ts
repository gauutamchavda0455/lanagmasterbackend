import * as crypto from 'crypto';

export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function hashSha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
