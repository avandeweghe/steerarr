import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ProwlarrDownloadClient,
  ProwlarrHealthCheck,
  ProwlarrIndexer,
  ProwlarrResult,
  ProwlarrSearchKind,
  ProwlarrStatus,
  ProwlarrStatusPage,
  ServiceSummary,
} from '@steerarr/shared';
import { httpsUrl } from '../../core/arr-helpers.js';
import { toArrStatus } from '../../core/arr-service.js';
import { BadRequestError } from '../../core/errors.js';
import { UpstreamError } from '../../core/upstream-error.js';
import type { ProwlarrClient } from './client.js';
import type { HealthResource, SearchResource } from './types.js';

/** Newznab/Torznab top categories (each covers its sub-categories). */
const CATEGORIES: Record<ProwlarrSearchKind, number[]> = {
  all: [],
  movies: [2000],
  tv: [5000],
  audio: [3000],
  books: [7000],
};

/** Plenty for a phone; Prowlarr asks each indexer for up to this many. */
const RESULT_LIMIT = 100;
const HOUR_MS = 3_600_000;

const searchQuery = z.object({
  query: z.string().trim().min(1).max(200),
  kind: z.enum(['all', 'movies', 'tv', 'audio', 'books']).default('all'),
  // "1,4": a comma-separated list of indexer ids; empty or left out for all.
  indexers: z
    .string()
    .regex(/^(\d+(,\d+)*)?$/)
    .default(''),
});
const grabBody = z.object({
  guid: z.string().min(1).max(4096),
  indexerId: z.number().int().positive(),
  downloadClientId: z.number().int().positive().optional(),
});

const LEVEL_ORDER: Record<ProwlarrHealthCheck['level'], number> = {
  error: 0,
  warning: 1,
  notice: 2,
};

/** Routes under /api/prowlarr. Each returns a trimmed DTO, never the raw Prowlarr response. */
export function prowlarrRoutes(getClient: () => ProwlarrClient) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/system/status', async (): Promise<ProwlarrStatus> => {
      return toArrStatus(await getClient().getSystemStatus());
    });

    // The Home screen's card.
    app.get('/summary', async (): Promise<ServiceSummary> => {
      const client = getClient();
      const [status, indexers, failing, health] = await Promise.all([
        client.getSystemStatus(),
        client.getIndexers(),
        client.getIndexerStatus(),
        client.getHealth(),
      ]);
      const enabled = indexers.filter((indexer) => indexer.enable).length;
      const paused = failing.filter((item) => isFuture(item.disabledTill)).length;
      const facts = [plural(enabled, 'indexer') + ' enabled'];
      if (paused > 0) facts.push(`${paused} paused after failures`);
      return {
        version: status.version,
        facts,
        issues: health.flatMap((check) => {
          if (check.type !== 'warning' && check.type !== 'error') return [];
          return [{ level: check.type, message: check.message || 'Prowlarr reports a problem.' }];
        }),
      };
    });

    app.get('/indexers', async (): Promise<ProwlarrIndexer[]> => {
      const client = getClient();
      const [indexers, statuses] = await Promise.all([
        client.getIndexers(),
        client.getIndexerStatus(),
      ]);
      const byIndexer = new Map(statuses.map((status) => [status.indexerId, status]));
      return indexers
        .map((indexer): ProwlarrIndexer => {
          const status = byIndexer.get(indexer.id);
          return {
            id: indexer.id,
            name: indexer.name || `Indexer ${indexer.id}`,
            enabled: indexer.enable,
            protocol: indexer.protocol,
            privacy: indexer.privacy || null,
            disabledUntil: isFuture(status?.disabledTill) ? (status?.disabledTill ?? null) : null,
            lastFailure: status?.mostRecentFailure || null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    app.get('/download-clients', async (): Promise<ProwlarrDownloadClient[]> => {
      const clients = await getClient().getDownloadClients();
      return clients
        .filter((item) => item.enable)
        .map((item) => ({
          id: item.id,
          name: item.name || `Download client ${item.id}`,
          protocol: item.protocol,
        }));
    });

    app.get('/search', async (request): Promise<ProwlarrResult[]> => {
      const parsed = searchQuery.safeParse(request.query);
      if (!parsed.success) {
        throw new BadRequestError('Type something to search for (up to 200 characters).');
      }
      const { query, kind, indexers } = parsed.data;
      const results = await getClient().search({
        query,
        indexerIds: indexers ? indexers.split(',').map(Number) : [],
        categories: CATEGORIES[kind],
        limit: RESULT_LIMIT,
      });
      const now = Date.now();
      // Results without a guid can't be grabbed, so they're left out.
      return results.flatMap((result) => (result.guid ? [toResult(result, now)] : []));
    });

    app.post('/grab', async (request, reply) => {
      const parsed = grabBody.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Send the guid and indexerId of a result from a search.');
      }
      const { guid, indexerId, downloadClientId } = parsed.data;
      try {
        await getClient().grab(guid, indexerId, downloadClientId);
      } catch (err) {
        // Prowlarr only grabs results it still has from a recent search.
        if (err instanceof UpstreamError && err.status === 404) {
          throw new BadRequestError('Prowlarr no longer has this result. Search again.');
        }
        throw err;
      }
      return reply.status(204).send();
    });

    app.get('/status', async (): Promise<ProwlarrStatusPage> => {
      const client = getClient();
      const [status, health] = await Promise.all([client.getSystemStatus(), client.getHealth()]);
      return {
        version: status.version,
        branch: status.branch,
        startTime: status.startTime,
        health: health
          .flatMap(toHealthCheck)
          .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]),
      };
    });
  };
}

function toResult(resource: SearchResource, now: number): ProwlarrResult {
  const torrent = resource.protocol === 'torrent';
  return {
    guid: resource.guid ?? '',
    indexerId: resource.indexerId,
    indexer: resource.indexer || 'Unknown indexer',
    title: resource.title || 'Untitled release',
    size: resource.size ?? 0,
    ageHours: ageHours(resource, now),
    protocol: resource.protocol,
    seeders: torrent ? (resource.seeders ?? null) : null,
    leechers: torrent ? (resource.leechers ?? null) : null,
    grabs: resource.grabs ?? null,
    categories: (resource.categories ?? []).flatMap((item) => (item.name ? [item.name] : [])),
    infoUrl: httpsUrl(resource.infoUrl),
  };
}

/** From the publish date when there is one; Prowlarr's own ageHours is rounded. */
function ageHours(resource: SearchResource, now: number): number | null {
  const published = resource.publishDate ? Date.parse(resource.publishDate) : NaN;
  if (!Number.isNaN(published)) return Math.max(0, (now - published) / HOUR_MS);
  return resource.ageHours ?? null;
}

function toHealthCheck(resource: HealthResource): ProwlarrHealthCheck[] {
  if (resource.type === 'ok') return [];
  const check: ProwlarrHealthCheck = {
    source: resource.source || null,
    level: resource.type,
    message: resource.message || 'Prowlarr reports a problem.',
    wikiUrl: httpsUrl(resource.wikiUrl),
  };
  return [check];
}

function isFuture(value: string | null | undefined): boolean {
  return value ? Date.parse(value) > Date.now() : false;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
