<script lang="ts">
  import type { RadarrMovieDetail } from '@steerarr/shared';
  import { untrack } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, formatDay } from '../../../lib/format';
  import { cameFrom, navigate, type PageProps } from '../../../lib/router.svelte';
  import { services } from '../../../lib/services.svelte';
  import DeleteFromLibrary from '../../../lib/components/DeleteFromLibrary.svelte';
  import {
    deleteMovie,
    deleteMovieFile,
    getMovieDetail,
    searchMovie,
    setMovieMonitored,
  } from '../api';
  import MonitorToggle from '../components/MonitorToggle.svelte';
  import Poster from '../components/Poster.svelte';
  import SearchButton from '../components/SearchButton.svelte';
  import SearchStatus from '../components/SearchStatus.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { cacheDetail, cachedDetail } from '../detail-cache';
  import { AVAILABILITY_OPTIONS, formatRuntime } from '../movie-status';

  let { params }: PageProps = $props();

  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const DELETE_WARNING =
    'Delete this file from disk? Radarr moves it to its recycling bin if one is set up. The movie stays monitored, so Radarr may download it again.';

  /** Pages a movie is opened from; the back link returns there, or else to the list. */
  const BACK_LABELS: Record<string, string> = {
    '/radarr': 'Radarr',
    '/radarr/calendar': 'Calendar',
    '/radarr/activity': 'Activity',
    '/radarr/wanted': 'Wanted',
    '/radarr/add': 'Search',
  };
  const back = backLink(cameFrom());

  function backLink(from: string | null): { href: string; label: string } {
    const label = from ? BACK_LABELS[from] : undefined;
    return from && label ? { href: from, label } : { href: '/radarr', label: 'Radarr' };
  }

  /** Overviews longer than this start clamped, with a button to show the rest. */
  const LONG_OVERVIEW = 240;

  const id = $derived(Number(params.id));
  let movie = $state<RadarrMovieDetail | null>(null);
  let error = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let loading = $state(false);
  let overviewOpen = $state(false);
  let confirmingDelete = $state(false);
  let deleting = $state(false);
  /** Only the latest load may update the page (refreshes can overlap). */
  let latestLoad = 0;

  const longOverview = $derived((movie?.overview?.length ?? 0) > LONG_OVERVIEW);
  const availability = $derived(
    AVAILABILITY_OPTIONS.find((option) => option.value === movie?.minimumAvailability)?.label,
  );
  const searchKey = $derived(`movie:${id}`);

  /** Cinema, digital and physical dates, as far as TMDb knows them. */
  const releases = $derived.by(() => {
    if (!movie) return [];
    const dates: Array<[string, string | null]> = [
      ['In cinemas', movie.inCinemas],
      ['Digital', movie.digitalRelease],
      ['Physical', movie.physicalRelease],
    ];
    return dates.flatMap(([label, date]) => (date ? [{ label, day: formatDay(date) }] : []));
  });

  // The page stays mounted when only params change, so start over whenever the id does.
  $effect(() => {
    const current = id;
    untrack(() => {
      movie = cachedDetail(current);
      error = null;
      actionError = null;
      overviewOpen = false;
      confirmingDelete = false;
      void refresh();
    });
  });

  async function refresh(): Promise<void> {
    const load = ++latestLoad;
    const target = id;
    const revision = services.revision;
    loading = true;
    try {
      const fresh = await getMovieDetail(target);
      if (load !== latestLoad) return;
      cacheDetail(target, revision, fresh);
      movie = fresh;
      error = null;
    } catch (err) {
      if (load === latestLoad) error = errorMessage(err);
    } finally {
      if (load === latestLoad) loading = false;
    }
  }

  async function monitor(monitored: boolean): Promise<void> {
    actionError = null;
    try {
      await setMovieMonitored(id, monitored);
    } catch (err) {
      actionError = `Couldn't change monitoring. ${errorMessage(err)}`;
      return;
    }
    if (movie) {
      movie.monitored = monitored;
      cacheDetail(id, services.revision, $state.snapshot(movie));
    }
    void refresh();
  }

  /** Throws if Radarr refuses, so the confirmation can show why. */
  async function removeMovie(deleteFiles: boolean, exclude: boolean): Promise<void> {
    await deleteMovie(id, deleteFiles, exclude);
    navigate('/radarr', { replace: true });
  }

  async function deleteFile(): Promise<void> {
    deleting = true;
    actionError = null;
    try {
      await deleteMovieFile(id);
      confirmingDelete = false;
      if (movie) {
        movie.hasFile = false;
        movie.file = null;
        cacheDetail(id, services.revision, $state.snapshot(movie));
      }
      void refresh();
    } catch (err) {
      actionError = `Couldn't delete the file. ${errorMessage(err)}`;
    } finally {
      deleting = false;
    }
  }
</script>

<PageHeader title={movie?.title ?? 'Movie'} {back}>
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
        <p>{movie ? "Couldn't refresh this movie." : "Couldn't load this movie."} {error}</p>
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

  {#if movie}
    <section class="summary">
      <Poster src={movie.posterUrl} title={movie.title} retryOn={movie} large />
      <div class="facts">
        <p class="meta">
          {#if movie.year > 0}<span class="number">{movie.year}</span>{/if}
          {#if movie.runtime}<span>{formatRuntime(movie.runtime)}</span>{/if}
          {#if movie.certification}<span>{movie.certification}</span>{/if}
        </p>
        {#if movie.studio}<p class="meta">{movie.studio}</p>{/if}
        <p class="meta status">
          <StatusBadge {movie} />
        </p>
        {#if movie.qualityProfile}
          <p class="meta">Quality profile {movie.qualityProfile}</p>
        {/if}
        <div class="monitor">
          <MonitorToggle monitored={movie.monitored} label="this movie" onchange={monitor} />
          <span>{movie.monitored ? 'Monitored' : 'Not monitored'}</span>
        </div>
      </div>
    </section>

    {#if movie.genres.length > 0}
      <p class="genres">{movie.genres.join(', ')}</p>
    {/if}

    {#if movie.overview}
      <p class="overview" class:clamped={longOverview && !overviewOpen}>{movie.overview}</p>
      {#if longOverview}
        <button class="more" type="button" onclick={() => (overviewOpen = !overviewOpen)}>
          {overviewOpen ? 'Show less' : 'Show more'}
        </button>
      {/if}
    {/if}

    <h2 class="heading">File</h2>
    {#if movie.file}
      <p>{movie.file.quality}, {formatBytes(movie.file.size)}</p>
      {#if movie.file.relativePath}
        <p class="path">{movie.file.relativePath}</p>
      {/if}
      {#if confirmingDelete}
        <div class="confirm">
          <p>{DELETE_WARNING}</p>
          <div class="actions">
            <button class="button danger" type="button" disabled={deleting} onclick={deleteFile}>
              {deleting ? 'Deleting…' : 'Delete file'}
            </button>
            <button class="button" type="button" onclick={() => (confirmingDelete = false)}>
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="actions">
          <button class="button danger" type="button" onclick={() => (confirmingDelete = true)}>
            Delete file
          </button>
        </div>
      {/if}
    {:else}
      <p class="muted">
        {movie.isAvailable ? 'No file yet.' : `No file yet. Radarr looks for it once it's out.`}
      </p>
    {/if}

    <h2 class="heading">Search</h2>
    <div class="actions">
      <SearchButton key={searchKey} label="Search" start={() => searchMovie(id)} />
      <a class="button" href="#/radarr/movies/{id}/releases">Pick a release</a>
    </div>
    <SearchStatus key={searchKey} />

    {#if releases.length > 0 || availability}
      <h2 class="heading">Releases</h2>
      <dl>
        {#each releases as release (release.label)}
          <dt>{release.label}</dt>
          <dd>{release.day}</dd>
        {/each}
        {#if availability}
          <dt>Looks for it</dt>
          <dd>{availability}</dd>
        {/if}
      </dl>
    {/if}

    <div class="remove">
      <DeleteFromLibrary
        kind="movie"
        title={movie.title}
        serviceName="Radarr"
        ondelete={removeMovie}
      />
    </div>
  {:else if !error}
    <p class="muted">Loading movie…</p>
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

  .status {
    align-items: center;
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

  .genres {
    margin-bottom: 0.5rem;
    color: var(--fog);
    font-size: var(--size-caption);
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
    margin: 1.5rem 0 0.375rem;
    font-size: var(--size-heading);
  }

  .path {
    color: var(--fog);
    font-size: var(--size-caption);
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.625rem 0 0.5rem;
  }

  .confirm {
    display: grid;
    gap: 0.25rem;
    margin-top: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--rigging-strong);
    border-radius: var(--radius-panel);
    font-size: var(--size-secondary);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.375rem 1rem;
    margin: 0;
    font-size: var(--size-secondary);
  }

  dt {
    color: var(--fog);
  }

  dd {
    margin: 0;
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
