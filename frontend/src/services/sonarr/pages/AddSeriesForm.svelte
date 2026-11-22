<script lang="ts">
  import type {
    SonarrAddOptions,
    SonarrAddRequest,
    SonarrLookupResult,
    SonarrMonitorOption,
    SonarrSeriesType,
  } from '@steerarr/shared';
  import { untrack } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, plural } from '../../../lib/format';
  import { navigate, type PageProps } from '../../../lib/router.svelte';
  import { cachedResult, loadAddDefaults, markAdded, saveAddDefaults } from '../add-state';
  import { addSeries, getAddOptions, lookupSeries } from '../api';
  import Poster from '../components/Poster.svelte';

  /** Route /sonarr/add/:tvdbId: the options for adding one TheTVDB series to Sonarr. */
  let { params }: PageProps = $props();

  /** Sonarr's own names for these, and what each one monitors. */
  const MONITOR_OPTIONS: Array<{ value: SonarrMonitorOption; label: string; hint: string }> = [
    { value: 'all', label: 'All episodes', hint: 'Every episode except specials.' },
    { value: 'future', label: 'Future episodes', hint: "Episodes that haven't aired yet." },
    {
      value: 'missing',
      label: 'Missing episodes',
      hint: "Episodes without files, and those that haven't aired yet.",
    },
    {
      value: 'existing',
      label: 'Existing episodes',
      hint: "Episodes that have files, and those that haven't aired yet.",
    },
    {
      value: 'recent',
      label: 'Recent episodes',
      hint: 'Episodes from the last 90 days, and those still to come.',
    },
    { value: 'pilot', label: 'Pilot episode', hint: 'Only the first episode.' },
    { value: 'firstSeason', label: 'First season', hint: 'Every episode of the first season.' },
    { value: 'lastSeason', label: 'Last season', hint: 'Every episode of the latest season.' },
    { value: 'none', label: 'None', hint: 'Nothing: the series is added unmonitored.' },
  ];

  const SERIES_TYPES: Array<{ value: SonarrSeriesType; label: string }> = [
    { value: 'standard', label: 'Standard (season and episode numbers)' },
    { value: 'daily', label: 'Daily (by air date)' },
    { value: 'anime', label: 'Anime (absolute episode numbers)' },
  ];

  const tvdbId = $derived(Number(params.tvdbId));
  let series = $state<SonarrLookupResult | null>(null);
  let options = $state<SonarrAddOptions | null>(null);
  let loadError = $state<string | null>(null);
  let addError = $state<string | null>(null);
  let adding = $state(false);
  let moreOpen = $state(false);

  let qualityProfileId = $state(0);
  let rootFolderPath = $state('');
  let monitor = $state<SonarrMonitorOption>('all');
  let seriesType = $state<SonarrSeriesType>('standard');
  let seasonFolder = $state(true);
  let monitorNewSeasons = $state(true);
  let search = $state(true);

  const monitorHint = $derived(MONITOR_OPTIONS.find((option) => option.value === monitor)?.hint);
  const usableFolders = $derived(options?.rootFolders.filter((folder) => folder.accessible) ?? []);
  /** What stops adding, if anything: Sonarr needs a quality profile and a root folder. */
  const blocker = $derived.by(() => {
    if (!options) return null;
    if (options.qualityProfiles.length === 0) {
      return 'Sonarr has no quality profiles. Add one in Sonarr first.';
    }
    if (usableFolders.length === 0) {
      return 'Sonarr has no root folder it can reach. Add or fix one in Sonarr first.';
    }
    return null;
  });

  // The page stays mounted when only params change, so load whenever the id does.
  $effect(() => {
    const current = tvdbId;
    untrack(() => void load(current));
  });

  async function load(id: number): Promise<void> {
    series = null;
    options = null;
    loadError = null;
    addError = null;
    try {
      const [found, choices] = await Promise.all([findSeries(id), getAddOptions()]);
      if (id !== tvdbId) return;
      series = found;
      options = choices;
      applyDefaults(found, choices);
    } catch (err) {
      if (id === tvdbId) loadError = errorMessage(err);
    }
  }

  /** From the search you came from if possible, else from TheTVDB again. */
  async function findSeries(id: number): Promise<SonarrLookupResult> {
    const cached = cachedResult(id);
    if (cached) return cached;
    const results = await lookupSeries(`tvdb:${id}`);
    const found = results.find((result) => result.tvdbId === id);
    if (!found) throw new Error("TheTVDB doesn't know this series. Search for it again.");
    return found;
  }

  /** Last time's choices where they still exist in Sonarr, else Sonarr's first option. */
  function applyDefaults(found: SonarrLookupResult, choices: SonarrAddOptions): void {
    const saved = loadAddDefaults();
    const profiles = choices.qualityProfiles;
    const folders = choices.rootFolders.filter((folder) => folder.accessible);
    // The default from Steerarr's settings, else the one used last on this device.
    const preferred = choices.defaultQualityProfileId ?? saved.qualityProfileId;
    const profile = profiles.find((item) => item.id === preferred) ?? profiles[0];
    const folder = folders.find((item) => item.path === saved.rootFolderPath) ?? folders[0];
    const known = MONITOR_OPTIONS.some((option) => option.value === saved.monitor);
    qualityProfileId = profile?.id ?? 0;
    rootFolderPath = folder?.path ?? '';
    monitor = known && saved.monitor ? saved.monitor : 'all';
    seasonFolder = flag(saved.seasonFolder, true);
    monitorNewSeasons = flag(saved.monitorNewSeasons, true);
    search = flag(saved.search, true);
    seriesType = found.seriesType;
  }

  /** Saved values come from storage, so check their type. */
  function flag(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  function folderLabel(path: string, freeSpace: number | null): string {
    return freeSpace === null ? path : `${path} (${formatBytes(freeSpace)} free)`;
  }

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!series || blocker || adding) return;
    const request: SonarrAddRequest = {
      tvdbId: series.tvdbId,
      qualityProfileId,
      rootFolderPath,
      monitor,
      seriesType,
      seasonFolder,
      monitorNewSeasons,
      search,
    };
    adding = true;
    addError = null;
    try {
      const { id } = await addSeries(request);
      saveAddDefaults({
        qualityProfileId,
        rootFolderPath,
        monitor,
        seasonFolder,
        monitorNewSeasons,
        search,
      });
      markAdded(request.tvdbId, id);
      navigate(`/sonarr/series/${id}`, { replace: true });
    } catch (err) {
      addError = errorMessage(err);
    } finally {
      adding = false;
    }
  }
</script>

<PageHeader title="Add series" back={{ href: '/sonarr/add', label: 'Search' }} />

{#if loadError}
  <div class="panel problem" role="alert">
    <StatusLamp tone="error" label="Failed" />
    <div class="stack">
      <p>Couldn't load this series. {loadError}</p>
      <button class="button" type="button" onclick={() => load(tvdbId)}>Try again</button>
    </div>
  </div>
{:else if !series || !options}
  <p class="muted">Loading…</p>
{:else}
  <section class="summary">
    <Poster src={series.posterUrl} title={series.title} large />
    <div class="facts">
      <h2>{series.title}</h2>
      <p class="meta">
        {#if series.year > 0}<span class="number">{series.year}</span>{/if}
        {#if series.network}<span>{series.network}</span>{/if}
        {#if series.seasonCount > 0}<span>{plural(series.seasonCount, 'season')}</span>{/if}
      </p>
    </div>
  </section>
  {#if series.overview}
    <p class="overview">{series.overview}</p>
  {/if}

  {#if series.existingId !== null}
    <p class="panel">
      Sonarr already has this series. <a href="#/sonarr/series/{series.existingId}">Open it</a>
    </p>
  {:else if blocker}
    <div class="panel problem" role="alert">
      <StatusLamp tone="warn" label="Can't add" />
      <p>{blocker}</p>
    </div>
  {:else}
    <form class="form" onsubmit={add}>
      <div class="field">
        <label for="add-profile">Quality profile</label>
        <select id="add-profile" bind:value={qualityProfileId}>
          {#each options.qualityProfiles as profile (profile.id)}
            <option value={profile.id}>{profile.name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="add-folder">Root folder</label>
        <select id="add-folder" bind:value={rootFolderPath}>
          {#each usableFolders as folder (folder.id)}
            <option value={folder.path}>{folderLabel(folder.path, folder.freeSpace)}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="add-monitor">Monitor</label>
        <select id="add-monitor" bind:value={monitor}>
          {#each MONITOR_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <p class="hint">{monitorHint}</p>
      </div>

      <label class="check">
        <input type="checkbox" bind:checked={search} />
        Start searching for missing episodes
      </label>

      <button
        class="more"
        type="button"
        aria-expanded={moreOpen}
        onclick={() => (moreOpen = !moreOpen)}
      >
        {moreOpen ? 'Fewer options' : 'More options'}
      </button>

      {#if moreOpen}
        <div class="field">
          <label for="add-type">Series type</label>
          <select id="add-type" bind:value={seriesType}>
            {#each SERIES_TYPES as type (type.value)}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
        </div>
        <label class="check">
          <input type="checkbox" bind:checked={seasonFolder} />
          Put each season in its own folder
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={monitorNewSeasons} />
          Monitor seasons added later
        </label>
      {/if}

      {#if addError}
        <div class="panel problem" role="alert">
          <StatusLamp tone="error" label="Failed" />
          <p>Couldn't add the series. {addError}</p>
        </div>
      {/if}

      <button class="button primary" type="submit" disabled={adding}>
        {adding ? 'Adding…' : 'Add series'}
      </button>
    </form>
  {/if}
{/if}

<style>
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
  }

  h2 {
    font-size: var(--size-heading);
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

  .overview {
    display: -webkit-box;
    overflow: hidden;
    margin-bottom: 1.25rem;
    color: var(--fog);
    font-size: var(--size-secondary);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .form {
    display: grid;
    gap: 1rem;
    justify-items: stretch;
  }

  .form > .button {
    justify-self: start;
  }

  .more {
    justify-self: start;
    min-height: var(--tap);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--brass);
    font-size: var(--size-secondary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.875rem;
  }

  .stack {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }

  a {
    color: var(--brass);
  }
</style>
