<script lang="ts">
  import type { SonarrEpisode, SonarrSeason } from '@steerarr/shared';
  import { searchSeason } from '../api';
  import { seasonName } from '../series-status';
  import EpisodeItem from './EpisodeItem.svelte';
  import MonitorToggle from './MonitorToggle.svelte';
  import Progress from './Progress.svelte';
  import SearchButton from './SearchButton.svelte';
  import SearchStatus from './SearchStatus.svelte';

  /** One season on a series page: tap to show its episodes and searches. */
  interface Props {
    seriesId: number;
    season: SonarrSeason;
    episodes: SonarrEpisode[];
    open: boolean;
    /** The id of the episode shown open, if any. */
    openEpisode: number | null;
    ontoggle: () => void;
    ontoggleEpisode: (episodeId: number) => void;
    onmonitor: (monitored: boolean) => Promise<void>;
    onmonitorEpisode: (episode: SonarrEpisode, monitored: boolean) => Promise<void>;
    ondeleteEpisodeFile: (episode: SonarrEpisode) => Promise<void>;
  }

  let {
    seriesId,
    season,
    episodes,
    open,
    openEpisode,
    ontoggle,
    ontoggleEpisode,
    onmonitor,
    onmonitorEpisode,
    ondeleteEpisodeFile,
  }: Props = $props();

  const name = $derived(seasonName(season.seasonNumber));
  const searchKey = $derived(`season:${seriesId}:${season.seasonNumber}`);
  const releasesHref = $derived(
    `#/sonarr/series/${seriesId}/releases/season/${season.seasonNumber}`,
  );
</script>

<li class="season">
  <div class="head" class:unmonitored={!season.monitored}>
    <button class="expand" type="button" aria-expanded={open} onclick={ontoggle}>
      <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      <span class="text">
        <span class="name">{name}</span>
        <Progress
          have={season.episodeFileCount}
          want={season.episodeCount}
          monitored={season.monitored}
        />
      </span>
    </button>
    <MonitorToggle monitored={season.monitored} label={name.toLowerCase()} onchange={onmonitor} />
  </div>

  {#if open}
    <div class="body">
      <div class="actions">
        <SearchButton
          key={searchKey}
          label="Search season"
          start={() => searchSeason(seriesId, season.seasonNumber)}
        />
        <a class="button" href={releasesHref}>Pick a release</a>
      </div>
      <SearchStatus key={searchKey} />
      {#if episodes.length === 0}
        <p class="muted">No episodes in this season yet.</p>
      {:else}
        <ul class="episodes">
          {#each episodes as episode (episode.id)}
            <EpisodeItem
              {seriesId}
              {episode}
              open={openEpisode === episode.id}
              ontoggle={() => ontoggleEpisode(episode.id)}
              onmonitor={(monitored) => onmonitorEpisode(episode, monitored)}
              ondeletefile={() => ondeleteEpisodeFile(episode)}
            />
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</li>

<style>
  .season {
    border-bottom: 1px solid var(--rigging);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .unmonitored .expand {
    opacity: 0.6;
  }

  .expand {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: 3.5rem;
    padding: 0.5rem 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  .chevron {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: var(--fog);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s ease-out;
  }

  [aria-expanded='true'] .chevron {
    transform: rotate(90deg);
  }

  .text {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    flex: 1;
  }

  .name {
    font-family: var(--font-display);
    font-size: 1.1875rem;
    font-weight: 600;
  }

  .body {
    display: grid;
    gap: 0.75rem;
    padding: 0 0 1rem 1.75rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .actions a {
    text-decoration: none;
  }

  .episodes {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
