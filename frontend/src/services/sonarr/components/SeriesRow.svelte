<script lang="ts">
  import type { SonarrSeries } from '@steerarr/shared';
  import { seriesStatus } from '../series-status';
  import Poster from './Poster.svelte';
  import Progress from './Progress.svelte';

  let { series }: { series: SonarrSeries } = $props();
</script>

<li class:unmonitored={!series.monitored}>
  <a href="#/sonarr/series/{series.id}">
    <Poster src={series.posterUrl} title={series.title} retryOn={series} />
    <div class="body">
      <h2>{series.title}</h2>
      <p class="meta">
        <span class="number">{series.year}</span>
        {#if series.network}<span>{series.network}</span>{/if}
        {#if series.qualityProfile}<span>{series.qualityProfile}</span>{/if}
      </p>
      <Progress
        have={series.episodeFileCount}
        want={series.episodeCount}
        monitored={series.monitored}
      />
      <p class="meta">
        {seriesStatus(series)}{#if !series.monitored}<span class="tag">Not monitored</span>{/if}
      </p>
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

  .unmonitored {
    opacity: 0.6;
  }

  .body {
    display: grid;
    gap: 0.25rem;
    align-content: start;
    min-width: 0;
    flex: 1;
  }

  h2 {
    display: -webkit-box;
    overflow: hidden;
    font-size: 1.1875rem;
    font-weight: 600;
    line-height: 1.15;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
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

  .tag {
    color: var(--lantern);
  }
</style>
