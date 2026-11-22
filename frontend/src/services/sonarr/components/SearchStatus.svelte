<script lang="ts">
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { searches } from '../searches.svelte';

  /** The outcome of the latest search started with SearchButton for the same key. */
  let { key }: { key: string } = $props();

  const search = $derived(searches.states[key]);
  const lampLabels = { ok: 'Done', warn: 'Warning', error: 'Failed' } as const;
</script>

{#if search?.kind === 'running'}
  <p class="status" aria-live="polite">
    <StatusLamp tone="pending" label="Searching" />
    <span>Sonarr is searching the indexers.</span>
  </p>
{:else if search?.kind === 'done'}
  <p class="status" aria-live="polite">
    <StatusLamp tone={search.tone} label={lampLabels[search.tone]} />
    <span>{search.message}</span>
  </p>
{/if}

<style>
  .status {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    color: var(--fog);
    font-size: var(--size-secondary);
  }
</style>
