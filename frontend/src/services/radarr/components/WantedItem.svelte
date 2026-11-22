<script lang="ts">
  import type { RadarrWantedMovie } from '@steerarr/shared';
  import { formatDay } from '../../../lib/format';
  import { searchMovie } from '../api';
  import Poster from './Poster.svelte';
  import SearchButton from './SearchButton.svelte';
  import SearchStatus from './SearchStatus.svelte';

  /** One wanted movie, with a search for it. */
  let { item }: { item: RadarrWantedMovie } = $props();

  const searchKey = $derived(`movie:${item.id}`);

  const facts = $derived.by(() => {
    const parts: string[] = [];
    if (item.year > 0) parts.push(String(item.year));
    if (item.releasedOn) parts.push(`Out ${formatDay(item.releasedOn)}`);
    if (item.quality) parts.push(`Has ${item.quality}`);
    return parts;
  });
</script>

<li class="item">
  <div class="row">
    <a class="movie" href="#/radarr/movies/{item.id}">
      <Poster src={item.posterUrl} title={item.title} />
      <div class="text">
        <p class="heading">{item.title}</p>
        <p class="meta">
          {#each facts as fact}
            <span>{fact}</span>
          {/each}
        </p>
      </div>
    </a>
    <SearchButton key={searchKey} label="Search" start={() => searchMovie(item.id)} />
  </div>
  <SearchStatus key={searchKey} />
</li>

<style>
  .item {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .movie {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .text {
    display: grid;
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
