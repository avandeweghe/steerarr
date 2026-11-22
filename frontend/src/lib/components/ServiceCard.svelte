<script lang="ts" module>
  import type { ServiceSummary } from '@steerarr/shared';

  // The last summary of each service, shown at once when Home opens again while it refreshes.
  const lastSummaries = new Map<string, ServiceSummary>();
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorMessage } from '../api';
  import type { FrontendService } from '../service';
  import StatusLamp, { type LampTone } from './StatusLamp.svelte';

  /** A service on the Home screen: its state at a glance. Tap to open it. */
  let { service }: { service: FrontendService } = $props();

  let summary = $state<ServiceSummary | null>(null);
  let error = $state<string | null>(null);

  const lamp = $derived.by((): { tone: LampTone; label: string } => {
    if (error) return { tone: 'error', label: 'Not connected' };
    if (!summary) return { tone: 'pending', label: 'Checking' };
    if (summary.issues.some((issue) => issue.level === 'error')) {
      return { tone: 'error', label: 'Has errors' };
    }
    if (summary.issues.length > 0) return { tone: 'warn', label: 'Has warnings' };
    return { tone: 'ok', label: 'Connected' };
  });

  onMount(async () => {
    summary = lastSummaries.get(service.id) ?? null;
    try {
      const fresh = await api<ServiceSummary>(`${service.id}/summary`);
      lastSummaries.set(service.id, fresh);
      summary = fresh;
      error = null;
    } catch (err) {
      error = errorMessage(err);
    }
  });
</script>

{#snippet issueList(issues: ServiceSummary['issues'])}
  <ul class="issues">
    {#each issues.slice(0, 3) as issue}
      <li class={issue.level}>{issue.message}</li>
    {/each}
  </ul>
{/snippet}

<!-- Two links when the service has a status page: the card opens the service, its warnings
     open the status page. Links can't be nested, so the warnings sit below the main link. -->
<li class="card">
  <a class="main" href="#/{service.id}">
    <div class="head">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={service.icon} /></svg>
      <h2>{service.name}</h2>
      <StatusLamp tone={lamp.tone} label={lamp.label} />
    </div>
    {#if error}
      <p class="problem">Can't reach {service.name}. {error}</p>
    {:else if summary}
      <p class="facts">
        {#each summary.facts as fact}
          <span>{fact}</span>
        {/each}
      </p>
      {#if summary.issues.length > 0 && !service.statusPath}
        {@render issueList(summary.issues)}
      {/if}
    {:else}
      <p class="facts">Checking {service.name}…</p>
    {/if}
  </a>
  {#if !error && summary && summary.issues.length > 0 && service.statusPath}
    <a class="status" href="#{service.statusPath}">
      {@render issueList(summary.issues)}
      <span class="more">See {service.name}'s status</span>
    </a>
  {/if}
</li>

<style>
  .card {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--rigging);
    border-radius: var(--radius-panel);
    background: var(--hull);
  }

  .main,
  .status {
    display: grid;
    gap: 0.5rem;
    padding: var(--gutter);
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
  }

  .status {
    gap: 0.375rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--rigging);
  }

  .main:active,
  .status:active {
    background: var(--rigging);
  }

  .more {
    color: var(--brass);
    font-size: var(--size-caption);
    font-weight: 600;
  }

  .card:has(a:active) {
    border-color: var(--rigging-strong);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  svg {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    fill: none;
    stroke: var(--brass);
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h2 {
    flex: 1;
    font-size: var(--size-heading);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
    color: var(--fog);
    font-size: var(--size-secondary);
  }

  .problem {
    color: var(--port);
    font-size: var(--size-secondary);
  }

  .issues {
    margin: 0;
    padding-left: 1.125rem;
    font-size: var(--size-caption);
  }

  .warning {
    color: var(--lantern);
  }

  .error {
    color: var(--port);
  }
</style>
