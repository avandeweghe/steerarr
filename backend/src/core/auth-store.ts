import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { removeJsonFile, writeJsonFile } from './json-file.js';
import { hashPassword, passwordHashSchema, verifyPassword, type PasswordHash } from './password.js';

const fileSchema = z.object({
  username: z.string().min(1),
  password: passwordHashSchema,
  /** Signs session cookies (see session.ts). Replaced whenever the login changes. */
  sessionSecret: z.string().min(1),
});

interface Login {
  username: string;
  password: PasswordHash;
  sessionSecret: Buffer;
}

/** Whether Steerarr asks for a login. */
export type AuthState =
  | { kind: 'off' }
  | { kind: 'on'; username: string; sessionSecret: Buffer }
  /** auth.json exists but can't be read: nobody gets in until it's fixed or deleted. */
  | { kind: 'broken'; reason: string };

// Checked against when the username is wrong, so a wrong username takes as long as a wrong
// password and doesn't give away which one it was.
const DUMMY_HASH = hashPassword('not the password');

/**
 * The optional login, saved in `<dataDir>/auth.json` (mode 0600) as a username, a scrypt hash
 * of the password and the secret that signs session cookies. No file means the login is off,
 * which is also how to get back in after forgetting the password: delete the file and restart.
 * A file that can't be read keeps everyone out rather than turning the login off.
 */
export class AuthStore {
  readonly #path: string;
  #login: Login | null;
  #broken: string | null = null;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string, onWarning: (message: string) => void = () => {}) {
    this.#path = path;
    const loaded = load(path);
    if (typeof loaded === 'string') {
      this.#login = null;
      this.#broken = loaded;
      onWarning(loaded);
    } else {
      this.#login = loaded;
    }
  }

  static inDataDir(dataDir: string, onWarning?: (message: string) => void): AuthStore {
    return new AuthStore(join(dataDir, 'auth.json'), onWarning);
  }

  get state(): AuthState {
    if (this.#broken) return { kind: 'broken', reason: this.#broken };
    if (!this.#login) return { kind: 'off' };
    return { kind: 'on', username: this.#login.username, sessionSecret: this.#login.sessionSecret };
  }

  /** True only for the saved username and password while the login is on. */
  async checkPassword(username: string, password: string): Promise<boolean> {
    const login = this.#login;
    if (!login || this.#broken) return false;
    if (username !== login.username) {
      await verifyPassword(password, await DUMMY_HASH);
      return false;
    }
    return verifyPassword(password, login.password);
  }

  /** Turns the login on, or changes it. A new password is optional while the login is on. */
  setLogin(username: string, newPassword: string | null): Promise<void> {
    return this.#update(async () => {
      const current = this.#login;
      const password = newPassword === null ? current?.password : await hashPassword(newPassword);
      if (!password) throw new Error('A password is needed to turn the login on.');
      // A new username or password gets a new secret, which logs out every other device.
      const unchanged = current?.username === username && newPassword === null;
      const sessionSecret = unchanged && current ? current.sessionSecret : randomBytes(32);
      const next: Login = { username, password, sessionSecret };
      await writeJsonFile(this.#path, {
        username: next.username,
        password: next.password,
        sessionSecret: next.sessionSecret.toString('base64'),
      });
      this.#login = next;
      this.#broken = null;
    });
  }

  /** A new session secret: every device has to log in again (the caller re-issues its own). */
  logOutEveryone(): Promise<void> {
    return this.#update(async () => {
      const current = this.#login;
      if (!current) throw new Error('The login is off.');
      const next: Login = { ...current, sessionSecret: randomBytes(32) };
      await writeJsonFile(this.#path, {
        username: next.username,
        password: next.password,
        sessionSecret: next.sessionSecret.toString('base64'),
      });
      this.#login = next;
    });
  }

  /** Turns the login off by deleting auth.json. */
  turnOff(): Promise<void> {
    return this.#update(async () => {
      await removeJsonFile(this.#path);
      this.#login = null;
      this.#broken = null;
    });
  }

  #update(change: () => Promise<void>): Promise<void> {
    const run = this.#queue.then(change);
    this.#queue = run.catch(() => {});
    return run;
  }
}

/** The saved login, null when there's none, or why the file can't be used. */
function load(path: string): Login | null | string {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return null;
    return `Couldn't read ${path} (${(err as Error).message}). ${RECOVERY}`;
  }
  try {
    const parsed = fileSchema.parse(JSON.parse(raw));
    return { ...parsed, sessionSecret: Buffer.from(parsed.sessionSecret, 'base64') };
  } catch {
    return `${path} isn't a valid login file. ${RECOVERY}`;
  }
}

const RECOVERY =
  "Nobody can log in until it's fixed. To turn the login off, delete it and restart Steerarr.";
