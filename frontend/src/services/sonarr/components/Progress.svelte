<script lang="ts">
  /**
   * Have / want, Sonarr's way: episodes with files out of monitored episodes that have aired.
   * Green when complete, red when episodes are missing, grey when not monitored. Made of
   * spans, so it can sit inside a button.
   */
  interface Props {
    have: number;
    want: number;
    monitored: boolean;
  }

  let { have, want, monitored }: Props = $props();

  const tone = $derived(!monitored ? 'idle' : have >= want ? 'complete' : 'missing');
</script>

{#if want === 0}
  <span class="none">No monitored episodes yet</span>
{:else}
  <span class="progress {tone}">
    <span class="bar" aria-hidden="true">
      <span style:width="{Math.min(have / want, 1) * 100}%"></span>
    </span>
    <span class="count">
      <span class="number">{have}</span> of <span class="number">{want}</span>
      {want === 1 ? 'episode' : 'episodes'}
    </span>
  </span>
{/if}

<style>
  .none {
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: var(--size-caption);
  }

  .bar {
    flex: 1;
    max-width: 8rem;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--rigging);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--tone);
  }

  .complete {
    --tone: var(--starboard);
  }

  .missing {
    --tone: var(--port);
  }

  .idle {
    --tone: var(--fog);
  }

  .count {
    color: var(--sailcloth);
  }

  .number {
    font-family: var(--font-display);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>
