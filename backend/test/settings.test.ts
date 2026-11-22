import { afterEach, describe, expect, it } from 'vitest';
import { ArrSettingsStore } from '../src/core/settings-store.js';
import {
  apiKeyHeader,
  cleanup,
  sonarrSettings,
  sonarrStatus,
  startApp,
  stubFetch,
} from './helpers.js';

afterEach(cleanup);

const unreachable = () => {
  throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
};

describe('GET /api/sonarr/settings', () => {
  it('reports nothing saved yet', async () => {
    const { app } = await startApp();
    const res = await app.inject({ url: '/api/sonarr/settings' });
    expect(res.json()).toEqual({ url: null, apiKeySaved: false, username: null });
  });

  it('reports the address and that a key is saved, never the key', async () => {
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/settings' });
    expect(res.json()).toEqual({ url: sonarrSettings.url, apiKeySaved: true, username: null });
    expect(res.body).not.toContain(sonarrSettings.apiKey);
  });
});

describe('POST /api/sonarr/settings/test', () => {
  it('tests the given address and key and returns the status', async () => {
    const fetchMock = stubFetch(() => Response.json(sonarrStatus));
    const { app } = await startApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/settings/test',
      payload: { url: ' https://sonarr.example.com/ ', apiKey: ' typed-key ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: '4.0.20.3014' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://sonarr.example.com/api/v3/system/status');
    expect(apiKeyHeader(init)).toBe('typed-key');
  });

  it('reuses the saved key while the address is unchanged', async () => {
    const fetchMock = stubFetch(() => Response.json(sonarrStatus));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/settings/test',
      payload: { url: `${sonarrSettings.url}/` },
    });
    expect(res.statusCode).toBe(200);
    expect(apiKeyHeader(fetchMock.mock.calls[0]![1])).toBe(sonarrSettings.apiKey);
  });

  it('never sends the saved key to a different address', async () => {
    const fetchMock = stubFetch(() => Response.json(sonarrStatus));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/settings/test',
      payload: { url: 'http://somewhere-else:8989' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'bad_request',
        message: "The address changed, so enter Sonarr's API key again.",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for a key when none is saved', async () => {
    const { app } = await startApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/settings/test',
      payload: { url: sonarrSettings.url, apiKey: '  ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { message: "Enter Sonarr's API key." } });
  });

  it('rejects addresses that are not http(s)', async () => {
    const { app } = await startApp();
    for (const url of ['sonarr.lan:8989', 'ftp://sonarr.lan', 'not an address']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sonarr/settings/test',
        payload: { url, apiKey: 'k' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        error: { message: 'Enter the full address, starting with http:// or https://' },
      });
    }
  });

  it('rejects a malformed body', async () => {
    const { app } = await startApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/settings/test',
      payload: { address: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'bad_request' } });
  });

  it('maps a wrong key to 502 upstream_auth, never 401', async () => {
    stubFetch(() => new Response('Unauthorized', { status: 401 }));
    const { app } = await startApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/settings/test',
      payload: { url: sonarrSettings.url, apiKey: 'wrong' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { code: 'upstream_auth' } });
  });
});

describe('PUT /api/sonarr/settings', () => {
  it('tests, saves to disk and enables the service', async () => {
    stubFetch(() => Response.json(sonarrStatus));
    const { app, dataDir } = await startApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/settings',
      payload: { url: 'http://sonarr.lan:8989/', apiKey: 'typed-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      url: 'http://sonarr.lan:8989',
      apiKeySaved: true,
      username: null,
    });
    expect(res.body).not.toContain('typed-key');

    expect(ArrSettingsStore.inDataDir(dataDir).get('sonarr')).toEqual({
      url: 'http://sonarr.lan:8989',
      apiKey: 'typed-key',
    });
    const status = await app.inject({ url: '/api/sonarr/system/status' });
    expect(status.statusCode).toBe(200);
  });

  it("doesn't save when the test fails", async () => {
    stubFetch(unreachable);
    const { app, store } = await startApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/settings',
      payload: sonarrSettings,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { code: 'upstream_unreachable' } });
    expect(store.isConfigured('sonarr')).toBe(false);
  });

  it('saves without testing when forced', async () => {
    const fetchMock = stubFetch(unreachable);
    const { app, store } = await startApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/settings',
      payload: { ...sonarrSettings, force: true },
    });
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get('sonarr')).toEqual(sonarrSettings);
  });

  it('keeps the saved key when only re-saving the same address', async () => {
    stubFetch(() => Response.json(sonarrStatus));
    const { app, store } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/settings',
      payload: { url: sonarrSettings.url },
    });
    expect(res.statusCode).toBe(200);
    expect(store.get('sonarr')).toEqual(sonarrSettings);
  });

  it('requires the key again when the address changes, even when forced', async () => {
    const { app, store } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/settings',
      payload: { url: 'http://somewhere-else:8989', force: true },
    });
    expect(res.statusCode).toBe(400);
    expect(store.get('sonarr')).toEqual(sonarrSettings);
  });
});

describe('DELETE /api/sonarr/settings', () => {
  it('removes the settings and disables the service', async () => {
    const { app, dataDir } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'DELETE', url: '/api/sonarr/settings' });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/sonarr/settings' })).json()).toEqual({
      url: null,
      apiKeySaved: false,
      username: null,
    });
    expect((await app.inject({ url: '/api/sonarr/system/status' })).statusCode).toBe(503);
    expect(ArrSettingsStore.inDataDir(dataDir).isConfigured('sonarr')).toBe(false);
  });
});
