import { afterEach, describe, expect, it } from 'vitest';
import { apiKeyHeader, cleanup, radarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const base = 'http://radarr.lan:7878/api/v3';
const json = (body: unknown, status = 200) => Response.json(body, { status });
const saved = { radarr: radarrSettings };

function movie(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: 'Dune: Part Two',
    sortTitle: 'dune part two',
    year: 2024,
    status: 'released',
    monitored: true,
    overview: 'Paul Atreides unites with the Fremen.',
    studio: 'Legendary Pictures',
    certification: 'PG-13',
    genres: ['Science Fiction', 'Adventure'],
    images: [{ coverType: 'poster', url: '/MediaCover/7/poster.jpg?lastWrite=638400' }],
    hasFile: true,
    isAvailable: true,
    minimumAvailability: 'released',
    qualityProfileId: 4,
    runtime: 167,
    inCinemas: '2024-02-27T00:00:00Z',
    digitalRelease: '2024-04-16T00:00:00Z',
    physicalRelease: '2024-05-14T00:00:00Z',
    path: '/movies/Dune Part Two (2024)',
    movieFile: {
      id: 70,
      size: 30_000_000_000,
      relativePath: 'Dune.Part.Two.2024.2160p.mkv',
      quality: { quality: { name: 'Bluray-2160p' } },
    },
    statistics: { movieFileCount: 1, sizeOnDisk: 30_000_000_000 },
    ...overrides,
  };
}

describe('GET /api/radarr/movies', () => {
  it('returns trimmed movies sorted by sort title, with the API key sent', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith('/qualityprofile')) return json([{ id: 4, name: 'UHD' }]);
      return json([
        movie(),
        movie({
          id: 3,
          title: 'Arrival',
          sortTitle: 'arrival',
          images: [],
          monitored: false,
          movieFile: null,
          statistics: { movieFileCount: 1, movieFileQualities: [{ name: 'WEBDL-1080p' }] },
        }),
      ]);
    });
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/movies' });

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${base}/movie`);
    expect(apiKeyHeader(init)).toBe('radarr-key');
    const body = res.json();
    expect(body.map((item: { title: string }) => item.title)).toEqual([
      'Arrival',
      'Dune: Part Two',
    ]);
    expect(body[1]).toEqual({
      id: 7,
      title: 'Dune: Part Two',
      year: 2024,
      status: 'released',
      monitored: true,
      studio: 'Legendary Pictures',
      posterUrl: 'api/radarr/movies/7/poster?v=638400',
      hasFile: true,
      quality: 'Bluray-2160p',
      qualityProfile: 'UHD',
      isAvailable: true,
      sizeOnDisk: 30_000_000_000,
      runtime: 167,
      inCinemas: '2024-02-27T00:00:00Z',
      digitalRelease: '2024-04-16T00:00:00Z',
      physicalRelease: '2024-05-14T00:00:00Z',
    });
    expect(body[0]).toMatchObject({ posterUrl: null, quality: 'WEBDL-1080p', monitored: false });

    const monitoredOnly = await app.inject({ url: '/api/radarr/movies?monitored=true' });
    expect(monitoredOnly.json().map((item: { id: number }) => item.id)).toEqual([7]);
  });
});

describe('GET /api/radarr/movies/:id', () => {
  it('adds the overview, file and quality profile name', async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith('/qualityprofile')) return json([{ id: 4, name: 'UHD' }]);
      return json(movie());
    });
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/movies/7' });

    expect(res.json()).toMatchObject({
      overview: 'Paul Atreides unites with the Fremen.',
      certification: 'PG-13',
      genres: ['Science Fiction', 'Adventure'],
      minimumAvailability: 'released',
      qualityProfile: 'UHD',
      file: {
        quality: 'Bluray-2160p',
        size: 30_000_000_000,
        relativePath: 'Dune.Part.Two.2024.2160p.mkv',
      },
    });
  });
});

describe('PUT /api/radarr/movies/:id/monitored', () => {
  it('saves the whole movie with monitoring changed and files left in place', async () => {
    const raw = { ...movie(), extra: 'kept' };
    const fetchMock = stubFetch((_url, init) => json(init.method === 'PUT' ? {} : raw));
    const { app } = await startApp(saved);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/radarr/movies/7/monitored',
      payload: { monitored: false },
    });

    expect(res.statusCode).toBe(204);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe(`${base}/movie/7?moveFiles=false`);
    expect(JSON.parse(String(init.body))).toEqual({ ...raw, monitored: false });
  });
});

describe('DELETE /api/radarr/movies/:id/file', () => {
  it("deletes the movie's file and keeps it monitored", async () => {
    let monitored = true;
    const fetchMock = stubFetch((_url, init) => {
      if (init.method === 'DELETE') {
        monitored = false; // As Radarr does with "Unmonitor Deleted Movies" on.
        return new Response(null, { status: 200 });
      }
      if (init.method === 'PUT') return json({});
      return json(movie({ monitored }));
    });
    const { app } = await startApp(saved);
    const res = await app.inject({ method: 'DELETE', url: '/api/radarr/movies/7/file' });

    expect(res.statusCode).toBe(204);
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${String(url)}`);
    expect(calls).toEqual([
      `GET ${base}/movie/7`,
      `DELETE ${base}/moviefile/70`,
      `GET ${base}/movie/7`,
      `PUT ${base}/movie/7?moveFiles=false`,
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[3]![1].body)).monitored).toBe(true);
  });

  it('says so when there is no file', async () => {
    stubFetch(() => json(movie({ hasFile: false, movieFile: null })));
    const { app } = await startApp(saved);
    const res = await app.inject({ method: 'DELETE', url: '/api/radarr/movies/7/file' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('This movie has no file to delete.');
  });
});

describe('searches', () => {
  it('starts a movie search and reports how it ends', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith('/command')) return json({ id: 50, status: 'queued' });
      return json({ id: 50, status: 'completed', result: 'successful', message: 'Done' });
    });
    const { app } = await startApp(saved);

    const started = await app.inject({ method: 'POST', url: '/api/radarr/movies/7/search' });
    expect(started.json()).toEqual({ id: 50, done: false, succeeded: false, message: null });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual({
      name: 'MoviesSearch',
      movieIds: [7],
    });

    const finished = await app.inject({ url: '/api/radarr/commands/50' });
    expect(finished.json()).toEqual({ id: 50, done: true, succeeded: true, message: 'Done' });
  });

  it("runs Radarr's Search all for each wanted list", async () => {
    const fetchMock = stubFetch(() => json({ id: 51, status: 'queued' }));
    const { app } = await startApp(saved);
    await app.inject({ method: 'POST', url: '/api/radarr/wanted/missing/search' });
    await app.inject({ method: 'POST', url: '/api/radarr/wanted/cutoff/search' });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies).toEqual([
      { name: 'MissingMoviesSearch', monitored: true },
      { name: 'CutoffUnmetMoviesSearch', monitored: true },
    ]);
  });
});

describe('releases', () => {
  it('lists what the indexers have, without releases that cannot be grabbed', async () => {
    const fetchMock = stubFetch(() =>
      json([
        {
          guid: 'g1',
          indexerId: 2,
          indexer: 'NZBgeek',
          title: 'Dune.Part.Two.2024.2160p',
          quality: { quality: { name: 'WEBDL-2160p' } },
          size: 20,
          ageHours: 30,
          protocol: 'usenet',
          seeders: 5,
          languages: [{ name: 'English' }],
          customFormats: [{ name: 'HDR' }],
          customFormatScore: 100,
          approved: true,
          rejections: [],
          downloadAllowed: true,
        },
        { guid: null, indexerId: 2, size: 1, ageHours: 1, protocol: 'usenet', approved: false },
      ]),
    );
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/movies/7/releases' });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${base}/release?movieId=7`);
    expect(res.json()).toEqual([
      {
        guid: 'g1',
        indexerId: 2,
        indexer: 'NZBgeek',
        title: 'Dune.Part.Two.2024.2160p',
        quality: 'WEBDL-2160p',
        size: 20,
        ageHours: 30,
        protocol: 'usenet',
        seeders: null,
        leechers: null,
        languages: ['English'],
        customFormats: ['HDR'],
        customFormatScore: 100,
        approved: true,
        rejections: [],
        downloadAllowed: true,
      },
    ]);
  });

  it('explains an expired search result', async () => {
    stubFetch(() => json({ message: 'not found' }, 404));
    const { app } = await startApp(saved);
    const res = await app.inject({
      method: 'POST',
      url: '/api/radarr/releases',
      payload: { guid: 'g1', indexerId: 2 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/expired/);
  });
});

describe('adding a movie', () => {
  const lookup = {
    tmdbId: 693134,
    title: 'Dune: Part Two',
    year: 2024,
    status: 'released',
    studio: 'Legendary Pictures',
    overview: 'Paul Atreides unites with the Fremen.',
    runtime: 167,
    remotePoster: 'https://image.tmdb.org/p.jpg',
    images: [],
  };

  it('searches TMDb through Radarr', async () => {
    stubFetch(() => json([lookup, { ...lookup, tmdbId: 438631, id: 9, remotePoster: 'http://x' }]));
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/lookup?term=dune' });
    expect(res.json()).toEqual([
      {
        tmdbId: 693134,
        title: 'Dune: Part Two',
        year: 2024,
        status: 'released',
        studio: 'Legendary Pictures',
        overview: 'Paul Atreides unites with the Fremen.',
        runtime: 167,
        posterUrl: 'https://image.tmdb.org/p.jpg',
        existingId: null,
      },
      expect.objectContaining({ tmdbId: 438631, posterUrl: null, existingId: 9 }),
    ]);
  });

  it('adds it from a fresh lookup with the chosen options', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith('/lookup')) return json([lookup]);
      return json({ ...movie(), id: 12 }, 201);
    });
    const { app } = await startApp(saved);
    const res = await app.inject({
      method: 'POST',
      url: '/api/radarr/movies',
      payload: {
        tmdbId: 693134,
        qualityProfileId: 4,
        rootFolderPath: '/movies',
        monitored: true,
        minimumAvailability: 'released',
        search: true,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 12 });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${base}/movie/lookup?term=tmdb%3A693134`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1].body))).toEqual({
      ...lookup,
      qualityProfileId: 4,
      rootFolderPath: '/movies',
      monitored: true,
      minimumAvailability: 'released',
      addOptions: { monitor: 'movieOnly', searchForMovie: true },
    });
  });

  it('refuses a movie Radarr already has, and bad input', async () => {
    stubFetch(() => json([{ ...lookup, id: 9 }]));
    const { app } = await startApp(saved);
    const payload = {
      tmdbId: 693134,
      qualityProfileId: 4,
      rootFolderPath: '/movies',
      monitored: true,
      minimumAvailability: 'released',
      search: false,
    };
    const existing = await app.inject({ method: 'POST', url: '/api/radarr/movies', payload });
    expect(existing.json().error.message).toBe('Radarr already has this movie.');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/radarr/movies',
      payload: { ...payload, minimumAvailability: 'whenever' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('activity and wanted', () => {
  it('lists the queue with the movie each download is for', async () => {
    const fetchMock = stubFetch(() =>
      json({
        page: 1,
        pageSize: 200,
        totalRecords: 1,
        records: [
          {
            id: 4,
            movieId: 7,
            movie: { title: 'Dune: Part Two', year: 2024 },
            quality: { quality: { name: 'WEBDL-2160p' } },
            size: 100,
            sizeleft: 25,
            timeleft: '00:10:00',
            title: 'Dune.Part.Two.2024.2160p',
            status: 'downloading',
            trackedDownloadStatus: 'ok',
            trackedDownloadState: 'downloading',
            protocol: 'usenet',
            downloadClient: 'NZBGet',
            indexer: 'NZBgeek',
          },
        ],
      }),
    );
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/queue' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${base}/queue?page=1&pageSize=200&includeMovie=true`,
    );
    expect(res.json()[0]).toMatchObject({
      movieId: 7,
      movieTitle: 'Dune: Part Two',
      movieYear: 2024,
      sizeLeft: 25,
      timeLeft: 600,
      health: 'ok',
    });
  });

  it('pages through history in plain terms', async () => {
    stubFetch(() =>
      json({
        page: 1,
        pageSize: 50,
        totalRecords: 2,
        records: [
          {
            id: 1,
            movieId: 7,
            movie: { title: 'Dune: Part Two' },
            sourceTitle: 'Dune.Part.Two.2024.2160p',
            quality: { quality: { name: 'WEBDL-2160p' } },
            date: '2026-11-20T10:00:00Z',
            eventType: 'grabbed',
            data: { indexer: 'NZBgeek' },
          },
          {
            id: 2,
            movieId: 7,
            date: 'x',
            eventType: 'movieFileDeleted',
            data: { reason: 'Upgrade' },
          },
        ],
      }),
    );
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/history?page=1' });
    const records = res.json().records;
    expect(records[0]).toMatchObject({ event: 'grabbed', detail: 'From NZBgeek' });
    expect(records[1]).toMatchObject({ event: 'deleted', detail: 'Replaced by a better file' });
  });

  it('lists wanted movies with when they came out and the current quality for cutoff', async () => {
    const fetchMock = stubFetch(() =>
      // As the live Radarr sends wanted lists: no movieFile, the quality in statistics.
      json({
        page: 1,
        pageSize: 50,
        totalRecords: 1,
        records: [
          movie({
            movieFile: undefined,
            statistics: { movieFileCount: 1, movieFileQualities: [{ name: 'Bluray-2160p' }] },
          }),
        ],
      }),
    );
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/wanted/cutoff' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${base}/wanted/cutoff?page=1&pageSize=50&sortKey=movieMetadata.sortTitle&sortDirection=ascending&monitored=true`,
    );
    expect(res.json().records[0]).toEqual({
      id: 7,
      title: 'Dune: Part Two',
      year: 2024,
      posterUrl: 'api/radarr/movies/7/poster?v=638400',
      quality: 'Bluray-2160p',
      releasedOn: '2024-02-27T00:00:00.000Z',
    });
  });
});

describe('GET /api/radarr/calendar', () => {
  it('lists each release in the range, by date', async () => {
    const calendar = [
      movie({
        id: 1,
        title: 'Zootopia 2',
        hasFile: false,
        inCinemas: '2026-11-26T00:00:00Z',
        digitalRelease: '2027-01-10T00:00:00Z',
        physicalRelease: null,
      }),
      movie({
        id: 2,
        title: 'Wicked: For Good',
        hasFile: false,
        inCinemas: '2026-11-21T00:00:00Z',
        digitalRelease: '2026-12-02T00:00:00Z',
      }),
    ];
    const queue = { records: [{ id: 9, movieId: 2, size: 1, sizeleft: 1, status: 'downloading' }] };
    const fetchMock = stubFetch((url) =>
      json(url.pathname.endsWith('/calendar') ? calendar : queue),
    );
    const { app } = await startApp(saved);
    const res = await app.inject({
      url: '/api/radarr/calendar?start=2026-11-22T05:00:00Z&end=2026-12-06T05:00:00Z',
    });

    const calendarUrl = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((u) => u.includes('calendar'));
    expect(calendarUrl).toBe(
      `${base}/calendar?start=2026-11-22T05%3A00%3A00.000Z&end=2026-12-06T05%3A00%3A00.000Z&unmonitored=false`,
    );
    expect(res.json()).toEqual([
      expect.objectContaining({ movieId: 1, kind: 'cinemas', date: '2026-11-26T00:00:00.000Z' }),
      expect.objectContaining({
        movieId: 2,
        kind: 'digital',
        date: '2026-12-02T00:00:00.000Z',
        downloading: true,
      }),
    ]);
  });

  it('rejects a bad range without calling Radarr', async () => {
    const fetchMock = stubFetch(() => json([]));
    const { app } = await startApp(saved);
    const res = await app.inject({
      url: '/api/radarr/calendar?start=2026-01-01T00:00:00Z&end=2026-06-01T00:00:00Z',
    });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('summary and status', () => {
  const responses: Record<string, unknown> = {
    '/api/v3/system/status': {
      appName: 'Radarr',
      instanceName: 'Radarr',
      version: '7.0.3.10918',
      branch: 'master',
      startTime: '2026-11-20T10:00:00Z',
    },
    '/api/v3/health': [
      { source: 'UpdateCheck', type: 'notice', message: 'Update available' },
      { source: 'IndexerStatusCheck', type: 'warning', message: 'Indexers unavailable' },
    ],
    '/api/v3/queue/status': { totalCount: 2, count: 2 },
    '/api/v3/wanted/missing': { page: 1, pageSize: 1, totalRecords: 1, records: [] },
    '/api/v3/rootfolder': [{ id: 1, path: '/mnt/user/Movies', accessible: true, freeSpace: 5 }],
    '/api/v3/diskspace': [{ path: '/mnt/user', freeSpace: 5, totalSpace: 50 }],
  };

  it('fills the Home card', async () => {
    stubFetch((url) => json(responses[url.pathname]));
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/summary' });
    expect(res.json()).toEqual({
      version: '7.0.3.10918',
      facts: ['2 downloads in the queue', '1 missing movie'],
      issues: [{ level: 'warning', message: 'Indexers unavailable' }],
    });
  });

  it('fills the status page', async () => {
    stubFetch((url) => json(responses[url.pathname]));
    const { app } = await startApp(saved);
    const res = await app.inject({ url: '/api/radarr/status' });
    expect(res.json()).toEqual({
      version: '7.0.3.10918',
      branch: 'master',
      startTime: '2026-11-20T10:00:00Z',
      health: [
        {
          source: 'IndexerStatusCheck',
          level: 'warning',
          message: 'Indexers unavailable',
          wikiUrl: null,
        },
        { source: 'UpdateCheck', level: 'notice', message: 'Update available', wikiUrl: null },
      ],
      rootFolders: [{ path: '/mnt/user/Movies', accessible: true, freeSpace: 5, totalSpace: 50 }],
    });
  });
});

describe('DELETE /api/radarr/movies/:id', () => {
  it('removes the movie, keeping files unless asked, and can exclude it from lists', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const { app } = await startApp(saved);
    const keep = await app.inject({ method: 'DELETE', url: '/api/radarr/movies/7' });
    const all = await app.inject({
      method: 'DELETE',
      url: '/api/radarr/movies/7?deleteFiles=true&exclude=true',
    });
    expect([keep.statusCode, all.statusCode]).toEqual([204, 204]);
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${String(url)}`)).toEqual([
      `DELETE ${base}/movie/7?deleteFiles=false&addImportExclusion=false`,
      `DELETE ${base}/movie/7?deleteFiles=true&addImportExclusion=true`,
    ]);
  });

  it('rejects bad input without calling Radarr', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const { app } = await startApp(saved);
    for (const url of ['/api/radarr/movies/abc', '/api/radarr/movies/7?exclude=maybe']) {
      expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
