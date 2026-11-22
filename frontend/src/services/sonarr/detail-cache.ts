import type { SonarrSeriesDetail } from '@steerarr/shared';
import { services } from '../../lib/services.svelte';

/**
 * Series pages loaded this session, so going back to one shows it instantly while it
 * refreshes. Dropped when settings change (services.revision): Sonarr may be another server.
 */
const cache = new Map<number, { revision: number; series: SonarrSeriesDetail }>();

export function cachedDetail(id: number): SonarrSeriesDetail | null {
  const hit = cache.get(id);
  return hit?.revision === services.revision ? hit.series : null;
}

/** `revision` is services.revision from when the request started. */
export function cacheDetail(id: number, revision: number, series: SonarrSeriesDetail): void {
  cache.set(id, { revision, series });
}
