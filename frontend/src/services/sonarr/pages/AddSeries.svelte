<script lang="ts">
  import type { SonarrLookupResult } from '@steerarr/shared';
  import { errorMessage } from '../../../lib/api';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import SearchField from '../../../lib/components/SearchField.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { cachedSearch, rememberSearch } from '../add-state';
  import { lookupSeries } from '../api';
  import LookupRow from '../components/LookupRow.svelte';

  /** Searches TheTVDB through Sonarr as you type; pick a result to add it. */
  const DEBOUNCE_MS = 400;

  const previous = cachedSearch();
  let query = $state(previous.term);
  let results = $state<SonarrLookupResult[] | null>(previous.results);
  /** The term the shown results (or error) are for. */
  let searchedFor = $state(previous.term);
  let error = $state<string | null>(null);
  let searching = $state(false);
  let controller: AbortController | null = null;

  // Search a moment after typing stops.
  $effect(() => {
    const term = query.trim();
    if (term === searchedFor) return;
    if (!term) {
      controller?.abort();
      results = null;
      error = null;
      searchedFor = '';
      return;
    }
    const timer = setTimeout(() => void search(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  // Leaving the page cancels a search in flight.
  $effect(() => () => controller?.abort());

  function retry(): void {
    void search(query.trim());
  }

  async function search(term: string): Promise<void> {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    searching = true;
    try {
      const found = await lookupSeries(term, current.signal);
      if (controller !== current) return;
      results = found;
      error = null;
      rememberSearch(term, found);
    } catch (err) {
      if (controller === current) error = errorMessage(err);
    } finally {
      if (controller === current) {
        searchedFor = term;
        searching = false;
      }
    }
  }
</script>

<PageHeader title="Add series" back={{ href: '/sonarr', label: 'Sonarr' }} />

<SearchField bind:value={query} label="Search TheTVDB" placeholder="Series name" />

<div class="results">
  {#if error}
    <div class="panel problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <div class="stack">
        <p>Couldn't search TheTVDB. {error}</p>
        <button class="button" type="button" onclick={retry}>Try again</button>
      </div>
    </div>
  {:else if searching && results === null}
    <p class="muted">Searching TheTVDB…</p>
  {:else if results === null}
    <p class="muted">Type the name of a series to find it on TheTVDB.</p>
  {:else if results.length === 0}
    <p class="muted">TheTVDB has nothing for “{searchedFor}”. Check the spelling.</p>
  {:else}
    <ul>
      {#each results as result}
        <LookupRow {result} />
      {/each}
    </ul>
  {/if}
</div>

<style>
  .results {
    margin-top: 0.75rem;
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
  }

  .stack {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }
</style>
