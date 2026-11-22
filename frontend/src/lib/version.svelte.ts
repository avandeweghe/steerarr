import type { AboutResponse } from '@steerarr/shared';
import { api } from './api';

/**
 * The commit this copy of the app was built from (the image build passes it in). Empty in
 * development, where there's nothing to compare with.
 */
const BUILT_FROM: string = import.meta.env.VITE_STEERARR_COMMIT ?? '';

/** How often an open app asks which Steerarr the server runs. */
const CHECK_MS = 60_000;

class Version {
  /** The server runs a newer Steerarr than this page: it should be reloaded. */
  updateAvailable = $state(false);
}

export const version = new Version();

/**
 * Checks now, every minute while the app is in view, and whenever it comes back into view
 * (e.g. reopening the Home Screen app). Returns a function that stops checking.
 */
export function watchForUpdates(): () => void {
  if (!BUILT_FROM) return () => {};
  const checkIfVisible = (): void => {
    if (!document.hidden) void check();
  };
  void check();
  const timer = setInterval(checkIfVisible, CHECK_MS);
  document.addEventListener('visibilitychange', checkIfVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', checkIfVisible);
  };
}

async function check(): Promise<void> {
  if (version.updateAvailable) return;
  try {
    const { commit } = await api<AboutResponse>('about');
    if (commit && commit !== BUILT_FROM) version.updateAvailable = true;
  } catch {
    // Offline, logged out or mid-deploy: try again next time.
  }
}
