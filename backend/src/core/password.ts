import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** How a password is stored: never the password itself, only a salted scrypt hash. */
export const passwordHashSchema = z.object({
  scheme: z.literal('scrypt'),
  n: z.number().int().positive(),
  r: z.number().int().positive(),
  p: z.number().int().positive(),
  salt: z.string().min(1),
  hash: z.string().min(1),
});

export type PasswordHash = z.infer<typeof passwordHashSchema>;

// scrypt's own defaults: about 16 MiB of memory and a few tens of milliseconds per check.
const COST = { n: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, COST);
  const encoded = { salt: salt.toString('base64'), hash: hash.toString('base64') };
  return { scheme: 'scrypt', ...COST, ...encoded };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = await derive(password, Buffer.from(stored.salt, 'base64'), stored);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derive(
  password: string,
  salt: Buffer,
  cost: { n: number; r: number; p: number },
): Promise<Buffer> {
  const options = { N: cost.n, r: cost.r, p: cost.p, maxmem: 64 * 1024 * 1024 };
  // NFKC, so the same password typed on different keyboards gives the same hash.
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
