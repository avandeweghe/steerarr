import type { RadarrAvailability, RadarrCommand, RadarrMovie } from '@steerarr/shared';
import type { z } from 'zod';
import { BadRequestError } from '../../core/errors.js';
import type { RadarrClient, SearchCommand } from './client.js';
import type { CommandResource, MediaCoverResource, MovieResource } from './types.js';

// Mapping from Radarr's resources to the app's DTOs, shared by the Radarr routes.

/** Command statuses that mean Radarr is still working on it. */
const RUNNING = new Set<CommandResource['status']>(['queued', 'started']);

export function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestError(message);
  return result.data;
}

export function startSearchCommand(
  client: RadarrClient,
  command: SearchCommand,
): Promise<RadarrCommand> {
  return client.startCommand(command).then(toCommand);
}

/** Quality profile names by id, from GET /qualityprofile. */
export type ProfileNames = ReadonlyMap<number, string>;

/** The file's quality: from the file itself, or from statistics where Radarr sends no file. */
export function fileQuality(resource: MovieResource): string | null {
  return (
    resource.movieFile?.quality?.quality?.name ||
    resource.statistics?.movieFileQualities?.[0]?.name ||
    null
  );
}

export function toMovie(resource: MovieResource, profiles: ProfileNames): RadarrMovie {
  const hasFile = resource.hasFile ?? (resource.statistics?.movieFileCount ?? 0) > 0;
  return {
    id: resource.id,
    title: resource.title,
    year: resource.year,
    status: resource.status,
    monitored: resource.monitored,
    studio: resource.studio || null,
    posterUrl: posterUrl(resource),
    hasFile,
    quality: hasFile ? fileQuality(resource) : null,
    qualityProfile:
      resource.qualityProfileId === undefined
        ? null
        : (profiles.get(resource.qualityProfileId) ?? null),
    isAvailable: resource.isAvailable ?? false,
    sizeOnDisk: resource.statistics?.sizeOnDisk ?? resource.sizeOnDisk ?? 0,
    runtime: resource.runtime || null,
    inCinemas: resource.inCinemas || null,
    digitalRelease: resource.digitalRelease || null,
    physicalRelease: resource.physicalRelease || null,
  };
}

/** Radarr also has 'tba' and 'preDB' for old movies; the app treats them as 'released'. */
export function toAvailability(value: MovieResource['minimumAvailability']): RadarrAvailability {
  return value === 'announced' || value === 'inCinemas' ? value : 'released';
}

export function toCommand(resource: CommandResource): RadarrCommand {
  const done = !RUNNING.has(resource.status);
  return {
    id: resource.id,
    done,
    succeeded: done && resource.status === 'completed' && resource.result !== 'unsuccessful',
    message: resource.message || null,
  };
}

/**
 * The URL of a movie's poster as Steerarr serves it, or null when Radarr has none. Relative to
 * the app, so it works under any path behind a proxy. With Radarr's lastWrite stamp, a new
 * poster gets a new URL and the old one can be cached for a year; without one (lists that only
 * carry TMDb's URL), it's cached for a day.
 */
export function posterUrl(movie: { id: number; images?: MediaCoverResource[] | null }) {
  const poster = (movie.images ?? []).find((image) => image.coverType === 'poster');
  if (!poster) return null;
  const base = `api/radarr/movies/${movie.id}/poster`;
  if (!poster.url) return base;
  const lastWrite = new URL(poster.url, 'http://radarr.invalid').searchParams.get('lastWrite');
  return lastWrite ? `${base}?v=${encodeURIComponent(lastWrite)}` : base;
}

/** "1 download", "3 downloads". */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
