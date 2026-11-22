<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Pull down at the top of the page to refresh. A Home Screen web app doesn't get Safari's
   * own pull-to-refresh, so this rebuilds it from touch events. Pages should also offer a
   * refresh button, since pulling isn't possible with a mouse or some assistive tech.
   */
  let { onrefresh, children }: { onrefresh: () => Promise<void>; children: Snippet } = $props();

  const THRESHOLD = 64;
  const MAX_PULL = 96;

  /** Where the current pull started; null when no finger is pulling. */
  let startY = $state<number | null>(null);
  let pull = $state(0);
  let refreshing = $state(false);

  function touchstart(event: TouchEvent): void {
    const touch = event.touches[0];
    startY = !refreshing && window.scrollY <= 0 && touch ? touch.clientY : null;
  }

  function touchmove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (startY === null || !touch) return;
    const distance = touch.clientY - startY;
    // Moving up, or the page scrolled after all: not a pull.
    if (distance <= 0 || window.scrollY > 0) {
      pull = 0;
      return;
    }
    pull = Math.min(distance * 0.5, MAX_PULL);
  }

  async function touchend(): Promise<void> {
    if (startY === null) return;
    startY = null;
    if (pull < THRESHOLD) {
      pull = 0;
      return;
    }
    refreshing = true;
    pull = THRESHOLD;
    try {
      await onrefresh();
    } finally {
      refreshing = false;
      pull = 0;
    }
  }

  const label = $derived(
    refreshing ? 'Refreshing…' : pull >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh',
  );
</script>

<svelte:window
  ontouchstart={touchstart}
  ontouchmove={touchmove}
  ontouchend={touchend}
  ontouchcancel={touchend}
/>

<div class="indicator" class:settling={startY === null} style:height="{pull}px" aria-hidden="true">
  {#if pull > 0}<span>{label}</span>{/if}
</div>
{@render children()}

<style>
  .indicator {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow: hidden;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .indicator span {
    padding-bottom: 0.75rem;
  }

  .settling {
    transition: height 0.2s ease-out;
  }
</style>
