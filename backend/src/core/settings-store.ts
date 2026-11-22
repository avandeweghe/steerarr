import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJsonFile } from './json-file.js';

export { SettingsWriteError } from './json-file.js';

/** Saved connection settings for one service. */
export interface ArrServiceConfig {
  url: string;
  /** The secret: the API key, or the password for services that log in with a username. */
  apiKey: string;
  /** For services that log in with a username and password (e.g. NZBGet). */
  username?: string;
  /** The quality profile the add form starts with (Sonarr, Radarr). */
  defaultQualityProfileId?: number;
}

const entrySchema = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
  username: z.string().min(1).optional(),
  defaultQualityProfileId: z.number().int().positive().optional(),
});

/**
 * Service settings saved from the app, kept in memory and persisted to a JSON file
 * (`<dataDir>/services.json`, mode 0600, `{ "<id>": { "url", "apiKey", "username"? } }`).
 *
 * Reads come from memory. Writes are queued so they never interleave, go to a temp file that is
 * then renamed into place, and only update memory once the file is written. A missing or
 * unreadable file means "nothing configured"; it never stops the server from starting.
 */
export class ArrSettingsStore {
  readonly #path: string;
  #settings: ReadonlyMap<string, ArrServiceConfig>;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string, onWarning: (message: string) => void = () => {}) {
    this.#path = path;
    this.#settings = load(path, onWarning);
  }

  static inDataDir(dataDir: string, onWarning?: (message: string) => void): ArrSettingsStore {
    return new ArrSettingsStore(join(dataDir, 'services.json'), onWarning);
  }

  /** The saved settings for a service. The same object is returned until they change. */
  get(id: string): ArrServiceConfig | null {
    return this.#settings.get(id) ?? null;
  }

  isConfigured(id: string): boolean {
    return this.#settings.has(id);
  }

  /**
   * Saves connection settings. Preferences such as the default quality profile are kept while
   * the address stays the same; another server has its own profiles, so they're dropped then.
   */
  set(id: string, config: ArrServiceConfig): Promise<void> {
    const entry: ArrServiceConfig = { url: config.url, apiKey: config.apiKey };
    if (config.username) entry.username = config.username;
    return this.#update((draft) => {
      const previous = draft.get(id);
      if (previous?.url === entry.url && previous.defaultQualityProfileId !== undefined) {
        entry.defaultQualityProfileId = previous.defaultQualityProfileId;
      }
      draft.set(id, entry);
    });
  }

  /** Sets (or with null, clears) the quality profile a service's add form starts with. */
  setDefaultQualityProfile(id: string, profileId: number | null): Promise<void> {
    return this.#update((draft) => {
      const current = draft.get(id);
      if (!current) return;
      const { defaultQualityProfileId: _old, ...rest } = current;
      draft.set(id, profileId === null ? rest : { ...rest, defaultQualityProfileId: profileId });
    });
  }

  remove(id: string): Promise<void> {
    return this.#update((draft) => draft.delete(id));
  }

  #update(change: (draft: Map<string, ArrServiceConfig>) => void): Promise<void> {
    const run = this.#queue.then(async () => {
      const next = new Map(this.#settings);
      change(next);
      await this.#write(next);
      this.#settings = next;
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  #write(settings: ReadonlyMap<string, ArrServiceConfig>): Promise<void> {
    return writeJsonFile(this.#path, Object.fromEntries(settings));
  }
}

function load(path: string, warn: (message: string) => void): Map<string, ArrServiceConfig> {
  const settings = new Map<string, ArrServiceConfig>();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') {
      warn(`Couldn't read ${path}: ${(err as Error).message}. Starting with no services set up.`);
    }
    return settings;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    warn(`${path} isn't valid JSON. Starting with no services set up.`);
    return settings;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    warn(`${path} doesn't contain a settings object. Starting with no services set up.`);
    return settings;
  }

  for (const [id, entry] of Object.entries(data)) {
    const parsed = entrySchema.safeParse(entry);
    if (parsed.success) settings.set(id, parsed.data);
    else warn(`Ignoring invalid settings for "${id}" in ${path}.`);
  }
  return settings;
}
