<script lang="ts">
  import type { SonarrCalendarEpisode, SonarrFinale } from '@steerarr/shared';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatTime } from '../../../lib/format';
  import { episodeCode } from '../series-status';
  import Poster from './Poster.svelte';

  /** One episode on the calendar: when it airs and whether it's here yet. */
  let { item, now }: { item: SonarrCalendarEpisode; now: number } = $props();

  const FINALES: Record<SonarrFinale, string> = {
    series: 'Series finale',
    season: 'Season finale',
    midseason: 'Midseason finale',
  };

  const code = $derived(episodeCode(item.episode.seasonNumber, item.episode.episodeNumber));

  /** Aired once it has finished airing; until then, a missing file is just not here yet. */
  const aired = $derived.by(() => {
    const ends = new Date(item.airDateUtc).getTime() + (item.runtime ?? 0) * 60_000;
    return ends <= now;
  });

  const lamp = $derived.by((): { tone: LampTone; label: string } | null => {
    if (item.hasFile) return { tone: 'ok', label: 'Downloaded' };
    if (item.downloading) return { tone: 'pending', label: 'Downloading' };
    if (aired) return { tone: 'error', label: 'Missing' };
    return null;
  });

  const facts = $derived.by(() => {
    const parts = [formatTime(item.airDateUtc)];
    if (item.network) parts.push(item.network);
    if (lamp) parts.push(lamp.label);
    return parts;
  });
</script>

<li>
  <a class="item" href="#/sonarr/series/{item.seriesId}">
    <Poster src={item.posterUrl} title={item.seriesTitle} />
    <div class="text">
      <p class="heading">{item.seriesTitle} {code}</p>
      {#if item.episode.title}
        <p class="episode">{item.episode.title}</p>
      {/if}
      <p class="meta">
        {#each facts as fact}
          <span>{fact}</span>
        {/each}
      </p>
      {#if item.finale}
        <p class="finale">{FINALES[item.finale]}</p>
      {/if}
    </div>
    {#if lamp}
      <StatusLamp tone={lamp.tone} label={lamp.label} />
    {/if}
  </a>
</li>

<style>
  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--rigging);
    color: inherit;
    text-decoration: none;
  }

  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .heading {
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .episode {
    font-size: var(--size-secondary);
    overflow-wrap: anywhere;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .finale {
    color: var(--brass);
    font-size: var(--size-caption);
  }
</style>
