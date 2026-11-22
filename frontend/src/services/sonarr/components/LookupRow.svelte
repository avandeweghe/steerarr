<script lang="ts">
  import type { SonarrLookupResult } from '@steerarr/shared';
  import { plural } from '../../../lib/format';
  import Poster from './Poster.svelte';

  /** One TheTVDB search result: opens the add form, or the series page if Sonarr has it. */
  let { result }: { result: SonarrLookupResult } = $props();

  const href = $derived.by(() => {
    if (result.existingId !== null) return `#/sonarr/series/${result.existingId}`;
    return `#/sonarr/add/${result.tvdbId}`;
  });
</script>

<li>
  <a {href}>
    <Poster src={result.posterUrl} title={result.title} />
    <div class="body">
      <h2>{result.title}</h2>
      <p class="meta">
        {#if result.year > 0}<span class="number">{result.year}</span>{/if}
        {#if result.network}<span>{result.network}</span>{/if}
        {#if result.seasonCount > 0}<span>{plural(result.seasonCount, 'season')}</span>{/if}
      </p>
      {#if result.existingId !== null}
        <p class="added">Already in Sonarr</p>
      {/if}
      {#if result.overview}
        <p class="overview">{result.overview}</p>
      {/if}
    </div>
  </a>
</li>

<style>
  li {
    border-bottom: 1px solid var(--rigging);
  }

  a {
    display: flex;
    gap: 0.875rem;
    padding: 0.75rem 0;
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
  }

  a:active {
    background: var(--hull);
  }

  .body {
    display: grid;
    gap: 0.25rem;
    align-content: start;
    min-width: 0;
    flex: 1;
  }

  h2 {
    font-size: 1.1875rem;
    font-weight: 600;
    line-height: 1.15;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.625rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .number {
    font-family: var(--font-display);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .added {
    color: var(--starboard);
    font-size: var(--size-caption);
  }

  .overview {
    display: -webkit-box;
    overflow: hidden;
    color: var(--fog);
    font-size: var(--size-caption);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
</style>
