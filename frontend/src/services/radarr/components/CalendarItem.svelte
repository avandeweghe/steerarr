<script lang="ts">
  import type { RadarrCalendarEntry } from '@steerarr/shared';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { releaseLabel } from '../movie-status';
  import Poster from './Poster.svelte';

  /** One release on the calendar: which release it is, and whether the movie is here yet. */
  let { item }: { item: RadarrCalendarEntry } = $props();

  const lamp = $derived.by((): { tone: LampTone; label: string } | null => {
    if (item.hasFile) return { tone: 'ok', label: 'Downloaded' };
    if (item.downloading) return { tone: 'pending', label: 'Downloading' };
    return null;
  });

  const facts = $derived.by(() => {
    const parts = [releaseLabel(item.kind)];
    if (item.studio) parts.push(item.studio);
    if (lamp) parts.push(lamp.label);
    return parts;
  });
</script>

<li>
  <a class="item" href="#/radarr/movies/{item.movieId}">
    <Poster src={item.posterUrl} title={item.title} />
    <div class="text">
      <p class="heading">{item.title}</p>
      <p class="meta">
        {#each facts as fact}
          <span>{fact}</span>
        {/each}
      </p>
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

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }
</style>
