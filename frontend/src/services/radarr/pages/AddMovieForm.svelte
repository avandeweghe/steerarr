<script lang="ts">
  import type {
    RadarrAddOptions,
    RadarrAddRequest,
    RadarrAvailability,
    RadarrLookupResult,
  } from '@steerarr/shared';
  import { untrack } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes } from '../../../lib/format';
  import { navigate, type PageProps } from '../../../lib/router.svelte';
  import { cachedResult, loadAddDefaults, markAdded, saveAddDefaults } from '../add-state';
  import { addMovie, getAddOptions, lookupMovies } from '../api';
  import Poster from '../components/Poster.svelte';
  import { AVAILABILITY_OPTIONS, formatRuntime } from '../movie-status';

  /** Route /radarr/add/:tmdbId: the options for adding one TMDb movie to Radarr. */
  let { params }: PageProps = $props();

  const tmdbId = $derived(Number(params.tmdbId));
  let movie = $state<RadarrLookupResult | null>(null);
  let options = $state<RadarrAddOptions | null>(null);
  let loadError = $state<string | null>(null);
  let addError = $state<string | null>(null);
  let adding = $state(false);

  let qualityProfileId = $state(0);
  let rootFolderPath = $state('');
  let minimumAvailability = $state<RadarrAvailability>('released');
  let monitored = $state(true);
  let search = $state(true);

  const availabilityHint = $derived(
    AVAILABILITY_OPTIONS.find((option) => option.value === minimumAvailability)?.hint,
  );
  const usableFolders = $derived(options?.rootFolders.filter((folder) => folder.accessible) ?? []);
  /** What stops adding, if anything: Radarr needs a quality profile and a root folder. */
  const blocker = $derived.by(() => {
    if (!options) return null;
    if (options.qualityProfiles.length === 0) {
      return 'Radarr has no quality profiles. Add one in Radarr first.';
    }
    if (usableFolders.length === 0) {
      return 'Radarr has no root folder it can reach. Add or fix one in Radarr first.';
    }
    return null;
  });

  // The page stays mounted when only params change, so load whenever the id does.
  $effect(() => {
    const current = tmdbId;
    untrack(() => void load(current));
  });

  async function load(id: number): Promise<void> {
    movie = null;
    options = null;
    loadError = null;
    addError = null;
    try {
      const [found, choices] = await Promise.all([findMovie(id), getAddOptions()]);
      if (id !== tmdbId) return;
      movie = found;
      options = choices;
      applyDefaults(choices);
    } catch (err) {
      if (id === tmdbId) loadError = errorMessage(err);
    }
  }

  /** From the search you came from if possible, else from TMDb again. */
  async function findMovie(id: number): Promise<RadarrLookupResult> {
    const cached = cachedResult(id);
    if (cached) return cached;
    const results = await lookupMovies(`tmdb:${id}`);
    const found = results.find((result) => result.tmdbId === id);
    if (!found) throw new Error("TMDb doesn't know this movie. Search for it again.");
    return found;
  }

  /** Last time's choices where they still exist in Radarr, else Radarr's first option. */
  function applyDefaults(choices: RadarrAddOptions): void {
    const saved = loadAddDefaults();
    const profiles = choices.qualityProfiles;
    const folders = choices.rootFolders.filter((folder) => folder.accessible);
    // The default from Steerarr's settings, else the one used last on this device.
    const preferred = choices.defaultQualityProfileId ?? saved.qualityProfileId;
    const profile = profiles.find((item) => item.id === preferred) ?? profiles[0];
    const folder = folders.find((item) => item.path === saved.rootFolderPath) ?? folders[0];
    const known = AVAILABILITY_OPTIONS.some((option) => option.value === saved.minimumAvailability);
    qualityProfileId = profile?.id ?? 0;
    rootFolderPath = folder?.path ?? '';
    minimumAvailability =
      known && saved.minimumAvailability ? saved.minimumAvailability : 'released';
    monitored = flag(saved.monitored, true);
    search = flag(saved.search, true);
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
    if (!movie || blocker || adding) return;
    const request: RadarrAddRequest = {
      tmdbId: movie.tmdbId,
      qualityProfileId,
      rootFolderPath,
      monitored,
      minimumAvailability,
      search: monitored && search,
    };
    adding = true;
    addError = null;
    try {
      const { id } = await addMovie(request);
      saveAddDefaults({ qualityProfileId, rootFolderPath, minimumAvailability, monitored, search });
      markAdded(request.tmdbId, id);
      navigate(`/radarr/movies/${id}`, { replace: true });
    } catch (err) {
      addError = errorMessage(err);
    } finally {
      adding = false;
    }
  }
</script>

<PageHeader title="Add movie" back={{ href: '/radarr/add', label: 'Search' }} />

{#if loadError}
  <div class="panel problem" role="alert">
    <StatusLamp tone="error" label="Failed" />
    <div class="stack">
      <p>Couldn't load this movie. {loadError}</p>
      <button class="button" type="button" onclick={() => load(tmdbId)}>Try again</button>
    </div>
  </div>
{:else if !movie || !options}
  <p class="muted">Loading…</p>
{:else}
  <section class="summary">
    <Poster src={movie.posterUrl} title={movie.title} large />
    <div class="facts">
      <h2>{movie.title}</h2>
      <p class="meta">
        {#if movie.year > 0}<span class="number">{movie.year}</span>{/if}
        {#if movie.runtime}<span>{formatRuntime(movie.runtime)}</span>{/if}
      </p>
      {#if movie.studio}<p class="meta">{movie.studio}</p>{/if}
    </div>
  </section>
  {#if movie.overview}
    <p class="overview">{movie.overview}</p>
  {/if}

  {#if movie.existingId !== null}
    <p class="panel">
      Radarr already has this movie. <a href="#/radarr/movies/{movie.existingId}">Open it</a>
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
        <label for="add-availability">Minimum availability</label>
        <select id="add-availability" bind:value={minimumAvailability}>
          {#each AVAILABILITY_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <p class="hint">{availabilityHint}</p>
      </div>

      <label class="check">
        <input type="checkbox" bind:checked={monitored} />
        Monitor this movie
      </label>

      <label class="check">
        <input type="checkbox" bind:checked={search} disabled={!monitored} />
        Start searching for it right away
      </label>

      {#if addError}
        <div class="panel problem" role="alert">
          <StatusLamp tone="error" label="Failed" />
          <p>Couldn't add the movie. {addError}</p>
        </div>
      {/if}

      <button class="button primary" type="submit" disabled={adding}>
        {adding ? 'Adding…' : 'Add movie'}
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
