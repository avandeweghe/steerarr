import type { Component } from 'svelte';

export type RouteParams = Record<string, string>;

/** Props every page receives. Pages without :params in their path can ignore them. */
export interface PageProps {
  params: RouteParams;
}

/** A page. `path` may contain :params, e.g. '/sonarr/series/:id'. */
export interface Route {
  path: string;
  component: Component<PageProps> | Component<Record<string, never>>;
}

export interface RouteMatch {
  route: Route;
  params: RouteParams;
}

/**
 * Hash-based routing (#/sonarr/series/12). It needs no server-side rewrites and works under
 * any path behind a reverse proxy and in a Home Screen web app.
 */
class Router {
  path = $state(readPath());
  /** Where to scroll once the current path has rendered: the top, or where you left it. */
  scrollTarget = 0;

  constructor() {
    // We restore scroll positions ourselves, once the page has rendered.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // A tap on an in-app link goes forward: the new page starts at the top. Back links
    // (data-back) don't count, since going back should return to where you were.
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('a[href^="#/"]:not([data-back])')) goingForward = true;
      },
      true,
    );

    window.addEventListener('hashchange', () => {
      const from = this.path;
      scrollPositions.set(from, window.scrollY);
      const path = readPath();
      this.scrollTarget = goingForward ? 0 : (scrollPositions.get(path) ?? 0);
      // Remember on the new history entry where it came from, for BackLink.
      if (goingForward) history.replaceState({ ...history.state, from }, '');
      goingForward = false;
      this.path = path;
    });
  }
}

/** Scroll position of each path when it was left, for coming back to it. */
const scrollPositions = new Map<string, number>();
let goingForward = false;

export const router = new Router();

/** Goes to a path like '/sonarr/series/12'. `replace` doesn't add a history entry. */
export function navigate(path: string, { replace = false } = {}): void {
  if (replace) {
    history.replaceState(history.state, '', `#${path}`);
    router.scrollTarget = 0;
    router.path = readPath();
  } else {
    goingForward = true;
    location.hash = path;
  }
}

/** The path this page was opened from by a link, or null (e.g. after a reload). */
export function cameFrom(): string | null {
  const state: unknown = history.state;
  if (typeof state !== 'object' || state === null || !('from' in state)) return null;
  return typeof state.from === 'string' ? state.from : null;
}

export function matchRoute(routes: readonly Route[], path: string): RouteMatch | null {
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

export function matchPath(pattern: string, path: string): RouteParams | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = (path.split('?')[0] ?? '').split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: RouteParams = {};
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? '';
    if (part.startsWith(':')) {
      try {
        params[part.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
    } else if (part !== actual) {
      return null;
    }
  }
  return params;
}

function readPath(): string {
  const path = location.hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}
