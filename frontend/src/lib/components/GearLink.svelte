<script lang="ts">
  /** Gear button to a settings page, for PageHeader's actions. */
  let { href, label }: { href: string; label: string } = $props();
</script>

<a class="gear" {href} aria-label={label} title={label}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="6.5" />
    <path
      d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"
    />
  </svg>
</a>

<style>
  .gear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tap);
    height: var(--tap);
    margin-right: -0.625rem;
    border-radius: var(--radius-control);
    color: var(--fog);
    touch-action: manipulation;
  }

  .gear:active {
    background: var(--rigging);
  }

  svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }
</style>
