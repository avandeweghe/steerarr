import type { RadarrAvailability, RadarrReleaseKind } from '@steerarr/shared';

const RELEASE_LABELS: Record<RadarrReleaseKind, string> = {
  cinemas: 'In cinemas',
  digital: 'Digital release',
  physical: 'Physical release',
};

export function releaseLabel(kind: RadarrReleaseKind): string {
  return RELEASE_LABELS[kind];
}

export const AVAILABILITY_OPTIONS: Array<{
  value: RadarrAvailability;
  label: string;
  hint: string;
}> = [
  { value: 'announced', label: 'Announced', hint: 'Look for it as soon as it is announced.' },
  { value: 'inCinemas', label: 'In cinemas', hint: 'Look for it once it is in cinemas.' },
  {
    value: 'released',
    label: 'Released',
    hint: 'Look for it once it is out on digital or disc.',
  },
];

/** "2 h 47 min" from minutes. */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
