import { afterEach, describe, expect, it } from 'vitest';
import { apiKeyHeader, cleanup, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

function seriesResource(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    title: 'The Expanse',
    sortTitle: 'expanse',
    year: 2015,
    status: 'ended',
    monitored: true,
    network: 'Prime Video',
    overview: 'Not passed through',
    path: '/tv/The Expanse',
    images: [
      { coverType: 'banner', url: '/MediaCover/12/banner.jpg?lastWrite=1' },
      { coverType: 'poster', url: '/MediaCover/12/poster.jpg?lastWrite=638700000000000000' },
    ],
    statistics: {
      seasonCount: 6,
      episodeFileCount: 60,
      episodeCount: 62,
      totalEpisodeCount: 62,
      sizeOnDisk: 123456789,
      percentOfEpisodes: 96.8,
    },
    ...overrides,
  };
}

describe('GET /api/sonarr/series', () => {
  it('returns trimmed series sorted by sort title', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith('/qualityprofile')) {
        return Response.json([{ id: 4, name: 'HD-1080p' }]);
      }
      return Response.json([
        seriesResource({ qualityProfileId: 4 }),
        seriesResource({
          id: 3,
          title: 'Andor',
          sortTitle: 'andor',
          status: 'continuing',
          network: '',
          images: [],
          nextAiring: '2026-12-01T02:00:00Z',
          statistics: undefined,
        }),
      ]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series' });

    expect(res.statusCode).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://sonarr.lan:8989/api/v3/series');
    expect(res.json()).toEqual([
      {
        id: 3,
        title: 'Andor',
        year: 2015,
        status: 'continuing',
        monitored: true,
        network: null,
        qualityProfile: null,
        posterUrl: null,
        seasonCount: 0,
        episodeFileCount: 0,
        episodeCount: 0,
        sizeOnDisk: 0,
        nextAiring: '2026-12-01T02:00:00Z',
      },
      {
        id: 12,
        title: 'The Expanse',
        year: 2015,
        status: 'ended',
        monitored: true,
        network: 'Prime Video',
        qualityProfile: 'HD-1080p',
        posterUrl: 'api/sonarr/series/12/poster?v=638700000000000000',
        seasonCount: 6,
        episodeFileCount: 60,
        episodeCount: 62,
        sizeOnDisk: 123456789,
        nextAiring: null,
      },
    ]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('leaves out unmonitored series when asked to', async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith('/qualityprofile')) return Response.json([]);
      return Response.json([seriesResource(), seriesResource({ id: 3, monitored: false })]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const all = await app.inject({ url: '/api/sonarr/series' });
    const monitored = await app.inject({ url: '/api/sonarr/series?monitored=true' });
    expect(all.json()).toHaveLength(2);
    expect(monitored.json().map((item: { id: number }) => item.id)).toEqual([12]);
    expect((await app.inject({ url: '/api/sonarr/series?monitored=yes' })).statusCode).toBe(400);
  });

  it('answers 503 until Sonarr is set up', async () => {
    const { app } = await startApp();
    expect((await app.inject({ url: '/api/sonarr/series' })).statusCode).toBe(503);
  });
});

describe('GET /api/sonarr/series/:id/poster', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  it("streams Sonarr's 250px poster with the API key, cached when versioned", async () => {
    const fetchMock = stubFetch(
      () => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }),
    );
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12/poster?v=638700000000000000' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(res.rawPayload.equals(jpeg)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://sonarr.lan:8989/api/v3/mediacover/12/poster-250.jpg');
    expect(apiKeyHeader(init)).toBe(sonarrSettings.apiKey);
  });

  it('caches an unversioned poster for a day only', async () => {
    stubFetch(() => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12/poster' });
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
  });

  it('answers 404 when Sonarr has no poster', async () => {
    stubFetch(() => new Response('Not Found', { status: 404 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12/poster' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it("refuses to serve or cache something that isn't an image", async () => {
    stubFetch(
      () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12/poster?v=1' });
    expect(res.statusCode).toBe(502);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ error: { code: 'upstream_error' } });
  });

  it('rejects an invalid series id without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => new Response(jpeg));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const id of ['abc', '0', '-1', '1.5']) {
      expect((await app.inject({ url: `/api/sonarr/series/${id}/poster` })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a rejected key to 502, never 401', async () => {
    stubFetch(() => new Response('Unauthorized', { status: 401 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12/poster' });
    expect(res.statusCode).toBe(502);
  });
});

describe('DELETE /api/sonarr/series/:id', () => {
  it('removes the series, keeping files unless asked, and can exclude it from lists', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const keep = await app.inject({ method: 'DELETE', url: '/api/sonarr/series/12' });
    const all = await app.inject({
      method: 'DELETE',
      url: '/api/sonarr/series/12?deleteFiles=true&exclude=true',
    });
    expect([keep.statusCode, all.statusCode]).toEqual([204, 204]);
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${String(url)}`)).toEqual([
      'DELETE http://sonarr.lan:8989/api/v3/series/12?deleteFiles=false&addImportListExclusion=false',
      'DELETE http://sonarr.lan:8989/api/v3/series/12?deleteFiles=true&addImportListExclusion=true',
    ]);
  });

  it('rejects bad input without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const url of ['/api/sonarr/series/abc', '/api/sonarr/series/12?deleteFiles=yes']) {
      expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
