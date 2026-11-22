<script lang="ts">
  import type { ProwlarrHealthCheck, ProwlarrStatusPage } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatDuration, formatWhen } from '../../../lib/format';
  import { getStatusPage } from '../api';
  import ProwlarrNav from '../components/ProwlarrNav.svelte';

  /** Prowlarr's System > Status: its health checks, and uptime. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

  const TONES: Record<ProwlarrHealthCheck['level'], LampTone> = {
    error: 'error',
    warning: 'warn',
    notice: 'pending',
  };
  const LEVELS: Record<ProwlarrHealthCheck['level'], string> = {
    error: 'Error',
    warning: 'Warning',
    notice: 'Notice',
  };

  let status = $state<ProwlarrStatusPage | null>(null);
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
</script>

<PageHeader title="Prowlarr">
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={load}
      disabled={loading}
      spinning={loading}
    />
    <SettingsLink serviceId="prowlarr" serviceName="Prowlarr" />
  {/snippet}
</PageHeader>

<ProwlarrNav />

<PullToRefresh onrefresh={load}>
  {#if error}
    <p class="problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>Couldn't load Prowlarr's status. {error}</span>
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
