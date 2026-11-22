<script lang="ts">
  import type { NzbgetHistoryItem, NzbgetOutcome } from '@steerarr/shared';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes, formatWhen } from '../../../lib/format';

  /** One finished download in NZBGet's history. */
  let { item }: { item: NzbgetHistoryItem } = $props();

  const OUTCOMES: Record<NzbgetOutcome, { label: string; tone: LampTone }> = {
    success: { label: 'Done', tone: 'ok' },
    warning: { label: 'Done with warnings', tone: 'warn' },
    failure: { label: 'Failed', tone: 'error' },
    deleted: { label: 'Removed', tone: 'pending' },
  };

  const outcome = $derived(OUTCOMES[item.outcome]);
</script>

<li class="item">
  <p class="event">
    <StatusLamp tone={outcome.tone} label={outcome.label} />
    <span>{outcome.label}</span>
    <span class="when">{formatWhen(item.time)}</span>
  </p>
  <p class="name">{item.name}</p>
  <p class="meta">
    <span>{formatBytes(item.size)}</span>
    {#if item.category}<span>{item.category}</span>{/if}
    {#if item.detail}<span>{item.detail}</span>{/if}
  </p>
</li>

<style>
  .item {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .event {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
    font-weight: 600;
  }

  .when {
    margin-left: auto;
    color: var(--fog);
    font-weight: 400;
    font-size: var(--size-caption);
  }

  .name {
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
</style>
