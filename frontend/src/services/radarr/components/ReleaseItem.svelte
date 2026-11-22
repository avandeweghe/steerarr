<script lang="ts">
  import type { RadarrRelease } from '@steerarr/shared';
  import { errorMessage } from '../../../lib/api';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatAge, formatBytes, plural } from '../../../lib/format';
  import { grabRelease } from '../api';

  /** One release from an indexer search, with a button to grab it. */
  let { release }: { release: RadarrRelease } = $props();

  type Grab =
    | { kind: 'idle' }
    | { kind: 'confirming' }
    | { kind: 'sending' }
    | { kind: 'sent' }
    | { kind: 'failed'; message: string };

  let grab = $state<Grab>({ kind: 'idle' });

  const score = $derived.by(() => {
    const value = release.customFormatScore;
    return value > 0 ? `+${value}` : String(value);
  });

  /** Only worth showing when it isn't plain English. */
  const languages = $derived.by(() => {
    const list = release.languages;
    return list.length === 0 || (list.length === 1 && list[0] === 'English') ? null : list;
  });

  /** Radarr would grab an approved release itself; a rejected one needs a second tap. */
  function onGrab(): void {
    if (release.approved) void send();
    else grab = { kind: 'confirming' };
  }

  function cancel(): void {
    grab = { kind: 'idle' };
  }

  async function send(): Promise<void> {
    grab = { kind: 'sending' };
    try {
      await grabRelease(release);
      grab = { kind: 'sent' };
    } catch (err) {
      grab = { kind: 'failed', message: errorMessage(err) };
    }
  }
</script>

<li class="release">
  <p class="title">{release.title}</p>
  <p class="meta">
    <span class="quality">{release.quality}</span>
    <span>{formatBytes(release.size)}</span>
    <span>{formatAge(release.ageHours)} old</span>
    <span>{release.indexer}</span>
    {#if release.protocol === 'torrent'}
      <span>{plural(release.seeders ?? 0, 'seeder')}</span>
    {/if}
    {#if release.customFormatScore !== 0}
      <span>Score {score}</span>
    {/if}
  </p>
  {#if languages}
    <p class="meta">{languages.join(', ')}</p>
  {/if}
  {#if release.rejections.length > 0}
    <ul class="rejections">
      {#each release.rejections as reason}
        <li>{reason}</li>
      {/each}
    </ul>
  {/if}

  <div class="grab">
    {#if !release.downloadAllowed}
      <p class="muted">Radarr can't grab this release: it can't tell which movie it is.</p>
    {:else if grab.kind === 'confirming'}
      <p>Radarr rejected this release. Grab it anyway?</p>
      <div class="buttons">
        <button class="button primary" type="button" onclick={send}>Grab anyway</button>
        <button class="button" type="button" onclick={cancel}>Cancel</button>
      </div>
    {:else if grab.kind === 'sent'}
      <p class="status">
        <StatusLamp tone="ok" label="Sent" />
        <span>Sent to the download client.</span>
      </p>
    {:else}
      {#if grab.kind === 'failed'}
        <p class="status">
          <StatusLamp tone="error" label="Failed" />
          <span>Couldn't grab it. {grab.message}</span>
        </p>
      {/if}
      <button class="button" type="button" disabled={grab.kind === 'sending'} onclick={onGrab}>
        {grab.kind === 'sending' ? 'Sending…' : 'Grab'}
      </button>
    {/if}
  </div>
</li>

<style>
  .release {
    display: grid;
    gap: 0.375rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .title {
    font-size: var(--size-secondary);
    overflow-wrap: anywhere;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .quality {
    color: var(--sailcloth);
  }

  .rejections {
    margin: 0;
    padding-left: 1.125rem;
    color: var(--lantern);
    font-size: var(--size-caption);
  }

  .grab {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    margin-top: 0.25rem;
    font-size: var(--size-secondary);
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
  }

  .status {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
  }
</style>
