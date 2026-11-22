<script lang="ts">
  import type { SonarrCommand } from '@steerarr/shared';
  import { runSearch, searches } from '../searches.svelte';

  /** Starts an automatic search in Sonarr. SearchStatus with the same key shows the outcome. */
  interface Props {
    key: string;
    label: string;
    start: () => Promise<SonarrCommand>;
  }

  let { key, label, start }: Props = $props();

  const running = $derived(searches.states[key]?.kind === 'running');
</script>

<button class="button" type="button" disabled={running} onclick={() => runSearch(key, start)}>
  {running ? 'Searching…' : label}
</button>
