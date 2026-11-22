import type { FrontendService } from '../lib/service';
import { nzbget } from './nzbget';
import { prowlarr } from './prowlarr';
import { radarr } from './radarr';
import { sonarr } from './sonarr';

/** Every frontend service module, in tab order. Only those set up get a tab and a card. */
export const frontendServices: readonly FrontendService[] = [sonarr, radarr, prowlarr, nzbget];
