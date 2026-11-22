<script lang="ts">
  import type { ProwlarrIndexer } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatWhen } from '../../../lib/format';
  import { getIndexers } from '../api';
  import ProwlarrNav from '../components/ProwlarrNav.svelte';

  /** Prowlarr's indexers: which are on, and which it has paused after failures. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const PRIVACY: Record<string, string> = {
    public: 'Public',
    semiPrivate: 'Semi-private',
    private: 'Private',
  };

  let indexers = $state<ProwlarrIndexer[] | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      indexers = await getIndexers();
      error = null;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  function lamp(indexer: ProwlarrIndexer): { tone: LampTone; label: string } {
    if (!indexer.enabled) return { tone: 'pending', label: 'Off' };
    if (indexer.disabledUntil) return { tone: 'error', label: 'Paused' };
    return { tone: 'ok', label: 'On' };
  }

  function facts(indexer: ProwlarrIndexer): string[] {
    const parts = [indexer.protocol === 'torrent' ? 'Torrent' : 'Usenet'];
    if (indexer.privacy) parts.push(PRIVACY[indexer.privacy] ?? indexer.privacy);
    if (!indexer.enabled) parts.push('Turned off');
    else if (indexer.disabledUntil) parts.push(`Paused until ${formatWhen(indexer.disabledUntil)}`);
    else if (indexer.lastFailure) parts.push(`Last failed ${formatWhen(indexer.lastFailure)}`);
    return parts;
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
      <span>Couldn't load the indexers. {error}</span>
    </p>
  {/if}

  {#if indexers === null}
    {#if !error}<p class="muted">Loading…</p>{/if}
  {:else if indexers.length === 0}
    <p class="muted">Prowlarr has no indexers yet. Add them in Prowlarr.</p>
  {:else}
    <ul>
      {#each indexers as indexer (indexer.id)}
        {@const light = lamp(indexer)}
        <li class:off={!indexer.enabled}>
          <StatusLamp tone={light.tone} label={light.label} />
          <div class="text">
            <p class="name">{indexer.name}</p>
            <p class="meta">
              {#each facts(indexer) as fact}
                <span>{fact}</span>
              {/each}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</PullToRefresh>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .off {
    opacity: 0.6;
  }

  .text {
    display: grid;
    min-width: 0;
  }

  .name {
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    margin: 0.5rem 0;
    font-size: var(--size-secondary);
  }
</style>
