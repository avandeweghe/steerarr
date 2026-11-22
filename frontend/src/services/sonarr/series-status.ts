import type { SonarrSeries } from '@steerarr/shared';
import { formatDay } from '../../lib/format';

const STATUS_LABELS = {
  continuing: 'Continuing',
  ended: 'Ended',
  upcoming: 'Upcoming',
  deleted: 'Removed from TheTVDB',
} as const;

/** "Next episode Fri 4 Dec" for a continuing series with a date, else e.g. "Ended". */
export function seriesStatus(series: SonarrSeries): string {
  if (series.status === 'continuing' && series.nextAiring) {
    return `Next episode ${formatDay(series.nextAiring)}`;
  }
  return STATUS_LABELS[series.status];
}

/** "Season 3", or "Specials" for season 0. */
export function seasonName(seasonNumber: number): string {
  return seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`;
}

/** "S02E05", the usual way to name an episode. */
export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `S${pad(seasonNumber)}E${pad(episodeNumber)}`;
}
