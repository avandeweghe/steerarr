import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, sonarrSettings, sonarrStatus, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

describe('core routes', () => {
  it('GET /healthz', async () => {
    const { app } = await startApp();
    const res = await app.inject({ url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/services lists every service with whether it is set up', async () => {
    const empty = await startApp();
    const nzbget = { id: 'nzbget', name: 'NZBGet', configured: false, url: null };
    const radarr = { id: 'radarr', name: 'Radarr', configured: false, url: null };
    const prowlarr = { id: 'prowlarr', name: 'Prowlarr', configured: false, url: null };
    expect((await empty.app.inject({ url: '/api/services' })).json()).toEqual({
      services: [
        { id: 'sonarr', name: 'Sonarr', configured: false, url: null },
        radarr,
        prowlarr,
        nzbget,
      ],
    });

    const saved = await startApp({ sonarr: sonarrSettings });
    const res = await saved.app.inject({ url: '/api/services' });
    expect(res.json()).toEqual({
      services: [
        { id: 'sonarr', name: 'Sonarr', configured: true, url: sonarrSettings.url },
        radarr,
        prowlarr,
        nzbget,
      ],
    });
    expect(res.body).not.toContain(sonarrSettings.apiKey);
  });

  it('GET /api/about says which commit is running', async () => {
    const dev = await startApp();
    expect((await dev.app.inject({ url: '/api/about' })).json()).toEqual({ commit: null });
    const built = await startApp({}, { commit: 'abc1234' });
    expect((await built.app.inject({ url: '/api/about' })).json()).toEqual({ commit: 'abc1234' });
  });

  it('answers unknown routes with a JSON 404', async () => {
    const { app } = await startApp();
    const res = await app.inject({ url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('GET /api/sonarr/system/status', () => {
  it('answers 503 not_configured until Sonarr is set up', async () => {
    const fetchMock = stubFetch(() => Response.json(sonarrStatus));
    const { app } = await startApp();
    const res = await app.inject({ url: '/api/sonarr/system/status' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: {
        code: 'not_configured',
        message: "Sonarr isn't set up yet. Add its address and API key in Steerarr's settings.",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a trimmed status', async () => {
    stubFetch(() => Response.json(sonarrStatus));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/system/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      appName: 'Sonarr',
      instanceName: 'Sonarr',
      version: '4.0.20.3014',
      branch: 'main',
      startTime: '2026-11-20T10:00:00Z',
    });
  });

  it('uses new settings right away, without a restart', async () => {
    const fetchMock = stubFetch(() => Response.json(sonarrStatus));
    const { app, store } = await startApp({ sonarr: sonarrSettings });
    await app.inject({ url: '/api/sonarr/system/status' });
    await store.set('sonarr', { url: 'http://new-sonarr:8989', apiKey: 'new-key' });
    await app.inject({ url: '/api/sonarr/system/status' });

    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://sonarr.lan:8989/api/v3/system/status');
    expect(String(fetchMock.mock.calls[1]![0])).toBe('http://new-sonarr:8989/api/v3/system/status');
  });
});

describe('upstream error mapping', () => {
  async function statusWith(response: () => Response) {
    stubFetch(response);
    const { app } = await startApp({ sonarr: sonarrSettings });
    return app.inject({ url: '/api/sonarr/system/status' });
  }

  it('maps an unreachable Sonarr to 502 upstream_unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/system/status' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      error: {
        code: 'upstream_unreachable',
        message:
          "Can't reach Sonarr: the connection was refused (ECONNREFUSED). Check that Sonarr is running and its address in Steerarr's settings is right.",
      },
    });
  });

  it('maps a rejected API key to 502 upstream_auth, never 401', async () => {
    const res = await statusWith(() => new Response('Unauthorized', { status: 401 }));
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { code: 'upstream_auth' } });
    expect(res.body).not.toContain(sonarrSettings.apiKey);
  });

  it('explains a redirect (e.g. to a login page) as a 502', async () => {
    const res = await statusWith(
      () => new Response(null, { status: 302, headers: { Location: '/login' } }),
    );
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: { code: 'upstream_error', message: expect.stringContaining('login page') },
    });
  });

  it('explains a non-JSON 404 as a wrong address or URL base', async () => {
    const res = await statusWith(() => new Response('Not Found', { status: 404 }));
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: {
        code: 'upstream_error',
        message: expect.stringContaining('URL base such as /sonarr'),
      },
    });
  });

  it('keeps a JSON 404 from Sonarr as not_found', async () => {
    const res = await statusWith(() => Response.json({ message: 'NotFound' }, { status: 404 }));
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('passes Sonarr validation errors through as 400 with details', async () => {
    const res = await statusWith(() =>
      Response.json([{ propertyName: 'Path', errorMessage: 'Path is invalid' }], { status: 400 }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'bad_request',
        message: 'Path is invalid',
        details: [{ propertyName: 'Path', errorMessage: 'Path is invalid' }],
      },
    });
  });
});
