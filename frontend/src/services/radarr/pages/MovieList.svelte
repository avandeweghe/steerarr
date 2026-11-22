<script lang="ts" module>
  import type { RadarrMovie } from '@steerarr/shared';

  // Kept between visits to the tab, so coming back shows the list instantly while it refreshes.
  // Dropped when settings change (services.revision), since Radarr may be a different server.
  let cached: { revision: number; monitoredOnly: boolean; movies: RadarrMovie[] } | null = null;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SearchField from '../../../lib/components/SearchField.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { navigate } from '../../../lib/router.svelte';
  import { loadMonitoredOnly, saveMonitoredOnly } from '../../../lib/list-filter';
  import { services } from '../../../lib/services.svelte';
  import { plural } from '../../../lib/format';
  import { getMovies } from '../api';
  import MovieRow from '../components/MovieRow.svelte';
  import RadarrNav from '../components/RadarrNav.svelte';

  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const addIcon = 'M12 5v14M5 12h14';

  let movies = $state<RadarrMovie[] | null>(
    cached?.revision === services.revision && cached.monitoredOnly === loadMonitoredOnly('radarr')
      ? cached.movies
      : null,
  );
  let error = $state<string | null>(null);
  let loading = $state(false);
  /** The load in flight, shared by the refresh button and pull-to-refresh. */
  let pending: Promise<void> | null = null;
  let query = $state('');
  /** Only monitored movies, as last chosen on this device. */
  let monitoredOnly = $state(loadMonitoredOnly('radarr'));

  const filtered = $derived.by(() => {
    if (!movies) return [];
    const needle = normalize(query.trim());
    return needle ? movies.filter((item) => normalize(item.title).includes(needle)) : movies;
  });

  /** Case- and accent-insensitive, so "pokemon" finds "Pokémon". */
  function normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }

  function load(): Promise<void> {
    pending ??= fetchMovies().finally(() => (pending = null));
    return pending;
  }

  async function fetchMovies(): Promise<void> {
    loading = true;
    const revision = services.revision;
    const filter = monitoredOnly;
    try {
      const fresh = await getMovies(filter);
      // The filter changed meanwhile: this answer is for the other one.
      if (filter !== monitoredOnly) return;
      movies = fresh;
      cached = { revision, monitoredOnly: filter, movies: fresh };
      error = null;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  async function toggleMonitored(): Promise<void> {
    monitoredOnly = !monitoredOnly;
    saveMonitoredOnly('radarr', monitoredOnly);
    movies = null;
    await pending;
    await load();
  }

  onMount(load);
</script>

<PageHeader title="Radarr">
  {#snippet actions()}
    <HeaderButton icon={addIcon} label="Add movie" onclick={() => navigate('/radarr/add')} />
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={load}
      disabled={loading}
      spinning={loading}
    />
    <SettingsLink serviceId="radarr" serviceName="Radarr" />
  {/snippet}
</PageHeader>

<RadarrNav />

<div class="filter">
  <button
    type="button"
    class:current={monitoredOnly}
    aria-pressed={monitoredOnly}
    onclick={toggleMonitored}
  >
    Monitored only
  </button>
</div>

<PullToRefresh onrefresh={load}>
  {#if error}
    <div class="panel problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <div class="stack">
        <p>{movies ? "Couldn't refresh the movies." : "Couldn't load the movies."} {error}</p>
        <button class="button" type="button" onclick={load} disabled={loading}>Try again</button>
      </div>
    </div>
  {/if}

  {#if movies === null}
    {#if !error}<p class="muted">Loading movies…</p>{/if}
  {:else if movies.length === 0}
    <p class="muted">
      {monitoredOnly
        ? "Radarr isn't monitoring any movies."
        : "Radarr doesn't have any movies yet."}
    </p>
  {:else}
    <div class="tools">
      <SearchField bind:value={query} label="Search movies" placeholder="Search movies" />
      <p class="muted count" aria-live="polite">
        {query.trim()
          ? `${filtered.length} of ${plural(movies.length, 'movie')}`
          : plural(movies.length, 'movie')}
      </p>
    </div>

    {#if filtered.length === 0}
      <p class="muted">No movies match “{query.trim()}”.</p>
    {:else}
      <ul>
        {#each filtered as item (item.id)}
          <MovieRow movie={item} />
        {/each}
      </ul>
    {/if}
  {/if}
</PullToRefresh>

<style>
  .filter {
    display: flex;
    margin-bottom: 0.75rem;
  }

  .filter button {
    min-height: var(--tap);
    padding: 0 0.875rem;
    border: 1px solid var(--rigging);
    border-radius: 999px;
    background: transparent;
    color: var(--fog);
    font-size: var(--size-secondary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .filter .current {
    border-color: var(--sailcloth);
    color: var(--sailcloth);
  }

  .tools {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .count {
    font-size: var(--size-caption);
  }

  ul {
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
