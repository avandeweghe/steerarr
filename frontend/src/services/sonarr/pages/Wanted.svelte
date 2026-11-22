<script lang="ts" module>
  import type { WantedList as List } from '../api';

  // Kept between visits, so coming back shows the same list.
  let lastList: List = 'missing';
</script>

<script lang="ts">
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import SonarrNav from '../components/SonarrNav.svelte';
  import WantedList from '../components/WantedList.svelte';

  /** Sonarr's Wanted: monitored episodes that are missing, or below their quality cutoff. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const LISTS: Array<{ value: List; label: string }> = [
    { value: 'missing', label: 'Missing' },
    { value: 'cutoff', label: 'Cutoff not met' },
  ];

  let list = $state<List>(lastList);
  /** Bumped to reload the list from its first page. */
  let reloads = $state(0);

  function choose(value: List): void {
    list = value;
    lastList = value;
  }

  async function refresh(): Promise<void> {
    reloads += 1;
  }
</script>

<PageHeader title="Sonarr">
  {#snippet actions()}
    <HeaderButton icon={refreshIcon} label="Refresh" onclick={refresh} />
    <SettingsLink serviceId="sonarr" serviceName="Sonarr" />
  {/snippet}
</PageHeader>

<SonarrNav />

<div class="lists" role="group" aria-label="Wanted lists">
  {#each LISTS as option (option.value)}
    <button
      type="button"
      class:current={list === option.value}
      aria-pressed={list === option.value}
      onclick={() => choose(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<PullToRefresh onrefresh={refresh}>
  {#key `${list}:${reloads}`}
    <WantedList {list} />
  {/key}
</PullToRefresh>

<style>
  .lists {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .lists button {
    min-height: var(--tap);
    padding: 0 0.875rem;
    border: 1px solid var(--rigging);
    border-radius: 999px;
    background: transparent;
    color: var(--fog);
    font-size: var(--size-secondary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .lists .current {
    border-color: var(--sailcloth);
    color: var(--sailcloth);
  }
</style>
