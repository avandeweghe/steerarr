import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const base = 'http://sonarr.lan:8989/api/v3';
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** A raw Sonarr series, with fields Steerarr doesn't use but must send back unchanged. */
function rawSeries() {
  return {
    id: 12,
    title: 'The Expanse',
    sortTitle: 'expanse',
    year: 2015,
    status: 'ended',
    monitored: true,
    overview: 'Humanity has colonized the solar system.',
    network: 'Prime Video',
    path: '/tv/The Expanse',
    qualityProfileId: 4,
    tags: [2],
    images: [],
    seasons: [
      { seasonNumber: 0, monitored: false, statistics: stats(0, 0, 3) },
      { seasonNumber: 1, monitored: true, statistics: stats(10, 10, 10) },
      { seasonNumber: 2, monitored: true, statistics: stats(12, 13, 13) },
    ],
    statistics: {
      seasonCount: 2,
      episodeFileCount: 22,
      episodeCount: 23,
      totalEpisodeCount: 26,
      sizeOnDisk: 5000,
      percentOfEpisodes: 95.6,
    },
  };
}

function stats(files: number, want: number, total: number) {
  return {
    episodeFileCount: files,
    episodeCount: want,
    totalEpisodeCount: total,
    sizeOnDisk: files * 100,
    percentOfEpisodes: 0,
  };
}

function rawEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    seriesId: 12,
    tvdbId: 9,
    episodeFileId: 0,
    seasonNumber: 1,
    episodeNumber: 1,
    title: 'Dulcinea',
    overview: 'Ice hauler.',
    airDateUtc: '2015-12-15T02:00:00Z',
    monitored: true,
    hasFile: false,
    ...overrides,
  };
}

function rawRelease(overrides: Record<string, unknown> = {}) {
  return {
    guid: 'https://indexer.example/nzb/1',
    indexerId: 3,
    indexer: 'NZBgeek',
    title: 'The.Expanse.S02E01.1080p.WEB.h264',
    quality: { quality: { id: 3, name: 'WEBDL-1080p' }, revision: { version: 1 } },
    size: 2_000_000_000,
    ageHours: 30.5,
    protocol: 'usenet',
    seeders: null,
    leechers: null,
    languages: [{ id: 1, name: 'English' }],
    customFormats: [{ id: 5, name: 'x264' }],
    customFormatScore: 10,
    fullSeason: false,
    approved: true,
    rejections: [],
    downloadAllowed: true,
    downloadUrl: 'https://indexer.example/nzb/1?apikey=indexer-secret',
    ...overrides,
  };
}

describe('GET /api/sonarr/series/:id', () => {
  it('combines the series and its episodes, newest season first and specials last', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v3/series/12') return json(rawSeries());
      return json([
        rawEpisode({ id: 202, seasonNumber: 2, episodeNumber: 1, title: '' }),
        rawEpisode({
          id: 102,
          episodeNumber: 2,
          hasFile: true,
          episodeFile: { size: 900, quality: { quality: { name: 'Bluray-1080p' } } },
        }),
        rawEpisode(),
      ]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12' });

    expect(res.statusCode).toBe(200);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${base}/episode?seriesId=12&includeEpisodeFile=true`);

    const body = res.json();
    expect(body).toMatchObject({
      id: 12,
      title: 'The Expanse',
      overview: 'Humanity has colonized the solar system.',
      episodeFileCount: 22,
      episodeCount: 23,
    });
    expect(body).not.toHaveProperty('path');
    expect(body.seasons.map((s: { seasonNumber: number }) => s.seasonNumber)).toEqual([2, 1, 0]);
    expect(body.seasons[0]).toEqual({
      seasonNumber: 2,
      monitored: true,
      episodeFileCount: 12,
      episodeCount: 13,
      totalEpisodeCount: 13,
      sizeOnDisk: 1200,
    });
    expect(body.episodes.map((e: { id: number }) => e.id)).toEqual([101, 102, 202]);
    expect(body.episodes[1]).toEqual({
      id: 102,
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'Dulcinea',
      overview: 'Ice hauler.',
      airDateUtc: '2015-12-15T02:00:00Z',
      monitored: true,
      hasFile: true,
      quality: 'Bluray-1080p',
      size: 900,
    });
    expect(body.episodes[0]).toMatchObject({ quality: null, size: null });
    expect(body.episodes[2]).toMatchObject({ title: null });
  });

  it("passes on Sonarr's 404 for a series that doesn't exist", async () => {
    stubFetch(() => json({ message: 'NotFound' }, 404));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/99' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('monitoring', () => {
  it('sends the whole series back with only monitored changed', async () => {
    const fetchMock = stubFetch(() => json(rawSeries()));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/series/12/monitored',
      payload: { monitored: false },
    });

    expect(res.statusCode).toBe(204);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(init.method).toBe('PUT');
    expect(String(url)).toBe(`${base}/series/12?moveFiles=false`);
    expect(JSON.parse(String(init.body))).toEqual({ ...rawSeries(), monitored: false });
  });

  it('changes one season and leaves the others alone', async () => {
    const fetchMock = stubFetch(() => json(rawSeries()));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/series/12/seasons/0/monitored',
      payload: { monitored: true },
    });

    expect(res.statusCode).toBe(204);
    const sent = JSON.parse(String(fetchMock.mock.calls[1]![1].body));
    const expected = rawSeries();
    expected.seasons[0]!.monitored = true;
    expect(sent).toEqual(expected);
  });

  it("answers 404 for a season the series doesn't have, without saving", async () => {
    const fetchMock = stubFetch(() => json(rawSeries()));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/series/12/seasons/7/monitored',
      payload: { monitored: true },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'not_found', message: 'This series has no season 7.' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('changes one episode', async () => {
    const fetchMock = stubFetch(() => json([rawEpisode({ monitored: false })], 202));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sonarr/episodes/101/monitored',
      payload: { monitored: false },
    });

    expect(res.statusCode).toBe(204);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${base}/episode/monitor`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ episodeIds: [101], monitored: false });
  });

  it('rejects a bad body or id without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => json(rawSeries()));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const bad = [
      { url: '/api/sonarr/series/12/monitored', payload: { monitored: 'yes' } },
      { url: '/api/sonarr/series/12/monitored', payload: {} },
      { url: '/api/sonarr/series/0/monitored', payload: { monitored: true } },
      { url: '/api/sonarr/series/12/seasons/-1/monitored', payload: { monitored: true } },
      { url: '/api/sonarr/episodes/abc/monitored', payload: { monitored: true } },
    ];
    for (const { url, payload } of bad) {
      const res = await app.inject({ method: 'PUT', url, payload });
      expect(res.statusCode, url).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('searches', () => {
  it('starts a season search', async () => {
    const command = { id: 55, name: 'SeasonSearch', status: 'queued', result: 'unknown' };
    const fetchMock = stubFetch(() => json(command, 201));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'POST', url: '/api/sonarr/series/12/seasons/2/search' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 55, done: false, succeeded: false, message: null });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${base}/command`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'SeasonSearch',
      seriesId: 12,
      seasonNumber: 2,
    });
  });

  it('starts an episode search', async () => {
    const fetchMock = stubFetch(() => json({ id: 56, status: 'started' }, 201));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'POST', url: '/api/sonarr/episodes/101/search' });

    expect(res.json()).toMatchObject({ id: 56, done: false });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual({
      name: 'EpisodeSearch',
      episodeIds: [101],
    });
  });

  it.each([
    ['completed', 'successful', true],
    ['completed', 'unknown', true],
    ['completed', 'unsuccessful', false],
    ['failed', 'unsuccessful', false],
    ['aborted', 'unknown', false],
  ])('reports a %s / %s command as done (succeeded: %s)', async (status, result, succeeded) => {
    const message = 'Season search completed. 1 reports downloaded.';
    stubFetch(() => json({ id: 55, status, result, message }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/commands/55' });

    expect(res.json()).toEqual({ id: 55, done: true, succeeded, message });
  });
});

describe('releases', () => {
  it('searches for an episode and trims each release', async () => {
    const releases = [
      rawRelease(),
      rawRelease({
        guid: 'magnet-ish',
        protocol: 'torrent',
        seeders: 40,
        leechers: 2,
        approved: false,
        rejections: ['Not an upgrade for existing episode file(s)'],
        languages: null,
        customFormats: [],
      }),
      rawRelease({ guid: null }),
    ];
    const fetchMock = stubFetch(() => json(releases));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/episodes/101/releases' });

    expect(res.statusCode).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${base}/release?episodeId=101`);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      guid: 'https://indexer.example/nzb/1',
      indexerId: 3,
      indexer: 'NZBgeek',
      title: 'The.Expanse.S02E01.1080p.WEB.h264',
      quality: 'WEBDL-1080p',
      size: 2_000_000_000,
      ageHours: 30.5,
      protocol: 'usenet',
      seeders: null,
      leechers: null,
      languages: ['English'],
      customFormats: ['x264'],
      customFormatScore: 10,
      fullSeason: false,
      approved: true,
      rejections: [],
      downloadAllowed: true,
    });
    expect(body[1]).toMatchObject({
      protocol: 'torrent',
      seeders: 40,
      leechers: 2,
      approved: false,
      rejections: ['Not an upgrade for existing episode file(s)'],
      languages: [],
    });
    expect(res.body).not.toContain('indexer-secret');
  });

  it('searches for a whole season', async () => {
    const fetchMock = stubFetch(() => json([]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/series/12/seasons/2/releases' });

    expect(res.json()).toEqual([]);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${base}/release?seriesId=12&seasonNumber=2`);
  });

  it("explains a search that failed inside Sonarr in Sonarr's words", async () => {
    stubFetch(() => json({ message: 'No indexers available' }, 500));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/episodes/101/releases' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: { code: 'upstream_error', message: 'Sonarr failed: No indexers available' },
    });
  });

  it('grabs a release from the latest search', async () => {
    const fetchMock = stubFetch(() => json(rawRelease()));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/releases',
      payload: { guid: 'https://indexer.example/nzb/1', indexerId: 3 },
    });

    expect(res.statusCode).toBe(204);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${base}/release`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      guid: 'https://indexer.example/nzb/1',
      indexerId: 3,
    });
  });

  it('says to search again when the search result has expired', async () => {
    const message = "Couldn't find requested release in cache, try searching again";
    stubFetch(() => json({ message }, 404));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/releases',
      payload: { guid: 'old', indexerId: 3 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/expired.*Search again/);
  });

  it('rejects a grab without a guid and indexer', async () => {
    const fetchMock = stubFetch(() => json({}));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const payload of [{}, { guid: '', indexerId: 3 }, { guid: 'x', indexerId: '3' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/sonarr/releases', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/sonarr/episodes/:id/file', () => {
  /** Sonarr with a double-episode file 555: 101 is monitored, 102 isn't. */
  function stubDoubleEpisode() {
    return stubFetch((url, init) => {
      if (url.pathname === '/api/v3/episode/101') {
        return json(rawEpisode({ hasFile: true, episodeFileId: 555 }));
      }
      if (url.pathname === '/api/v3/episode') {
        return json([
          rawEpisode({ hasFile: true, episodeFileId: 555 }),
          rawEpisode({ id: 102, episodeNumber: 2, monitored: false, episodeFileId: 555 }),
        ]);
      }
      if (init.method === 'PUT') return json([], 202);
      return new Response(null, { status: 200 });
    });
  }

  it("deletes the episode's own file and keeps its episodes monitored as they were", async () => {
    const fetchMock = stubDoubleEpisode();
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'DELETE', url: '/api/sonarr/episodes/101/file' });

    expect(res.statusCode).toBe(204);
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${String(url)}`);
    expect(calls).toEqual([
      `GET ${base}/episode/101`,
      `GET ${base}/episode?episodeFileId=555`,
      `DELETE ${base}/episodefile/555`,
      `PUT ${base}/episode/monitor`,
    ]);
    // Only the episode that was monitored, so an unmonitored one isn't switched on.
    const body = JSON.parse(String(fetchMock.mock.calls[3]![1].body));
    expect(body).toEqual({ episodeIds: [101], monitored: true });
  });

  it('changes no monitoring when none of the episodes was monitored', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v3/episode/101') {
        return json(rawEpisode({ hasFile: true, episodeFileId: 555, monitored: false }));
      }
      if (url.pathname === '/api/v3/episode') {
        return json([rawEpisode({ hasFile: true, episodeFileId: 555, monitored: false })]);
      }
      return new Response(null, { status: 200 });
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'DELETE', url: '/api/sonarr/episodes/101/file' });

    expect(res.statusCode).toBe(204);
    const methods = fetchMock.mock.calls.map(([, init]) => init.method);
    expect(methods).toEqual(['GET', 'GET', 'DELETE']);
  });

  it('answers 404 for an episode without a file, deleting nothing', async () => {
    const fetchMock = stubFetch(() => json(rawEpisode({ hasFile: false, episodeFileId: 0 })));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'DELETE', url: '/api/sonarr/episodes/101/file' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('This episode has no file to delete.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a bad episode id without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => json({}));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'DELETE', url: '/api/sonarr/episodes/abc/file' });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
