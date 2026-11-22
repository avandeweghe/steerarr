import type { RadarrMovieDetail } from '@steerarr/shared';
import { services } from '../../lib/services.svelte';

/**
 * Movie pages loaded this session, so going back to one shows it instantly while it
 * refreshes. Dropped when settings change (services.revision): Radarr may be another server.
 */
const cache = new Map<number, { revision: number; movie: RadarrMovieDetail }>();

export function cachedDetail(id: number): RadarrMovieDetail | null {
  const hit = cache.get(id);
  return hit?.revision === services.revision ? hit.movie : null;
}

/** `revision` is services.revision from when the request started. */
export function cacheDetail(id: number, revision: number, movie: RadarrMovieDetail): void {
  cache.set(id, { revision, movie });
}
