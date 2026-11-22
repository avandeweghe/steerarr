import type { RadarrCommand } from '@steerarr/shared';
import { ApiError, errorMessage } from '../../lib/api';
import { plural } from '../../lib/format';
import { getCommand } from './api';

type Tone = 'ok' | 'warn' | 'error';

/** A search started from Steerarr: running, or finished with Radarr's outcome. */
export type SearchState = { kind: 'running' } | { kind: 'done'; tone: Tone; message: string };

const POLL_MS = 2000;
/** Searches normally take seconds; past this, stop watching and point at Radarr. */
const GIVE_UP_MS = 15 * 60 * 1000;

class Searches {
  /** By key, e.g. 'movie:12' or 'wanted:missing'. Kept while you move around the app. */
  states = $state<Record<string, SearchState>>({});
}

export const searches = new Searches();

/** Starts a search in Radarr and follows it until Radarr is done. One at a time per key. */
export async function runSearch(key: string, start: () => Promise<RadarrCommand>): Promise<void> {
  if (searches.states[key]?.kind === 'running') return;
  searches.states[key] = { kind: 'running' };
  searches.states[key] = await follow(start);
}

async function follow(start: () => Promise<RadarrCommand>): Promise<SearchState> {
  try {
    let command = await start();
    const giveUpAt = Date.now() + GIVE_UP_MS;
    while (!command.done) {
      if (Date.now() > giveUpAt) {
        return done('warn', 'Radarr is still searching. Check its activity page.');
      }
      await wait(POLL_MS);
      try {
        command = await getCommand(command.id);
      } catch (err) {
        // Radarr forgets running commands when it restarts.
        if (err instanceof ApiError && err.status === 404) {
          return done('warn', 'Radarr lost track of this search (did it restart?). Check Radarr.');
        }
        throw err;
      }
    }
    return outcome(command);
  } catch (err) {
    return done('error', `The search failed. ${errorMessage(err)}`);
  }
}

/** Radarr ends a search with e.g. "Completed. 1 reports downloaded." (wording varies) */
function outcome(command: RadarrCommand): SearchState {
  const message = command.message ?? '';
  if (!command.succeeded) {
    const reason = message ? `: ${message}` : '.';
    return done('error', `The search failed in Radarr${reason}`);
  }
  const grabbed = /(\d+) reports? downloaded/i.exec(message);
  if (!grabbed) return done('ok', 'Search finished.');
  const count = Number(grabbed[1]);
  if (count === 0) return done('warn', 'Search finished. Nothing new to download.');
  return done('ok', `Search finished. Sent ${plural(count, 'release')} to the download client.`);
}

function done(tone: Tone, message: string): SearchState {
  return { kind: 'done', tone, message };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
