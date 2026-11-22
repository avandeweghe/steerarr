<script lang="ts">
  /** A 44px icon button for PageHeader's actions. `icon` is 24×24 stroke path data. */
  let {
    icon,
    label,
    onclick,
    disabled = false,
    spinning = false,
  }: {
    icon: string;
    label: string;
    onclick: () => void;
    disabled?: boolean;
    spinning?: boolean;
  } = $props();
</script>

<button type="button" aria-label={label} title={label} {onclick} {disabled} class:spinning>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tap);
    height: var(--tap);
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--fog);
    cursor: pointer;
    touch-action: manipulation;
  }

  button:active {
    background: var(--rigging);
  }

  button:disabled {
    cursor: default;
  }

  svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .spinning svg {
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
