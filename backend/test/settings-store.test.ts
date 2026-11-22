import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArrSettingsStore, SettingsWriteError } from '../src/core/settings-store.js';
import { cleanup, makeDataDir, sonarrSettings } from './helpers.js';

afterEach(cleanup);

const radarrSettings = { url: 'http://radarr.lan:7878', apiKey: 'radarr-key' };

describe('ArrSettingsStore', () => {
  it('starts empty when there is no file yet', () => {
    const store = ArrSettingsStore.inDataDir(makeDataDir());
    expect(store.get('sonarr')).toBeNull();
    expect(store.isConfigured('sonarr')).toBe(false);
  });

  it('saves to services.json and loads it again', async () => {
    const dir = makeDataDir();
    await ArrSettingsStore.inDataDir(dir).set('sonarr', sonarrSettings);

    expect(JSON.parse(readFileSync(join(dir, 'services.json'), 'utf8'))).toEqual({
      sonarr: sonarrSettings,
    });
    expect(ArrSettingsStore.inDataDir(dir).get('sonarr')).toEqual(sonarrSettings);
  });

  it('creates the data folder if needed and leaves no temp files', async () => {
    const dir = join(makeDataDir(), 'nested', 'data');
    await ArrSettingsStore.inDataDir(dir).set('sonarr', sonarrSettings);
    expect(readdirSync(dir)).toEqual(['services.json']);
  });

  it.skipIf(process.platform === 'win32')('makes the file readable by its owner only', async () => {
    const dir = makeDataDir();
    await ArrSettingsStore.inDataDir(dir).set('sonarr', sonarrSettings);
    expect(statSync(join(dir, 'services.json')).mode & 0o777).toBe(0o600);
  });

  it('returns the same object until the settings change', async () => {
    const store = ArrSettingsStore.inDataDir(makeDataDir());
    await store.set('sonarr', sonarrSettings);
    const first = store.get('sonarr');
    expect(store.get('sonarr')).toBe(first);
    await store.set('sonarr', { ...sonarrSettings, apiKey: 'other' });
    expect(store.get('sonarr')).not.toBe(first);
  });

  it('removes settings and keeps the others', async () => {
    const dir = makeDataDir();
    const store = ArrSettingsStore.inDataDir(dir);
    await store.set('sonarr', sonarrSettings);
    await store.set('radarr', radarrSettings);
    await store.remove('sonarr');
    expect(store.get('sonarr')).toBeNull();
    expect(ArrSettingsStore.inDataDir(dir).get('radarr')).toEqual(radarrSettings);
  });

  it("doesn't lose a change when two saves overlap", async () => {
    const dir = makeDataDir();
    const store = ArrSettingsStore.inDataDir(dir);
    await Promise.all([store.set('sonarr', sonarrSettings), store.set('radarr', radarrSettings)]);
    const reloaded = ArrSettingsStore.inDataDir(dir);
    expect(reloaded.isConfigured('sonarr')).toBe(true);
    expect(reloaded.isConfigured('radarr')).toBe(true);
  });

  it('starts empty, with a warning, when the file is not valid JSON', () => {
    const dir = makeDataDir();
    writeFileSync(join(dir, 'services.json'), '{ nope');
    const warn = vi.fn();
    expect(ArrSettingsStore.inDataDir(dir, warn).get('sonarr')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("isn't valid JSON"));
  });

  it('skips invalid entries and keeps valid ones', () => {
    const dir = makeDataDir();
    writeFileSync(
      join(dir, 'services.json'),
      JSON.stringify({ sonarr: sonarrSettings, radarr: { url: 'http://radarr.lan' } }),
    );
    const warn = vi.fn();
    const store = ArrSettingsStore.inDataDir(dir, warn);
    expect(store.get('sonarr')).toEqual(sonarrSettings);
    expect(store.get('radarr')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"radarr"'));
  });

  it('throws SettingsWriteError and keeps the old settings when saving fails', async () => {
    const blocker = join(makeDataDir(), 'not-a-folder');
    writeFileSync(blocker, '');
    const store = ArrSettingsStore.inDataDir(join(blocker, 'data'));

    const error = await store.set('sonarr', sonarrSettings).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SettingsWriteError);
    expect((error as Error).message).toContain('data folder is writable');
    expect((error as Error).message).not.toContain(sonarrSettings.apiKey);
    expect(store.get('sonarr')).toBeNull();

    // A failed write doesn't jam the queue for later ones.
    await expect(store.remove('sonarr')).rejects.toThrow(SettingsWriteError);
  });
});
