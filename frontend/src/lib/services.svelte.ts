import type { ServicesResponse } from '@steerarr/shared';
import { frontendServices } from '../services';
import { api, errorMessage } from './api';
import type { FrontendService } from './service';

export interface ServiceEntry {
  def: FrontendService;
  /** Whether its address and API key are saved. Only set-up services get a tab and a card. */
  configured: boolean;
  /** The saved address, when it is set up. */
  url: string | null;
}

class Services {
  /** Every service known to both backend and frontend, in tab order. null while loading. */
  items = $state<ServiceEntry[] | null>(null);
  error = $state<string | null>(null);
  /**
   * Goes up each time the list is (re)loaded, which happens after any settings change. Pages
   * that cache data between visits keep it only while this is unchanged.
   */
  revision = 0;
}

/** The app-wide list of services. Reload it with `loadServices()` after settings change. */
export const services = new Services();

export function findService(id: string | undefined): ServiceEntry | null {
  return services.items?.find((entry) => entry.def.id === id) ?? null;
}

export async function loadServices(): Promise<void> {
  try {
    const response = await api<ServicesResponse>('services');
    const known = new Map(response.services.map((info) => [info.id, info]));
    services.items = frontendServices.flatMap((def) => {
      const info = known.get(def.id);
      return info ? [{ def, configured: info.configured, url: info.url }] : [];
    });
    services.error = null;
    services.revision += 1;
  } catch (err) {
    services.error = errorMessage(err);
  }
}
