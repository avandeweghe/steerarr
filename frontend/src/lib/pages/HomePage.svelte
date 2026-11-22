<script lang="ts">
  import GearLink from '../components/GearLink.svelte';
  import HeaderButton from '../components/HeaderButton.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ServiceCard from '../components/ServiceCard.svelte';
  import { services } from '../services.svelte';

  /** "/": every service that's set up, at a glance. Services are added in Settings. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

  const configured = $derived(services.items?.filter((entry) => entry.configured) ?? []);
  /** Bumped to reload every card. */
  let reloads = $state(0);
</script>

<PageHeader title="Steerarr">
  {#snippet actions()}
    <HeaderButton icon={refreshIcon} label="Refresh" onclick={() => (reloads += 1)} />
    <GearLink href="#/settings" label="Settings" />
  {/snippet}
</PageHeader>

{#if configured.length === 0}
  <div class="panel empty">
    <p>No services are set up yet. Add Sonarr and the others in Settings.</p>
    <a class="button primary" href="#/settings">Open settings</a>
  </div>
{:else}
  <ul class="cards">
    {#each configured as entry (entry.def.id)}
      {#key reloads}
        <ServiceCard service={entry.def} />
      {/key}
    {/each}
  </ul>
{/if}

<style>
  .cards {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .empty {
    display: grid;
    gap: 1rem;
    justify-items: start;
  }

  .empty a {
    text-decoration: none;
  }
</style>
