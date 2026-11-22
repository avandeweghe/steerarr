<script lang="ts">
  import type { SonarrQueueItem } from '@steerarr/shared';
  import { errorMessage } from '../../../lib/api';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, formatDuration } from '../../../lib/format';
  import { removeFromQueue } from '../api';
  import { episodeCode } from '../series-status';

  /** One download in Sonarr's queue: progress, what's wrong, and removing it. */
  interface Props {
    item: SonarrQueueItem;
    /** Called once it's removed, so the list can drop it. */
    onremoved: () => void;
  }

  let { item, onremoved }: Props = $props();

  const STATUS_LABELS: Record<string, string> = {
    downloading: 'Downloading',
    queued: 'Queued',
    paused: 'Paused',
    completed: 'Downloaded',
    delay: 'Waiting (delay profile)',
    failed: 'Failed',
    warning: 'Needs attention',
    downloadClientUnavailable: 'Download client unavailable',
    fallback: 'Waiting for the download client',
  };

  const STATE_LABELS: Record<string, string> = {
    importPending: 'Waiting to import',
    importing: 'Importing',
    importBlocked: 'Import blocked',
    imported: 'Imported',
    failedPending: 'Failed, waiting to be handled',
    failed: 'Failed',
  };

  let confirming = $state(false);
  let removing = $state(false);
  let error = $state<string | null>(null);

  const progress = $derived(item.size > 0 ? Math.min(1 - item.sizeLeft / item.size, 1) : 0);

  /** What it's doing, in Sonarr's terms: the import state once downloaded, else the status. */
  const statusText = $derived.by(() => {
    const fromState = item.state ? STATE_LABELS[item.state] : undefined;
    if (fromState && item.status === 'completed') return fromState;
    return STATUS_LABELS[item.status] ?? item.status;
  });

  const lamp = $derived.by((): LampTone => {
    if (item.health === 'error' || item.status === 'failed') return 'error';
    if (item.health === 'warning' || item.status === 'warning') return 'warn';
    return item.status === 'downloading' || item.status === 'completed' ? 'ok' : 'pending';
  });

  const sizeText = $derived.by(() => {
    const done = formatBytes(Math.max(item.size - item.sizeLeft, 0));
    const left = item.timeLeft === null ? '' : `, ${formatDuration(item.timeLeft)} left`;
    return `${done} of ${formatBytes(item.size)}${left}`;
  });

  const heading = $derived.by(() => {
    const series = item.seriesTitle ?? 'Unknown series';
    if (!item.episode) return series;
    return `${series} ${episodeCode(item.episode.seasonNumber, item.episode.episodeNumber)}`;
  });

  const confirmText = $derived(
    `Remove this download from Sonarr's queue and from ${item.downloadClient ?? 'the download client'}?`,
  );

  async function remove(blocklist: boolean): Promise<void> {
    removing = true;
    error = null;
    try {
      await removeFromQueue(item.id, blocklist);
      onremoved();
    } catch (err) {
      error = `Couldn't remove it. ${errorMessage(err)}`;
    } finally {
      removing = false;
    }
  }

  function removeOnly(): Promise<void> {
    return remove(false);
  }

  function removeAndBlock(): Promise<void> {
    return remove(true);
  }

  function startRemove(): void {
    confirming = true;
  }

  function cancelRemove(): void {
    confirming = false;
    error = null;
  }
</script>

<li class="item">
  <div class="head">
    <StatusLamp tone={lamp} label={statusText} />
    <div class="text">
      {#if item.seriesId !== null}
        <a class="heading" href="#/sonarr/series/{item.seriesId}">{heading}</a>
      {:else}
        <p class="heading">{heading}</p>
      {/if}
      {#if item.episode?.title}
        <p class="episode">{item.episode.title}</p>
      {/if}
    </div>
  </div>

  <span class="bar" aria-hidden="true"><span style:width="{progress * 100}%"></span></span>
  <p class="meta">
    <span>{statusText}</span>
    <span>{sizeText}</span>
    <span>{item.quality}</span>
    {#if item.downloadClient}<span>{item.downloadClient}</span>{/if}
  </p>
  <p class="release">{item.title}</p>

  {#if item.messages.length > 0}
    <ul class="messages">
      {#each item.messages as message}
        <li>{message}</li>
      {/each}
    </ul>
  {/if}

  {#if confirming}
    <div class="confirm">
      <p>{confirmText}</p>
      <p class="hint">Blocklisting also stops Sonarr from grabbing this release again.</p>
      <div class="actions">
        <button class="button danger" type="button" disabled={removing} onclick={removeOnly}>
          Remove
        </button>
        <button class="button danger" type="button" disabled={removing} onclick={removeAndBlock}>
          Remove and blocklist
        </button>
        <button class="button" type="button" onclick={cancelRemove}>Cancel</button>
      </div>
    </div>
  {:else}
    <div class="actions">
      <button class="button" type="button" onclick={startRemove}>Remove…</button>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>{error}</span>
    </p>
  {/if}
</li>

<style>
  .item {
    display: grid;
    gap: 0.5rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .text {
    display: grid;
    min-width: 0;
  }

  .heading {
    color: var(--sailcloth);
    font-family: var(--font-display);
    font-size: 1.1875rem;
    font-weight: 600;
    text-decoration: none;
  }

  .episode {
    color: var(--fog);
    font-size: var(--size-secondary);
  }

  .bar {
    display: block;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--rigging);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--starboard);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .release {
    color: var(--fog);
    font-size: var(--size-caption);
    overflow-wrap: anywhere;
  }

  .messages {
    margin: 0;
    padding-left: 1.125rem;
    color: var(--lantern);
    font-size: var(--size-caption);
  }

  .confirm {
    display: grid;
    gap: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--port);
    border-radius: var(--radius-panel);
    font-size: var(--size-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .error {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }
</style>
