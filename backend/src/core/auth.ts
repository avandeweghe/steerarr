import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthStatus } from '@steerarr/shared';
import type { AuthStore } from './auth-store.js';
import { AuthError, BadRequestError } from './errors.js';
import {
  checkToken,
  clearSessionCookie,
  createToken,
  needsRenewal,
  readSessionCookie,
  setSessionCookie,
} from './session.js';

/** Routes reachable without a login: the login itself, and whether one is needed. */
const PUBLIC_ROUTES = new Set(['/api/auth/status', '/api/auth/login', '/api/auth/logout']);

/** After this many failed logins within the window, an address waits until the window ends. */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

const MIN_PASSWORD = 8;

const loginBody = z.object({ username: z.string().max(256), password: z.string().max(1024) });
const settingsBody = z.object({
  enabled: z.boolean(),
  username: z.string().max(256).optional(),
  newPassword: z.string().max(1024).optional(),
  currentPassword: z.string().max(1024).optional(),
});

/**
 * Steerarr's optional login (off until it's turned on in Steerarr's settings). While it's on,
 * every /api route except the login routes needs a valid session cookie. The app itself (HTML,
 * scripts) and /healthz stay reachable, since they hold nothing private and the app has to
 * load to show the login form.
 */
export function registerAuth(app: FastifyInstance, store: AuthStore): void {
  const limiter = new LoginLimiter();

  app.addHook('onRequest', async (request, reply) => {
    // The matched route, not the raw URL: encoded or doubled slashes can't slip past it.
    const route = request.routeOptions.url;
    if (!route?.startsWith('/api/') || PUBLIC_ROUTES.has(route)) return;
    const state = store.state;
    if (state.kind === 'off') return;
    if (state.kind === 'broken') throw AuthError.unavailable(state.reason);
    const token = readSessionCookie(request);
    const expires = token === null ? null : checkToken(token, state.sessionSecret);
    if (expires === null) throw AuthError.loginRequired();
    if (needsRenewal(expires)) setSessionCookie(request, reply, createToken(state.sessionSecret));
  });

  app.get('/api/auth/status', async (request): Promise<AuthStatus> => currentStatus(request));

  app.post('/api/auth/login', async (request, reply) => {
    const state = store.state;
    if (state.kind === 'broken') throw AuthError.unavailable(state.reason);
    if (state.kind === 'off') throw new BadRequestError("The login is off, so there's no need.");
    limiter.check(request.ip);
    const body = loginBody.safeParse(request.body);
    if (!body.success) throw new BadRequestError('Send a username and a password.');
    if (!(await store.checkPassword(body.data.username, body.data.password))) {
      limiter.fail(request.ip);
      throw AuthError.loginFailed();
    }
    limiter.succeed(request.ip);
    startSession(request, reply);
    return reply.status(204).send();
  });

  app.post('/api/auth/logout', async (request, reply) => {
    clearSessionCookie(request, reply);
    return reply.status(204).send();
  });

  // Logs out every other device; this one gets a new session. Only reachable while logged in.
  app.post('/api/auth/logout-others', async (request, reply) => {
    if (store.state.kind !== 'on') {
      throw new BadRequestError("The login is off, so there's nobody to log out.");
    }
    await store.logOutEveryone();
    startSession(request, reply);
    return reply.status(204).send();
  });

  // Only reachable while logged in when the login is on (see the hook above).
  app.put('/api/auth/settings', async (request, reply): Promise<AuthStatus> => {
    const parsed = settingsBody.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('Send enabled, and a username and passwords.');
    const body = parsed.data;
    const state = store.state;

    // A stolen session alone can't change or remove the login.
    if (state.kind === 'on') {
      limiter.check(request.ip);
      if (!(await store.checkPassword(state.username, body.currentPassword ?? ''))) {
        limiter.fail(request.ip);
        throw new BadRequestError('The current password is wrong.');
      }
    }

    if (!body.enabled) {
      if (state.kind === 'on') await store.turnOff();
      clearSessionCookie(request, reply);
      return { enabled: false, loggedIn: false, username: null };
    }

    const username = body.username?.trim() ?? '';
    if (!username) throw new BadRequestError('Choose a username.');
    const newPassword = body.newPassword || null;
    if (newPassword === null && state.kind !== 'on') {
      throw new BadRequestError('Choose a password.');
    }
    if (newPassword !== null && newPassword.length < MIN_PASSWORD) {
      throw new BadRequestError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    }
    await store.setLogin(username, newPassword);
    // Keep this device logged in; a changed login has a new secret, so others must log in again.
    startSession(request, reply);
    return { enabled: true, loggedIn: true, username };
  });

  function startSession(request: FastifyRequest, reply: FastifyReply): void {
    const state = store.state;
    if (state.kind === 'on') setSessionCookie(request, reply, createToken(state.sessionSecret));
  }

  function currentStatus(request: FastifyRequest): AuthStatus {
    const state = store.state;
    if (state.kind === 'off') return { enabled: false, loggedIn: false, username: null };
    if (state.kind === 'broken') return { enabled: true, loggedIn: false, username: null };
    const token = readSessionCookie(request);
    const loggedIn = token !== null && checkToken(token, state.sessionSecret) !== null;
    return { enabled: true, loggedIn, username: loggedIn ? state.username : null };
  }
}

/** Counts failed logins per address, in memory (a restart forgets them). */
class LoginLimiter {
  readonly #failures = new Map<string, { count: number; since: number }>();

  check(address: string, now = Date.now()): void {
    const entry = this.#current(address, now);
    if (entry && entry.count >= MAX_FAILURES) {
      throw AuthError.tooManyAttempts(Math.ceil((entry.since + WINDOW_MS - now) / 60_000));
    }
  }

  fail(address: string, now = Date.now()): void {
    const entry = this.#current(address, now);
    if (entry) entry.count += 1;
    else this.#failures.set(address, { count: 1, since: now });
    if (this.#failures.size > 1000) this.#prune(now);
  }

  succeed(address: string): void {
    this.#failures.delete(address);
  }

  #current(address: string, now: number): { count: number; since: number } | undefined {
    const entry = this.#failures.get(address);
    if (entry && now - entry.since >= WINDOW_MS) {
      this.#failures.delete(address);
      return undefined;
    }
    return entry;
  }

  #prune(now: number): void {
    for (const [address, entry] of this.#failures) {
      if (now - entry.since >= WINDOW_MS) this.#failures.delete(address);
    }
  }
}
