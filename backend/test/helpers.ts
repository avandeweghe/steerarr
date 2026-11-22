import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadAppConfig, type AppConfig } from '../src/config.js';
import { ArrSettingsStore, type ArrServiceConfig } from '../src/core/settings-store.js';

export const sonarrSettings: ArrServiceConfig = {
  url: 'http://sonarr.lan:8989',
  apiKey: 'secret-key',
};

export const prowlarrSettings: ArrServiceConfig = {
  url: 'http://prowlarr.lan:9696',
  apiKey: 'prowlarr-key',
};

export const radarrSettings: ArrServiceConfig = {
  url: 'http://radarr.lan:7878',
  apiKey: 'radarr-key',
};

/** A raw Sonarr /system/status response, with extra fields the app must not pass through. */
export const sonarrStatus = {
  appName: 'Sonarr',
  instanceName: 'Sonarr',
  version: '4.0.20.3014',
  branch: 'main',
  startTime: '2026-11-20T10:00:00Z',
  appData: '/config',
  isDocker: true,
};

const cleanups: Array<() => Promise<void>> = [];

/** A fresh temp data folder, removed again by `cleanup()`. */
export function makeDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'steerarr-test-'));
  cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Builds the app with its own temp data folder, optionally with saved service settings. */
export async function startApp(
  saved: Record<string, ArrServiceConfig> = {},
  overrides: Partial<AppConfig> = {},
): Promise<{ app: FastifyInstance; store: ArrSettingsStore; dataDir: string }> {
  const dataDir = makeDataDir();
  const store = ArrSettingsStore.inDataDir(dataDir);
  for (const [id, config] of Object.entries(saved)) await store.set(id, config);
  const app = await buildApp({
    config: { ...loadAppConfig({}), logLevel: 'silent', dataDir, ...overrides },
    store,
  });
  cleanups.push(() => app.close());
  return { app, store, dataDir };
}

/** Replaces global fetch, i.e. every call to an upstream service. */
export function stubFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: URL, init: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function apiKeyHeader(init: RequestInit | undefined): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.['X-Api-Key'];
}

export async function cleanup(): Promise<void> {
  while (cleanups.length > 0) await cleanups.pop()!();
  vi.unstubAllGlobals();
}
