import { afterEach, describe, expect, it } from 'vitest';
import { apiKeyHeader, cleanup, prowlarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const base = 'http://prowlarr.lan:9696/api/v1';
const json = (body: unknown, status = 200) => Response.json(body, { status });
const saved = { prowlarr: prowlarrSettings };

describe('GET /api/prowlarr/search', () => {
  it('searches the chosen indexers and categories and trims the results', async () => {
    const published = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const fetchMock = stubFetch(() =>
      json([
        {
          guid: 'https://indexer/details/1',
          indexerId: 4,
          indexer: 'NZBgeek',
          title: 'Dune.Part.Two.2024.2160p',
          size: 20_000,
          publishDate: published,
          protocol: 'usenet',
          seeders: 9,
          grabs: 120,
          categories: [{ id: 2045, name: 'Movies/UHD' }],
          infoUrl: 'https://indexer/details/1',
          downloadUrl: 'https://indexer/get/1?apikey=secret',
        },
        {
          guid: 'magnet-1',
          indexerId: 7,
          indexer: 'Torrents',
          title: 'Dune.Part.Two.2024.1080p',
          size: 8_000,
          ageHours: 30,
          protocol: 'torrent',
          seeders: 50,
          leechers: 3,
          categories: [],
          infoUrl: 'http://insecure',
        },
        { guid: null, indexerId: 7, protocol: 'torrent' },
      ]),
    );
    const { app } = await startApp(saved);
    const res = await app.inject({
      url: '/api/prowlarr/search?query=dune&kind=movies&indexers=4,7',
    });

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      `${base}/search?query=dune&type=search&indexerIds=4&indexerIds=7&categories=2000&limit=100&offset=0`,
    );
    expect(apiKeyHeader(init)).toBe('prowlarr-key');
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      guid: 'https://indexer/details/1',
      indexerId: 4,
      indexer: 'NZBgeek',
      title: 'Dune.Part.Two.2024.2160p',
      size: 20_000,
      protocol: 'usenet',
      seeders: null,
      leechers: null,
      grabs: 120,
      categories: ['Movies/UHD'],
      infoUrl: 'https://indexer/details/1',
    });
    expect(body[0].ageHours).toBeCloseTo(5, 1);
    expect(body[0]).not.toHaveProperty('downloadUrl');
    expect(body[1]).toMatchObject({ seeders: 50, leechers: 3, ageHours: 30, infoUrl: null });
  });

  it('searches everything by default', async () => {
    const fetchMock = stubFetch(() => json([]));
    const { app } = await startApp(saved);
    await app.inject({ url: '/api/prowlarr/search?query=dune' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${base}/search?query=dune&type=search&limit=100&offset=0`,
    );
  });

  it('rejects an empty query or bad filters without calling Prowlarr', async () => {
    const fetchMock = stubFetch(() => json([]));
    const { app } = await startApp(saved);
    for (const url of [
      '/api/prowlarr/search?query=%20',
      '/api/prowlarr/search?query=x&kind=games',
      '/api/prowlarr/search?query=x&indexers=1;2',
    ]) {
      expect((await app.inject({ url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/prowlarr/grab', () => {
  it('sends the result to the chosen download client', async () => {
    const fetchMock = stubFetch(() => json({}));
    const { app } = await startApp(saved);
    const res = await app.inject({
      method: 'POST',
      url: '/api/prowlarr/grab',
      payload: { guid: 'g1', indexerId: 4, downloadClientId: 2 },
    });
    expect(res.statusCode).toBe(204);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(`${init.method} ${String(url)}`).toBe(`POST ${base}/search`);
    expect(JSON.parse(String(init.body))).toEqual({
      guid: 'g1',
      indexerId: 4,
      downloadClientId: 2,
    });
  });

  it('explains a result Prowlarr no longer has', async () => {
    stubFetch(() => json({ message: 'not found' }, 404));
    const { app } = await startApp(saved);
    const res = await app.inject({
      method: 'POST',
      url: '/api/prowlarr/grab',
      payload: { guid: 'g1', indexerId: 4 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Search again/);
  });
});

describe('indexers, download clients, summary and status', () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const responses: Record<string, unknown> = {
    '/api/v1/system/status': {
      appName: 'Prowlarr',
      instanceName: 'Prowlarr',
      version: '2.1.5',
      branch: 'master',
      startTime: '2026-11-20T10:00:00Z',
    },
    '/api/v1/indexer': [
      { id: 7, name: 'Torrents', enable: true, protocol: 'torrent', privacy: 'public' },
      { id: 4, name: 'NZBgeek', enable: true, protocol: 'usenet', privacy: 'private' },
      { id: 9, name: 'Old', enable: false, protocol: 'usenet' },
    ],
    '/api/v1/indexerstatus': [
      { indexerId: 7, disabledTill: future, mostRecentFailure: '2026-11-21T09:00:00Z' },
    ],
    '/api/v1/downloadclient': [
      { id: 1, name: 'NZBGet', enable: true, protocol: 'usenet' },
      { id: 2, name: 'qBittorrent', enable: false, protocol: 'torrent' },
    ],
    '/api/v1/health': [
      { source: 'IndexerStatusCheck', type: 'warning', message: 'Indexers unavailable' },
    ],
  };

  it('lists indexers by name with any pause after failures', async () => {
    stubFetch((url) => json(responses[url.pathname]));
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/prowlarr/indexers' });
    expect(res.json().map((item: { name: string }) => item.name)).toEqual([
      'NZBgeek',
      'Old',
      'Torrents',
    ]);
    expect(res.json()[2]).toEqual({
      id: 7,
      name: 'Torrents',
      enabled: true,
      protocol: 'torrent',
      privacy: 'public',
      disabledUntil: future,
      lastFailure: '2026-11-21T09:00:00Z',
    });
  });

  it('lists only enabled download clients', async () => {
    stubFetch((url) => json(responses[url.pathname]));
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/prowlarr/download-clients' });
    expect(res.json()).toEqual([{ id: 1, name: 'NZBGet', protocol: 'usenet' }]);
  });

  it('fills the Home card and the status page', async () => {
    stubFetch((url) => json(responses[url.pathname]));
    const { app } = await startApp(saved);
    const summary = await app.inject({ url: '/api/prowlarr/summary' });
    expect(summary.json()).toEqual({
      version: '2.1.5',
      facts: ['2 indexers enabled', '1 paused after failures'],
      issues: [{ level: 'warning', message: 'Indexers unavailable' }],
    });
    const status = await app.inject({ url: '/api/prowlarr/status' });
    expect(status.json()).toEqual({
      version: '2.1.5',
      branch: 'master',
      startTime: '2026-11-20T10:00:00Z',
      health: [
        {
          source: 'IndexerStatusCheck',
          level: 'warning',
          message: 'Indexers unavailable',
          wikiUrl: null,
        },
      ],
    });
  });
});
