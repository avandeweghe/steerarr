import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const json = (body: unknown, status = 200) => Response.json(body, { status });

const series = {
  id: 12,
  title: 'The Expanse',
  network: 'Prime Video',
  runtime: 50,
  path: '/tv/The Expanse',
  images: [{ coverType: 'poster', url: '/MediaCover/12/poster.jpg?lastWrite=638123' }],
};

function calendarEpisode(overrides: Record<string, unknown>) {
  return {
    id: 1,
    seriesId: 12,
    seasonNumber: 6,
    episodeNumber: 1,
    title: 'Strange Dogs',
    airDate: '2026-11-22',
    airDateUtc: '2026-11-23T02:00:00Z',
    runtime: 0,
    monitored: true,
    hasFile: false,
    finaleType: null,
    overview: 'Not passed through',
    series,
    ...overrides,
  };
}

const range = 'start=2026-11-22T05:00:00.000Z&end=2026-12-06T05:00:00.000Z';

describe('GET /api/sonarr/calendar', () => {
  it('lists monitored episodes in the range by air time, with what is downloading', async () => {
    const episodes = [
      calendarEpisode({
        id: 3,
        episodeNumber: 3,
        airDateUtc: '2026-11-30T02:00:00Z',
        // As Sonarr's calendar sends it: TheTVDB's URL only.
        series: { ...series, images: [{ coverType: 'poster', remoteUrl: 'https://tvdb/p.jpg' }] },
      }),
      calendarEpisode({ id: 1, hasFile: true }),
      calendarEpisode({ id: 2, episodeNumber: 2, airDateUtc: '2026-11-24T02:00:00Z' }),
      calendarEpisode({ id: 4, airDateUtc: null }),
      calendarEpisode({
        id: 5,
        seriesId: 13,
        episodeNumber: 10,
        airDateUtc: '2026-11-30T02:00:00Z',
        runtime: 42,
        finaleType: 'season',
        series: { id: 13, title: 'Andor', network: null, images: [] },
      }),
    ];
    const queue = {
      page: 1,
      pageSize: 200,
      totalRecords: 2,
      records: [
        { id: 90, episodeId: 2, size: 1, sizeleft: 1, status: 'downloading', protocol: 'usenet' },
        { id: 91, episodeId: 1, size: 1, sizeleft: 0, status: 'completed', protocol: 'usenet' },
      ],
    };
    const fetchMock = stubFetch((url) =>
      json(url.pathname.endsWith('/calendar') ? episodes : queue),
    );
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: `/api/sonarr/calendar?${range}` });

    expect(res.statusCode).toBe(200);
    const calendarUrl = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/calendar'));
    expect(calendarUrl).toBe(
      'http://sonarr.lan:8989/api/v3/calendar?start=2026-11-22T05%3A00%3A00.000Z&end=2026-12-06T05%3A00%3A00.000Z&unmonitored=false&includeSeries=true',
    );
    const body = res.json();
    expect(body.map((item: { id: number }) => item.id)).toEqual([1, 2, 3, 5]);
    expect(body[0]).toEqual({
      id: 1,
      seriesId: 12,
      seriesTitle: 'The Expanse',
      network: 'Prime Video',
      posterUrl: 'api/sonarr/series/12/poster?v=638123',
      episode: { seasonNumber: 6, episodeNumber: 1, title: 'Strange Dogs' },
      airDateUtc: '2026-11-23T02:00:00.000Z',
      runtime: 50,
      hasFile: true,
      downloading: false,
      finale: null,
    });
    expect(body[1].downloading).toBe(true);
    expect(body[2].downloading).toBe(false);
    expect(body[2].posterUrl).toBe('api/sonarr/series/12/poster');
    expect(body[3]).toMatchObject({
      seriesTitle: 'Andor',
      network: null,
      posterUrl: null,
      runtime: 42,
      finale: 'season',
    });
  });

  it('rejects a missing, backwards or too long range without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => json([]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const bad = [
      '/api/sonarr/calendar',
      '/api/sonarr/calendar?start=tomorrow&end=2026-12-06T05:00:00Z',
      '/api/sonarr/calendar?start=2026-12-06T05:00:00Z&end=2026-11-22T05:00:00Z',
      '/api/sonarr/calendar?start=2026-01-01T00:00:00Z&end=2026-06-01T00:00:00Z',
    ];
    for (const url of bad) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('bad_request');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts times with an offset, as the phone sends them', async () => {
    stubFetch((url) => json(url.pathname.endsWith('/calendar') ? [] : { records: [] }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const url =
      '/api/sonarr/calendar?start=2026-11-22T00:00:00-05:00&end=2026-12-06T00:00:00-05:00';
    const res = await app.inject({ url: url.replaceAll('+', '%2B') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
