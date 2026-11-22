<script lang="ts">
  import { router } from '../../../lib/router.svelte';

  /**
   * Switches between Prowlarr's sections. The tabs share
   * the width when they fit and scroll sideways when they don't, with the current one in view.
   */
  const SECTIONS = [
    { path: '/prowlarr', label: 'Search' },
    { path: '/prowlarr/indexers', label: 'Indexers' },
    { path: '/prowlarr/status', label: 'Status' },
  ];

  const current = $derived(router.path.split('?')[0]);

  let strip = $state<HTMLElement>();
  /** Fades show on the sides with more tabs past them. */
  let moreBefore = $state(false);
  let moreAfter = $state(false);

  function updateFades(): void {
    if (!strip) return;
    moreBefore = strip.scrollLeft > 1;
    moreAfter = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
  }

  /** Centres the current section's tab, as far as the strip can scroll. */
  function showCurrent(): void {
    const tab = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (strip && tab) {
      const stripBox = strip.getBoundingClientRect();
      const tabBox = tab.getBoundingClientRect();
      const offset = tabBox.left - stripBox.left + strip.scrollLeft;
      strip.scrollLeft = Math.max(0, offset - (strip.clientWidth - tabBox.width) / 2);
    }
    updateFades();
  }

  // Each section is its own page, so this runs when one opens. Tab widths change once the
  // display font has loaded, so it runs again then.
  $effect(() => {
    void current;
    showCurrent();
    void document.fonts?.ready.then(showCurrent);
  });
</script>

<svelte:window onresize={updateFades} />

<nav aria-label="Prowlarr sections" class:more-before={moreBefore} class:more-after={moreAfter}>
  <div class="strip" bind:this={strip} onscroll={updateFades}>
    {#each SECTIONS as section (section.path)}
      <a href="#{section.path}" aria-current={current === section.path ? 'page' : undefined}>
        {section.label}
      </a>
    {/each}
  </div>
</nav>

<style>
  nav {
    --fade: 1.5rem;
    margin-bottom: 1rem;
    padding: 0.1875rem;
    border-radius: var(--radius-control);
    background: var(--hull);
  }

  .strip {
    display: flex;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .strip::-webkit-scrollbar {
    display: none;
  }

  .more-after .strip {
    mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
  }

  .more-before .strip {
    mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent);
  }

  .more-before.more-after .strip {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 var(--fade),
      #000 calc(100% - var(--fade)),
      transparent
    );
  }

  a {
    display: flex;
    flex: 1 0 auto;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    padding: 0 0.5rem;
    border-radius: calc(var(--radius-control) - 3px);
    color: var(--fog);
    font-size: var(--size-secondary);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    scroll-snap-align: center;
    touch-action: manipulation;
  }

  a[aria-current='page'] {
    background: var(--rigging);
    color: var(--sailcloth);
  }
</style>
