<script lang="ts">
  import type { RadarrHistoryEvent, RadarrHistoryItem } from '@steerarr/shared';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatWhen } from '../../../lib/format';

  /** One event in Radarr's history: grabbed, imported, failed, deleted and so on. */
  let { item }: { item: RadarrHistoryItem } = $props();

  const EVENTS: Record<RadarrHistoryEvent, { label: string; tone: LampTone | null }> = {
    grabbed: { label: 'Grabbed', tone: null },
    imported: { label: 'Imported', tone: 'ok' },
    failed: { label: 'Download failed', tone: 'error' },
    deleted: { label: 'File deleted', tone: 'warn' },
    renamed: { label: 'File renamed', tone: null },
    ignored: { label: 'Download ignored', tone: null },
    unknown: { label: 'Other event', tone: null },
  };

  const event = $derived(EVENTS[item.event]);

  const heading = $derived(item.movieTitle ?? 'Unknown movie');
</script>

<li class="item">
  <p class="event">
    {#if event.tone}<StatusLamp tone={event.tone} label={event.label} />{/if}
    <span>{event.label}</span>
    <span class="when">{formatWhen(item.date)}</span>
  </p>
  <a class="heading" href="#/radarr/movies/{item.movieId}">{heading}</a>
  <p class="release">{item.sourceTitle}</p>
  <p class="meta">
    <span>{item.quality}</span>
    {#if item.detail}<span>{item.detail}</span>{/if}
  </p>
</li>

<style>
  .item {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .event {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
    font-weight: 600;
  }

  .when {
    margin-left: auto;
    color: var(--fog);
    font-weight: 400;
    font-size: var(--size-caption);
  }

  .heading {
    color: var(--sailcloth);
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 600;
    text-decoration: none;
  }

  .release {
    color: var(--fog);
    font-size: var(--size-caption);
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
