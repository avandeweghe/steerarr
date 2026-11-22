// Small helpers the *arr service modules share.

/** "00:12:34", or "1.02:03:04" with days, as seconds. */
export function parseTimeLeft(value: string | null | undefined): number | null {
  const match = /^(?:(\d+)\.)?(\d+):(\d{2}):(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/** The disk a path is on: the one mounted at the longest matching path. */
export function diskOf<Disk extends { path?: string | null }>(
  path: string,
  disks: Disk[],
): Disk | undefined {
  let best: Disk | undefined;
  let bestLength = -1;
  for (const disk of disks) {
    if (disk.path === undefined || disk.path === null) continue;
    const mount = disk.path.replace(/\/+$/, '');
    const inside = mount === '' || path === mount || path.startsWith(`${mount}/`);
    if (inside && mount.length > bestLength) {
      best = disk;
      bestLength = mount.length;
    }
  }
  return best;
}

/** Only https URLs reach the page; anything else is dropped. */
export function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}
