<script lang="ts">
  import type { SonarrWantedEpisode } from '@steerarr/shared';
  import { formatDay } from '../../../lib/format';
  import { searchEpisode } from '../api';
  import { episodeCode } from '../series-status';
  import SearchButton from './SearchButton.svelte';
  import SearchStatus from './SearchStatus.svelte';

  /** One wanted episode, with a search for it. */
  let { item }: { item: SonarrWantedEpisode } = $props();

  const code = $derived(episodeCode(item.episode.seasonNumber, item.episode.episodeNumber));
  const searchKey = $derived(`episode:${item.id}`);

  const facts = $derived.by(() => {
    const parts: string[] = [];
    if (item.airDateUtc) parts.push(`Aired ${formatDay(item.airDateUtc)}`);
    if (item.quality) parts.push(`Has ${item.quality}`);
    return parts;
  });
</script>

<li class="item">
  <div class="row">
    <div class="text">
      <a class="heading" href="#/sonarr/series/{item.seriesId}">{item.seriesTitle} {code}</a>
      {#if item.episode.title}
        <p class="episode">{item.episode.title}</p>
      {/if}
      <p class="meta">
        {#each facts as fact}
          <span>{fact}</span>
        {/each}
      </p>
    </div>
    <SearchButton key={searchKey} label="Search" start={() => searchEpisode(item.id)} />
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

  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .heading {
    color: var(--sailcloth);
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 600;
    text-decoration: none;
  }

  .episode {
    font-size: var(--size-secondary);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }
</style>
