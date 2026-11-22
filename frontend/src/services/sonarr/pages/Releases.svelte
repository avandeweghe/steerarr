<script lang="ts">
  import type { SonarrRelease, SonarrSeriesDetail } from '@steerarr/shared';
  import { untrack } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { plural } from '../../../lib/format';
  import type { PageProps } from '../../../lib/router.svelte';
  import { services } from '../../../lib/services.svelte';
  import { getEpisodeReleases, getSeasonReleases, getSeriesDetail } from '../api';
  import ReleaseItem from '../components/ReleaseItem.svelte';
  import { cacheDetail, cachedDetail } from '../detail-cache';
  import { seasonName } from '../series-status';

  /**
   * Interactive search: what the indexers have for a season or an episode, to pick from.
   * Routes: /sonarr/series/:id/releases/season/:season and .../releases/episode/:episodeId.
   */
  let { params }: PageProps = $props();

  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

  const seriesId = $derived(Number(params.id));
  const season = $derived(params.season === undefined ? null : Number(params.season));
  const episodeId = $derived(params.episodeId === undefined ? null : Number(params.episodeId));

  /** Only for the back link and the line saying what was searched for. */
  let series = $state<SonarrSeriesDetail | null>(null);
  let releases = $state<SonarrRelease[] | null>(null);
  let error = $state<string | null>(null);
  let searching = $state(false);
  let showRejected = $state(false);
  /** The search in flight; a new one cancels it. */
  let controller: AbortController | null = null;

  const back = $derived({ href: `/sonarr/series/${seriesId}`, label: series?.title ?? 'Series' });
  const episode = $derived(series?.episodes.find((item) => item.id === episodeId) ?? null);

  /** "Season 2", or "Season 2, episode 5: Title". */
  const subject = $derived.by(() => {
    if (episodeId === null) return season === null ? null : seasonName(season);
    if (!episode) return null;
    const title = episode.title ? `: ${episode.title}` : '';
    return `${seasonName(episode.seasonNumber)}, episode ${episode.episodeNumber}${title}`;
  });

  const approved = $derived(releases?.filter((release) => release.approved) ?? []);
  const rejected = $derived(releases?.filter((release) => !release.approved) ?? []);

  // The page stays mounted when only params change, so search again whenever they do.
  $effect(() => {
    void [seriesId, season, episodeId];
    untrack(() => {
      series = cachedDetail(seriesId);
      if (!series) void loadSeries(seriesId);
      void search();
    });
    return () => controller?.abort();
  });

  async function loadSeries(id: number): Promise<void> {
    const revision = services.revision;
    try {
      const fresh = await getSeriesDetail(id);
      cacheDetail(id, revision, fresh);
      if (id === seriesId) series = fresh;
    } catch {
      // Only the subtitle and back link need it; the search below matters more.
    }
  }

  async function search(): Promise<void> {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    releases = null;
    error = null;
    showRejected = false;
    searching = true;
    try {
      const found = await fetchReleases(current.signal);
      if (controller === current) releases = found;
    } catch (err) {
      if (controller === current) error = errorMessage(err);
    } finally {
      if (controller === current) searching = false;
    }
  }

  function fetchReleases(signal: AbortSignal): Promise<SonarrRelease[]> {
    if (episodeId !== null) return getEpisodeReleases(episodeId, signal);
    return getSeasonReleases(seriesId, season ?? 0, signal);
  }
</script>

<PageHeader title="Releases" {back}>
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Search again"
      onclick={search}
      disabled={searching}
      spinning={searching}
    />
  {/snippet}
</PageHeader>

{#if subject}
  <p class="subject">{subject}</p>
{/if}

{#if error}
  <div class="panel problem" role="alert">
    <StatusLamp tone="error" label="Failed" />
    <div class="stack">
      <p>Couldn't search the indexers. {error}</p>
      <button class="button" type="button" onclick={search} disabled={searching}>Try again</button>
    </div>
  </div>
{:else if releases === null}
  <p class="waiting">
    <StatusLamp tone="pending" label="Searching" />
    <span>Searching the indexers. This can take a minute.</span>
  </p>
{:else if releases.length === 0}
  <p class="muted">The indexers found nothing for this.</p>
{:else}
  <p class="muted count">
    {plural(releases.length, 'release')} found. Sonarr would grab {approved.length} of them.
  </p>

  {#if approved.length > 0}
    <ul class="releases">
      {#each approved as release}
        <ReleaseItem {release} />
      {/each}
    </ul>
  {/if}

  {#if rejected.length > 0}
    {#if showRejected || approved.length === 0}
      <h2 class="heading">Rejected by Sonarr</h2>
      <ul class="releases">
        {#each rejected as release}
          <ReleaseItem {release} />
        {/each}
      </ul>
    {:else}
      <button class="button show" type="button" onclick={() => (showRejected = true)}>
        Show {rejected.length} rejected
      </button>
    {/if}
  {/if}
{/if}

<style>
  .subject {
    margin-bottom: 1rem;
    color: var(--fog);
  }

  .waiting {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    color: var(--fog);
  }

  .count {
    font-size: var(--size-caption);
  }

  .releases {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .heading {
    margin: 1.5rem 0 0.25rem;
    font-size: var(--size-heading);
  }

  .show {
    margin-top: 1rem;
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
</style>
