import type { Route } from './router.svelte';

/**
 * The frontend half of a service module. To add a service: create src/services/<id>/ with an
 * index.ts exporting one of these, then add it to src/services/index.ts.
 */
export interface FrontendService {
  /** Same id as the backend module: its tab only shows when the backend has it enabled. */
  id: string;
  name: string;
  /** SVG path data for the tab icon, drawn as a 24×24 stroke icon. */
  icon: string;
  /** How it's set up: an API key (the default), or a username and password ('login'). */
  credentials?: 'apiKey' | 'login';
  /** Where to find the API key or the username and password in the service itself. */
  credentialsHint: string;
  /** What its add form adds ("series", "movie"): it then has a default quality profile setting. */
  adds?: string;
  /** A page with the service's health checks: its Home card's warnings link there. */
  statusPath?: string;
  /** Pages. Paths must start with /<id>; the first route is the tab's home. */
  routes: Route[];
}
