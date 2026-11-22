import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const base = 'http://sonarr.lan:8989/api/v3';
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** A raw lookup result, with fields Steerarr doesn't use but must send back when adding. */
function lookup(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Andor',
    sortTitle: 'andor',
    status: 'continuing',
    overview: 'A thief becomes a rebel.',
    network: 'Disney+',
    remotePoster: 'https://artworks.thetvdb.com/banners/posters/andor.jpg',
    images: [{ coverType: 'poster', remoteUrl: 'https://artworks.thetvdb.com/andor.jpg' }],
    seasons: [
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: true },
    ],
    year: 2022,
    tvdbId: 393189,
    titleSlug: 'andor',
    folder: 'Andor',
    seriesType: 'standard',
    statistics: { seasonCount: 2 },
    ...overrides,
  };
}

const addRequest = {
  tvdbId: 393189,
  qualityProfileId: 4,
  rootFolderPath: '/tv',
  monitor: 'all',
  seriesType: 'standard',
  seasonFolder: true,
  monitorNewSeasons: true,
  search: true,
};

describe('GET /api/sonarr/lookup', () => {
  it('searches TheTVDB through Sonarr and trims each result', async () => {
    const results = [
      lookup(),
      lookup({ id: 7, tvdbId: 280619, title: 'The Expanse', remotePoster: 'http://x/y.jpg' }),
      lookup({ tvdbId: 0, title: 'Not on TheTVDB' }),
    ];
    const fetchMock = stubFetch(() => json(results));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/lookup?term=andor%20star' });

    expect(res.statusCode).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${base}/series/lookup?term=andor+star`);
    expect(res.json()).toEqual([
      {
        tvdbId: 393189,
        title: 'Andor',
        year: 2022,
        status: 'continuing',
        network: 'Disney+',
        overview: 'A thief becomes a rebel.',
        seasonCount: 2,
        posterUrl: 'https://artworks.thetvdb.com/banners/posters/andor.jpg',
        seriesType: 'standard',
        existingId: null,
      },
      expect.objectContaining({ tvdbId: 280619, existingId: 7, posterUrl: null }),
    ]);
  });

  it('needs a search term', async () => {
    const fetchMock = stubFetch(() => json([]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const url of ['/api/sonarr/lookup', '/api/sonarr/lookup?term=%20%20']) {
      expect((await app.inject({ url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/sonarr/add-options', () => {
  it('lists quality profiles and root folders', async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith('/qualityprofile')) {
        return json([
          { id: 4, name: 'HD-1080p', items: [] },
          { id: 6, name: '', items: [] },
        ]);
      }
      return json([
        { id: 1, path: '/tv', accessible: true, freeSpace: 5000, unmappedFolders: [] },
        { id: 2, path: '/tv2', accessible: false },
        { id: 3, path: null, accessible: true },
      ]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/add-options' });

    expect(res.json()).toEqual({
      qualityProfiles: [
        { id: 4, name: 'HD-1080p' },
        { id: 6, name: 'Profile 6' },
      ],
      rootFolders: [
        { id: 1, path: '/tv', freeSpace: 5000, accessible: true },
        { id: 2, path: '/tv2', freeSpace: null, accessible: false },
      ],
      defaultQualityProfileId: null,
    });
  });
});

describe('POST /api/sonarr/series', () => {
  it('adds the full lookup result with the chosen options', async () => {
    const fetchMock = stubFetch((_url, init) => {
      if (init.method === 'POST') return json({ id: 42, title: 'Andor' }, 201);
      return json([lookup()]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sonarr/series',
      payload: { ...addRequest, monitor: 'future', seriesType: 'anime', search: false },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 42 });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${base}/series/lookup?term=tvdb%3A393189`);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe(`${base}/series`);
    expect(JSON.parse(String(init.body))).toEqual({
      ...lookup(),
      qualityProfileId: 4,
      rootFolderPath: '/tv',
      seriesType: 'anime',
      seasonFolder: true,
      monitored: true,
      monitorNewItems: 'all',
      addOptions: {
        monitor: 'future',
        searchForMissingEpisodes: false,
        searchForCutoffUnmetEpisodes: false,
      },
    });
  });

  it('adds an unmonitored series when monitoring none', async () => {
    const fetchMock = stubFetch((_url, init) => {
      if (init.method === 'POST') return json({ id: 42 }, 201);
      return json([lookup()]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const payload = { ...addRequest, monitor: 'none', monitorNewSeasons: false };
    await app.inject({ method: 'POST', url: '/api/sonarr/series', payload });

    const sent = JSON.parse(String(fetchMock.mock.calls[1]![1].body));
    expect(sent).toMatchObject({ monitored: false, monitorNewItems: 'none' });
  });

  it('refuses a series Sonarr already has, without adding it', async () => {
    const fetchMock = stubFetch(() => json([lookup({ id: 9 })]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const payload = addRequest;
    const res = await app.inject({ method: 'POST', url: '/api/sonarr/series', payload });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('Sonarr already has this series.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 404 when TheTVDB doesn't know the id", async () => {
    stubFetch(() => json([lookup({ tvdbId: 1 })]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const payload = addRequest;
    const res = await app.inject({ method: 'POST', url: '/api/sonarr/series', payload });
    expect(res.statusCode).toBe(404);
  });

  it("passes on Sonarr's validation errors", async () => {
    const errors = [
      { propertyName: 'RootFolderPath', errorMessage: "Folder '/nope' doesn't exist" },
    ];
    stubFetch((_url, init) => {
      if (init.method === 'POST') return json(errors, 400);
      return json([lookup()]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const payload = { ...addRequest, rootFolderPath: '/nope' };
    const res = await app.inject({ method: 'POST', url: '/api/sonarr/series', payload });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Folder '/nope' doesn't exist");
  });

  it('rejects an incomplete or invalid request without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => json([lookup()]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const bad = [
      {},
      { ...addRequest, monitor: 'everything' },
      { ...addRequest, seriesType: 'movie' },
      { ...addRequest, qualityProfileId: 0 },
      { ...addRequest, rootFolderPath: '' },
      { ...addRequest, search: 'yes' },
    ];
    for (const payload of bad) {
      const res = await app.inject({ method: 'POST', url: '/api/sonarr/series', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
