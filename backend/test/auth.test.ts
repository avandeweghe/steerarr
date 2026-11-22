import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { checkToken, createToken, needsRenewal } from '../src/core/session.js';
import { cleanup, sonarrSettings, startApp } from './helpers.js';

afterEach(cleanup);

const PASSWORD = 'correct horse battery';

interface Reply {
  headers: Record<string, unknown>;
}

/** The session cookie a response set, as a Cookie request header value. */
function sessionCookie(res: Reply): string {
  const header = res.headers['set-cookie'];
  const value = Array.isArray(header) ? String(header[0]) : String(header ?? '');
  return value.split(';')[0] ?? '';
}

function setCookieHeader(res: Reply): string {
  return String(res.headers['set-cookie'] ?? '');
}

/** Turns the login on (as anyone can while it's off) and returns this device's cookie. */
async function turnOn(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/auth/settings',
    payload: { enabled: true, username: 'captain', newPassword: PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  return sessionCookie(res);
}

function login(app: FastifyInstance, username: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
}

describe('while the login is off', () => {
  it('lets everyone in, as before', async () => {
    const { app } = await startApp({ sonarr: sonarrSettings });
    const status = await app.inject({ url: '/api/auth/status' });
    expect(status.json()).toEqual({ enabled: false, loggedIn: false, username: null });
    expect((await app.inject({ url: '/api/services' })).statusCode).toBe(200);
  });

  it('refuses to turn on without a username or a long enough password', async () => {
    const { app, dataDir } = await startApp();
    const bad = [
      { enabled: true, newPassword: PASSWORD },
      { enabled: true, username: '  ', newPassword: PASSWORD },
      { enabled: true, username: 'captain' },
      { enabled: true, username: 'captain', newPassword: 'short' },
    ];
    for (const payload of bad) {
      const res = await app.inject({ method: 'PUT', url: '/api/auth/settings', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(existsSync(join(dataDir, 'auth.json'))).toBe(false);
  });
});

describe('turning the login on', () => {
  it('saves only a hash, in a private file, and logs this device in', async () => {
    const { app, dataDir } = await startApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/settings',
      payload: { enabled: true, username: ' captain ', newPassword: PASSWORD },
    });

    expect(res.json()).toEqual({ enabled: true, loggedIn: true, username: 'captain' });
    const cookie = setCookieHeader(res);
    expect(cookie).toMatch(/^steerarr_session=\d+\.[\w-]{43}; Path=\/; Max-Age=34560000;/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Secure');

    const file = join(dataDir, 'auth.json');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const saved = readFileSync(file, 'utf8');
    expect(saved).not.toContain(PASSWORD);
    expect(JSON.parse(saved)).toMatchObject({
      username: 'captain',
      password: { scheme: 'scrypt' },
    });
  });

  it('marks the cookie Secure behind an https proxy', async () => {
    const { app } = await startApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/settings',
      headers: { 'x-forwarded-proto': 'https' },
      payload: { enabled: true, username: 'captain', newPassword: PASSWORD },
    });
    expect(setCookieHeader(res)).toContain('; Secure');
  });
});

describe('while the login is on', () => {
  it('needs a login for the API, but not for the app, health or the login routes', async () => {
    const { app } = await startApp({ sonarr: sonarrSettings });
    await turnOn(app);

    const res = await app.inject({ url: '/api/services' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.json()).toMatchObject({ error: { code: 'login_required' } });
    const urls = ['/api/sonarr/series', '/api/sonarr/settings', '/api/sonarr/series/1/poster'];
    for (const url of urls) {
      expect((await app.inject({ url })).statusCode).toBe(401);
    }

    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    const status = await app.inject({ url: '/api/auth/status' });
    expect(status.json()).toEqual({ enabled: true, loggedIn: false, username: null });
  });

  it('lets a logged-in device in', async () => {
    const { app } = await startApp({ sonarr: sonarrSettings });
    const cookie = await turnOn(app);

    const res = await app.inject({ url: '/api/services', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const status = await app.inject({ url: '/api/auth/status', headers: { cookie } });
    expect(status.json()).toEqual({ enabled: true, loggedIn: true, username: 'captain' });
  });

  it('rejects a tampered or foreign cookie', async () => {
    const { app } = await startApp();
    const cookie = await turnOn(app);
    const [name, token] = cookie.split('=');
    const [expires, signature] = (token ?? '').split('.');
    const forged = [
      `${name}=${Number(expires) + 1000}.${signature}`,
      `${name}=${expires}.${'A'.repeat(43)}`,
      `${name}=garbage`,
    ];
    for (const value of forged) {
      const res = await app.inject({ url: '/api/services', headers: { cookie: value } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('logs in with the right username and password only', async () => {
    const { app } = await startApp();
    await turnOn(app);

    const attempts = [
      ['captain', 'wrong password'],
      ['Captain', PASSWORD],
      ['', ''],
    ];
    for (const [username = '', password = ''] of attempts) {
      const res = await login(app, username, password);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: 'login_failed' } });
      expect(res.headers['set-cookie']).toBeUndefined();
    }

    const res = await login(app, 'captain', PASSWORD);
    expect(res.statusCode).toBe(204);
    const cookie = sessionCookie(res);
    expect((await app.inject({ url: '/api/services', headers: { cookie } })).statusCode).toBe(200);
  });

  it('logs out by clearing the cookie', async () => {
    const { app } = await startApp();
    const cookie = await turnOn(app);
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(res.statusCode).toBe(204);
    expect(setCookieHeader(res)).toMatch(/^steerarr_session=; Path=\/; Max-Age=0;/);
  });

  it('stops guessing after 10 failed logins from one address', async () => {
    const { app } = await startApp();
    await turnOn(app);
    for (let i = 0; i < 10; i++) {
      expect((await login(app, 'captain', `guess ${i}`)).statusCode).toBe(401);
    }

    const res = await login(app, 'captain', PASSWORD);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: { code: 'too_many_attempts' } });
    expect(res.json().error.message).toMatch(/Try again in 15 minutes/);
  });

  it('stays on after a restart, with existing sessions still valid', async () => {
    const first = await startApp();
    const cookie = await turnOn(first.app);
    const second = await startApp({}, { dataDir: first.dataDir });

    const res = await second.app.inject({ url: '/api/services', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect((await second.app.inject({ url: '/api/services' })).statusCode).toBe(401);
  });
});

describe('changing the login', () => {
  it('needs the current password', async () => {
    const { app } = await startApp();
    const cookie = await turnOn(app);
    for (const currentPassword of [undefined, 'wrong password']) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/settings',
        headers: { cookie },
        payload: {
          enabled: true,
          username: 'captain',
          newPassword: 'another password',
          currentPassword,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toBe('The current password is wrong.');
    }
    expect((await login(app, 'captain', PASSWORD)).statusCode).toBe(204);
  });

  it('logs out other devices when the password changes, but not this one', async () => {
    const { app } = await startApp();
    const thisDevice = await turnOn(app);
    const otherDevice = sessionCookie(await login(app, 'captain', PASSWORD));

    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/settings',
      headers: { cookie: thisDevice },
      payload: {
        enabled: true,
        username: 'captain',
        newPassword: 'a new password',
        currentPassword: PASSWORD,
      },
    });
    expect(res.statusCode).toBe(200);
    const renewed = sessionCookie(res);

    const asOther = await app.inject({ url: '/api/services', headers: { cookie: otherDevice } });
    expect(asOther.statusCode).toBe(401);
    const asThis = await app.inject({ url: '/api/services', headers: { cookie: renewed } });
    expect(asThis.statusCode).toBe(200);
    expect((await login(app, 'captain', PASSWORD)).statusCode).toBe(401);
    expect((await login(app, 'captain', 'a new password')).statusCode).toBe(204);
  });

  it('keeps other devices logged in when nothing changes', async () => {
    const { app } = await startApp();
    const thisDevice = await turnOn(app);
    const otherDevice = sessionCookie(await login(app, 'captain', PASSWORD));

    await app.inject({
      method: 'PUT',
      url: '/api/auth/settings',
      headers: { cookie: thisDevice },
      payload: { enabled: true, username: 'captain', currentPassword: PASSWORD },
    });
    const res = await app.inject({ url: '/api/services', headers: { cookie: otherDevice } });
    expect(res.statusCode).toBe(200);
  });

  it('turns off with the current password and deletes auth.json', async () => {
    const { app, dataDir } = await startApp();
    const cookie = await turnOn(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/settings',
      headers: { cookie },
      payload: { enabled: false, currentPassword: PASSWORD },
    });

    expect(res.json()).toEqual({ enabled: false, loggedIn: false, username: null });
    expect(existsSync(join(dataDir, 'auth.json'))).toBe(false);
    expect((await app.inject({ url: '/api/services' })).statusCode).toBe(200);
  });
});

describe('logging out every other device', () => {
  it('keeps this device logged in and logs out the others', async () => {
    const { app } = await startApp({ sonarr: sonarrSettings });
    const first = await turnOn(app);
    const other = sessionCookie(await login(app, 'captain', PASSWORD));
    expect(
      (await app.inject({ url: '/api/services', headers: { cookie: other } })).statusCode,
    ).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout-others',
      headers: { cookie: first },
    });
    expect(res.statusCode).toBe(204);
    const renewed = sessionCookie(res);

    expect(
      (await app.inject({ url: '/api/services', headers: { cookie: renewed } })).statusCode,
    ).toBe(200);
    for (const cookie of [first, other]) {
      expect((await app.inject({ url: '/api/services', headers: { cookie } })).statusCode).toBe(
        401,
      );
    }
    // The password still works, so the other devices can log in again.
    expect((await login(app, 'captain', PASSWORD)).statusCode).toBe(204);
  });

  it('needs a logged-in device', async () => {
    const { app } = await startApp();
    await turnOn(app);
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout-others' });
    expect(res.statusCode).toBe(401);
  });

  it('says so when the login is off', async () => {
    const { app } = await startApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout-others' });
    expect(res.statusCode).toBe(400);
  });
});

describe('an unreadable auth.json', () => {
  it('keeps everyone out and says how to recover', async () => {
    const first = await startApp();
    writeFileSync(join(first.dataDir, 'auth.json'), '{ not json');
    const { app } = await startApp({}, { dataDir: first.dataDir });

    const res = await app.inject({ url: '/api/services' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'login_unavailable' } });
    expect(res.json().error.message).toMatch(/delete it and restart Steerarr/);
    expect((await login(app, 'captain', PASSWORD)).statusCode).toBe(503);
  });
});

describe('session tokens', () => {
  const secret = Buffer.alloc(32, 7);
  const now = 1_800_000_000;

  it('are valid for 400 days (the most browsers keep) with the secret that signed them', () => {
    const token = createToken(secret, now);
    expect(checkToken(token, secret, now)).toBe(now + 400 * 86400);
    expect(checkToken(token, secret, now + 400 * 86400)).toBeNull();
    expect(checkToken(token, Buffer.alloc(32, 8), now)).toBeNull();
  });

  it('are renewed once they are a day old', () => {
    const expires = now + 400 * 86400;
    expect(needsRenewal(expires, now + 3600)).toBe(false);
    expect(needsRenewal(expires, now + 86400 + 1)).toBe(true);
  });
});
