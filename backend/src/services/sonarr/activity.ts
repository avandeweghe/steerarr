import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  SonarrEpisodeRef,
  SonarrHistoryEvent,
  SonarrHistoryItem,
  SonarrPage,
  SonarrQueueItem,
  SonarrWantedEpisode,
} from '@steerarr/shared';
import { parseTimeLeft } from '../../core/arr-helpers.js';
import { BadRequestError } from '../../core/errors.js';

export { parseTimeLeft };
import type { SonarrClient } from './client.js';
import type {
  HistoryResource,
  PagingResource,
  QueueResource,
  WantedEpisodeResource,
} from './types.js';

/** History and wanted lists come 50 at a time; the app asks for more pages as needed. */
const PAGE_SIZE = 50;

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const queueParams = z.object({ id: z.coerce.number().int().positive() });
const removeQuery = z.object({ blocklist: z.enum(['true', 'false']).default('false') });
const wantedParams = z.object({ list: z.enum(['missing', 'cutoff']) });

/** Activity (queue and history) and Wanted (missing, cutoff not met), under /api/sonarr. */
export async function activityRoutes(
  app: FastifyInstance,
  getClient: () => SonarrClient,
): Promise<void> {
  app.get('/queue', async (): Promise<SonarrQueueItem[]> => {
    const queue = await getClient().getQueue();
    return (queue.records ?? []).map(toQueueItem);
  });

  app.delete('/queue/:id', async (request, reply) => {
    const params = queueParams.safeParse(request.params);
    if (!params.success) throw new BadRequestError('The queue id must be a positive number.');
    const query = removeQuery.safeParse(request.query);
    if (!query.success) throw new BadRequestError('blocklist must be true or false.');
    await getClient().removeFromQueue(params.data.id, query.data.blocklist === 'true');
    return reply.status(204).send();
  });

  app.get('/history', async (request): Promise<SonarrPage<SonarrHistoryItem>> => {
    const page = parsePage(request.query);
    return toPage(await getClient().getHistory(page, PAGE_SIZE), toHistoryItem);
  });

  app.get('/wanted/:list', async (request): Promise<SonarrPage<SonarrWantedEpisode>> => {
    const params = wantedParams.safeParse(request.params);
    if (!params.success) throw new BadRequestError('The list must be missing or cutoff.');
    const page = parsePage(request.query);
    const wanted = await getClient().getWanted(params.data.list, page, PAGE_SIZE);
    return toPage(wanted, toWantedEpisode);
  });
}

function parsePage(query: unknown): number {
  const parsed = pageQuery.safeParse(query);
  if (!parsed.success) throw new BadRequestError('The page must be a number from 1.');
  return parsed.data.page;
}

function toPage<From, To>(resource: PagingResource<From>, map: (item: From) => To): SonarrPage<To> {
  return {
    page: resource.page,
    pageSize: resource.pageSize,
    totalRecords: resource.totalRecords,
    records: (resource.records ?? []).map(map),
  };
}

function toQueueItem(resource: QueueResource): SonarrQueueItem {
  return {
    id: resource.id,
    title: resource.title || 'Unknown release',
    seriesId: resource.seriesId ?? null,
    seriesTitle: resource.series?.title || null,
    episode: toEpisodeRef(resource.episode),
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

/** Sonarr's status messages, flattened: "title: message", or the title alone. */
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

const HISTORY_EVENTS: Record<string, SonarrHistoryEvent> = {
  grabbed: 'grabbed',
  seriesFolderImported: 'imported',
  downloadFolderImported: 'imported',
  downloadFailed: 'failed',
  episodeFileDeleted: 'deleted',
  episodeFileRenamed: 'renamed',
  downloadIgnored: 'ignored',
};

const DELETE_REASONS: Record<string, string> = {
  Manual: 'Deleted by hand',
  MissingFromDisk: 'The file was missing from disk',
  Upgrade: 'Replaced by a better file',
};

function toHistoryItem(resource: HistoryResource): SonarrHistoryItem {
  const event = HISTORY_EVENTS[resource.eventType] ?? 'unknown';
  return {
    id: resource.id,
    event,
    date: resource.date,
    sourceTitle: resource.sourceTitle || 'Unknown',
    quality: resource.quality?.quality?.name || 'Unknown',
    seriesId: resource.seriesId,
    seriesTitle: resource.series?.title || null,
    episode: toEpisodeRef(resource.episode),
    detail: historyDetail(event, resource.data ?? {}),
  };
}

function historyDetail(
  event: SonarrHistoryEvent,
  data: Record<string, string | null>,
): string | null {
  if (event === 'grabbed') return data.indexer ? `From ${data.indexer}` : null;
  if (event === 'failed' || event === 'ignored') return data.message || null;
  if (event === 'deleted') return (data.reason && DELETE_REASONS[data.reason]) || null;
  return null;
}

function toWantedEpisode(resource: WantedEpisodeResource): SonarrWantedEpisode {
  const file = resource.hasFile ? resource.episodeFile : undefined;
  return {
    id: resource.id,
    seriesId: resource.seriesId,
    seriesTitle: resource.series?.title || 'Unknown series',
    episode: {
      seasonNumber: resource.seasonNumber,
      episodeNumber: resource.episodeNumber,
      title: resource.title || null,
    },
    airDateUtc: resource.airDateUtc || null,
    quality: file?.quality?.quality?.name || null,
  };
}

type EpisodeSummary = { seasonNumber: number; episodeNumber: number; title?: string | null };

function toEpisodeRef(episode: EpisodeSummary | null | undefined): SonarrEpisodeRef | null {
  if (!episode) return null;
  const { seasonNumber, episodeNumber } = episode;
  return { seasonNumber, episodeNumber, title: episode.title || null };
}
