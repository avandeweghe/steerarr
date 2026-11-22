import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Saving settings to disk failed (e.g. the data folder isn't writable). */
export class SettingsWriteError extends Error {
  override name = 'SettingsWriteError';
}

/**
 * Writes JSON readable only by Steerarr's user (mode 0600): to a temp file first, then renamed
 * into place, so a crash never leaves a half-written file behind.
 */
export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  const tempPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const contents = `${JSON.stringify(data, null, 2)}\n`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tempPath, contents, { mode: 0o600 });
    await rename(tempPath, path);
  } catch (err) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw writeError(path, err);
  }
}

/** Deletes a settings file. A file that's already gone is fine. */
export async function removeJsonFile(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch (err) {
    throw writeError(path, err);
  }
}

function writeError(path: string, err: unknown): SettingsWriteError {
  const code = (err as { code?: string }).code ?? (err as Error).message;
  return new SettingsWriteError(
    `Couldn't save settings to ${path} (${code}). Check that Steerarr's data folder is writable.`,
  );
}
