import type { SonarrLookupResult, SonarrMonitorOption } from '@steerarr/shared';
import { services } from '../../lib/services.svelte';

/**
 * The latest TheTVDB search on the Add series page, kept while you look at a result and come
 * back. Dropped when settings change (services.revision): "already added" depends on the server.
 */
interface LastSearch {
  term: string;
  results: SonarrLookupResult[] | null;
  revision: number;
}

const lastSearch: LastSearch = { term: '', results: null, revision: 0 };

export function cachedSearch(): { term: string; results: SonarrLookupResult[] | null } {
  if (lastSearch.revision !== services.revision) return { term: '', results: null };
  return lastSearch;
}

export function rememberSearch(term: string, results: SonarrLookupResult[]): void {
  lastSearch.term = term;
  lastSearch.results = results;
  lastSearch.revision = services.revision;
}

/** A search result by TVDB id, if the last search had it. */
export function cachedResult(tvdbId: number): SonarrLookupResult | null {
  return cachedSearch().results?.find((result) => result.tvdbId === tvdbId) ?? null;
}

/** Marks a result as added, so going back to the search shows it as in Sonarr. */
export function markAdded(tvdbId: number, seriesId: number): void {
  const result = cachedResult(tvdbId);
  if (result) result.existingId = seriesId;
}

/** The add form's choices from last time, kept on this device. */
export interface AddDefaults {
  qualityProfileId: number;
  rootFolderPath: string;
  monitor: SonarrMonitorOption;
  seasonFolder: boolean;
  monitorNewSeasons: boolean;
  search: boolean;
}

const DEFAULTS_KEY = 'steerarr:sonarr:add-defaults';

export function loadAddDefaults(): Partial<AddDefaults> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null');
    return typeof saved === 'object' && saved !== null ? (saved as Partial<AddDefaults>) : {};
  } catch {
    // Storage can be unavailable (private mode) or hold something unreadable.
    return {};
  }
}

export function saveAddDefaults(defaults: AddDefaults): void {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
  } catch {
    // Not being able to remember them is fine.
  }
}
