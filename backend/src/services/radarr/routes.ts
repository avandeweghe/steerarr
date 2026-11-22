import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  RadarrAddOptions,
  RadarrAddResponse,
  RadarrCommand,
  RadarrLookupResult,
  RadarrMovie,
  RadarrMovieDetail,
  RadarrRelease,
  RadarrStatus,
  ServiceSummary,
} from '@steerarr/shared';
import { httpsUrl } from '../../core/arr-helpers.js';
import { toArrStatus } from '../../core/arr-service.js';
import type { ServicePreferences } from '../../core/service-module.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { UpstreamError } from '../../core/upstream-error.js';
import type { RadarrClient, SearchCommand } from './client.js';
import { listRoutes } from './lists.js';
import {
  parse,
  plural,
  startSearchCommand,
  toAvailability,
  toCommand,
  toMovie,
} from './mappers.js';
import type {
  LookupResource,
  MovieResource,
  ReleaseResource,
  RootFolderResource,
} from './types.js';

const id = z.coerce.number().int().positive();
const deleteQuery = z.object({
  deleteFiles: z.enum(['true', 'false']).default('false'),
  exclude: z.enum(['true', 'false']).default('false'),
});
const addDefaultsBody = z.object({ qualityProfileId: z.number().int().positive().nullable() });
const listQuery = z.object({ monitored: z.enum(['true', 'false']).default('false') });
const idParams = z.object({ id });
const monitorBody = z.object({ monitored: z.boolean() });
const grabBody = z.object({
  guid: z.string().min(1).max(4096),
  indexerId: z.number().int().positive(),
});
const lookupQuery = z.object({ term: z.string().trim().min(1).max(200) });
const addBody = z.object({
  tmdbId: z.number().int().positive(),
  qualityProfileId: z.number().int().positive(),
  rootFolderPath: z.string().min(1).max(4096),
  monitored: z.boolean(),
  minimumAvailability: z.enum(['announced', 'inCinemas', 'released']),
  search: z.boolean(),
});

const ADD_BODY_MESSAGE =
  'Send tmdbId, qualityProfileId, rootFolderPath, monitored, minimumAvailability and search.';

/** Routes under /api/radarr. Each returns a trimmed DTO, never the raw Radarr response. */
export function radarrRoutes(getClient: () => RadarrClient, preferences: ServicePreferences) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/system/status', async (): Promise<RadarrStatus> => {
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
          plural(missing.totalRecords, 'missing movie'),
        ],
        issues: health.flatMap((check) => {
          if (check.type !== 'warning' && check.type !== 'error') return [];
          return [{ level: check.type, message: check.message || 'Radarr reports a problem.' }];
        }),
      };
    });

    // monitored=true leaves out unmonitored movies: libraries can hold thousands of them.
    app.get('/movies', async (request): Promise<RadarrMovie[]> => {
      const query = parse(listQuery, request.query, 'monitored must be true or false.');
      const client = getClient();
      const [movies, profiles] = await Promise.all([client.getMovies(), profileNames(client)]);
      return movies
        .filter((movie) => query.monitored === 'false' || movie.monitored)
        .sort(byTitle)
        .map((movie) => toMovie(movie, profiles));
    });

    app.get('/movies/:id', async (request): Promise<RadarrMovieDetail> => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');
      const client = getClient();
      const [movie, profiles] = await Promise.all([client.getMovie(id), profileNames(client)]);
      const file = movie.hasFile ? movie.movieFile : null;
      return {
        ...toMovie(movie, profiles),
        overview: movie.overview || null,
        certification: movie.certification || null,
        genres: movie.genres ?? [],
        minimumAvailability: toAvailability(movie.minimumAvailability),
        file: file
          ? {
              quality: file.quality?.quality?.name || 'Unknown',
              size: file.size ?? 0,
              relativePath: file.relativePath || null,
            }
          : null,
      };
    });

    app.delete('/movies/:id', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');
      const query = parse(
        deleteQuery,
        request.query,
        'deleteFiles and exclude must be true or false.',
      );
      await getClient().deleteMovie(id, query.deleteFiles === 'true', query.exclude === 'true');
      return reply.status(204).send();
    });

    app.put('/movies/:id/monitored', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');
      const { monitored } = parse(monitorBody, request.body, 'Send { "monitored": true|false }.');
      const client = getClient();
      const movie = await client.getMovieRaw(id);
      await client.updateMovieRaw(id, { ...movie, monitored });
      return reply.status(204).send();
    });

    // By movie, so the app never names a file: Steerarr looks up which one is the movie's.
    app.delete('/movies/:id/file', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');
      const client = getClient();
      const movie = await client.getMovie(id);
      const fileId = movie.hasFile ? movie.movieFile?.id : undefined;
      if (!fileId) throw new NotFoundError('This movie has no file to delete.');
      await client.deleteMovieFile(fileId);
      // With "Unmonitor Deleted Movies" on, Radarr unmonitors it as part of the delete;
      // deleting from Steerarr leaves monitoring as it was.
      if (movie.monitored) {
        const after = await client.getMovieRaw(id);
        if (after.monitored === false)
          await client.updateMovieRaw(id, { ...after, monitored: true });
      }
      return reply.status(204).send();
    });

    app.post('/movies/:id/search', async (request): Promise<RadarrCommand> => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');
      return startSearch({ name: 'MoviesSearch', movieIds: [id] });
    });

    app.get('/commands/:id', async (request): Promise<RadarrCommand> => {
      const { id } = parse(idParams, request.params, 'The command id must be a positive number.');
      return toCommand(await getClient().getCommand(id));
    });

    app.get('/movies/:id/releases', async (request): Promise<RadarrRelease[]> => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');
      const releases = await getClient().getReleases(id);
      // Radarr sends them best first. Releases it can't identify can't be grabbed either.
      return releases.filter((release) => release.guid).map(toRelease);
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
        // Radarr only grabs releases from a search in the last 30 minutes.
        if (err instanceof UpstreamError && err.status === 404) {
          throw new BadRequestError(
            'This search result has expired (Radarr keeps them for 30 minutes). Search again.',
          );
        }
        throw err;
      }
      return reply.status(204).send();
    });

    app.get('/lookup', async (request): Promise<RadarrLookupResult[]> => {
      const { term } = parse(lookupQuery, request.query, 'Type a movie name to search for.');
      const results = await getClient().lookupMovies(term);
      return results.filter((result) => result.tmdbId > 0).map(toLookupResult);
    });

    app.get('/add-options', async (): Promise<RadarrAddOptions> => {
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
          throw new BadRequestError(`Radarr has no quality profile with id ${qualityProfileId}.`);
        }
      }
      await preferences.setDefaultQualityProfileId(qualityProfileId);
      return reply.status(204).send();
    });

    app.post('/movies', async (request, reply) => {
      const options = parse(addBody, request.body, ADD_BODY_MESSAGE);
      const client = getClient();
      // Radarr adds a movie from its full lookup result, so look it up again by TMDb id.
      const results = await client.lookupMoviesRaw(`tmdb:${options.tmdbId}`);
      const found = results.find((result) => result.tmdbId === options.tmdbId);
      if (!found) throw new NotFoundError(`TMDb has no movie with id ${options.tmdbId}.`);
      if (typeof found.id === 'number' && found.id > 0) {
        throw new BadRequestError('Radarr already has this movie.');
      }
      const added = await client.addMovie({
        ...found,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath: options.rootFolderPath,
        monitored: options.monitored,
        minimumAvailability: options.minimumAvailability,
        addOptions: {
          monitor: options.monitored ? 'movieOnly' : 'none',
          searchForMovie: options.search,
        },
      });
      const response: RadarrAddResponse = { id: added.id };
      return reply.status(201).send(response);
    });

    app.get('/movies/:id/poster', async (request, reply) => {
      const { id } = parse(idParams, request.params, 'The movie id must be a positive number.');

      let poster;
      try {
        poster = await getClient().getPoster(id);
      } catch (err) {
        // No poster (yet) is normal; the app shows a placeholder.
        if (err instanceof UpstreamError && err.status === 404) {
          return reply
            .status(404)
            .header('Cache-Control', 'no-cache')
            .send({ error: { code: 'not_found', message: 'Radarr has no poster for this movie' } });
        }
        throw err;
      }
      // Anything else (e.g. a proxy's login page) must not be served, let alone cached for a year.
      if (!poster.contentType.toLowerCase().startsWith('image/')) {
        throw new UpstreamError(
          "Radarr sent something other than an image for the poster. Check Radarr's address in Steerarr's settings.",
          { service: 'Radarr', kind: 'http' },
        );
      }
      // The URL carries Radarr's lastWrite stamp (see posterUrl), so a new poster gets a new URL.
      const versioned = typeof (request.query as { v?: unknown }).v === 'string';
      return reply
        .header('Content-Type', poster.contentType)
        .header(
          'Cache-Control',
          versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=86400',
        )
        .send(poster.data);
    });

    await listRoutes(app, getClient);

    function startSearch(command: SearchCommand): Promise<RadarrCommand> {
      return startSearchCommand(getClient(), command);
    }
  };
}

async function profileNames(client: RadarrClient): Promise<Map<number, string>> {
  const profiles = await client.getQualityProfiles();
  return new Map(profiles.map((profile) => [profile.id, profile.name || `Profile ${profile.id}`]));
}

function byTitle(a: MovieResource, b: MovieResource): number {
  return (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title);
}

function toRelease(resource: ReleaseResource): RadarrRelease {
  // Usenet releases have no peers; Radarr may still send numbers for them.
  const torrent = resource.protocol === 'torrent';
  return {
    guid: resource.guid ?? '',
    indexerId: resource.indexerId,
    indexer: resource.indexer || 'Unknown indexer',
    title: resource.title || 'Untitled release',
    quality: resource.quality?.quality?.name || 'Unknown',
    size: resource.size,
    ageHours: resource.ageHours,
    protocol: resource.protocol,
    seeders: torrent ? (resource.seeders ?? null) : null,
    leechers: torrent ? (resource.leechers ?? null) : null,
    languages: names(resource.languages),
    customFormats: names(resource.customFormats),
    customFormatScore: resource.customFormatScore ?? 0,
    approved: resource.approved,
    rejections: resource.rejections ?? [],
    downloadAllowed: resource.downloadAllowed,
  };
}

function toLookupResult(resource: LookupResource): RadarrLookupResult {
  return {
    tmdbId: resource.tmdbId,
    title: resource.title,
    year: resource.year,
    status: resource.status,
    studio: resource.studio || null,
    overview: resource.overview || null,
    runtime: resource.runtime || null,
    posterUrl: httpsUrl(resource.remotePoster),
    existingId: resource.id && resource.id > 0 ? resource.id : null,
  };
}

/** Root folders without a path can't be added to, so they're left out. */
function toRootFolder(folder: RootFolderResource): RadarrAddOptions['rootFolders'] {
  if (!folder.path) return [];
  const result = {
    id: folder.id,
    path: folder.path,
    freeSpace: folder.freeSpace ?? null,
    accessible: folder.accessible,
  };
  return [result];
}

function names(items: Array<{ name?: string | null }> | null | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.name ? [item.name] : []));
}
