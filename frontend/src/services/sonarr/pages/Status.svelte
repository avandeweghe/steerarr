<script lang="ts">
  import type { SonarrHealthCheck, SonarrStatusPage } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, formatDuration, formatWhen } from '../../../lib/format';
  import { getStatusPage } from '../api';
  import SonarrNav from '../components/SonarrNav.svelte';

  /** Sonarr's System > Status: its health checks, disk space per root folder, and uptime. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  /** Less free than this, and a disk's bar turns amber. */
  const LOW_SPACE = 0.1;

  const TONES: Record<SonarrHealthCheck['level'], LampTone> = {
    error: 'error',
    warning: 'warn',
    notice: 'pending',
  };
  const LEVELS: Record<SonarrHealthCheck['level'], string> = {
    error: 'Error',
    warning: 'Warning',
    notice: 'Notice',
  };

  let status = $state<SonarrStatusPage | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let now = $state(Date.now());

  const uptime = $derived.by(() => {
    if (!status) return null;
    const seconds = (now - new Date(status.startTime).getTime()) / 1000;
    return seconds > 0 ? formatDuration(seconds) : null;
  });

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      status = await getStatusPage();
      now = Date.now();
      error = null;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  function usedShare(free: number, total: number): number {
    return Math.min(Math.max(1 - free / total, 0), 1);
  }
</script>

<PageHeader title="Sonarr">
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={load}
      disabled={loading}
      spinning={loading}
    />
    <SettingsLink serviceId="sonarr" serviceName="Sonarr" />
  {/snippet}
</PageHeader>

<SonarrNav />

<PullToRefresh onrefresh={load}>
  {#if error}
    <p class="problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>Couldn't load Sonarr's status. {error}</span>
    </p>
  {/if}

  {#if status === null}
    {#if !error}<p class="muted">Loading…</p>{/if}
  {:else}
    <section>
      <h2>Health</h2>
      {#if status.health.length === 0}
        <p class="check">
          <StatusLamp tone="ok" label="Healthy" />
          <span>No problems found.</span>
        </p>
      {:else}
        <ul>
          {#each status.health as check, index (index)}
            <li class="check">
              <StatusLamp tone={TONES[check.level]} label={LEVELS[check.level]} />
              <div class="text">
                <p>{check.message}</p>
                {#if check.wikiUrl}
                  <a href={check.wikiUrl} target="_blank" rel="noopener noreferrer">
                    More about this
                  </a>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h2>Disk space</h2>
      {#if status.rootFolders.length === 0}
        <p class="muted">Sonarr has no root folders.</p>
      {:else}
        <ul>
          {#each status.rootFolders as folder (folder.path)}
            <li class="disk">
              <p class="path">{folder.path}</p>
              {#if !folder.accessible}
                <p class="check">
                  <StatusLamp tone="error" label="Not reachable" />
                  <span>Sonarr can't reach this folder.</span>
                </p>
              {:else if folder.freeSpace !== null && folder.totalSpace}
                {@const used = usedShare(folder.freeSpace, folder.totalSpace)}
                <span
                  class="bar"
                  class:low={1 - used < LOW_SPACE}
                  role="meter"
                  aria-valuenow={Math.round(used * 100)}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label="Used"
                >
                  <span style:width="{used * 100}%"></span>
                </span>
                <p class="meta">
                  {formatBytes(folder.freeSpace)} free of {formatBytes(folder.totalSpace)}
                </p>
              {:else if folder.freeSpace !== null}
                <p class="meta">{formatBytes(folder.freeSpace)} free</p>
              {:else}
                <p class="meta">Sonarr doesn't know how much space is free.</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h2>About</h2>
      <dl>
        <dt>Version</dt>
        <dd>{status.version} ({status.branch})</dd>
        <dt>Running for</dt>
        <dd>{uptime ?? 'Unknown'}</dd>
        <dt>Started</dt>
        <dd>{formatWhen(status.startTime)}</dd>
      </dl>
    </section>
  {/if}
</PullToRefresh>

<style>
  section + section {
    margin-top: 1.5rem;
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

  .check {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    padding: 0.5rem 0;
    font-size: var(--size-secondary);
  }

  li.check {
    border-bottom: 1px solid var(--rigging);
  }

  .text {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .text a {
    color: var(--brass);
    font-size: var(--size-caption);
  }

  .disk {
    display: grid;
    gap: 0.375rem;
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .path {
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .bar {
    display: block;
    height: 0.375rem;
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

  .bar.low span {
    background: var(--lantern);
  }

  .meta {
    color: var(--fog);
    font-size: var(--size-caption);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.375rem 1rem;
    margin: 0.5rem 0 0;
    font-size: var(--size-secondary);
  }

  dt {
    color: var(--fog);
  }

  dd {
    margin: 0;
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    margin: 0.5rem 0;
    font-size: var(--size-secondary);
  }
</style>
