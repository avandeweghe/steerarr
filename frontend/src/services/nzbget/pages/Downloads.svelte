<script lang="ts" module>
  // Whether the history was opened, kept while the app is open. It starts closed.
  let historyWasOpen = false;
</script>

<script lang="ts">
  import type { NzbgetHistoryItem, NzbgetQueue } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, formatDuration } from '../../../lib/format';
  import { getCategories, getHistory, getQueue, setPaused } from '../api';
  import DownloadItem from '../components/DownloadItem.svelte';
  import HistoryRow from '../components/HistoryRow.svelte';

  /** NZBGet: what's downloading (with controls), and what finished. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  /** Downloads move quickly, so the queue refreshes itself while the page is in view. */
  const QUEUE_REFRESH_MS = 3000;

  let queue = $state<NzbgetQueue | null>(null);
  let queueError = $state<string | null>(null);
  let queueLoading = false;
  let toggling = $state(false);
  let toggleError = $state<string | null>(null);
  /** NZBGet's categories for the category pickers; null until loaded (or if that fails). */
  let categories = $state<string[] | null>(null);

  let history = $state<NzbgetHistoryItem[] | null>(null);
  let historyTotal = $state(0);
  let historyPage = $state(0);
  let historyError = $state<string | null>(null);
  let historyLoading = $state(false);
  /** The history is closed until opened, and only loads then. */
  let historyOpen = $state(historyWasOpen);

  const refreshing = $derived(historyLoading && historyPage === 0);

  /** "Downloading at 12.3 MiB/s, 4.2 GiB left, about 6 min". */
  const statusText = $derived.by(() => {
    if (!queue) return null;
    const { paused, downloadRate, remaining } = queue.status;
    if (paused) return `Paused, ${formatBytes(remaining)} left`;
    if (remaining === 0) return 'Nothing to download';
    if (downloadRate === 0) return `Waiting, ${formatBytes(remaining)} left`;
    const eta = formatDuration(remaining / downloadRate);
    return `Downloading at ${formatBytes(downloadRate)}/s, ${formatBytes(remaining)} left, ${eta}`;
  });

  onMount(() => {
    void refresh();
    void loadCategories();
    const timer = setInterval(() => {
      if (!document.hidden) void loadQueue();
    }, QUEUE_REFRESH_MS);
    return () => clearInterval(timer);
  });

  /** Without them the downloads just show their category, without a picker. */
  async function loadCategories(): Promise<void> {
    try {
      categories = await getCategories();
    } catch {
      categories = null;
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([loadQueue(), historyOpen ? loadHistory(true) : undefined]);
  }

  function toggleHistory(): void {
    historyOpen = !historyOpen;
    historyWasOpen = historyOpen;
    if (historyOpen) void loadHistory(true);
  }

  async function loadQueue(): Promise<void> {
    if (queueLoading) return;
    queueLoading = true;
    try {
      queue = await getQueue();
      queueError = null;
    } catch (err) {
      queueError = errorMessage(err);
    } finally {
      queueLoading = false;
    }
  }

  /** The first page again (`fromStart`), or the next one for "Show more". */
  async function loadHistory(fromStart: boolean): Promise<void> {
    if (historyLoading) return;
    historyLoading = true;
    if (fromStart) historyPage = 0;
    try {
      const page = await getHistory(historyPage + 1);
      history = fromStart || !history ? page.records : append(history, page.records);
      historyTotal = page.totalRecords;
      historyPage = page.page;
      historyError = null;
    } catch (err) {
      historyError = errorMessage(err);
    } finally {
      historyLoading = false;
    }
  }

  /** New entries shift the pages, so the next page can repeat a few; keep each once. */
  function append(shown: NzbgetHistoryItem[], more: NzbgetHistoryItem[]): NzbgetHistoryItem[] {
    const seen = new Set(shown.map((item) => item.id));
    return [...shown, ...more.filter((item) => !seen.has(item.id))];
  }

  function showMore(): Promise<void> {
    return loadHistory(false);
  }

  async function togglePaused(): Promise<void> {
    if (!queue) return;
    toggling = true;
    toggleError = null;
    try {
      await setPaused(!queue.status.paused);
      await loadQueue();
    } catch (err) {
      toggleError = errorMessage(err);
    } finally {
      toggling = false;
    }
  }

  function queueChanged(): void {
    void loadQueue();
  }
</script>

<PageHeader title="NZBGet">
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={refresh}
      disabled={refreshing}
      spinning={refreshing}
    />
    <SettingsLink serviceId="nzbget" serviceName="NZBGet" />
  {/snippet}
</PageHeader>

<PullToRefresh onrefresh={refresh}>
  {#if queue}
    <div class="panel overall">
      <StatusLamp
        tone={queue.status.paused ? 'warn' : 'ok'}
        label={queue.status.paused ? 'Paused' : 'Running'}
      />
      <p>{statusText}</p>
      <button class="button" type="button" disabled={toggling} onclick={togglePaused}>
        {queue.status.paused ? 'Resume all' : 'Pause all'}
      </button>
    </div>
    {#if toggleError}
      <p class="problem" role="alert">
        <StatusLamp tone="error" label="Failed" />
        <span>Couldn't change it. {toggleError}</span>
      </p>
    {/if}
  {/if}

  <section>
    <h2>Queue</h2>
    {#if queueError}
      <p class="problem" role="alert">
        <StatusLamp tone="error" label="Failed" />
        <span>Couldn't load the queue. {queueError}</span>
      </p>
    {/if}
    {#if queue === null}
      {#if !queueError}<p class="muted">Loading the queue…</p>{/if}
    {:else if queue.items.length === 0}
      <p class="muted">The queue is empty.</p>
    {:else}
      <ul>
        {#each queue.items as item (item.id)}
          <DownloadItem {item} {categories} onchanged={queueChanged} />
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>
      <button class="toggle" type="button" aria-expanded={historyOpen} onclick={toggleHistory}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        History
      </button>
    </h2>
    {#if historyOpen}
      {#if historyError}
        <p class="problem" role="alert">
          <StatusLamp tone="error" label="Failed" />
          <span>Couldn't load the history. {historyError}</span>
        </p>
      {/if}
      {#if history === null}
        {#if !historyError}<p class="muted">Loading the history…</p>{/if}
      {:else if history.length === 0}
        <p class="muted">Nothing has finished yet.</p>
      {:else}
        <ul>
          {#each history as item (item.id)}
            <HistoryRow {item} />
          {/each}
        </ul>
        {#if history.length < historyTotal}
          <button class="button more" type="button" onclick={showMore} disabled={historyLoading}>
            {historyLoading ? 'Loading…' : 'Show more'}
          </button>
        {/if}
      {/if}
    {/if}
  </section>
</PullToRefresh>

<style>
  .overall {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin-bottom: 1.25rem;
  }

  .overall p {
    flex: 1;
    min-width: 12rem;
    font-size: var(--size-secondary);
  }

  section + section {
    margin-top: 1.75rem;
  }

  h2 {
    margin-bottom: 0.25rem;
    font-size: var(--size-heading);
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

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: var(--tap);
    margin-left: -0.375rem;
    padding: 0 0.375rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  .toggle svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: var(--fog);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s ease-out;
  }

  .toggle[aria-expanded='true'] svg {
    transform: rotate(90deg);
  }
</style>
