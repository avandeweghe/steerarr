import { afterEach, describe, expect, it } from 'vitest';
import { diskOf } from '../src/services/sonarr/status.js';
import { cleanup, sonarrSettings, sonarrStatus, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const json = (body: unknown, status = 200) => Response.json(body, { status });

const disks = [
  { path: '/', label: '', freeSpace: 38, totalSpace: 53 },
  { path: '/config', label: '', freeSpace: 752, totalSpace: 1000 },
  { path: '/mnt/user', label: 'array', freeSpace: 13_737, totalSpace: 57_991 },
];

describe('GET /api/sonarr/status', () => {
  it('shows every health check, problems first, and space per root folder', async () => {
    const health = [
      { source: 'UpdateCheck', type: 'notice', message: 'New update', wikiUrl: 'https://wiki/u' },
      { source: 'IndexerStatusCheck', type: 'error', message: 'All indexers down' },
      { source: 'Fine', type: 'ok', message: '' },
      {
        source: 'DownloadClientCheck',
        type: 'warning',
        message: '',
        wikiUrl: 'javascript:alert(1)',
      },
    ];
    const folders = [
      { id: 6, path: '/mnt/user/TVShows', accessible: true, freeSpace: 13_700, totalSpace: null },
      { id: 7, path: '/data/anime', accessible: false },
      { id: 8, path: null, accessible: true },
    ];
    const responses: Record<string, unknown> = {
      '/api/v3/system/status': sonarrStatus,
      '/api/v3/health': health,
      '/api/v3/rootfolder': folders,
      '/api/v3/diskspace': disks,
    };
    stubFetch((url) => json(responses[url.pathname]));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const res = await app.inject({ url: '/api/sonarr/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      version: '4.0.20.3014',
      branch: 'main',
      startTime: '2026-11-20T10:00:00Z',
      health: [
        {
          source: 'IndexerStatusCheck',
          level: 'error',
          message: 'All indexers down',
          wikiUrl: null,
        },
        {
          source: 'DownloadClientCheck',
          level: 'warning',
          message: 'Sonarr reports a problem.',
          wikiUrl: null,
        },
        {
          source: 'UpdateCheck',
          level: 'notice',
          message: 'New update',
          wikiUrl: 'https://wiki/u',
        },
      ],
      rootFolders: [
        { path: '/mnt/user/TVShows', accessible: true, freeSpace: 13_700, totalSpace: 57_991 },
        { path: '/data/anime', accessible: false, freeSpace: 38, totalSpace: 53 },
      ],
    });
  });

  it('says when Sonarr is not set up', async () => {
    const { app } = await startApp();
    const res = await app.inject({ url: '/api/sonarr/status' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('not_configured');
  });
});

describe('diskOf', () => {
  it('picks the disk mounted at the longest matching path', () => {
    expect(diskOf('/mnt/user/TVShows', disks)?.path).toBe('/mnt/user');
    expect(diskOf('/config', disks)?.path).toBe('/config');
    expect(diskOf('/configs/x', disks)?.path).toBe('/');
    expect(diskOf('/tv', [{ path: '/mnt/', freeSpace: 1, totalSpace: 2 }])).toBeUndefined();
  });
});
