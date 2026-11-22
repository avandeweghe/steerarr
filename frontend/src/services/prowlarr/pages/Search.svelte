<script lang="ts" module>
  import type { ProwlarrResult, ProwlarrSearchKind } from '@steerarr/shared';

  type Sort = 'newest' | 'seeders' | 'size';

  /** The last search, kept while you move around the app (results stay grabbable a while). */
  const last: {
    query: string;
    kind: ProwlarrSearchKind;
    indexerId: number;
    sort: Sort;
    results: ProwlarrResult[] | null;
    searchedFor: string;
  } = { query: '', kind: 'all', indexerId: 0, sort: 'newest', results: null, searchedFor: '' };
</script>

<script lang="ts">
  import type { ProwlarrDownloadClient, ProwlarrIndexer } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import SearchField from '../../../lib/components/SearchField.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { plural } from '../../../lib/format';
  import { getDownloadClients, getIndexers, search } from '../api';
  import ProwlarrNav from '../components/ProwlarrNav.svelte';
  import ResultItem from '../components/ResultItem.svelte';

  /** Prowlarr's Search: every indexer at once, then send a result to a download client. */
  const KINDS: Array<{ value: ProwlarrSearchKind; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'movies', label: 'Movies' },
    { value: 'tv', label: 'TV' },
    { value: 'audio', label: 'Audio' },
    { value: 'books', label: 'Books' },
  ];
  const SORTS: Array<{ value: Sort; label: string }> = [
    { value: 'newest', label: 'Newest' },
    { value: 'seeders', label: 'Most seeders' },
    { value: 'size', label: 'Largest' },
  ];

  let query = $state(last.query);
  let kind = $state<ProwlarrSearchKind>(last.kind);
  /** 0 for every enabled indexer. */
  let indexerId = $state(last.indexerId);
  let sort = $state<Sort>(last.sort);
  let results = $state<ProwlarrResult[] | null>(last.results);
  let searchedFor = $state(last.searchedFor);
  let error = $state<string | null>(null);
  let searching = $state(false);
  let indexers = $state<ProwlarrIndexer[]>([]);
  let clients = $state<ProwlarrDownloadClient[] | null>(null);
  let controller: AbortController | null = null;

  const enabledIndexers = $derived(indexers.filter((indexer) => indexer.enabled));

  const sorted = $derived.by(() => {
    if (!results) return [];
    const list = [...results];
    if (sort === 'seeders') list.sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
    else if (sort === 'size') list.sort((a, b) => b.size - a.size);
    else list.sort((a, b) => (a.ageHours ?? Infinity) - (b.ageHours ?? Infinity));
    return list;
  });

  onMount(() => {
    // Both only fill in choices; searching works without them.
    getIndexers().then(
      (list) => (indexers = list),
      () => {},
    );
    getDownloadClients().then(
      (list) => (clients = list),
      () => {},
    );
    return () => controller?.abort();
  });

  // Remember the choices for coming back.
  $effect(() => {
    last.query = query;
    last.kind = kind;
    last.indexerId = indexerId;
    last.sort = sort;
  });

  /** Empties the search and its results, and stops a search in flight. */
  function clear(): void {
    controller?.abort();
    controller = null;
    query = '';
    results = null;
    searchedFor = '';
    error = null;
    searching = false;
    last.results = null;
    last.searchedFor = '';
  }

  async function run(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    const term = query.trim();
    if (!term) return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    searching = true;
    error = null;
    try {
      const found = await search(term, kind, indexerId ? [indexerId] : [], current.signal);
      if (controller !== current) return;
      results = found;
      searchedFor = term;
      last.results = found;
      last.searchedFor = term;
    } catch (err) {
      if (controller === current) error = errorMessage(err);
    } finally {
      if (controller === current) searching = false;
    }
  }
</script>

<PageHeader title="Prowlarr">
  {#snippet actions()}
    <SettingsLink serviceId="prowlarr" serviceName="Prowlarr" />
  {/snippet}
</PageHeader>

<ProwlarrNav />

<form class="form" onsubmit={run}>
  <SearchField
    bind:value={query}
    label="Search the indexers"
    placeholder="What are you looking for?"
  />

  <div class="kinds" role="group" aria-label="Category">
    {#each KINDS as option (option.value)}
      <button
        type="button"
        class:current={kind === option.value}
        aria-pressed={kind === option.value}
        onclick={() => (kind = option.value)}
      >
        {option.label}
      </button>
    {/each}
  </div>

  {#if enabledIndexers.length > 1}
    <label class="field">
      <span>Indexers</span>
      <select bind:value={indexerId}>
        <option value={0}>All enabled ({enabledIndexers.length})</option>
        {#each enabledIndexers as indexer (indexer.id)}
          <option value={indexer.id}>{indexer.name}</option>
        {/each}
      </select>
    </label>
  {/if}

  <div class="buttons">
    <button class="button primary" type="submit" disabled={searching || !query.trim()}>
      {searching ? 'Searching…' : 'Search'}
    </button>
    {#if query || results !== null || error}
      <button class="button" type="button" onclick={clear}>Clear</button>
    {/if}
  </div>
</form>

<div class="results">
  {#if error}
    <p class="problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>Couldn't search. {error}</span>
    </p>
  {:else if searching}
    <p class="waiting">
      <StatusLamp tone="pending" label="Searching" />
      <span>Asking the indexers. This can take a minute.</span>
    </p>
  {/if}

  {#if results !== null && !searching}
    {#if results.length === 0}
      <p class="muted">Nothing found for “{searchedFor}”.</p>
    {:else}
      <div class="summary">
        <p class="muted">{plural(results.length, 'result')} for “{searchedFor}”</p>
        <label class="sort">
          <span class="visually-hidden">Sort by</span>
          <select bind:value={sort}>
            {#each SORTS as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <ul>
        {#each sorted as result (`${result.indexerId}:${result.guid}`)}
          <ResultItem {result} {clients} />
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .form {
    display: grid;
    gap: 0.75rem;
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
  }

  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .kinds button {
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

  .kinds .current {
    border-color: var(--sailcloth);
    color: var(--sailcloth);
  }

  .results {
    margin-top: 1.25rem;
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .sort select {
    min-height: var(--tap);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .problem,
  .waiting {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }

  .waiting {
    color: var(--fog);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
