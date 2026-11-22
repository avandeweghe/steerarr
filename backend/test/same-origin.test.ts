import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const searchUrl = '/api/sonarr/episodes/101/search';

describe('requests from another site', () => {
  it("refuses a change requested by another site's page", async () => {
    const fetchMock = stubFetch(() => Response.json({ id: 1, status: 'queued' }, { status: 201 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    for (const origin of ['https://evil.example', 'null']) {
      const res = await app.inject({ method: 'POST', url: searchUrl, headers: { origin } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toMatch(/another site/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows Steerarr's own pages, scripts without an Origin, and reads", async () => {
    stubFetch(() => Response.json({ id: 1, status: 'queued' }, { status: 201 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const sameSite = { origin: 'https://steerarr.lan', host: 'steerarr.lan' };

    const own = await app.inject({ method: 'POST', url: searchUrl, headers: sameSite });
    expect(own.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: searchUrl })).statusCode).toBe(200);
    const otherSite = { origin: 'https://x.example' };
    const read = await app.inject({ url: '/api/services', headers: otherSite });
    expect(read.statusCode).toBe(200);
  });

  it('compares with the host a trusted proxy forwarded', async () => {
    stubFetch(() => Response.json({ id: 1, status: 'queued' }, { status: 201 }));
    const { app } = await startApp({ sonarr: sonarrSettings });
    const headers = {
      origin: 'https://steerarr.a.example',
      host: 'steerarr_steerarr:6232',
      'x-forwarded-host': 'steerarr.a.example',
    };
    const res = await app.inject({ method: 'POST', url: searchUrl, headers });
    expect(res.statusCode).toBe(200);
  });
});
