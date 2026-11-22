import type { FastifyInstance } from 'fastify';
import { BadRequestError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses API calls that change something when a browser says they came from another site's
 * page (its Origin header names another host). Without this, a page elsewhere could, say, start
 * a search with a plain form post while the login is off. Requests without an Origin (curl,
 * scripts) and Steerarr's own pages pass. Hosts are compared as the request arrived, through
 * trusted proxies (X-Forwarded-Host).
 */
export function registerSameOriginCheck(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/') || SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (originHost(origin) !== request.host.toLowerCase()) {
      throw new BadRequestError(
        "This request came from another site's page, so Steerarr refused it.",
      );
    }
  });
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    // e.g. "null" from a sandboxed page.
    return null;
  }
}
