import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../src/env.js';
import { cleanup, makeDataDir, startApp } from './helpers.js';

afterEach(cleanup);

/** A folder shaped like the Vite build output. */
function builtFrontend(): string {
  const root = makeDataDir();
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Steerarr</title>');
  writeFileSync(join(root, 'manifest.webmanifest'), '{"name":"Steerarr"}');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'index-AbC123.js'), 'console.log(1)');
  return root;
}

describe('serving the built frontend (STATIC_DIR)', () => {
  it('serves index.html at / and revalidates it on every load', async () => {
    const { app } = await startApp({}, { staticDir: builtFrontend() });
    const res = await app.inject({ url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('<title>Steerarr</title>');
  });

  it('caches hashed assets for a year', async () => {
    const { app } = await startApp({}, { staticDir: builtFrontend() });
    const res = await app.inject({ url: '/assets/index-AbC123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves the manifest without long caching', async () => {
    const { app } = await startApp({}, { staticDir: builtFrontend() });
    const res = await app.inject({ url: '/manifest.webmanifest' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('keeps the API and JSON 404s working alongside the files', async () => {
    const { app } = await startApp({}, { staticDir: builtFrontend() });
    expect((await app.inject({ url: '/api/services' })).statusCode).toBe(200);
    const missing = await app.inject({ url: '/nope.js' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('refuses to start when the folder has no index.html', async () => {
    await expect(startApp({}, { staticDir: makeDataDir() })).rejects.toThrow(ConfigError);
  });

  it('serves nothing at / when STATIC_DIR is unset (development)', async () => {
    const { app } = await startApp();
    expect((await app.inject({ url: '/' })).statusCode).toBe(404);
  });
});

describe('response headers', () => {
  it('adds basic security headers and never lets API answers be cached', async () => {
    const { app } = await startApp();
    const res = await app.inject({ url: '/api/services' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
