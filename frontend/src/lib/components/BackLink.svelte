<script lang="ts">
  import { cameFrom } from '../router.svelte';

  /**
   * "‹ Sonarr" link above a page title. When this page was opened from `href`, it goes back
   * in history, so that page keeps its scroll position; otherwise it simply follows `href`.
   */
  let { href, label }: { href: string; label: string } = $props();

  function back(event: MouseEvent): void {
    if (cameFrom() !== href) return;
    event.preventDefault();
    history.back();
  }
</script>

<a class="back" href="#{href}" data-back onclick={back}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5-6.5 6.5 6.5 6.5" /></svg>
  {label}
</a>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    min-height: var(--tap);
    margin-left: -0.5rem;
    padding-right: 0.75rem;
    border-radius: var(--radius-control);
    color: var(--brass);
    font-size: var(--size-body);
    text-decoration: none;
    touch-action: manipulation;
  }

  .back:active {
    background: var(--rigging);
  }

  svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
