import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArrClient } from '../src/core/arr-client.js';
import { UpstreamError } from '../src/core/upstream-error.js';

function client(baseUrl = 'http://sonarr.lan:8989') {
  return new ArrClient({
    serviceName: 'Sonarr',
    baseUrl,
    apiKey: 'secret-key',
    apiPath: '/api/v3',
  });
}

function mockFetch(impl: (url: URL, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArrClient.url', () => {
  it('joins base URL, API path and query', () => {
    expect(client().url('/series', { seriesId: 5, skip: undefined }).toString()).toBe(
      'http://sonarr.lan:8989/api/v3/series?seriesId=5',
    );
  });

  it('repeats the key for each item of a list', () => {
    expect(
      client().url('/search', { query: 'dune', indexerIds: [1, 4], categories: [] }).search,
    ).toBe('?query=dune&indexerIds=1&indexerIds=4');
  });

  it('keeps a URL base and tolerates trailing slashes', () => {
    expect(client('http://host/sonarr/').url('system/status').toString()).toBe(
      'http://host/sonarr/api/v3/system/status',
    );
  });
});

describe('ArrClient.request', () => {
  it('sends the API key as a header and parses JSON', async () => {
    const fetchMock = mockFetch(async () => Response.json({ version: '4.0.20' }));
    await expect(client().get('/system/status')).resolves.toEqual({ version: '4.0.20' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://sonarr.lan:8989/api/v3/system/status');
    expect(String(url)).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
    expect(init.redirect).toBe('manual');
  });

  it('sends JSON bodies', async () => {
    const fetchMock = mockFetch(async () => Response.json({ id: 1 }, { status: 201 }));
    await client().post('/command', { name: 'SeriesSearch' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"SeriesSearch"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for an empty body', async () => {
    mockFetch(async () => new Response(null, { status: 200 }));
    await expect(client().delete('/queue/1')).resolves.toBeUndefined();
  });

  it('throws an http UpstreamError with status and body on non-2xx', async () => {
    mockFetch(async () => Response.json([{ errorMessage: 'Path is invalid' }], { status: 400 }));
    const error = await client()
      .get('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({
      kind: 'http',
      status: 400,
      body: [{ errorMessage: 'Path is invalid' }],
    });
  });

  it('treats a redirect as an error', async () => {
    mockFetch(async () => new Response(null, { status: 302, headers: { Location: '/login' } }));
    await expect(client().get('/x')).rejects.toMatchObject({ kind: 'http', status: 302 });
  });

  it('throws when a 2xx body is not JSON', async () => {
    mockFetch(async () => new Response('<html>login</html>', { status: 200 }));
    await expect(client().get('/x')).rejects.toThrow(/isn't JSON/);
  });

  it('throws a network UpstreamError with the underlying code', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const error = await client()
      .get('/x')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      kind: 'network',
      message: "Can't reach Sonarr: the connection was refused (ECONNREFUSED)",
    });
  });

  it('shows unmapped network error codes as-is', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'EPROTO' } });
    });
    await expect(client().get('/x')).rejects.toThrow("Can't reach Sonarr: EPROTO");
  });

  it('throws a timeout UpstreamError when the request times out', async () => {
    mockFetch(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(client().get('/x', undefined, { timeoutMs: 2000 })).rejects.toMatchObject({
      kind: 'timeout',
      message: "Sonarr didn't respond within 2 s",
    });
  });

  // Headers arrived, then the body stalled or broke: must map the same way as before headers.
  function failingBody(error: unknown): Response {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(error);
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  it('maps a timeout while reading the body to a timeout UpstreamError', async () => {
    mockFetch(async () =>
      failingBody(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    );
    await expect(client().get('/x')).rejects.toMatchObject({
      kind: 'timeout',
      message: "Sonarr didn't respond within 15 s",
    });
  });

  it('maps a connection dropped mid-body to a network UpstreamError', async () => {
    mockFetch(async () =>
      failingBody(new TypeError('terminated', { cause: { code: 'UND_ERR_SOCKET' } })),
    );
    await expect(client().get('/x')).rejects.toMatchObject({
      kind: 'network',
      message: "Can't reach Sonarr: the connection was dropped (UND_ERR_SOCKET)",
    });
  });
});
