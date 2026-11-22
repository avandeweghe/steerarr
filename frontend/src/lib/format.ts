// Formatting for numbers and dates shown in the app. Locale-aware where the browser can be.

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** "1.4 GiB", "350 MiB": binary units, like Sonarr. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/** "1 episode", "3 episodes". */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** How old a release is: "under an hour", "5 hours", "3 days". */
export function formatAge(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 48) return plural(Math.round(hours), 'hour');
  return plural(Math.round(hours / 24), 'day');
}

const dayThisYear = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const dayOtherYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "Fri 4 Dec" this year, "15 Dec 2015" otherwise. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return (sameYear ? dayThisYear : dayOtherYear).format(date);
}

/** Time left: "under a minute", "12 min", "2 h 5 min", "3 days". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  return plural(Math.round(hours / 24), 'day');
}

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** When something happened: "Today 14:05", "Yesterday 09:30", else "Fri 4 Dec 14:05". */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const time = timeOfDay.format(date);
  const days = dayNumber(new Date()) - dayNumber(date);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${formatDay(iso)} ${time}`;
}

/** The time of day, in the phone's own style: "20:00" or "8:00 PM". */
export function formatTime(iso: string): string {
  return timeOfDay.format(new Date(iso));
}

/** A day heading: "Today", "Tomorrow", "Yesterday", else "Fri 4 Dec". */
export function formatDayHeading(iso: string): string {
  const days = dayNumber(new Date(iso)) - dayNumber(new Date());
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return formatDay(iso);
}

/** Days since the epoch in local time, for comparing calendar days. */
export function dayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}
