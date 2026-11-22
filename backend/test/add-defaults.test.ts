import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, radarrSettings, sonarrSettings, startApp, stubFetch } from './helpers.js';

afterEach(cleanup);

const json = (body: unknown, status = 200) => Response.json(body, { status });
const profiles = [
  { id: 1, name: 'Any' },
  { id: 7, name: 'HD-4K' },
];

/** Sonarr and Radarr answer the add options with the same shapes. */
function stubArr() {
  return stubFetch((url) => {
    if (url.pathname.endsWith('/qualityprofile')) return json(profiles);
    if (url.pathname.endsWith('/rootfolder')) return json([]);
    if (url.pathname.endsWith('/system/status')) {
      return json({ appName: 'X', instanceName: 'X', version: '4', branch: 'main', startTime: '' });
    }
    return json({});
  });
}

describe.each([
  ['sonarr', sonarrSettings],
  ['radarr', radarrSettings],
] as const)('%s default quality profile', (id, settings) => {
  it('is saved, offered to the add form, and cleared again', async () => {
    stubArr();
    const { app, store } = await startApp({ [id]: settings });
    const options = async () => (await app.inject({ url: `/api/${id}/add-options` })).json();

    expect((await options()).defaultQualityProfileId).toBeNull();

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/${id}/add-defaults`,
      payload: { qualityProfileId: 7 },
    });
    expect(saved.statusCode).toBe(204);
    expect(store.get(id)?.defaultQualityProfileId).toBe(7);
    expect((await options()).defaultQualityProfileId).toBe(7);

    await app.inject({
      method: 'PUT',
      url: `/api/${id}/add-defaults`,
      payload: { qualityProfileId: null },
    });
    expect(store.get(id)?.defaultQualityProfileId).toBeUndefined();
    expect((await options()).defaultQualityProfileId).toBeNull();
  });

  it('refuses a profile the service does not have, or bad input', async () => {
    stubArr();
    const { app, store } = await startApp({ [id]: settings });
    for (const payload of [{ qualityProfileId: 99 }, { qualityProfileId: 'HD' }, {}]) {
      const res = await app.inject({ method: 'PUT', url: `/api/${id}/add-defaults`, payload });
      expect(res.statusCode).toBe(400);
    }
    expect(store.get(id)?.defaultQualityProfileId).toBeUndefined();
  });

  it('offers no default once the saved profile is gone from the service', async () => {
    stubArr();
    const { app, store } = await startApp({ [id]: settings });
    await store.setDefaultQualityProfile(id, 42);
    const res = await app.inject({ url: `/api/${id}/add-options` });
    expect(res.json().defaultQualityProfileId).toBeNull();
  });

  it('keeps the default when settings are saved again, drops it for a new address', async () => {
    stubArr();
    const { app, store } = await startApp({ [id]: settings });
    await store.setDefaultQualityProfile(id, 7);
    const save = (url: string) =>
      app.inject({ method: 'PUT', url: `/api/${id}/settings`, payload: { url, force: true } });

    await save(settings.url);
    expect(store.get(id)?.defaultQualityProfileId).toBe(7);
    await app.inject({
      method: 'PUT',
      url: `/api/${id}/settings`,
      payload: { url: 'http://other.lan', apiKey: 'new-key', force: true },
    });
    expect(store.get(id)?.defaultQualityProfileId).toBeUndefined();
  });
});
