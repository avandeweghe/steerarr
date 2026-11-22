<script lang="ts">
  import type { SonarrEpisode } from '@steerarr/shared';
  import { errorMessage } from '../../../lib/api';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, formatDay } from '../../../lib/format';
  import { searchEpisode } from '../api';
  import MonitorToggle from './MonitorToggle.svelte';
  import SearchButton from './SearchButton.svelte';
  import SearchStatus from './SearchStatus.svelte';

  /** One episode in an open season: tap for its overview, file, searches and file deletion. */
  interface Props {
    seriesId: number;
    episode: SonarrEpisode;
    open: boolean;
    ontoggle: () => void;
    onmonitor: (monitored: boolean) => Promise<void>;
    /** Deletes the episode's file; throws if that fails. */
    ondeletefile: () => Promise<void>;
  }

  let { seriesId, episode, open, ontoggle, onmonitor, ondeletefile }: Props = $props();

  const DELETE_WARNING =
    'Delete this file from disk? Sonarr moves it to its recycling bin if one is set up. The episode stays monitored, so Sonarr may download it again.';

  let confirmingDelete = $state(false);
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);

  async function deleteFile(): Promise<void> {
    deleting = true;
    deleteError = null;
    try {
      await ondeletefile();
      confirmingDelete = false;
    } catch (err) {
      deleteError = `Couldn't delete the file. ${errorMessage(err)}`;
    } finally {
      deleting = false;
    }
  }

  function startDelete(): void {
    confirmingDelete = true;
  }

  function cancelDelete(): void {
    confirmingDelete = false;
    deleteError = null;
  }

  const aired = $derived.by(() => {
    if (!episode.airDateUtc) return false;
    return Date.parse(episode.airDateUtc) <= Date.now();
  });

  /** Green when downloaded, red when it has aired, is monitored and is still missing. */
  const lamp = $derived.by((): { tone: LampTone; label: string } | null => {
    if (episode.hasFile) return { tone: 'ok', label: 'Downloaded' };
    if (aired && episode.monitored) return { tone: 'error', label: 'Missing' };
    return null;
  });

  const airText = $derived.by(() => {
    if (!episode.airDateUtc) return 'Air date not known yet';
    const day = formatDay(episode.airDateUtc);
    return aired ? `Aired ${day}` : `Airs ${day}`;
  });

  const fileText = $derived.by(() => {
    if (!episode.hasFile) return null;
    const size = episode.size === null ? '' : `, ${formatBytes(episode.size)}`;
    return `Downloaded as ${episode.quality ?? 'unknown quality'}${size}`;
  });

  const searchKey = $derived(`episode:${episode.id}`);
  const releasesHref = $derived(`#/sonarr/series/${seriesId}/releases/episode/${episode.id}`);
</script>

<li class="episode">
  <div class="head" class:unmonitored={!episode.monitored}>
    <button class="expand" type="button" aria-expanded={open} onclick={ontoggle}>
      <span class="number">{episode.episodeNumber}</span>
      <span class="text">
        <span class="title">{episode.title ?? 'TBA'}</span>
        <span class="meta">{airText}</span>
      </span>
      {#if lamp}<StatusLamp tone={lamp.tone} label={lamp.label} />{/if}
    </button>
    <MonitorToggle
      monitored={episode.monitored}
      label="episode {episode.episodeNumber}"
      onchange={onmonitor}
    />
  </div>

  {#if open}
    <div class="body">
      {#if episode.overview}
        <p class="overview">{episode.overview}</p>
      {/if}
      {#if fileText}
        <p class="meta">{fileText}</p>
      {/if}
      <div class="actions">
        <SearchButton key={searchKey} label="Search" start={() => searchEpisode(episode.id)} />
        <a class="button" href={releasesHref}>Pick a release</a>
        {#if episode.hasFile && !confirmingDelete}
          <button class="button danger" type="button" onclick={startDelete}>Delete file</button>
        {/if}
      </div>
      <SearchStatus key={searchKey} />
      {#if episode.hasFile && confirmingDelete}
        <div class="confirm">
          <p>{DELETE_WARNING}</p>
          <div class="actions">
            <button class="button danger" type="button" disabled={deleting} onclick={deleteFile}>
              {deleting ? 'Deleting…' : 'Delete file'}
            </button>
            <button class="button" type="button" onclick={cancelDelete}>Cancel</button>
          </div>
        </div>
      {/if}
      {#if deleteError}
        <p class="error" role="alert">
          <StatusLamp tone="error" label="Failed" />
          <span>{deleteError}</span>
        </p>
      {/if}
    </div>
  {/if}
</li>

<style>
  .episode {
    border-top: 1px solid var(--rigging);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .unmonitored .expand {
    opacity: 0.6;
  }

  .expand {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    min-height: var(--tap);
    padding: 0.5rem 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  .number {
    flex: none;
    min-width: 1.5rem;
    color: var(--fog);
    font-family: var(--font-display);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .text {
    display: grid;
    min-width: 0;
    flex: 1;
  }

  .title {
    overflow: hidden;
    font-size: var(--size-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .body {
    display: grid;
    gap: 0.75rem;
    padding: 0 0 1rem 2.25rem;
  }

  .overview {
    font-size: var(--size-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .actions a {
    text-decoration: none;
  }

  .confirm {
    display: grid;
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--port);
    border-radius: var(--radius-panel);
    font-size: var(--size-secondary);
  }

  .error {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }
</style>
