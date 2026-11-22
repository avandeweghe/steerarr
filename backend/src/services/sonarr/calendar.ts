import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SonarrCalendarEpisode } from '@steerarr/shared';
import { BadRequestError } from '../../core/errors.js';
import type { SonarrClient } from './client.js';
import { posterUrl } from './posters.js';
import type { CalendarResource } from './types.js';

/** The longest range the app may ask for at once. */
const MAX_DAYS = 62;
const DAY_MS = 86_400_000;

const calendarQuery = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});

const QUERY_MESSAGE = `Send start and end as ISO 8601 times, at most ${MAX_DAYS} days apart.`;

/** Calendar: monitored episodes airing in a range, under /api/sonarr. */
export async function calendarRoutes(
  app: FastifyInstance,
  getClient: () => SonarrClient,
): Promise<void> {
  // The app sends the range, since only the phone knows where its days start and end.
  app.get('/calendar', async (request): Promise<SonarrCalendarEpisode[]> => {
    const parsed = calendarQuery.safeParse(request.query);
    if (!parsed.success) throw new BadRequestError(QUERY_MESSAGE);
    const start = new Date(parsed.data.start);
    const end = new Date(parsed.data.end);
    const span = end.getTime() - start.getTime();
    if (span <= 0 || span > MAX_DAYS * DAY_MS) throw new BadRequestError(QUERY_MESSAGE);

    const client = getClient();
    const [episodes, queue] = await Promise.all([
      client.getCalendar(start.toISOString(), end.toISOString()),
      client.getQueue(),
    ]);
    const downloading = new Set(
      (queue.records ?? []).flatMap((item) => (item.episodeId ? [item.episodeId] : [])),
    );
    return episodes
      .flatMap((episode) => toCalendarEpisode(episode, downloading))
      .sort((a, b) => a.airDateUtc.localeCompare(b.airDateUtc) || a.id - b.id);
  });
}

/** Episodes without an air time can't be placed on a day, so they're left out. */
function toCalendarEpisode(
  resource: CalendarResource,
  downloading: ReadonlySet<number>,
): SonarrCalendarEpisode[] {
  if (!resource.airDateUtc) return [];
  const series = resource.series;
  const runtime = resource.runtime || series?.runtime || null;
  const episode: SonarrCalendarEpisode = {
    id: resource.id,
    seriesId: resource.seriesId,
    seriesTitle: series?.title || 'Unknown series',
    network: series?.network || null,
    posterUrl: series ? posterUrl(series) : null,
    episode: {
      seasonNumber: resource.seasonNumber,
      episodeNumber: resource.episodeNumber,
      title: resource.title || null,
    },
    airDateUtc: new Date(resource.airDateUtc).toISOString(),
    runtime,
    hasFile: resource.hasFile,
    downloading: !resource.hasFile && downloading.has(resource.id),
    finale: resource.finaleType ?? null,
  };
  return [episode];
}
