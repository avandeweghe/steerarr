<script lang="ts">
  import type { AboutResponse, ServiceSummary } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { api, errorMessage } from '../api';
  import { services } from '../services.svelte';

  /** The About section of Settings: which Steerarr is running, and the services' versions. */
  const REPOSITORY = 'https://github.com/avandeweghe/steerarr';

  let commit = $state<string | null | undefined>(undefined);
  /** By service id: its version, or why it couldn't be read. */
  let versions = $state<Record<string, string>>({});

  const configured = $derived(services.items?.filter((entry) => entry.configured) ?? []);

  onMount(() => {
    void loadCommit();
    for (const { def } of configured) void loadVersion(def.id);
  });

  async function loadCommit(): Promise<void> {
    try {
      commit = (await api<AboutResponse>('about')).commit;
    } catch {
      commit = null;
    }
  }

  async function loadVersion(id: string): Promise<void> {
    try {
      const summary = await api<ServiceSummary>(`${id}/summary`);
      versions[id] = `version ${summary.version}`;
    } catch (err) {
      versions[id] = `can't connect: ${errorMessage(err)}`;
    }
  }
</script>

<section>
  <h2>About</h2>
  <dl>
    <dt>Steerarr</dt>
    <dd>
      {#if commit === undefined}
        …
      {:else if commit}
        Built from <a href="{REPOSITORY}/commit/{commit}">{commit.slice(0, 7)}</a>
      {:else}
        Development build
      {/if}
    </dd>
    {#each configured as { def } (def.id)}
      <dt>{def.name}</dt>
      <dd>{versions[def.id] ?? '…'}</dd>
    {/each}
  </dl>
</section>

<style>
  h2 {
    font-size: var(--size-heading);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem 1rem;
    margin: 0.75rem 0 0;
    font-size: var(--size-secondary);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--fog);
    overflow-wrap: anywhere;
  }

  a {
    color: var(--brass);
  }
</style>
