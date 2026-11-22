import type { MediaCoverResource } from './types.js';

/**
 * The URL of a series' poster as Steerarr serves it, or null when Sonarr has none. Relative to
 * the app (no leading slash), so it works under any path behind a proxy. It carries Sonarr's
 * lastWrite stamp, so a new poster gets a new URL and the old one can be cached for a year.
 * Sonarr's calendar lists only TheTVDB's URL; then the URL has no stamp (cached for a day).
 */
export function posterUrl(series: { id: number; images?: MediaCoverResource[] | null }) {
  const poster = (series.images ?? []).find((image) => image.coverType === 'poster');
  if (!poster) return null;
  const base = `api/sonarr/series/${series.id}/poster`;
  if (!poster.url) return base;
  const lastWrite = new URL(poster.url, 'http://sonarr.invalid').searchParams.get('lastWrite');
  return lastWrite ? `${base}?v=${encodeURIComponent(lastWrite)}` : base;
}
