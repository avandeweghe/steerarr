import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ServiceSummary,
  SonarrAddOptions,
  SonarrAddResponse,
  SonarrCommand,
  SonarrEpisode,
  SonarrLookupResult,
  SonarrRelease,
  SonarrSeason,
  SonarrSeries,
  SonarrSeriesDetail,
  SonarrStatus,
} from '@steerarr/shared';
import { httpsUrl } from '../../core/arr-helpers.js';
import { toArrStatus } from '../../core/arr-service.js';
import type { ServicePreferences } from '../../core/service-module.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { UpstreamError } from '../../core/upstream-error.js';
import { activityRoutes } from './activity.js';
import { calendarRoutes } from './calendar.js';
import { posterUrl } from './posters.js';
import { statusRoutes } from './status.js';
import type { ReleaseQuery, SearchCommand, SonarrClient } from './client.js';
import type {
  CommandResource,
  EpisodeResource,
  LookupResource,
  ReleaseResource,
  RootFolderResource,
  SeasonResource,
  SeriesResource,
} from './types.js';

const id = z.coerce.number().int().positive();
const idParams = z.object({ id });
const seasonParams = z.object({ id, season: z.coerce.number().int().min(0) });
const monitorBody = z.object({ monitored: z.boolean() });
const deleteQuery = z.object({
  deleteFiles: z.enum(['true', 'false']).default('false'),
  exclude: z.enum(['true', 'false']).default('false'),
});
const addDefaultsBody = z.object({ qualityProfileId: z.number().int().positive().nullable() });
const listQuery = z.object({ monitored: z.enum(['true', 'false']).default('false') });
const wantedParams = z.object({ list: z.enum(['missing', 'cutoff']) });
const grabBody = z.object({
  guid: z.string().min(1).max(4096),
  indexerId: z.number().int().positive(),
});

const lookupQuery = z.object({ term: z.string().trim().min(1).max(200) });
const addBody = z.object({
  tvdbId: z.number().int().positive(),
  qualityProfileId: z.number().int().positive(),
  rootFolderPath: z.string().min(1).max(4096),
  monitor: z.enum([
    'all',
    'future',
    'missing',
    'existing',
    'recent',
    'pilot',
    'firstSeason',
    'lastSeason',
    'none',
  ]),
  seriesType: z.enum(['standard', 'daily', 'anime']),
  seasonFolder: z.boolean(),
  monitorNewSeasons: z.boolean(),
  search: z.boolean(),
});

/** Command statuses that mean Sonarr is still working on it. */
const RUNNING = new Set<CommandResource['status']>(['queued', 'started']);

/** Routes under /api/sonarr. Each returns a trimmed DTO, never the raw Sonarr response. */
export function sonarrRoutes(getClient: () => SonarrClient, preferences: ServicePreferences) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/system/status', async (): Promise<SonarrStatus> => {
      return toArrStatus(await getClient().getSystemStatus());
    });

    // The Home screen's card: one round of quick calls.
    app.get('/summary', async (): Promise<ServiceSummary> => {
      const client = getClient();
      const [status, queue, missing, health] = await Promise.all([
        client.getSystemStatus(),
        client.getQueueStatus(),
        client.getWanted('missing', 1, 1),
        client.getHealth(),
      ]);
      return {
        version: status.version,
        facts: [
          `${plural(queue.totalCount, 'download')} in the queue`,
          plural(missing.totalRecords, 'missing episode'),
        ],
        issues: health.flatMap((check) => {
          if (check.type !== 'warning' && check.type !== 'error') return [];
          return [{ level: check.type, message: check.message || 'Sonarr reports a problem.' }];
        }),
      };
    });

    // monitored=true leaves out series that aren't monitored.
    app.get('/series', async (request): Promise<SonarrSeries[]> => {
      const query = parse(listQuery, request.query, 'monitored must be true or false.');
      const client = getClient();
      const [series, profiles] = await Promise.all([client.getSeries(), profileNames(client)]);
      return series
        .filter((item) => query.monitored === 'false' || item.monitored)
        .sort((a, b) => a.sortTitle.localeCompare(b.sortTitle))
        .map((resource) => toSeries(resource, profiles));
    });

    app.get('/series/:id', async (request): Promise<SonarrSeriesDetail> => {
      const { id } = parse(idParams, request.params, 'The series id must be a positive number.');
      const client = getClient();
      const [series, episodes, profiles] = await Promise.all([
        client.getSeriesById(id),
        client.getEpisodes(id),
        profileNames(client),
      ]);
      return {
        ...toSeries(series, profiles),
        overview: series.overview || null,
        seasons: (series.seasons ?? []).map(toSeason).sort(bySeasonNewestFirst),
        episodes: episodes.map(toEpisode).sort(byEpisode),
      };
    });

    app.delete('/series/:id', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The series id must be a positive number.');
      const query = parse(
        deleteQuery,
        request.query,
        'deleteFiles and exclude must be true or false.',
      );
      await getClient().deleteSeries(id, query.deleteFiles === 'true', query.exclude === 'true');
      return reply.status(204).send();
    });

    app.put('/series/:id/monitored', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The series id must be a positive number.');
      const { monitored } = parse(monitorBody, request.body, 'Send { "monitored": true|false }.');
      const client = getClient();
      const series = await client.getSeriesRaw(id);
      await client.updateSeriesRaw(id, { ...series, monitored });
      return reply.status(204).send();
    });

    // Sonarr also sets every episode in the season to match.
    app.put('/series/:id/seasons/:season/monitored', async (request, reply) => {
      const { id, season } = parse(seasonParams, request.params, SEASON_PARAMS_MESSAGE);
      const { monitored } = parse(monitorBody, request.body, 'Send { "monitored": true|false }.');
      const client = getClient();
      const series = await client.getSeriesRaw(id);
      const seasons = Array.isArray(series.seasons) ? (series.seasons as SeasonResource[]) : [];
      const target = seasons.find((item) => item.seasonNumber === season);
      if (!target) throw new NotFoundError(`This series has no season ${season}.`);
      target.monitored = monitored;
      await client.updateSeriesRaw(id, series);
      return reply.status(204).send();
    });

    app.put('/episodes/:id/monitored', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The episode id must be a positive number.');
      const { monitored } = parse(monitorBody, request.body, 'Send { "monitored": true|false }.');
      await getClient().setEpisodesMonitored([id], monitored);
      return reply.status(204).send();
    });

    // By episode, so the app never names a file: Steerarr looks up which one is the episode's.
    app.delete('/episodes/:id/file', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The episode id must be a positive number.');
      const client = getClient();
      const episode = await client.getEpisode(id);
      if (!episode.hasFile || !episode.episodeFileId) {
        throw new NotFoundError('This episode has no file to delete.');
      }
      // A file can hold several episodes. With "Unmonitor Deleted Episodes" on, Sonarr unmonitors
      // them as part of the delete; deleting from Steerarr leaves monitoring as it was.
      const onFile = await client.getEpisodesByFile(episode.episodeFileId);
      const monitored = onFile.filter((item) => item.monitored).map((item) => item.id);
      await client.deleteEpisodeFile(episode.episodeFileId);
      if (monitored.length > 0) await client.setEpisodesMonitored(monitored, true);
      return reply.status(204).send();
    });

    app.post('/series/:id/seasons/:season/search', async (request): Promise<SonarrCommand> => {
      const { id, season } = parse(seasonParams, request.params, SEASON_PARAMS_MESSAGE);
      return startSearch({ name: 'SeasonSearch', seriesId: id, seasonNumber: season });
    });

    app.post('/episodes/:id/search', async (request): Promise<SonarrCommand> => {
      const { id } = parse(idParams, request.params, 'The episode id must be a positive number.');
      return startSearch({ name: 'EpisodeSearch', episodeIds: [id] });
    });

    // Searches every monitored episode on the list: Sonarr's own "Search all".
    app.post('/wanted/:list/search', async (request): Promise<SonarrCommand> => {
      const { list } = parse(wantedParams, request.params, 'The list must be missing or cutoff.');
      if (list === 'missing') return startSearch({ name: 'MissingEpisodeSearch', monitored: true });
      return startSearch({ name: 'CutoffUnmetEpisodeSearch', monitored: true });
    });

    await activityRoutes(app, getClient);
    await calendarRoutes(app, getClient);
    await statusRoutes(app, getClient);

    app.get('/commands/:id', async (request): Promise<SonarrCommand> => {
      const { id } = parse(idParams, request.params, 'The command id must be a positive number.');
      return toCommand(await getClient().getCommand(id));
    });

    app.get('/series/:id/seasons/:season/releases', async (request): Promise<SonarrRelease[]> => {
      const { id, season } = parse(seasonParams, request.params, SEASON_PARAMS_MESSAGE);
      return searchReleases({ seriesId: id, seasonNumber: season });
    });

    app.get('/episodes/:id/releases', async (request): Promise<SonarrRelease[]> => {
      const { id } = parse(idParams, request.params, 'The episode id must be a positive number.');
      return searchReleases({ episodeId: id });
    });

    app.post('/releases', async (request, reply) => {
      const { guid, indexerId } = parse(
        grabBody,
        request.body,
        'Send the guid and indexerId of a release from a search.',
      );
      try {
        await getClient().grabRelease(guid, indexerId);
      } catch (err) {
        // Sonarr only grabs releases from a search in the last 30 minutes.
        if (err instanceof UpstreamError && err.status === 404) {
          throw new BadRequestError(
            'This search result has expired (Sonarr keeps them for 30 minutes). Search again.',
          );
        }
        throw err;
      }
      return reply.status(204).send();
    });

    app.get('/lookup', async (request): Promise<SonarrLookupResult[]> => {
      const { term } = parse(lookupQuery, request.query, 'Type a series name to search for.');
      const results = await getClient().lookupSeries(term);
      return results.filter((result) => result.tvdbId > 0).map(toLookupResult);
    });

    app.get('/add-options', async (): Promise<SonarrAddOptions> => {
      const client = getClient();
      const [profiles, folders] = await Promise.all([
        client.getQualityProfiles(),
        client.getRootFolders(),
      ]);
      const preferred = preferences.defaultQualityProfileId();
      return {
        qualityProfiles: profiles.map((profile) => ({
          id: profile.id,
          name: profile.name || `Profile ${profile.id}`,
        })),
        rootFolders: folders.flatMap(toRootFolder),
        defaultQualityProfileId: profiles.some((profile) => profile.id === preferred)
          ? preferred
          : null,
      };
    });

    // The profile the add form starts with, chosen in Steerarr's settings; null clears it.
    app.put('/add-defaults', async (request, reply) => {
      const { qualityProfileId } = parse(
        addDefaultsBody,
        request.body,
        'Send { "qualityProfileId": <profile id> } or null for none.',
      );
      if (qualityProfileId !== null) {
        const profiles = await getClient().getQualityProfiles();
        if (!profiles.some((profile) => profile.id === qualityProfileId)) {
          throw new BadRequestError(`Sonarr has no quality profile with id ${qualityProfileId}.`);
        }
      }
      await preferences.setDefaultQualityProfileId(qualityProfileId);
      return reply.status(204).send();
    });

    app.post('/series', async (request, reply) => {
      const options = parse(addBody, request.body, ADD_BODY_MESSAGE);
      const client = getClient();
      // Sonarr adds a series from its full lookup result, so look it up again by TVDB id.
      const results = await client.lookupSeriesRaw(`tvdb:${options.tvdbId}`);
      const found = results.find((result) => result.tvdbId === options.tvdbId);
      if (!found) throw new NotFoundError(`TheTVDB has no series with id ${options.tvdbId}.`);
      if (typeof found.id === 'number' && found.id > 0) {
        throw new BadRequestError('Sonarr already has this series.');
      }
      const added = await client.addSeries({
        ...found,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath: options.rootFolderPath,
        seriesType: options.seriesType,
        seasonFolder: options.seasonFolder,
        monitored: options.monitor !== 'none',
        monitorNewItems: options.monitorNewSeasons ? 'all' : 'none',
        addOptions: {
          monitor: options.monitor,
          searchForMissingEpisodes: options.search,
          searchForCutoffUnmetEpisodes: false,
        },
      });
      const response: SonarrAddResponse = { id: added.id };
      return reply.status(201).send(response);
    });

    app.get('/series/:id/poster', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The series id must be a positive number.');

      let poster;
      try {
        poster = await getClient().getPoster(id);
      } catch (err) {
        // No poster (yet) is normal; the app shows a placeholder.
        if (err instanceof UpstreamError && err.status === 404) {
          return reply
            .status(404)
            .header('Cache-Control', 'no-cache')
            .send({
              error: { code: 'not_found', message: 'Sonarr has no poster for this series' },
            });
        }
        throw err;
      }
      // Anything else (e.g. a proxy's login page) must not be served, let alone cached for a year.
      if (!poster.contentType.toLowerCase().startsWith('image/')) {
        throw new UpstreamError(
          "Sonarr sent something other than an image for the poster. Check Sonarr's address in Steerarr's settings.",
          { service: 'Sonarr', kind: 'http' },
        );
      }
      // The URL carries Sonarr's lastWrite stamp (see posterUrl), so a new poster gets a new URL.
      const versioned = typeof (request.query as { v?: unknown }).v === 'string';
      return reply
        .header('Content-Type', poster.contentType)
        .header(
          'Cache-Control',
          versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=86400',
        )
        .send(poster.data);
    });

    async function startSearch(command: SearchCommand): Promise<SonarrCommand> {
      return toCommand(await getClient().startCommand(command));
    }

    async function searchReleases(query: ReleaseQuery): Promise<SonarrRelease[]> {
      const releases = await getClient().getReleases(query);
      // Sonarr sends them best first. Releases it can't identify can't be grabbed either.
      return releases.filter((release) => release.guid).map(toRelease);
    }
  };
}

const SEASON_PARAMS_MESSAGE =
  'The series id must be a positive number and the season a number from 0.';

const ADD_BODY_MESSAGE =
  'Send tvdbId, qualityProfileId, rootFolderPath, monitor, seriesType, seasonFolder, monitorNewSeasons and search.';

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestError(message);
  return result.data;
}

async function profileNames(client: SonarrClient): Promise<Map<number, string>> {
  const profiles = await client.getQualityProfiles();
  return new Map(profiles.map((profile) => [profile.id, profile.name || `Profile ${profile.id}`]));
}

function toSeries(resource: SeriesResource, profiles: ReadonlyMap<number, string>): SonarrSeries {
  const stats = resource.statistics;
  return {
    id: resource.id,
    title: resource.title,
    year: resource.year,
    status: resource.status,
    monitored: resource.monitored,
    network: resource.network || null,
    qualityProfile:
      resource.qualityProfileId === undefined
        ? null
        : (profiles.get(resource.qualityProfileId) ?? null),
    posterUrl: posterUrl(resource),
    seasonCount: stats?.seasonCount ?? 0,
    episodeFileCount: stats?.episodeFileCount ?? 0,
    episodeCount: stats?.episodeCount ?? 0,
    sizeOnDisk: stats?.sizeOnDisk ?? 0,
    nextAiring: resource.nextAiring ?? null,
  };
}

function toSeason(resource: SeasonResource): SonarrSeason {
  const stats = resource.statistics;
  return {
    seasonNumber: resource.seasonNumber,
    monitored: resource.monitored,
    episodeFileCount: stats?.episodeFileCount ?? 0,
    episodeCount: stats?.episodeCount ?? 0,
    totalEpisodeCount: stats?.totalEpisodeCount ?? 0,
    sizeOnDisk: stats?.sizeOnDisk ?? 0,
  };
}

/** Newest season first, specials (season 0) last. */
function bySeasonNewestFirst(a: SonarrSeason, b: SonarrSeason): number {
  if (a.seasonNumber === 0 || b.seasonNumber === 0) return a.seasonNumber === 0 ? 1 : -1;
  return b.seasonNumber - a.seasonNumber;
}

/** By season, then episode number. */
function byEpisode(a: SonarrEpisode, b: SonarrEpisode): number {
  return a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber;
}

function toEpisode(resource: EpisodeResource): SonarrEpisode {
  const file = resource.hasFile ? resource.episodeFile : undefined;
  return {
    id: resource.id,
    seasonNumber: resource.seasonNumber,
    episodeNumber: resource.episodeNumber,
    title: resource.title || null,
    overview: resource.overview || null,
    airDateUtc: resource.airDateUtc || null,
    monitored: resource.monitored,
    hasFile: resource.hasFile,
    quality: file?.quality?.quality?.name || null,
    size: file?.size ?? null,
  };
}

function toCommand(resource: CommandResource): SonarrCommand {
  const done = !RUNNING.has(resource.status);
  return {
    id: resource.id,
    done,
    succeeded: done && resource.status === 'completed' && resource.result !== 'unsuccessful',
    message: resource.message || null,
  };
}

function toRelease(resource: ReleaseResource): SonarrRelease {
  // Usenet releases have no peers; Sonarr may still send numbers for them.
  const torrent = resource.protocol === 'torrent';
  const seeders = resource.seeders ?? null;
  const leechers = resource.leechers ?? null;
  return {
    guid: resource.guid ?? '',
    indexerId: resource.indexerId,
    indexer: resource.indexer || 'Unknown indexer',
    title: resource.title || 'Untitled release',
    quality: resource.quality?.quality?.name || 'Unknown',
    size: resource.size,
    ageHours: resource.ageHours,
    protocol: resource.protocol,
    seeders: torrent ? seeders : null,
    leechers: torrent ? leechers : null,
    languages: names(resource.languages),
    customFormats: names(resource.customFormats),
    customFormatScore: resource.customFormatScore,
    fullSeason: resource.fullSeason,
    approved: resource.approved,
    rejections: resource.rejections ?? [],
    downloadAllowed: resource.downloadAllowed,
  };
}

function toLookupResult(resource: LookupResource): SonarrLookupResult {
  return {
    tvdbId: resource.tvdbId,
    title: resource.title,
    year: resource.year,
    status: resource.status,
    network: resource.network || null,
    overview: resource.overview || null,
    seasonCount: resource.statistics?.seasonCount ?? 0,
    posterUrl: httpsUrl(resource.remotePoster),
    seriesType: resource.seriesType ?? 'standard',
    existingId: resource.id && resource.id > 0 ? resource.id : null,
  };
}

/** Root folders without a path can't be added to, so they're left out. */
function toRootFolder(folder: RootFolderResource): SonarrAddOptions['rootFolders'] {
  if (!folder.path) return [];
  const result = {
    id: folder.id,
    path: folder.path,
    freeSpace: folder.freeSpace ?? null,
    accessible: folder.accessible,
  };
  return [result];
}

/** "1 download", "3 downloads". */
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function names(items: Array<{ name?: string | null }> | null | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.name ? [item.name] : []));
}
