<script lang="ts">
  import type { SonarrWantedEpisode } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { plural } from '../../../lib/format';
  import { getWanted, searchWanted, type WantedList } from '../api';
  import { runSearch, searches } from '../searches.svelte';
  import SearchStatus from './SearchStatus.svelte';
  import WantedItem from './WantedItem.svelte';

  /** One of Sonarr's wanted lists, 50 at a time, with Search all. Remounted to reload. */
  let { list }: { list: WantedList } = $props();

  let items = $state<SonarrWantedEpisode[] | null>(null);
  let total = $state(0);
  let page = $state(0);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let confirmingAll = $state(false);

  const searchKey = $derived(`wanted:${list}`);
  const searchingAll = $derived(searches.states[searchKey]?.kind === 'running');
  const countText = $derived.by(() => {
    if (list === 'missing') return plural(total, 'missing episode');
    return `${plural(total, 'episode')} below the quality cutoff`;
  });
  const confirmText = $derived(
    `Search for all ${countText}? Sonarr searches your indexers for each one, which can take a while.`,
  );

  onMount(() => {
    void load(true);
  });

  async function load(fromStart: boolean): Promise<void> {
    if (loading) return;
    loading = true;
    if (fromStart) page = 0;
    try {
      const next = await getWanted(list, page + 1);
      items = fromStart || !items ? next.records : append(items, next.records);
      total = next.totalRecords;
      page = next.page;
      error = null;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  /** Episodes searched in the meantime shift the pages; keep each one once. */
  function append(shown: SonarrWantedEpisode[], more: SonarrWantedEpisode[]) {
    const seen = new Set(shown.map((item) => item.id));
    return [...shown, ...more.filter((item) => !seen.has(item.id))];
  }

  function showMore(): Promise<void> {
    return load(false);
  }

  function searchAll(): void {
    confirmingAll = false;
    void runSearch(searchKey, () => searchWanted(list));
  }
</script>

{#if error}
  <p class="problem" role="alert">
    <StatusLamp tone="error" label="Failed" />
    <span>Couldn't load the list. {error}</span>
  </p>
{/if}

{#if items === null}
  {#if !error}<p class="muted">Loading…</p>{/if}
{:else if items.length === 0}
  <p class="muted">
    {list === 'missing' ? 'Nothing is missing.' : 'Every file meets its quality cutoff.'}
  </p>
{:else}
  <div class="summary">
    <p class="muted">{countText}</p>
    {#if !confirmingAll}
      <button
        class="button"
        type="button"
        disabled={searchingAll}
        onclick={() => (confirmingAll = true)}
      >
        {searchingAll ? 'Searching…' : 'Search all'}
      </button>
    {/if}
  </div>
  {#if confirmingAll}
    <div class="confirm">
      <p>{confirmText}</p>
      <div class="actions">
        <button class="button primary" type="button" onclick={searchAll}>Search all</button>
        <button class="button" type="button" onclick={() => (confirmingAll = false)}>Cancel</button>
      </div>
    </div>
  {/if}
  <SearchStatus key={searchKey} />

  <ul>
    {#each items as item (item.id)}
      <WantedItem {item} />
    {/each}
  </ul>
  {#if items.length < total}
    <button class="button more" type="button" onclick={showMore} disabled={loading}>
      {loading ? 'Loading…' : 'Show more'}
    </button>
  {/if}
{/if}

<style>
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .confirm {
    display: grid;
    gap: 0.625rem;
    margin-bottom: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--rigging-strong);
    border-radius: var(--radius-panel);
    font-size: var(--size-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    margin: 0.5rem 0;
    font-size: var(--size-secondary);
  }

  .more {
    margin-top: 1rem;
  }
</style>
