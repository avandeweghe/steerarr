import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { ConfigError } from '../env.js';

/**
 * Serves the built frontend from `root`. Vite puts content-hashed files in assets/, so those
 * are cached for a year. Everything else (index.html, the manifest, icons) is revalidated on
 * every load, so a new version shows up right after a deploy.
 */
export async function registerStaticFiles(app: FastifyInstance, root: string): Promise<void> {
  if (!existsSync(join(root, 'index.html'))) {
    throw new ConfigError(`STATIC_DIR (${root}) doesn't contain index.html`);
  }
  await app.register(fastifyStatic, {
    root,
    // Only the files that exist get routes; anything else falls through to the JSON 404.
    wildcard: false,
    cacheControl: false,
    setHeaders(reply, path) {
      const hashed = path.includes(`${sep}assets${sep}`);
      reply.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
}
