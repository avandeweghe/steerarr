<script lang="ts">
  import type { RadarrHistoryItem, RadarrQueueItem } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { getHistory, getQueue } from '../api';
  import HistoryItem from '../components/HistoryItem.svelte';
  import QueueItem from '../components/QueueItem.svelte';
  import RadarrNav from '../components/RadarrNav.svelte';

  /** Radarr's Activity: what's downloading now (the queue) and what happened (history). */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  /** Downloads move quickly, so the queue refreshes itself while the page is in view. */
  const QUEUE_REFRESH_MS = 5000;

  let queue = $state<RadarrQueueItem[] | null>(null);
  let queueError = $state<string | null>(null);
  let queueLoading = false;

  let history = $state<RadarrHistoryItem[] | null>(null);
  let historyTotal = $state(0);
  let historyPage = $state(0);
  let historyError = $state<string | null>(null);
  let historyLoading = $state(false);

  const refreshing = $derived(historyLoading && historyPage === 0);

  onMount(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void loadQueue();
    }, QUEUE_REFRESH_MS);
    return () => clearInterval(timer);
  });

  async function refresh(): Promise<void> {
    await Promise.all([loadQueue(), loadHistory(true)]);
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

  /** New events shift the pages, so the next page can repeat a few; keep each event once. */
  function append(shown: RadarrHistoryItem[], more: RadarrHistoryItem[]): RadarrHistoryItem[] {
    const seen = new Set(shown.map((item) => item.id));
    return [...shown, ...more.filter((item) => !seen.has(item.id))];
  }

  function showMore(): Promise<void> {
    return loadHistory(false);
  }

  function dropFromQueue(id: number): void {
    queue = queue?.filter((item) => item.id !== id) ?? null;
    void loadQueue();
  }
</script>

<PageHeader title="Radarr">
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={refresh}
      disabled={refreshing}
      spinning={refreshing}
    />
    <SettingsLink serviceId="radarr" serviceName="Radarr" />
  {/snippet}
</PageHeader>

<RadarrNav />

<PullToRefresh onrefresh={refresh}>
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
    {:else if queue.length === 0}
      <p class="muted">Nothing is downloading.</p>
    {:else}
      <ul>
        {#each queue as item (item.id)}
          <QueueItem {item} onremoved={() => dropFromQueue(item.id)} />
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>History</h2>
    {#if historyError}
      <p class="problem" role="alert">
        <StatusLamp tone="error" label="Failed" />
        <span>Couldn't load the history. {historyError}</span>
      </p>
    {/if}
    {#if history === null}
      {#if !historyError}<p class="muted">Loading the history…</p>{/if}
    {:else if history.length === 0}
      <p class="muted">Radarr hasn't done anything yet.</p>
    {:else}
      <ul>
        {#each history as item (item.id)}
          <HistoryItem {item} />
        {/each}
      </ul>
      {#if history.length < historyTotal}
        <button class="button more" type="button" onclick={showMore} disabled={historyLoading}>
          {historyLoading ? 'Loading…' : 'Show more'}
        </button>
      {/if}
    {/if}
  </section>
</PullToRefresh>

<style>
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
</style>
