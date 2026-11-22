import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  RadarrCalendarEntry,
  RadarrCommand,
  RadarrHealthCheck,
  RadarrHistoryEvent,
  RadarrHistoryItem,
  RadarrPage,
  RadarrQueueItem,
  RadarrReleaseKind,
  RadarrRootFolderSpace,
  RadarrStatusPage,
  RadarrWantedMovie,
} from '@steerarr/shared';
import { diskOf, httpsUrl, parseTimeLeft } from '../../core/arr-helpers.js';
import { BadRequestError } from '../../core/errors.js';
import type { RadarrClient } from './client.js';
import { fileQuality, parse, posterUrl, startSearchCommand } from './mappers.js';
import type {
  DiskSpaceResource,
  HealthResource,
  HistoryResource,
  MovieResource,
  PagingResource,
  QueueResource,
  RootFolderResource,
} from './types.js';

/** History and wanted lists come 50 at a time; the app asks for more pages as needed. */
const PAGE_SIZE = 50;
/** The longest calendar range the app may ask for at once. */
const MAX_DAYS = 62;
const DAY_MS = 86_400_000;

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const queueParams = z.object({ id: z.coerce.number().int().positive() });
const removeQuery = z.object({ blocklist: z.enum(['true', 'false']).default('false') });
const wantedParams = z.object({ list: z.enum(['missing', 'cutoff']) });
const calendarQuery = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});
const CALENDAR_MESSAGE = `Send start and end as ISO 8601 times, at most ${MAX_DAYS} days apart.`;

const LEVEL_ORDER: Record<RadarrHealthCheck['level'], number> = { error: 0, warning: 1, notice: 2 };

/** Activity, Wanted, Calendar and Status, under /api/radarr. */
export async function listRoutes(
  app: FastifyInstance,
  getClient: () => RadarrClient,
): Promise<void> {
  app.get('/queue', async (): Promise<RadarrQueueItem[]> => {
    const queue = await getClient().getQueue();
    return (queue.records ?? []).map(toQueueItem);
  });

  app.delete('/queue/:id', async (request, reply) => {
    const { id } = parse(queueParams, request.params, 'The queue id must be a positive number.');
    const query = parse(removeQuery, request.query, 'blocklist must be true or false.');
    await getClient().removeFromQueue(id, query.blocklist === 'true');
    return reply.status(204).send();
  });

  app.get('/history', async (request): Promise<RadarrPage<RadarrHistoryItem>> => {
    const { page } = parse(pageQuery, request.query, 'The page must be a number from 1.');
    return toPage(await getClient().getHistory(page, PAGE_SIZE), toHistoryItem);
  });

  app.get('/wanted/:list', async (request): Promise<RadarrPage<RadarrWantedMovie>> => {
    const { list } = parse(wantedParams, request.params, 'The list must be missing or cutoff.');
    const { page } = parse(pageQuery, request.query, 'The page must be a number from 1.');
    const wanted = await getClient().getWanted(list, page, PAGE_SIZE);
    const now = Date.now();
    return toPage(wanted, (movie) => toWantedMovie(movie, list === 'cutoff', now));
  });

  // Searches every monitored movie on the list: Radarr's own "Search all".
  app.post('/wanted/:list/search', async (request): Promise<RadarrCommand> => {
    const { list } = parse(wantedParams, request.params, 'The list must be missing or cutoff.');
    const name = list === 'missing' ? 'MissingMoviesSearch' : 'CutoffUnmetMoviesSearch';
    return startSearchCommand(getClient(), { name, monitored: true });
  });

  // The app sends the range, since only the phone knows where its days start and end.
  app.get('/calendar', async (request): Promise<RadarrCalendarEntry[]> => {
    const range = parse(calendarQuery, request.query, CALENDAR_MESSAGE);
    const start = new Date(range.start);
    const end = new Date(range.end);
    const span = end.getTime() - start.getTime();
    if (span <= 0 || span > MAX_DAYS * DAY_MS) throw new BadRequestError(CALENDAR_MESSAGE);

    const client = getClient();
    const [movies, queue] = await Promise.all([
      client.getCalendar(start.toISOString(), end.toISOString()),
      client.getQueue(),
    ]);
    const downloading = new Set(
      (queue.records ?? []).flatMap((item) => (item.movieId ? [item.movieId] : [])),
    );
    return movies
      .flatMap((movie) => toCalendarEntries(movie, start, end, downloading))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  });

  app.get('/status', async (): Promise<RadarrStatusPage> => {
    const client = getClient();
    const [status, health, folders, disks] = await Promise.all([
      client.getSystemStatus(),
      client.getHealth(),
      client.getRootFolders(),
      client.getDiskSpace(),
    ]);
    return {
      version: status.version,
      branch: status.branch,
      startTime: status.startTime,
      health: health
        .flatMap(toHealthCheck)
        .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]),
      rootFolders: folders.flatMap((folder) => toRootFolderSpace(folder, disks)),
    };
  });
}

function toPage<From, To>(resource: PagingResource<From>, map: (item: From) => To): RadarrPage<To> {
  return {
    page: resource.page,
    pageSize: resource.pageSize,
    totalRecords: resource.totalRecords,
    records: (resource.records ?? []).map(map),
  };
}

function toQueueItem(resource: QueueResource): RadarrQueueItem {
  return {
    id: resource.id,
    title: resource.title || 'Unknown release',
    movieId: resource.movieId ?? null,
    movieTitle: resource.movie?.title || null,
    movieYear: resource.movie?.year || null,
    quality: resource.quality?.quality?.name || 'Unknown',
    size: resource.size,
    sizeLeft: resource.sizeleft,
    timeLeft: parseTimeLeft(resource.timeleft),
    status: resource.status,
    state: resource.trackedDownloadState ?? null,
    health: resource.trackedDownloadStatus ?? 'ok',
    messages: queueMessages(resource),
    protocol: resource.protocol,
    downloadClient: resource.downloadClient || null,
    indexer: resource.indexer || null,
  };
}

/** Radarr's status messages, flattened: each message, or the title when it has none. */
function queueMessages(resource: QueueResource): string[] {
  const messages: string[] = [];
  for (const group of resource.statusMessages ?? []) {
    const lines = (group.messages ?? []).filter(Boolean);
    if (lines.length === 0 && group.title) messages.push(group.title);
    for (const line of lines) messages.push(line);
  }
  if (resource.errorMessage) messages.push(resource.errorMessage);
  return [...new Set(messages)];
}

const HISTORY_EVENTS: Record<string, RadarrHistoryEvent> = {
  grabbed: 'grabbed',
  downloadFolderImported: 'imported',
  movieFolderImported: 'imported',
  downloadFailed: 'failed',
  movieFileDeleted: 'deleted',
  movieFileRenamed: 'renamed',
  downloadIgnored: 'ignored',
};

const DELETE_REASONS: Record<string, string> = {
  Manual: 'Deleted by hand',
  MissingFromDisk: 'The file was missing from disk',
  Upgrade: 'Replaced by a better file',
};

function toHistoryItem(resource: HistoryResource): RadarrHistoryItem {
  const event = HISTORY_EVENTS[resource.eventType] ?? 'unknown';
  const data = resource.data ?? {};
  return {
    id: resource.id,
    event,
    date: resource.date,
    sourceTitle: resource.sourceTitle || 'Unknown',
    quality: resource.quality?.quality?.name || 'Unknown',
    movieId: resource.movieId,
    movieTitle: resource.movie?.title || null,
    detail: historyDetail(event, data),
  };
}

function historyDetail(
  event: RadarrHistoryEvent,
  data: Record<string, string | null>,
): string | null {
  if (event === 'grabbed') return data.indexer ? `From ${data.indexer}` : null;
  if (event === 'failed' || event === 'ignored') return data.message || null;
  if (event === 'deleted') return (data.reason && DELETE_REASONS[data.reason]) || null;
  return null;
}

/** Released: the first of its digital, physical or cinema releases that has happened. */
function releasedOn(movie: MovieResource, now: number): string | null {
  const dates = [movie.inCinemas, movie.digitalRelease, movie.physicalRelease]
    .flatMap((date) => (date ? [new Date(date).getTime()] : []))
    .filter((time) => !Number.isNaN(time) && time <= now)
    .sort((a, b) => a - b);
  const [first] = dates;
  return first === undefined ? null : new Date(first).toISOString();
}

function toWantedMovie(movie: MovieResource, cutoff: boolean, now: number): RadarrWantedMovie {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    posterUrl: posterUrl(movie),
    quality: cutoff ? fileQuality(movie) : null,
    releasedOn: releasedOn(movie, now),
  };
}

const RELEASES: Array<{ kind: RadarrReleaseKind; field: keyof MovieResource }> = [
  { kind: 'cinemas', field: 'inCinemas' },
  { kind: 'digital', field: 'digitalRelease' },
  { kind: 'physical', field: 'physicalRelease' },
];

/** A movie can be on the calendar up to three times: in cinemas, digital and physical. */
function toCalendarEntries(
  movie: MovieResource,
  start: Date,
  end: Date,
  downloading: ReadonlySet<number>,
): RadarrCalendarEntry[] {
  return RELEASES.flatMap(({ kind, field }) => {
    const value = movie[field];
    if (typeof value !== 'string' || !value) return [];
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date < start || date >= end) return [];
    const entry: RadarrCalendarEntry = {
      movieId: movie.id,
      title: movie.title,
      year: movie.year,
      studio: movie.studio || null,
      posterUrl: posterUrl(movie),
      kind,
      date: date.toISOString(),
      hasFile: movie.hasFile ?? false,
      downloading: !movie.hasFile && downloading.has(movie.id),
    };
    return [entry];
  });
}

/** "ok" checks are nothing to show. */
function toHealthCheck(resource: HealthResource): RadarrHealthCheck[] {
  if (resource.type === 'ok') return [];
  const check: RadarrHealthCheck = {
    source: resource.source || null,
    level: resource.type,
    message: resource.message || 'Radarr reports a problem.',
    wikiUrl: httpsUrl(resource.wikiUrl),
  };
  return [check];
}

/** Root folders without a path can't be shown, so they're left out. */
function toRootFolderSpace(
  folder: RootFolderResource,
  disks: DiskSpaceResource[],
): RadarrRootFolderSpace[] {
  if (!folder.path) return [];
  const disk = diskOf(folder.path, disks);
  const space: RadarrRootFolderSpace = {
    path: folder.path,
    accessible: folder.accessible,
    freeSpace: folder.freeSpace ?? disk?.freeSpace ?? null,
    totalSpace: folder.totalSpace || disk?.totalSpace || null,
  };
  return [space];
}
