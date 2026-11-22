import type { ServiceModule } from '../core/service-module.js';
import { nzbget } from './nzbget/index.js';
import { prowlarr } from './prowlarr/index.js';
import { radarr } from './radarr/index.js';
import { sonarr } from './sonarr/index.js';

/** Every service module. The order here is the order of the tabs in the app. */
export const serviceModules: readonly ServiceModule[] = [sonarr, radarr, prowlarr, nzbget];
