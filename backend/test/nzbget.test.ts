import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const nzbgetSettings = {
  url: 'http://nzbget.lan:6789',
  apiKey: 'secret-pass',
  username: 'nzbget',
};
const endpoint = 'http://nzbget.lan:6789/jsonrpc';
const basic = `Basic ${Buffer.from('nzbget:secret-pass').toString('base64')}`;

const status = {
  RemainingSizeLo: 1024,
  RemainingSizeHi: 1,
  DownloadRate: 2097152,
  DownloadRateLo: 2097152,
  DownloadRateHi: 0,
  DownloadLimit: 0,
  DownloadPaused: false,
  UpTimeSec: 3600,
  QuotaReached: false,
};

const groups = [
  {
    NZBID: 7,
    NZBName: 'Some.Show.S01E01.1080p',
    Category: 'tv',
    FileSizeLo: 0,
    FileSizeHi: 1,
    RemainingSizeLo: 1073741824,
    RemainingSizeHi: 0,
    Status: 'DOWNLOADING',
    MaxPriority: 0,
    Health: 1000,
    PostInfoText: 'NONE',
    PostStageProgress: 0,
  },
  {
    NZBID: 8,
    NZBName: 'Some.Show.S01E02.1080p',
    Category: '',
    FileSizeLo: 500,
    FileSizeHi: 0,
    RemainingSizeLo: 0,
    RemainingSizeHi: 0,
    Status: 'UNPACKING',
    MaxPriority: 50,
    Health: 975,
    PostInfoText: 'Unpacking',
    PostStageProgress: 420,
  },
  { ...groupBase(9), Status: 'PAUSED' },
];

function groupBase(id: number) {
  return {
    NZBID: id,
    NZBName: `Item ${id}`,
    FileSizeLo: 10,
    FileSizeHi: 0,
    RemainingSizeLo: 10,
    RemainingSizeHi: 0,
    MaxPriority: 0,
    Health: 1000,
  };
}

interface Call {
  method: string;
  params: unknown[];
  headers: Record<string, string>;
}

/** Fakes NZBGet: answers each JSON-RPC method from `results` and records the calls. */
function stubNzbget(results: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchMock = stubFetch((url, init) => {
    expect(String(url)).toBe(endpoint);
    const body = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
    const headers = init.headers as Record<string, string>;
    calls.push({ method: body.method, params: body.params, headers });
    if (!(body.method in results)) {
      return Response.json({ error: { message: 'Invalid procedure' } });
    }
    return Response.json({ version: '1.1', result: results[body.method] });
  });
  return { calls, fetchMock };
}

describe('NZBGet settings', () => {
  it('saves an address, username and password, logging in with HTTP Basic auth', async () => {
    const { calls } = stubNzbget({ version: '26.3', status });
    const { app } = await startApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/nzbget/settings',
      payload: { url: 'http://nzbget.lan:6789/', username: 'nzbget', apiKey: 'secret-pass' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      url: 'http://nzbget.lan:6789',
      apiKeySaved: true,
      username: 'nzbget',
    });
    expect(calls.map((call) => call.method).sort()).toEqual(['status', 'version']);
    expect(calls[0]!.headers.Authorization).toBe(basic);
    expect(calls[0]!.headers['X-Api-Key']).toBeUndefined();
    expect(res.body).not.toContain('secret-pass');
  });

  it('needs a username, and the password again when the address changes', async () => {
    stubNzbget({ version: '26.3', status });
    const { app } = await startApp({ nzbget: nzbgetSettings });

    const noUser = await app.inject({
      method: 'POST',
      url: '/api/nzbget/settings/test',
      payload: { url: nzbgetSettings.url, apiKey: 'x' },
    });
    expect(noUser.json().error.message).toBe("Enter NZBGet's username.");

    const moved = await app.inject({
      method: 'POST',
      url: '/api/nzbget/settings/test',
      payload: { url: 'http://elsewhere:6789', username: 'nzbget' },
    });
    const movedMessage = "The address changed, so enter NZBGet's password again.";
    expect(moved.json().error.message).toBe(movedMessage);

    const same = await app.inject({
      method: 'POST',
      url: '/api/nzbget/settings/test',
      payload: { url: nzbgetSettings.url, username: 'nzbget' },
    });
    expect(same.statusCode).toBe(200);
    expect(same.json()).toMatchObject({ appName: 'NZBGet', version: '26.3' });
  });

  it('says the username or password was rejected, as a 502', async () => {
    stubFetch(() => new Response('<html>401</html>', { status: 401 }));
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/queue' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: {
        code: 'upstream_auth',
        message: "NZBGet rejected the username or password. Check them in Steerarr's settings.",
      },
    });
  });
});

describe('GET /api/nzbget/queue', () => {
  it('shows the overall state and each download in queue order', async () => {
    stubNzbget({ status, listgroups: groups });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/queue' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toEqual({
      paused: false,
      downloadRate: 2097152,
      speedLimit: 0,
      remaining: 4294968320,
    });
    expect(body.items[0]).toEqual({
      id: 7,
      name: 'Some.Show.S01E01.1080p',
      category: 'tv',
      size: 4294967296,
      remaining: 1073741824,
      state: 'downloading',
      status: 'DOWNLOADING',
      stage: null,
      stageProgress: null,
      priority: 0,
      health: 1,
    });
    expect(body.items[1]).toMatchObject({
      category: null,
      state: 'processing',
      stage: 'Unpacking',
      stageProgress: 0.42,
      priority: 50,
      health: 0.975,
    });
    expect(body.items[2]).toMatchObject({ id: 9, state: 'paused' });
  });

  it("passes on NZBGet's own errors as a 502", async () => {
    stubNzbget({});
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/queue' });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe('NZBGet: Invalid procedure');
  });
});

describe('controlling the queue', () => {
  it('pauses and resumes all downloading', async () => {
    const { calls } = stubNzbget({ pausedownload: true, resumedownload: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });

    const pause = await app.inject({ method: 'POST', url: '/api/nzbget/queue/pause' });
    const resume = await app.inject({ method: 'POST', url: '/api/nzbget/queue/resume' });
    expect([pause.statusCode, resume.statusCode]).toEqual([204, 204]);
    expect(calls.map((call) => call.method)).toEqual(['pausedownload', 'resumedownload']);
  });

  it.each([
    ['pause', 'GroupPause'],
    ['resume', 'GroupResume'],
    ['top', 'GroupMoveTop'],
    ['bottom', 'GroupMoveBottom'],
  ])('%s one download', async (action, command) => {
    const { calls } = stubNzbget({ editqueue: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ method: 'POST', url: `/api/nzbget/queue/7/${action}` });

    expect(res.statusCode).toBe(204);
    expect(calls[0]).toMatchObject({ method: 'editqueue', params: [command, 0, '', 7] });
  });

  it.each([
    ['keepFiles', 'GroupParkDelete'],
    ['deleteFiles', 'GroupDelete'],
    ['noHistory', 'GroupFinalDelete'],
  ])('removes a download with mode %s, as NZBGet does', async (mode, command) => {
    const { calls } = stubNzbget({ editqueue: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ method: 'DELETE', url: `/api/nzbget/queue/7?mode=${mode}` });

    expect(res.statusCode).toBe(204);
    expect(calls[0]!.params).toEqual([command, 0, '', 7]);
  });

  it('needs to be told how to delete, and never guesses', async () => {
    const { fetchMock } = stubNzbget({ editqueue: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    for (const url of ['/api/nzbget/queue/7', '/api/nzbget/queue/7?mode=everything']) {
      expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 404 when NZBGet doesn't have the download", async () => {
    stubNzbget({ editqueue: false });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ method: 'POST', url: '/api/nzbget/queue/99/pause' });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown action or id without calling NZBGet', async () => {
    const { fetchMock } = stubNzbget({ editqueue: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    for (const url of ['/api/nzbget/queue/7/explode', '/api/nzbget/queue/abc/pause']) {
      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/nzbget/history', () => {
  it('pages through the history, newest first, with how each one ended', async () => {
    const history = Array.from({ length: 60 }, (_, index) => ({
      NZBID: index + 1,
      Name: `Item ${index + 1}`,
      Category: 'tv',
      FileSizeLo: 100,
      FileSizeHi: 0,
      HistoryTime: 1_800_000_000 + index,
      Status: ['SUCCESS/ALL', 'WARNING/DAMAGED', 'FAILURE/PAR', 'DELETED/MANUAL'][index % 4],
    }));
    const { calls } = stubNzbget({ history });
    const { app } = await startApp({ nzbget: nzbgetSettings });

    const first = (await app.inject({ url: '/api/nzbget/history' })).json();
    expect(calls[0]).toMatchObject({ method: 'history', params: [false] });
    expect(first).toMatchObject({ page: 1, pageSize: 50, totalRecords: 60 });
    expect(first.records).toHaveLength(50);
    expect(first.records[0]).toEqual({
      id: 60,
      name: 'Item 60',
      category: 'tv',
      size: 100,
      time: new Date((1_800_000_000 + 59) * 1000).toISOString(),
      outcome: 'deleted',
      status: 'DELETED/MANUAL',
      detail: 'Removed by hand',
    });
    type Entry = { outcome: string; detail: string | null };
    const ends = first.records.slice(0, 4).map((item: Entry) => [item.outcome, item.detail]);
    expect(ends).toEqual([
      ['deleted', 'Removed by hand'],
      ['failure', 'Repair failed'],
      ['warning', 'Damaged'],
      ['success', null],
    ]);

    const second = (await app.inject({ url: '/api/nzbget/history?page=2' })).json();
    const ids = second.records.map((item: { id: number }) => item.id);
    expect(ids).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe('GET /api/nzbget/summary', () => {
  it('sums up NZBGet for the Home screen', async () => {
    stubNzbget({ version: '26.3', status: { ...status, QuotaReached: true }, listgroups: groups });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/summary' });

    expect(res.json()).toEqual({
      version: '26.3',
      facts: ['3 downloads in the queue', '2.0 MiB/s'],
      issues: [{ level: 'warning', message: 'The download quota is reached.' }],
    });
  });

  it('says when downloading is paused', async () => {
    stubNzbget({ version: '26.3', status: { ...status, DownloadPaused: true }, listgroups: [] });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/summary' });
    expect(res.json().facts).toEqual(['0 downloads in the queue', 'Paused']);
  });
});

describe('history details', () => {
  it('puts a status NZBGet adds later into words', async () => {
    const entry = {
      NZBID: 1,
      Name: 'Item 1',
      FileSizeLo: 1,
      FileSizeHi: 0,
      HistoryTime: 1_800_000_000,
      Status: 'FAILURE/SOME_NEW_REASON',
    };
    stubNzbget({ history: [entry] });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/history' });
    expect(res.json().records[0]).toMatchObject({ outcome: 'failure', detail: 'Some new reason' });
  });
});

describe('categories', () => {
  const config = [
    { Name: 'ControlPassword', Value: 'secret-pass' },
    { Name: 'Category1.Name', Value: 'tv' },
    { Name: 'Category1.DestDir', Value: '/downloads/tv' },
    { Name: 'Category2.Name', Value: 'movies' },
    { Name: 'Category3.Name', Value: '  ' },
  ];

  it("lists NZBGet's category names and nothing else from its settings", async () => {
    stubNzbget({ config });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const res = await app.inject({ url: '/api/nzbget/categories' });

    expect(res.json()).toEqual(['tv', 'movies']);
    expect(res.body).not.toContain('secret-pass');
    expect(res.body).not.toContain('/downloads');
  });

  it("changes a download's category the way NZBGet's own dialog does", async () => {
    const { calls } = stubNzbget({ config, editqueue: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const url = '/api/nzbget/queue/7/category';

    const movies = await app.inject({ method: 'PUT', url, payload: { category: 'movies' } });
    const none = await app.inject({ method: 'PUT', url, payload: { category: '' } });

    expect([movies.statusCode, none.statusCode]).toEqual([204, 204]);
    const edits = calls.filter((call) => call.method === 'editqueue').map((call) => call.params);
    expect(edits).toEqual([
      ['GroupApplyCategory', 0, 'movies', 7],
      ['GroupApplyCategory', 0, '', 7],
    ]);
  });

  it('refuses a category NZBGet does not have, or a bad request', async () => {
    const { calls } = stubNzbget({ config, editqueue: true });
    const { app } = await startApp({ nzbget: nzbgetSettings });
    const url = '/api/nzbget/queue/7/category';

    const unknown = await app.inject({ method: 'PUT', url, payload: { category: 'anime' } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.message).toBe('NZBGet has no category called "anime".');
    const bad = await app.inject({ method: 'PUT', url, payload: { category: 5 } });
    expect(bad.statusCode).toBe(400);
    expect(calls.some((call) => call.method === 'editqueue')).toBe(false);
  });
});
