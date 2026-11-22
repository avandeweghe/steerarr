<script lang="ts">
  import type { ProwlarrDownloadClient, ProwlarrResult } from '@steerarr/shared';
  import { errorMessage } from '../../../lib/api';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatAge, formatBytes, plural } from '../../../lib/format';
  import { grab } from '../api';

  /**
   * One search result, with a button that sends it to a download client. When more than one
   * enabled client handles its protocol, the first tap asks which.
   */
  interface Props {
    result: ProwlarrResult;
    /** Enabled download clients; null while they're loading or if they couldn't be. */
    clients: ProwlarrDownloadClient[] | null;
  }

  let { result, clients }: Props = $props();

  type Grab =
    | { kind: 'idle' }
    | { kind: 'choosing' }
    | { kind: 'sending' }
    | { kind: 'sent'; to: string | null }
    | { kind: 'failed'; message: string };

  let grabState = $state<Grab>({ kind: 'idle' });
  let chosen = $state(0);

  const usable = $derived(
    (clients ?? []).filter(
      (client) => result.protocol === 'unknown' || client.protocol === result.protocol,
    ),
  );

  const facts = $derived.by(() => {
    const parts = [formatBytes(result.size)];
    if (result.ageHours !== null) parts.push(`${formatAge(result.ageHours)} old`);
    parts.push(result.indexer);
    if (result.protocol === 'torrent') {
      parts.push(plural(result.seeders ?? 0, 'seeder'));
      if (result.leechers !== null) parts.push(plural(result.leechers, 'leecher'));
    } else if (result.grabs !== null) {
      parts.push(plural(result.grabs, 'grab'));
    }
    return parts;
  });

  /** With one usable client (or none known), send straight away; else ask which. */
  function start(): void {
    const [first] = usable;
    if (usable.length > 1 && first) {
      chosen = first.id;
      grabState = { kind: 'choosing' };
      return;
    }
    void send(first?.id);
  }

  async function send(clientId: number | undefined): Promise<void> {
    grabState = { kind: 'sending' };
    try {
      await grab({ guid: result.guid, indexerId: result.indexerId, downloadClientId: clientId });
      const to = usable.find((client) => client.id === clientId)?.name ?? null;
      grabState = { kind: 'sent', to };
    } catch (err) {
      grabState = { kind: 'failed', message: errorMessage(err) };
    }
  }
</script>

<li class="result">
  <p class="title">{result.title}</p>
  <p class="meta">
    {#each facts as fact}
      <span>{fact}</span>
    {/each}
  </p>
  {#if result.categories.length > 0}
    <p class="meta">{result.categories.join(', ')}</p>
  {/if}

  {#if grabState.kind === 'choosing'}
    <div class="choose">
      <label class="field">
        <span>Send to</span>
        <select bind:value={chosen}>
          {#each usable as client (client.id)}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
      </label>
      <div class="actions">
        <button class="button primary" type="button" onclick={() => send(chosen)}>Send</button>
        <button class="button" type="button" onclick={() => (grabState = { kind: 'idle' })}>
          Cancel
        </button>
      </div>
    </div>
  {:else if grabState.kind === 'sent'}
    <p class="outcome">
      <StatusLamp tone="ok" label="Sent" />
      <span>Sent to {grabState.to ?? 'the download client'}.</span>
    </p>
  {:else}
    <div class="actions">
      <button class="button" type="button" disabled={grabState.kind === 'sending'} onclick={start}>
        {grabState.kind === 'sending' ? 'Sending…' : 'Download'}
      </button>
      {#if result.infoUrl}
        <a class="button" href={result.infoUrl} target="_blank" rel="noopener noreferrer">
          Details
        </a>
      {/if}
    </div>
    {#if grabState.kind === 'failed'}
      <p class="outcome" role="alert">
        <StatusLamp tone="error" label="Failed" />
        <span>Couldn't send it. {grabState.message}</span>
      </p>
    {/if}
  {/if}
</li>

<style>
  .result {
    display: grid;
    gap: 0.375rem;
    padding: 0.75rem 0;
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

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .choose {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .outcome {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }
</style>
