<script lang="ts" module>
  import type { SonarrSeries } from '@steerarr/shared';

  // Kept between visits to the tab, so coming back shows the list instantly while it refreshes.
  // Dropped when settings change (services.revision), since Sonarr may be a different server.
  let cached: { revision: number; monitoredOnly: boolean; series: SonarrSeries[] } | null = null;
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
  import { getSeries } from '../api';
  import SeriesRow from '../components/SeriesRow.svelte';
  import SonarrNav from '../components/SonarrNav.svelte';

  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const addIcon = 'M12 5v14M5 12h14';

  let series = $state<SonarrSeries[] | null>(
    cached?.revision === services.revision && cached.monitoredOnly === loadMonitoredOnly('sonarr')
      ? cached.series
      : null,
  );
  let error = $state<string | null>(null);
  let loading = $state(false);
  /** The load in flight, shared by the refresh button and pull-to-refresh. */
  let pending: Promise<void> | null = null;
  let query = $state('');
  /** Only monitored series, as last chosen on this device. */
  let monitoredOnly = $state(loadMonitoredOnly('sonarr'));

  const filtered = $derived.by(() => {
    if (!series) return [];
    const needle = normalize(query.trim());
    return needle ? series.filter((item) => normalize(item.title).includes(needle)) : series;
  });

  /** Case- and accent-insensitive, so "pokemon" finds "Pokémon". */
  function normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }

  function load(): Promise<void> {
    pending ??= fetchSeries().finally(() => (pending = null));
    return pending;
  }

  async function fetchSeries(): Promise<void> {
    loading = true;
    const revision = services.revision;
    const filter = monitoredOnly;
    try {
      const fresh = await getSeries(filter);
      // The filter changed meanwhile: this answer is for the other one.
      if (filter !== monitoredOnly) return;
      series = fresh;
      cached = { revision, monitoredOnly: filter, series: fresh };
      error = null;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  async function toggleMonitored(): Promise<void> {
    monitoredOnly = !monitoredOnly;
    saveMonitoredOnly('sonarr', monitoredOnly);
    series = null;
    await pending;
    await load();
  }

  onMount(load);
</script>

<PageHeader title="Sonarr">
  {#snippet actions()}
    <HeaderButton icon={addIcon} label="Add series" onclick={() => navigate('/sonarr/add')} />
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={load}
      disabled={loading}
      spinning={loading}
    />
    <SettingsLink serviceId="sonarr" serviceName="Sonarr" />
  {/snippet}
</PageHeader>

<SonarrNav />

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
        <p>{series ? "Couldn't refresh the series." : "Couldn't load the series."} {error}</p>
        <button class="button" type="button" onclick={load} disabled={loading}>Try again</button>
      </div>
    </div>
  {/if}

  {#if series === null}
    {#if !error}<p class="muted">Loading series…</p>{/if}
  {:else if series.length === 0}
    <p class="muted">
      {monitoredOnly
        ? "Sonarr isn't monitoring any series."
        : "Sonarr doesn't have any series yet."}
    </p>
  {:else}
    <div class="tools">
      <SearchField bind:value={query} label="Search series" placeholder="Search series" />
      <p class="muted count" aria-live="polite">
        {query.trim() ? `${filtered.length} of ${series.length} series` : `${series.length} series`}
      </p>
    </div>

    {#if filtered.length === 0}
      <p class="muted">No series match “{query.trim()}”.</p>
    {:else}
      <ul>
        {#each filtered as item (item.id)}
          <SeriesRow series={item} />
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
