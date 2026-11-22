<script lang="ts">
  import type { SonarrEpisode, SonarrSeriesDetail } from '@steerarr/shared';
  import { untrack } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes } from '../../../lib/format';
  import { cameFrom, navigate, type PageProps } from '../../../lib/router.svelte';
  import { services } from '../../../lib/services.svelte';
  import DeleteFromLibrary from '../../../lib/components/DeleteFromLibrary.svelte';
  import {
    deleteEpisodeFile,
    deleteSeries,
    getSeriesDetail,
    setEpisodeMonitored,
    setSeasonMonitored,
    setSeriesMonitored,
  } from '../api';
  import MonitorToggle from '../components/MonitorToggle.svelte';
  import Poster from '../components/Poster.svelte';
  import Progress from '../components/Progress.svelte';
  import SeasonItem from '../components/SeasonItem.svelte';
  import { cacheDetail, cachedDetail } from '../detail-cache';
  import { seriesStatus } from '../series-status';

  let { params }: PageProps = $props();

  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

  /** Pages a series is opened from; the back link returns there, or else to the list. */
  const BACK_LABELS: Record<string, string> = {
    '/sonarr': 'Sonarr',
    '/sonarr/activity': 'Activity',
    '/sonarr/wanted': 'Wanted',
    '/sonarr/add': 'Search',
  };
  const back = backLink(cameFrom());

  function backLink(from: string | null): { href: string; label: string } {
    const label = from ? BACK_LABELS[from] : undefined;
    return from && label ? { href: from, label } : { href: '/sonarr', label: 'Sonarr' };
  }
  /** Overviews longer than this start clamped, with a button to show the rest. */
  const LONG_OVERVIEW = 240;
  /** Checking back for episodes after adding: every 3 s, for about 30 s. */
  const EPISODE_CHECK_MS = 3000;
  const EPISODE_CHECKS = 10;

  const id = $derived(Number(params.id));
  let series = $state<SonarrSeriesDetail | null>(null);
  let error = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let loading = $state(false);
  let overviewOpen = $state(false);
  /** Seasons opened or closed by a tap; the others follow defaultOpen. */
  let openSeasons = $state<Record<number, boolean>>({});
  /** One episode open at a time, across all seasons. */
  let openEpisode = $state<number | null>(null);
  /** Only the latest load may update the page (refreshes can overlap). */
  let latestLoad = 0;
  /** How many times the page has checked back for episodes (see fetchingEpisodes). */
  let episodeChecks = $state(0);

  const longOverview = $derived((series?.overview?.length ?? 0) > LONG_OVERVIEW);

  /**
   * Seasons but no episodes: right after a series is added, Sonarr is still fetching them.
   * The page checks back every few seconds for a while.
   */
  const fetchingEpisodes = $derived.by(() => {
    if (!series || series.seasons.length === 0) return false;
    return series.episodes.length === 0 && episodeChecks < EPISODE_CHECKS;
  });

  $effect(() => {
    if (!fetchingEpisodes) return;
    const timer = setTimeout(() => {
      episodeChecks += 1;
      void refresh();
    }, EPISODE_CHECK_MS);
    return () => clearTimeout(timer);
  });

  const episodesBySeason = $derived.by(() => {
    const groups = new Map<number, SonarrEpisode[]>();
    for (const episode of series?.episodes ?? []) {
      const group = groups.get(episode.seasonNumber);
      if (group) group.push(episode);
      else groups.set(episode.seasonNumber, [episode]);
    }
    return groups;
  });

  /** A series with a single regular season starts with it open. */
  const defaultOpen = $derived.by(() => {
    const regular = series?.seasons.filter((season) => season.seasonNumber > 0) ?? [];
    const [first] = regular;
    return regular.length === 1 && first ? first.seasonNumber : null;
  });

  // The page stays mounted when only params change, so start over whenever the id does.
  $effect(() => {
    const current = id;
    untrack(() => {
      series = cachedDetail(current);
      error = null;
      actionError = null;
      overviewOpen = false;
      openSeasons = {};
      openEpisode = null;
      episodeChecks = 0;
      void refresh();
    });
  });

  async function refresh(): Promise<void> {
    const load = ++latestLoad;
    const target = id;
    const revision = services.revision;
    loading = true;
    try {
      const fresh = await getSeriesDetail(target);
      if (load !== latestLoad) return;
      cacheDetail(target, revision, fresh);
      series = fresh;
      error = null;
    } catch (err) {
      if (load === latestLoad) error = errorMessage(err);
    } finally {
      if (load === latestLoad) loading = false;
    }
  }

  function isOpen(seasonNumber: number): boolean {
    const fallback = seasonNumber === defaultOpen;
    return openSeasons[seasonNumber] ?? fallback;
  }

  function toggleSeason(seasonNumber: number): void {
    openSeasons[seasonNumber] = !isOpen(seasonNumber);
  }

  function toggleEpisode(episodeId: number): void {
    openEpisode = openEpisode === episodeId ? null : episodeId;
  }

  /** Saves a monitoring change, shows it, then reloads: Sonarr's counts depend on it. */
  async function changeMonitoring(save: () => Promise<void>, apply: () => void): Promise<void> {
    actionError = null;
    try {
      await save();
    } catch (err) {
      actionError = `Couldn't change monitoring. ${errorMessage(err)}`;
      return;
    }
    apply();
    // Keep the cache in step too, in case the refresh below fails.
    if (series) cacheDetail(id, services.revision, $state.snapshot(series));
    void refresh();
  }

  function monitorSeries(monitored: boolean): Promise<void> {
    return changeMonitoring(
      () => setSeriesMonitored(id, monitored),
      () => {
        if (series) series.monitored = monitored;
      },
    );
  }

  /** Sonarr sets every episode in the season to match, so the page does too. */
  function monitorSeason(seasonNumber: number, monitored: boolean): Promise<void> {
    return changeMonitoring(
      () => setSeasonMonitored(id, seasonNumber, monitored),
      () => {
        const season = series?.seasons.find((item) => item.seasonNumber === seasonNumber);
        if (season) season.monitored = monitored;
        for (const episode of episodesBySeason.get(seasonNumber) ?? []) {
          episode.monitored = monitored;
        }
      },
    );
  }

  function monitorEpisode(episode: SonarrEpisode, monitored: boolean): Promise<void> {
    return changeMonitoring(
      () => setEpisodeMonitored(episode.id, monitored),
      () => {
        episode.monitored = monitored;
      },
    );
  }

  /** Throws if Sonarr refuses, so the confirmation can show why. */
  async function removeSeries(deleteFiles: boolean, exclude: boolean): Promise<void> {
    await deleteSeries(id, deleteFiles, exclude);
    navigate('/sonarr', { replace: true });
  }

  /** Throws if Sonarr refuses, so the episode can show why. */
  async function deleteFile(episode: SonarrEpisode): Promise<void> {
    await deleteEpisodeFile(episode.id);
    episode.hasFile = false;
    episode.quality = null;
    episode.size = null;
    if (series) cacheDetail(id, services.revision, $state.snapshot(series));
    void refresh();
  }
</script>

<PageHeader title={series?.title ?? 'Series'} {back}>
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={refresh}
      disabled={loading}
      spinning={loading}
    />
  {/snippet}
</PageHeader>

<PullToRefresh onrefresh={refresh}>
  {#if error}
    <div class="panel problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <div class="stack">
        <p>{series ? "Couldn't refresh this series." : "Couldn't load this series."} {error}</p>
        <button class="button" type="button" onclick={refresh} disabled={loading}>Try again</button>
      </div>
    </div>
  {/if}

  {#if actionError}
    <div class="panel problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <p>{actionError}</p>
    </div>
  {/if}

  {#if series}
    <section class="summary">
      <Poster src={series.posterUrl} title={series.title} retryOn={series} large />
      <div class="facts">
        <p class="meta">
          <span class="number">{series.year}</span>
          {#if series.network}<span>{series.network}</span>{/if}
        </p>
        <p class="meta">{seriesStatus(series)}</p>
        <Progress
          have={series.episodeFileCount}
          want={series.episodeCount}
          monitored={series.monitored}
        />
        <p class="meta">{formatBytes(series.sizeOnDisk)} on disk</p>
        <div class="monitor">
          <MonitorToggle
            monitored={series.monitored}
            label="this series"
            onchange={monitorSeries}
          />
          <span>{series.monitored ? 'Monitored' : 'Not monitored'}</span>
        </div>
      </div>
    </section>

    {#if series.overview}
      <p class="overview" class:clamped={longOverview && !overviewOpen}>{series.overview}</p>
      {#if longOverview}
        <button class="more" type="button" onclick={() => (overviewOpen = !overviewOpen)}>
          {overviewOpen ? 'Show less' : 'Show more'}
        </button>
      {/if}
    {/if}

    <h2 class="heading">Seasons</h2>
    {#if fetchingEpisodes}
      <p class="muted">Sonarr is still fetching the episodes. They show up here shortly.</p>
    {/if}
    {#if series.seasons.length === 0}
      <p class="muted">Sonarr doesn't list any seasons for this series yet.</p>
    {:else}
      <ul class="seasons">
        {#each series.seasons as season (season.seasonNumber)}
          <SeasonItem
            seriesId={series.id}
            {season}
            episodes={episodesBySeason.get(season.seasonNumber) ?? []}
            open={isOpen(season.seasonNumber)}
            {openEpisode}
            ontoggle={() => toggleSeason(season.seasonNumber)}
            ontoggleEpisode={toggleEpisode}
            onmonitor={(monitored) => monitorSeason(season.seasonNumber, monitored)}
            onmonitorEpisode={monitorEpisode}
            ondeleteEpisodeFile={deleteFile}
          />
        {/each}
      </ul>
    {/if}

    <div class="remove">
      <DeleteFromLibrary
        kind="series"
        title={series.title}
        serviceName="Sonarr"
        ondelete={removeSeries}
      />
    </div>
  {:else if !error}
    <p class="muted">Loading series…</p>
  {/if}
</PullToRefresh>

<style>
  .remove {
    margin-top: 2rem;
  }

  .summary {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .facts {
    display: grid;
    gap: 0.25rem;
    align-content: start;
    min-width: 0;
    flex: 1;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.625rem;
    color: var(--fog);
    font-size: var(--size-secondary);
  }

  .number {
    font-family: var(--font-display);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .monitor {
    display: flex;
    align-items: center;
    margin-left: -0.75rem;
    font-size: var(--size-secondary);
  }

  .overview {
    font-size: var(--size-secondary);
  }

  .clamped {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .more {
    min-height: var(--tap);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--brass);
    font-size: var(--size-secondary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .heading {
    margin: 1.5rem 0 0.25rem;
    font-size: var(--size-heading);
  }

  .seasons {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.875rem;
    margin-bottom: 1rem;
  }

  .stack {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }
</style>
