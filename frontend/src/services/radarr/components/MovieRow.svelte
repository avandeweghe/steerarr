<script lang="ts">
  import type { RadarrMovie } from '@steerarr/shared';
  import Poster from './Poster.svelte';
  import StatusBadge from './StatusBadge.svelte';

  let { movie }: { movie: RadarrMovie } = $props();
</script>

<li class:unmonitored={!movie.monitored}>
  <a href="#/radarr/movies/{movie.id}">
    <Poster src={movie.posterUrl} title={movie.title} retryOn={movie} />
    <div class="body">
      <h2>{movie.title}</h2>
      <p class="meta">
        {#if movie.year > 0}<span class="number">{movie.year}</span>{/if}
        {#if movie.studio}<span>{movie.studio}</span>{/if}
      </p>
      <p class="meta status">
        <StatusBadge {movie} />
        {#if movie.qualityProfile}<span>{movie.qualityProfile}</span>{/if}
        {#if !movie.monitored}<span class="tag">Not monitored</span>{/if}
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

  .status {
    align-items: center;
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
