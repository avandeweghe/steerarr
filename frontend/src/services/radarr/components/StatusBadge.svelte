<script lang="ts">
  import type { RadarrMovie } from '@steerarr/shared';
  import { formatDay } from '../../../lib/format';

  /**
   * Radarr's status pill: the file's quality when there is one, coloured like Radarr's own.
   * Green downloaded and monitored, grey downloaded but not monitored, red missing and
   * monitored, amber missing and not monitored, an outline while it isn't out yet.
   */
  let { movie }: { movie: RadarrMovie } = $props();

  type Tone = 'ok' | 'idle' | 'missing' | 'missing-idle' | 'upcoming';

  const badge = $derived.by((): { tone: Tone; text: string; label: string } => {
    if (movie.hasFile) {
      const text = movie.quality ?? 'Downloaded';
      return movie.monitored
        ? { tone: 'ok', text, label: `Downloaded as ${text}` }
        : { tone: 'idle', text, label: `Downloaded as ${text}, not monitored` };
    }
    if (movie.isAvailable) {
      return movie.monitored
        ? { tone: 'missing', text: 'Missing', label: 'Missing' }
        : { tone: 'missing-idle', text: 'Missing', label: 'Missing, not monitored' };
    }
    const next = nextRelease();
    return { tone: 'upcoming', text: next ?? 'Not out yet', label: next ?? 'Not out yet' };
  });

  /** "Digital 2 Dec": the next release still to come, if TMDb knows it. */
  function nextRelease(): string | null {
    const now = Date.now();
    const releases: Array<[string, string | null]> = [
      ['Cinemas', movie.inCinemas],
      ['Digital', movie.digitalRelease],
      ['Physical', movie.physicalRelease],
    ];
    const upcoming = releases
      .flatMap(([kind, date]) => (date && Date.parse(date) > now ? [{ kind, date }] : []))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
    return upcoming ? `${upcoming.kind} ${formatDay(upcoming.date)}` : null;
  }
</script>

<span class="badge {badge.tone}" title={badge.label} aria-label={badge.label}>{badge.text}</span>

<style>
  .badge {
    display: inline-block;
    max-width: 100%;
    padding: 0.0625rem 0.5rem;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 4px;
    font-family: var(--font-display);
    font-size: var(--size-caption);
    font-weight: 600;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ok {
    background: var(--starboard);
    color: var(--sea);
  }

  .idle {
    background: var(--rigging-strong);
    color: var(--sailcloth);
  }

  .missing {
    background: var(--port);
    color: var(--sea);
  }

  .missing-idle {
    background: var(--lantern);
    color: var(--sea);
  }

  .upcoming {
    border-color: var(--rigging-strong);
    color: var(--fog);
  }
</style>
