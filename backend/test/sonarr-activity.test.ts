import { afterEach, describe, expect, it } from 'vitest';
import { parseTimeLeft } from '../src/services/sonarr/activity.js';
import { cleanup, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const base = 'http://sonarr.lan:8989/api/v3';
const json = (body: unknown, status = 200) => Response.json(body, { status });

function page(records: unknown[], overrides: Record<string, unknown> = {}) {
  return { page: 1, pageSize: 50, totalRecords: records.length, records, ...overrides };
}

const episode = { seasonNumber: 2, episodeNumber: 5, title: 'Home', hasFile: false };
const series = { title: 'The Expanse', path: '/tv/The Expanse' };

describe('GET /api/sonarr/queue', () => {
  it('lists downloads with progress, time left and what is wrong', async () => {
    const queueItem = {
      id: 7,
      seriesId: 12,
      series,
      episode,
      quality: { quality: { name: 'WEBDL-1080p' } },
      size: 2000,
      sizeleft: 500,
      timeleft: '1.02:03:04',
      title: 'The.Expanse.S02E05.1080p',
      status: 'downloading',
      trackedDownloadStatus: 'warning',
      trackedDownloadState: 'importBlocked',
      statusMessages: [
        { title: 'The.Expanse.S02E05.1080p', messages: ['Not a quality revision upgrade'] },
        { title: 'One file is unpacking', messages: [] },
        { title: 'Duplicate', messages: ['Not a quality revision upgrade'] },
      ],
      errorMessage: 'Import blocked',
      protocol: 'usenet',
      downloadClient: 'NZBGet',
      indexer: 'NZBgeek',
      outputPath: '/downloads/secret',
    };
    const fetchMock = stubFetch(() => json(page([queueItem])));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/queue' });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${base}/queue?page=1&pageSize=200&includeSeries=true&includeEpisode=true`,
    );
    expect(res.json()).toEqual([
      {
        id: 7,
        title: 'The.Expanse.S02E05.1080p',
        seriesId: 12,
        seriesTitle: 'The Expanse',
        episode: { seasonNumber: 2, episodeNumber: 5, title: 'Home' },
        quality: 'WEBDL-1080p',
        size: 2000,
        sizeLeft: 500,
        timeLeft: 93784,
        status: 'downloading',
        state: 'importBlocked',
        health: 'warning',
        messages: ['Not a quality revision upgrade', 'One file is unpacking', 'Import blocked'],
        protocol: 'usenet',
        downloadClient: 'NZBGet',
        indexer: 'NZBgeek',
      },
    ]);
  });
});

describe('DELETE /api/sonarr/queue/:id', () => {
  it('removes from the queue and the download client, blocklisting on request', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const { app } = await startApp({ sonarr: sonarrSettings });

    const plain = await app.inject({ method: 'DELETE', url: '/api/sonarr/queue/7' });
    const blockUrl = '/api/sonarr/queue/8?blocklist=true';
    const blocked = await app.inject({ method: 'DELETE', url: blockUrl });

    expect(plain.statusCode).toBe(204);
    expect(blocked.statusCode).toBe(204);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      `${base}/queue/7?removeFromClient=true&blocklist=false`,
      `${base}/queue/8?removeFromClient=true&blocklist=true`,
    ]);
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
  });

  it('rejects a bad id or blocklist value without calling Sonarr', async () => {
    const fetchMock = stubFetch(() => json({}));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const url of ['/api/sonarr/queue/abc', '/api/sonarr/queue/7?blocklist=maybe']) {
      expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/sonarr/history', () => {
  it('pages through events, newest first, in plain terms', async () => {
    const records = [
      {
        id: 1,
        seriesId: 12,
        series,
        episode,
        sourceTitle: 'The.Expanse.S02E05.1080p',
        quality: { quality: { name: 'WEBDL-1080p' } },
        date: '2026-11-20T10:00:00Z',
        eventType: 'grabbed',
        data: { indexer: 'NZBgeek', downloadUrl: 'https://indexer/secret' },
      },
      { id: 2, seriesId: 12, date: 'x', eventType: 'downloadFolderImported', data: {} },
      { id: 3, seriesId: 12, date: 'x', eventType: 'downloadFailed', data: { message: 'CRC' } },
      {
        id: 4,
        seriesId: 12,
        date: 'x',
        eventType: 'episodeFileDeleted',
        data: { reason: 'Upgrade' },
      },
      { id: 5, seriesId: 12, date: 'x', eventType: 'somethingNew' },
    ];
    const fetchMock = stubFetch(() => json(page(records, { page: 2, totalRecords: 120 })));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/history?page=2' });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${base}/history?page=2&pageSize=50&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true`,
    );
    const body = res.json();
    expect(body).toMatchObject({ page: 2, pageSize: 50, totalRecords: 120 });
    expect(body.records[0]).toEqual({
      id: 1,
      event: 'grabbed',
      date: '2026-11-20T10:00:00Z',
      sourceTitle: 'The.Expanse.S02E05.1080p',
      quality: 'WEBDL-1080p',
      seriesId: 12,
      seriesTitle: 'The Expanse',
      episode: { seasonNumber: 2, episodeNumber: 5, title: 'Home' },
      detail: 'From NZBgeek',
    });
    type Event = { event: string; detail: string | null };
    const summary = body.records.map((item: Event) => [item.event, item.detail]);
    expect(summary).toEqual([
      ['grabbed', 'From NZBgeek'],
      ['imported', null],
      ['failed', 'CRC'],
      ['deleted', 'Replaced by a better file'],
      ['unknown', null],
    ]);
    expect(res.body).not.toContain('secret');
  });

  it('rejects a bad page number', async () => {
    stubFetch(() => json(page([])));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const url of ['/api/sonarr/history?page=0', '/api/sonarr/history?page=x']) {
      expect((await app.inject({ url })).statusCode).toBe(400);
    }
  });
});

describe('GET /api/sonarr/wanted/:list', () => {
  it('lists missing episodes, most recently aired first', async () => {
    const missing = {
      ...episode,
      id: 101,
      seriesId: 12,
      series,
      airDateUtc: '2026-11-01T02:00:00Z',
      monitored: true,
    };
    const fetchMock = stubFetch(() => json(page([missing])));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/wanted/missing' });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${base}/wanted/missing?page=1&pageSize=50&sortKey=episodes.airDateUtc&sortDirection=descending&monitored=true&includeSeries=true`,
    );
    expect(res.json().records).toEqual([
      {
        id: 101,
        seriesId: 12,
        seriesTitle: 'The Expanse',
        episode: { seasonNumber: 2, episodeNumber: 5, title: 'Home' },
        airDateUtc: '2026-11-01T02:00:00Z',
        quality: null,
      },
    ]);
  });

  it('includes the current quality for cutoff not met', async () => {
    const belowCutoff = {
      ...episode,
      id: 102,
      seriesId: 12,
      series,
      hasFile: true,
      episodeFile: { size: 900, quality: { quality: { name: 'HDTV-720p' } } },
    };
    const fetchMock = stubFetch(() => json(page([belowCutoff])));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/wanted/cutoff?page=3' });

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/wanted/cutoff?page=3&');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('&includeEpisodeFile=true');
    expect(res.json().records[0]).toMatchObject({ id: 102, quality: 'HDTV-720p' });
  });

  it('rejects an unknown list', async () => {
    const fetchMock = stubFetch(() => json(page([])));
    const { app } = await startApp({ sonarr: sonarrSettings });
    expect((await app.inject({ url: '/api/sonarr/wanted/everything' })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/sonarr/wanted/:list/search', () => {
  it.each([
    ['missing', 'MissingEpisodeSearch'],
    ['cutoff', 'CutoffUnmetEpisodeSearch'],
  ])('starts a search for everything %s', async (list, name) => {
    const fetchMock = stubFetch(() => json({ id: 9, status: 'queued' }, 201));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ method: 'POST', url: `/api/sonarr/wanted/${list}/search` });

    expect(res.json()).toMatchObject({ id: 9, done: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${base}/command`);
    expect(JSON.parse(String(init.body))).toEqual({ name, monitored: true });
  });
});

describe('parseTimeLeft', () => {
  it('reads Sonarr time spans as seconds', () => {
    expect(parseTimeLeft('00:12:34')).toBe(754);
    expect(parseTimeLeft('1.02:03:04')).toBe(93784);
    expect(parseTimeLeft('00:00:05.1234567')).toBe(5);
    expect(parseTimeLeft(null)).toBeNull();
    expect(parseTimeLeft('soon')).toBeNull();
  });
});

describe('GET /api/sonarr/summary', () => {
  it("sums up Sonarr for the Home screen, with Sonarr's warnings and errors", async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith('/system/status')) return json({ version: '4.0.20.3014' });
      if (url.pathname.endsWith('/queue/status')) return json({ totalCount: 1, count: 1 });
      if (url.pathname.endsWith('/wanted/missing')) return json(page([], { totalRecords: 12 }));
      return json([
        { source: 'IndexerCheck', type: 'warning', message: 'All indexers are unavailable' },
        { source: 'UpdateCheck', type: 'notice', message: 'Update available' },
        { source: 'RootFolderCheck', type: 'error', message: '' },
      ]);
    });
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/summary' });

    expect(res.json()).toEqual({
      version: '4.0.20.3014',
      facts: ['1 download in the queue', '12 missing episodes'],
      issues: [
        { level: 'warning', message: 'All indexers are unavailable' },
        { level: 'error', message: 'Sonarr reports a problem.' },
      ],
    });
  });
});
